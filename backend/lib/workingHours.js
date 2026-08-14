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

function addCalendarDays(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

module.exports = { addWorkingHours, addCalendarDays, snapToWorkingMoment };
