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

/** Calendar day in IST as YYYY-MM-DD */
function istYmd(d = new Date()) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function taskDueYmd(task) {
  const raw = task?.target_date;
  if (!raw) return null;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return istYmd(new Date(s));
  } catch {
    return null;
  }
}

function dayLabel(ymd) {
  try {
    const d = new Date(`${ymd}T12:00:00+05:30`);
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return ymd;
  }
}

/**
 * Load assignee tasks. When dayYmd set:
 * - open: due that day OR overdue (due before day, still open)
 * - completed: completed with due that day (for status summary)
 */
async function loadTasksForUser(userId, opts = {}) {
  const dayYmd = opts.dayYmd || null;
  const { data, error } = await supabase
    .from('tasks')
    .select('id, description, status, priority, target_date, completed_at, project:projects(name)')
    .eq('assigned_to', userId)
    .neq('status', 'Rejected')
    .order('target_date', { ascending: true });

  if (error) throw error;
  const all = data || [];

  if (!dayYmd) {
    return {
      open: all.filter((t) => isOpenStatus(t.status)),
      done: all.filter((t) => t.status === 'Completed'),
      dayYmd: null,
    };
  }

  const open = all.filter((t) => {
    if (!isOpenStatus(t.status)) return false;
    const due = taskDueYmd(t);
    if (!due) return true; // no due → show in today's list
    return due <= dayYmd; // today + overdue
  });

  const done = all.filter((t) => {
    if (t.status !== 'Completed') return false;
    const due = taskDueYmd(t);
    if (due === dayYmd) return true;
    // completed today even if due another day
    if (t.completed_at && istYmd(t.completed_at) === dayYmd) return true;
    return false;
  });

  return { open, done, dayYmd };
}

async function loadOpenTasksForUser(userId, opts = {}) {
  const { open } = await loadTasksForUser(userId, opts);
  return open;
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
    const due = taskDueYmd(t) || t.target_date || '—';
    const overdue = due !== '—' && due < istYmd() ? ' · LATE' : '';
    rows.push({
      id: `tf_done_${t.id}`,
      title: clip(`${i + 1}. ${t.description || 'Task'}`, 24),
      description: clip(`${project} · Due ${due}${overdue}${t.priority ? ` · ${t.priority}` : ''}`, 72),
    });
  });

  return rows;
}

function formatStatusSummary({ open, done, dayYmd, justDoneLabel }) {
  const label = dayYmd ? dayLabel(dayYmd) : 'all days';
  const lines = [];
  if (justDoneLabel) lines.push(`✅ Done: ${clip(justDoneLabel, 100)}`);
  lines.push(`📅 ${label}`);
  if (done.length) {
    lines.push(`Completed (${done.length}):`);
    done.slice(0, 8).forEach((t, i) => {
      lines.push(`  ✓ ${i + 1}. ${clip(t.description || 'Task', 60)}`);
    });
    if (done.length > 8) lines.push(`  …+${done.length - 8} more`);
  } else {
    lines.push('Completed: none yet');
  }
  if (open.length) {
    lines.push(`Still open (${open.length}):`);
    open.slice(0, 8).forEach((t, i) => {
      lines.push(`  ${i + 1}. ${clip(t.description || 'Task', 60)}`);
    });
    if (open.length > 8) lines.push(`  …+${open.length - 8} more`);
  } else {
    lines.push('Still open: none — all caught up ✅');
  }
  return lines.join('\n');
}

/**
 * One WhatsApp list for open tasks (default: today IST + overdue).
 */
