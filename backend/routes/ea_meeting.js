const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const {
  sendWhatsAppText,
  normalizeWhatsAppNumber,
} = require('../lib/whatsapp');
const {
  isAdminUser,
  userCanViewAllEaUploads,
  findBeenaOrPcUsers,
} = require('../lib/taskListDigest');

const router = express.Router();
router.use(requireAuth);

function usernamesFor(user) {
  return [...new Set(
    [user.username, user.user_name]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  )];
}

function normSite(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sitesForUser(user) {
  const out = [];
  if (user?.site_name) out.push(user.site_name);
  if (Array.isArray(user?.site_names)) out.push(...user.site_names);
  return [...new Set(out.map(normSite).filter(Boolean))];
}

async function loadUserProfile(user) {
  if (!user?.id) return user || {};
  const { data } = await supabase
    .from('users')
    .select('id, full_name, username, role, designation, department, site_name, site_names, whatsapp_number')
    .eq('id', user.id)
    .maybeSingle();
  return { ...user, ...(data || {}) };
}

/** Own EA rows only (uploader). */
async function loadOwnEaRows(user) {
  const names = usernamesFor(user);
  const uid = user?.id != null ? String(user.id) : null;

  if (uid) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('employee_id', uid)
      .order('meeting_week_start', { ascending: false })
      .limit(40);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return [];
      throw error;
    }
    if (data?.length) return data;
  }

  if (names.length) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .in('employee_username', names)
      .order('meeting_week_start', { ascending: false })
      .limit(40);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return [];
      throw error;
    }
    if (data?.length) return data;
  }

  return [];
}

async function loadAllEaRows(limit = 200) {
  const { data, error } = await supabase
    .from('ea_meeting_attendance')
    .select('*')
    .order('meeting_week_start', { ascending: false })
    .limit(limit);
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

/** Same-site colleagues see uploads for their site(s). */
async function loadSiteEaRows(user) {
  const sites = sitesForUser(user);
  if (!sites.length) return [];
  const all = await loadAllEaRows(120);
  return all.filter((r) => sites.includes(normSite(r.employee_site_name)));
}

/**
 * Visibility:
 * - Admin → nothing
 * - Beena / PC → all
 * - Site staff → own + same site uploads
 */
async function loadEaRowsForViewer(user) {
  const profile = await loadUserProfile(user);
  if (isAdminUser(profile)) return { rows: [], viewer: 'admin_hidden', profile };
  if (userCanViewAllEaUploads(profile)) {
    return { rows: await loadAllEaRows(120), viewer: 'beena_pc', profile };
  }
  const own = await loadOwnEaRows(profile);
  const siteRows = await loadSiteEaRows(profile);
  const byId = new Map();
  [...own, ...siteRows].forEach((r) => byId.set(r.id, r));
  return { rows: [...byId.values()], viewer: 'site_or_uploader', profile };
}

function mapEaItem(r, { forBeena }) {
  const uploaded = !!r.plan_submitted_at;
  const who = r.employee_name || r.employee_username || 'Employee';
  const site = r.employee_site_name || '—';
  const base = uploaded
    ? `EA plan submitted (${r.meeting_week_start})`
    : `EA meeting — upload weekly plan (${r.meeting_week_start})`;
  return {
    id: `ea:${r.id}`,
    source: 'ea_meeting',
    ea_id: r.id,
    description: forBeena ? `${who} · ${site}: ${base}` : base,
    employee_name: r.employee_name,
    employee_username: r.employee_username,
    employee_id: r.employee_id,
    employee_site_name: r.employee_site_name,
    status: uploaded ? 'Completed' : 'Pending',
    priority: 'High',
    target_date: r.meeting_week_end || r.meeting_week_start,
    meeting_week_start: r.meeting_week_start,
    meeting_week_end: r.meeting_week_end,
    attachment_1_url: r.attachment_1_url,
    attachment_1_name: r.attachment_1_name,
    attachment_2_url: r.attachment_2_url,
    attachment_2_name: r.attachment_2_name,
    plan_submitted_at: r.plan_submitted_at,
    scanned_at: r.scanned_at,
    project: { name: 'Monday EA Meeting' },
    upload_path: '/site/qr-scan',
  };
}

router.get('/my', async (req, res) => {
  try {
    const { rows, viewer } = await loadEaRowsForViewer(req.user);
    const forBeena = viewer === 'beena_pc';
    const items = rows.map((r) => mapEaItem(r, { forBeena }));
    res.json({
      items,
      table: 'ea_meeting_attendance',
      viewer,
      note:
        viewer === 'admin_hidden'
          ? 'EA uploads hidden for admin.'
          : viewer === 'beena_pc'
            ? 'Beena/PC: all Site Engineer EA uploads + files.'
            : 'Apni uploads + same site ke EA files. Beena bhi dekh sakti hai.',
    });
  } catch (err) {
    console.error('EA my list:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EA attendance' });
  }
});

