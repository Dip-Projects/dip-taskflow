/**
 * MIS-controlled switches for the automated task reminders.
 * Stored as one row in app_settings (key = 'task_reminders'), so turning a
 * reminder off is a setting change, not a code deploy.
 */
const supabase = require('./supabaseClient');

const SETTINGS_KEY = 'task_reminders';

const DEFAULTS = {
  /** Daily WhatsApp to the employee for every task past its work deadline. */
  daily_overdue_whatsapp: true,
  /** Also copy the employee's reporting head on the daily overdue message. */
  daily_overdue_notify_head: false,
  /** "Accept it or ask for a reschedule" nudge on short same-day tasks. */
  accept_nudge_whatsapp: true,
  /** Minutes to wait before the accept nudge fires. */
  accept_nudge_minutes: 20,
  /** Tasks at or under this many hours count as "finish it today". */
  accept_nudge_max_hours: 4,
  /** Ignore anything that was already overdue before this date. */
  overdue_since_date: '2026-08-15',
};

const FIELD_TYPES = {
  daily_overdue_whatsapp: 'bool',
  daily_overdue_notify_head: 'bool',
  accept_nudge_whatsapp: 'bool',
  accept_nudge_minutes: 'int',
  accept_nudge_max_hours: 'number',
  overdue_since_date: 'date',
};

function coerce(key, value) {
  const type = FIELD_TYPES[key];
  if (type === 'bool') return value === true || value === 'true' || value === 1 || value === '1';
  if (type === 'int') {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? DEFAULTS[key] : Math.max(1, Math.min(600, n));
  }
  if (type === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? DEFAULTS[key] : Math.max(0.5, Math.min(24, n));
  }
  if (type === 'date') {
    const s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : DEFAULTS[key];
  }
  return value;
}

function mergeSettings(saved) {
  const out = { ...DEFAULTS };
  if (!saved || typeof saved !== 'object') return out;
  Object.keys(DEFAULTS).forEach((k) => {
    if (saved[k] !== undefined) out[k] = coerce(k, saved[k]);
  });
  return out;
}

/** Never throws — a missing app_settings table just yields the defaults. */
async function getReminderSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    if (error) return { ...DEFAULTS };
    return mergeSettings(data?.value);
  } catch (_) {
    return { ...DEFAULTS };
  }
}

async function saveReminderSettings(patch, userId) {
  const merged = mergeSettings({ ...(await getReminderSettings()), ...(patch || {}) });
  const { error } = await supabase.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value: merged,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  });
  if (error) {
    const err = new Error('Run backend/sql/add_nav_visibility.sql in Supabase, then save again.');
    err.settings = merged;
    throw err;
  }
  return merged;
}

module.exports = { SETTINGS_KEY, DEFAULTS, mergeSettings, getReminderSettings, saveReminderSettings };
