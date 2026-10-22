// Casino games through the aggregator's Agent API (v4), Transfer mode.
//
// Money model — one wallet for the player. The aggregator runs in Transfer mode, so behind the
// scenes: opening a game moves the whole ClassicBet balance into the player's casino wallet
// (ledger: casino_out, users.casino_active = 1) and leaving the game, or doing anything that needs
// the balance (a sports bet, a withdrawal, opening the wallet), brings it all back (ledger:
// casino_in). The player never moves money by hand. Operations per player are serialised so a
// launch and a reclaim can never interleave.
//
// Deliberately NOT used: /v4/agent/rtp, the per-launch `rtp` / `win_ratio` overrides and the
// "bonus call" endpoints. Games always run at the provider's default return-to-player.

import { nowIso, tx } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';

const CODE_MESSAGES = {
  1: 'Fornecedor em manutenção.',
  1018: 'Servidor de jogos ocupado, tente novamente.',
  2003: 'Jogo não encontrado.',
  2005: 'O casino está temporariamente indisponível (saldo do operador insuficiente).',
  2006: 'Saldo de casino insuficiente.',
  2007: 'Fornecedor não disponível.',
  2014: 'Moeda não suportada.',
};

/** Accepts "host", "https://host/", "https://host/v4" … and returns "https://host" (paths add /v4/...). */
export function normalizeBaseUrl(raw) {
  let url = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '').replace(/\/v4(\/(agent|user|wallet|game|statistics)(\/.*)?)?$/i, '').replace(/\/+$/, '');
  return url;
}

export class CasinoError extends Error {
  constructor(code, message) {
    super(message || `Erro do casino (${code})`);
    this.code = code;
  }
}

// Values that look secret (tokens, keys, signatures, sessions) are shown only by their first characters.
const SECRET_PARAM = /token|key|sig|hash|auth|session|sid|secret|pass|ticket|mgc|jwt|code|user|player/i;
const mask = (v) => (v.length <= 4 ? '•••' : `${v.slice(0, 3)}…(${v.length})`);
/** A URL split for display: host, path and parameters, secrets masked. */
export function maskUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return { url: '(endereço inválido)' }; }
  const params = [...u.searchParams].map(([k, v]) => [k, SECRET_PARAM.test(k) || /^[A-Za-z0-9+/=_-]{25,}$/.test(v) ? mask(v) : v.slice(0, 200)]);
  const path = u.pathname.split('/').map((seg) => (/^[A-Za-z0-9_-]{25,}$/.test(seg) ? mask(seg) : seg)).join('/');
  return { host: u.host, path, params };
}

