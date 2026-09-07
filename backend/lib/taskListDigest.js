const supabase = require('./supabaseClient');
const {
  sendWhatsAppInteractiveList,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  normalizeWhatsAppNumber,
} = require('./whatsapp');

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function isOpenStatus(status) {
  const s = String(status || '');
  return s !== 'Completed' && s !== 'Rejected';
}

async function loadOpenTasksForUser(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, description, status, priority, target_date, project:projects(name)')
    .eq('assigned_to', userId)
    .neq('status', 'Rejected')
    .order('target_date', { ascending: true });

  if (error) throw error;
  return (data || []).filter((t) => isOpenStatus(t.status));
}

function buildListRows(tasks) {
  const rows = [
    {
      id: 'tf_done_all',
      title: '✅ Mark ALL done',
      description: clip(`${tasks.length} open task(s)`, 72),
    },
  ];

  // Meta: max 10 rows total → 1 ALL + up to 9 tasks
  tasks.slice(0, 9).forEach((t, i) => {
    const project = t.project?.name || '—';
    const due = t.target_date || '—';
    rows.push({
      id: `tf_done_${t.id}`,
      title: clip(`${i + 1}. ${t.description || 'Task'}`, 24),
      description: clip(`${project} · Due ${due}${t.priority ? ` · ${t.priority}` : ''}`, 72),
    });
  });

  return rows;
}

/**
 * One WhatsApp list message for all open tasks (lazy-friendly picker).
 */
async function sendOpenTasksListPicker(toNumber, userId, opts = {}) {
  const fullName = opts.fullName || 'Team member';
  const tasks = await loadOpenTasksForUser(userId);

  if (!tasks.length) {
    if (opts.sayEmpty) {
      await sendWhatsAppText(toNumber, 'No open tasks. You’re all caught up ✅');
    }
    return { ok: true, count: 0 };
  }

  const extra =
    tasks.length > 9 ? `\n(+${tasks.length - 9} more in Site → My Tasks)` : '';
  const body = clip(
    `Hi ${fullName},\nYou have ${tasks.length} open task(s).${extra}\n\nTap Select → pick a task (or Mark ALL done).`,
    1024
  );

  const listResult = await sendWhatsAppInteractiveList(toNumber, {
    header: 'DIP My Tasks',
    body,
    footer: 'Or reply ALL / LIST',
    button: 'Select',
    sections: [{ title: 'Open tasks', rows: buildListRows(tasks) }],
  });

  if (listResult.ok) return { ok: true, count: tasks.length, via: 'list' };

  // Outside 24h window: short template nudge (no per-task spam)
  const tmpl = process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2';
  const preview = tasks
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${clip(t.description, 40)}`)
    .join('; ');
  await sendWhatsAppTemplate(toNumber, tmpl, [
    fullName,
    clip(`${tasks.length} open: ${preview}`, 200),
    'DIP Projects',
    new Date().toISOString().slice(0, 10),
    'Open',
  ]);
  return { ok: true, count: tasks.length, via: 'template_fallback', listError: listResult };
}

/**
 * Send (or refresh) the open-tasks list picker for an assignee.
 * Call after each assign — one list of ALL open tasks (not one msg per task body).
 * On Vercel we await this so the send is not killed after the HTTP response.
 */
async function notifyAssigneeOpenTasksList(userId, toNumber, fullName) {
  if (!normalizeWhatsAppNumber(toNumber) || !userId) {
    return { ok: false, reason: 'bad_args' };
  }
  try {
    return await sendOpenTasksListPicker(toNumber, userId, { fullName });
  } catch (err) {
    console.warn('WA list digest failed:', err.message);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

/** @deprecated alias — prefer notifyAssigneeOpenTasksList (awaited). */
function scheduleOpenTasksListDigest(userId, toNumber, fullName) {
  return notifyAssigneeOpenTasksList(userId, toNumber, fullName);
}

async function completeAllOpenTasksForUser(user) {
  const tasks = await loadOpenTasksForUser(user.id);
  let done = 0;
  const at = new Date().toISOString();
  for (const t of tasks) {
    const updates = {
      status: 'Completed',
      completed_at: at,
      status_note: `Completed via WhatsApp ALL by ${user.full_name || user.username}`,
    };
    let { error } = await supabase.from('tasks').update(updates).eq('id', t.id);
    if (error && /completed_at|status_note/i.test(error.message || '')) {
      const retry = await supabase.from('tasks').update({ status: 'Completed' }).eq('id', t.id);
      error = retry.error;
    }
    if (!error) done += 1;
  }
  return { done, total: tasks.length };
}

/**
 * Send list digests to everyone with open tasks + WhatsApp number.
 */
async function runOpenTasksListDigestCron() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, username, is_active')
    .not('whatsapp_number', 'is', null)
    .neq('is_active', false);

  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  for (const u of users || []) {
    if (!normalizeWhatsAppNumber(u.whatsapp_number)) {
      skipped += 1;
      continue;
    }
    const tasks = await loadOpenTasksForUser(u.id);
    if (!tasks.length) {
      skipped += 1;
      continue;
    }
    const result = await sendOpenTasksListPicker(u.whatsapp_number, u.id, {
      fullName: u.full_name || u.username || 'Team member',
    });
    if (result.ok && result.count > 0) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped, users: (users || []).length };
}

module.exports = {
  loadOpenTasksForUser,
  sendOpenTasksListPicker,
  notifyAssigneeOpenTasksList,
  scheduleOpenTasksListDigest,
  completeAllOpenTasksForUser,
  runOpenTasksListDigestCron,
  buildListRows,
};
