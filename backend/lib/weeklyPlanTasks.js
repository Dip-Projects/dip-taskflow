const supabase = require('./supabaseClient');
const {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  normalizeWhatsAppNumber,
} = require('./whatsapp');
const { parseWeeklyPlanBuffer } = require('./weeklyPlanExcel');

function istYmd(d = new Date()) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function dayLabel(ymd) {
  try {
    return new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return ymd;
  }
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function isOpenPlanStatus(status) {
  const s = String(status || '');
  return s !== 'Completed' && s !== 'Cancelled';
}

async function fetchFileBuffer(url) {
  if (!url) throw new Error('Missing file URL');
  const clean = String(url).split('?')[0];
  const res = await fetch(clean);
  if (!res.ok) {
    const res2 = await fetch(url);
    if (!res2.ok) throw new Error(`Could not download Excel (${res.status})`);
    return Buffer.from(await res2.arrayBuffer());
  }
  return Buffer.from(await res.arrayBuffer());
}

async function loadEaRow(eaId, username, weekStart) {
  if (eaId) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('id', eaId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (username && weekStart) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('employee_username', username)
      .eq('meeting_week_start', weekStart)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return null;
}

async function insertWeeklyPlanSheetRows(eaRow, sourceFile, parsedTasks) {
  if (!parsedTasks.length) return { inserted: 0 };

  const del = await supabase
    .from('weekly_plan_sheet')
    .delete()
    .eq('ea_attendance_id', eaRow.id)
    .eq('source_file', sourceFile);
  if (del.error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(del.error.message || '')) {
      return { inserted: 0, skipped: true };
    }
    throw del.error;
  }

  // Sheet unique key has no half — keep one row per (date, task name), prefer half=1 then last.
  const sheetMap = new Map();
  for (const t of parsedTasks) {
    const task = String(t.task_name || '').trim() || 'Untitled task';
    const taskDate = t.task_date || eaRow.meeting_week_start;
    const key = `${String(taskDate).slice(0, 10)}|${task.toLowerCase()}`;
    sheetMap.set(key, {
      ea_attendance_id: eaRow.id,
      employee_id: eaRow.employee_id != null ? String(eaRow.employee_id) : null,
      employee_username: eaRow.employee_username,
      employee_name: eaRow.employee_name,
      site_name: eaRow.employee_site_name,
      week_from: eaRow.meeting_week_start,
      week_to: eaRow.meeting_week_end || eaRow.meeting_week_start,
      task_date: taskDate,
      task,
      status: t.status === 'Cancelled' ? 'Cancelled' : (t.status || 'Pending'),
      source_file: sourceFile,
      completed_at: null,
      updated_at: new Date().toISOString(),
    });
  }
  const rows = [...sheetMap.values()];
  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase.from('weekly_plan_sheet').insert(rows);
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return { inserted: 0, skipped: true };
    }
    // Non-fatal — weekly_plan_tasks is the source of truth for status/WhatsApp.
    console.warn('weekly_plan_sheet insert:', error.message);
    return { inserted: 0, error: error.message };
  }
  return { inserted: rows.length };
}

function planTaskDedupeKey(t) {
  return [
    String(t.task_date || '').slice(0, 10),
    t.sr_no == null || t.sr_no === '' ? '' : String(t.sr_no),
    String(t.task_name || '').trim().toLowerCase(),
    String(Number.isFinite(Number(t.half)) ? Number(t.half) : 0),
    String(t.time_slot || '').trim().toLowerCase(),
  ].join('|');
}

