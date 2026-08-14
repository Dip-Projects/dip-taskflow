/**
 * DIP Bot — live answers from TaskFlow + site tables.
 */
const supabase = require('./supabaseClient');

function fmtDate(v) {
  if (!v) return '—';
  return String(v).slice(0, 10);
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
      const parts = fn.split(/[\s.]+/).filter((p) => p.length >= 4);
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
  const overdue = pending.filter((t) => t.target_date && new Date(t.target_date) < now);
  const pendingVerify = tasks.filter((t) => t.verification_status === 'Pending Verification');
  const completed = tasks.filter((t) => t.status === 'Completed' || t.verification_status === 'Verified');
  return { tasks, pending, overdue, pendingVerify, completed };
}

async function companyTaskSummary() {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, status, verification_status, target_date, assigned_to, description, priority, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(id, full_name, department)'
    );
  if (error) throw error;
  const tasks = data || [];
  const now = new Date();
  const open = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress');
  const overdue = open.filter((t) => t.target_date && new Date(t.target_date) < now);
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
      if (t.target_date && new Date(t.target_date) < now) byUser[name].overdue += 1;
    }
    const pn = t.project?.name || 'No project';
    if (!byProject[pn]) byProject[pn] = { open: 0, done: 0, overdue: 0 };
    if (t.status === 'Completed' || t.verification_status === 'Verified') byProject[pn].done += 1;
    else {
      byProject[pn].open += 1;
      if (t.target_date && new Date(t.target_date) < now) byProject[pn].overdue += 1;
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
  };
}

async function leaveSummary() {
  const { data, error } = await supabase
    .from('leaves')
    .select('id, status, from_date, to_date, user:users!leaves_user_id_fkey(full_name)')
    .eq('status', 'Pending');
  if (error) {
    if (String(error.message || '').includes('leaves')) return { pending: 0, rows: [] };
    throw error;
  }
  return { pending: (data || []).length, rows: data || [] };
}

async function ticketSummary() {
  const { data, error } = await supabase.from('tickets').select('id, status, category').eq('status', 'Open');
  if (error) {
    if (String(error.message || '').toLowerCase().includes('ticket')) return { open: 0 };
    throw error;
  }
  return { open: (data || []).length };
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

async function sitePulse() {
  const out = { attendance: [], dprs: [], wprs: [], manpowerNote: '' };
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const { data: att } = await supabase
      .from('attendance')
      .select('user_name, date, clock_in, clock_out, status, clock_in_status')
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(25);
    out.attendance = att || [];
  } catch (_) {}
  try {
    const { data: dprs } = await supabase
      .from('dpr_reports')
      .select('id, site, engineer, report_type, date, payload, created_at')
      .order('date', { ascending: false })
      .limit(8);
    out.dprs = dprs || [];
  } catch (_) {}
  try {
    const { data: wprs } = await supabase
      .from('wpr_reports')
      .select('id, site_name, engineer_name, report_date, report_number, created_at')
      .order('report_date', { ascending: false })
      .limit(8);
    out.wprs = wprs || [];
  } catch (_) {}
  return out;
}

function formatTaskBlock(t) {
  const who = t.assigned_to_user?.full_name ? `\n    Assigned: ${t.assigned_to_user.full_name}` : '';
  const verify = t.verification_status ? ` | Verify: ${t.verification_status}` : '';
  const hours = t.hours_to_complete != null ? ` | Hours: ${t.hours_to_complete}` : '';
  const pri = t.priority ? ` | ${t.priority}` : '';
  return (
    `  • ${(t.description || 'Task').replace(/\s+/g, ' ').slice(0, 90)}\n` +
    `    Project: ${t.project?.name || '—'}${who}\n` +
    `    Status: ${t.status || '—'}${verify}\n` +
    `    Due: ${fmtDate(t.target_date)}${hours}${pri}`
  );
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
    `SITE ATTENDANCE (last 7 days)\n${attLines}\n\n` +
    `DPR (recent)\n${dprLines}\n\n` +
    `WPR (recent)\n${wprLines}`
  );
}

