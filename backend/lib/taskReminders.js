/**
 * Automated task reminders (WhatsApp), driven by the work timer — not by the
 * admin's plan date.
 *
 *   Daily overdue  — every day, one message per overdue task, telling the
 *                    employee how many days it has been overdue. Repeats every
 *                    day until the task is completed.
 *   Accept nudge   — one message ~20 minutes after a short same-day task is
 *                    assigned and still not accepted.
 *
 * Both are switchable by MIS (see reminderSettings.js).
 */
const supabase = require('./supabaseClient');
const { sendWhatsAppTemplate } = require('./whatsapp');
const { getReminderSettings } = require('./reminderSettings');
const {
  isFinishedTask,
  isAssignmentOverdue,
  isVerificationOverdue,
  overdueSince,
  overdueCalendarDays,
  overdueWorkingHours,
  employeeDueDate,
  activePlanDate,
  needsReaccept,
  assignedHours,
} = require('./taskOverdue');

const REMINDER_SELECT = `
  id, description, status, verification_status, priority,
  assigned_at, created_at, accepted_at, resumed_at,
  hours_to_complete, original_hours_to_complete,
  target_date, original_target_date, reschedule_approved_target_date,
  reschedule_status, reaccept_required,
  is_on_hold, hold_remaining_hours, held_at,
  overdue_since_at, accept_reminder_sent_at,
  assigned_to,
  project:projects ( name ),
  assignee:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id )
`;

const REMINDER_SELECT_LEGACY = `
  id, description, status, verification_status, priority,
  assigned_at, created_at, accepted_at, resumed_at,
  hours_to_complete, original_hours_to_complete,
  target_date, reschedule_status,
  is_on_hold, hold_remaining_hours, held_at,
  assigned_to,
  project:projects ( name ),
  assignee:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id )
`;

