const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function isClientUser(user) {
  const role = String(user?.role || '').toLowerCase().trim();
  const dept = String(user?.department || '').toLowerCase().trim();
  return role === 'client' || dept === 'client';
}

function requireClient(req, res, next) {
  if (!isClientUser(req.user)) {
    return res.status(403).json({ error: 'This area is for client logins only' });
  }
  next();
}

router.use(requireClient);

function parseSiteNames(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    if (raw.startsWith('{') && raw.endsWith('}')) {
      return (
        raw
          .slice(1, -1)
          .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
          ?.map((s) => s.replace(/^"|"$/g, '').trim())
          .filter(Boolean) || []
      );
    }
    return [raw.trim()].filter(Boolean);
  }
  return [];
}

function uniqueSiteNames(names) {
  const sites = [];
  const seen = new Set();
  for (const raw of names || []) {
    const s = String(raw || '').trim();
    const key = s.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sites.push(s);
  }
  return sites;
}

function normalizeSiteKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+project\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  const na = normalizeSiteKey(a);
  const nb = normalizeSiteKey(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function rowMatchesSite(value, aliases) {
  return (aliases || []).some((a) => namesMatch(value, a));
}

/** Assigned client site + project / site_details name variants. */
async function resolveSiteScope(siteName) {
  const aliases = uniqueSiteNames([
    siteName,
    String(siteName || '').replace(/\s+project\s*$/i, '').trim(),
  ]);
  const projectIds = [];

  const { data: projects } = await supabase.from('projects').select('id, name');
  (projects || []).forEach((p) => {
    if (aliases.some((a) => namesMatch(p.name, a))) {
      aliases.push(p.name);
      if (p.id) projectIds.push(p.id);
    }
  });

  const { data: details } = await supabase.from('site_details').select('site_name');
  (details || []).forEach((d) => {
    if (aliases.some((a) => namesMatch(d.site_name, a))) aliases.push(d.site_name);
  });

  try {
    const [{ data: dprSites }, { data: wprSites }] = await Promise.all([
      supabase.from('dpr_reports').select('site'),
      supabase.from('wpr_reports').select('site_name'),
    ]);
    (dprSites || []).forEach((r) => {
      if (aliases.some((a) => namesMatch(r.site, a))) aliases.push(r.site);
    });
    (wprSites || []).forEach((r) => {
      if (aliases.some((a) => namesMatch(r.site_name, a))) aliases.push(r.site_name);
    });
  } catch (_) {
    /* optional alias expansion */
  }

  return {
    aliases: uniqueSiteNames(aliases),
    projectIds: [...new Set(projectIds)],
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function extractDprPhotos(payload) {
  const p = parseJson(payload, null);
  if (!p || typeof p !== 'object') return [];
  const bags = [p.photos, p.checklistPhotos, p.checklist_photos, p.workProgressPhotos];
  const out = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const photo of bag) {
      if (!photo) continue;
      if (typeof photo === 'string') out.push({ url: photo });
      else out.push(photo);
    }
  }
  return out;
}

function isWprDrawingImage(type) {
  return String(type || '').toLowerCase() === 'graphical';
}

async function loadDrawingsForScope(projectIds, aliases) {
  try {
    const { data, error } = await supabase
      .from('drawings')
      .select('id, project_id, drawing_date, file_urls, file_paths, created_at, category, remarks')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const idSet = new Set(projectIds || []);
    let rows = (data || []).filter((d) => idSet.has(d.project_id));
    if (rows.length || !idSet.size) {
      if (rows.length) return rows;
    }
    const { data: withProj } = await supabase
      .from('drawings')
      .select('id, project_id, drawing_date, file_urls, file_paths, created_at, category, remarks, project:projects!drawings_project_id_fkey(id, name)')
      .order('created_at', { ascending: false });
    return (withProj || []).filter(
      (d) => idSet.has(d.project_id) || rowMatchesSite(d.project?.name, aliases)
    );
  } catch (err) {
    console.error('client drawings:', err.message);
    if (!(projectIds || []).length) return [];
    const { data } = await supabase
      .from('drawings')
      .select('id, project_id, drawing_date, file_urls, created_at, category, remarks')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });
    return data || [];
  }
}

function drawingFileUrl(file) {
  if (!file) return null;
  if (typeof file === 'string') return file;
  return file.url || file.publicUrl || file.public_url || null;
}

/** Only sites assigned on the client login — never every project. */
async function loadClientSites(userId, jwtUser) {
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, username, full_name, role, department, designation, site_name, site_names')
    .eq('id', userId)
    .maybeSingle();

  const u = dbUser || jwtUser || {};
  const sites = uniqueSiteNames([
    u.site_name,
    ...parseSiteNames(u.site_names),
  ]);

  let projects = [];
  if (sites.length) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_name, location, status')
      .order('name');
    const allowed = new Set(sites.map((s) => s.toLowerCase()));
    projects = (data || []).filter((p) => allowed.has(String(p.name || '').toLowerCase()));
  }

  return { user: u, sites, projects };
}