async function sendOpenTasksListPicker(toNumber, userId, opts = {}) {
  const fullName = opts.fullName || 'Team member';
  const dayYmd = opts.dayYmd !== undefined ? opts.dayYmd : istYmd();
  const bundle = await loadTasksForUser(userId, { dayYmd: dayYmd || undefined });
  const tasks = bundle.open;

  if (!tasks.length) {
    if (opts.sayEmpty) {
      const summary = formatStatusSummary(bundle);
      await sendWhatsAppText(toNumber, summary);
    }
    return { ok: true, count: 0, dayYmd: bundle.dayYmd, done: bundle.done.length };
  }

  const dayName = dayYmd ? dayLabel(dayYmd) : 'Open';
  const doneN = bundle.done.length;
  const extra =
    tasks.length > 9 ? `\n(+${tasks.length - 9} more in Site → My Tasks)` : '';
  const body = clip(
    `Hi ${fullName},\n${dayName} — ${tasks.length} open task(s)${doneN ? `, ${doneN} done` : ''}.${extra}\n\nTap Select → mark done (or Mark ALL). Reply LIST anytime.`,
    1024
  );

  const listResult = await sendWhatsAppInteractiveList(toNumber, {
    header: clip(dayYmd ? `${dayName.split(',')[0]} tasks` : 'DIP My Tasks', 60),
    body,
    footer: 'Or reply ALL / LIST',
    button: 'Select',
    sections: [{ title: 'Open tasks', rows: buildListRows(tasks) }],
  });

  if (listResult.ok) {
    return { ok: true, count: tasks.length, via: 'list', dayYmd, done: doneN };
  }

  const tmpl = process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2';
  const preview = tasks
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${clip(t.description, 40)}`)
    .join('; ');
  await sendWhatsAppTemplate(toNumber, tmpl, [
    fullName,
    clip(`${dayName}: ${tasks.length} open: ${preview}`, 200),
    'DIP Projects',
    dayYmd || new Date().toISOString().slice(0, 10),
    'Open',
  ]);
  return {
    ok: true,
    count: tasks.length,
    via: 'template_fallback',
    listError: listResult,
    dayYmd,
    done: doneN,
  };
}

async function notifyAssigneeOpenTasksList(userId, toNumber, fullName) {
  if (!normalizeWhatsAppNumber(toNumber) || !userId) {
    return { ok: false, reason: 'bad_args' };
  }
  try {
    const { data: u } = await supabase
      .from('users')
      .select('id, username, full_name, role, designation, department')
      .eq('id', userId)
      .maybeSingle();
    // Never spam admin with day-list WhatsApp
    if (u && isAdminUser(u)) {
      return { ok: false, reason: 'admin_skipped' };
    }
    return await sendOpenTasksListPicker(toNumber, userId, {
      fullName: fullName || u?.full_name,
      dayYmd: istYmd(),
    });
  } catch (err) {
    console.warn('WA list digest failed:', err.message);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

/** @deprecated alias — prefer notifyAssigneeOpenTasksList (awaited). */
function scheduleOpenTasksListDigest(userId, toNumber, fullName) {
  return notifyAssigneeOpenTasksList(userId, toNumber, fullName);
}

async function completeAllOpenTasksForUser(user, opts = {}) {
  const dayYmd = opts.dayYmd !== undefined ? opts.dayYmd : istYmd();
  const tasks = await loadOpenTasksForUser(user.id, { dayYmd: dayYmd || undefined });
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
  return { done, total: tasks.length, dayYmd };
}

function isAdminUser(u) {
  return String(u?.role || '').toLowerCase().trim() === 'admin';
}

function isProcessControllerUser(u) {
  if (isAdminUser(u)) return false;
  const role = String(u?.role || '').toLowerCase().trim();
  const des = String(u?.designation || '').toLowerCase().trim();
  const blob = `${role} ${des} ${u?.department || ''}`.toLowerCase();
  if (role === 'pc' || des === 'pc') return true;
  if (/\bpc\b/.test(blob)) return true;
  if (blob.includes('process controller')) return true;
  return false;
}

function isBeenaParmarPc(u) {
  if (!u || isAdminUser(u)) return false;
  const name = `${u.full_name || ''} ${u.username || ''}`.toLowerCase();
  // Primary target: anyone named Beena (Beena Parmar). Designation text often varies.
  if (!/beena/.test(name)) return false;
  return true;
}

/**
 * Who gets the daily WhatsApp list:
 * - If WA_DIGEST_USERNAMES set → those usernames only
 * - Else Beena (by name) only
 * - Else any Process Controller (fallback if no Beena in DB)
 * Never admin.
 */
function digestRecipientAllowed(u) {
  if (!u || isAdminUser(u)) return false;
  const allow = String(process.env.WA_DIGEST_USERNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length) {
    return allow.includes(String(u.username || '').toLowerCase());
  }
  return isBeenaParmarPc(u) || isProcessControllerUser(u);
}

/**
 * Daily digest: today's open (+ overdue) list picker — Process Controller (Beena) only, not admin.
 */
async function runOpenTasksListDigestCron() {
  const dayYmd = istYmd();
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, username, role, designation, department, is_active')
    .not('whatsapp_number', 'is', null)
    .neq('is_active', false);

  if (error) throw error;

  const pool = users || [];
  let recipients = pool.filter(digestRecipientAllowed);
  // Prefer Beena when env not set and both Beena + other PCs exist
  if (!process.env.WA_DIGEST_USERNAMES) {
    const beenaOnly = recipients.filter(isBeenaParmarPc);
    if (beenaOnly.length) recipients = beenaOnly;
  }

  let sent = 0;
  let skipped = 0;
  for (const u of recipients) {
    if (!normalizeWhatsAppNumber(u.whatsapp_number)) {
      skipped += 1;
      continue;
    }
    const tasks = await loadOpenTasksForUser(u.id, { dayYmd });
    if (!tasks.length) {
      skipped += 1;
      continue;
    }
    const result = await sendOpenTasksListPicker(u.whatsapp_number, u.id, {
      fullName: u.full_name || u.username || 'Team member',
      dayYmd,
    });
    if (result.ok && result.count > 0) sent += 1;
    else skipped += 1;
  }
  return {
    sent,
    skipped,
    users: pool.length,
    recipients: recipients.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
    })),
    dayYmd,
    dayLabel: dayLabel(dayYmd),
    note: 'Daily list → Beena only (not admin). Set WA_DIGEST_USERNAMES to override.',
  };
}

/** Find Beena (or WA_DIGEST_USERNAMES) and send today's list now. */
async function sendDayListToBeenaNow() {
  const dayYmd = istYmd();
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, username, role, designation, department, is_active')
    .neq('is_active', false);
  if (error) throw error;

  let recipients = (users || []).filter(digestRecipientAllowed);
  if (!process.env.WA_DIGEST_USERNAMES) {
    const beenaOnly = recipients.filter(isBeenaParmarPc);
    if (beenaOnly.length) recipients = beenaOnly;
  }
  if (!recipients.length) {
    return {
      ok: false,
      reason: 'no_beena',
      hint: 'No Beena / Process Controller found. Check users.full_name contains Beena, or set WA_DIGEST_USERNAMES.',
    };
  }

  const results = [];
  for (const u of recipients) {
    if (!normalizeWhatsAppNumber(u.whatsapp_number)) {
      results.push({
        username: u.username,
        ok: false,
        reason: 'no_whatsapp',
        hint: 'Set whatsapp_number on this user',
      });
      continue;
    }
    const result = await sendOpenTasksListPicker(u.whatsapp_number, u.id, {
      fullName: u.full_name || u.username,
      dayYmd,
      sayEmpty: true,
    });
    results.push({ username: u.username, full_name: u.full_name, ...result });
  }
  return { ok: true, dayYmd, dayLabel: dayLabel(dayYmd), results };
}

module.exports = {
  istYmd,
  taskDueYmd,
  dayLabel,
  loadTasksForUser,
  loadOpenTasksForUser,
  sendOpenTasksListPicker,
  notifyAssigneeOpenTasksList,
  scheduleOpenTasksListDigest,
  completeAllOpenTasksForUser,
  runOpenTasksListDigestCron,
  sendDayListToBeenaNow,
  buildListRows,
  formatStatusSummary,
  isProcessControllerUser,
  isBeenaParmarPc,
  digestRecipientAllowed,
};
