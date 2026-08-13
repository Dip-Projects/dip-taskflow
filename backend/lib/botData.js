/**
 * DIP company data helpers for the AI bot (Supabase reads).
 */
const supabase = require('./supabaseClient');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function taskStatsForUser(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, status, verification_status, target_date, description, priority, project:projects(name)')
    .eq('assigned_to', userId);
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
      'id, status, verification_status, target_date, assigned_to, description, project:projects(name), assigned_to_user:users!tasks_assigned_to_fkey(id, full_name, department)'
    );
  if (error) throw error;
  const tasks = data || [];
  const now = new Date();
  const open = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress');
  const overdue = open.filter((t) => t.target_date && new Date(t.target_date) < now);
  const pendingVerify = tasks.filter((t) => t.verification_status === 'Pending Verification');
  const byUser = {};
  for (const t of tasks) {
    const name = t.assigned_to_user?.full_name || 'Unknown';
    if (!byUser[name]) byUser[name] = { total: 0, open: 0, done: 0, overdue: 0 };
    byUser[name].total += 1;
    if (t.status === 'Completed' || t.verification_status === 'Verified') byUser[name].done += 1;
    else if (t.status === 'Pending' || t.status === 'In Progress') {
      byUser[name].open += 1;
      if (t.target_date && new Date(t.target_date) < now) byUser[name].overdue += 1;
    }
  }
  return { total: tasks.length, open: open.length, overdue: overdue.length, pendingVerify: pendingVerify.length, byUser, overdueTasks: overdue.slice(0, 15) };
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

/**
 * Answer a natural-language question using live DIP data.
 * Optional OPENAI_API_KEY: if set, wraps the data summary in a short reply.
 */
async function answerQuestion({ question, user, isAdmin }) {
  const q = String(question || '').trim();
  const ql = q.toLowerCase();
  let adminOnly = false;
  let answer = '';

  const wantsCompany =
    /\b(company|sab|all|overall|team|kitne log|everyone|total|mis|report|attendance|leave|ticket)\b/i.test(q) ||
    /\b(kitna|kitne|how many|summary|status)\b/i.test(q);

  if (/\b(overdue|late|delay|pending verification|verify|verification)\b/i.test(ql) || /verification|overdue|pending/i.test(ql)) {
    if (isAdmin && wantsCompany) {
      adminOnly = true;
      const c = await companyTaskSummary();
      answer =
        `Company snapshot:\n` +
        `• Open tasks: ${c.open}\n` +
        `• Overdue: ${c.overdue}\n` +
        `• Pending verification: ${c.pendingVerify}\n` +
        (c.overdueTasks.length
          ? `Top overdue:\n` +
            c.overdueTasks
              .map(
                (t) =>
                  `– ${t.assigned_to_user?.full_name || '—'}: ${(t.description || '').slice(0, 60)} (${String(t.target_date || '').slice(0, 10)})`
              )
              .join('\n')
          : 'No overdue tasks 🎉');
    } else {
      const s = await taskStatsForUser(user.id);
      if (/verif/i.test(ql)) {
        answer =
          `Aapke paas ${s.pendingVerify.length} task(s) pending verification hain.\n` +
          (s.pendingVerify.length
            ? s.pendingVerify
                .slice(0, 8)
                .map((t) => `– ${(t.description || 'Task').slice(0, 80)} · ${t.project?.name || '—'}`)
                .join('\n')
            : 'Koi pending verification nahi.');
      } else {
        answer =
          `Aapke tasks:\n` +
          `• Pending / In progress: ${s.pending.length}\n` +
          `• Overdue: ${s.overdue.length}\n` +
          `• Completed: ${s.completed.length}\n` +
          (s.overdue.length
            ? `Overdue list:\n` +
              s.overdue
                .slice(0, 8)
                .map((t) => `– ${(t.description || 'Task').slice(0, 80)} (${String(t.target_date || '').slice(0, 10)})`)
                .join('\n')
            : '');
      }
    }
  } else if (/leave/i.test(ql) && isAdmin) {
    adminOnly = true;
    const L = await leaveSummary();
    answer = `Pending leave requests: ${L.pending}` +
      (L.rows.length
        ? '\n' + L.rows.slice(0, 10).map((r) => `– ${r.user?.full_name || '—'}: ${r.from_date} → ${r.to_date}`).join('\n')
        : '');
  } else if (/ticket/i.test(ql) && isAdmin) {
    adminOnly = true;
    const T = await ticketSummary();
    answer = `Open support tickets: ${T.open}`;
  } else if ((/kisne|who did|performance|kitna kiya|completion/i.test(ql) || wantsCompany) && isAdmin) {
    adminOnly = true;
    const c = await companyTaskSummary();
    const lines = Object.entries(c.byUser)
      .sort((a, b) => b[1].open - a[1].open)
      .slice(0, 20)
      .map(([name, v]) => `– ${name}: open ${v.open}, done ${v.done}, overdue ${v.overdue} (total ${v.total})`);
    answer = `Team task breakdown:\nTotal ${c.total} · Open ${c.open} · Overdue ${c.overdue}\n` + lines.join('\n');
  } else if (/my task|mera|mere|mine|pending/i.test(ql) || !isAdmin) {
    const s = await taskStatsForUser(user.id);
    answer =
      `Hi ${user.full_name || ''},\n` +
      `• Open: ${s.pending.length}\n` +
      `• Overdue: ${s.overdue.length}\n` +
      `• Pending verification: ${s.pendingVerify.length}\n` +
      `• Done: ${s.completed.length}\n` +
      `Poochho: "overdue", "verification pending", ya company summary (admin).`;
  } else if (isAdmin) {
    adminOnly = true;
    const c = await companyTaskSummary();
    const L = await leaveSummary();
    const T = await ticketSummary();
    answer =
      `DIP Projects pulse:\n` +
      `• Tasks open ${c.open} / overdue ${c.overdue} / verify ${c.pendingVerify}\n` +
      `• Leaves pending: ${L.pending}\n` +
      `• Tickets open: ${T.open}`;
  } else {
    const s = await taskStatsForUser(user.id);
    answer = `Aapke open tasks: ${s.pending.length}. Zyada detail ke liye "overdue" ya "verification" likho. Company-wide data sirf admin dekh sakta hai.`;
  }

  // Optional LLM polish
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
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are DIP Projects office assistant. Reply briefly in simple Hinglish/English. Use ONLY the facts given. Do not invent numbers.',
        },
        {
          role: 'user',
          content: `User ${name || ''} asked: ${question}\n\nFacts:\n${facts}\n\nReply:`,
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

module.exports = {
  answerQuestion,
  taskStatsForUser,
  companyTaskSummary,
  listOverdueTasksForWa,
  startOfToday,
};
