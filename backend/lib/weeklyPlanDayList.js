/**
 * Weekly-plan WhatsApp day lists (from weekly_plan_tasks).
 *
 * On Excel upload: send today's tasks (sr-numbered) immediately.
 * Each later day: today's tasks + pending tasks from earlier days in the same week.
 *
 * Reply: PLAN / WP / WLIST → resend list
 * Reply: PLAN 1 or PLAN 1,3 → mark those open items Completed
 */

const supabase = require('./supabaseClient');
const {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  normalizeWhatsAppNumber,
} = require('./whatsapp');
const { istYmd, dayLabel, isAdminUser } = require('./taskListDigest');

/** Avoid duplicate day-list WA to same user on same IST day (upload + cron). */
const sentToday = new Map(); // key: username|ymd → ts

function alreadySentToday(username, dayYmd) {
  const key = `${String(username || '').toLowerCase()}|${dayYmd}`;
  return sentToday.has(key);
}

function markSentToday(username, dayYmd) {
  const key = `${String(username || '').toLowerCase()}|${dayYmd}`;
  sentToday.set(key, Date.now());
  // prune old
  if (sentToday.size > 500) {
    const cutoff = Date.now() - 36 * 60 * 60 * 1000;
    for (const [k, ts] of sentToday) {
      if (ts < cutoff) sentToday.delete(k);
    }
  }
}

const OPEN_STATUSES = new Set(['Pending', 'In Progress', 'On Hold', '']);

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function isOpenWeeklyStatus(status) {
  const s = String(status || 'Pending').trim();
  if (s === 'Completed' || s === 'Cancelled' || s === 'Rejected') return false;
  return OPEN_STATUSES.has(s) || !s;
}