async function answerQuestion({ question, user, isAdmin }) {
  const q = String(question || '').trim();
  const ql = q.toLowerCase();
  let adminOnly = false;
  let answer = '';
  let skipPolish = false;
  const downloads = [];

  const wantsClock =
    /clok|clock|clicok|punch|attendance|in[\s-]*time|out[\s-]*time|clockin|clock-in/i.test(ql);
  const wantsDpr = /\bdpr\b/i.test(ql);
  const wantsWpr = /\bwpr\b/i.test(ql);
  const wantsAttendance = /\battendance\b/i.test(ql) && !wantsClock;
  const wantsSiteDump = /\b(manpower|site report|labour|labor)\b/i.test(ql);
  const wantsSite = wantsClock || wantsDpr || wantsWpr || wantsAttendance || wantsSiteDump;
  const wantsTasks =
    /\b(task|overdue|verify|verification|pending|due|assign|my work)\b/i.test(ql);
  const wantsCompany =
    /\b(company|sab|all|overall|team|kitne|everyone|total|mis|summary|status)\b/i.test(ql);

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

  if (isAdmin && people.length && (wantsClock || wantsAttendance || (monthsWanted.length && !wantsTasks) || (/\btime\b/.test(ql) && !wantsTasks))) {
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
  } else if (isAdmin && people.length && (wantsDpr || wantsWpr) && !wantsClock) {
    adminOnly = true;
    const s = await sitePulse();
    const nameBits = people.flatMap((p) =>
      [p.full_name, p.username, ...(String(p.full_name || '').split(/\s+/))]
        .filter((x) => String(x || '').length >= 4)
        .map((x) => String(x).toLowerCase())
    );
    const hit = (text) => {
      const t = String(text || '').toLowerCase();
      return nameBits.some((n) => t.includes(n));
    };
    const dprs = (s.dprs || []).filter((d) => hit(d.engineer) || hit(d.site));
    const wprs = (s.wprs || []).filter((w) => hit(w.engineer_name) || hit(w.site_name));
    answer =
      (wantsDpr ? `DPR\n${lines(dprs, (d) => `  • ${fmtDate(d.date)} | ${d.site || '—'} | ${d.engineer || '—'} | ${d.report_type || 'DPR'}${summarizeDprPayload(d.payload)}`, '  (none for this person)')}\n\n` : '') +
      (wantsWpr ? `WPR\n${lines(wprs, (w) => `  • ${fmtDate(w.report_date)} | ${w.site_name || '—'} | ${w.engineer_name || '—'} | #${w.report_number || '—'}`, '  (none for this person)')}` : '');
  } else if (wantsSite && isAdmin) {
    adminOnly = true;
    const s = await sitePulse();
    if (wantsClock || wantsAttendance) {
      answer =
        `CLOCK-IN / ATTENDANCE (last 7 days, IST)\n` +
        lines(
          s.attendance.slice(0, 20),
          (a) =>
            `  • ${a.user_name || '—'} | ${fmtDate(a.date)} | in ${fmtTimeIst(a.clock_in)} | out ${fmtTimeIst(a.clock_out)}`,
          '  (no attendance in last 7 days)'
        );
    } else if (wantsDpr && !wantsWpr) {
      answer = `DPR (recent)\n${lines(s.dprs, (d) => `  • ${fmtDate(d.date)} | ${d.site || '—'} | ${d.engineer || '—'} | ${d.report_type || 'DPR'}${summarizeDprPayload(d.payload)}`, '  (no DPR)')}`;
    } else if (wantsWpr && !wantsDpr) {
      answer = `WPR (recent)\n${lines(s.wprs, (w) => `  • ${fmtDate(w.report_date)} | ${w.site_name || '—'} | ${w.engineer_name || '—'} | #${w.report_number || '—'}`, '  (no WPR)')}`;
    } else {
      answer = `DIP site snapshot\n\n${formatSitePulse(s)}`;
    }
  } else if (wantsSite && !isAdmin) {
    answer =
      'Site attendance, DPR and WPR company view is available only on admin DIP Bot.\n' +
      'Open the site portal for your own clock-in, DPR and WPR.';
  } else if (/\b(overdue|late|delay)\b/i.test(ql)) {
    skipPolish = true;
    if (isAdmin) {
      adminOnly = true;
      const c = await companyTaskSummary();
      const rec = await overdueRecurring();
      const recCount = rec.length;
      answer =
        `OVERDUE LIST\n` +
        `Delegated tasks overdue: ${c.overdue}\n` +
        `Recurring instances overdue: ${recCount}\n` +
        `Open (not overdue-only): ${c.open}   Pending verification: ${c.pendingVerify}\n\n` +
        `DELEGATED OVERDUE\n` +
        (c.overdueTasks.length ? c.overdueTasks.map(formatTaskBlock).join('\n') : '  (none)') +
        `\n\nRECURRING OVERDUE\n` +
        formatRecurringOverdue(rec);
    } else {
      const s = await taskStatsForUser(user.id);
      const rec = await overdueRecurring(user.id);
      answer =
        `YOUR OVERDUE\n` +
        `Delegated overdue: ${s.overdue.length}   Recurring overdue: ${rec.length}\n\n` +
        (s.overdue.length ? `DELEGATED\n` + s.overdue.map(formatTaskBlock).join('\n') : 'No delegated overdue.') +
        `\n\nRECURRING\n` +
        formatRecurringOverdue(rec);
    }
  } else if (/verif/i.test(ql) && wantsTasks) {
    const s = await taskStatsForUser(user.id);
    answer =
      `YOUR VERIFICATION QUEUE: ${s.pendingVerify.length}\n` +
      (s.pendingVerify.length ? s.pendingVerify.slice(0, 20).map(formatTaskBlock).join('\n') : 'None pending.');
  } else if (/leave/i.test(ql) && isAdmin) {
    adminOnly = true;
    const L = await leaveSummary();
    answer =
      `Pending leaves: ${L.pending}\n` +
      lines(L.rows.slice(0, 12), (r) => `  • ${r.user?.full_name || '—'}: ${fmtDate(r.from_date)} → ${fmtDate(r.to_date)}`);
  } else if (/ticket/i.test(ql) && isAdmin) {
    adminOnly = true;
    const T = await ticketSummary();
    answer = `Open tickets: ${T.open}`;
  } else if (isAdmin && (wantsCompany || /project|performance|kisne|who/i.test(ql))) {
    adminOnly = true;
    skipPolish = true;
    const c = await companyTaskSummary();
    const rec = await overdueRecurring();
    const people = Object.entries(c.byUser)
      .sort((a, b) => b[1].open - a[1].open)
      .slice(0, 20)
      .map(([name, v]) => `  • ${name}: open ${v.open} | done ${v.done} | overdue ${v.overdue} | total ${v.total}`)
      .join('\n');
    const projects = Object.entries(c.byProject)
      .sort((a, b) => b[1].open - a[1].open)
      .slice(0, 15)
      .map(([name, v]) => `  • ${name}: open ${v.open} | done ${v.done} | overdue ${v.overdue}`)
      .join('\n');
    answer =
      `DIP COMPANY SNAPSHOT\n` +
      `Tasks total ${c.total} | open ${c.open} | overdue ${c.overdue} | recurring overdue ${rec.length} | verify ${c.pendingVerify}\n\n` +
      `BY EMPLOYEE\n${people || '  (none)'}\n\n` +
      `BY PROJECT\n${projects || '  (none)'}`;
  } else if (/my task|mera|mere|mine|pending|task/i.test(ql) || !isAdmin) {
    const s = await taskStatsForUser(user.id);
    answer =
      `Hi ${user.full_name || ''}\n\n` +
      `Open: ${s.pending.length}   Overdue: ${s.overdue.length}\n` +
      `Pending verification: ${s.pendingVerify.length}   Done: ${s.completed.length}\n\n` +
      (s.pending.length ? `OPEN TASKS\n` + s.pending.slice(0, 12).map(formatTaskBlock).join('\n') : 'No open tasks.') +
      `\n\nAsk: overdue | verification | (admin) clock-in for a person | DPR | company`;
  } else if (isAdmin) {
    adminOnly = true;
    skipPolish = true;
    const c = await companyTaskSummary();
    const rec = await overdueRecurring();
    const L = await leaveSummary();
    const T = await ticketSummary();
    answer =
      `LIVE DIP DATABASE\n` +
      `Delegated tasks: ${c.total}  |  open ${c.open}  |  overdue ${c.overdue}  |  verify ${c.pendingVerify}\n` +
      `Recurring overdue instances: ${rec.length}\n` +
      `Pending leaves: ${L.pending}  |  Open tickets: ${T.open}\n\n` +
      `Ask anything from this data. Examples:\n` +
      `• overdue tasks\n` +
      `• Roshan Patel and Harshil June and July attendance\n` +
      `• company summary\n` +
      `• DPR for SMJV`;
  } else {
    const s = await taskStatsForUser(user.id);
    answer = `Open tasks: ${s.pending.length}. Type "overdue" or "my tasks" for the list.`;
  }

  if (process.env.OPENAI_API_KEY && !skipPolish) {
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
            'You are DIP Bot. Reply in clear English. Keep Facts unchanged — every name, date, time and count. Keep the SECTION HEADINGS and "• " bullet lines. Do not invent data. Do not add extra sections. Do not turn lists into a single paragraph.',
        },
        {
          role: 'user',
          content: `User ${name || ''} asked: ${question}\n\nFacts:\n${facts}\n\nRewrite neatly, same facts:`,
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
      'id, description, target_date, priority, assigned_to, project:projects(name), assignee:users!tasks_assigned_to_fkey(id, full_name, whatsapp_number)'
    )
    .in('status', ['Pending', 'In Progress'])
    .lt('target_date', nowIso);
  if (error) throw error;
  return data || [];
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
