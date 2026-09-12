const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

/** Digits only; 10-digit Indian numbers get 91 prefix. */
function normalizeWhatsAppNumber(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 10) n = `91${n}`;
  if (n.startsWith('0') && n.length === 11) n = `91${n.slice(1)}`;
  return n;
}

/** Meta rejects newlines / tabs / 4+ spaces / # in template body params. */
function sanitizeWaParam(text) {
  return (
    String(text ?? '—')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {4,}/g, ' ')
      .replace(/#/g, '')
      .trim()
      .slice(0, 1024) || '—'
  );
}

async function metaSend(body) {
  if (!META_PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    console.error(
      'WhatsApp not configured — set META_PHONE_NUMBER_ID and META_ACCESS_TOKEN on the server (Vercel env / backend .env)'
    );
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('WhatsApp send failed:', JSON.stringify(data));
      const errMsg =
        data?.error?.error_user_msg ||
        data?.error?.message ||
        data?.error?.error_data?.details ||
        'api_error';
      return { ok: false, reason: 'api_error', error: errMsg, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

/**
 * Send a Meta WhatsApp Cloud API template message.
 * Best-effort: missing config / number / API errors are logged, never thrown.
 */
async function sendWhatsAppTemplate(toNumber, templateName, bodyParams = []) {
  const to = normalizeWhatsAppNumber(toNumber);
  if (!to) {
    console.warn('WhatsApp skip — no valid number for', templateName);
    return { ok: false, reason: 'no_number' };
  }

  const result = await metaSend({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: bodyParams.map((text) => ({
            type: 'text',
            text: sanitizeWaParam(text),
          })),
        },
      ],
    },
  });
  if (result.ok) console.log('WhatsApp sent to', to, '-', templateName);
  return result.ok ? { ok: true, to, templateName } : result;
}

/**
 * Leave / verification templates were created as MARKETING on Meta — WhatsApp
 * often hides or drops those. Prefer UTILITY task_notification_v2 for delivery.
 * Body: {{1}} name, {{2}} detail, {{3}} project, {{4}} date, {{5}} status
 */
async function sendLeaveAlertTemplate(toNumber, { applicantName, from_date, to_date, reason }) {
  const from = String(from_date || '—').slice(0, 10);
  const to = String(to_date || '—').slice(0, 10);
  const dates = from === to ? from : `${from} to ${to}`;
  return sendWhatsAppTemplate(
    toNumber,
    process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2',
    [
      applicantName || 'Employee',
      `Leave request: ${String(reason || '—').slice(0, 160)}`,
      'DIP Leave',
      dates,
      'Pending',
    ]
  );
}

async function sendVerificationAlertTemplate(toNumber, { verifierName, taskDescription, projectName }) {
  return sendWhatsAppTemplate(
    toNumber,
    process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2',
    [
      verifierName || 'Verifier',
      `Please verify: ${String(taskDescription || 'Task').slice(0, 160)}`,
      projectName || 'DIP Projects',
      new Date().toISOString().slice(0, 10),
      'Pending Verification',
    ]
  );
}

/**
 * Template with Quick Reply buttons. Payload is set at send time so Done can
 * carry tf_done_<taskId>. Requires an approved Meta template with QUICK_REPLY.
 */
async function sendWhatsAppTemplateWithButtons(
  toNumber,
  templateName,
  bodyParams = [],
  buttons = []
) {
  const to = normalizeWhatsAppNumber(toNumber);
  if (!to) {
    console.warn('WhatsApp skip — no valid number for', templateName);
    return { ok: false, reason: 'no_number' };
  }

  const components = [
    {
      type: 'body',
      parameters: bodyParams.map((text) => ({
        type: 'text',
        text: String(text ?? '—').slice(0, 1024) || '—',
      })),
    },
  ];

  buttons.forEach((btn, i) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(btn.index != null ? btn.index : i),
      parameters: [
        {
          type: 'payload',
          payload: String(btn.payload || '').slice(0, 128),
        },
      ],
    });
  });

  const result = await metaSend({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: process.env.WHATSAPP_TASK_DONE_LANG || 'en' },
      components,
    },
  });
  if (result.ok) console.log('WhatsApp template+buttons sent to', to, '-', templateName);
  return result.ok ? { ok: true, to, templateName } : result;
}

/**
 * Session interactive reply buttons (only works inside 24h user window).
 * button.id becomes the webhook payload when tapped.
 */
async function sendWhatsAppInteractiveButtons(toNumber, bodyText, buttons = []) {
  const to = normalizeWhatsAppNumber(toNumber);
  if (!to) return { ok: false, reason: 'no_number' };

  const result = await metaSend({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: String(bodyText || 'Task update').slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: {
            id: String(b.id || '').slice(0, 256),
            title: String(b.title || 'OK').slice(0, 20),
          },
        })),
      },
    },
  });
  if (result.ok) console.log('WhatsApp interactive sent to', to);
  return result;
}

