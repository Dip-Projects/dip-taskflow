const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { MODULES, ROLES, mergeMap, canSee, isMisExecutive } = require('../lib/navVisibility');

const router = express.Router();

// Every master-data endpoint just needs the user to be logged in.
router.use(requireAuth);

router.get('/departments', async (req, res) => {
  const { data, error } = await supabase.from('departments').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/departments', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const { data, error } = await supabase.from('departments').insert({ name }).select('id, name').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/projects', async (req, res) => {
  const { data, error } = await supabase.from('projects').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/task-types', async (req, res) => {
  const { data, error } = await supabase.from('task_types').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/task-types', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Task type name is required' });
  const { data, error } = await supabase.from('task_types').insert({ name }).select('id, name').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Used to populate the "Assign to" dropdown and the employee filter.
// Only active users — matches what the frontend should offer.
router.get('/employees', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, department, designation')
    .eq('is_active', true)
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

function parseSiteList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{') && t.endsWith('}')) {
      return (
        t
          .slice(1, -1)
          .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
          ?.map((s) => s.replace(/^"|"$/g, '').trim())
          .filter(Boolean) || []
      );
    }
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map((s) => String(s || '').trim()).filter(Boolean);
      } catch { /* ignore */ }
    }
    return t ? [t] : [];
  }
  return [];
}

function uniqueSites(...lists) {
  const seen = new Set();
  const out = [];
  lists.flat().forEach((s) => {
    const v = String(s || '').trim();
    const key = v.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}

function isSiteDeptUser(u) {
  const blob = [u.department, u.designation, u.role].map((s) => String(s || '').toLowerCase()).join(' ');
  return /site engineer|site incharge|site coordinator/.test(blob);
}

async function loadHeadTeam(headId, jwtUser) {
  const { data: head } = await supabase
    .from('users')
    .select('id, username, full_name, site_name, site_names')
    .eq('id', headId)
    .maybeSingle();

  const { data: all } = await supabase
    .from('users')
    .select('id, username, full_name, department, designation, role, site_name, site_names, reporting_head_id')
    .eq('is_active', true);

  const users = all || [];
  const direct = users.filter((u) => String(u.reporting_head_id || '') === String(headId));
  const idSet = new Set(direct.map((u) => u.id));
  users.forEach((u) => {
    if (u.reporting_head_id && idSet.has(u.reporting_head_id) && !idSet.has(u.id)) {
      direct.push(u);
      idSet.add(u.id);
    }
  });

  let team = direct;
  const headSites = uniqueSites(head?.site_name, parseSiteList(head?.site_names), jwtUser?.site_name, parseSiteList(jwtUser?.site_names));
  if (!team.length && headSites.length) {
    team = users.filter((u) => {
      if (!isSiteDeptUser(u)) return false;
      const theirs = uniqueSites(u.site_name, parseSiteList(u.site_names)).map((s) => s.toLowerCase());
      return headSites.some((s) => theirs.includes(s.toLowerCase()));
    });
  }

  const teamSites = uniqueSites(
    ...team.map((u) => u.site_name),
    ...team.flatMap((u) => parseSiteList(u.site_names)),
    ...headSites,
  );
  const names = [];
  team.forEach((u) => {
    if (u.full_name) names.push(String(u.full_name).trim());
    if (u.username) names.push(String(u.username).trim());
  });

  return { team, sites: teamSites, names: uniqueSites(names), head };
}

/** People who report to the logged-in head — used for Site team submissions. */
router.get('/my-team', async (req, res) => {
  try {
    const headId = req.user?.id;
    if (!headId) return res.json({ team: [], sites: [], names: [] });
    const packed = await loadHeadTeam(headId, req.user);
    res.json(packed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load team' });
  }
});

router.get('/head-reports', async (req, res) => {
  try {
    const headId = req.user?.id;
    if (!headId) return res.json([]);
    const { sites, names, head } = await loadHeadTeam(headId, req.user);
    const sitesLc = new Set(sites.map((s) => s.toLowerCase()));
    const namesLc = new Set(names.map((s) => s.toLowerCase()));
    const selfLc = new Set(
      [req.user.full_name, req.user.username, req.user.name, head?.full_name, head?.username]
        .map((s) => String(s || '').toLowerCase().trim())
        .filter(Boolean)
    );
    const isHeadOwnSvr = (r) => {
      const vals = [r.reporter_name, r.submitted_by_name, r.submitted_by, r.engineer]
        .map((s) => String(s || '').toLowerCase().trim())
        .filter(Boolean);
      return vals.some((v) => selfLc.has(v));
    };

    const match = (engineer, site) => {
      const eng = String(engineer || '').toLowerCase().trim();
      const st = String(site || '').toLowerCase().trim();
      if (st && sitesLc.has(st)) return true;
      if (eng && namesLc.has(eng)) return true;
      if (eng) {
        for (const n of namesLc) {
          if (n.length >= 4 && (eng.includes(n) || n.includes(eng))) return true;
        }
      }
      return false;
    };

    const [{ data: dprData }, { data: svrData }, { data: wprData }] = await Promise.all([
      supabase.from('dpr_reports').select('id, site, engineer, report_type, date, pdf_url, payload, created_at').order('created_at', { ascending: false }),
      supabase.from('site_reports').select('id, site_name, reporter_name, designation, visit_date, progress_of_work, quality_observations, safety_concerns, issues_concerns, site_visit_instructions, key_instructions, submitted_by, submitted_by_name, pdf_url, created_at').order('created_at', { ascending: false }),
      supabase.from('wpr_reports').select('id, site_name, engineer_name, report_date, report_number, presentation_url, status, submitted_by, created_at').order('created_at', { ascending: false }),
    ]);

    const hasFilter = sitesLc.size > 0 || namesLc.size > 0;
    const keep = (engineer, site) => (hasFilter ? match(engineer, site) : true);

    const rows = [
      ...(dprData || [])
        .filter((r) => r.report_type !== 'morning' && keep(r.engineer, r.site))
        .map((r) => ({ ...r, source: 'dpr' })),
      ...(svrData || [])
        .filter((r) => !isHeadOwnSvr(r) && keep(r.reporter_name || r.submitted_by_name, r.site_name))
        .map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.reporter_name || r.submitted_by_name,
          report_type: 'site_visit',
          date: r.visit_date,
          pdf_url: r.pdf_url,
          created_at: r.created_at,
          source: 'svr',
          progress_of_work: r.progress_of_work,
        })),
      ...(wprData || [])
        .filter((r) => keep(r.engineer_name || r.submitted_by, r.site_name))
        .map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.engineer_name || r.submitted_by,
          report_type: 'wpr',
          date: r.report_date,
          pdf_url: r.presentation_url,
          created_at: r.created_at,
          source: 'wpr',
          report_number: r.report_number,
        })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (hasFilter && !rows.length) {
      const allRows = [
        ...(dprData || [])
          .filter((r) => r.report_type !== 'morning')
          .map((r) => ({ ...r, source: 'dpr' })),
        ...(svrData || []).filter((r) => !isHeadOwnSvr(r)).map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.reporter_name || r.submitted_by_name,
          report_type: 'site_visit',
          date: r.visit_date,
          pdf_url: r.pdf_url,
          created_at: r.created_at,
          source: 'svr',
          progress_of_work: r.progress_of_work,
        })),
        ...(wprData || []).map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.engineer_name || r.submitted_by,
          report_type: 'wpr',
          date: r.report_date,
          pdf_url: r.presentation_url,
          created_at: r.created_at,
          source: 'wpr',
          report_number: r.report_number,
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.json(allRows);
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load reports' });
  }
});

