/**
 * Fires accept-nudge + insurance renew reminders off ordinary API traffic.
 * Hosting often allows one daily cron; local/dev also piggybacks here.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const OFFICE_START_MIN = 9 * 60 + 30;
const OFFICE_END_MIN = 18 * 60 + 30;

let lastSweepAt = 0;
let sweeping = false;
let lastInsuranceDay = '';
let insuranceSweeping = false;
let lastWeeklyPlanDay = '';
let weeklyPlanSweeping = false;

function istParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return {
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday'),
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function withinOfficeHours(now) {
  const { minutes, weekday } = istParts(now);
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
  Promise.resolve()
    .then(() => require('../lib/taskReminders').runAcceptNudges({ now }))
    .then((r) => {
      if (r && r.sent) console.log('accept-nudge sweep sent', r.sent);
    })
    .catch((err) => console.warn('accept-nudge sweep:', err.message))
    .finally(() => { sweeping = false; });
}

function maybeInsuranceMorning() {
  const now = new Date();
  if (insuranceSweeping) return;
  const { withinInsuranceMorningWindow, runHrAlertReminders } = require('../lib/insuranceReminders');
  if (!withinInsuranceMorningWindow(now)) return;
  const { dayKey } = istParts(now);
  if (lastInsuranceDay === dayKey) return;

  insuranceSweeping = true;
  lastInsuranceDay = dayKey;
  Promise.resolve()
    .then(() => runHrAlertReminders({ now, force: false }))
    .then((r) => {
      if (r?.sent?.length) console.log('HR alerts WA auto-sent', r.sent.length);
      else console.log('HR alerts sweep skipped', r?.skipped?.length || 0, 'hr=', r?.hr_whatsapp);
    })
    .catch((err) => {
      lastInsuranceDay = ''; // allow retry
      console.warn('HR alerts sweep:', err.message);
    })
    .finally(() => { insuranceSweeping = false; });
}

function maybeWeeklyPlanMorning() {
  const now = new Date();
  if (weeklyPlanSweeping) return;
  const { minutes, weekday, dayKey } = istParts(now);
  // Mon–Sat after 08:30 IST (cron is ~08:30 IST → 03:00 UTC)
  if (weekday === 'Sun') return;
  if (minutes < 8 * 60 + 30 || minutes > 11 * 60) return;
  if (lastWeeklyPlanDay === dayKey) return;

  weeklyPlanSweeping = true;
  lastWeeklyPlanDay = dayKey;
  Promise.resolve()
    .then(() => require('../lib/weeklyPlanDayList').runWeeklyPlanDayListCron({ now }))
    .then((r) => {
      console.log('weekly-plan day-list sweep sent', r?.sent || 0, 'skipped', r?.skipped || 0);
    })
    .catch((err) => {
      lastWeeklyPlanDay = '';
      console.warn('weekly-plan day-list sweep:', err.message);
    })
    .finally(() => {
      weeklyPlanSweeping = false;
    });
}

module.exports = function reminderSweep(req, res, next) {
  // Don't piggyback heavy sweeps onto WhatsApp webhook (Meta needs a fast reply handler).
  const p = String(req.path || '');
  if (p.includes('/whatsapp/webhook')) return next();

  res.on('finish', () => {
    try {
      maybeSweep();
      maybeInsuranceMorning();
      maybeWeeklyPlanMorning();
    } catch (_) { /* never affect the request */ }
  });
  next();
};
