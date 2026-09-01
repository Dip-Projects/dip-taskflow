/**
 * Fires the accept-nudge check off the back of ordinary API traffic.
 *
 * The nudge is only useful with ~15-minute granularity, and the hosting plan
 * allows a single daily cron, so instead of scheduling we sweep at most once
 * every SWEEP_INTERVAL_MS whenever someone uses the app. The task itself is
 * marked with accept_reminder_sent_at, so a duplicate sweep sends nothing.
 *
 * Never blocks or fails a request — the sweep runs after the response is on
 * its way and swallows its own errors.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

// Office hours in IST; outside these the nudge would be noise.
const OFFICE_START_MIN = 9 * 60 + 30;
const OFFICE_END_MIN = 18 * 60 + 30;

let lastSweepAt = 0;
let sweeping = false;

function istMinutesOfDay(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return {
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday'),
  };
}

function withinOfficeHours(now) {
  const { minutes, weekday } = istMinutesOfDay(now);
  if (weekday === 'Sun') return false;
  return minutes >= OFFICE_START_MIN && minutes <= OFFICE_END_MIN;
}

function maybeSweep() {
  const now = new Date();
  if (sweeping) return;
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  if (!withinOfficeHours(now)) return;

  lastSweepAt = now.getTime();
  sweeping = true;
  // Required lazily so a missing table/env never breaks app start-up.
  Promise.resolve()
    .then(() => require('../lib/taskReminders').runAcceptNudges({ now }))
    .then((r) => {
      if (r && r.sent) console.log('accept-nudge sweep sent', r.sent);
    })
    .catch((err) => console.warn('accept-nudge sweep:', err.message))
    .finally(() => { sweeping = false; });
}

module.exports = function reminderSweep(req, res, next) {
  res.on('finish', () => {
    try { maybeSweep(); } catch (_) { /* never affect the request */ }
  });
  next();
};
