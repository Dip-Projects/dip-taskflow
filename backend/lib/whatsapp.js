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
        body: JSON.stringify({
          messaging_product: 'whatsapp',
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
                  text: String(text ?? '—').slice(0, 1024) || '—',
                })),
              },
            ],
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('WhatsApp send failed:', templateName, to, JSON.stringify(data));
      return { ok: false, reason: 'api_error', data };
    }
    console.log('WhatsApp sent to', to, '-', templateName);
    return { ok: true, to, templateName };
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

module.exports = { sendWhatsAppTemplate, normalizeWhatsAppNumber };
