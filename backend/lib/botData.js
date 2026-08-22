/**
 * DIP Bot — live answers from TaskFlow + site tables.
 */
const supabase = require('./supabaseClient');

function fmtDate(v) {
  if (!v) return '—';
  return String(v).slice(0, 10);
}

/** Local calendar date — same rule as Office overdue page (no UTC shift). */
function parseLocalDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isFinishedTask(t) {
  const st = String(t.status || '').trim().toLowerCase();
  const vs = String(t.verification_status || '').trim().toLowerCase();
  return (
    st === 'completed' ||
    st === 'rejected' ||
    vs === 'verified' ||
    vs === 'verification rejected'
  );
}

/** Matches Office Overdue: unfinished + due date passed. Rejected never counts. */
const {
  isDelegatedOverdue,
  isVerificationOverdue,
  isAssignmentOverdue,
  overdueSource,
  employeeWorkDueDate,
  VERIFICATION_SLA_MS,
} = require('./taskOverdue');

/** Prefer new rules; keep legacy name for callers. */
function isDelegatedOverdueTask(t, now = new Date()) {
  return isDelegatedOverdue(t, now);
}

function fmtTimeIst(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return String(iso).slice(11, 16);
  }
}

function matchPeople(users, ql) {
  const q = String(ql || '').toLowerCase();
  const scored = (users || [])
    .map((u) => {
      const fn = String(u.full_name || '').toLowerCase();
      const un = String(u.username || '').toLowerCase();
      let score = 0;
      if (fn && q.includes(fn)) score += 10;
      if (un && (q.includes(un) || q.includes(un.replace(/\./g, ' ')))) score += 8;
      const parts = fn.split(/[\s.]+/).filter((p) => p.length >= 3);
      const hits = parts.filter((p) => q.includes(p));
      score += hits.length * 3;
      return { u, score, hits: hits.length };
    })
    .filter((x) => x.score > 0);
  if (!scored.length) return [];
  const strong = scored.filter((x) => x.score >= 8);
  if (strong.length) return strong.map((x) => x.u);
  const maxHits = Math.max(...scored.map((x) => x.hits));
  if (maxHits >= 2) return scored.filter((x) => x.hits >= 2).map((x) => x.u);
  return scored.map((x) => x.u);
}

async function attendanceForPeople(people, days = 14) {
  if (!people.length) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const names = [...new Set(people.flatMap((p) => [p.username, p.full_name].filter(Boolean)))];
  const { data, error } = await supabase
    .from('attendance')
    .select('user_name, date, clock_in, clock_out, status, clock_in_status')
    .gte('date', sinceStr)
    .order('date', { ascending: false })
    .limit(200);
  if (error) throw error;
  const keys = names.map((n) => String(n).toLowerCase());
  return (data || []).filter((row) => {
    const un = String(row.user_name || '').toLowerCase();
    return keys.some(
      (k) =>
        un === k ||
        un.includes(k) ||
        k.includes(un) ||
        k.split(/\s+/).some((p) => p.length >= 4 && un.includes(p))
    );
  });
}

function formatClockAnswer(people, rows) {
  const blocks = people.map((p) => {
    const un = String(p.username || '').toLowerCase();
    const fn = String(p.full_name || '').toLowerCase();
    const mine = rows.filter((r) => {
      const n = String(r.user_name || '').toLowerCase();
      return n === un || n.includes(un) || (fn && n.includes(fn.split(/\s+/)[0]));
    });
    const latest = mine[0];
    if (!latest) {
      return `${p.full_name} (${p.username})\n  No clock-in found in the last 14 days.`;
    }
    const rest = mine
      .slice(0, 5)
      .map(
        (a) =>
          `  ${fmtDate(a.date)}  ${a.status || '—'}  in ${fmtTimeIst(a.clock_in)}  out ${fmtTimeIst(a.clock_out)}` +
          (a.clock_in_status ? `  (${a.clock_in_status})` : '')
      )
      .join('\n');
    return (
      `${p.full_name} (${p.username})\n` +
      `  Latest clock-in: ${fmtDate(latest.date)} at ${fmtTimeIst(latest.clock_in)}\n` +
      `  Clock-out: ${fmtTimeIst(latest.clock_out)}\n` +
      `Recent:\n${rest}`
    );
  });
  return `CLOCK-IN / CLOCK-OUT\nTimes are India (IST).\n\n${blocks.join('\n\n')}`;
}

function lines(arr, mapFn, empty) {
  if (!arr?.length) return empty || '  (none)';
  return arr.map(mapFn).join('\n');
}

async function taskStatsForUser(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, status, verification_status, target_date, description, priority, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(full_name)'
    )
    .eq('assigned_to', userId)
    .order('target_date', { ascending: true });
  if (error) throw error;
  const tasks = data || [];
  const now = new Date();
  const pending = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress');
  const overdue = tasks.filter((t) => isDelegatedOverdue(t, now));
  const pendingVerify = tasks.filter((t) => t.verification_status === 'Pending Verification');
  const completed = tasks.filter((t) => t.status === 'Completed' || t.verification_status === 'Verified');
  return { tasks, pending, overdue, pendingVerify, completed };
}

async function companyTaskSummary() {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, status, verification_status, target_date, assigned_to, description, priority, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(id, full_name, department), verifier:users!tasks_verifier_id_fkey(full_name)'
    );
  if (error) throw error;
  const tasks = data || [];
  const now = new Date();
  const open = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress');
  const overdue = tasks.filter((t) => isDelegatedOverdue(t, now));
  const pendingVerify = tasks.filter((t) => t.verification_status === 'Pending Verification');
  const byUser = {};
  const byProject = {};
  for (const t of tasks) {
    const name = t.assigned_to_user?.full_name || 'Unknown';
    if (!byUser[name]) byUser[name] = { total: 0, open: 0, done: 0, overdue: 0 };
    byUser[name].total += 1;
    if (t.status === 'Completed' || t.verification_status === 'Verified') byUser[name].done += 1;
    else if (t.status === 'Pending' || t.status === 'In Progress') {
      byUser[name].open += 1;
      if (isDelegatedOverdue(t, now)) byUser[name].overdue += 1;
    }
    const pn = t.project?.name || 'No project';
    if (!byProject[pn]) byProject[pn] = { open: 0, done: 0, overdue: 0 };
    if (t.status === 'Completed' || t.verification_status === 'Verified') byProject[pn].done += 1;
    else {
      byProject[pn].open += 1;
      if (isDelegatedOverdue(t, now)) byProject[pn].overdue += 1;
    }
  }
  return {
    total: tasks.length,
    open: open.length,
    overdue: overdue.length,
    pendingVerify: pendingVerify.length,
    byUser,
    byProject,
    overdueTasks: overdue
      .slice()
      .sort((a, b) => String(a.target_date || '').localeCompare(String(b.target_date || ''))),
    pendingVerifyTasks: pendingVerify.slice(0, 80),
  };
}

