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
const {
  notifyWeeklyPlanAfterUpload,
  istYmd: weeklyPlanIstYmd,
} = require('../lib/weeklyPlanDayList');
const { ingestWeeklyPlanFromEaRow } = require('../lib/weeklyPlanTasks');

const router = express.Router();
router.use(requireAuth);

function usernamesFor(user) {
  return [...new Set(
    [user.username, user.user_name, user.employee_username]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  )];
}

function usernameSetLower(user, extraRows = []) {
  const set = new Set(
    usernamesFor(user).map((n) => String(n).trim().toLowerCase()).filter(Boolean)
  );
  for (const row of extraRows || []) {
    const u = String(row?.employee_username || '').trim().toLowerCase();
    if (u) set.add(u);
  }
  return set;
}

function isMissingRelation(err) {
  return /does not exist|schema cache|PGRST205|42P01/i.test(String(err?.message || err || ''));
}

/** PostgREST OR clause for case-insensitive exact username match. */
function usernameOrFilter(namesLower) {
  const parts = [...namesLower]
    .map((n) => String(n || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)
    .map((n) => {
      // Escape LIKE wildcards so usernames with _ match exactly.
      const exact = n.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      return `employee_username.ilike.${exact}`;
    });
  return parts.length ? parts.join(',') : '';
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

/** Own EM rows only (uploader). Case-insensitive on employee_username. */
async function loadOwnEaRows(user) {
  const names = usernamesFor(user);
  const namesLower = usernameSetLower(user);
  const uid = user?.id != null ? String(user.id) : null;
  const byId = new Map();

  const merge = (rows) => {
    for (const row of rows || []) {
      if (row?.id) byId.set(String(row.id), row);
    }
  };

  if (uid) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('employee_id', uid)
      .order('meeting_week_start', { ascending: false })
      .limit(80);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    merge(data);
  }

  if (names.length) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .in('employee_username', names)
      .order('meeting_week_start', { ascending: false })
      .limit(80);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    merge(data);
  }

  // Case-insensitive username match (DB may store different casing than users.username).
  const orFilter = usernameOrFilter(namesLower);
  if (orFilter) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .or(orFilter)
      .order('meeting_week_start', { ascending: false })
      .limit(80);
    if (error) {
      if (!isMissingRelation(error)) {
        // Fallback: scan recent rows and filter in JS.
        const { data: recent, error: recentErr } = await supabase
          .from('ea_meeting_attendance')
          .select('*')
          .order('meeting_week_start', { ascending: false })
          .limit(400);
        if (recentErr) {
          if (isMissingRelation(recentErr)) return [...byId.values()];
          throw recentErr;
        }
        merge(
          (recent || []).filter((row) =>
            namesLower.has(String(row.employee_username || '').trim().toLowerCase())
          )
        );
      }
    } else {
      merge(data);
    }
  }

  return [...byId.values()].sort((a, b) =>
    String(b.meeting_week_start || '').localeCompare(String(a.meeting_week_start || ''))
  );
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
    ? `EM plan submitted (${r.meeting_week_start})`
    : `EM meeting — upload weekly plan (${r.meeting_week_start})`;
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
    project: { name: 'Monday EM Meeting' },
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
          ? 'EM uploads hidden for admin.'
          : viewer === 'beena_pc'
            ? 'Beena/PC: all Site Engineer EM uploads + files.'
            : 'Your uploads + EM files for the same site. Beena can also view them.',
    });
  } catch (err) {
    console.error('EM my list:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EM attendance' });
  }
});

