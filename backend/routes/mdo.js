/**
 * MDO Office portal APIs — Chirag (admin) + MIS executive only.
 */
const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdminOrMis } = require('../middleware/auth');
const { isMdoOfficeWorkTask } = require('../lib/mdoOfficeWork');
const {
  employeeWorkDueDate,
  employeeDueDate,
} = require('../lib/taskOverdue');
const { elapsedWorkingHours } = require('../lib/workingHours');

const router = express.Router();
router.use(requireAuth);

function parseRange(range, from, to) {
  const now = new Date();
  let startDate;
  let endDate;
  if (range === 'day') {
    startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
  } else if (range === 'week') {
    const day = now.getDay();
    startDate = new Date(now); startDate.setDate(now.getDate() - day); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59, 999);
  } else if (range === 'last-week') {
    const day = now.getDay();
    endDate = new Date(now); endDate.setDate(now.getDate() - day - 1); endDate.setHours(23, 59, 59, 999);
    startDate = new Date(endDate); startDate.setDate(endDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
  } else if (range === 'last-month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (range === 'all') {
    startDate = new Date(2000, 0, 1);
    endDate = new Date(now.getFullYear() + 1, 0, 1);
  } else if (range === 'custom' && from && to) {
    startDate = new Date(from); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(to); endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { startDate, endDate };
}

function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatWorkingDuration(hoursFloat) {
  const abs = Math.abs(Number(hoursFloat) || 0);
  const totalMin = Math.round(abs * 60);
  const workDayMin = 8 * 60;
  const days = Math.floor(totalMin / workDayMin);
  const rem = totalMin % workDayMin;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;
  const bits = [];
  if (days) bits.push(`${days}d`);
  if (hours) bits.push(`${hours}h`);
  if (mins || !bits.length) bits.push(`${mins}m`);
  return bits.join(' ');
}

const SELECT_FULL = `
  id, description, status, hours_to_complete, original_hours_to_complete,
  created_at, assigned_at, accepted_at, completed_at, sent_for_verification_at,
  verified_at, verification_status, is_on_hold, hold_remaining_hours, resumed_at,
  target_date, task_events,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, department, role )
`;

const SELECT_MIN = `
  id, description, status, hours_to_complete,
  created_at, assigned_at, accepted_at, sent_for_verification_at,
  verified_at, verification_status,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, department, role )
`;

/**
 * GET /mdo/task-report?range=month
 * MDO Office Work tasks: description, accept time, done time, delay yes/no.
 */
router.get('/task-report', requireAdminOrMis, async (req, res) => {
  try {
    const { range, from, to } = req.query;
    const { startDate, endDate } = parseRange(range, from, to);

    let { data: tasks, error } = await supabase
      .from('tasks')
      .select(SELECT_FULL)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error && /column|schema cache|completed_at|original_hours|hold_remaining|task_events/i.test(error.message || '')) {
      const retry = await supabase
        .from('tasks')
        .select(SELECT_MIN)
        .order('created_at', { ascending: false })
        .limit(5000);
      tasks = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    const inRange = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= startDate && d <= endDate;
    };

    const now = new Date();
    const rows = (tasks || [])
      .filter((t) => isMdoOfficeWorkTask(t))
      .filter((t) =>
        inRange(t.created_at) ||
        inRange(t.assigned_at) ||
        inRange(t.accepted_at) ||
        inRange(t.completed_at) ||
        inRange(t.verified_at) ||
        inRange(t.sent_for_verification_at)
      )
      .map((t, i) => {
        const acceptedAt = t.accepted_at || null;
        const doneAt =
          t.completed_at ||
          t.verified_at ||
          (String(t.status || '') === 'Completed' ? (t.sent_for_verification_at || null) : null);

        const due = acceptedAt ? employeeWorkDueDate(t) : employeeDueDate(t);
        const compareAt = doneAt ? new Date(doneAt) : now;

        let delay = false;
        let delay_label = '—';
        let status_label = String(t.status || 'Pending');

        if (!acceptedAt) {
          status_label = 'Not accepted';
          delay_label = 'Due starts after acceptance';
        } else if (!due) {
          delay_label = 'No hours set';
        } else if (compareAt - due > 60 * 1000) {
          delay = true;
          delay_label = doneAt
            ? `${formatWorkingDuration(elapsedWorkingHours(due, compareAt))} late`
            : `${formatWorkingDuration(elapsedWorkingHours(due, now))} overdue`;
          if (!doneAt) status_label = 'Pending (overdue)';
        } else if (doneAt) {
          delay_label = 'On time';
        } else {
          delay_label = 'Within deadline';
        }

        if (doneAt && String(t.status || '') === 'Completed') status_label = 'Done';
        if (t.verification_status === 'Verified') status_label = 'Verified';

        return {
          sr: i + 1,
          id: t.id,
          description: t.description || '—',
          employee: t.assigned_to_user?.full_name || '—',
          task_type: t.task_type?.name || '—',
          project: t.project?.name || '—',
          accepted_at: acceptedAt,
          accepted_label: acceptedAt ? fmtStamp(acceptedAt) : 'Not accepted',
          done_at: doneAt,
          done_label: doneAt ? fmtStamp(doneAt) : 'Not done yet',
          due_at: due ? due.toISOString() : null,
          due_label: due ? fmtStamp(due) : '—',
          delay,
          delay_label,
          status: status_label,
        };
      })
      .sort((a, b) => {
        const ta = new Date(a.accepted_at || a.done_at || 0).getTime();
        const tb = new Date(b.accepted_at || b.done_at || 0).getTime();
        return tb - ta;
      })
      .map((r, i) => ({ ...r, sr: i + 1 }));

    res.json({
      range: range || 'month',
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      rows,
      summary: {
        total: rows.length,
        delayed: rows.filter((r) => r.delay).length,
        on_time: rows.filter((r) => !r.delay && r.done_at).length,
        pending: rows.filter((r) => !r.done_at).length,
      },
    });
  } catch (err) {
    console.error('MDO task report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not build MDO task report' });
  }
});

module.exports = router;
