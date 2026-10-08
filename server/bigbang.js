// Casino through the BigBang Casino aggregator (REST /api/v1), with the SEAMLESS wallet: the
// player's money never leaves Bet62. While a game runs, BigBang asks us for the balance
// (user_data, GET) and sends every bet / win (balance_change, POST, signed with HMAC-SHA256
// keyed with our API key); each move is applied once per transaction_id, in our ledger.
//
// Players at BigBang: one token per account (bet62_<id>) and one per free-spins grant
// (bet62_<id>_fs<grant>), whose balance is the free-spins balance, playable only in the
// games the campaign allows (promotions.js). The API key never reaches the browser.
//
// A sandbox key (ek_test_…) works the same; its callbacks carry "sandbox": true and never move
// real money (BigBang plays them with a virtual balance).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';
import { spinsMove, spinsRow } from './promotions.js';

const TOKEN = /^bet62_(\d+)(?:_fs(\d+))?$/;
export const playerToken = (userId, spinsId = null) => `bet62_${userId}${spinsId ? `_fs${spinsId}` : ''}`;
export const parseToken = (t) => { const m = TOKEN.exec(String(t || '')); return m ? { userId: Number(m[1]), spinsId: m[2] ? Number(m[2]) : null } : null; };

/** balance_change signature: HMAC-SHA256(username + amount + game + game_category + transaction_id, API key), hex. */
export function signMove(p, key) {
  const base = String(p.username) + String(p.amount) + String(p.game) + String(p.game_category) + String(p.transaction_id);
  return createHmac('sha256', key).update(base).digest('hex');
}

const TYPE_LABEL = { slot: 'Slots', live: 'Ao Vivo', crash: 'Crash' };
const euros = (cents) => (cents / 100).toFixed(2);

