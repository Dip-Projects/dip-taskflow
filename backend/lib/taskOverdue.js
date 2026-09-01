/**
 * Shared overdue rules for delegated tasks (Office + DIP Bot).
 * - Assignment: timer starts at accepted_at + hours_to_complete (office hours)
 *   After hold/resume: anchor = resumed_at, budget = hold_remaining_hours
 * - Pre-accept deadline display: assigned_at + hours_to_complete
 * - Verification: 2 working hours from verification_started_at (Start Verification click)
 */
const { addWorkingHours, elapsedWorkingHours } = require('./workingHours');

const VERIFICATION_SLA_HOURS = 2;

function verificationWorkDueDate(t) {
  if (!t?.verification_started_at) return null;
  const started = new Date(t.verification_started_at);
  if (Number.isNaN(started.getTime())) return null;
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

/** Active work-timer anchor (last resume or original accept). */
function workTimerAnchor(t) {
  if (t?.is_on_hold) return t.resumed_at || t.accepted_at || null;
  if (t?.resumed_at) return t.resumed_at;
  return t?.accepted_at || null;
}

/** Remaining work-hour budget for the active segment. */
function workTimerBudgetHours(t) {
  if (t?.is_on_hold) {
    const rem = Number(t.hold_remaining_hours);
    if (rem > 0) return rem;
    return Number(t.hours_to_complete) || 0;
  }
  if (t?.resumed_at && t.hold_remaining_hours != null) {
    return Number(t.hold_remaining_hours) || 0;
  }
  return Number(t.hours_to_complete) || 0;
}

/** Pre-accept deadline: assigned_at + original hours (display only). */
function assignedWorkDeadline(t) {
  const start = t?.assigned_at || t?.created_at;
  const hours = Number(t?.hours_to_complete);
  if (!start || !hours || hours <= 0) return null;
  return addWorkingHours(start, hours);
}

function employeeWorkDueDate(t) {
  if (!t?.accepted_at) return null;
  const anchor = workTimerAnchor(t);
  const hours = workTimerBudgetHours(t);
  if (!anchor || !hours || hours <= 0) return null;
  return addWorkingHours(anchor, hours);
}

function verificationOverdueWorkingHours(t, now = new Date()) {
  const due = verificationWorkDueDate(t);
  if (!due || now <= due) return 0;
  return Math.max(0, Math.round(elapsedWorkingHours(due, now) * 10) / 10);
}

function isAssignmentOverdue(t, now = new Date()) {
  if (isFinishedTask(t)) return false;
  if (t?.is_on_hold) return false;
  if (String(t?.verification_status || '') === 'Pending Verification') return false;
  if (!t?.accepted_at) return false;
  const due = employeeWorkDueDate(t);
  if (!due) return false;
  return now > due;
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

function holdResumeSummary(t) {
  const events = Array.isArray(t?.task_events) ? t.task_events : [];
  const holds = events.filter((e) => e.action === 'hold');
  const resumes = events.filter((e) => e.action === 'resume');
  const orig = t?.original_hours_to_complete != null
    ? Number(t.original_hours_to_complete)
    : Number(t?.hours_to_complete) || 0;
  return {
    original_hours: orig,
    remaining_hours: t?.is_on_hold
      ? Number(t.hold_remaining_hours ?? t.hours_to_complete) || 0
      : (t?.hold_remaining_hours != null ? Number(t.hold_remaining_hours) : null),
    held_at: t?.held_at || null,
    resumed_at: t?.resumed_at || null,
    is_on_hold: !!t?.is_on_hold,
    hold_count: holds.length,
    resume_count: resumes.length,
    history: events
      .filter((e) => e.action === 'hold' || e.action === 'resume')
      .map((e) => ({
        action: e.action,
        at: e.at,
        remaining_hours: e.remaining_hours ?? null,
      })),
  };
}

module.exports = {
  VERIFICATION_SLA_HOURS,
  /** @deprecated use VERIFICATION_SLA_HOURS + addWorkingHours */
  VERIFICATION_SLA_MS: VERIFICATION_SLA_HOURS * 60 * 60 * 1000,
  isFinishedTask,
  isVerificationOverdue,
  verificationWorkDueDate,
  verificationDueAt,
  verificationOverdueWorkingHours,
  isAssignmentOverdue,
  isDelegatedOverdue,
  overdueSource,
  assignedWorkDeadline,
  employeeWorkDueDate,
  workTimerAnchor,
  workTimerBudgetHours,
  holdResumeSummary,
};
