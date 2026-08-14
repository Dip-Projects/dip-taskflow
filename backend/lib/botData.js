/**
 * DIP Bot — live answers from TaskFlow + site tables.
 */
const supabase = require('./supabaseClient');

function fmtDate(v) {
  if (!v) return '—';
  return String(v).slice(0, 10);
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
      `  • ${a.user_name || '—'} | ${fmtDate(a.date)} | ${a.status || '—'} | in ${a.clock_in ? String(a.clock_in).slice(11, 16) : '—'} out ${a.clock_out ? String(a.clock_out).slice(11, 16) : '—'}`,
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

  const wantsSite =
    /\b(dpr|wpr|attendance|manpower|site report|clock in|clock-in|labour|labor)\b/i.test(ql);
  const wantsTasks =
    /\b(task|overdue|verify|verification|pending|due|assign|my work)\b/i.test(ql);
  const wantsCompany =
    /\b(company|sab|all|overall|team|kitne|everyone|total|mis|summary|status|report)\b/i.test(ql);

  if (wantsSite && isAdmin) {
    adminOnly = true;
    const s = await sitePulse();
    answer = `DIP site snapshot\n\n${formatSitePulse(s)}`;
  } else if (wantsSite && !isAdmin) {
    answer =
      'Site attendance / DPR / WPR company view sirf admin ke DIP Bot pe hai.\n' +
      'Apna site portal kholo for clock-in, DPR and WPR.';
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
    const site = await sitePulse();
    answer =
      `DIP COMPANY SNAPSHOT\n` +
      `Tasks total ${c.total} | open ${c.open} | overdue ${c.overdue} | verify ${c.pendingVerify}\n\n` +
      `BY EMPLOYEE\n${people || '  (none)'}\n\n` +
      `BY PROJECT\n${projects || '  (none)'}\n\n` +
      formatSitePulse(site);
  } else if (/my task|mera|mere|mine|pending|task/i.test(ql) || !isAdmin) {
    const s = await taskStatsForUser(user.id);
    answer =
      `Hi ${user.full_name || ''}\n\n` +
      `Open: ${s.pending.length}   Overdue: ${s.overdue.length}\n` +
      `Pending verification: ${s.pendingVerify.length}   Done: ${s.completed.length}\n\n` +
      (s.pending.length ? `OPEN TASKS\n` + s.pending.slice(0, 12).map(formatTaskBlock).join('\n') : 'No open tasks.') +
      `\n\nAsk: overdue | verification | (admin) dpr / attendance / company`;
  } else if (isAdmin) {
    adminOnly = true;
    const c = await companyTaskSummary();
    const L = await leaveSummary();
    const T = await ticketSummary();
    const site = await sitePulse();
    answer =
      `DIP PULSE\n` +
      `Tasks open ${c.open} / overdue ${c.overdue} / verify ${c.pendingVerify}\n` +
      `Leaves pending: ${L.pending}   Tickets open: ${T.open}\n\n` +
      formatSitePulse(site);
  } else {
    const s = await taskStatsForUser(user.id);
    answer = `Open tasks: ${s.pending.length}. Type "overdue" or "my tasks" for the list.`;
  }

  if (process.env.OPENAI_API_KEY) {
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
            'You are DIP Projects office assistant. Keep ALL numbers and names from Facts. Reply in clear English with the same section headings. Do not invent data. Keep lists. Use plain text, no markdown tables.',
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
