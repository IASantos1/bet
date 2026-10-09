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

// The player's id at BigBang, also sent as its username (the callbacks name the player by username).
// "bet62_…" players were created with the display name as username: still understood, no longer made.
const TOKEN = /^(?:b62|bet62)_(\d+)(?:_fs(\d+))?$/;
export const playerToken = (userId, spinsId = null) => `b62_${userId}${spinsId ? `_fs${spinsId}` : ''}`;
export const parseToken = (t) => { const m = TOKEN.exec(String(t || '')); return m ? { userId: Number(m[1]), spinsId: m[2] ? Number(m[2]) : null } : null; };

/** balance_change signature: HMAC-SHA256(username + amount + game + game_category + transaction_id, API key), hex. */
export function signMove(p, key) {
  const base = String(p.username) + String(p.amount) + String(p.game) + String(p.game_category) + String(p.transaction_id);
  return createHmac('sha256', key).update(base).digest('hex');
}

const TYPE_LABEL = { slot: 'Slots', live: 'Ao Vivo', crash: 'Crash' };
/**
 * Games known as hits across the market (first = most popular), for the "Populares" order before
 * Bet62 has its own numbers; the rounds played here in the last 30 days weigh far more.
 */
export const HITS = [
  'gates of olympus', 'sweet bonanza', 'aviator', 'sugar rush', 'big bass', 'starlight princess', 'fortune tiger', 'book of dead',
  'wanted dead or a wild', 'the dog house', 'wolf gold', 'fruit party', 'spaceman', 'mines', 'zeus vs hades', 'gates of gatot kaca',
  'fortune rabbit', 'fortune ox', 'fortune mouse', 'buffalo king', 'madame destiny', 'great rhino', 'john hunter', 'money train',
  'reactoonz', 'legacy of dead', 'rise of olympus', 'fire in the hole', 'chaos crew', 'le bandit', 'razor shark', 'jammin jars',
  'roleta', 'roulette', 'blackjack', 'crazy time', 'sweet bonanza candyland', 'mega wheel', 'plinko', 'jetx',
];
/** Lobby rows: popular first, then the newest, then each kind of game. */
const LOBBY = [['populares', 'Populares'], ['novos', 'Novos'], ['Slots', 'Slots'], ['Ao Vivo', 'Casino ao vivo'], ['Crash', 'Crash']];
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

  // Rounds played per game here in the last 30 days (refreshed every 10 minutes).
  let plays = { at: 0, map: new Map() };
  function playsMap() {
    if (Date.now() - plays.at > 10 * 60_000) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const rows = db.prepare(`SELECT game_id, COUNT(DISTINCT COALESCE(round_id, transaction_id)) AS n FROM casino_moves
        WHERE game_id IS NOT NULL AND amount_cents < 0 AND created_at >= ? GROUP BY game_id`).all(since);
      plays = { at: Date.now(), map: new Map(rows.map((r) => [Number(r.game_id), r.n])) };
    }
    return plays.map;
  }
  const hitRank = (g) => {
    const name = g.name.toLowerCase();
    const i = HITS.findIndex((h) => name.includes(h));
    return i < 0 ? 0 : HITS.length - i;
  };
  /** Most popular first: rounds played here, then the market's hits, then premium games. */
  function byPopularity(list) {
    const p = playsMap();
    const score = (g) => (p.get(g.id) || 0) * 1000 + hitRank(g) * 10 + (g.premium ? 1 : 0);
    return list.map((g) => [score(g), g]).sort((a, b) => b[0] - a[0] || a[1].id - b[1].id).map(([, g]) => g);
  }
  // The provider gives no release date: higher ids are the games it added last.
  const byNewest = (list) => [...list].sort((a, b) => b.id - a.id);

  /** The casino lobby: each row with its first `n` games (the most popular first). */
  async function lobby({ n = 10 } = {}) {
    const all = await games();
    const popular = byPopularity(all.games);
    const rows = LOBBY.map(([key, title]) => {
      const list = key === 'populares' ? popular : key === 'novos' ? byNewest(all.games) : popular.filter((g) => g.category === key);
      return { key, title, total: list.length, games: list.slice(0, n) };
    }).filter((r) => r.games.length);
    // Then one row per provider: the providers of the most popular games first.
    const order = [];
    for (const g of popular) if (!order.includes(g.providerId)) order.push(g.providerId);
    for (const id of order) {
      const list = popular.filter((g) => g.providerId === id);
      const name = all.providers.find((p) => p.id === id)?.name || list[0]?.provider || id;
      rows.push({ key: 'provider', provider: id, title: name, total: list.length, games: list.slice(0, n) });
    }
    return { enabled: true, bigbang: true, error: all.error, providers: all.providers, total: all.games.length, rows };
  }

  async function gamesPage({ offset = 0, limit = 24, provider = '', category = '', q = '', sort = '' } = {}) {
    const all = await games();
    const term = String(q || '').trim().toLowerCase();
    // "populares" / "novos" are orders over every game; the other categories are kinds of game.
    const order = sort || (category === 'novos' ? 'new' : 'popular');
    const kind = category === 'populares' || category === 'novos' ? '' : category;
    let list = all.games.filter((g) => (!provider || g.providerId === String(provider))
      && (!kind || g.category === kind)
      && (!term || g.name.toLowerCase().includes(term) || g.provider.toLowerCase().includes(term)));
    list = order === 'new' ? byNewest(list) : byPopularity(list);
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
    return byPopularity(same).slice(0, n);
  }

  // ---------- players and launch ----------

  async function ensurePlayer(token) {
    if (players.has(token)) return;
    // username = the token: BigBang's wallet callbacks identify the player by it.
    await call('POST', '/users/create', { user_token: token, username: token, country: 'PT' });
    players.add(token);
  }

  /** A game URL: demo (no account, virtual money) or real (the player's token: account or free spins). */
  async function launch({ gameId, token = null, demo = false, returnUrl = '' }) {
    const body = { game_id: Number(gameId), language: 'pt', return_url: returnUrl || undefined };
    if (demo) body.demo = true;
    else {
      await ensurePlayer(token);
      body.user_token = token;
    }
    const r = await call('POST', '/games/launch', body);
    if (!r.game_url) throw new HttpError(502, 'O servidor de jogos não devolveu o endereço do jogo.');
    return r.game_url;
  }

  // ---------- seamless wallet (callbacks from BigBang) ----------

  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  // The last wallet callbacks received (admin → Casino): empty means BigBang is not calling us.
  const callLog = [];
  const logCall = (kind, username, r, extra = '') => {
    callLog.unshift({ at: nowIso(), kind, username: String(username || '').slice(0, 60), status: r.status, detail: r.body.error || extra || `saldo ${r.body.balance}` });
    callLog.length = Math.min(callLog.length, 30);
    if (r.status !== 200) log(`bigbang ${kind} ${username}: ${r.status} ${r.body.error}`);
    return r;
  };

  /** user_data: the balance of a token (account: the real balance; free spins: their own balance). */
  function walletUser(username) { return logCall('user_data', username, walletUserOf(username)); }
  function walletUserOf(username) {
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
  function walletChange(p) { return logCall('balance_change', p?.username, walletChangeOf(p), p?.amount !== undefined ? `${p.amount}` : ''); }
  function walletChangeOf(p) {
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

  return { enabled, sandbox, games, gamesPage, lobby, callLog: () => callLog, game, related, launch, walletUser, walletChange, diagnose, verify, gameNameSync };
}