async function assertSite(req, siteName) {
  const { sites } = await loadClientSites(req.user.id, req.user);
  const ok = sites.some((s) => namesMatch(s, siteName) || String(s).toLowerCase() === String(siteName || '').toLowerCase());
  if (!ok) {
    const err = new Error('This site is not assigned to your login');
    err.status = 403;
    throw err;
  }
  return sites;
}

router.get('/portal', async (req, res) => {
  try {
    const { user, sites, projects } = await loadClientSites(req.user.id, req.user);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: 'client',
        department: user.department || 'Client',
        designation: user.designation || 'Client',
        site_name: sites[0] || '',
        site_names: sites,
      },
      sites,
      projects,
    });
  } catch (err) {
    console.error('client portal:', err.message);
    res.status(500).json({ error: err.message || 'Could not load client portal' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ pending: 0, accepted: 0, rejected: 0, dpr: 0, wpr: 0, photos: 0, recent: [] });
    await assertSite(req, siteName);
    const { aliases } = await resolveSiteScope(siteName);

    const { data: matAll } = await supabase
      .from('material_requirements')
      .select('id, status, material_name, quantity, unit_name, created_at, actioned_at, site_name')
      .order('created_at', { ascending: false });
    const matRows = (matAll || []).filter((r) => rowMatchesSite(r.site_name, aliases));

    const { data: dprAll } = await supabase.from('dpr_reports').select('id, site');
    const dprCount = (dprAll || []).filter((r) => rowMatchesSite(r.site, aliases)).length;

    const { data: wprAll } = await supabase.from('wpr_reports').select('id, site_name');
    const wprRows = (wprAll || []).filter((r) => rowMatchesSite(r.site_name, aliases));
    const wprIds = (wprRows || []).map((w) => w.id);
    let photoCount = 0;
    if (wprIds.length) {
      const { count } = await supabase
        .from('wpr_images')
        .select('id', { count: 'exact', head: true })
        .in('wpr_report_id', wprIds);
      photoCount = count || 0;
    }

    const rows = matRows || [];
    res.json({
      pending: rows.filter((r) => r.status === 'pending').length,
      accepted: rows.filter((r) => r.status === 'received').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      dpr: dprCount || 0,
      wpr: wprIds.length,
      photos: photoCount,
      recent: rows.slice(0, 6),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/materials', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json([]);
    await assertSite(req, siteName);
    const { aliases } = await resolveSiteScope(siteName);
    const { data: matAll, error: matErr } = await supabase
      .from('material_requirements')
      .select('*')
      .order('created_at', { ascending: false });
    if (matErr) throw matErr;
    let data = (matAll || []).filter((r) => rowMatchesSite(r.site_name, aliases));
    if (req.query.status) data = data.filter((r) => r.status === req.query.status);
    return res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/materials/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['received', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { data: row, error: findErr } = await supabase
      .from('material_requirements')
      .select('id, site_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!row) return res.status(404).json({ error: 'Request not found' });
    await assertSite(req, row.site_name);

    const { data, error } = await supabase
      .from('material_requirements')
      .update({
        status,
        actioned_at: new Date().toISOString(),
        actioned_by: req.user.full_name || req.user.username || 'Client',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/media-tree', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ dates: [] });
    await assertSite(req, siteName);
    const { aliases, projectIds } = await resolveSiteScope(siteName);

    const [{ data: dprAll }, { data: wprAll }] = await Promise.all([
      supabase.from('dpr_reports').select('id, date, payload, site, created_at'),
      supabase.from('wpr_reports').select('id, report_date, created_at, site_name'),
    ]);
    const dprRows = (dprAll || []).filter((r) => rowMatchesSite(r.site, aliases));
    const wprRows = (wprAll || []).filter((r) => rowMatchesSite(r.site_name, aliases));
    let monthlyRows = [];
    try {
      const { data: monthlyAll } = await supabase
        .from('monthly_reports')
        .select('id, created_at, project_name, site_name');
      monthlyRows = (monthlyAll || []).filter(
        (r) => rowMatchesSite(r.project_name, aliases) || rowMatchesSite(r.site_name, aliases)
      );
    } catch (_) {
      monthlyRows = [];
    }
    const drawingRows = await loadDrawingsForScope(projectIds, aliases);
    const wprIds = (wprRows || []).map((w) => w.id);
    let imgDates = [];
    if (wprIds.length) {
      const { data } = await supabase
        .from('wpr_images')
        .select('created_at, image_type')
        .in('wpr_report_id', wprIds);
      imgDates = (data || []).map((r) => r.created_at);
    }
    const dprPhotoDates = (dprRows || []).flatMap((r) => {
      const photos = extractDprPhotos(r.payload);
      return photos.length ? photos.map(() => r.created_at || r.date) : [];
    });
    const dates = [
      ...(dprRows || []).map((r) => r.date),
      ...(wprRows || []).map((r) => r.created_at || r.report_date),
      ...imgDates,
      ...dprPhotoDates,
      ...(drawingRows || []).map((d) => d.created_at),
      ...(monthlyRows || []).map((r) => r.created_at),
    ].filter(Boolean);
    res.json({ dates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/media', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ dprs: [], wprs: [], photos: [], drawings: [], monthlies: [] });
    await assertSite(req, siteName);
    const { aliases, projectIds } = await resolveSiteScope(siteName);

    const { data: dprLite } = await supabase
      .from('dpr_reports')
      .select('id, site, engineer, report_type, date, pdf_url, created_at')
      .order('date', { ascending: false });
    const dprMatched = (dprLite || []).filter((r) => rowMatchesSite(r.site, aliases));
    let dprData = dprMatched;
    if (dprMatched.length) {
      const { data: withPayload } = await supabase
        .from('dpr_reports')
        .select('id, payload')
        .in('id', dprMatched.map((r) => r.id));
      const payloadById = Object.fromEntries((withPayload || []).map((r) => [r.id, r.payload]));
      dprData = dprMatched.map((r) => ({ ...r, payload: payloadById[r.id] }));
    }

    const { data: wprAll } = await supabase
      .from('wpr_reports')
      .select('id, site_name, engineer_name, report_date, report_number, presentation_url, created_at')
      .order('report_date', { ascending: false });
    const wprData = (wprAll || []).filter((r) => rowMatchesSite(r.site_name, aliases));

    const wprIds = (wprData || []).map((w) => w.id);
    let wprPhotoRows = [];
    if (wprIds.length) {
      const { data: imgData } = await supabase
        .from('wpr_images')
        .select('id, wpr_report_id, image_type, public_url, storage_path, caption, created_at')
        .in('wpr_report_id', wprIds);
      const wprById = Object.fromEntries((wprData || []).map((w) => [w.id, w]));
      wprPhotoRows = (imgData || [])
        .filter((p) => p.public_url || p.storage_path)
        .map((p) => {
          const parent = wprById[p.wpr_report_id];
          return {
            ...p,
            source: 'wpr',
            public_url: p.public_url || null,
            created_at: p.created_at || parent?.created_at || parent?.report_date,
            actual_created_at: p.created_at,
            image_type: isWprDrawingImage(p.image_type) ? 'graphical' : 'photos',
          };
        });
    }

    const dprPhotoRows = (dprData || []).flatMap((report) => {
      return extractDprPhotos(report?.payload).map((photo, photoIndex) => ({
        id: `${report.id}-${photoIndex}`,
        dpr_report_id: report.id,
        public_url: photo.supabaseUrl || photo.publicUrl || photo.public_url || photo.url || null,
        storage_path: photo.storagePath || photo.storage_path || null,
        caption: photo.caption || '',
        created_at: report.created_at || report.date,
        actual_created_at: report.created_at || report.date,
        source: 'dpr',
        image_type: 'photos',
      }));
    });

    const drawingData = await loadDrawingsForScope(projectIds, aliases);

    let monthlies = [];
    try {
      const { data: monthlyAll, error: monthlyErr } = await supabase
        .from('monthly_reports')
        .select('id, month, year, project_name, site_name, folder_url, folder_path, file_count, created_at, submitted_by_name')
        .order('created_at', { ascending: false });
      if (monthlyErr) throw monthlyErr;
      monthlies = (monthlyAll || []).filter(
        (r) => rowMatchesSite(r.project_name, aliases) || rowMatchesSite(r.site_name, aliases)
      );
    } catch (err) {
      console.error('client monthlies:', err.message);
      monthlies = [];
    }

    res.json({
      dprs: dprData || [],
      wprs: wprData || [],
      photos: [...wprPhotoRows, ...dprPhotoRows],
      drawings: drawingData || [],
      monthlies,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/site-profile', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json(null);
    await assertSite(req, siteName);
    const { data } = await supabase
      .from('site_details')
      .select(
        'site_name, client_name, head_name, head_contact_no, incharge_name, incharge_contact_no, pc_name, pc_contact_no, status, site_image_url, job_no'
      )
      .ilike('site_name', siteName)
      .maybeSingle();
    if (data) return res.json(data);
    const { data: proj } = await supabase
      .from('projects')
      .select('name, client_name, location, status')
      .ilike('name', siteName)
      .maybeSingle();
    if (!proj) return res.json(null);
    res.json({
      site_name: proj.name,
      client_name: proj.client_name,
      status: proj.status,
      location: proj.location,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