/** Same day + same work text → one row (drops half/sr clones from bad parses). */
function planTaskLooseKey(t) {
  const slot = String(t?.time_slot || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const name = String(t?.task_name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return [String(t?.task_date || '').slice(0, 10), slot || name].join('|');
}

function preferParsedTask(a, b) {
  const aDone = String(a?.status || '') === 'Completed';
  const bDone = String(b?.status || '') === 'Completed';
  if (bDone && !aDone) return b;
  if (aDone && !bDone) return a;
  const ah = Number(a?.half) || 0;
  const bh = Number(b?.half) || 0;
  if (bh > 0 && ah === 0) return b;
  if (ah > 0 && bh === 0) return a;
  if (bh !== ah) return bh > ah ? b : a;
  return a;
}

/** Drop duplicate keys inside one parse batch (unique index otherwise rejects the whole insert). */
function dedupeParsedPlanTasks(parsedTasks) {
  const strict = new Map();
  for (const t of parsedTasks || []) {
    const taskDate = String(t?.task_date || '').slice(0, 10);
    const taskName = String(t?.task_name || '').trim();
    if (!taskDate || !taskName) continue;
    const normalized = {
      ...t,
      task_date: taskDate,
      task_name: taskName,
      time_slot: t?.time_slot != null ? String(t.time_slot) : '',
      sr_no: Number.isFinite(Number(t?.sr_no)) ? Number(t.sr_no) : null,
      half: Number.isFinite(Number(t?.half)) ? Number(t.half) : 0,
      status: t?.status || 'Pending',
    };
    const key = planTaskDedupeKey(normalized);
    const prev = strict.get(key);
    strict.set(key, prev ? preferParsedTask(prev, normalized) : normalized);
  }
  // Second pass: one row per day + work text (fixes 17 Friday lines for a 12-task day).
  const loose = new Map();
  for (const t of strict.values()) {
    const key = planTaskLooseKey(t);
    if (!key || key === '|') continue;
    const prev = loose.get(key);
    loose.set(key, prev ? preferParsedTask(prev, t) : t);
  }
  return [...loose.values()];
}

async function replacePlanTasksForSource(eaRow, sourceFile, parsedTasks) {
  const eaId = eaRow.id;
  const uniqueTasks = dedupeParsedPlanTasks(parsedTasks);

  // Preserve portal/whatsapp completions across re-parse (any prior source key).
  const prevRes = await supabase
    .from('weekly_plan_tasks')
    .select('task_date, task_name, sr_no, half, time_slot, status, completed_at, completed_via')
    .eq('ea_attendance_id', eaId);
  const prevMap = new Map();
  (prevRes.data || []).forEach((t) => {
    // Match completions by day+work text so half-clones still keep Completed.
    const key = planTaskLooseKey(t);
    const prev = prevMap.get(key);
    if (!prev || String(t.status) === 'Completed') prevMap.set(key, t);
  });

  const del = await supabase
    .from('weekly_plan_tasks')
    .delete()
    .eq('ea_attendance_id', eaId)
    .eq('source_file', sourceFile);
  if (del.error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(del.error.message || '')) {
      throw new Error('Table weekly_plan_tasks missing — run backend/sql/weekly_plan_tasks.sql in Supabase');
    }
    throw del.error;
  }

  if (!uniqueTasks.length) return { inserted: 0 };

  const rows = uniqueTasks.map((t) => {
    const key = planTaskLooseKey(t);
    const prev = prevMap.get(key);
    const keepDone = prev && String(prev.status) === 'Completed';
    return {
      ea_attendance_id: eaId,
      employee_id: eaRow.employee_id != null ? String(eaRow.employee_id) : null,
      employee_username: eaRow.employee_username,
      employee_name: eaRow.employee_name,
      site_name: eaRow.employee_site_name,
      week_start: eaRow.meeting_week_start,
      week_end: eaRow.meeting_week_end,
      task_date: t.task_date,
      task_name: t.task_name,
      time_slot: t.time_slot || '',
      sr_no: t.sr_no,
      half: t.half,
      source_file: sourceFile,
      status: keepDone
        ? 'Completed'
        : ['Completed', 'In Progress', 'On Hold', 'Cancelled'].includes(String(t.status || ''))
          ? String(t.status)
          : 'Pending',
      completed_at: keepDone ? prev.completed_at : null,
      completed_via: keepDone ? prev.completed_via : null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from('weekly_plan_tasks').insert(rows);
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      throw new Error('Table weekly_plan_tasks missing — run backend/sql/weekly_plan_tasks.sql in Supabase');
    }
    // Batch rejected — insert one-by-one so valid rows still land.
    if (/duplicate|unique|23505|dedupe/i.test(error.message || '')) {
      let inserted = 0;
      for (const row of rows) {
        const one = await supabase.from('weekly_plan_tasks').insert(row);
        if (!one.error) inserted += 1;
        else if (!/duplicate|unique|23505/i.test(one.error.message || '')) {
          throw one.error;
        }
      }
      await insertWeeklyPlanSheetRows(eaRow, sourceFile, uniqueTasks);
      return { inserted, deduped: parsedTasks.length - uniqueTasks.length };
    }
    throw error;
  }

  const flat = await insertWeeklyPlanSheetRows(eaRow, sourceFile, uniqueTasks);
  return {
    inserted: rows.length,
    flat_inserted: flat.inserted,
    deduped: parsedTasks.length - uniqueTasks.length,
  };
}

/**
 * Prefer client-parsed tasks; else download Excel from storage.
 */
async function ingestWeeklyPlanFromEaRow(eaRow, clientParsed = null) {
  if (!eaRow?.id) return { ok: false, reason: 'no_ea_row' };

  const details = [];
  let total = 0;

  if (Array.isArray(clientParsed) && clientParsed.length) {
    for (const src of clientParsed) {
      const key = src.source_file || src.key || 'attachment_1';
      const tasks = Array.isArray(src.tasks) ? src.tasks : [];
      try {
        const saved = await replacePlanTasksForSource(eaRow, key, tasks);
        total += saved.inserted;
        details.push({ source: key, inserted: saved.inserted, via: 'client' });
      } catch (err) {
        details.push({ source: key, error: err.message, via: 'client' });
      }
    }
    // Replace only the submitted source. Attachment previews ingest independently;
    // deleting other source keys here made attachment_1 and attachment_2 erase each other.
    const failed = details.some((d) => d.error);
    return { ok: !failed && total >= 0, inserted: total, details, eaId: eaRow.id };
  }

  const sources = [];
  if (eaRow.attachment_1_url) {
    sources.push({ key: 'attachment_1', url: eaRow.attachment_1_url, name: eaRow.attachment_1_name });
  }
  if (eaRow.attachment_2_url) {
    sources.push({ key: 'attachment_2', url: eaRow.attachment_2_url, name: eaRow.attachment_2_name });
  }
  if (!sources.length) return { ok: false, reason: 'no_attachments', details, inserted: total };

  for (const src of sources) {
    try {
      const buf = await fetchFileBuffer(src.url);
      const { tasks, meta } = parseWeeklyPlanBuffer(buf);
      const saved = await replacePlanTasksForSource(eaRow, src.key, tasks);
      total += saved.inserted;
      details.push({ source: src.key, file: src.name, inserted: saved.inserted, meta, via: 'server' });
    } catch (err) {
      details.push({ source: src.key, file: src.name, error: err.message, via: 'server' });
    }
  }

  return { ok: total > 0, inserted: total, details, eaId: eaRow.id };
}

async function loadOpenWeeklyPlanTasksForUser(user, dayYmd = istYmd()) {
  const names = [...new Set(
    [user?.username, user?.user_name]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  )];
  const uid = user?.id != null ? String(user.id) : null;

  const runQuery = async (builder) => {
    const { data, error } = await builder;
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return [];
      throw error;
    }
    return (data || []).filter((t) => isOpenPlanStatus(t.status));
  };

  const base = () =>
    supabase
      .from('weekly_plan_tasks')
      .select('*')
      .neq('status', 'Completed')
      .neq('status', 'Cancelled')
      .eq('task_date', dayYmd)
      .order('sr_no', { ascending: true })
      .order('half', { ascending: true })
      .order('task_name', { ascending: true });

  if (uid) {
    const byId = await runQuery(base().eq('employee_id', uid));
    if (byId.length) return byId;
  }

  if (!names.length) return [];
  return runQuery(base().in('employee_username', names));
}

function formatWeeklyPlanListMessage({ fullName, dayYmd, tasks, intro }) {
  const label = dayLabel(dayYmd);
  const todayYmd = String(dayYmd || '').slice(0, 10);
  const todayTasks = (tasks || []).filter(
    (t) => String(t.task_date || '').slice(0, 10) === todayYmd
  );
  const lines = [
    intro || `Hi ${fullName || 'Team'},`,
    `📋 Weekly plan — ${label}`,
    todayTasks.length
      ? `Today's open tasks (${todayTasks.length}):`
      : 'No open weekly-plan tasks for today.',
  ];

  todayTasks.forEach((t, i) => {
    const time = t.time_slot ? ` · ${t.time_slot}` : '';
    const half = Number(t.half) === 1 ? ' · 1H' : Number(t.half) === 2 ? ' · 2H' : '';
    lines.push(`${i + 1}. ${clip(t.task_name, 80)}${time}${half}`);
  });

  if (todayTasks.length) {
    lines.push('');
    lines.push('Reply with numbers to mark done, e.g. 1,3 or ALL');
    lines.push('Reply PLAN for this list again.');
  }
  return lines.join('\n');
}

/** Prefer free-form text; fall back to approved template outside 24h window. */
async function sendWeeklyPlanWhatsApp(toNumber, fullText, opts = {}) {
  const textResult = await sendWhatsAppText(toNumber, fullText);
  if (textResult.ok) return { ...textResult, via: 'text' };

  const tmpl = process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2';
  const fullName = opts.fullName || 'Team';
  const dayYmd = opts.dayYmd || istYmd();
  const count = opts.count != null ? opts.count : 0;
  const preview = clip(fullText.replace(/\n+/g, ' · '), 200);
  const tmplResult = await sendWhatsAppTemplate(toNumber, tmpl, [
    fullName,
    clip(`Weekly plan (${count}): ${preview}`, 200),
    'DIP Weekly Plan',
    dayYmd,
    'Open',
  ]);
  return {
    ok: !!tmplResult.ok,
    via: tmplResult.ok ? 'template' : 'failed',
    textError: textResult,
    template: tmplResult,
  };
}

async function sendWeeklyPlanDayList(toNumber, user, opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const tasks = opts.tasks || (await loadOpenWeeklyPlanTasksForUser(user, dayYmd));
  const fullName = opts.fullName || user?.full_name || user?.username || 'Team';

  if (!normalizeWhatsAppNumber(toNumber)) {
    return { ok: false, reason: 'no_whatsapp', count: tasks.length };
  }

  const body = formatWeeklyPlanListMessage({
    fullName,
    dayYmd,
    tasks,
    intro: opts.intro || `Hi ${fullName}, your weekly plan tasks:`,
  });

  if (!tasks.length && !opts.sayEmpty) {
    return { ok: true, count: 0, dayYmd, skipped: true };
  }

  const wa = await sendWeeklyPlanWhatsApp(toNumber, body, {
    fullName,
    dayYmd,
    count: tasks.length,
  });
  return { ...wa, count: tasks.length, dayYmd };
}

async function completeWeeklyPlanTasksByIndexes(user, indexes, opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const open = await loadOpenWeeklyPlanTasksForUser(user, dayYmd);
  const at = new Date().toISOString();
  let done = 0;
  const labels = [];

  for (const i of indexes) {
    const t = open[i];
    if (!t) continue;
    const { error } = await supabase
      .from('weekly_plan_tasks')
      .update({
        status: 'Completed',
        completed_at: at,
        completed_via: 'whatsapp',
        updated_at: at,
      })
      .eq('id', t.id);
    if (!error) {
      done += 1;
      labels.push(t.task_name);
    }
  }
  return { done, total: indexes.length, labels, remaining: await loadOpenWeeklyPlanTasksForUser(user, dayYmd) };
}

async function completeAllWeeklyPlanTasksForUser(user, opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const open = await loadOpenWeeklyPlanTasksForUser(user, dayYmd);
  const indexes = open.map((_, i) => i);
  return completeWeeklyPlanTasksByIndexes(user, indexes, { dayYmd });
}

async function processUploadedWeeklyPlan({ user, eaId, weekStart, clientParsed }) {
  const profileUser = user || {};
  const username = profileUser.username || profileUser.user_name;
  const eaRow = await loadEaRow(eaId, username, weekStart);
  if (!eaRow) return { ok: false, reason: 'ea_row_not_found' };

  if (!eaRow.employee_id && profileUser.id) {
    eaRow.employee_id = String(profileUser.id);
    await supabase
      .from('ea_meeting_attendance')
      .update({ employee_id: String(profileUser.id) })
      .eq('id', eaRow.id);
  }

  const ingest = await ingestWeeklyPlanFromEaRow(eaRow, clientParsed);
  const dayYmd = istYmd();

  const waUser = {
    id: eaRow.employee_id || profileUser.id,
    username: eaRow.employee_username || username,
    full_name: eaRow.employee_name || profileUser.full_name,
  };

  let open = await loadOpenWeeklyPlanTasksForUser(waUser, dayYmd);

  // If DB insert failed but client parsed tasks, still WhatsApp today's tasks from client data
  if (!open.length && Array.isArray(clientParsed)) {
    const fallback = [];
    for (const src of clientParsed) {
      for (const t of src.tasks || []) {
        if (t.status === 'Cancelled') continue;
        if (String(t.task_date || '').slice(0, 10) === dayYmd) {
          fallback.push({
            task_date: t.task_date,
            task_name: t.task_name,
            time_slot: t.time_slot,
            half: t.half,
            sr_no: t.sr_no,
            status: 'Pending',
          });
        }
      }
    }
    fallback.sort((a, b) => {
      const sa = Number(a.sr_no) || 0;
      const sb = Number(b.sr_no) || 0;
      if (sa !== sb) return sa - sb;
      return (Number(a.half) || 0) - (Number(b.half) || 0);
    });
    open = fallback;
  }

  let wa = { ok: false, reason: 'skipped' };
  const to = profileUser.whatsapp_number;
  if (normalizeWhatsAppNumber(to)) {
    wa = await sendWeeklyPlanDayList(to, waUser, {
      dayYmd,
      tasks: open,
      fullName: waUser.full_name,
      intro: `✅ Plan uploaded. Hi ${waUser.full_name || 'Team'}, today's weekly-plan tasks:`,
      sayEmpty: true,
    });
  } else {
    wa = { ok: false, reason: 'no_whatsapp' };
  }

  return {
    ok: true,
    ingest,
    whatsapp: wa,
    dayYmd,
    openCount: open.length,
    note: ingest.ok
      ? null
      : ingest.details?.map((d) => d.error).filter(Boolean).join('; ') || ingest.reason,
  };
}

async function runWeeklyPlanDayDigestCron() {
  const dayYmd = istYmd();
  const { data: openRows, error } = await supabase
    .from('weekly_plan_tasks')
    .select('employee_username, employee_id, employee_name')
    .neq('status', 'Completed')
    .neq('status', 'Cancelled')
    .eq('task_date', dayYmd);

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return { sent: 0, skipped: 0, note: 'Run weekly_plan_tasks.sql in Supabase.' };
    }
    throw error;
  }

  const byUser = new Map();
  for (const r of openRows || []) {
    const key = String(r.employee_username || r.employee_id || '').toLowerCase();
    if (!key) continue;
    if (!byUser.has(key)) byUser.set(key, r);
  }

  let sent = 0;
  let skipped = 0;
  const results = [];

  for (const row of byUser.values()) {
    let q = supabase
      .from('users')
      .select('id, username, full_name, whatsapp_number, role')
      .limit(1);
    if (row.employee_id) q = q.eq('id', row.employee_id);
    else q = q.eq('username', row.employee_username);

    const { data: user } = await q.maybeSingle();
    if (!user || !normalizeWhatsAppNumber(user.whatsapp_number)) {
      skipped += 1;
      results.push({ username: row.employee_username, ok: false, reason: 'no_user_or_whatsapp' });
      continue;
    }
    if (String(user.role || '').toLowerCase() === 'admin') {
      skipped += 1;
      continue;
    }

    const waUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name || row.employee_name,
    };
    const tasks = await loadOpenWeeklyPlanTasksForUser(waUser, dayYmd);
    if (!tasks.length) {
      skipped += 1;
      continue;
    }

    const res = await sendWeeklyPlanDayList(user.whatsapp_number, waUser, {
      dayYmd,
      tasks,
      intro: `Good morning ${waUser.full_name || 'Team'}, today's weekly-plan tasks:`,
    });
    if (res.ok) sent += 1;
    else skipped += 1;
    results.push({ username: user.username, ...res });
  }

  return { sent, skipped, dayYmd, results };
}