async function leaveSummary() {
  const { data, error } = await supabase
    .from('leaves')
    .select('id, status, from_date, to_date, reason, is_half_day, user:users!leaves_user_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) {
    if (String(error.message || '').includes('leaves')) return { pending: 0, rows: [], all: [] };
    throw error;
  }
  const all = data || [];
  const pending = all.filter((r) => r.status === 'Pending');
  return { pending: pending.length, rows: pending, all };
}

async function ticketSummary() {
  const { data, error } = await supabase
    .from('tickets')
    .select(
      'id, status, category, description, created_at, raised_by_user:users!tickets_raised_by_fkey(full_name), task:tasks(description, project:projects(name))'
    )
    .eq('status', 'Open')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    if (String(error.message || '').toLowerCase().includes('ticket')) return { open: 0, rows: [] };
    throw error;
  }
  return { open: (data || []).length, rows: data || [] };
}

function summarizeDprPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const bits = [];
  const mp = payload.manpower || payload.manpower_report || payload.mp;
  if (Array.isArray(mp) && mp.length) {
    const n = mp.reduce((s, r) => s + Number(r.nos || r.count || r.qty || 0), 0);
    bits.push(`manpower entries ${mp.length}${n ? `, qty ${n}` : ''}`);
  }
  const prog = payload.progress || payload.work_progress || payload.items;
  if (Array.isArray(prog) && prog.length) bits.push(`progress lines ${prog.length}`);
  if (payload.weather) bits.push(`weather ${payload.weather}`);
  if (payload.remarks || payload.remark) bits.push(`remarks: ${String(payload.remarks || payload.remark).slice(0, 80)}`);
  return bits.length ? ` (${bits.join('; ')})` : '';
}

async function sitePulse(ql) {
  const out = { attendance: [], dprs: [], wprs: [], manpowerNote: '' };
  const q = String(ql || '').toLowerCase();
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: att } = await supabase
      .from('attendance')
      .select('user_name, date, clock_in, clock_out, status, clock_in_status')
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(80);
    out.attendance = att || [];
  } catch (_) {}
  try {
    const { data: dprs } = await supabase
      .from('dpr_reports')
      .select('id, site, engineer, report_type, date, payload, created_at')
      .order('date', { ascending: false })
      .limit(20);
    out.dprs = dprs || [];
  } catch (_) {}
  try {
    const { data: wprs } = await supabase
      .from('wpr_reports')
      .select('id, site_name, engineer_name, report_date, report_number, created_at')
      .order('report_date', { ascending: false })
      .limit(20);
    out.wprs = wprs || [];
  } catch (_) {}
  if (q) {
    const hit = (text) => {
      const t = String(text || '').toLowerCase();
      if (!t) return false;
      if (q.includes(t)) return true;
      return t.length >= 4 && q.split(/\s+/).some((w) => w.length >= 4 && t.includes(w));
    };
    const fd = out.dprs.filter((d) => hit(d.site) || hit(d.engineer));
    const fw = out.wprs.filter((w) => hit(w.site_name) || hit(w.engineer_name));
    if (fd.length) out.dprs = fd;
    if (fw.length) out.wprs = fw;
  }
  return out;
}

function taskWhy(t) {
  const now = new Date();
  const due = t.target_date ? new Date(t.target_date) : null;
  const vs = String(t.verification_status || '');
  const st = String(t.status || '');
  const who = t.assigned_to_user?.full_name || 'the assignee';
  const ver = t.verifier?.full_name;
  if (vs === 'Verified' || st === 'Completed') {
    return `Done — ${who} finished it${ver ? `; verified by ${ver}` : ''}`;
  }
  if (vs === 'Pending Verification') {
    return `Waiting on verifier${ver ? ` ${ver}` : ''} — ${who} already sent it`;
  }
  if (vs === 'Verification Rejected') {
    return `Correction pending — verifier sent it back to ${who}`;
  }
  if (vs === 'Updation Required') {
    return `Updation pending — verifier asked ${who} to update it`;
  }
  if (due && due < now && st !== 'Completed') {
    return `Overdue — due ${fmtDate(t.target_date)} and still ${st || 'open'} for ${who}`;
  }
  if (st === 'Pending') return `Not started yet — still Pending with ${who}`;
  if (st === 'In Progress') return `In progress with ${who} — not sent for verification yet`;
  return `${st || 'Open'} — assigned to ${who}`;
}

