// Brevo (ex-Sendinblue): promotional emails and SMS to the players who asked for them.
//
// Email: POST /v3/smtp/email with the account's API key (Brevo → SMTP & API → API keys); the
// sender must be a verified sender or domain in Brevo. SMS: POST /v3/transactionalSMS/sms, paid
// with the account's SMS credits; off while no BREVO_SMS_SENDER is set.

const API = 'https://api.brevo.com/v3';

/** A Portuguese or international number as Brevo wants it (digits with the country code), or null. */
export function smsNumber(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^9\d{8}$/.test(d)) d = `351${d}`; // a Portuguese mobile without the country code
  return /^\d{9,15}$/.test(d) ? d : null;
}

export function createBrevo({
  apiKey = '', senderEmail = '', senderName = 'BET62', smsSender = '', fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const configured = !!(apiKey && senderEmail);
  const smsConfigured = !!(apiKey && smsSender);

  async function call(path, body) {
    const res = await fetchImpl(`${API}${path}`, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      log(`brevo ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw Object.assign(new Error(`Brevo: ${data?.message || `HTTP ${res.status}`}`), { status: res.status });
    }
    return data;
  }

  /** One email: { messageId }. */
  function sendEmail({ to, name, subject, html, text, unsubscribeUrl }) {
    if (!configured) throw Object.assign(new Error('Brevo não configurado: defina BREVO_API_KEY e BREVO_SENDER_EMAIL no Railway.'), { status: 409 });
    return call('/smtp/email', {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to, ...(name ? { name } : {}) }],
      subject, htmlContent: html, textContent: text,
      ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    });
  }

  /** One SMS (marketing): the number in any usual format. */
  function sendSms({ to, content }) {
    if (!smsConfigured) throw Object.assign(new Error('SMS não configurado: defina BREVO_SMS_SENDER no Railway.'), { status: 409 });
    const recipient = smsNumber(to);
    if (!recipient) throw Object.assign(new Error('Número de telefone inválido.'), { status: 400 });
    return call('/transactionalSMS/sms', { type: 'marketing', unicodeEnabled: true, sender: smsSender, recipient, content });
  }

  return { configured, smsConfigured, senderEmail, sendEmail, sendSms };
}