async function completeWeeklyPlanTaskById(taskId, via = 'portal') {
  if (!taskId) return { ok: false, reason: 'no_id' };
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from('weekly_plan_tasks')
    .update({
      status: 'Completed',
      completed_at: at,
      completed_via: via,
      updated_at: at,
    })
    .eq('id', taskId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'not_found' };

  // Keep flat sheet in sync when present.
  try {
    await supabase
      .from('weekly_plan_sheet')
      .update({
        status: 'Completed',
        completed_at: at,
        updated_at: at,
      })
      .eq('ea_attendance_id', data.ea_attendance_id)
      .eq('task_date', data.task_date)
      .eq('task', data.task_name)
      .eq('source_file', data.source_file);
  } catch {
    /* optional table */
  }

  return { ok: true, task: data };
}

async function loadWeeklyPlanTasksForEa(eaId, sourceFile = null) {
  if (!eaId) return [];
  let q = supabase
    .from('weekly_plan_tasks')
    .select('*')
    .eq('ea_attendance_id', eaId)
    .order('task_date', { ascending: true })
    .order('sr_no', { ascending: true })
    .order('task_name', { ascending: true });
  if (sourceFile) q = q.eq('source_file', sourceFile);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

async function reingestWeeklyPlanTasks(eaId, clientParsed) {
  const eaRow = await loadEaRow(eaId);
  if (!eaRow) return { ok: false, reason: 'ea_row_not_found' };
  return ingestWeeklyPlanFromEaRow(eaRow, clientParsed);
}

module.exports = {
  istYmd,
  ingestWeeklyPlanFromEaRow,
  reingestWeeklyPlanTasks,
  processUploadedWeeklyPlan,
  loadOpenWeeklyPlanTasksForUser,
  loadWeeklyPlanTasksForEa,
  sendWeeklyPlanDayList,
  completeWeeklyPlanTasksByIndexes,
  completeWeeklyPlanTaskById,
  completeAllWeeklyPlanTasksForUser,
  runWeeklyPlanDayDigestCron,
  formatWeeklyPlanListMessage,
  sendWeeklyPlanWhatsApp,
};