/** Beena / PC: attendance-style report (date range). */
router.get('/report', async (req, res) => {
  try {
    const profile = await loadUserProfile(req.user);
    if (isAdminUser(profile) || !userCanViewAllEaUploads(profile)) {
      return res.status(403).json({
        error: 'Only Beena / Process Controller can open EA meeting attendance report.',
      });
    }
    const from = String(req.query.from || '').slice(0, 10);
    const to = String(req.query.to || '').slice(0, 10);
    let q = supabase
      .from('ea_meeting_attendance')
      .select('*')
      .order('meeting_week_start', { ascending: false })
      .order('scanned_at', { ascending: false });
    if (from) q = q.gte('meeting_week_start', from);
    if (to) q = q.lte('meeting_week_start', to);
    const { data, error } = await q.limit(500);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return res.json({ rows: [], note: 'Run ea_meeting_attendance.sql in Supabase.' });
      }
      throw error;
    }
    const rows = (data || []).map((r) => ({
      id: r.id,
      week_start: r.meeting_week_start,
      week_end: r.meeting_week_end,
      scanned_at: r.scanned_at,
      employee_name: r.employee_name,
      employee_username: r.employee_username,
      employee_role: r.employee_role,
      site: r.employee_site_name,
      status: r.attendance_status || 'present',
      plan_uploaded: !!r.plan_submitted_at,
      plan_submitted_at: r.plan_submitted_at,
      file_1: r.attachment_1_name,
      file_1_url: r.attachment_1_url,
      file_2: r.attachment_2_name,
      file_2_url: r.attachment_2_url,
    }));
    res.json({ rows, from: from || null, to: to || null, count: rows.length });
  } catch (err) {
    console.error('EA report:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EA report' });
  }
});

async function notifyUploaderWhatsApp(user, opts = {}) {
  const full = await loadUserProfile(user);
  const wa = full?.whatsapp_number;
  const fullName = full?.full_name || full?.username || 'Team member';

  if (!normalizeWhatsAppNumber(wa)) {
    return { ok: false, reason: 'no_whatsapp', who: fullName };
  }

  if (opts.kind === 'uploaded') {
    await sendWhatsAppText(
      wa,
      `✅ EA weekly plan uploaded.\nWeek: ${opts.weekStart || '—'}\nSite → My Tasks.\nBeena + your site can see the files.`
    );
    return { ok: true, kind: 'uploaded', who: fullName };
  }

  await sendWhatsAppText(
    wa,
    `✅ EA meeting present marked.\nWeek: ${opts.weekStart || '—'}\nAb weekly plan upload karein (Site Engineer).\nOpen: Site → QR scan.`
  );
  return { ok: true, kind: 'present', who: fullName };
}

async function notifyBeenaAboutEa(uploaderUser, opts = {}) {
  const beenas = await findBeenaOrPcUsers();
  const profile = await loadUserProfile(uploaderUser);
  const uploaderName = profile.full_name || profile.username || 'Site Engineer';
  const site = profile.site_name || (Array.isArray(profile.site_names) ? profile.site_names[0] : '') || '—';
  const results = [];

  for (const b of beenas) {
    if (b.id === uploaderUser.id) {
      results.push({ username: b.username, skipped: 'self' });
      continue;
    }
    if (!normalizeWhatsAppNumber(b.whatsapp_number)) {
      results.push({ username: b.username, ok: false, reason: 'no_whatsapp' });
      continue;
    }
    if (opts.kind === 'uploaded') {
      await sendWhatsAppText(
        b.whatsapp_number,
        `📋 EA upload — ${uploaderName}\nSite: ${site}\nWeek: ${opts.weekStart || '—'}${
          opts.fileName ? `\nFile: ${opts.fileName}` : ''
        }\nSite → EA Attendance Report / My Tasks.`
      );
    } else {
      await sendWhatsAppText(
        b.whatsapp_number,
        `✅ EA present — ${uploaderName}\nSite: ${site}\nWeek: ${opts.weekStart || '—'}\nPlan upload pending ho sakta hai.`
      );
    }
    results.push({ username: b.username, ok: true, kind: opts.kind || 'present' });
  }
  return results;
}

async function notifyUserEaAndTasks(user, opts = {}) {
  const uploader = await notifyUploaderWhatsApp(user, opts);
  const beena = await notifyBeenaAboutEa(user, opts);
  return { ...uploader, beenaNotify: beena };
}

router.post('/notify', async (req, res) => {
  try {
    const kind = req.body?.kind || 'present';
    const result = await notifyUserEaAndTasks(req.user, {
      kind,
      weekStart: req.body?.weekStart,
      fileName: req.body?.fileName,
    });
    res.json(result);
  } catch (err) {
    console.error('EA notify:', err.message);
    res.status(500).json({ error: err.message || 'Notify failed' });
  }
});

module.exports = router;