async function sendWhatsAppText(toNumber, text) {
  const to = normalizeWhatsAppNumber(toNumber);
  if (!to) return { ok: false, reason: 'no_number' };
  return metaSend({
    to,
    type: 'text',
    text: { body: String(text || '').slice(0, 4096) },
  });
}

/**
 * Interactive list picker (session / 24h window).
 * rows: [{ id, title, description? }] — max 10 rows total across sections.
 */
async function sendWhatsAppInteractiveList(toNumber, opts = {}) {
  const to = normalizeWhatsAppNumber(toNumber);
  if (!to) return { ok: false, reason: 'no_number' };

  const sections = (opts.sections || [])
    .map((sec) => ({
      title: String(sec.title || 'Tasks').slice(0, 24),
      rows: (sec.rows || []).slice(0, 10).map((r) => ({
        id: String(r.id || '').slice(0, 200),
        title: String(r.title || 'Item').slice(0, 24),
        ...(r.description
          ? { description: String(r.description).slice(0, 72) }
          : {}),
      })),
    }))
    .filter((s) => s.rows.length);

  if (!sections.length) return { ok: false, reason: 'no_rows' };

  // Cap total rows at 10
  let budget = 10;
  for (const sec of sections) {
    if (sec.rows.length > budget) sec.rows = sec.rows.slice(0, budget);
    budget -= sec.rows.length;
  }

  const interactive = {
    type: 'list',
    body: { text: String(opts.body || 'Your tasks').slice(0, 1024) },
    action: {
      button: String(opts.button || 'Select').slice(0, 20),
      sections: sections.filter((s) => s.rows.length),
    },
  };
  if (opts.header) {
    interactive.header = { type: 'text', text: String(opts.header).slice(0, 60) };
  }
  if (opts.footer) {
    interactive.footer = { text: String(opts.footer).slice(0, 60) };
  }

  const result = await metaSend({
    to,
    type: 'interactive',
    interactive,
  });
  if (result.ok) console.log('WhatsApp list sent to', to);
  return result;
}

/**
 * Notify assignee about a new task and offer Done.
 * Prefer WHATSAPP_TASK_DONE_TEMPLATE (Quick Reply) when set; else classic
 * template + best-effort interactive Done button.
 * @deprecated Prefer scheduleOpenTasksListDigest / list picker for site teams.
 */
async function notifyTaskAssignedWithDone(toNumber, opts = {}) {
  const {
    fullName = 'Team member',
    description = 'New task',
    project = '—',
    dueLabel = '—',
    priority = 'Medium',
    taskId,
  } = opts;

  if (!taskId) {
    return sendWhatsAppTemplate(toNumber, 'task_notification_v2', [
      fullName,
      String(description).slice(0, 200),
      project,
      dueLabel,
      priority,
    ]);
  }

  const donePayload = `tf_done_${taskId}`;
  const doneTemplate = process.env.WHATSAPP_TASK_DONE_TEMPLATE;

  if (doneTemplate) {
    const bodyParams = [
      fullName,
      String(description).slice(0, 200),
      project,
      dueLabel,
      priority,
    ];
    const sent = await sendWhatsAppTemplateWithButtons(
      toNumber,
      doneTemplate,
      bodyParams,
      [{ index: 0, payload: donePayload }]
    );
    if (sent.ok) return sent;
    console.warn('Done template failed, falling back to task_notification_v2');
  }

  await sendWhatsAppTemplate(toNumber, 'task_notification_v2', [
    fullName,
    String(description).slice(0, 200),
    project,
    dueLabel,
    priority,
  ]);

  const interactive = await sendWhatsAppInteractiveButtons(
    toNumber,
    `DIP Task\n${String(description).slice(0, 180)}\nProject: ${project}\nDue: ${dueLabel}\n\nTap Done when finished. You can also complete it in Site → My Tasks.`,
    [{ id: donePayload, title: '✅ Done' }]
  );
  if (!interactive.ok) {
    console.warn(
      'Interactive Done skipped (needs 24h window or WHATSAPP_TASK_DONE_TEMPLATE):',
      interactive.reason || interactive.data
    );
  }
  return { ok: true, interactiveOk: interactive.ok };
}

module.exports = {
  sendWhatsAppTemplate,
  sendWhatsAppTemplateWithButtons,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  sendWhatsAppText,
  notifyTaskAssignedWithDone,
  normalizeWhatsAppNumber,
  sendLeaveAlertTemplate,
  sendVerificationAlertTemplate,
};
