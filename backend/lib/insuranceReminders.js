/**
 * Insurance renew WhatsApp reminders (3–4 days before renew_date, morning ~8 IST).
 * Message includes POST-sheet style details so HR can renew.
 */
const supabase = require('./supabaseClient');
const { sendHrAlertWhatsApp } = require('./whatsapp');

const BUCKET = 'documents';
const INSURANCE_PATH = 'hr/_meta/insurances.json';
const PROFILES_PATH = 'hr/_meta/employee_profiles.json';
const REMINDER_LOG_PATH = 'hr/_meta/reminder_log.json';

const RENEW_WINDOW_DAYS = 4; // 3–4 days prior + overdue

async function ensureBucket() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '50MB' }).catch(() => {});
}

async function readJson(path, fallback) {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return fallback;
  try {
    return JSON.parse(await data.text());
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

function daysUntilDate(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target - start) / 86400000);
}

function istTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function buildRenewMessage(row, days) {
  const when =
    days < 0
      ? `OVERDUE by ${Math.abs(days)} day(s)`
      : days === 0
        ? 'TODAY'
        : `in ${days} day(s)`;
  const lines = [
    'DIP HR · Insurance renew reminder',
    `Employee: ${row.employee_name}`,
    `Renew / arrange by: ${row.renew_date} (${when})`,
    `Policy: ${row.policy_type || 'Accidental'}${row.insurance_period ? ` | ${row.insurance_period}` : ''}`,
    `Premium amount: ₹${row.amount ?? '—'}`,
  ];
  if (row.designation) lines.push(`Designation: ${row.designation}`);
  if (row.joining_date) lines.push(`Joining: ${row.joining_date}`);
  if (row.whatsapp_number) lines.push(`Contact: ${row.whatsapp_number}`);
  if (row.aadhaar) lines.push(`Aadhaar: ${row.aadhaar}`);
  if (row.pan) lines.push(`PAN: ${row.pan}`);
  if (row.height || row.weight) lines.push(`Height/Weight: ${row.height || '—'} / ${row.weight || '—'}`);
  if (row.medical_condition) lines.push(`Medical: ${row.medical_condition}`);
  if (row.nominee_details) lines.push(`Nominee: ${row.nominee_details}`);
  if (row.assigned_to) lines.push(`Assigned: ${row.assigned_to}`);
  if (row.status) lines.push(`Status: ${row.status}`);
  lines.push('Please renew / arrange this insurance with the above details.');
  return lines.join('\n');
}

/** Fixed HR inbox — birthday + insurance reminders only go here. */
const DEFAULT_HR_WHATSAPP = '9313605627';

async function resolveHrWhatsApp() {
  const fromEnv = String(process.env.HR_WHATSAPP_NUMBER || '').trim();
  return fromEnv || DEFAULT_HR_WHATSAPP;
}

/**
 * @param {{ force?: boolean, now?: Date }} opts
 */
async function runInsuranceRenewReminders(opts = {}) {
  const now = opts.now || new Date();
  const todayKey = istTodayKey(now);
  const insurances = await readJson(INSURANCE_PATH, []);
  const profiles = await readJson(PROFILES_PATH, []);
  const log = await readJson(REMINDER_LOG_PATH, {});
  const hrWa = await resolveHrWhatsApp();
  const sent = [];
  const skipped = [];

  for (const row of insurances) {
    const days = daysUntilDate(row.renew_date, now);
    if (days == null) continue;
    if (days > RENEW_WINDOW_DAYS) continue;

    const key = `ins-renew:${row.id}:${todayKey}`;
    if (!opts.force && log[key]) {
      skipped.push({ name: row.employee_name, reason: 'already_sent_today' });
      continue;
    }

    const prof = profiles.find(
      (p) =>
        (row.employee_id && p.employee_id === row.employee_id) ||
        String(p.employee_name || '').toLowerCase() === String(row.employee_name || '').toLowerCase()
    );
    const enriched = {
      ...row,
      whatsapp_number: row.whatsapp_number || prof?.whatsapp_number || '',
      aadhaar: row.aadhaar || prof?.aadhaar || '',
      pan: row.pan || prof?.pan || '',
      designation: row.designation || prof?.designation || '',
    };

    // Always only the fixed HR WhatsApp number (never employee).
    if (!hrWa) {
      skipped.push({ name: row.employee_name, reason: 'no_whatsapp' });
      continue;
    }
    const targets = [{ to: hrWa, kind: 'hr' }];

    const msg = buildRenewMessage(enriched, days);
    const whenLabel =
      days < 0 ? `OVERDUE ${Math.abs(days)}d` : days === 0 ? 'TODAY' : `${days}d`;
    let okAny = false;
    let lastErr = null;
    for (const t of targets) {
      try {
        const result = await sendHrAlertWhatsApp(t.to, {
          title: 'HR · Insurance renew',
          detail: msg,
          dueLabel: whenLabel,
          priority: days <= 0 ? 'Urgent' : 'High',
        });
        if (result?.ok) {
          okAny = true;
          sent.push({
            type: 'insurance_renew',
            to: t.to,
            via: result.via || t.kind,
            name: row.employee_name,
            renew_date: row.renew_date,
            days_until: days,
          });
        } else {
          lastErr = result?.error || result?.reason || 'send_failed';
          skipped.push({
            name: row.employee_name,
            reason: lastErr,
          });
        }
      } catch (e) {
        console.warn('insurance WA fail', row.employee_name, e.message);
        skipped.push({ name: row.employee_name, reason: e.message });
      }
    }
    if (okAny) log[key] = new Date().toISOString();
  }

  await writeJson(REMINDER_LOG_PATH, log);
  return { ok: true, sent, skipped, hr_whatsapp: hrWa ? 'set' : 'missing' };
}

