/** Office hours helper (9:30–18:30 IST, lunch 13–14, Sun off). */

// These calculations decide task deadlines, overdue state and how much of a
// hold counted against the clock, so they must not depend on the zone the
// process happens to run in — Vercel functions run in UTC. India keeps a fixed
// +05:30 offset with no DST, so shifting an instant by that amount and reading
// it with the getUTC* accessors gives IST wall-clock time anywhere.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_START_H = 9;
const DAY_START_M = 30;
const DAY_END_H = 18;
const DAY_END_M = 30;
const LUNCH_START_H = 13;
const LUNCH_END_H = 14;

/** Instant -> a Date whose getUTC* fields read as IST wall-clock. */
function toIst(date) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS);
}

/** IST wall-clock Date -> the real instant it represents. */
function fromIst(ist) {
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Same IST day, at the given IST hour and minute. */
function atIst(ist, h, m) {
  const d = new Date(ist);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

function nextIstMorning(ist) {
  const d = new Date(ist);
  d.setUTCDate(d.getUTCDate() + 1);
  return atIst(d, DAY_START_H, DAY_START_M);
}

/** Moves an IST instant forward to the next moment that is actual work time. */
function snapIst(ist) {
  let d = new Date(ist);
  for (let guard = 0; guard < 40; guard++) {
    if (d.getUTCDay() === 0) { d = nextIstMorning(d); continue; }
    const dayStart = atIst(d, DAY_START_H, DAY_START_M);
    const dayEnd = atIst(d, DAY_END_H, DAY_END_M);
    const lunchStart = atIst(d, LUNCH_START_H, 0);
    const lunchEnd = atIst(d, LUNCH_END_H, 0);
    if (d < dayStart) { d = dayStart; continue; }
    if (d >= dayEnd) { d = nextIstMorning(d); continue; }
    if (d >= lunchStart && d < lunchEnd) { d = new Date(lunchEnd); continue; }
    return d;
  }
  return d;
}

/** End of the work segment the IST instant sits in (lunch break or day end). */
function segmentEndIst(ist) {
  const lunchStart = atIst(ist, LUNCH_START_H, 0);
  return ist < lunchStart ? lunchStart : atIst(ist, DAY_END_H, DAY_END_M);
}

function snapToWorkingMoment(date) {
  return fromIst(snapIst(toIst(date)));
}

function addWorkingHours(startDate, hours) {
  let remainingMs = (Number(hours) || 0) * 3600000;
  let current = snapIst(toIst(startDate));
  if (remainingMs <= 0) return fromIst(current);
  for (let guard = 0; guard < 1000 && remainingMs > 0; guard++) {
    const segEnd = segmentEndIst(current);
    const availableMs = segEnd - current;
    if (remainingMs <= availableMs) {
      current = new Date(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= availableMs;
      current = snapIst(segEnd);
    }
  }
  return fromIst(current);
}

/** Working hours elapsed between two instants (office hours, minus lunch, Sun off). */
function elapsedWorkingHours(startDate, endDate) {
  const start = snapIst(toIst(startDate));
  const end = snapIst(toIst(endDate));
  if (!start || !end || end <= start) return 0;
  let totalMs = 0;
  let current = new Date(start);
  for (let guard = 0; guard < 1000 && current < end; guard++) {
    const segEnd = segmentEndIst(current);
    const effectiveEnd = end < segEnd ? end : segEnd;
    if (effectiveEnd > current) totalMs += effectiveEnd - current;
    if (end <= segEnd) break;
    current = snapIst(segEnd);
  }
  return totalMs / 3600000;
}

/** Adds whole days on the IST calendar, keeping the time of day. */
function addCalendarDays(startDate, days) {
  const ist = toIst(startDate);
  ist.setUTCDate(ist.getUTCDate() + Number(days || 0));
  return fromIst(ist);
}

/** Employee-facing due: assign/create time + working hours (IST). */
function fmtEmployeeDueLabel(startIso, hours) {
  const start = startIso || new Date().toISOString();
  const due = hours == null || hours === ''
    ? new Date(start)
    : addWorkingHours(start, hours);
  const label = due.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return hours != null && hours !== '' ? `${label} · ${hours}h` : label;
}

module.exports = {
  addWorkingHours,
  addCalendarDays,
  snapToWorkingMoment,
  fmtEmployeeDueLabel,
  elapsedWorkingHours,
};