export function createBigBang(db, {
  apiKey = '', baseUrl = 'https://api.bigbangcasino.bet/api/v1', fetchImpl = globalThis.fetch, log = () => {}, cacheMs = 30 * 60_000,
} = {}) {
  const key = String(apiKey || '').trim();
  const enabled = !!key;
  const sandbox = key.startsWith('ek_test_');
  const root = String(baseUrl || '').replace(/\/+$/, '');
  let catalog = { at: 0, games: [], byId: new Map(), providers: [] };
  let loading = null;
  let lastError = null;
  const players = new Set(); // tokens already created at BigBang (users/create is idempotent anyway)

  async function call(method, path, body) {
    if (!enabled) throw new HttpError(503, 'Casino não configurado.');
    let res;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: { 'X-API-Key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new HttpError(502, `Sem ligação ao servidor de jogos (${err.message}).`);
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data || data.success === false) {
      const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
      log(`bigbang ${method} ${path}: ${msg}`);
      throw new HttpError(res.status === 400 ? 400 : 502, `Servidor de jogos: ${msg}`);
    }
    return data;
  }

  // ---------- catalogue ----------

  const gameOut = (g) => ({
    id: g.id, code: g.name, name: g.title || g.name, provider: g.category_title || g.provider || g.category || '',
    providerId: String(g.category || g.provider || ''), image: g.thumbnail || null,
    category: TYPE_LABEL[g.game_type] || 'Slots', type: g.game_type || 'slot', premium: !!g.is_premium,
  });

  async function loadCatalog() {
    const games = [];
    for (let offset = 0; offset < 50_000;) {
      const page = await call('GET', `/games?limit=5000&offset=${offset}`);
      const list = Array.isArray(page.data) ? page.data : [];
      games.push(...list.map(gameOut));
      const total = Number(page.pagination?.total) || 0;
      offset += list.length;
      if (!list.length || offset >= total) break;
    }
    let providers = [];
    try {
      const cats = await call('GET', '/categories');
      providers = (cats.data || []).map((c) => ({ id: String(c.slug), name: c.name, premium: !!c.premium, maintenance: false }));
    } catch (err) { log(`bigbang categorias: ${err.message}`); }
    // Only providers that have games here, in alphabetical order.
    const withGames = new Set(games.map((g) => g.providerId));
    providers = providers.filter((p) => withGames.has(p.id));
    for (const id of withGames) if (!providers.some((p) => p.id === id)) providers.push({ id, name: games.find((g) => g.providerId === id)?.provider || id, maintenance: false });
    providers.sort((a, b) => a.name.localeCompare(b.name));
    catalog = { at: Date.now(), games, byId: new Map(games.map((g) => [g.id, g])), providers };
    return catalog;
  }

  async function games() {
    if (!enabled) return { enabled: false, games: [], providers: [] };
    const ttl = catalog.games.length ? cacheMs : 2 * 60_000;
    if (Date.now() - catalog.at > ttl) {
      loading ??= loadCatalog().finally(() => { loading = null; });
      try {
        await loading;
        lastError = catalog.games.length ? null : 'O BigBang não devolveu jogos para esta chave.';
      } catch (err) {
        lastError = err.message;
        catalog.at = Date.now() - ttl + 60_000; // try again in a minute
      }
    }
    return { enabled: true, games: catalog.games, providers: catalog.providers, error: catalog.games.length ? null : lastError };
  }

  async function gamesPage({ offset = 0, limit = 24, provider = '', category = '', q = '' } = {}) {
    const all = await games();
    const term = String(q || '').trim().toLowerCase();
    const list = all.games.filter((g) => (!provider || g.providerId === String(provider))
      && (!category || g.category === category)
      && (!term || g.name.toLowerCase().includes(term) || g.provider.toLowerCase().includes(term)));
    const start = Math.max(0, Number(offset) || 0);
    const size = Math.min(60, Math.max(1, Number(limit) || 24));
    return { enabled: true, bigbang: true, error: all.error, providers: all.providers, total: list.length, offset: start, games: list.slice(start, start + size) };
  }

  async function game(id) {
    await games();
    return catalog.byId.get(Number(id)) || null;
  }

  /** Games of the same provider (the detail page's "Do mesmo estilo"). */
  async function related(g, n = 12) {
    await games();
    const same = catalog.games.filter((x) => x.providerId === g.providerId && x.id !== g.id && x.category === g.category);
    return same.slice(0, n);
  }

  // ---------- players and launch ----------

  async function ensurePlayer(token, username) {
    if (players.has(token)) return;
    await call('POST', '/users/create', { user_token: token, username: username || token, country: 'PT' });
    players.add(token);
  }

  /** A game URL: demo (no account, virtual money) or real (the player's token: account or free spins). */
  async function launch({ gameId, token = null, demo = false, returnUrl = '', username = '' }) {
    const body = { game_id: Number(gameId), language: 'pt', return_url: returnUrl || undefined };
    if (demo) body.demo = true;
    else {
      await ensurePlayer(token, username);
      body.user_token = token;
    }
    const r = await call('POST', '/games/launch', body);
    if (!r.game_url) throw new HttpError(502, 'O servidor de jogos não devolveu o endereço do jogo.');
    return r.game_url;
  }

  // ---------- seamless wallet (callbacks from BigBang) ----------

  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  /** user_data: the balance of a token (account: the real balance; free spins: their own balance). */
  function walletUser(username) {
    const t = parseToken(username);
    const u = t && userRow(t.userId);
    if (!u) return { status: 404, body: { error: 'unknown user' } };
    let cents = u.balance_cents;
    if (t.spinsId) {
      const s = spinsRow(db, t.spinsId, u.id);
      if (!s) return { status: 404, body: { error: 'unknown user' } };
      cents = s.status === 'active' && s.expires_at > nowIso() ? s.balance_cents : 0;
    }
    return { status: 200, body: { username, balance: euros(cents), currency: 'EUR' } };
  }

  const verify = (p) => {
    const sig = Buffer.from(String(p?.signature || ''));
    const expected = Buffer.from(signMove(p, key));
    return sig.length === expected.length && timingSafeEqual(sig, expected);
  };

  /** balance_change: one bet / win, applied once (transaction_id); returns { status, body }. */
  function walletChange(p) {
    if (!enabled) return { status: 503, body: { error: 'casino disabled' } };
    if (!p || typeof p !== 'object' || !verify(p)) return { status: 401, body: { error: 'invalid signature' } };
    if (p.sandbox) return { status: 200, body: { status: 'ok', balance: '100000.00' } }; // test key: never real money
    const t = parseToken(p.username);
    const amount = Number(p.amount);
    const txId = String(p.transaction_id || '');
    if (!t || !txId || !Number.isFinite(amount)) return { status: 400, body: { error: 'invalid request' } };
    const cents = Math.round(amount * 100);
    return tx(db, () => {
      const dup = db.prepare('SELECT balance_after_cents FROM casino_moves WHERE transaction_id = ?').get(txId);
      if (dup) return { status: 200, body: { status: 'ok', balance: euros(dup.balance_after_cents), duplicate: true } };
      const u = userRow(t.userId);
      if (!u) return { status: 404, body: { error: 'unknown user' } };
      const move = { txId, userId: u.id, cents, round: p.round_id ? String(p.round_id) : null, type: p.type ? String(p.type) : null,
        roundEnd: p.round_end === undefined ? null : (p.round_end ? 1 : 0), game: String(p.game || ''), gameId: Number(p.game_id) || null, provider: p.provider_id ? String(p.provider_id) : null };
      let after;
      if (t.spinsId) {
        const r = spinsMove(db, u, t.spinsId, move);
        if (r.error) return { status: 400, body: { error: r.error, balance: euros(r.balance) } };
        after = r.balance;
      } else {
        // A bet needs the account to be allowed to play and the money to be there.
        if (cents < 0) {
          if (u.banned_at) return { status: 400, body: { error: 'account suspended', balance: euros(u.balance_cents) } };
          if (u.excluded_until && u.excluded_until > nowIso()) return { status: 400, body: { error: 'self-excluded', balance: euros(u.balance_cents) } };
          if (u.balance_cents + cents < 0) return { status: 400, body: { error: 'insufficient balance', balance: euros(u.balance_cents) } };
        }
        after = cents === 0 ? u.balance_cents
          : postTransaction(db, u.id, cents, cents < 0 ? 'casino_bet' : 'casino_win', `Casino · ${move.game}${cents < 0 ? ' (aposta)' : ' (ganho)'}`, `casino:${txId}`);
      }
      db.prepare(`INSERT INTO casino_moves (transaction_id, user_id, spins_id, amount_cents, balance_after_cents, round_id, type, round_end, game, game_id, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(txId, u.id, t.spinsId, cents, after, move.round, move.type, move.roundEnd, move.game, move.gameId, move.provider, nowIso());
      return { status: 200, body: { status: 'ok', balance: euros(after) } };
    });
  }

  /** Admin: is the key working, what it sees. */
  async function diagnose() {
    const out = { enabled, sandbox, baseUrl: root, steps: [] };
    if (!enabled) return out;
    try {
      const cats = await call('GET', '/categories');
      out.steps.push({ name: 'Chave e fornecedores', ok: true, detail: `${(cats.data || []).length} fornecedores` });
    } catch (err) { out.steps.push({ name: 'Chave e fornecedores', ok: false, detail: err.message }); return out; }
    try {
      const c = await loadCatalog();
      out.steps.push({ name: 'Catálogo', ok: c.games.length > 0, detail: `${c.games.length} jogos` });
    } catch (err) { out.steps.push({ name: 'Catálogo', ok: false, detail: err.message }); }
    return out;
  }

  /** A game's name from the loaded catalogue (no request), or null. */
  const gameNameSync = (id) => catalog.byId.get(Number(id))?.name || null;

  return { enabled, sandbox, games, gamesPage, game, related, launch, walletUser, walletChange, diagnose, verify, gameNameSync };
}
