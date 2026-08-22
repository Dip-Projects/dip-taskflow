/**
 * Shared overdue rules for delegated tasks (Office + DIP Bot).
 * - Assignment: timer starts at accepted_at + hours_to_complete (office hours)
 * - Verification: 2h SLA from verification_started_at (Start Verification click)
 */
const { addWorkingHours } = require('./workingHours');

const VERIFICATION_SLA_MS = 2 * 60 * 60 * 1000;

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

function isVerificationOverdue(t, now = new Date()) {
  if (String(t?.verification_status || '') !== 'Pending Verification') return false;
  if (!t?.verification_started_at) return false;
  const started = new Date(t.verification_started_at);
  if (Number.isNaN(started.getTime())) return false;
  return (now - started) >= VERIFICATION_SLA_MS;
}

function isAssignmentOverdue(t, now = new Date()) {
  if (isFinishedTask(t)) return false;
  if (t?.is_on_hold) return false;
  if (String(t?.verification_status || '') === 'Pending Verification') return false;
  if (!t?.accepted_at) return false;
  const hours = Number(t.hours_to_complete);
  if (!hours || hours <= 0) return false;
  const due = addWorkingHours(t.accepted_at, hours);
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

function employeeWorkDueDate(t) {
  if (!t?.accepted_at) return null;
  const hours = Number(t.hours_to_complete);
  if (!hours || hours <= 0) return null;
  return addWorkingHours(t.accepted_at, hours);
}

module.exports = {
  VERIFICATION_SLA_MS,
  isFinishedTask,
  isVerificationOverdue,
  isAssignmentOverdue,
  isDelegatedOverdue,
  overdueSource,
  employeeWorkDueDate,
};
