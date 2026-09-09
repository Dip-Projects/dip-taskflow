/**
 * Insurance renew WhatsApp reminders (3–4 days before renew_date, morning ~8 IST).
 * Message includes POST-sheet style details so HR can renew.
 */
const supabase = require('./supabaseClient');
const { sendWhatsAppText } = require('./whatsapp');

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
    let okAny = false;
    for (const t of targets) {
      try {
        const result = await sendWhatsAppText(t.to, msg);
        if (result?.ok) {
          okAny = true;
          sent.push({
            type: 'insurance_renew',
            to: t.to,
            via: t.kind,
            name: row.employee_name,
            renew_date: row.renew_date,
            days_until: days,
          });
        }
      } catch (e) {
        console.warn('insurance WA fail', row.employee_name, e.message);
      }
    }
    if (okAny) log[key] = new Date().toISOString();
  }

  await writeJson(REMINDER_LOG_PATH, log);
  return { ok: true, sent, skipped, hr_whatsapp: hrWa ? 'set' : 'missing' };
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
  // ~7:50 – 8:40 IST
  return minutes >= 7 * 60 + 50 && minutes <= 8 * 60 + 40;
}

module.exports = {
  runInsuranceRenewReminders,
  withinInsuranceMorningWindow,
  buildRenewMessage,
  daysUntilDate,
  resolveHrWhatsApp,
  DEFAULT_HR_WHATSAPP,
  RENEW_WINDOW_DAYS,
};
