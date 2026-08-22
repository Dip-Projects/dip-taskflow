/** Office hours helper (9:30–18:30, lunch 13–14, Sun off). */

function atTime(date, h, m) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function snapToWorkingMoment(date) {
  let d = new Date(date);
  const startH = 9, startM = 30, endH = 18, endM = 30;
  for (let guard = 0; guard < 40; guard++) {
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
      d = atTime(d, startH, startM);
      continue;
    }
    const dayStart = atTime(d, startH, startM);
    const dayEnd = atTime(d, endH, endM);
    const lunchStart = atTime(d, 13, 0);
    const lunchEnd = atTime(d, 14, 0);
    if (d < dayStart) { d = dayStart; continue; }
    if (d >= dayEnd) {
      d.setDate(d.getDate() + 1);
      d = atTime(d, startH, startM);
      continue;
    }
    if (d >= lunchStart && d < lunchEnd) { d = new Date(lunchEnd); continue; }
    return d;
  }
  return d;
}

function addWorkingHours(startDate, hours) {
  let remainingMs = (Number(hours) || 0) * 3600000;
  let current = snapToWorkingMoment(new Date(startDate));
  if (remainingMs <= 0) return current;
  for (let guard = 0; guard < 1000 && remainingMs > 0; guard++) {
    const dayEnd = atTime(current, 18, 30);
    const lunchStart = atTime(current, 13, 0);
    const segmentEnd = current < lunchStart ? lunchStart : dayEnd;
    const availableMs = segmentEnd - current;
    if (remainingMs <= availableMs) {
      current = new Date(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= availableMs;
      current = snapToWorkingMoment(segmentEnd);
    }
  }
  return current;
}

/** Working hours elapsed between two instants (office hours, minus lunch, Sun off). */
function elapsedWorkingHours(startDate, endDate) {
  const start = snapToWorkingMoment(new Date(startDate));
  const end = snapToWorkingMoment(new Date(endDate));
  if (!start || !end || end <= start) return 0;
  let totalMs = 0;
  let current = new Date(start);
  for (let guard = 0; guard < 1000 && current < end; guard++) {
    const dayEnd = atTime(current, 18, 30);
    const lunchStart = atTime(current, 13, 0);
    const segmentEnd = current < lunchStart ? lunchStart : dayEnd;
    const effectiveEnd = end < segmentEnd ? end : segmentEnd;
    if (effectiveEnd > current) totalMs += effectiveEnd - current;
    if (end <= segmentEnd) break;
    current = snapToWorkingMoment(segmentEnd);
  }
  return totalMs / 3600000;
}

function addCalendarDays(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
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
