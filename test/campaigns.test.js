import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createApp } from '../server/app.js';
import { postTransaction } from '../server/wallet.js';
import { hashPassword } from '../server/security.js';
import { createBrevo, smsNumber } from '../server/brevo.js';
import { audience, renderEmail, smsHours } from '../server/campaigns.js';

test('brevo client: email and SMS requests, numbers normalised', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201, text: async () => '{"messageId":"m1"}' }; };
  const b = createBrevo({ apiKey: 'k', senderEmail: 'promo@bet62.plus', smsSender: 'BET62', fetchImpl });
  assert.deepEqual([b.configured, b.smsConfigured], [true, true]);
  await b.sendEmail({ to: 'a@x.com', name: 'Ana', subject: 'Olá', html: '<p>x</p>', text: 'x', unsubscribeUrl: 'https://s/u' });
  const e = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'k');
  assert.deepEqual([e.sender.email, e.to[0].email, e.headers['List-Unsubscribe']], ['promo@bet62.plus', 'a@x.com', '<https://s/u>']);
  await b.sendSms({ to: '912 345 678', content: 'oi' });
  const s = JSON.parse(calls[1].init.body);
  assert.deepEqual([s.recipient, s.sender, s.type], ['351912345678', 'BET62', 'marketing']);
  assert.deepEqual(['+351 912 345 678', '00351912345678', '+44 7700 900123', '123', ''].map(smsNumber), ['351912345678', '351912345678', '447700900123', null, null]);
  assert.equal(createBrevo({ apiKey: 'k' }).configured, false);
  const bad = createBrevo({ apiKey: 'k', senderEmail: 's@x', fetchImpl: async () => ({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' }) });
  await assert.rejects(bad.sendEmail({ to: 'a@x.com', subject: 's', html: 'h', text: 't' }), /Key not found/);
});

test('brevo diagnose: key format, blocked IP, sender or authenticated domain, SMS credits', async () => {
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const ok = createBrevo({ apiKey: 'xkeysib-1', senderEmail: 'promo@bet62.plus', smsSender: 'BET62', fetchImpl: async (url) => (
    url.endsWith('/account') ? reply({ email: 'a@b.c', plan: [{ type: 'free', credits: 300 }] })
      : url.endsWith('/senders') ? reply({ senders: [{ email: 'outro@x.com', active: true }] })
        : reply({ domains: [{ domain_name: 'bet62.plus', authenticated: true }] })) });
  const steps = await ok.diagnose();
  assert.deepEqual(steps.map((x) => x.ok), [true, true, true, true, true, false]); // no SMS credits
  assert.match(steps[4].detail, /domínio bet62.plus autenticado/);
  const blocked = createBrevo({ apiKey: 'xsmtpsib-1', senderEmail: 's@x', fetchImpl: async () => reply({ message: 'We have detected you are using an unrecognised IP address 1.2.3.4. If…' }, 401) });
  const b = await blocked.diagnose();
  assert.match(b[0].detail, /chave SMTP/);
  assert.deepEqual([b[2].ok, /1\.2\.3\.4.*Authorised IPs/.test(b[2].detail)], [false, true]);
});

test('campaigns: only opted-in, never excluded or banned; segments; unsubscribe; sign-up consent', async () => {
  const db = openDb(':memory:');
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const user = (email, { prefs = null, role = 'user', phone = null, created = old, excluded = null, banned = null } = {}) => Number(db.prepare(`INSERT INTO users
    (email, name, birthdate, password_hash, role, phone, prefs, excluded_until, banned_at, created_at) VALUES (?, 'Rita Sousa', '1990-01-01', ?, ?, ?, ?, ?, ?, ?)`)
    .run(email, hashPassword('segredo123'), role, phone, prefs ? JSON.stringify(prefs) : null, excluded, banned, created).lastInsertRowid);
  const yes = { notifyPromos: true };
  const a = user('a@x.com', { prefs: yes });
  user('b@x.com');                                                                                        // did not opt in
  user('c@x.com', { prefs: yes, excluded: new Date(Date.now() + 86_400_000).toISOString() });         // self-excluded
  user('d@x.com', { prefs: yes, banned: nowIso() });                                                     // banned
  const e = user('e@x.com', { prefs: yes, created: nowIso() });                                          // new
  const f = user('f@x.com', { prefs: { notifySms: true }, phone: '912345678' });
  user('admin@x.com', { role: 'admin' });
  tx(db, () => postTransaction(db, a, 1000, 'deposit', 'dep'));
  const ids = (q) => audience(db, q).map((u) => u.id);
  assert.deepEqual(ids({ segment: 'all' }), [a, e]);
  assert.deepEqual(ids({ segment: 'depositors' }), [a]);
  assert.deepEqual(ids({ segment: 'no_deposit' }), [e]);
  assert.deepEqual(ids({ segment: 'new', days: 7 }), [e]);
  assert.deepEqual(ids({ segment: 'inactive', days: 7 }), [a]);
  assert.deepEqual(ids({ channel: 'sms', segment: 'all' }), [f]);

  const m = renderEmail({ subject: 'Olá {nome}', body: 'Tem <b>prémio</b>', ctaText: 'VER', ctaUrl: 'https://s/#/promocoes' }, { name: 'Rita Sousa' }, { baseUrl: 'https://s', unsubscribeUrl: 'https://s/u' });
  assert.equal(m.subject, 'Olá Rita');
  assert.match(m.html, /Tem &lt;b&gt;prémio&lt;\/b&gt;/);
  assert.match(m.html, /Deixar de receber/);
  assert.equal(typeof smsHours(), 'boolean');

  const sent = [];
  const brevo = { configured: true, smsConfigured: false, senderEmail: 'promo@bet62.plus', sendEmail: async (x) => { sent.push(x); }, sendSms: async () => {} };
  const server = createApp(db, { brevo, loginAttempts: 100 }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (email) => (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123' }) })).headers.get('set-cookie').split(';')[0];
    const adm = await login('admin@x.com');
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adm }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json() }));
    assert.equal((await post('/api/admin/campaigns/count', { channel: 'email', segment: 'all' })).j.count, 2);
    assert.equal((await post('/api/admin/campaigns/test', { subject: 'Teste', body: 'Olá {nome}' })).status, 200);
    assert.equal(sent.pop().to, 'admin@x.com');
    assert.equal((await post('/api/admin/campaigns', { channel: 'sms', body: 'x y z' })).status, 409);           // SMS not configured
    assert.equal((await post('/api/admin/campaigns', { subject: '', body: 'x' })).status, 400);
    let r = await post('/api/admin/campaigns', { subject: '🎁 Olá {nome}', body: 'Tem uma FreeBet', segment: 'all' });
    assert.deepEqual([r.status, r.j.total], [201, 2]);
    for (let i = 0; i < 50 && db.prepare('SELECT status FROM campaigns WHERE id = ?').get(r.j.id).status === 'sending'; i++) await new Promise((ok) => setTimeout(ok, 10));
    const row = db.prepare('SELECT status, sent, failed FROM campaigns WHERE id = ?').get(r.j.id);
    assert.deepEqual([row.status, row.sent, row.failed], ['sent', 2, 0]);
    assert.deepEqual(sent.map((x) => x.to).sort(), ['a@x.com', 'e@x.com']);
    // The email's unsubscribe link: GET only asks, POST (a plain form, as mail apps send it) stops them.
    const link = new URL(sent.find((x) => x.to === 'a@x.com').unsubscribeUrl);
    assert.equal((await fetch(link)).status, 200);
    assert.deepEqual(ids({ segment: 'all' }), [a, e]);
    assert.equal((await fetch(link, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })).status, 200);
    assert.deepEqual(ids({ segment: 'all' }), [e]);
    link.searchParams.set('u', String(e));
    assert.equal((await fetch(link, { method: 'POST' })).status, 400); // another player's id with this token
    // Sign-up: promotions only when the box is ticked.
    const reg = (email, promos) => fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Novo', email, birthdate: '1990-01-01', password: 'segredo123', acceptTerms: true, promos }) });
    assert.equal((await reg('n1@x.com', true)).status, 201);
    assert.equal((await reg('n2@x.com', false)).status, 201);
    assert.deepEqual(audience(db, { segment: 'new' }).map((u) => u.email), ['e@x.com', 'n1@x.com']);
    const list = await fetch(`${base}/api/admin/campaigns`, { headers: { cookie: adm } }).then((x) => x.json());
    assert.deepEqual([list.status.email, list.campaigns.length, list.optedIn.email], [true, 1, 2]);
  } finally { server.close(); }
});