function daysUntilNextBirthday(dobStr, today = new Date()) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const y = today.getFullYear();
  let next = new Date(y, dob.getMonth(), dob.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < start) next = new Date(y + 1, dob.getMonth(), dob.getDate());
  return Math.round((next - start) / 86400000);
}

/**
 * Birthday reminders (next 7 days) → fixed HR WhatsApp only.
 * @param {{ force?: boolean, now?: Date }} opts
 */
async function runBirthdayReminders(opts = {}) {
  const now = opts.now || new Date();
  const todayKey = istTodayKey(now);
  const profiles = await readJson(PROFILES_PATH, []);
  const log = await readJson(REMINDER_LOG_PATH, {});
  const hrWa = await resolveHrWhatsApp();
  const sent = [];
  const skipped = [];

  if (!hrWa) {
    return { ok: false, sent, skipped: [{ reason: 'no_whatsapp' }], hr_whatsapp: 'missing' };
  }

  for (const p of profiles) {
    const days = daysUntilNextBirthday(p.dob, now);
    if (days == null || days < 0 || days > 7) continue;
    const key = `bday:${p.employee_id || p.id}:${todayKey}:${days}`;
    if (!opts.force && log[key]) {
      skipped.push({ name: p.employee_name || p.name, reason: 'already_sent_today' });
      continue;
    }
    const when = days === 0 ? 'today' : `in ${days} day(s)`;
    const name = p.employee_name || p.name || 'Employee';
    const detail = `Birthday of ${name} is ${when} (${p.dob || '—'}). Please wish / arrange accordingly.`;
    try {
      const result = await sendHrAlertWhatsApp(hrWa, {
        title: 'HR · Birthday reminder',
        detail,
        dueLabel: when,
        priority: days <= 1 ? 'Urgent' : 'High',
      });
      if (result?.ok) {
        log[key] = new Date().toISOString();
        sent.push({ type: 'birthday', to: hrWa, name, via: result.via || 'whatsapp' });
      } else {
        skipped.push({
          name,
          reason: result?.error || result?.reason || 'send_failed',
        });
      }
    } catch (e) {
      skipped.push({ name, reason: e.message });
    }
  }

  await writeJson(REMINDER_LOG_PATH, log);
  return { ok: true, sent, skipped, hr_whatsapp: hrWa ? 'set' : 'missing' };
}

/**
 * Full HR alert blast: birthdays + insurance renew (no click needed for cron/auto).
 * @param {{ force?: boolean, now?: Date }} opts
 */
async function runHrAlertReminders(opts = {}) {
  const bday = await runBirthdayReminders(opts);
  const ins = await runInsuranceRenewReminders(opts);
  return {
    ok: true,
    hr_whatsapp: (await resolveHrWhatsApp()) || null,
    sent: [...(bday.sent || []), ...(ins.sent || [])],
    skipped: [...(bday.skipped || []), ...(ins.skipped || [])],
    birthday: bday,
    insurance: ins,
  };
}

function withinInsuranceMorningWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const weekday = get('weekday');
  if (weekday === 'Sun') return false;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  // ~7:45 – 9:30 IST — cron at 8:00 + first portal open of morning
  return minutes >= 7 * 60 + 45 && minutes <= 9 * 60 + 30;
}

module.exports = {
  runInsuranceRenewReminders,
  runBirthdayReminders,
  runHrAlertReminders,
  withinInsuranceMorningWindow,
  buildRenewMessage,
  daysUntilDate,
  daysUntilNextBirthday,
  resolveHrWhatsApp,
  istTodayKey,
  DEFAULT_HR_WHATSAPP,
  RENEW_WINDOW_DAYS,
};
