const express = require('express');
const supabase = require('../lib/supabaseClient');
const {
  normalizeWhatsAppNumber,
  sendWhatsAppText,
} = require('../lib/whatsapp');
const {
  sendOpenTasksListPicker,
  completeAllOpenTasksForUser,
  runOpenTasksListDigestCron,
  sendDayListToBeenaNow,
  loadOpenTasksForUser,
  loadTasksForUser,
  formatStatusSummary,
  istYmd,
} = require('../lib/taskListDigest');
const { requireAuth } = require('../middleware/auth');

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

async function afterSingleComplete(from, user, result) {
  if (result.ok) {
    const dayYmd = istYmd();
    const bundle = await loadTasksForUser(user.id, { dayYmd });
    const summary = formatStatusSummary({
      ...bundle,
      justDoneLabel: result.task?.description || 'Task',
    });
    await sendWhatsAppText(from, summary);
    if (bundle.open.length) {
      await sendOpenTasksListPicker(from, user.id, {
        fullName: user.full_name || user.username,
        dayYmd,
      });
    }
    return;
  }
  if (result.reason === 'forbidden') {
    await sendWhatsAppText(from, 'That task is not assigned to you.');
  } else if (result.reason === 'not_found') {
    await sendWhatsAppText(from, 'Task not found or already removed.');
  } else {
    await sendWhatsAppText(from, 'Could not complete the task. Please use Site Portal → My Tasks.');
  }
}

function parseNumberReply(text, openTasks) {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'ALL' || raw === 'DONE ALL' || raw === 'HO GAYA') return { all: true };
  if (raw === 'LIST' || raw === 'TASKS' || raw === 'MENU') return { list: true };

  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const idxs = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 1 || n > openTasks.length) return null;
    idxs.push(n - 1);
  }
  if (!idxs.length) return null;
  return { indexes: [...new Set(idxs)] };
}

router.post('/webhook', async (req, res) => {
  // Always ack quickly so Meta does not retry.
  res.sendStatus(200);

  try {
    const inbound = extractInbound(req.body);
    for (const msg of inbound) {
      const payload = String(msg.buttonPayload || '').trim();
      const text = String(msg.text || '').trim();
      const user = await findUserByWhatsApp(msg.from);
      if (!user) {
        if (payload || text) console.warn('WA: unknown number', msg.from);
        continue;
      }

      // EA upload reminder from list
      const eaMatch = payload.match(/^tf_ea_([0-9a-f-]{36})$/i);
      if (eaMatch) {
        const base =
          process.env.PUBLIC_APP_URL ||
          process.env.APP_URL ||
          'https://dip-taskflow.vercel.app';
        await sendWhatsAppText(
          msg.from,
          `📋 EA weekly plan upload still pending.\nOpen: ${base.replace(/\/$/, '')}/site/qr-scan?code=DIP-EA-MEETING\n\nAfter upload it will show as Done in Site → My Tasks.\nData table: ea_meeting_attendance`
        );
        continue;
      }

      // List / button: Mark ALL done (today + overdue only)
      if (payload === 'tf_done_all' || /^ALL$/i.test(text)) {
        const dayYmd = istYmd();
        const { done, total } = await completeAllOpenTasksForUser(user, { dayYmd });
        const bundle = await loadTasksForUser(user.id, { dayYmd });
        await sendWhatsAppText(
          msg.from,
          `✅ Marked ${done}/${total} task(s) complete for today.\n\n${formatStatusSummary(bundle)}`
        );
        continue;
      }

      // List / button: single task
      const doneMatch = payload.match(/^tf_done_([0-9a-f-]{36})$/i);
      if (doneMatch) {
        const result = await completeTaskFromWhatsApp(doneMatch[1], user);
        await afterSingleComplete(msg.from, user, result);
        continue;
      }

      // Text commands: LIST / ALL / 1,3 — scoped to today (+ overdue)
      if (text) {
        const dayYmd = istYmd();
        const open = await loadOpenTasksForUser(user.id, { dayYmd });
        const parsed = parseNumberReply(text, open);
        if (parsed?.list) {
          await sendOpenTasksListPicker(msg.from, user.id, {
            fullName: user.full_name || user.username,
            sayEmpty: true,
            dayYmd,
          });
          continue;
        }
        if (parsed?.all) {
          const { done, total } = await completeAllOpenTasksForUser(user, { dayYmd });
          const bundle = await loadTasksForUser(user.id, { dayYmd });
          await sendWhatsAppText(
            msg.from,
            `✅ Marked ${done}/${total} task(s) complete.\n\n${formatStatusSummary(bundle)}`
          );
          continue;
        }
        if (parsed?.indexes) {
          let okCount = 0;
          let lastDesc = '';
          for (const i of parsed.indexes) {
            const t = open[i];
            if (!t) continue;
            const result = await completeTaskFromWhatsApp(t.id, user);
            if (result.ok) {
              okCount += 1;
              lastDesc = t.description || lastDesc;
            }
          }
          const bundle = await loadTasksForUser(user.id, { dayYmd });
          await sendWhatsAppText(
            msg.from,
            formatStatusSummary({
              ...bundle,
              justDoneLabel: okCount === 1 ? lastDesc : `${okCount} tasks`,
            })
          );
          if (bundle.open.length) {
            await sendOpenTasksListPicker(msg.from, user.id, {
              fullName: user.full_name || user.username,
              dayYmd,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook handler error:', err.message);
  }
});

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const hdr = req.headers['authorization'] || '';
  return (
    (secret && hdr === `Bearer ${secret}`) ||
    (secret && req.query.secret === secret) ||
    (!secret && process.env.VERCEL !== '1')
  );
}

async function handleListDigestCron(req, res) {
  try {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized cron' });
    const result = await runOpenTasksListDigestCron();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('WA list digest cron:', err.message);
    res.status(500).json({ error: err.message });
  }
}

router.post('/cron/tasks-list-digest', handleListDigestCron);
router.get('/cron/tasks-list-digest', handleListDigestCron);

/** Admin / MIS / Beena: send today's WhatsApp list to Beena now. */
router.post('/send-day-list-now', requireAuth, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isStaff =
      role === 'admin' || !!req.user?.is_mis_executive;
    const isBeena = /beena/i.test(
      `${req.user?.full_name || ''} ${req.user?.username || ''}`
    );
    if (!isStaff && !isBeena) {
      return res.status(403).json({ error: 'Only admin/MIS or Beena can trigger this' });
    }
    const result = await sendDayListToBeenaNow();
    res.json(result);
  } catch (err) {
    console.error('send-day-list-now:', err.message);
    res.status(500).json({ error: err.message || 'Send failed' });
  }
});

module.exports = router;
