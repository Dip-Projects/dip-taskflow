/**
 * Shared task timer + overdue rules (Office UI, DIP Bot, reports, WhatsApp cron).
 *
 * Office hours: 9:30–18:30, lunch 13:00–14:00, Mon–Sat (Sunday off).
 *
 * Work timer
 *   - Pre-accept:  deadline = assigned_at + hours_to_complete (display only)
 *   - Post-accept: due      = accepted_at + hours_to_complete
 *   - After resume: due     = resumed_at + hold_remaining_hours
 *   - target_date / plan dates NEVER feed the employee work timer.
 *
 * Reschedule
 *   - An approved reschedule moves the plan date and forces a fresh Accept.
 *     Until that Accept happens the work timer is not running, but the task
 *     still goes overdue once the approved plan date has passed.
 *
 * Verification: 2 working hours from verification_started_at.
 */
const { addWorkingHours, elapsedWorkingHours } = require('./workingHours');

const VERIFICATION_SLA_HOURS = 2;

/** Minutes an employee gets to accept a short same-day task before a nudge. */
const ACCEPT_NUDGE_MINUTES = 20;
/** A task at or below this many hours is treated as "finish it today". */
const SAME_DAY_MAX_HOURS = 4;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Plan dates are stored as bare `YYYY-MM-DD`, which `new Date()` reads as UTC
 * midnight — that lands mid-morning in IST and would make a task look late on
 * its own due day. Parse those as local midnight instead.
 */
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && DATE_ONLY_RE.test(v.trim())) {
    const [y, m, d] = v.trim().split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function isFinishedTask(t) {
  const st = String(t?.status || '').trim().toLowerCase();
  const vs = String(t?.verification_status || '').trim().toLowerCase();
  return (
    st === 'completed'
    || st === 'rejected'
    || vs === 'verified'
    || vs === 'verification rejected'
  );
}

// ── verification SLA ─────────────────────────────────────────────────────────

function verificationWorkDueDate(t) {
  const started = toDate(t?.verification_started_at);
  if (!started) return null;
  return addWorkingHours(started, VERIFICATION_SLA_HOURS);
}

/** @deprecated alias — botData and legacy callers */
function verificationDueAt(t) {
  return verificationWorkDueDate(t);
}

function isVerificationOverdue(t, now = new Date()) {
  if (String(t?.verification_status || '') !== 'Pending Verification') return false;
  const due = verificationWorkDueDate(t);
  if (!due) return false;
  return now > due;
}

function verificationOverdueWorkingHours(t, now = new Date()) {
  const due = verificationWorkDueDate(t);
  if (!due || now <= due) return 0;
  return Math.max(0, Math.round(elapsedWorkingHours(due, now) * 10) / 10);
}

// ── plan dates (admin side) ──────────────────────────────────────────────────

/** The plan date the admin first set. Falls back to target_date pre-migration. */
function originalPlanDate(t) {
  return toDate(t?.original_target_date) || toDate(t?.target_date);
}

/** The plan date in force right now (after any approved reschedule). */
function activePlanDate(t) {
  return (
    toDate(t?.reschedule_approved_target_date)
    || toDate(t?.target_date)
    || toDate(t?.original_target_date)
  );
}

/** True when an approved reschedule moved this task off its original plan. */
function wasRescheduled(t) {
  if (String(t?.reschedule_status || '') === 'Approved') return true;
  return !!t?.reschedule_approved_target_date;
}

// ── work timer ───────────────────────────────────────────────────────────────

/** Active work-timer anchor (last resume, else the accept that started it). */
function workTimerAnchor(t) {
  if (t?.is_on_hold) return t.resumed_at || t.accepted_at || null;
  if (t?.resumed_at) return t.resumed_at;
  return t?.accepted_at || null;
}

/** Remaining work-hour budget for the active segment. */
function workTimerBudgetHours(t) {
  if (t?.is_on_hold) {
    const rem = num(t.hold_remaining_hours);
    if (rem != null && rem > 0) return rem;
    return num(t.hours_to_complete) || 0;
  }
  if (t?.resumed_at && t.hold_remaining_hours != null) {
    return num(t.hold_remaining_hours) || 0;
  }
  return num(t.hours_to_complete) || 0;
}

/** Hours the task was assigned with, before any hold trimmed the live budget. */
function assignedHours(t) {
  const orig = num(t?.original_hours_to_complete);
  if (orig != null) return orig;
  return num(t?.hours_to_complete);
}

/**
 * Pre-accept deadline: assigned_at + assigned hours (office time).
 * This is what the employee sees in Due before they press Accept.
 */
function assignedWorkDeadline(t) {
  const start = toDate(t?.assigned_at) || toDate(t?.created_at);
  const hours = assignedHours(t);
  if (!start || !hours || hours <= 0) return null;
  return addWorkingHours(start, hours);
}

/** Live work deadline once the task has been accepted (and not re-accept-pending). */
function employeeWorkDueDate(t) {
  if (needsReaccept(t)) return null;
  if (!t?.accepted_at) return null;
  const anchor = workTimerAnchor(t);
  const hours = workTimerBudgetHours(t);
  if (!anchor || !hours || hours <= 0) return null;
  return addWorkingHours(anchor, hours);
}

/**
 * The single date the employee should see in the Due column.
 * Never a plan / target date — always a real work deadline.
 */
function employeeDueDate(t) {
  return employeeWorkDueDate(t) || assignedWorkDeadline(t);
}

/** True when an approved reschedule is waiting for the employee to accept again. */
function needsReaccept(t) {
  if (isFinishedTask(t)) return false;
  if (t?.reaccept_required) return true;
  return false;
}

// ── overdue ──────────────────────────────────────────────────────────────────

/**
 * Work (assignment) overdue. Two ways a task gets here:
 *   1. Timer running and the work deadline passed.
 *   2. An approved reschedule date passed and the employee never accepted again.
 */
function isAssignmentOverdue(t, now = new Date()) {
  if (isFinishedTask(t)) return false;
  if (t?.is_on_hold) return false;
  if (String(t?.verification_status || '') === 'Pending Verification') return false;

  if (needsReaccept(t)) {
    const plan = activePlanDate(t);
    return !!plan && now > endOfPlanDay(plan);
  }

  if (!t?.accepted_at) return false;
  const due = employeeWorkDueDate(t);
  if (!due) return false;
  return now > due;
}

/** A plan date with no time means "by close of business" on that day. */
function endOfPlanDay(planDate) {
  const d = toDate(planDate);
  if (!d) return null;
  const midnightish = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  if (!midnightish) return d;
  const end = new Date(d);
  end.setHours(18, 30, 0, 0);
  return end;
}

function isDelegatedOverdue(t, now = new Date()) {
  if (isFinishedTask(t)) return false;
  return isVerificationOverdue(t, now) || isAssignmentOverdue(t, now);
}

function overdueSource(t, now = new Date()) {
  if (isVerificationOverdue(t, now)) return 'verification';
  if (isAssignmentOverdue(t, now)) return 'assignment';
  return 'assignment';
}

/** The moment this task became overdue (used for "X days overdue"). */
function overdueSince(t) {
  const stored = toDate(t?.overdue_since_at);
  if (stored) return stored;
  if (needsReaccept(t)) return endOfPlanDay(activePlanDate(t));
  return employeeWorkDueDate(t) || verificationWorkDueDate(t);
}

/** Whole calendar days a task has been overdue (0 = became overdue today). */
function overdueCalendarDays(t, now = new Date()) {
  const since = overdueSince(t);
  if (!since || now <= since) return 0;
  const a = new Date(since.getFullYear(), since.getMonth(), since.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Office hours a task has been overdue. */
function overdueWorkingHours(t, now = new Date()) {
  const since = overdueSince(t);
  if (!since || now <= since) return 0;
  return Math.max(0, Math.round(elapsedWorkingHours(since, now) * 10) / 10);
}

// ── accept nudge ─────────────────────────────────────────────────────────────

/**
 * Short same-day task sitting unaccepted for more than ACCEPT_NUDGE_MINUTES.
 * Used by the reminder cron: "accept it, or ask for a reschedule".
 */
function needsAcceptNudge(t, now = new Date()) {
  if (isFinishedTask(t)) return false;
  if (t?.accepted_at && !needsReaccept(t)) return false;
  if (String(t?.status || '') === 'Rejected') return false;
  if (String(t?.reschedule_status || '') === 'Pending') return false;

  const hours = assignedHours(t);
  if (!hours || hours <= 0 || hours > SAME_DAY_MAX_HOURS) return false;

  const start = toDate(t?.assigned_at) || toDate(t?.created_at);
  if (!start) return false;
  const waitedMin = (now - start) / 60000;
  return waitedMin >= ACCEPT_NUDGE_MINUTES;
}

// ── hold / resume ────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Office-hour seconds between two instants (hold time only counts work time). */
function holdSecondsBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b || b <= a) return 0;
  return Math.round(elapsedWorkingHours(a, b) * 3600);
}

/**
 * Everything a report needs about this task's hold history:
 * when it paused, how long it stayed paused, when the timer restarted.
 */
function holdResumeSummary(t, now = new Date()) {
  const events = Array.isArray(t?.task_events) ? t.task_events : [];
  const timeline = [];
  let openHold = null;

  events.forEach((e) => {
    if (!e) return;
    if (e.action === 'hold') {
      openHold = { at: e.at, remaining_hours: num(e.remaining_hours) };
      timeline.push({
        action: 'hold',
        at: e.at,
        remaining_hours: num(e.remaining_hours),
        hold_seconds: null,
      });
    } else if (e.action === 'resume') {
      const seconds = openHold ? holdSecondsBetween(openHold.at, e.at) : num(e.hold_seconds);
      timeline.push({
        action: 'resume',
        at: e.at,
        remaining_hours: num(e.remaining_hours),
        hold_seconds: seconds,
        held_from: openHold?.at || null,
      });
      if (openHold) {
        const holdRow = timeline.find((r) => r.action === 'hold' && r.at === openHold.at);
        if (holdRow) holdRow.hold_seconds = seconds;
      }
      openHold = null;
    }
  });

  const currentHoldSeconds = t?.is_on_hold
    ? holdSecondsBetween(t.held_at || openHold?.at, now)
    : 0;

  const storedTotal = num(t?.total_hold_seconds) || 0;
  const derivedTotal = timeline
    .filter((r) => r.action === 'resume')
    .reduce((sum, r) => sum + (r.hold_seconds || 0), 0);

  return {
    assigned_hours: assignedHours(t),
    timer_hours: workTimerBudgetHours(t),
    is_on_hold: !!t?.is_on_hold,
    held_at: t?.held_at || null,
    resumed_at: t?.resumed_at || null,
    remaining_hours: t?.is_on_hold
      ? (num(t.hold_remaining_hours) ?? num(t.hours_to_complete))
      : num(t?.hold_remaining_hours),
    hold_count: num(t?.hold_count) ?? timeline.filter((r) => r.action === 'hold').length,
    resume_count: timeline.filter((r) => r.action === 'resume').length,
    current_hold_seconds: currentHoldSeconds,
    last_hold_seconds: num(t?.last_hold_seconds),
    total_hold_seconds: Math.max(storedTotal, derivedTotal) + currentHoldSeconds,
    timeline,
  };
}

/** Human-readable hold/resume trail for report cells. */
function holdResumeLabel(t, fmtStamp, now = new Date()) {
  const stamp = typeof fmtStamp === 'function'
    ? fmtStamp
    : (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—');
  const s = holdResumeSummary(t, now);
  const bits = [];

  s.timeline.forEach((row) => {
    const remBit = row.remaining_hours != null ? ` · ${row.remaining_hours}h left` : '';
    if (row.action === 'hold') {
      const forBit = row.hold_seconds ? ` for ${fmtDuration(row.hold_seconds)}` : '';
      bits.push(`Hold ${stamp(row.at)}${remBit} (timer stopped${forBit})`);
    } else {
      bits.push(`Resume ${stamp(row.at)}${remBit} (timer restarted)`);
    }
  });

  if (s.is_on_hold) {
    const remBit = s.remaining_hours != null ? ` · ${s.remaining_hours}h left` : '';
    const forBit = s.current_hold_seconds ? ` for ${fmtDuration(s.current_hold_seconds)}` : '';
    bits.push(`On hold since ${stamp(s.held_at)}${remBit} (timer stopped${forBit})`);
  }

  if (!bits.length) return '—';
  if (s.total_hold_seconds > 0) {
    bits.push(`Total hold ${fmtDuration(s.total_hold_seconds)}`);
  }
  return bits.join(' → ');
}

module.exports = {
  VERIFICATION_SLA_HOURS,
  /** @deprecated use VERIFICATION_SLA_HOURS + addWorkingHours */
  VERIFICATION_SLA_MS: VERIFICATION_SLA_HOURS * 60 * 60 * 1000,
  ACCEPT_NUDGE_MINUTES,
  SAME_DAY_MAX_HOURS,
  isFinishedTask,
  isVerificationOverdue,
  verificationWorkDueDate,
  verificationDueAt,
  verificationOverdueWorkingHours,
  isAssignmentOverdue,
  isDelegatedOverdue,
  overdueSource,
  overdueSince,
  overdueCalendarDays,
  overdueWorkingHours,
  originalPlanDate,
  activePlanDate,
  wasRescheduled,
  endOfPlanDay,
  needsReaccept,
  needsAcceptNudge,
  assignedHours,
  assignedWorkDeadline,
  employeeWorkDueDate,
  employeeDueDate,
  workTimerAnchor,
  workTimerBudgetHours,
  holdSecondsBetween,
  holdResumeSummary,
  holdResumeLabel,
  fmtDuration,
};
