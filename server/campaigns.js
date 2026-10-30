// Promotional campaigns by email or SMS (sent through Brevo, brevo.js), or as a notification on the
// phone (push.js).
//
// Only players who said yes receive them (notifyPromos for email, notifySms for SMS, notifyPushPromos
// for the phone, all off by default; every registered player is asked on the site, deposit or not, a
// "not now" again after 30 days); never a self-excluded or banned account. Every email carries a
// one-click link to stop receiving them. SMS and phone notifications only between 09:00 and 21:00 (Lisbon).

import crypto from 'node:crypto';
import { nowIso, getSetting, setSetting } from './db.js';

export const SEGMENTS = {
  all: 'Todos os registados que aceitam promoções (com ou sem depósito)',
  depositors: 'Já fizeram pelo menos um depósito',
  no_deposit: 'Ainda não fizeram nenhum depósito',
  inactive: 'Sem apostas há X dias',
  new: 'Registados nos últimos X dias',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const personal = (text, u) => String(text || '').replace(/\{nome\}/gi, firstName(u.name));
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();

/** The players a campaign goes to, as rows { id, email, name, phone }. */
export function audience(db, { channel = 'email', segment = 'all', days = 0 } = {}) {
  if (!SEGMENTS[segment]) throw Object.assign(new Error('Público inválido.'), { status: 400 });
  const where = [
    "u.role = 'user'", 'u.banned_at IS NULL', '(u.excluded_until IS NULL OR u.excluded_until <= ?)',
    channel === 'sms' ? "json_extract(u.prefs, '$.notifySms') = 1 AND u.phone IS NOT NULL AND u.phone != ''"
      : channel === 'push' ? "json_extract(u.prefs, '$.notifyPushPromos') = 1 AND EXISTS (SELECT 1 FROM push_subs s WHERE s.user_id = u.id)"
        : "json_extract(u.prefs, '$.notifyPromos') = 1",
  ];
  const args = [nowIso()];
  const deposited = "EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit')";
  const n = Math.max(1, Math.min(365, Math.round(Number(days) || 0) || 7));
  if (segment === 'depositors') where.push(deposited);
  else if (segment === 'no_deposit') where.push(`NOT ${deposited}`);
  else if (segment === 'inactive') {
    where.push('u.created_at <= ?', 'NOT EXISTS (SELECT 1 FROM bets b WHERE b.user_id = u.id AND b.created_at > ?)');
    args.push(daysAgo(n), daysAgo(n));
  } else if (segment === 'new') {
    where.push('u.created_at > ?');
    args.push(daysAgo(n));
  }
  return db.prepare(`SELECT u.id, u.email, u.name, u.phone FROM users u WHERE ${where.join(' AND ')} ORDER BY u.id`).all(...args);
}

function secret(db) {
  let s = getSetting(db, 'campaigns.secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting(db, 'campaigns.secret', s); }
  return s;
}
export const unsubscribeToken = (db, userId) => crypto.createHmac('sha256', secret(db)).update(`unsub:${userId}`).digest('hex').slice(0, 32);

/** Stops promotional emails for a player when the link's token is right: true if it was. */
export function unsubscribe(db, userId, token) {
  const id = Number(userId);
  if (!Number.isInteger(id) || typeof token !== 'string' || token.length !== 32) return false;
  const want = Buffer.from(unsubscribeToken(db, id));
  if (!crypto.timingSafeEqual(want, Buffer.from(token.padEnd(32).slice(0, 32)))) return false;
  const u = db.prepare('SELECT prefs FROM users WHERE id = ?').get(id);
  if (!u) return false;
  let prefs = {};
  try { prefs = JSON.parse(u.prefs || '{}') || {}; } catch { /* reset */ }
  prefs.notifyPromos = false;
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), id);
  return true;
}

