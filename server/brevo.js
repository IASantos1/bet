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
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

  /**
   * The account as Brevo sees it, for the admin's "Verificar" button: each check { name, ok, detail }.
   * Asks only (GET /account, /senders): nothing is sent.
   */
  async function diagnose() {
    const steps = [];
    const add = (name, ok, detail) => steps.push({ name, ok, detail });
    add('BREVO_API_KEY definida', !!apiKey, apiKey ? (apiKey.startsWith('xkeysib-') ? 'chave de API (xkeysib-…)' : apiKey.startsWith('xsmtpsib-') ? 'esta é a chave SMTP (xsmtpsib-…): use a chave de API (xkeysib-…)' : 'formato inesperado: a chave de API começa por xkeysib-') : 'em falta no Railway');
    add('BREVO_SENDER_EMAIL definido', !!senderEmail, senderEmail || 'em falta no Railway');
    if (!apiKey) return steps;
    let account;
    try {
      account = await call('/account');
      add('Chave aceite pelo Brevo', true, `conta ${account.email || ''}${account.companyName ? ` (${account.companyName})` : ''}`);
    } catch (err) {
      const ip = /unrecognised IP address ([\d.:a-f]+)/i.exec(err.message)?.[1];
      add('Chave aceite pelo Brevo', false, ip ? `o Brevo bloqueou o IP ${ip} do servidor: desative o bloqueio em Brevo → Security → Authorised IPs` : err.message);
      return steps;
    }
    const plans = Array.isArray(account.plan) ? account.plan : [];
    const mail = plans.find((p) => p.type !== 'sms');
    if (mail) add('Plano de email', (mail.credits ?? 1) > 0, `${mail.type}${mail.credits != null ? ` · ${mail.credits} envios disponíveis` : ''}`);
    try {
      const { senders = [] } = await call('/senders');
      const me = senders.find((x) => String(x.email).toLowerCase() === senderEmail.toLowerCase());
      // A sender of an authenticated domain is accepted even when it is not listed one by one.
      const domain = senderEmail.split('@')[1]?.toLowerCase();
      const { domains = [] } = me?.active ? {} : await call('/senders/domains').catch(() => ({}));
      const dom = domains.find((d) => String(d.domain_name).toLowerCase() === domain);
      const ok = !!me?.active || !!dom?.authenticated;
      add('Remetente verificado no Brevo', ok, me?.active ? `${me.email} ativo`
        : dom?.authenticated ? `domínio ${dom.domain_name} autenticado`
          : me ? `${me.email} existe mas não está verificado: confirme-o no Brevo → Senders`
            : `${senderEmail || '(vazio)'} não está nos remetentes nem nos domínios autenticados do Brevo${senders.length ? ` (remetentes: ${senders.map((x) => x.email).join(', ')})` : ''}`);
    } catch (err) { add('Remetente verificado no Brevo', false, err.message); }
    if (smsSender) {
      const sms = plans.find((p) => p.type === 'sms');
      add('Créditos SMS', (sms?.credits || 0) > 0, sms ? `${sms.credits} créditos` : 'sem créditos SMS: compre no Brevo ou apague BREVO_SMS_SENDER');
    }
    return steps;
  }

  return { configured, smsConfigured, senderEmail, sendEmail, sendSms, diagnose };
}