export function createCasino(db, {
  baseUrl, token, lang = 6, fetchImpl = globalThis.fetch, log = () => {}, cacheMs = 60 * 60_000, fsBetParam = '',
} = {}) {
  const root = normalizeBaseUrl(baseUrl);
  const enabled = !!(root && token);
  let catalog = { at: 0, games: [], providers: [] };
  let loading = null;

  async function call(path, body = {}) {
    if (!enabled) throw new HttpError(503, 'Casino não configurado.');
    let res;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new CasinoError(-1, `Sem ligação ao servidor de jogos (${err.message}).`);
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data) throw new CasinoError(res.status, `Servidor de jogos respondeu HTTP ${res.status}.`);
    if (data.code !== 0) throw new CasinoError(data.code, CODE_MESSAGES[data.code] || data.message || `Erro do casino (${data.code}).`);
    return data.data;
  }

  // ---------- catalogue ----------

  async function loadCatalog() {
    const providers = (await call('/v4/game/providers', { lang })) || [];
    const games = [];
    for (const p of providers) {
      if (p.status !== 1) continue; // 2 = maintenance
      try {
        const list = (await call('/v4/game/games', { provider_id: p.provider_id, lang })) || [];
        for (const g of list) {
          if (!g.launch_enable || !g.game_code) continue;
          games.push({
            providerId: g.provider_id ?? p.provider_id,
            provider: p.locale_name || p.provider_name || '',
            code: g.game_code,
            name: g.locale_name || g.game_name || g.game_code,
            image: g.game_image || null,
            category: g.category === 'Live' ? 'Ao Vivo' : 'Slots',
          });
        }
      } catch (err) {
        log(`casino jogos ${p.provider_name}: ${err.message}`);
      }
    }
    catalog = {
      at: Date.now(),
      games,
      providers: providers.map((p) => ({ id: p.provider_id, name: p.locale_name || p.provider_name, maintenance: p.status !== 1 })),
    };
    return catalog;
  }

  let lastError = null;

  async function games() {
    if (!enabled) return { enabled: false, games: [], providers: [] };
    // An empty catalogue is retried after 2 minutes instead of being cached for the full hour.
    const ttl = catalog.games.length ? cacheMs : 2 * 60_000;
    if (Date.now() - catalog.at > ttl) {
      loading ??= loadCatalog().finally(() => { loading = null; });
      try {
        await loading;
        lastError = catalog.games.length ? null
          : catalog.providers.length ? 'O agregador não devolveu jogos para os fornecedores deste agente.'
            : 'O agregador não tem fornecedores atribuídos a este agente (peça ao agregador para os ligar).';
      } catch (err) {
        lastError = err.message;
        log(`casino catálogo: ${err.message}`);
      }
    }
    return { enabled: true, games: catalog.games, providers: catalog.providers, error: catalog.games.length ? null : lastError };
  }

  /** Step-by-step connection check for the admin panel. */
  async function diagnose() {
    const steps = [];
    const step = (name, ok, detail) => steps.push({ name, ok, detail });
    step('Configuração', !!(root && token), `CASINO_API_URL ${root ? `= ${root}` : 'em falta'} · CASINO_API_TOKEN ${token ? 'definido' : 'em falta'}`);
    if (!enabled) return steps;
    try {
      const a = await call('/v4/agent/info');
      step('Agente', true, `${a?.name ?? '?'} · pontos ${a?.balance ?? '?'} · moeda ${a?.currency ?? '?'}${a?.client_ip ? ` · IP do servidor: ${a.client_ip}` : ''}`);
    } catch (err) {
      const hint = err.code === 1020 ? ' — peça ao agregador para autorizar o IP deste servidor.'
        : [1007, 1009].includes(err.code) ? ' — confirme o CASINO_API_TOKEN.'
          : err.code === -1 || err.code >= 300 ? ' — confirme o CASINO_API_URL.' : '';
      step('Agente', false, `${err.message} (código ${err.code})${hint}`);
      return steps;
    }
    let providers = [];
    try {
      providers = (await call('/v4/game/providers', { lang })) || [];
      step('Fornecedores', providers.length > 0, providers.length
        ? providers.map((p) => `${p.provider_name}${p.status === 1 ? '' : ' (manutenção)'}`).join(', ')
        : 'Nenhum fornecedor atribuído a este agente — peça ao agregador para os ligar.');
    } catch (err) {
      step('Fornecedores', false, `${err.message} (código ${err.code})`);
      return steps;
    }
    catalog.at = 0; // force a fresh catalogue with what we now know
    const result = await games();
    step('Jogos', result.games.length > 0, result.games.length ? `${result.games.length} jogos disponíveis` : (result.error || 'Sem jogos.'));
    return steps;
  }

  // ---------- players ----------

  async function userCode(user) {
    const row = db.prepare('SELECT casino_user_code FROM users WHERE id = ?').get(user.id);
    if (row?.casino_user_code) return row.casino_user_code;
    const data = await call('/v4/user/create', { name: `cb${user.id}` });
    db.prepare('UPDATE users SET casino_user_code = ? WHERE id = ?').run(data.user_code, user.id);
    return data.user_code;
  }

  const toCents = (v) => Math.round(Number(v || 0) * 100);

  async function casinoBalanceCents(user) {
    const code = await userCode(user);
    return toCents((await call('/v4/user/info', { user_code: code }))?.balance);
  }

  function assertCanPlay(user) {
    if (user.excluded_until && user.excluded_until > nowIso()) {
      throw new HttpError(403, 'A sua conta está em autoexclusão. O casino está bloqueado.');
    }
  }

  /** Moves money from the ClassicBet wallet to the player's casino wallet. */
  async function transferIn(user, cents) {
    assertCanPlay(user);
    const code = await userCode(user);
    const before = await casinoBalanceCents(user);
    // Debit first, so the money can never exist in both wallets.
    tx(db, () => postTransaction(db, user.id, -cents, 'casino_out', 'Transferência para o casino'));
    try {
      await call('/v4/wallet/deposit', { user_code: code, amount: cents / 100 });
    } catch (err) {
      // The deposit may have landed even if the answer was lost: check before refunding.
      let after = null;
      try { after = await casinoBalanceCents(user); } catch { /* unknown */ }
      if (after !== null && after >= before + cents) return { casinoCents: after };
      if (after === null) {
        log(`casino: depósito de ${cents} para o utilizador ${user.id} com resultado desconhecido — verificar manualmente`);
        throw new HttpError(502, 'Não foi possível confirmar a transferência. O suporte vai verificar o seu saldo.');
      }
      tx(db, () => postTransaction(db, user.id, cents, 'casino_in', 'Transferência para o casino falhou — valor devolvido'));
      throw err;
    }
    return { casinoCents: before + cents };
  }

  /** Brings the whole casino balance back to the ClassicBet wallet. */
  async function transferOut(user) {
    const code = await userCode(user);
    const data = await call('/v4/wallet/withdraw-all', { user_code: code });
    const cents = toCents(data?.amount);
    if (cents > 0) tx(db, () => postTransaction(db, user.id, cents, 'casino_in', 'Transferência do casino'));
    return { amountCents: cents };
  }

  async function launch(user, { providerId, gameCode, returnUrl }) {
    assertCanPlay(user);
    const code = await userCode(user);
    // No rtp / win_ratio: the provider's default return-to-player always applies.
    const data = await call('/v4/game/game-url', {
      user_code: code, provider_id: Number(providerId), game_symbol: String(gameCode), lang, return_url: returnUrl || '',
    });
    if (!data?.game_url) throw new CasinoError(-1, 'O fornecedor não devolveu o endereço do jogo.');
    return data.game_url;
  }

  /**
   * Admin check: opens one game for the admin and shows the address it opens at, following up to three
   * redirects, with every secret-looking value masked. Used to see whether the provider's address
   * carries a jurisdiction setting (the one that hides "buy free spins" and turbo in regulated markets).
   */
  async function inspectLaunch(user, { name = 'Gates of Olympus', jurisdiction = '', open = false } = {}) {
    const list = (await games()).games;
    const want = String(name || '').toLowerCase().trim();
    const isPragmatic = (g) => /pragmatic/i.test(g.provider);
    const game = list.find((g) => g.name.toLowerCase() === want && isPragmatic(g)) || list.find((g) => g.name.toLowerCase().includes(want))
      || list.find(isPragmatic);
    if (!game) throw new HttpError(404, 'Jogo não encontrado no catálogo.');
    const first = await launch(user, { providerId: game.providerId, gameCode: game.code, returnUrl: '' });
    const hops = [];
    const found = new Set();
    let url = first;
    for (let i = 0; i < 4 && url; i += 1) {
      // Trial: ask Pragmatic for another jurisdiction (e.g. UK) on its own game address.
      if (jurisdiction && /pragmatic/i.test(new URL(url).host) && /playGame\.do$/i.test(new URL(url).pathname)) {
        const u = new URL(url);
        u.searchParams.set('jurisdiction', jurisdiction);
        url = u.toString();
        // To look at the game itself: the admin's browser opens it from here (not used up by us first).
        if (open) return { game: { name: game.name, provider: game.provider, code: game.code }, openUrl: url, tried: jurisdiction };
      }
      hops.push(maskUrl(url));
      for (const m of String(url).matchAll(/jurisdiction=([^&#"']*)/gi)) found.add(decodeURIComponent(m[1]));
      let res;
      try { res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }); } catch { break; }
      const loc = res.headers.get('location');
      if (loc && res.status >= 300 && res.status < 400) { url = new URL(loc, url).toString(); continue; }
      // The page itself may build the game address in script: the jurisdiction set there.
      const text = (await res.text().catch(() => '')).slice(0, 200_000);
      for (const m of text.matchAll(/["']?jurisdiction["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{1,12})/gi)) found.add(m[1]);
      // The words around each setting that may switch the buy feature or turbo, secrets masked.
      const around = [];
      for (const m of text.matchAll(/jurisdiction|turbo|buy|purchase|ante/gi)) {
        if (around.length >= 15) break;
        const bit = text.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, ' ').replace(/[A-Za-z0-9+/=_-]{25,}/g, mask);
        if (!around.some((a) => a.includes(m[0]) && a.slice(0, 40) === bit.slice(0, 40))) around.push(bit);
      }
      hops.push({ status: res.status, note: 'página final (não redireciona)', around });
      break;
    }
    return { game: { name: game.name, provider: game.provider, code: game.code }, hops, jurisdiction: [...found], tried: jurisdiction || null };
  }

  // ---------- single wallet ----------

  const locks = new Map();
  /** Runs fn after any previous operation for the same player has finished. */
  function withLock(userId, fn) {
    const prev = locks.get(userId) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    locks.set(userId, tail);
    tail.then(() => { if (locks.get(userId) === tail) locks.delete(userId); });
    return run;
  }
  const freshUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  /** Opens a game: the whole balance follows the player into the casino. Returns { url, casinoCents }. */
  function enterGame(user, { providerId, gameCode, returnUrl }) {
    return withLock(user.id, async () => {
      const u = freshUser(user.id);
      assertCanPlay(u);
      let casinoCents = null;
      if (u.balance_cents > 0) casinoCents = (await transferIn(u, u.balance_cents)).casinoCents;
      db.prepare('UPDATE users SET casino_active = 1 WHERE id = ?').run(u.id);
      try {
        const url = await launch(u, { providerId, gameCode, returnUrl });
        return { url, casinoCents: casinoCents ?? await casinoBalanceCents(u) };
      } catch (err) {
        // Could not start the game: give the money straight back.
        await transferOut(u).catch(() => {});
        db.prepare('UPDATE users SET casino_active = 0 WHERE id = ?').run(u.id);
        throw err;
      }
    });
  }

  /** Brings the casino balance back into the ClassicBet wallet. Returns the amount moved (cents). */
  function leaveGame(user) {
    return withLock(user.id, async () => {
      const u = freshUser(user.id);
      if (!u?.casino_user_code) return 0;
      const { amountCents } = await transferOut(u);
      db.prepare('UPDATE users SET casino_active = 0 WHERE id = ?').run(u.id);
      return amountCents;
    });
  }

  /** Before anything that spends the ClassicBet balance: reclaim money left in the casino. */
  async function syncBack(user) {
    if (!enabled) return 0;
    const u = freshUser(user.id);
    if (!u?.casino_active) return 0;
    return leaveGame(u);
  }

  // ---------- free spins (a separate casino account per player) ----------
  // The free-spins money never mixes with the player's own: it goes to a second casino account
  // (cb<id>fs), only the chosen game is opened on it, and what is left there is settled by us.

  async function fsUserCode(user) {
    const row = db.prepare('SELECT casino_fs_code FROM users WHERE id = ?').get(user.id);
    if (row?.casino_fs_code) return row.casino_fs_code;
    const data = await call('/v4/user/create', { name: `cb${user.id}fs` });
    db.prepare('UPDATE users SET casino_fs_code = ? WHERE id = ?').run(data.user_code, user.id);
    return data.user_code;
  }
  async function fsBalanceCents(user) {
    const code = await fsUserCode(user);
    return toCents((await call('/v4/user/info', { user_code: code }))?.balance);
  }

  /**
   * Opens a game on the free-spins account; `fundCents` (first launch only) is put there first.
   * Returns { url, fsCents }. `spinBetCents`: the bet each spin is fixed at (sent as `fsBetParam`).
   */
  function fsEnterGame(user, { providerId, gameCode, returnUrl, fundCents = 0, spinBetCents = 0 }) {
    return withLock(`fs:${user.id}`, async () => {
      const u = freshUser(user.id);
      assertCanPlay(u);
      const code = await fsUserCode(u);
      if (fundCents > 0) {
        // A new grant starts from zero there (anything left by an older one goes back first).
        await call('/v4/wallet/withdraw-all', { user_code: code });
        await call('/v4/wallet/deposit', { user_code: code, amount: fundCents / 100 });
      }
      const data = await call('/v4/game/game-url', {
        user_code: code, provider_id: Number(providerId), game_symbol: String(gameCode), lang, return_url: returnUrl || '',
        // The bet per spin fixed in the game (€0.10 / €0.20), so the player cannot raise it.
        ...(fsBetParam && spinBetCents > 0 ? { [fsBetParam]: spinBetCents / 100 } : {}),
      });
      if (!data?.game_url) throw new CasinoError(-1, 'O fornecedor não devolveu o endereço do jogo.');
      return { url: data.game_url, fsCents: await fsBalanceCents(u) };
    });
  }

  /** Takes everything left on the free-spins account back (to the operator). Returns the cents. */
  function fsWithdrawAll(user) {
    return withLock(`fs:${user.id}`, async () => {
      const code = await fsUserCode(user);
      return toCents((await call('/v4/wallet/withdraw-all', { user_code: code }))?.amount);
    });
  }

  async function agentInfo() {
    const a = await call('/v4/agent/info');
    return { name: a?.name, balance: a?.balance, currency: a?.currency };
  }

  /** One page of the catalogue, filtered by provider / category / name. */
  async function gamesPage({ offset = 0, limit = 24, provider = '', category = '', q = '' } = {}) {
    const all = await games();
    const term = String(q || '').trim().toLowerCase();
    const list = all.games.filter((g) => (!provider || String(g.providerId) === String(provider))
      && (!category || g.category === category)
      && (!term || g.name.toLowerCase().includes(term) || g.provider.toLowerCase().includes(term)));
    const start = Math.max(0, Number(offset) || 0);
    const size = Math.min(60, Math.max(1, Number(limit) || 24));
    return { ...all, total: list.length, offset: start, games: list.slice(start, start + size) };
  }

  return {
    enabled, games, gamesPage, diagnose, casinoBalanceCents, transferIn, transferOut, launch, agentInfo, inspectLaunch,
    enterGame, leaveGame, syncBack, fsEnterGame, fsBalanceCents, fsWithdrawAll,
  };
}
