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
      'id, status, verification_status, target_date, description, priority, hours_to_complete, project:projects(name)'
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
      'id, status, verification_status, target_date, assigned_to, description, hours_to_complete, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(id, full_name, department)'
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
    overdueTasks: overdue.slice(0, 15),
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
  return (
    `  • ${(t.description || 'Task').slice(0, 90)}\n` +
    `    Project: ${t.project?.name || '—'}\n` +
    `    Status: ${t.status || '—'}` +
    (t.verification_status ? ` | Verify: ${t.verification_status}` : '') +
    `\n    Due: ${fmtDate(t.target_date)}` +
    (t.hours_to_complete != null ? ` | Hours: ${t.hours_to_complete}` : '') +
    (t.priority ? ` | ${t.priority}` : '')
  );
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

  if (isAdmin && people.length && (wantsClock || wantsAttendance || /\btime\b/.test(ql))) {
    adminOnly = true;
    skipPolish = true;
    const rows = await attendanceForPeople(people);
    answer = formatClockAnswer(people, rows);
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
  } else if (/\b(overdue|late|delay)\b/i.test(ql) || (/verif/i.test(ql) && wantsTasks)) {
    if (isAdmin && wantsCompany) {
      adminOnly = true;
      const c = await companyTaskSummary();
      answer =
        `COMPANY TASKS\n` +
        `Open: ${c.open}   Overdue: ${c.overdue}   Pending verification: ${c.pendingVerify}\n\n` +
        (c.overdueTasks.length
          ? `OVERDUE\n` + c.overdueTasks.map(formatTaskBlock).join('\n')
          : 'No overdue tasks.');
    } else {
      const s = await taskStatsForUser(user.id);
      if (/verif/i.test(ql)) {
        answer =
          `YOUR VERIFICATION QUEUE: ${s.pendingVerify.length}\n` +
          (s.pendingVerify.length ? s.pendingVerify.slice(0, 10).map(formatTaskBlock).join('\n') : 'None pending.');
      } else {
        answer =
          `YOUR TASKS\n` +
          `Open: ${s.pending.length}   Overdue: ${s.overdue.length}   Done: ${s.completed.length}\n\n` +
          (s.overdue.length ? `OVERDUE\n` + s.overdue.slice(0, 10).map(formatTaskBlock).join('\n') : 'No overdue.') +
          (s.pending.length
            ? `\n\nOPEN\n` + s.pending.slice(0, 10).map(formatTaskBlock).join('\n')
            : '');
      }
    }
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
    const c = await companyTaskSummary();
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
      `Tasks total ${c.total} | open ${c.open} | overdue ${c.overdue} | verify ${c.pendingVerify}\n\n` +
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
    answer =
      'Ask a specific question. Examples:\n' +
      '• Roshan Patel clock-in time\n' +
      '• Harshil clock-in and clock-out\n' +
      '• overdue tasks\n' +
      '• company summary\n' +
      '• DPR for SMJV';
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

  return { answer, adminOnly, askedAt: new Date().toISOString() };
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
            'You are DIP Bot. Always reply in clear English. Answer ONLY what the user asked using Facts. If they asked clock-in times, give only those people and times. Do not add tasks, DPR, WPR, or company pulse unless those facts were requested. Keep every number and name from Facts. Do not invent data. Plain text, no markdown tables.',
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