function ymdOf(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Monday (IST) of the week containing ymd (YYYY-MM-DD). */
function weekStartMonday(ymd) {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shortDay(ymd) {
  try {
    return new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return ymd;
  }
}

function sortPlanTasks(a, b) {
  const da = ymdOf(a.task_date) || '';
  const db = ymdOf(b.task_date) || '';
  if (da !== db) return da.localeCompare(db);
  const sa = Number(a.sr_no);
  const sb = Number(b.sr_no);
  if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
  const ha = Number(a.half) || 0;
  const hb = Number(b.half) || 0;
  if (ha !== hb) return ha - hb;
  return String(a.task_name || '').localeCompare(String(b.task_name || ''));
}

/**
 * Load week rows for one employee username.
 * Bundle: today (all non-cancelled) + prior open (pending carryover).
 */
async function loadWeeklyPlanDayBundle(employeeUsername, dayYmd = istYmd()) {
  const username = String(employeeUsername || '').trim();
  if (!username) {
    return { dayYmd, weekStart: null, today: [], priorPending: [], openOrdered: [], error: 'no_username' };
  }

  const weekStart = weekStartMonday(dayYmd);

  let { data, error } = await supabase
    .from('weekly_plan_tasks')
    .select(
      'id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name'
    )
    .ilike('employee_username', username)
    .gte('task_date', weekStart)
    .lte('task_date', dayYmd)
    .order('task_date', { ascending: true })
    .order('sr_no', { ascending: true });

  if (error) {
    // Fallback without ilike if needed
    if (/ilike|operator/i.test(error.message || '')) {
      const retry = await supabase
        .from('weekly_plan_tasks')
        .select(
          'id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name'
        )
        .eq('employee_username', username)
        .gte('task_date', weekStart)
        .lte('task_date', dayYmd)
        .order('task_date', { ascending: true });
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return {
        dayYmd,
        weekStart,
        today: [],
        priorPending: [],
        openOrdered: [],
        error: 'missing_table',
        note: 'Run weekly_plan_tasks.sql in Supabase.',
      };
    }
    throw error;
  }

  const rows = (data || [])
    .filter((r) => String(r.employee_username || '').trim().toLowerCase() === username.toLowerCase())
    .sort(sortPlanTasks);

  const today = rows.filter((r) => ymdOf(r.task_date) === dayYmd && String(r.status || '') !== 'Cancelled');
  const priorPending = rows.filter((r) => {
    const d = ymdOf(r.task_date);
    return d && d < dayYmd && isOpenWeeklyStatus(r.status);
  });

  // Numbered open list: today's open first, then prior-day pending (oldest→newest)
  const openOrdered = [
    ...today.filter((t) => isOpenWeeklyStatus(t.status)),
    ...priorPending.filter((t) => isOpenWeeklyStatus(t.status)),
  ];

  return {
    dayYmd,
    weekStart,
    today,
    priorPending,
    openOrdered,
    employeeName: rows[0]?.employee_name || null,
  };
}

function formatTaskLine(task, index) {
  const sr = Number.isFinite(Number(task.sr_no)) ? `Sr ${task.sr_no}` : null;
  const half =
    Number(task.half) === 1 ? '1st half' : Number(task.half) === 2 ? '2nd half' : null;
  const slot = String(task.time_slot || '').trim();
  const bits = [sr, half, slot].filter(Boolean);
  const meta = bits.length ? ` (${bits.join(' · ')})` : '';
  const done = !isOpenWeeklyStatus(task.status) ? ' ✓' : '';
  return `${index}. ${clip(task.task_name || 'Task', 90)}${meta}${done}`;
}

function formatWeeklyPlanMessage(bundle, opts = {}) {
  const fullName = opts.fullName || bundle.employeeName || 'Team member';
  const dayYmd = bundle.dayYmd || istYmd();
  const label = dayLabel(dayYmd);
  const lines = [];
  lines.push(`📋 Weekly plan — ${label}`);
  lines.push(`Hi ${clip(fullName, 40)},`);
  lines.push('');

  const todayOpen = (bundle.today || []).filter((t) => isOpenWeeklyStatus(t.status));
  const todayDone = (bundle.today || []).filter((t) => !isOpenWeeklyStatus(t.status));
  const prior = bundle.priorPending || [];

  if (!todayOpen.length && !todayDone.length && !prior.length) {
    lines.push('No weekly-plan tasks for today (and no pending from earlier this week).');
    lines.push('');
    lines.push('Reply PLAN anytime to refresh.');
    return lines.join('\n');
  }

  // Build a single numbered open list: prior then today (user asked today + pending earlier —
  // we show Today section first in text, but numbering stays on openOrdered for replies).
  const open = bundle.openOrdered || [];
  const idToNum = new Map(open.map((t, i) => [t.id, i + 1]));

  lines.push(`Today (${shortDay(dayYmd)}):`);
  if (!bundle.today?.length) {
    lines.push('  (none)');
  } else {
    for (const t of bundle.today) {
      if (isOpenWeeklyStatus(t.status)) {
        const n = idToNum.get(t.id);
        lines.push(`  ${formatTaskLine(t, n)}`);
      } else {
        lines.push(`  ✓ ${clip(t.task_name || 'Task', 90)}`);
      }
    }
  }

  if (prior.length) {
    lines.push('');
    lines.push('Pending from earlier days:');
    for (const t of prior) {
      const n = idToNum.get(t.id);
      const when = shortDay(ymdOf(t.task_date) || '');
      lines.push(`  ${n}. [${when}] ${clip(t.task_name || 'Task', 80)}`);
    }
  }

  lines.push('');
  if (open.length) {
    lines.push(`Open: ${open.length}. Reply PLAN 1 or PLAN 1,3 to mark done.`);
  } else {
    lines.push('All caught up for this list ✅');
  }
  lines.push('Reply PLAN to see this list again.');

  return lines.join('\n').slice(0, 4000);
}

async function findUserByUsername(username) {
  const u = String(username || '').trim();
  if (!u) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number, role, is_active')
    .ilike('username', u)
    .maybeSingle();
  if (error && !/ilike/i.test(error.message || '')) {
    console.warn('weeklyPlan user lookup:', error.message);
  }
  if (data) return data;
  const { data: all } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number, role, is_active')
    .neq('is_active', false);
  return (
    (all || []).find((row) => String(row.username || '').trim().toLowerCase() === u.toLowerCase()) ||
    null
  );
}

/**
 * Send day list WhatsApp for one employee username.
 */
async function sendWeeklyPlanDayList(employeeUsername, opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const user =
    opts.user ||
    (await findUserByUsername(employeeUsername));

  if (user && isAdminUser(user)) {
    return { ok: false, reason: 'admin_skipped', dayYmd };
  }

  const toNumber = opts.toNumber || user?.whatsapp_number;
  if (!normalizeWhatsAppNumber(toNumber)) {
    return { ok: false, reason: 'no_whatsapp', dayYmd };
  }

  if (!opts.force && alreadySentToday(employeeUsername, dayYmd)) {
    return { ok: true, skipped: 'already_sent_today', dayYmd, via: 'deduped' };
  }

  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd);
  if (bundle.error === 'missing_table') {
    return { ok: false, reason: 'missing_table', note: bundle.note, dayYmd };
  }

  const openCount = (bundle.openOrdered || []).length;
  if (!openCount && !(bundle.today || []).length && !opts.sayEmpty) {
    return { ok: true, skipped: 'empty', openCount: 0, dayYmd, via: 'none' };
  }

  const fullName = opts.fullName || user?.full_name || bundle.employeeName || employeeUsername;
  const text = formatWeeklyPlanMessage(bundle, { fullName });
  const textResult = await sendWhatsAppText(toNumber, text);
  if (textResult?.ok) {
    markSentToday(employeeUsername, dayYmd);
    return {
      ok: true,
      via: 'text',
      openCount,
      todayCount: (bundle.today || []).length,
      priorPendingCount: (bundle.priorPending || []).length,
      dayYmd,
      dayLabel: dayLabel(dayYmd),
    };
  }

  // Outside 24h session window — template fallback
  const tmpl = process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2';
  const preview = (bundle.openOrdered || [])
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${clip(t.task_name, 40)}`)
    .join('; ');
  const tmplResult = await sendWhatsAppTemplate(toNumber, tmpl, [
    fullName,
    clip(
      `${dayLabel(dayYmd)}: ${openCount} open weekly-plan task(s)${preview ? `: ${preview}` : ''}. Reply PLAN.`,
      200
    ),
    'Weekly Plan',
    dayYmd,
    'Pending',
  ]);
  if (tmplResult?.ok) {
    markSentToday(employeeUsername, dayYmd);
  }
  return {
    ok: !!tmplResult?.ok,
    via: tmplResult?.ok ? 'template_fallback' : 'failed',
    openCount,
    todayCount: (bundle.today || []).length,
    priorPendingCount: (bundle.priorPending || []).length,
    dayYmd,
    dayLabel: dayLabel(dayYmd),
    reason: tmplResult?.ok ? undefined : textResult?.reason || tmplResult?.reason || 'send_failed',
    textError: textResult,
    templateError: tmplResult?.ok ? null : tmplResult,
  };
}

async function completeWeeklyPlanTask(taskId, via = 'whatsapp') {
  const now = new Date().toISOString();
  const patch = {
    status: 'Completed',
    completed_at: now,
    completed_via: via,
    updated_at: now,
  };
  let { data, error } = await supabase
    .from('weekly_plan_tasks')
    .update(patch)
    .eq('id', taskId)
    .select('id, task_name, status')
    .maybeSingle();

  if (error && /completed_at|completed_via/i.test(error.message || '')) {
    const retry = await supabase
      .from('weekly_plan_tasks')
      .update({ status: 'Completed', updated_at: now })
      .eq('id', taskId)
      .select('id, task_name, status')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) return { ok: false, reason: error.message };
  return { ok: true, task: data };
}

async function completeWeeklyPlanByIndexes(employeeUsername, indexes, dayYmd = istYmd()) {
  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd);
  const open = bundle.openOrdered || [];
  let done = 0;
  let lastName = '';
  for (const i of indexes) {
    const t = open[i];
    if (!t) continue;
    const r = await completeWeeklyPlanTask(t.id);
    if (r.ok) {
      done += 1;
      lastName = t.task_name || lastName;
    }
  }
  const refreshed = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd);
  return { done, total: indexes.length, lastName, bundle: refreshed };
}

/**
 * Parse PLAN / WP replies.
 * PLAN | WP | WLIST → list
 * PLAN 1 | WP 1,3 | P1 → indexes
 */
function parseWeeklyPlanReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  if (/^(PLAN|WP|WLIST|WPLAN|WEEKLY)$/i.test(upper)) {
    return { list: true };
  }

  // PLAN 1 / WP 1,3 / P 1 2
  const m = upper.match(/^(?:PLAN|WP|WPLAN|P)\s+(.+)$/i);
  if (!m) return null;
  const rest = m[1].trim();
  if (/^(ALL|DONE\s*ALL)$/i.test(rest)) return { all: true };

  const parts = rest.split(/[\s,]+/).filter(Boolean);
  const idxs = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 1) return null;
    idxs.push(n - 1);
  }
  if (!idxs.length) return null;
  return { indexes: [...new Set(idxs)] };
}

/**
 * After EA Excel upload: ingest already done separately — just WA the employee.
 * Also used when notify receives clientParsed (ingest first in route).
 */
async function notifyWeeklyPlanAfterUpload({ username, user, toNumber, fullName, dayYmd } = {}) {
  const who = username || user?.username;
  if (!who) return { ok: false, reason: 'no_username' };
  return sendWeeklyPlanDayList(who, {
    user,
    toNumber,
    fullName,
    dayYmd: dayYmd || istYmd(),
    sayEmpty: true,
  });
}

/**
 * Daily cron: each employee with weekly_plan rows this week gets today + prior pending.
 */
async function runWeeklyPlanDayListCron(opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const weekStart = weekStartMonday(dayYmd);

  const { data, error } = await supabase
    .from('weekly_plan_tasks')
    .select('employee_username, employee_name, task_date, status')
    .gte('task_date', weekStart)
    .lte('task_date', dayYmd);

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return { sent: 0, skipped: 0, disabled: false, note: 'weekly_plan_tasks missing', dayYmd };
    }
    throw error;
  }

  const byUser = new Map();
  for (const row of data || []) {
    const u = String(row.employee_username || '').trim();
    if (!u) continue;
    const key = u.toLowerCase();
    if (!byUser.has(key)) byUser.set(key, { username: u, name: row.employee_name });
  }

  const results = [];
  let sent = 0;
  let skipped = 0;

  for (const { username, name } of byUser.values()) {
    const user = await findUserByUsername(username);
    if (user && isAdminUser(user)) {
      skipped += 1;
      results.push({ username, ok: false, reason: 'admin_skipped' });
      continue;
    }
    const bundle = await loadWeeklyPlanDayBundle(username, dayYmd);
    const hasWork =
      (bundle.openOrdered || []).length > 0 || (bundle.today || []).length > 0;
    if (!hasWork) {
      skipped += 1;
      results.push({ username, ok: true, skipped: 'empty' });
      continue;
    }
    const result = await sendWeeklyPlanDayList(username, {
      user,
      fullName: user?.full_name || name || username,
      dayYmd,
      sayEmpty: false,
    });
    if (result.ok && !result.skipped) sent += 1;
    else skipped += 1;
    results.push({ username, ...result });
  }

  return { sent, skipped, dayYmd, weekStart, results };
}

module.exports = {
  istYmd,
  dayLabel,
  weekStartMonday,
  isOpenWeeklyStatus,
  loadWeeklyPlanDayBundle,
  formatWeeklyPlanMessage,
  sendWeeklyPlanDayList,
  notifyWeeklyPlanAfterUpload,
  completeWeeklyPlanTask,
  completeWeeklyPlanByIndexes,
  parseWeeklyPlanReply,
  runWeeklyPlanDayListCron,
  findUserByUsername,
};