/** Every open task, with the joins the reminder messages need. */
async function loadOpenTasks() {
  let { data, error } = await supabase
    .from('tasks')
    .select(REMINDER_SELECT)
    .in('status', ['Pending', 'In Progress', 'Ticket Raised']);
  if (error && /column|schema cache/i.test(error.message || '')) {
    const retry = await supabase
      .from('tasks')
      .select(REMINDER_SELECT_LEGACY)
      .in('status', ['Pending', 'In Progress', 'Ticket Raised']);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return (data || []).filter((t) => !isFinishedTask(t));
}

function dayKey(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function fmtDayLabel(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortDesc(t, max = 140) {
  return String(t?.description || 'Task').slice(0, max);
}

/** "3 days overdue" / "overdue since today". */
function overduePhrase(days) {
  if (days <= 0) return 'overdue since today';
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

/** Tasks that are past their work deadline right now. */
function selectOverdue(tasks, now, settings) {
  const cutoff = settings.overdue_since_date;
  return tasks.filter((t) => {
    if (!isAssignmentOverdue(t, now) && !isVerificationOverdue(t, now)) return false;
    const since = overdueSince(t);
    if (!since) return false;
    // Do not blast tasks that were already overdue before the rollout date.
    if (cutoff && dayKey(since) < cutoff) return false;
    return true;
  });
}

/**
 * Daily overdue WhatsApp. Runs once a day; one message per overdue task per
 * day, and it keeps going every day until the task is completed.
 */
async function runDailyOverdueReminders({ now = new Date(), dryRun = false } = {}) {
  const settings = await getReminderSettings();
  if (!settings.daily_overdue_whatsapp) {
    return { skipped: 'disabled_by_mis', checked: 0, sent: 0, day: dayKey(now) };
  }

  const day = dayKey(now);
  const tasks = await loadOpenTasks();
  const overdue = selectOverdue(tasks, now, settings);

  let sent = 0;
  let skipped = 0;
  const perEmployee = {};

  for (const t of overdue) {
    const since = overdueSince(t);
    const days = overdueCalendarDays(t, now);

    // Stamp the first overdue moment once, so "X days overdue" stays stable
    // even if hours or the plan change later.
    if (!t.overdue_since_at && since && !dryRun) {
      await supabase
        .from('tasks')
        .update({ overdue_since_at: since.toISOString() })
        .eq('id', t.id)
        .then(() => {}, () => {});
    }

    const empId = t.assignee?.id || t.assigned_to;
    if (empId) {
      perEmployee[empId] = perEmployee[empId] || { name: t.assignee?.full_name || '—', tasks: 0, maxDays: 0 };
      perEmployee[empId].tasks += 1;
      perEmployee[empId].maxDays = Math.max(perEmployee[empId].maxDays, days);
    }

    const wa = t.assignee?.whatsapp_number;
    if (!wa) { skipped += 1; continue; }

    // One send per task per day.
    const { data: already } = await supabase
      .from('overdue_wa_log')
      .select('task_id')
      .eq('task_id', t.id)
      .eq('alert_day', day)
      .maybeSingle();
    if (already) { skipped += 1; continue; }

    const dueLabel = needsReaccept(t)
      ? `${fmtDayLabel(activePlanDate(t))} (not accepted again)`
      : fmtDayLabel(overdueSince(t));

    if (!dryRun) {
      await sendWhatsAppTemplate(wa, 'task_notification_v2', [
        t.assignee?.full_name || 'Team member',
        `OVERDUE (${overduePhrase(days)}): ${shortDesc(t)}`,
        t.project?.name || '—',
        `Was due ${dueLabel}`,
        t.priority || 'High',
      ]);
      await supabase.from('overdue_wa_log').upsert({ task_id: t.id, alert_day: day });
      await supabase
        .from('tasks')
        .update({ overdue_wa_last_sent_at: now.toISOString() })
        .eq('id', t.id)
        .then(() => {}, () => {});
    }
    sent += 1;
  }

  return {
    day,
    checked: overdue.length,
    sent,
    skipped,
    employees: Object.values(perEmployee).length,
    breakdown: Object.values(perEmployee),
  };
}

/**
 * Accept nudge: a short same-day task still sitting unaccepted after N minutes
 * gets one WhatsApp asking the employee to accept it or request a reschedule.
 */
async function runAcceptNudges({ now = new Date(), dryRun = false } = {}) {
  const settings = await getReminderSettings();
  if (!settings.accept_nudge_whatsapp) {
    return { skipped: 'disabled_by_mis', checked: 0, sent: 0 };
  }

  const waitMin = Number(settings.accept_nudge_minutes) || 20;
  const maxHours = Number(settings.accept_nudge_max_hours) || 4;
  const tasks = await loadOpenTasks();

  const due = tasks.filter((t) => {
    if (t.accepted_at && !t.reaccept_required) return false;
    if (t.accept_reminder_sent_at) return false;
    if (String(t.status || '') === 'Rejected') return false;
    if (String(t.reschedule_status || '') === 'Pending') return false;

    const hours = assignedHours(t);
    if (!hours || hours <= 0 || hours > maxHours) return false;

    const start = t.assigned_at || t.created_at;
    if (!start) return false;
    return (now - new Date(start)) / 60000 >= waitMin;
  });

  let sent = 0;
  for (const t of due) {
    const wa = t.assignee?.whatsapp_number;
    if (!wa) continue;
    const deadline = employeeDueDate(t);
    if (!dryRun) {
      await sendWhatsAppTemplate(wa, 'task_notification_v2', [
        t.assignee?.full_name || 'Team member',
        `PLEASE ACCEPT (${assignedHours(t)}h task, ${waitMin}+ min waiting): ${shortDesc(t)} — accept it now or request a reschedule`,
        t.project?.name || '—',
        deadline ? `Due ${fmtDayLabel(deadline)}` : 'Due today',
        t.priority || 'High',
      ]);
      await supabase
        .from('tasks')
        .update({ accept_reminder_sent_at: now.toISOString() })
        .eq('id', t.id)
        .then(() => {}, () => {});
    }
    sent += 1;
  }

  return { checked: due.length, sent, wait_minutes: waitMin, max_hours: maxHours };
}

module.exports = {
  loadOpenTasks,
  selectOverdue,
  runDailyOverdueReminders,
  runAcceptNudges,
  overduePhrase,
  dayKey,
};
