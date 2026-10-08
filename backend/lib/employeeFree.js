/**
 * "Employee is free" alert → Kishan Kalsariya (WhatsApp).
 *
 * Fires when an employee's last open task gets off their plate:
 *   - they send it for verification, or it is completed / rejected.
 * An employee is "free" when every task of theirs is Completed, Rejected,
 * Verified, or waiting in Pending Verification (their part is done).
 * Tasks on hold / ticket raised / sent back for correction still count as open.
 */
const supabase = require('./supabaseClient');
const { sendWhatsAppText, sendWhatsAppTemplate } = require('./whatsapp');

const recentlyNotified = new Map(); // userId -> ms (guards double-clicks / retries)
const COOLDOWN_MS = 10 * 60 * 1000;

async function findKishan() {
  const { data: byUser } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number')
    .eq('username', 'kishan.k')
    .maybeSingle();
  if (byUser?.whatsapp_number) return byUser;
  const { data: named } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number')
    .eq('is_active', true)
    .ilike('full_name', '%kishan%');
  const list = named || [];
  return (
    list.find((u) => u.whatsapp_number && /kalsariya/i.test(u.full_name || '')) ||
    list.find((u) => u.whatsapp_number) ||
    null
  );
}

async function hasOpenWork(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, status, verification_status')
    .eq('assigned_to', userId)
    .neq('status', 'Completed')
    .neq('status', 'Rejected');
  if (error) throw error;
  return (data || []).some((t) => {
    const vs = String(t.verification_status || '');
    return vs !== 'Pending Verification' && vs !== 'Verified';
  });
}

/** Never throws. Safe to await after a task update. */
async function notifyIfEmployeeFree(userId) {
  try {
    if (!userId) return;
    const last = recentlyNotified.get(userId);
    if (last && Date.now() - last < COOLDOWN_MS) return;

    const { data: emp } = await supabase
      .from('users')
      .select('id, full_name, role, department, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (!emp || emp.is_active === false) return;
    if (String(emp.role || '').toLowerCase() === 'client' || /client/i.test(emp.department || '')) return;

    if (await hasOpenWork(userId)) return;

    const kishan = await findKishan();
    if (!kishan?.whatsapp_number || kishan.id === emp.id) return;

    recentlyNotified.set(userId, Date.now());
    const name = emp.full_name || 'An employee';
    const text =
      `✅ ${name} is now free — no pending tasks left.\n` +
      `You can assign new work from the "Pre-defined Task List".`;

    const viaText = await sendWhatsAppText(kishan.whatsapp_number, text);
    if (viaText?.ok) return;

    // Outside Meta's 24h window free text is rejected → utility template instead.
    const tmpl =
      process.env.WHATSAPP_EMP_FREE_TEMPLATE ||
      process.env.WHATSAPP_TASK_LIST_TEMPLATE ||
      'task_notification_v2';
    await sendWhatsAppTemplate(kishan.whatsapp_number, tmpl, [
      kishan.full_name || 'Kishan',
      `${name} is now free — no pending tasks. Please assign new work.`,
      'Team availability',
      new Date().toISOString().slice(0, 10),
      'Free',
    ]);
  } catch (err) {
    console.warn('notifyIfEmployeeFree skip:', err.message);
  }
}

module.exports = { notifyIfEmployeeFree };
