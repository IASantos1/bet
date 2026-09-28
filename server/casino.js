// Casino games through the aggregator's Agent API (v4), Transfer mode.
//
// Money model: the ClassicBet wallet and the player's casino wallet are separate. The player moves
// money into the casino before playing (ledger: casino_out) and brings it back afterwards
// (ledger: casino_in). Every move is written to the ClassicBet ledger.
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

export class CasinoError extends Error {
  constructor(code, message) {
    super(message || `Erro do casino (${code})`);
    this.code = code;
  }
}

export function createCasino(db, {
  baseUrl, token, lang = 6, fetchImpl = globalThis.fetch, log = () => {}, cacheMs = 60 * 60_000,
} = {}) {
  const enabled = !!(baseUrl && token);
  const root = String(baseUrl || '').replace(/\/+$/, '');
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

  async function games() {
    if (!enabled) return { enabled: false, games: [], providers: [] };
    if (Date.now() - catalog.at > cacheMs) {
      loading ??= loadCatalog().finally(() => { loading = null; });
      try { await loading; } catch (err) {
        log(`casino catálogo: ${err.message}`);
        if (!catalog.at) throw err;
      }
    }
    return { enabled: true, games: catalog.games, providers: catalog.providers };
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

  async function agentInfo() {
    const a = await call('/v4/agent/info');
    return { name: a?.name, balance: a?.balance, currency: a?.currency };
  }

  return { enabled, games, casinoBalanceCents, transferIn, transferOut, launch, agentInfo };
}