function formatTaskBlock(t) {
  const who = t.assigned_to_user?.full_name ? `\n    Assigned: ${t.assigned_to_user.full_name}` : '';
  const ver = t.verifier?.full_name ? `\n    Verifier: ${t.verifier.full_name}` : '';
  const verify = t.verification_status ? ` | Verify: ${t.verification_status}` : '';
  const hours = t.hours_to_complete != null ? ` | Hours: ${t.hours_to_complete}` : '';
  const pri = t.priority ? ` | ${t.priority}` : '';
  return (
    `  • ${(t.description || 'Task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
    `    Project: ${t.project?.name || '—'}${who}${ver}\n` +
    `    Status: ${t.status || '—'}${verify}\n` +
    `    Due: ${fmtDate(t.target_date)}${hours}${pri}\n` +
    `    Why: ${taskWhy(t)}`
  );
}

/** One overdue task on two short lines — no repeated "Why" sentence. */
function formatOverdueBlock(t, { showAssignee = false } = {}) {
  const now = new Date();
  const source = overdueSource(t, now);
  const who = showAssignee && t.assigned_to_user?.full_name ? ` | ${t.assigned_to_user.full_name}` : '';
  const vs = String(t.verification_status || '');
  const state =
    vs === 'Pending Verification' || vs === 'Verification Rejected' || vs === 'Updation Required'
      ? vs
      : t.status || 'Open';

  if (source === 'verification' && isVerificationOverdue(t, now)) {
    const started = new Date(t.verification_started_at);
    const hrsPast = Math.max(0, Math.floor((now - started) / 3600000) - 2);
    const verifier = t.verifier?.full_name || 'Verifier';
    return (
      `  • ${(t.description || 'Task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
      `    Verify overdue: ${hrsPast}h past 2h limit | with ${verifier} | ${state}${who}`
    );
  }

  const workDue = employeeWorkDueDate(t);
  if (workDue && isAssignmentOverdue(t, now)) {
    const hrsLate = Math.max(0, Math.floor((now - workDue) / 3600000));
    return (
      `  • ${(t.description || 'Task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
      `    Work overdue: ${hrsLate}h late (accepted + ${t.hours_to_complete}h) | ${state} | ${t.project?.name || 'No project'}${who}`
    );
  }

  const due = parseLocalDate(t.target_date);
  const days = due ? Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000)) : 0;
  const late = days > 0 ? `${days} day${days === 1 ? '' : 's'} late` : 'due today';
  return (
    `  • ${(t.description || 'Task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
    `    Due: ${fmtDate(t.target_date)} (${late}) | ${state} | ${t.project?.name || 'No project'}${who}`
  );
}

function groupPersonTasks(rows) {
  const now = new Date();
  const groups = {
    overdue: [],
    waiting: [],
    correction: [],
    notStarted: [],
    inProgress: [],
    rejected: [],
    done: [],
  };
  for (const t of rows) {
    const vs = String(t.verification_status || '');
    const st = String(t.status || '');
    if (vs === 'Verified' || st === 'Completed') groups.done.push(t);
    else if (st === 'Rejected') groups.rejected.push(t);
    else if (vs === 'Verification Rejected' || vs === 'Updation Required') groups.correction.push(t);
    else if (isDelegatedOverdue(t, now)) groups.overdue.push(t);
    else if (vs === 'Pending Verification') groups.waiting.push(t);
    else if (st === 'Pending') groups.notStarted.push(t);
    else groups.inProgress.push(t);
  }
  return groups;
}

function formatPersonOverdue(tasks, people, recRows = []) {
  const names = (people || []).map((p) => p.full_name).filter(Boolean).join(', ') || 'this person';
  const overdue = (tasks || []).filter((t) => isDelegatedOverdue(t));
  const rec = recRows || [];
  const total = overdue.length + rec.length;
  if (!total) return `OVERDUE — ${names}\n  No overdue tasks.`;
  return [
    `OVERDUE — ${names} (${total})`,
    overdue.length ? overdue.map(formatOverdueBlock).join('\n') : '',
    rec.length ? `RECURRING OVERDUE (${rec.length})\n${formatRecurringOverdue(rec)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatPersonWhy(tasks, people, intents = {}) {
  const names = (people || []).map((p) => p.full_name).filter(Boolean).join(', ') || 'this person';
  const rows = tasks || [];
  if (!rows.length) return `TASKS — ${names}\n  (none on record)`;
  const groups = groupPersonTasks(rows);
  const section = (title, list, fmt = formatTaskBlock) =>
    list.length ? `${title} (${list.length})\n${list.map(fmt).join('\n')}` : '';
  if (intents.overdue && !intents.verify && !intents.company) {
    return formatPersonOverdue(rows, people);
  }
  if (intents.verify && !intents.overdue && !intents.company) {
    return [
      `PENDING VERIFICATION — ${names} (${groups.waiting.length})`,
      groups.waiting.length ? groups.waiting.map(formatTaskBlock).join('\n') : '  (none)',
    ].join('\n');
  }
  const openCount =
    groups.overdue.length +
    groups.waiting.length +
    groups.correction.length +
    groups.notStarted.length +
    groups.inProgress.length;
  // Name-only / "X tasks" → counts + overdue + verify. Full dump only if they asked.
  if (!intents.company && !intents.full) {
    return [
      `TASKS — ${names}`,
      `Open ${openCount} · Overdue ${groups.overdue.length} · Verify ${groups.waiting.length}`,
      section('OVERDUE', groups.overdue, formatOverdueBlock),
      groups.waiting.length ? section('WAITING ON VERIFIER', groups.waiting) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return [
    `TASKS — ${names}`,
    `Open ${openCount} · Overdue ${groups.overdue.length} · Verify ${groups.waiting.length}`,
    section('OVERDUE', groups.overdue, formatOverdueBlock),
    section('WAITING ON VERIFIER', groups.waiting),
    section('CORRECTION / UPDATION', groups.correction),
    section('NOT STARTED', groups.notStarted),
    section('IN PROGRESS', groups.inProgress),
    intents.company ? section('COMPLETED', groups.done) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function shouldFireOn(task, date) {
  const start = new Date(String(task.start_date).slice(0, 10) + 'T00:00:00');
  const end = task.end_date ? new Date(String(task.end_date).slice(0, 10) + 'T00:00:00') : null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d < start) return false;
  if (end && d > end) return false;
  const freq = task.frequency;
  if (freq === 'Daily') return true;
  if (freq === 'Weekly') {
    const days = String(task.frequency_days || '')
      .split(',')
      .map(Number);
    return days.includes(date.getDay());
  }
  if (freq === 'Monthly') return date.getDate() === start.getDate();
  if (freq === 'Yearly') return date.getDate() === start.getDate() && date.getMonth() === start.getMonth();
  return false;
}

function fireDatesBeforeToday(task) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(String(task.start_date).slice(0, 10) + 'T00:00:00');
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 30);
  if (cursor < start) cursor = new Date(start);
  while (cursor < today) {
    if (shouldFireOn(task, cursor)) dates.push(ymdLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function overdueRecurring(assignedTo) {
  const today = ymdLocal(new Date());
  let tq = supabase
    .from('recurring_tasks')
    .select(
      `id, description, is_active, assigned_to, frequency, frequency_days, start_date, end_date,
       project:projects(name),
       assigned_to_user:users!recurring_tasks_assigned_to_fkey(full_name)`
    )
    .eq('is_active', true);
  if (assignedTo) tq = tq.eq('assigned_to', assignedTo);
  const { data: tasks, error: te } = await tq;
  if (te) {
    console.warn('recurring overdue tasks:', te.message);
    return [];
  }
  const list = tasks || [];
  if (!list.length) return [];
  const ids = list.map((t) => t.id);
  const { data: inst, error } = await supabase
    .from('recurring_task_instances')
    .select('due_date, status, recurring_task_id')
    .in('recurring_task_id', ids)
    .lt('due_date', today)
    .limit(800);
  if (error) {
    console.warn('recurring overdue instances:', error.message);
    return [];
  }
  const closed = new Set(['Completed', 'NotApplicable']);
  const taskMap = Object.fromEntries(list.map((t) => [t.id, t]));
  const seen = new Set();
  const rows = [];
  for (const r of inst || []) {
    if (closed.has(r.status)) continue;
    const key = `${r.recurring_task_id}|${String(r.due_date).slice(0, 10)}`;
    seen.add(key);
    rows.push({ due_date: r.due_date, status: r.status || 'Pending', task: taskMap[r.recurring_task_id] });
  }
  for (const t of list) {
    for (const ds of fireDatesBeforeToday(t)) {
      const key = `${t.id}|${ds}`;
      if (seen.has(key)) continue;
      const existing = (inst || []).find(
        (i) => i.recurring_task_id === t.id && String(i.due_date).slice(0, 10) === ds
      );
      if (existing && closed.has(existing.status)) continue;
      seen.add(key);
      rows.push({ due_date: ds, status: 'Pending', task: t });
    }
  }
  rows.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  return rows;
}

function formatRecurringOverdue(rows) {
  if (!rows.length) return '  (none)';
  return rows
    .slice(0, 80)
    .map((r) => {
      const t = r.task || {};
      return (
        `  • ${(t.description || 'Recurring task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
        `    Assigned: ${t.assigned_to_user?.full_name || '—'}\n` +
        `    Project: ${t.project?.name || '—'}\n` +
        `    Due: ${fmtDate(r.due_date)} | Status: ${r.status || 'Pending'} | Recurring`
      );
    })
    .join('\n');
}

const MONTH_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function parseMonthsFromQuestion(ql) {
  const yearHit = ql.match(/\b(20\d{2})\b/);
  const year = yearHit ? Number(yearHit[1]) : new Date().getFullYear();
  const months = [];
  for (const [name, idx] of Object.entries(MONTH_INDEX)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(ql)) months.push(idx);
  }
  return [...new Set(months)].sort((a, b) => a - b).map((month) => ({ year, month }));
}

async function attendanceInRange(people, fromStr, toStr) {
  if (!people.length) return [];
  const { data, error } = await supabase
    .from('attendance')
    .select('user_name, date, clock_in, clock_out, status, clock_in_status')
    .gte('date', fromStr)
    .lte('date', toStr)
    .order('date', { ascending: true })
    .limit(2000);
  if (error) throw error;
  const keys = [...new Set(people.flatMap((p) => [p.username, p.full_name].filter(Boolean)))].map((n) =>
    String(n).toLowerCase()
  );
  return (data || []).filter((row) => {
    const un = String(row.user_name || '').toLowerCase();
    return keys.some(
      (k) =>
        un === k ||
        un.includes(k) ||
        k.includes(un) ||
        k.split(/\s+/).some((p) => p.length >= 4 && un.includes(p))
    );
  });
}

function rowsForPerson(person, rows) {
  const un = String(person.username || '').toLowerCase();
  const fn = String(person.full_name || '').toLowerCase();
  const first = fn.split(/\s+/)[0];
  return rows.filter((r) => {
    const n = String(r.user_name || '').toLowerCase();
    return n === un || (un && n.includes(un)) || (fn && n.includes(fn)) || (first && first.length >= 4 && n.includes(first));
  });
}

function formatPersonAttendance(person, rows, heading) {
  if (!rows.length) {
    return `${person.full_name} (${person.username})\n  No attendance rows in ${heading}.`;
  }
  const present = rows.filter((r) => /present|ok|on.?time|late/i.test(String(r.status || ''))).length;
  const body = rows
    .map(
      (a) =>
        `  ${fmtDate(a.date)}  |  ${a.status || '—'}  |  in ${fmtTimeIst(a.clock_in)}  |  out ${fmtTimeIst(a.clock_out)}` +
        (a.clock_in_status ? `  |  ${a.clock_in_status}` : '')
    )
    .join('\n');
  return (
    `${person.full_name} (${person.username})\n` +
    `  Period: ${heading}\n` +
    `  Days recorded: ${rows.length}  |  Present-like: ${present}\n` +
    `  Times are India (IST).\n${body}`
  );
}

function attendanceHtmlReport(person, rows, heading) {
  const tr = rows
    .map(
      (a) =>
        `<tr><td>${fmtDate(a.date)}</td><td>${a.status || '—'}</td><td>${fmtTimeIst(a.clock_in)}</td><td>${fmtTimeIst(a.clock_out)}</td><td>${a.clock_in_status || '—'}</td></tr>`
    )
    .join('');
  const safe = String(person.full_name || 'Employee').replace(/</g, '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safe} — ${heading}</title>
<style>
  body{font-family:'Segoe UI',Calibri,sans-serif;color:#111827;padding:28px;max-width:820px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}
  p{color:#4b5563;margin:0 0 16px;font-size:13px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th{background:#F3F4F6;text-align:left}
  th,td{border:1px solid #E5E7EB;padding:7px 9px}
</style></head><body>
<h1>${safe}</h1>
<p>${heading} · ${rows.length} day(s) · times in IST · DIP Projects attendance</p>
<p><button onclick="window.print()">Print / Save as PDF</button></p>
<table><thead><tr><th>Date</th><th>Status</th><th>Clock in</th><th>Clock out</th><th>Note</th></tr></thead>
<tbody>${tr || '<tr><td colspan="5">No rows</td></tr>'}</tbody></table>
</body></html>`;
}

function formatSitePulse(s) {
  const attLines = lines(
    s.attendance.slice(0, 12),
    (a) =>
      `  • ${a.user_name || '—'} | ${fmtDate(a.date)} | ${a.status || '—'} | in ${fmtTimeIst(a.clock_in)} out ${fmtTimeIst(a.clock_out)}`,
    '  (no attendance in last 7 days)'
  );
  const dprLines = lines(
    s.dprs,
    (d) =>
      `  • ${fmtDate(d.date)} | ${d.site || '—'} | ${d.engineer || '—'} | ${d.report_type || 'DPR'}${summarizeDprPayload(d.payload)}`,
    '  (no DPR reports)'
  );
  const wprLines = lines(
    s.wprs,
    (w) =>
      `  • ${fmtDate(w.report_date)} | ${w.site_name || '—'} | ${w.engineer_name || '—'} | #${w.report_number || '—'}`,
    '  (no WPR reports)'
  );
  return (
    `SITE ATTENDANCE (last 30 days sample)\n${attLines}\n\n` +
    `DPR (recent)\n${dprLines}\n\n` +
    `WPR (recent)\n${wprLines}`
  );
}

const STOP_WORDS = new Set(
  'the a an and or of to for in on at is are was were what who whose which kitne kya ka ki ke mei me mei hai hain ho kaun kisko unka unki uska uski please show list give batao bataiye mujhe meri mere'.split(
    ' '
  )
);

function questionWords(ql) {
  return String(ql || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function personHit(text, people) {
  const t = String(text || '').toLowerCase();
  return (people || []).some((p) => {
    const fn = String(p.full_name || '').toLowerCase();
    const un = String(p.username || '').toLowerCase();
    const first = fn.split(/\s+/)[0];
    return (fn && t.includes(fn)) || (un && t.includes(un)) || (first && first.length >= 4 && t.includes(first));
  });
}

async function recurringActiveList(assignedTo) {
  let q = supabase
    .from('recurring_tasks')
    .select(
      `id, description, frequency, frequency_days, start_date, end_date, is_active, priority,
       project:projects(name),
       assigned_to_user:users!recurring_tasks_assigned_to_fkey(full_name)`
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(80);
  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  const { data, error } = await q;
  if (error) {
    console.warn('recurring list:', error.message);
    return [];
  }
  return data || [];
}

function formatRecurringActive(rows) {
  if (!rows.length) return '  (none)';
  return rows
    .slice(0, 40)
    .map((t) => {
      const days = t.frequency_days ? ` (${t.frequency_days})` : '';
      return (
        `  • ${(t.description || 'Recurring task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
        `    Assigned: ${t.assigned_to_user?.full_name || '—'}\n` +
        `    Project: ${t.project?.name || '—'}\n` +
        `    ${t.frequency || '—'}${days} | ${fmtDate(t.start_date)} → ${fmtDate(t.end_date)} | ${t.priority || ''}`
      );
    })
    .join('\n');
}

async function siteLeaveFacts(people) {
  try {
    const { data, error } = await supabase
      .from('site_leaves')
      .select('user_name, name, leave_type, from_date, to_date, reason, site_name, status')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return [];
    let rows = data || [];
    if (people?.length) {
      const filtered = rows.filter((r) => personHit(`${r.user_name} ${r.name}`, people));
      if (filtered.length) rows = filtered;
    }
    return rows;
  } catch (_) {
    return [];
  }
}

async function meetingFacts(ql, people) {
  const selFull =
    'id, title, started_at, status, mom_body, live_transcript, project:projects(name), starter:users!meeting_moms_started_by_fkey(full_name)';
  const selBasic =
    'id, title, started_at, status, mom_body, project:projects(name), starter:users!meeting_moms_started_by_fkey(full_name)';
  let { data, error } = await supabase
    .from('meeting_moms')
    .select(selFull)
    .order('started_at', { ascending: false })
    .limit(25);
  if (error && /live_transcript/i.test(String(error.message || ''))) {
    const retry = await supabase.from('meeting_moms').select(selBasic).order('started_at', { ascending: false }).limit(25);
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    console.warn('MoM facts:', error.message);
    return [];
  }
  const rows = data || [];
  const words = questionWords(ql);
  const scored = rows.map((m) => {
    const blob = `${m.title || ''} ${m.mom_body || ''} ${m.live_transcript || ''} ${m.project?.name || ''} ${m.starter?.full_name || ''}`.toLowerCase();
    let score = 0;
    if (personHit(blob, people)) score += 6;
    for (const w of words) {
      if (['meeting', 'minutes', 'mom', 'call', 'video', 'baat'].includes(w)) continue;
      if (blob.includes(w)) score += 2;
    }
    return { m, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const picked = (hits.length ? hits : scored).slice(0, 8).map((x) => x.m);
  return picked;
}

function formatMomBlock(m) {
  const spoken = String(m.live_transcript || '')
    .trim()
    .slice(0, 2200);
  const body = String(m.mom_body || '')
    .trim()
    .slice(0, 2200);
  return (
    `  • ${m.title || 'Meeting'} | ${fmtDate(m.started_at)} | ${m.status || 'draft'}\n` +
    `    Project: ${m.project?.name || '—'} | Started by: ${m.starter?.full_name || '—'}\n` +
    (body ? `    MINUTES:\n${body.split('\n').map((l) => `      ${l}`).join('\n')}\n` : '    MINUTES: (empty)\n') +
    (spoken ? `    SPOKEN ON CALL:\n${spoken.split('\n').map((l) => `      ${l}`).join('\n')}` : '    SPOKEN ON CALL: (none captured)')
  );
}

async function tasksForPeople(people) {
  if (!people.length) return [];
  const ids = people.map((p) => p.id).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, status, verification_status, target_date, description, priority, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(full_name), verifier:users!tasks_verifier_id_fkey(full_name)'
    )
    .in('assigned_to', ids)
    .in('status', ['Pending', 'In Progress'])
    .order('target_date', { ascending: true })
    .limit(1000);
  if (error) return [];
  return data || [];
}

async function searchTasks(ql, people) {
  const words = questionWords(ql).filter(
    (w) =>
      !['task', 'tasks', 'overdue', 'pending', 'leave', 'leaves', 'meeting', 'minutes', 'site', 'clock', 'attendance', 'verify', 'verification', 'recurring', 'ticket', 'company', 'summary'].includes(
        w
      )
  );
  if (!words.length && !people.length) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, status, verification_status, target_date, description, priority, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(full_name), verifier:users!tasks_verifier_id_fkey(full_name)'
    )
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) return [];
  return (data || []).filter((t) => {
    const blob = `${t.description || ''} ${t.project?.name || ''} ${t.assigned_to_user?.full_name || ''}`.toLowerCase();
    const byPerson = people.length ? personHit(blob, people) : true;
    const byWord = words.length ? words.some((w) => blob.includes(w)) : true;
    return byPerson && byWord;
  }).slice(0, 25);
}

function formatLeaveRows(rows, empty) {
  return lines(
    rows,
    (r) =>
      `  • ${r.user?.full_name || r.name || r.user_name || '—'}: ${fmtDate(r.from_date)} → ${fmtDate(r.to_date)} | ${r.status || '—'}` +
      (r.is_half_day ? ' | half day' : '') +
      (r.leave_type ? ` | ${r.leave_type}` : '') +
      (r.site_name ? ` | site ${r.site_name}` : '') +
      (r.reason ? ` | ${String(r.reason).slice(0, 80)}` : ''),
    empty
  );
}

function capFacts(text, max = 14000) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n(Facts truncated — ask a narrower question for the rest.)`;
}

async function answerFromFacts(question, facts, name) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You are DIP Bot. Answer ONLY from Facts. Use this exact shape:\nHEADING IN ALL CAPS\n• item title\n    Label: value\nNo greetings, no advice, no extra sections. If Facts do not have it, say it is not in TaskFlow. Do not invent data. Match the question language.',
        },
        {
          role: 'user',
          content: `Question: ${question}\nAsked by: ${name || ''}\n\nFacts:\n${facts}\n\nReply with only the answer to that question:`,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI error');
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function gatherAdminFacts({ ql, people, intents }) {
  const wantAll = intents.company && !people.length;
  const jobs = [];
  if (wantAll || intents.tasks || intents.overdue || intents.verify || people.length) {
    jobs.push(companyTaskSummary().then((c) => ({ c })).catch(() => ({ c: null })));
  }
  if (wantAll || intents.overdue || intents.recurring) {
    jobs.push(overdueRecurring().then((recOverdue) => ({ recOverdue })).catch(() => ({ recOverdue: [] })));
    if (intents.recurring && !intents.overdue) {
      jobs.push(recurringActiveList().then((recActive) => ({ recActive })).catch(() => ({ recActive: [] })));
    }
  }
  if (wantAll || intents.leave) {
    jobs.push(leaveSummary().then((leaves) => ({ leaves })).catch(() => ({ leaves: { pending: 0, rows: [], all: [] } })));
    jobs.push(siteLeaveFacts(people).then((siteLeaves) => ({ siteLeaves })).catch(() => ({ siteLeaves: [] })));
  }
  if (wantAll || intents.site || intents.clock) {
    jobs.push(sitePulse(ql).then((site) => ({ site })).catch(() => ({ site: null })));
  }
  if (wantAll || intents.mom) {
    jobs.push(meetingFacts(ql, people).then((moms) => ({ moms })).catch(() => ({ moms: [] })));
  }
  if (wantAll || intents.ticket) {
    jobs.push(ticketSummary().then((tickets) => ({ tickets })).catch(() => ({ tickets: { open: 0, rows: [] } })));
  }
  if (people.length) {
    jobs.push(tasksForPeople(people).then((personTasks) => ({ personTasks })).catch(() => ({ personTasks: [] })));
  }
  if (!people.length && (intents.tasks || !intents.specific)) {
    jobs.push(searchTasks(ql, people).then((hits) => ({ hits })).catch(() => ({ hits: [] })));
  }
  const parts = await Promise.all(jobs);
  return Object.assign({}, ...parts);
}

function formatAdminFacts(pack, people, intents) {
  const bits = [];
  const named = people.length > 0;
  const c = pack.c;
  if (named && pack.personTasks) {
    bits.push(formatPersonWhy(pack.personTasks, people, intents));
    if (intents.leave && pack.leaves) {
      const src = (pack.leaves.all || []).filter((r) => personHit(r.user?.full_name, people));
      bits.push(`LEAVE\n${formatLeaveRows(src.slice(0, 15), '  (none)')}`);
    }
    return bits.filter(Boolean).join('\n\n');
  }
  if (!intents.specific && !named) {
    return (
      'HOW TO ASK\n' +
      '  • overdue of Charmy\n' +
      '  • Charmy leave\n' +
      '  • company summary\n' +
      '  • open tickets\n' +
      '  • attendance of a name'
    );
  }
  if (c) {
    if (intents.company) {
      bits.push(
        `TASK COUNTS\nDelegated total ${c.total} | open ${c.open} | overdue ${c.overdue} | pending verification ${c.pendingVerify}`
      );
    }
    if (intents.overdue) {
      bits.push(
        `DELEGATED OVERDUE (${c.overdue || 0})\n` +
          (c.overdueTasks?.length
            ? c.overdueTasks
                .slice(0, 40)
                .map((t) => formatOverdueBlock(t, { showAssignee: true }))
                .join('\n')
            : '  (none)')
      );
    }
    if (intents.verify) {
      bits.push(
        `PENDING VERIFICATION (${c.pendingVerify || 0})\n` +
          (c.pendingVerifyTasks?.length
            ? c.pendingVerifyTasks.slice(0, 30).map(formatTaskBlock).join('\n')
            : '  (none)')
      );
    }
    if (intents.company && !intents.overdue) {
      const peopleLines = Object.entries(c.byUser || {})
        .sort((a, b) => b[1].open - a[1].open)
        .slice(0, 25)
        .map(([name, v]) => `  • ${name}: open ${v.open} | done ${v.done} | overdue ${v.overdue} | total ${v.total}`)
        .join('\n');
      const projectLines = Object.entries(c.byProject || {})
        .sort((a, b) => b[1].open - a[1].open)
        .slice(0, 20)
        .map(([name, v]) => `  • ${name}: open ${v.open} | done ${v.done} | overdue ${v.overdue}`)
        .join('\n');
      bits.push(`BY EMPLOYEE\n${peopleLines || '  (none)'}`);
      bits.push(`BY PROJECT\n${projectLines || '  (none)'}`);
    }
  }
  if (pack.recOverdue && (intents.overdue || intents.recurring)) {
    bits.push(`RECURRING OVERDUE\n${formatRecurringOverdue(pack.recOverdue)}`);
  }
  if (pack.recActive && intents.recurring && !intents.overdue) {
    bits.push(`ACTIVE RECURRING TASKS\n${formatRecurringActive(pack.recActive)}`);
  }
  if (pack.leaves && intents.leave) {
    const src = people.length
      ? (pack.leaves.all || []).filter((r) => personHit(r.user?.full_name, people))
      : pack.leaves.all || pack.leaves.rows || [];
    bits.push(
      `OFFICE LEAVES\nPending: ${pack.leaves.pending}\n` +
        formatLeaveRows(src.slice(0, 25), '  (none)')
    );
  }
  if (pack.siteLeaves?.length && intents.leave) {
    bits.push(`SITE LEAVES\n${formatLeaveRows(pack.siteLeaves.slice(0, 20), '  (none)')}`);
  }
  if (pack.site && (intents.site || intents.clock)) bits.push(formatSitePulse(pack.site));
  if (pack.moms?.length && intents.mom) {
    bits.push(`MEETINGS / MoM\n${pack.moms.map(formatMomBlock).join('\n\n')}`);
  } else if (intents.mom) {
    bits.push('MEETINGS / MoM\n  (no minutes stored yet)');
  }
  if (pack.tickets && intents.ticket) {
    bits.push(
      `OPEN TICKETS: ${pack.tickets.open}\n` +
        lines(
          pack.tickets.rows || [],
          (t) =>
            `  • ${t.category || '—'} | ${t.raised_by_user?.full_name || '—'} | ${(t.description || '').replace(/\s+/g, ' ').slice(0, 80)}` +
            (t.task?.project?.name ? ` | ${t.task.project.name}` : ''),
          '  (none)'
        )
    );
  }
  if (pack.hits?.length && !named && intents.tasks && !intents.overdue && !intents.company) {
    bits.push(`MATCHING TASKS\n${pack.hits.map(formatTaskBlock).join('\n')}`);
  }
  return bits.filter(Boolean).join('\n\n');
}

async function answerQuestion({ question, user, isAdmin }) {
  const q = String(question || '').trim();
  const ql = q.toLowerCase();
  let adminOnly = false;
  let answer = '';
  let skipPolish = false;
  let useAnswerModel = false;
  const downloads = [];

  const wantsClock =
    /clok|clock|clicok|punch|attendance|haziri|in[\s-]*time|out[\s-]*time|clockin|clock-in/i.test(ql);
  const wantsDpr = /\bdpr\b/i.test(ql);
  const wantsWpr = /\bwpr\b/i.test(ql);
  const wantsAttendance = /\battendance\b|haziri/i.test(ql);
  const wantsSite =
    wantsClock ||
    wantsDpr ||
    wantsWpr ||
    wantsAttendance ||
    /\b(manpower|site report|labour|labor|site)\b/i.test(ql);
  // Typo-tolerant: overdue / overue / ovedue / overdu / over due, plus Hinglish.
  const wantsOverdue =
    /over\s*-?\s*d?ue|ove?rdu|overue|ovedue|\blate\b|\bdelay|\bpending se\b|time nikal|due ho gaya|due nikal/i.test(
      ql
    );
  const wantsVerify = /verif|verifier|check kar/i.test(ql);
  const wantsLeave = /\bleave\b|chutti|chhutti|chhuti|chhutiya|on leave|kitni leave/i.test(ql);
  const wantsRecurring = /recurr|rozana|rojana|daily task|weekly task|checkpoint/i.test(ql);
  const wantsMom = /\bmom\b|minutes|meeting|video call|\bcall\b|baat hui|charcha|discussed|discussion/i.test(ql);
  const wantsTicket = /\bticket\b|complaint|shikayat/i.test(ql);
  const wantsFull = /\ball tasks\b|sab task|poori list|full list|correction|updation|not started/i.test(ql);
  const wantsTasks =
    /\b(task|tasks|pending|assign|my work|kaam)\b/i.test(ql) ||
    wantsOverdue ||
    wantsVerify ||
    wantsRecurring ||
    wantsFull;

  let directory = [];
  if (isAdmin) {
    const { data: users } = await supabase
      .from('users')
      .select('id, username, full_name')
      .eq('is_active', true);
    directory = users || [];
  }
  const people = matchPeople(directory, ql);
  const monthsWanted = parseMonthsFromQuestion(ql);

  const wantsCompany =
    !people.length &&
    (/\b(company|overall|everyone|summary|mis report|team summary)\b/i.test(ql) ||
      (/\b(sab|all|total|kitne)\b/i.test(ql) &&
        !wantsOverdue &&
        !wantsLeave &&
        !wantsTicket &&
        !wantsMom &&
        !wantsSite));

  const intents = {
    clock: wantsClock,
    site: wantsSite,
    overdue: wantsOverdue,
    verify: wantsVerify,
    leave: wantsLeave,
    recurring: wantsRecurring,
    mom: wantsMom,
    ticket: wantsTicket,
    tasks: wantsTasks,
    full: wantsFull,
    company: wantsCompany,
    specific:
      wantsOverdue ||
      wantsVerify ||
      wantsLeave ||
      wantsRecurring ||
      wantsMom ||
      wantsSite ||
      wantsTicket ||
      wantsTasks ||
      wantsCompany ||
      people.length > 0,
  };

  const namedAttendance =
    isAdmin &&
    people.length &&
    (wantsClock || wantsAttendance || (monthsWanted.length && !wantsTasks && !wantsMom && !wantsLeave));

  if (namedAttendance) {
    adminOnly = true;
    skipPolish = true;
    if (monthsWanted.length) {
      const heading = monthsWanted
        .map((m) => new Date(m.year, m.month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }))
        .join(' + ');
      let rows = [];
      const fromStr = ymdLocal(new Date(monthsWanted[0].year, monthsWanted[0].month, 1));
      const last = monthsWanted[monthsWanted.length - 1];
      const toStr = ymdLocal(new Date(last.year, last.month + 1, 0));
      for (const m of monthsWanted) {
        const from = ymdLocal(new Date(m.year, m.month, 1));
        const to = ymdLocal(new Date(m.year, m.month + 1, 0));
        rows = rows.concat(await attendanceInRange(people, from, to));
      }
      answer =
        `ATTENDANCE REPORT\nPeriod: ${heading}  (${fromStr} → ${toStr})\nTimes are India (IST).\nOne professional report per person — use the download buttons (open → Print → Save as PDF).\n\n` +
        people.map((p) => formatPersonAttendance(p, rowsForPerson(p, rows), heading)).join('\n\n');
      people.forEach((p) => {
        const mine = rowsForPerson(p, rows);
        const slug = String(p.full_name || p.username || 'person').replace(/[^a-zA-Z0-9]+/g, '-');
        downloads.push({
          filename: `attendance-${slug}-${fromStr}-to-${toStr}.html`,
          label: `${p.full_name} — ${heading}`,
          html: attendanceHtmlReport(p, mine, heading),
        });
      });
    } else {
      const rows = await attendanceForPeople(people);
      answer = formatClockAnswer(people, rows);
    }
  } else if (isAdmin && people.length && wantsOverdue && !wantsMom && !wantsLeave) {
    // "overdue of <name>" — answer only that person, never the company dump.
    adminOnly = true;
    skipPolish = true;
    const personTasks = await tasksForPeople(people);
    let rec = [];
    for (const p of people) {
      rec = rec.concat(await overdueRecurring(p.id));
    }
    answer = formatPersonOverdue(personTasks, people, rec);
  } else if (wantsOverdue && !wantsMom && !wantsLeave && !wantsSite && !wantsVerify) {
    skipPolish = true;
    if (isAdmin) {
      adminOnly = true;
      const c = await companyTaskSummary();
      const rec = await overdueRecurring();
      answer =
        `OVERDUE\n` +
        `Delegated: ${c.overdue}   Recurring: ${rec.length}\n\n` +
        `DELEGATED\n` +
        (c.overdueTasks.length
          ? c.overdueTasks.map((t) => formatOverdueBlock(t, { showAssignee: true })).join('\n')
          : '  (none)') +
        `\n\nRECURRING\n` +
        formatRecurringOverdue(rec);
    } else {
      const s = await taskStatsForUser(user.id);
      const rec = await overdueRecurring(user.id);
      answer =
        `YOUR OVERDUE\n` +
        `Delegated overdue: ${s.overdue.length}   Recurring overdue: ${rec.length}\n\n` +
        (s.overdue.length ? `DELEGATED\n` + s.overdue.map(formatOverdueBlock).join('\n') : 'No delegated overdue.') +
        `\n\nRECURRING\n` +
        formatRecurringOverdue(rec);
    }
  } else if (isAdmin) {
    adminOnly = true;
    skipPolish = true;
    useAnswerModel = false;
    const pack = await gatherAdminFacts({ ql, people, intents });
    answer = formatAdminFacts(pack, people, intents) || 'No matching TaskFlow rows for that question.';
  } else if (wantsSite) {
    answer = 'Site attendance, DPR and WPR company view is admin-only. Use the site portal for your own clock-in, DPR and WPR.';
  } else if (wantsLeave) {
    answer = 'Use Apply Leave / My Leave in the sidebar for your leave.';
  } else if (wantsTasks || wantsVerify) {
    skipPolish = true;
    const s = await taskStatsForUser(user.id);
    const rec = await overdueRecurring(user.id);
    if (wantsVerify) {
      answer =
        `YOUR VERIFICATION\nPending: ${s.pendingVerify.length}\n` +
        (s.pendingVerify.length ? s.pendingVerify.slice(0, 12).map(formatTaskBlock).join('\n') : '  (none)');
    } else {
      answer =
        `YOUR TASKS\nOpen: ${s.pending.length}   Overdue: ${s.overdue.length}   Recurring overdue: ${rec.length}\n\n` +
        (s.pending.length ? `OPEN\n` + s.pending.slice(0, 12).map(formatTaskBlock).join('\n') : 'No open tasks.');
    }
  } else {
    answer = 'Ask about your overdue or open tasks.';
  }

  if (process.env.OPENAI_API_KEY && useAnswerModel && answer) {
    try {
      const replied = await answerFromFacts(q, capFacts(answer), user.full_name);
      if (replied) answer = replied;
    } catch (e) {
      console.warn('OpenAI answer skip:', e.message);
    }
  } else if (process.env.OPENAI_API_KEY && !skipPolish) {
    try {
      const polished = await polishWithOpenAI(q, answer, user.full_name);
      if (polished) answer = polished;
    } catch (e) {
      console.warn('OpenAI polish skip:', e.message);
    }
  }

  return { answer, adminOnly, askedAt: new Date().toISOString(), downloads };
}

async function polishWithOpenAI(question, facts, name) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.15,
      messages: [
        {
          role: 'system',
          content:
            'You are DIP Bot. Rewrite Facts neatly for the asked question only. Same names, dates, times and counts. Keep ALL-CAPS headings and "• " bullets. Do not add extra sections, advice, or greetings. Do not invent data.',
        },
        {
          role: 'user',
          content: `Question: ${question}\nAsked by: ${name || ''}\n\nFacts:\n${facts}\n\nRewrite only the answer:`,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI error');
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function listOverdueTasksForWa() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, description, target_date, priority, status, verification_status, assigned_to, project:projects(name), assignee:users!tasks_assigned_to_fkey(id, full_name, whatsapp_number)'
    )
    .in('status', ['Pending', 'In Progress'])
    .lt('target_date', nowIso);
  if (error) throw error;
  return (data || []).filter((t) => !isFinishedTask(t));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = {
  answerQuestion,
  taskStatsForUser,
  companyTaskSummary,
  listOverdueTasksForWa,
  startOfToday,
};