/** The promotional email: { subject, html, text } for one player. */
export function renderEmail({ subject, body, ctaText, ctaUrl }, user, { baseUrl, unsubscribeUrl }) {
  const subj = personal(subject, user);
  const text = personal(body, user);
  const paras = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const btn = ctaText && ctaUrl ? `<p style="margin:22px 0 6px;text-align:center"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#42946b;color:#ffffff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:8px">${esc(ctaText)}</a></p>` : '';
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subj)}</title></head>
<body style="margin:0;background:#1a1f24;font-family:Arial,Helvetica,sans-serif;color:#e8eaed">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1f24"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#272c32;border-radius:12px;overflow:hidden">
<tr><td style="padding:18px 24px;background:#1e2329;font-size:24px;font-weight:900;font-style:italic;color:#ffffff"><a href="${esc(baseUrl)}" style="color:#ffffff;text-decoration:none">BET<span style="color:#67788c">62</span></a></td></tr>
<tr><td style="padding:24px;font-size:15px">
<h1 style="margin:0 0 16px;font-size:22px;color:#ffffff">${esc(subj)}</h1>${paras}${btn}
</td></tr>
<tr><td style="padding:16px 24px;background:#20262c;font-size:12px;color:#868e98;line-height:1.5">
<b style="color:#b0b7bf">18+</b> Jogue com responsabilidade. Aplicam-se termos e condições.<br>
Recebe este email porque aceitou receber promoções da BET62. <a href="${esc(unsubscribeUrl)}" style="color:#b0b7bf">Deixar de receber</a>
</td></tr></table></td></tr></table></body></html>`;
  const plain = `${subj}\n\n${text}${ctaText && ctaUrl ? `\n\n${ctaText}: ${ctaUrl}` : ''}\n\n18+ Jogue com responsabilidade.\nDeixar de receber: ${unsubscribeUrl}`;
  return { subject: subj, html, text: plain };
}

/** The SMS text for one player (with the 18+ notice). */
export const renderSms = ({ body }, user) => `${personal(body, user)}\n18+ BET62. Nao receber: Perfil>Preferencias`;

/** The notification of a promotional campaign on the phone. */
export const renderPush = (c, user) => ({ kind: 'promo', title: personal(c.subject, user), body: personal(c.body, user), url: c.ctaUrl || '/#/promocoes', tag: `promo-${c.id || 0}` });

/** Lisbon time allows SMS and phone notifications (09:00–20:59). */
export function smsHours(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(date));
  return h >= 9 && h < 21;
}

export function createCampaigns(db, { brevo = null, push = null, concurrency = 4, log = () => {} } = {}) {
  // A campaign left "sending" by a restart: closed with what it managed.
  db.prepare("UPDATE campaigns SET status = 'failed', error = 'Interrompida (o servidor reiniciou).', finished_at = ? WHERE status = 'sending'").run(nowIso());

  function check(channel) {
    if (channel === 'push') {
      if (!push) throw Object.assign(new Error('Notificações no telemóvel indisponíveis.'), { status: 409 });
      return;
    }
    if (channel === 'sms' ? !brevo?.smsConfigured : !brevo?.configured) {
      throw Object.assign(new Error(channel === 'sms' ? 'SMS não configurado: defina BREVO_SMS_SENDER no Railway.' : 'Email não configurado: defina BREVO_API_KEY e BREVO_SENDER_EMAIL no Railway.'), { status: 409 });
    }
  }

  async function sendOne(c, user, baseUrl) {
    if (c.channel === 'push') {
      if (!(await push.sendTo(user.id, renderPush(c, user)))) throw new Error('nenhum telemóvel ativo');
      return;
    }
    if (c.channel === 'sms') return brevo.sendSms({ to: user.phone, content: renderSms(c, user) });
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?u=${user.id}&t=${unsubscribeToken(db, user.id)}`;
    const m = renderEmail(c, user, { baseUrl, unsubscribeUrl });
    return brevo.sendEmail({ to: user.email, name: user.name, subject: m.subject, html: m.html, text: m.text, unsubscribeUrl });
  }

  function validate(c) {
    const channel = ['sms', 'push'].includes(c.channel) ? c.channel : 'email';
    const body = String(c.body || '').trim();
    const subject = String(c.subject || '').trim();
    if (channel === 'email' && (subject.length < 3 || subject.length > 150)) throw Object.assign(new Error('Indique o assunto do email.'), { status: 400 });
    if (channel === 'push' && (subject.length < 3 || subject.length > 65)) throw Object.assign(new Error('Indique o título da notificação (até 65 caracteres).'), { status: 400 });
    if (channel === 'push' && body.length > 180) throw Object.assign(new Error('Notificação demasiado longa (máx. 180 caracteres).'), { status: 400 });
    if (body.length < 3) throw Object.assign(new Error('Escreva a mensagem.'), { status: 400 });
    if (channel === 'sms' && body.length > 300) throw Object.assign(new Error('SMS demasiado longo (máx. 300 caracteres).'), { status: 400 });
    if (body.length > 5000) throw Object.assign(new Error('Mensagem demasiado longa.'), { status: 400 });
    const ctaUrl = String(c.ctaUrl || '').trim();
    if (ctaUrl && !/^https?:\/\//i.test(ctaUrl) && !(channel === 'push' && /^\/#\/[\w/-]*$/.test(ctaUrl))) throw Object.assign(new Error('O link do botão tem de começar por https://'), { status: 400 });
    return {
      channel, subject, body, segment: SEGMENTS[c.segment] ? c.segment : 'all', days: Math.max(1, Math.min(365, Math.round(Number(c.days) || 7))),
      ctaText: String(c.ctaText || '').trim().slice(0, 60), ctaUrl,
    };
  }

  /** A test send to one address or number (the administrator's), whatever the preferences. */
  async function test(input, { userId, email, phone, name }, baseUrl) {
    const c = validate(input);
    check(c.channel);
    if (c.channel === 'push') {
      if (!(await push.sendTo(userId, renderPush(c, { name })))) throw Object.assign(new Error('Nenhum telemóvel seu com avisos ativos: entre no site com esta conta no telemóvel e ative os avisos.'), { status: 409 });
      return;
    }
    if (c.channel === 'sms' && !phone) throw Object.assign(new Error('Indique o número para o teste.'), { status: 400 });
    await sendOne(c, { id: 0, email, phone, name }, baseUrl);
  }

  /** Starts a campaign in the background: its row (the counts fill in as it goes). */
  function start(input, { by, baseUrl }) {
    const c = validate(input);
    check(c.channel);
    if (c.channel !== 'email' && !smsHours()) throw Object.assign(new Error(`${c.channel === 'sms' ? 'Os SMS' : 'As notificações'} só podem ser enviados entre as 09:00 e as 21:00.`), { status: 409 });
    const users = audience(db, c);
    if (!users.length) throw Object.assign(new Error('Nenhum jogador neste público aceita receber promoções por este canal.'), { status: 409 });
    const id = Number(db.prepare(`INSERT INTO campaigns (channel, segment, days, subject, body, cta_text, cta_url, total, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.channel, c.segment, c.days, c.subject || null, c.body, c.ctaText || null, c.ctaUrl || null, users.length, by || null, nowIso()).lastInsertRowid);
    const done = run(id, { ...c, id }, users, baseUrl);
    return { id, total: users.length, done };
  }

  async function run(id, c, users, baseUrl) {
    let next = 0;
    let lastError = null;
    const bump = db.prepare('UPDATE campaigns SET sent = sent + ?, failed = failed + ? WHERE id = ?');
    const worker = async () => {
      while (next < users.length) {
        const u = users[next++];
        try { await sendOne(c, u, baseUrl); bump.run(1, 0, id); }
        catch (err) { lastError = err.message; bump.run(0, 1, id); log(`campanha #${id} → ${u.id}: ${err.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, worker));
    const row = db.prepare('SELECT sent FROM campaigns WHERE id = ?').get(id);
    db.prepare('UPDATE campaigns SET status = ?, error = ?, finished_at = ? WHERE id = ?').run(row.sent ? 'sent' : 'failed', lastError, nowIso(), id);
  }

  const list = () => db.prepare('SELECT * FROM campaigns ORDER BY id DESC LIMIT 50').all();
  const status = () => ({ email: !!brevo?.configured, sms: !!brevo?.smsConfigured, push: !!push, sender: brevo?.senderEmail || null, smsHours: smsHours() });

  return { audience: (q) => audience(db, q), test, start, list, status };
}
