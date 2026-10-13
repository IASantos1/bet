import { randomUUID, timingSafeEqual } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { postTransaction } from './wallet.js';
import { onDeposit } from './promotions.js';
import { onReferredDeposit } from './affiliates.js';

const PROMO_CODE = { none: 0, sport: 1, casino: 2 };
const PROMO_CHOICE = { 0: 'none', 1: 'sport', 2: 'casino' };
const FINAL = new Set(['paid', 'failed', 'expired', 'mismatch', 'reversed']);

const centsFrom = (value) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const find = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const got = find(value, keys);
      if (got !== undefined) return got;
    }
  }
  return undefined;
};
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};
const phonePT = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00351')) digits = digits.slice(2);
  if (digits.startsWith('351') && digits.length === 12) digits = digits.slice(3);
  return /^9\d{8}$/.test(digits) ? digits : '';
};

export function createEupago(db, {
  apiKey = '', environment = 'sandbox', fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const key = String(apiKey || '').trim();
  const base = String(environment).toLowerCase() === 'production'
    ? 'https://clientes.eupago.pt' : 'https://sandbox.eupago.pt';
  const enabled = !!key;
  const rowOf = (id) => db.prepare('SELECT * FROM eupago_payments WHERE session_id = ?').get(String(id || ''));
  const view = (row) => row && ({
    id: row.session_id, method: row.method, status: row.status, amountCents: row.amount_cents,
    entity: row.entity || undefined, reference: row.reference || undefined, expiresAt: row.expires_at || undefined,
  });

  async function call(path, body) {
    const response = await fetchImpl(base + path, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = find(payload, ['message', 'mensagem', 'error', 'erro', 'detail']) || `HTTP ${response.status}`;
      log(`Eupago ${path}: ${String(message).slice(0, 250)}`);
      const err = new Error('A Eupago não aceitou o pedido de pagamento. Confirme as credenciais e o ambiente.');
      err.status = response.status;
      throw err;
    }
    const status = String(find(payload, ['estado', 'status', 'resposta']) || '').toLowerCase();
    if (status && /erro|error|invalid|inválid|fail|recusad/.test(status)) {
      log(`Eupago ${path}: resposta recusada (${status.slice(0, 80)})`);
      throw new Error('A Eupago não conseguiu criar o pagamento. Confirme a configuração do canal.');
    }
    return payload;
  }

  async function createDeposit(user, amountCents, { method, phone, promo = 'none' } = {}) {
    if (!enabled) throw Object.assign(new Error('Eupago não configurada.'), { status: 503 });
    if (!['mbway', 'multibanco'].includes(method)) {
      throw Object.assign(new Error('Com a Eupago, escolha MB WAY ou Multibanco.'), { status: 400, ours: true });
    }
    const tel = method === 'mbway' ? phonePT(phone) : '';
    if (method === 'mbway' && !tel) {
      throw Object.assign(new Error('Número de telemóvel MB WAY inválido. Use um número português de 9 dígitos.'), { status: 400, ours: true });
    }
    const identifier = `B62-${user.id}-${randomUUID()}`;
    const amount = Number((amountCents / 100).toFixed(2));
    const expiresAt = method === 'multibanco' ? new Date(Date.now() + 7 * 86400_000).toISOString() : null;
    db.prepare(`INSERT INTO eupago_payments
      (session_id, user_id, amount_cents, currency, status, method, identifier, created_at, updated_at, promo_opt)
      VALUES (?, ?, ?, 'eur', 'pending', ?, ?, ?, ?, ?)`)
      .run(identifier, user.id, amountCents, method, identifier, nowIso(), nowIso(), PROMO_CODE[promo] ?? 0);

    try {
      let payload;
      if (method === 'mbway') {
        payload = await call('/api/v1.02/mbway/create', {
          payment: { amount, identifier },
          customer: { phone: tel },
        });
      } else {
        const deadline = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
        payload = await call('/clientes/rest_api/multibanco/create', {
          chave: key, valor: amount, id: identifier, per_dup: 0, data_fim: deadline, email: user.email,
        });
      }
      const entity = find(payload, ['entidade', 'entity']);
      const reference = find(payload, ['referencia', 'reference']);
      const providerId = find(payload, ['transacao', 'transactionID', 'transaction_id', 'idPedido']);
      db.prepare('UPDATE eupago_payments SET provider_id = ?, entity = ?, reference = ?, expires_at = ?, updated_at = ? WHERE session_id = ?')
        .run(providerId == null ? null : String(providerId), entity == null ? null : String(entity), reference == null ? null : String(reference), expiresAt, nowIso(), identifier);
      const row = rowOf(identifier);
      if (method === 'multibanco' && !(row.entity && row.reference)) {
        log(`Eupago ${identifier}: a resposta não trouxe entidade/referência reconhecível.`);
        throw new Error('A Eupago respondeu sem a entidade e a referência Multibanco. O depósito não foi iniciado; contacte o apoio antes de tentar novamente.');
      }
      return view(row);
    } catch (err) {
      db.prepare("UPDATE eupago_payments SET status = 'failed', updated_at = ? WHERE session_id = ? AND status = 'pending'")
        .run(nowIso(), identifier);
      if (err.ours) throw err;
      throw Object.assign(new Error(err.status ? err.message : 'Não foi possível iniciar o pagamento Eupago. Verifique a configuração do canal.'), { status: err.status || 502 });
    }
  }

  function handleWebhook(params = {}) {
    if (!enabled || !safeEqual(params.chave_api, key)) return { accepted: false, reason: 'authentication' };
    const identifier = String(params.identificador || params.identifier || '');
    if (!identifier || identifier.length > 200) return { accepted: false, reason: 'identifier' };
    const row = rowOf(identifier);
    if (!row) return { accepted: false, reason: 'unknown' };
    if (row.status === 'paid') return { accepted: true, duplicate: true };
    if (FINAL.has(row.status)) return { accepted: false, reason: 'final' };

    const amountCents = centsFrom(params.valor ?? params.amount);
    if (!Number.isFinite(amountCents) || amountCents !== row.amount_cents) {
      db.prepare("UPDATE eupago_payments SET status = 'mismatch', updated_at = ? WHERE session_id = ? AND status = 'pending'")
        .run(nowIso(), identifier);
      log(`Eupago ${identifier}: montante de callback não coincide com o depósito guardado.`);
      return { accepted: false, reason: 'amount' };
    }
    const mp = String(params.mp || '').toUpperCase();
    const expectedMethod = row.method === 'mbway' ? 'MW:PT' : 'PC:PT';
    if (mp && mp !== expectedMethod) return { accepted: false, reason: 'method' };
    const reference = String(params.referencia || params.reference || '');
    if (row.reference && reference && row.reference !== reference) return { accepted: false, reason: 'reference' };

    return tx(db, () => {
      const changed = db.prepare("UPDATE eupago_payments SET status = 'paid', provider_id = COALESCE(provider_id, ?), updated_at = ? WHERE session_id = ? AND status = 'pending'")
        .run(String(params.transacao || '') || null, nowIso(), identifier);
      if (!changed.changes) return { accepted: rowOf(identifier)?.status === 'paid', duplicate: true };
      const ref = `eupago:${identifier}`;
      const label = row.method === 'mbway' ? 'MB WAY' : 'Multibanco';
      postTransaction(db, row.user_id, row.amount_cents, 'deposit', `Depósito ${label}`, ref);
      const txId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      onDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, ref, method: row.method, choice: PROMO_CHOICE[row.promo_opt] || 'none' });
      try { onReferredDeposit(db, { userId: row.user_id, amountCents: row.amount_cents, txId, ref }); }
      catch (err) { log(`Eupago ${identifier}: comissão de afiliado pendente de recuperação (${err.message})`); }
      return { accepted: true, credited: true };
    });
  }

  function refresh(id, userId) {
    const row = db.prepare('SELECT * FROM eupago_payments WHERE session_id = ? AND user_id = ?').get(String(id || ''), userId);
    return view(row);
  }

  return { enabled, environment, createDeposit, handleWebhook, refresh };
}