// Who can verify a completed task: admins always can, plus anyone the
// admin has explicitly flagged with can_verify (e.g. a Senior Estimator).
router.get('/verifiers', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, designation')
    .eq('is_active', true)
    .or('can_verify.eq.true,role.eq.admin')
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/nav-visibility', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nav_visibility')
      .maybeSingle();
    const map = mergeMap(!error && data?.value ? data.value : null);
    res.json({ modules: MODULES, roles: ROLES, map });
  } catch (err) {
    res.json({ modules: MODULES, roles: ROLES, map: mergeMap(null) });
  }
});

router.put('/nav-visibility', async (req, res) => {
  try {
    const isMis = isMisExecutive(req.user) || (!!req.user?.is_mis_executive && req.user?.role !== 'admin');
    if (!isMis) {
      const { data: me } = await supabase
        .from('users')
        .select('is_mis_executive, department, designation, role')
        .eq('id', req.user.id)
        .maybeSingle();
      if (!isMisExecutive(me)) {
        return res.status(403).json({ error: 'Only MIS Support / MIS executive can change who sees what' });
      }
    }
    const map = mergeMap(req.body?.map);
    const { error } = await supabase.from('app_settings').upsert({
      key: 'nav_visibility',
      value: map,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    });
    if (error) {
      return res.status(503).json({
        error: 'Run backend/sql/add_nav_visibility.sql in Supabase, then save again.',
        map,
        modules: MODULES,
        roles: ROLES,
      });
    }
    res.json({ ok: true, map, modules: MODULES, roles: ROLES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.canSeeNav = canSee;
