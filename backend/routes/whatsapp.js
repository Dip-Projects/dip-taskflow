const express = require('express');
const supabase = require('../lib/supabaseClient');
const {
  normalizeWhatsAppNumber,
  sendWhatsAppText,
} = require('../lib/whatsapp');

const router = express.Router();

const VERIFY_TOKEN =
  process.env.META_WEBHOOK_VERIFY_TOKEN ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  'dip-taskflow-wa';

/** Meta webhook verification (subscribe). */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function extractInbound(body) {
  const out = [];
  const entries = body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const msg of messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from) || contacts[0];
        out.push({
          from: msg.from,
          type: msg.type,
          text: msg.text?.body || '',
          buttonPayload:
            msg.button?.payload ||
            msg.interactive?.button_reply?.id ||
            msg.interactive?.list_reply?.id ||
            null,
          buttonText:
            msg.button?.text ||
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            null,
          contactName: contact?.profile?.name || null,
        });
      }
    }
  }
  return out;
}

async function findUserByWhatsApp(fromRaw) {
  const normalized = normalizeWhatsAppNumber(fromRaw);
  if (!normalized) return null;

  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, username')
    .not('whatsapp_number', 'is', null);

  if (error) {
    console.error('WA user lookup failed:', error.message);
    return null;
  }

  return (
    (users || []).find((u) => normalizeWhatsAppNumber(u.whatsapp_number) === normalized) ||
    null
  );
}

async function completeTaskFromWhatsApp(taskId, user) {
  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, assigned_to, status, description')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) return { ok: false, reason: 'not_found' };
  if (task.assigned_to !== user.id) return { ok: false, reason: 'forbidden' };
  if (task.status === 'Completed' || task.status === 'Rejected') {
    return { ok: true, already: true, task };
  }

  const at = new Date().toISOString();
  const updates = {
    status: 'Completed',
    completed_at: at,
    status_note: `Completed via WhatsApp by ${user.full_name || user.username}`,
  };

  let { error: upErr } = await supabase.from('tasks').update(updates).eq('id', taskId);
  if (upErr && /completed_at|status_note/i.test(upErr.message || '')) {
    const slim = { status: 'Completed' };
    const retry = await supabase.from('tasks').update(slim).eq('id', taskId);
    upErr = retry.error;
  }
  if (upErr) {
    console.error('WA complete failed:', upErr.message);
    return { ok: false, reason: 'update_failed' };
  }
  return { ok: true, task };
}

router.post('/webhook', async (req, res) => {
  // Always ack quickly so Meta does not retry.
  res.sendStatus(200);

  try {
    const inbound = extractInbound(req.body);
    for (const msg of inbound) {
      const payload = String(msg.buttonPayload || msg.text || '').trim();
      const doneMatch = payload.match(/^tf_done_([0-9a-f-]{36})$/i);
      if (!doneMatch) continue;

      const user = await findUserByWhatsApp(msg.from);
      if (!user) {
        console.warn('WA Done: unknown number', msg.from);
        continue;
      }

      const result = await completeTaskFromWhatsApp(doneMatch[1], user);
      if (result.ok) {
        const label = result.already ? 'already marked complete' : 'marked complete';
        await sendWhatsAppText(
          msg.from,
          `✅ Task ${label}.\n${(result.task?.description || '').slice(0, 120)}\n\nYou can also manage tasks in Site Portal → My Tasks.`
        );
      } else if (result.reason === 'forbidden') {
        await sendWhatsAppText(msg.from, 'That task is not assigned to you.');
      } else if (result.reason === 'not_found') {
        await sendWhatsAppText(msg.from, 'Task not found or already removed.');
      } else {
        await sendWhatsAppText(msg.from, 'Could not complete the task. Please use Site Portal → My Tasks.');
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook handler error:', err.message);
  }
});

module.exports = router;
