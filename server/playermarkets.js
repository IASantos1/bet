// Settling BETBY-style player markets ourselves, from a GOAL API match report (server/goalapi.js
// matchReport). BETBY sends a player's full name ("Sérgio Solans"); GOAL API events name the scorer
// in a short form ("S. Solans (pen.)"). matchPlayerName bridges the two; gradePlayerMarket then reads
// the player's tally (goals / assists / cards) and returns the outcome. Nothing here touches real bets:
// it is pure, so the shadow grader can run it on finished games and we compare before going live.

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => slug(s).split(' ').filter(Boolean);
// The surname: GOAL's "S. Solans" and BETBY's "Sérgio Solans" share the last token.
const surname = (s) => { const t = tokens(s); return t[t.length - 1] || ''; };
// A leading initial if the name is written "S. Solans" / "S Solans" (one single letter first token).
const initial = (s) => { const t = tokens(s); return t.length > 1 && t[0].length === 1 ? t[0] : ''; };

/**
 * The player stat line in `players` that a market's player name refers to, limited to the given side
 * ('home' / 'away') when known. Returns { player, confidence } where confidence is, strongest first:
 *  'id'              - the market carried a GOAL API player id that matched;
 *  'exact'           - the full normalized names are equal;
 *  'surname-initial' - same surname and the GOAL short name's initial matches the market's first name;
 *  'surname'         - same surname, unique on that side (no initial to check or none given);
 *  'none'            - no confident match (surname shared by several, or not found).
 */
export function matchPlayerName(query, players, side = null, queryId = null) {
  const pool = players.filter((p) => !side || !p.team || p.team === side);
  if (queryId != null && queryId !== '') {
    const byId = pool.find((p) => p.id && String(p.id) === String(queryId));
    if (byId) return { player: byId, confidence: 'id' };
  }
  const qSlug = slug(query);
  const exact = pool.find((p) => slug(p.name) === qSlug);
  if (exact) return { player: exact, confidence: 'exact' };
  const qSur = surname(query);
  if (!qSur) return { player: null, confidence: 'none' };
  const sameSurname = pool.filter((p) => surname(p.name) === qSur);
  if (sameSurname.length === 1) {
    const cand = sameSurname[0];
    const candInit = initial(cand.name); // GOAL writes the short "S. Solans" form
    const qFirst = tokens(query)[0] || '';
    if (candInit && qFirst && candInit !== qFirst[0]) return { player: null, confidence: 'none' }; // initial disagrees
    return { player: cand, confidence: candInit ? 'surname-initial' : 'surname' };
  }
  if (sameSurname.length > 1) {
    // Several share the surname: only a matching initial can disambiguate.
    const qFirst = tokens(query)[0] || '';
    const hit = qFirst && sameSurname.filter((p) => { const i = initial(p.name); return i && i === qFirst[0]; });
    if (hit && hit.length === 1) return { player: hit[0], confidence: 'surname-initial' };
  }
  return { player: null, confidence: 'none' };
}

// The player-market kinds we can settle from goals / assists / cards alone.
export const MARKET_KINDS = {
  anytime_scorer: { need: 'goals', min: 1, label: 'Marca a qualquer momento' },
  scorer_2plus: { need: 'goals', min: 2, label: 'Marca 2 ou mais' },
  hattrick: { need: 'goals', min: 3, label: 'Hat-trick' },
  anytime_assist: { need: 'assists', min: 1, label: 'Assistência a qualquer momento' },
  to_be_carded: { need: 'cards', min: 1, label: 'Recebe cartão' },
  to_be_sent_off: { need: 'red', min: 1, label: 'Expulso' },
};

/**
 * Settles one player market against a match report. `market` = { kind, player, playerId?, side? }.
 * `report` is goalApi.matchReport(ev) (has { players, home, away }). `finished` says the match is over
 * (so a miss is a loss, not pending). Returns { result: 'WON'|'LOST'|'VOID'|'PENDING', reason, confidence }.
 */
export function gradePlayerMarket(market, report, { finished = false } = {}) {
  const spec = MARKET_KINDS[market?.kind];
  if (!spec) return { result: 'VOID', reason: `mercado desconhecido: ${market?.kind}`, confidence: 'none' };
  if (!report || !Array.isArray(report.players)) return { result: 'PENDING', reason: 'sem relatório do jogo', confidence: 'none' };
  const { player, confidence } = matchPlayerName(market.player, report.players, market.side || null, market.playerId);
  const count = (p) => (spec.need === 'cards' ? (p.yellow + p.red) : p[spec.need]) || 0;
  if (!player) {
    // No line for the player. If someone else's events exist and the game is over, the player did
    // nothing of this kind -> loss; otherwise we cannot settle yet (no feed, or name not confirmed).
    if (finished && report.players.length) return { result: 'LOST', reason: `${market.player} sem ${spec.need}`, confidence: 'none' };
    return { result: 'PENDING', reason: `jogador não encontrado (${market.player})`, confidence: 'none' };
  }
  const n = count(player);
  if (n >= spec.min) return { result: 'WON', reason: `${player.name}: ${n} ${spec.need} (≥ ${spec.min})`, confidence };
  if (finished) return { result: 'LOST', reason: `${player.name}: ${n} ${spec.need} (< ${spec.min})`, confidence };
  return { result: 'PENDING', reason: `${player.name}: ${n} ${spec.need} até agora`, confidence };
}