/** Beena / PC: attendance-style report (date range). */
router.get('/report', async (req, res) => {
  try {
    const profile = await loadUserProfile(req.user);
    if (isAdminUser(profile) || !userCanViewAllEaUploads(profile)) {
      return res.status(403).json({
        error: 'Only Beena / Process Controller can open EM meeting attendance report.',
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
    console.error('EM report:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EM report' });
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
    // Day-list WhatsApp (tasks + sr nos) is sent separately after ingest.
    if (opts.skipUploaderText) {
      return { ok: true, kind: 'uploaded', who: fullName, skipped: 'day_list_follows' };
    }
    await sendWhatsAppText(
      wa,
      `✅ EM weekly plan uploaded.\nWeek: ${opts.weekStart || '—'}\nSite → My Tasks.\nBeena + your site can see the files.`
    );
    return { ok: true, kind: 'uploaded', who: fullName };
  }

  await sendWhatsAppText(
    wa,
    `✅ EM meeting present marked.\nWeek: ${opts.weekStart || '—'}\nPlease upload the weekly plan next (Site Engineer).\nOpen: Site → QR scan.`
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
        `📋 EM upload — ${uploaderName}\nSite: ${site}\nWeek: ${opts.weekStart || '—'}${
          opts.fileName ? `\nFile: ${opts.fileName}` : ''
        }\nSite → EM Attendance Report / My Tasks.`
      );
    } else {
      await sendWhatsAppText(
        b.whatsapp_number,
        `✅ EM present — ${uploaderName}\nSite: ${site}\nWeek: ${opts.weekStart || '—'}\nPlan upload may still be pending.`
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

/**
 * Save browser-parsed plan cells into weekly_plan_tasks.
 * Replace-by-source so re-parse fixes wrong half/date bindings and
 * preserves Completed status when the dedupe key still matches.
 */
async function ingestParsedBatches(ea, batches) {
  const clientParsed = (batches || [])
    .map((batch) => ({
      source_file: normalizeSourceFile(batch?.source_file),
      tasks: Array.isArray(batch?.tasks) ? batch.tasks.slice(0, 400) : [],
      meta: batch?.meta || null,
    }))
    .filter((b) => b.tasks.length);

  if (!clientParsed.length) {
    return { ok: true, inserted: 0, note: 'No tasks to save' };
  }

  try {
    const result = await ingestWeeklyPlanFromEaRow(ea, clientParsed);
    const inserted = Number(result?.inserted) || 0;
    const failed = (result?.details || []).find((d) => d.error);
    if (failed) {
      const msg = String(failed.error || '');
      if (/relation .* does not exist|schema cache|PGRST205|42P01/i.test(msg)) {
        return {
          ok: false,
          inserted,
          note: 'Missing table weekly_plan_tasks. Run backend/sql/weekly_plan_tasks.sql in Supabase.',
          error: msg,
        };
      }
      if (/column .*half.* does not exist/i.test(msg)) {
        return {
          ok: false,
          inserted,
          note: 'Column half is missing. Run backend/sql/weekly_plan_tasks_half_fix.sql in Supabase.',
          error: msg,
        };
      }
      return { ok: false, inserted, error: msg || 'Ingest failed', details: result?.details };
    }
    return {
      ok: true,
      inserted,
      details: result?.details || [],
      note: inserted ? null : 'Tasks refreshed (no new rows)',
    };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/relation .* does not exist|schema cache|PGRST205|42P01/i.test(msg)) {
      return {
        ok: false,
        inserted: 0,
        note: 'Missing table weekly_plan_tasks. Run backend/sql/weekly_plan_tasks.sql in Supabase.',
        error: msg,
      };
    }
    if (/column .*half.* does not exist/i.test(msg)) {
      return {
        ok: false,
        inserted: 0,
        note: 'Column half is missing. Run backend/sql/weekly_plan_tasks_half_fix.sql in Supabase.',
        error: msg,
      };
    }
    throw err;
  }
}

router.post('/notify', async (req, res) => {
  try {
    const kind = req.body?.kind || 'present';
    const result = await notifyUserEaAndTasks(req.user, {
      kind,
      weekStart: req.body?.weekStart,
      fileName: req.body?.fileName,
      skipUploaderText: kind === 'uploaded',
    });

    let weeklyPlan = null;
    if (kind === 'uploaded') {
      const eaId = String(req.body?.eaId || '').trim();
      const clientParsed = Array.isArray(req.body?.clientParsed) ? req.body.clientParsed : [];
      try {
        let ingest = { ok: true, inserted: 0, note: 'No eaId' };
        let ea = null;
        if (eaId) {
          ea = await loadEaAttendanceById(eaId);
          if (ea) {
            ingest = await ingestParsedBatches(ea, clientParsed);
          } else {
            ingest = { ok: false, inserted: 0, note: 'EM attendance not found' };
          }
        }

        const username =
          (ea && String(ea.employee_username || '').trim()) ||
          String(req.user?.username || '').trim();
        const profile = await loadUserProfile(req.user);
        const whatsapp = await notifyWeeklyPlanAfterUpload({
          username,
          user: profile,
          toNumber: profile?.whatsapp_number,
          fullName: profile?.full_name || username,
          dayYmd: weeklyPlanIstYmd(),
        });

        weeklyPlan = {
          ingest,
          inserted: ingest?.inserted || 0,
          openCount: whatsapp?.openCount ?? 0,
          todayCount: whatsapp?.todayCount ?? 0,
          priorPendingCount: whatsapp?.priorPendingCount ?? 0,
          dayYmd: whatsapp?.dayYmd || weeklyPlanIstYmd(),
          whatsapp,
          note: whatsapp?.note || ingest?.note || null,
        };
      } catch (wpErr) {
        console.error('EM weekly plan WA:', wpErr.message);
        weeklyPlan = { ok: false, error: wpErr.message, whatsapp: { ok: false, reason: 'exception' } };
      }
    }

    res.json({ ...result, weeklyPlan });
  } catch (err) {
    console.error('EM notify:', err.message);
    res.status(500).json({ error: err.message || 'Notify failed' });
  }
});

async function loadEaAttendanceById(id) {
  const { data, error } = await supabase
    .from('ea_meeting_attendance')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return null;
    throw error;
  }
  return data || null;
}

async function viewerCanAccessEaRow(user, eaRow) {
  if (!eaRow) return false;
  const { rows, viewer } = await loadEaRowsForViewer(user);
  if (viewer === 'admin_hidden') return false;
  return rows.some((r) => String(r.id) === String(eaRow.id));
}

function normalizeSourceFile(raw) {
  const s = String(raw || '').trim();
  if (s === 'attachment_1' || s === 'attachment_2') return s;
  if (/_2(\.|$)/i.test(s) || /attachment[\s_-]*2/i.test(s)) return 'attachment_2';
  if (s) return 'attachment_1';
  return 'attachment_1';
}

function mapIngestTask(t, ea, sourceFile) {
  const taskDate = String(t?.task_date || '').slice(0, 10);
  const taskName = String(t?.task_name || '').trim();
  if (!taskDate || !taskName) return null;
  const half = Number(t?.half);
  return {
    ea_attendance_id: ea.id,
    employee_id: ea.employee_id != null ? String(ea.employee_id) : null,
    employee_username: String(ea.employee_username || '').trim() || 'unknown',
    employee_name: ea.employee_name || null,
    site_name: ea.employee_site_name || null,
    week_start: ea.meeting_week_start,
    week_end: ea.meeting_week_end || null,
    task_date: taskDate,
    task_name: taskName,
    time_slot: t?.time_slot != null ? String(t.time_slot) : null,
    sr_no: Number.isFinite(Number(t?.sr_no)) ? Number(t.sr_no) : null,
    half: Number.isFinite(half) ? half : 0,
    source_file: sourceFile,
    status: String(t?.status || 'Pending').trim() || 'Pending',
    updated_at: new Date().toISOString(),
  };
}

async function setWeeklyPlanTaskStatus(req, res, nextStatus) {
  try {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) return res.status(400).json({ error: 'Missing task id' });
    if (nextStatus !== 'Pending' && nextStatus !== 'Completed') {
      return res.status(400).json({ error: 'status must be Pending or Completed' });
    }

    const now = new Date().toISOString();
    // Prefer status-only first — works on every weekly_plan_tasks row we have.
    const patchStatusOnly = { status: nextStatus, updated_at: now };
    const patchTasksFull =
      nextStatus === 'Completed'
        ? {
            status: 'Completed',
            completed_at: now,
            completed_via: 'portal',
            updated_at: now,
          }
        : {
            status: 'Pending',
            completed_at: null,
            completed_via: null,
            updated_at: now,
          };
    const patchSheet =
      nextStatus === 'Completed'
        ? { status: 'Completed', completed_at: now, updated_at: now }
        : { status: 'Pending', completed_at: null, updated_at: now };

    const { data: existing, error: loadErr } = await supabase
      .from('weekly_plan_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();
    if (loadErr && !isMissingRelation(loadErr)) throw loadErr;

    if (existing) {
      if (existing.ea_attendance_id) {
        const ea = await loadEaAttendanceById(existing.ea_attendance_id);
        if (ea && !(await viewerCanAccessEaRow(req.user, ea))) {
          return res.status(403).json({ error: 'Not allowed to update this task' });
        }
      }
      if (String(existing.status) === nextStatus) {
        return res.json({ ok: true, task: mapTaskRow(existing) });
      }

      // 1) status-only (most compatible)
      let { data, error } = await supabase
        .from('weekly_plan_tasks')
        .update(patchStatusOnly)
        .eq('id', taskId)
        .select('*')
        .maybeSingle();

      // 2) enrich completed_* when columns exist
      if (!error && data) {
        const { error: enrichErr } = await supabase
          .from('weekly_plan_tasks')
          .update(patchTasksFull)
          .eq('id', taskId);
        if (!enrichErr) {
          const refreshed = await supabase
            .from('weekly_plan_tasks')
            .select('*')
            .eq('id', taskId)
            .maybeSingle();
          if (refreshed.data) data = refreshed.data;
        }
      }

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Task not found or could not be updated' });
      }
      return res.json({ ok: true, task: mapTaskRow(data) });
    }

    const { data: sheetRow, error: sheetLoadErr } = await supabase
      .from('weekly_plan_sheet')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();
    if (sheetLoadErr) {
      if (isMissingRelation(sheetLoadErr)) {
        return res.status(503).json({ error: 'Run weekly_plan_tasks.sql in Supabase.' });
      }
      throw sheetLoadErr;
    }
    if (!sheetRow) return res.status(404).json({ error: 'Task not found' });

    if (sheetRow.ea_attendance_id) {
      const ea = await loadEaAttendanceById(sheetRow.ea_attendance_id);
      if (ea && !(await viewerCanAccessEaRow(req.user, ea))) {
        return res.status(403).json({ error: 'Not allowed to update this task' });
      }
    }
    if (String(sheetRow.status) === nextStatus) {
      return res.json({ ok: true, task: mapSheetRowToTask(sheetRow) });
    }

    const { data: sheetUpdated, error: sheetErr } = await supabase
      .from('weekly_plan_sheet')
      .update(patchSheet)
      .eq('id', taskId)
      .select('*')
      .maybeSingle();
    if (sheetErr) throw sheetErr;
    if (!sheetUpdated) {
      return res.status(404).json({ error: 'Task not found or could not be updated' });
    }
    return res.json({ ok: true, task: mapSheetRowToTask(sheetUpdated) });
  } catch (err) {
    console.error('EM task status:', err.message || err);
    res.status(500).json({
      error: err.message || String(err) || 'Could not update task status',
    });
  }
}

function mapSheetRowToTask(row) {
  if (!row?.id) return null;
  const taskName = String(row.task || '').trim();
  if (!taskName) return null;
  return {
    id: row.id,
    table: 'weekly_plan_sheet',
    ea_attendance_id: row.ea_attendance_id || null,
    employee_id: row.employee_id != null ? String(row.employee_id) : null,
    employee_username: row.employee_username || null,
    employee_name: row.employee_name || null,
    site_name: row.site_name || null,
    week_start: row.week_from || null,
    week_end: row.week_to || null,
    task_date: row.task_date || row.week_from || null,
    task_name: taskName,
    time_slot: null,
    sr_no: null,
    half: 0,
    source_file: row.source_file || null,
    status: String(row.status || 'Pending').trim() || 'Pending',
    completed_at: row.completed_at || null,
    completed_via: null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapTaskRow(row) {
  if (!row?.id) return null;
  return {
    ...row,
    table: 'weekly_plan_tasks',
    status: String(row.status || 'Pending').trim() || 'Pending',
  };
}

async function fetchWeeklyPlanTasksForUser({ eaIds, uid, namesLower }) {
  const byId = new Map();
  const merge = (rows) => {
    for (const raw of rows || []) {
      const row = mapTaskRow(raw);
      if (row?.id) byId.set(String(row.id), row);
    }
  };

  for (let i = 0; i < eaIds.length; i += 80) {
    const chunk = eaIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from('weekly_plan_tasks')
      .select('*')
      .in('ea_attendance_id', chunk)
      .order('week_start', { ascending: false })
      .order('task_date', { ascending: true })
      .order('sr_no', { ascending: true })
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      throw error;
    }
    merge(data);
  }

  if (uid) {
    const { data, error } = await supabase
      .from('weekly_plan_tasks')
      .select('*')
      .eq('employee_id', uid)
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      throw error;
    }
    merge(data);
  }

  const orFilter = usernameOrFilter(namesLower);
  if (orFilter) {
    const { data, error } = await supabase
      .from('weekly_plan_tasks')
      .select('*')
      .or(orFilter)
      .order('week_start', { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      const { data: recent, error: recentErr } = await supabase
        .from('weekly_plan_tasks')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(4000);
      if (recentErr) {
        if (isMissingRelation(recentErr)) return { tasks: [], missing: true };
        throw recentErr;
      }
      merge(
        (recent || []).filter((row) => {
          const u = String(row.employee_username || '').trim().toLowerCase();
          const idOk = uid && String(row.employee_id || '') === uid;
          return idOk || namesLower.has(u);
        })
      );
    } else {
      merge(data);
    }
  }

  return { tasks: [...byId.values()], missing: false };
}

async function fetchWeeklyPlanSheetForUser({ eaIds, uid, namesLower }) {
  const byId = new Map();
  const merge = (rows) => {
    for (const raw of rows || []) {
      const row = mapSheetRowToTask(raw);
      if (row?.id) byId.set(String(row.id), row);
    }
  };

  for (let i = 0; i < eaIds.length; i += 80) {
    const chunk = eaIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from('weekly_plan_sheet')
      .select('*')
      .in('ea_attendance_id', chunk)
      .order('week_from', { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      throw error;
    }
    merge(data);
  }

  if (uid) {
    const { data, error } = await supabase
      .from('weekly_plan_sheet')
      .select('*')
      .eq('employee_id', uid)
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      throw error;
    }
    merge(data);
  }

  const orFilter = usernameOrFilter(namesLower);
  if (orFilter) {
    const { data, error } = await supabase
      .from('weekly_plan_sheet')
      .select('*')
      .or(orFilter)
      .order('week_from', { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissingRelation(error)) return { tasks: [], missing: true };
      const { data: recent, error: recentErr } = await supabase
        .from('weekly_plan_sheet')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(4000);
      if (recentErr) {
        if (isMissingRelation(recentErr)) return { tasks: [], missing: true };
        throw recentErr;
      }
      merge(
        (recent || []).filter((row) => {
          const u = String(row.employee_username || '').trim().toLowerCase();
          const idOk = uid && String(row.employee_id || '') === uid;
          return idOk || namesLower.has(u);
        })
      );
    } else {
      merge(data);
    }
  }

  return { tasks: [...byId.values()], missing: false };
}

/** GET /api/ea-meeting/my-plan-tasks — from weekly_plan_tasks (+ weekly_plan_sheet fallback) via ea_meeting_attendance */
router.get('/my-plan-tasks', async (req, res) => {
  try {
    const profile = await loadUserProfile(req.user);
    if (isAdminUser(profile)) {
      return res.json({ tasks: [], weeks: [], uploads: [], note: 'Weekly plan tasks are hidden for admin.' });
    }

    const ownRows = await loadOwnEaRows(profile);
    const namesLower = usernameSetLower(profile, ownRows);
    const uid = profile?.id != null ? String(profile.id) : null;
    const eaIds = [...new Set(ownRows.map((r) => r.id).filter(Boolean))];

    const primary = await fetchWeeklyPlanTasksForUser({ eaIds, uid, namesLower });
    if (primary.missing && !eaIds.length && !uid && !namesLower.size) {
      return res.json({
        tasks: [],
        weeks: [],
        uploads: [],
        note: 'Run the EM / weekly_plan_tasks SQL in Supabase.',
      });
    }

    let tasks = primary.tasks || [];
    let sheetCount = 0;

    // Prefer weekly_plan_tasks; also include weekly_plan_sheet rows not already covered.
    const sheet = await fetchWeeklyPlanSheetForUser({ eaIds, uid, namesLower });
    if (!sheet.missing && sheet.tasks?.length) {
      const taskKeys = new Set(
        tasks.map(
          (t) =>
            `${String(t.ea_attendance_id || '')}|${String(t.task_date || '').slice(0, 10)}|${String(t.task_name || '')
              .trim()
              .toLowerCase()}`
        )
      );
      for (const row of sheet.tasks) {
        const key = `${String(row.ea_attendance_id || '')}|${String(row.task_date || '').slice(0, 10)}|${String(
          row.task_name || ''
        )
          .trim()
          .toLowerCase()}`;
        if (taskKeys.has(key)) continue;
        tasks.push(row);
        sheetCount += 1;
        taskKeys.add(key);
      }
    }

    // If tasks table empty but sheet has data, use sheet only.
    if (!tasks.length && !sheet.missing && sheet.tasks?.length) {
      tasks = sheet.tasks;
      sheetCount = sheet.tasks.length;
    }

    tasks.sort((a, b) => {
      const w = String(b.week_start || '').localeCompare(String(a.week_start || ''));
      if (w) return w;
      const d = String(a.task_date || '').localeCompare(String(b.task_date || ''));
      if (d) return d;
      return (Number(a.sr_no) || 0) - (Number(b.sr_no) || 0);
    });

    const weekMap = new Map();
    for (const t of tasks) {
      const start = String(t.week_start || '').slice(0, 10);
      if (!start) continue;
      if (!weekMap.has(start)) {
        weekMap.set(start, {
          week_start: start,
          week_end: t.week_end ? String(t.week_end).slice(0, 10) : null,
          count: 0,
        });
      }
      weekMap.get(start).count += 1;
    }

    const uploads = ownRows
      .filter((r) => r.plan_submitted_at && (r.attachment_1_url || r.attachment_2_url))
      .map((r) => ({
        ea_id: r.id,
        meeting_week_start: r.meeting_week_start,
        meeting_week_end: r.meeting_week_end,
        employee_username: r.employee_username,
        plan_submitted_at: r.plan_submitted_at,
        attachment_1_url: r.attachment_1_url,
        attachment_1_name: r.attachment_1_name,
        attachment_2_url: r.attachment_2_url,
        attachment_2_name: r.attachment_2_name,
      }));

    let note;
    if (primary.missing && !tasks.length) {
      note = 'Run the weekly_plan_tasks / weekly_plan_sheet SQL in Supabase.';
    } else if (!tasks.length && uploads.length) {
      note =
        'Weekly plans were uploaded, but tasks are not saved yet. Use Sync from plans below (or open Weekly Plan once).';
    } else if (!tasks.length && !ownRows.length) {
      note = 'No EM attendance / weekly plan upload found for your username yet.';
    } else if (sheetCount && !(primary.tasks || []).length) {
      note = 'Loaded from weekly_plan_sheet.';
    }

    res.json({
      tasks,
      weeks: [...weekMap.values()],
      count: tasks.length,
      ea_uploads: ownRows.length,
      uploads,
      sources: {
        weekly_plan_tasks: (primary.tasks || []).length,
        weekly_plan_sheet: sheetCount || (!(primary.tasks || []).length ? (sheet.tasks || []).length : 0),
        ea_meeting_attendance: ownRows.length,
      },
      note,
    });
  } catch (err) {
    console.error('EM my-plan-tasks:', err.message);
    res.status(500).json({ error: err.message || 'Could not load plan tasks', tasks: [], weeks: [], uploads: [] });
  }
});

/** PATCH /api/ea-meeting/tasks/:taskId/status — body: { status: 'Pending'|'Completed' } */
router.patch('/tasks/:taskId/status', async (req, res) => {
  const wanted = String(req.body?.status || '').trim();
  const nextStatus = wanted === 'Pending' ? 'Pending' : wanted === 'Completed' ? 'Completed' : null;
  if (!nextStatus) {
    return res.status(400).json({ error: 'status must be Pending or Completed' });
  }
  return setWeeklyPlanTaskStatus(req, res, nextStatus);
});

/** PATCH /api/ea-meeting/tasks/:taskId/complete — mark Completed (compat) */
router.patch('/tasks/:taskId/complete', async (req, res) =>
  setWeeklyPlanTaskStatus(req, res, 'Completed')
);

/** GET /api/ea-meeting/:id/tasks — list saved weekly-plan tasks for one attendance row */
router.get('/:id/tasks', async (req, res) => {
  try {
    const eaId = String(req.params.id || '').trim();
    const ea = await loadEaAttendanceById(eaId);
    if (!ea) return res.status(404).json({ error: 'EM attendance not found', tasks: [] });
    if (!(await viewerCanAccessEaRow(req.user, ea))) {
      return res.status(403).json({ error: 'Not allowed to view these tasks', tasks: [] });
    }

    const source = String(req.query.source || '').trim();
    let q = supabase
      .from('weekly_plan_tasks')
      .select('*')
      .eq('ea_attendance_id', eaId)
      .order('task_date', { ascending: true })
      .order('sr_no', { ascending: true });
    if (source) q = q.eq('source_file', normalizeSourceFile(source));

    const { data, error } = await q;
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return res.json({ tasks: [], note: 'Run weekly_plan_tasks.sql in Supabase.' });
      }
      throw error;
    }
    res.json({ tasks: data || [], ea_id: eaId });
  } catch (err) {
    console.error('EM tasks list:', err.message);
    res.status(500).json({ error: err.message || 'Could not load tasks', tasks: [] });
  }
});

/**
 * POST /api/ea-meeting/:id/send-day-list
 * Re-ingest plan Excel if needed, then WhatsApp today's open task list.
 */
router.post('/:id/send-day-list', async (req, res) => {
  try {
    const eaId = String(req.params.id || '').trim();
    const ea = await loadEaAttendanceById(eaId);
    if (!ea) return res.status(404).json({ ok: false, error: 'EM attendance not found' });
    if (!(await viewerCanAccessEaRow(req.user, ea))) {
      return res.status(403).json({ ok: false, error: 'Not allowed' });
    }

    const username = String(ea.employee_username || '').trim();
    if (!username) {
      return res.status(400).json({ ok: false, error: 'No employee_username on this attendance row' });
    }

    const { data: owner } = await supabase
      .from('users')
      .select('id, username, full_name, whatsapp_number, role, is_active')
      .ilike('username', username)
      .maybeSingle();

    const toNumber = owner?.whatsapp_number;
    if (!normalizeWhatsAppNumber(toNumber)) {
      return res.status(400).json({
        ok: false,
        reason: 'no_whatsapp',
        error: `No WhatsApp number for ${username}. Set it in Admin → Employees.`,
      });
    }

    // Prefer client parse (same as the on-screen grid). Fall back to server Excel parse.
    let ingest = null;
    const clientParsed = Array.isArray(req.body?.clientParsed) ? req.body.clientParsed : null;
    try {
      ingest = await ingestWeeklyPlanFromEaRow(ea, clientParsed);
    } catch (ingErr) {
      console.error('EM send-day-list ingest:', ingErr.message);
      ingest = { ok: false, error: ingErr.message, inserted: 0 };
    }

    const whatsapp = await notifyWeeklyPlanAfterUpload({
      username,
      user: owner,
      toNumber,
      fullName: owner?.full_name || ea.employee_name || username,
      dayYmd: weeklyPlanIstYmd(),
    });

    // If Site Incharge / PC clicked Send, also ping their own WhatsApp when different.
    let cc = null;
    const viewerProfile = await loadUserProfile(req.user);
    const viewerTo = normalizeWhatsAppNumber(viewerProfile?.whatsapp_number);
    const ownerTo = normalizeWhatsAppNumber(toNumber);
    if (viewerTo && viewerTo !== ownerTo) {
      try {
        cc = await notifyWeeklyPlanAfterUpload({
          username: viewerProfile.username || req.user?.username,
          user: viewerProfile,
          toNumber: viewerTo,
          fullName: viewerProfile.full_name || req.user?.full_name,
          dayYmd: weeklyPlanIstYmd(),
        });
      } catch (ccErr) {
        cc = { ok: false, error: ccErr.message };
      }
    }

    const openCount = Number(whatsapp?.openCount) || 0;
    const waOk = !!whatsapp?.ok && !whatsapp?.skipped;
    const emptyOk = whatsapp?.skipped === 'empty' || (whatsapp?.ok && openCount === 0);
    let error = null;
    if (!waOk && !emptyOk) {
      error =
        whatsapp?.templateError?.error ||
        whatsapp?.textError?.error ||
        whatsapp?.reason ||
        whatsapp?.error ||
        'WhatsApp send failed';
    } else if (emptyOk && !(Number(ingest?.inserted) > 0) && openCount === 0) {
      error =
        'No weekly-plan tasks in database for this week. Open the Excel preview (Refresh) so tasks save, then try WhatsApp again.';
    }

    const toDisplay = ownerTo || normalizeWhatsAppNumber(toNumber);
    res.json({
      ok: waOk || (whatsapp?.ok && openCount > 0),
      to: toDisplay,
      username,
      ingest,
      openCount,
      whatsapp,
      cc,
      error: error || undefined,
      note:
        openCount > 0 && (waOk || whatsapp?.ok)
          ? `Sent ${openCount} open task(s) via ${whatsapp?.via || 'whatsapp'} to ${toDisplay}${cc?.ok ? ` (+ copy to ${viewerTo})` : ''}`
          : error || whatsapp?.note || null,
    });
  } catch (err) {
    console.error('EM send-day-list:', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Send failed' });
  }
});

/**
 * POST /api/ea-meeting/:id/ingest
 * Body: { clientParsed: [{ source_file, tasks: [...], meta? }] }
 * Saves browser-parsed plan cells into weekly_plan_tasks (deduped).
 */
router.post('/:id/ingest', async (req, res) => {
  try {
    const eaId = String(req.params.id || '').trim();
    const ea = await loadEaAttendanceById(eaId);
    if (!ea) return res.status(404).json({ error: 'EM attendance not found', ok: false, inserted: 0 });
    if (!(await viewerCanAccessEaRow(req.user, ea))) {
      return res.status(403).json({ error: 'Not allowed to ingest tasks', ok: false, inserted: 0 });
    }

    const batches = Array.isArray(req.body?.clientParsed) ? req.body.clientParsed : [];
    const result = await ingestParsedBatches(ea, batches);
    if (result.ok === false && /Missing table|Column half/i.test(result.note || '')) {
      return res.status(503).json(result);
    }
    if (result.ok === false && result.error) {
      return res.status(500).json(result);
    }

    // Only send WhatsApp when the client explicitly asks — never on sheet Refresh / week dropdown load.
    let whatsapp = null;
    const wantNotify =
      req.body?.notifyWhatsApp === true ||
      req.query?.notify === '1';
    if (wantNotify) {
      try {
        const username = String(ea.employee_username || req.user?.username || '').trim();
        const profile = await loadUserProfile(req.user);
        let toNumber = profile?.whatsapp_number;
        let fullName = profile?.full_name || username;
        if (
          username &&
          profile?.username &&
          username.toLowerCase() !== String(profile.username).toLowerCase()
        ) {
          const { data: owner } = await supabase
            .from('users')
            .select('full_name, whatsapp_number, username')
            .ilike('username', username)
            .maybeSingle();
          if (owner?.whatsapp_number) {
            toNumber = owner.whatsapp_number;
            fullName = owner.full_name || fullName;
          }
        }
        whatsapp = await notifyWeeklyPlanAfterUpload({
          username,
          user: profile,
          toNumber,
          fullName,
          dayYmd: weeklyPlanIstYmd(),
        });
      } catch (waErr) {
        console.error('EM ingest WhatsApp:', waErr.message);
        whatsapp = { ok: false, reason: 'exception', error: waErr.message };
      }
    }

    res.json({ ...result, whatsapp });
  } catch (err) {
    console.error('EM ingest:', err.message);
    res.status(500).json({ ok: false, inserted: 0, error: err.message || 'Ingest failed' });
  }
});


module.exports = router;
