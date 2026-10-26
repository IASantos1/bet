// Betting markets: what can be offered on a match and how each selection is settled from the
// full-time score. Every market here is settled on the regulation-time result.
//
//   market  code            meaning
//   1x2     1 / X / 2       home win / draw / away win
//   dc      1X / 12 / X2    double chance
//   dnb     1 / 2           draw no bet (a draw voids the stake)
//   ou      O2.5 / U2.5 …   total goals over / under a line; a whole line (O3) voids on a push
//   btts    Y / N           both teams to score
//   ml      1 / 2           match winner including overtime / extra sets (a tie voids the stake)
//   hcp     1-1.5 / 2+1.5 … handicap on the main score (sets in tennis); the line is that side's
//   gou     O20.5 / U20.5 … total games (tennis)
//   ghcp    1+3.5 / 2-3.5 … games handicap (tennis)
//   goe     ODD / EVEN      total games odd / even (tennis)
//   oe      ODD / EVEN      total goals / points odd / even (main score)
//   tou     1O0.5 / 2U1.5 … one team's goals over / under a line (whole lines void on a push)
//   x       "<id>~<market>~<selection>"  any other market the provider offers (corners, combos,
//           goal times…): shown and bet like the rest, settled by the operator in Liquidação.
//
// Period markets (a set in tennis, a half in football): the code starts with the period number,
// "<n>:<code>", and settles on events.period_scores ([[home, away], …], games per set / goals per
// half); without that period's score the leg is void.
//   pw      1:1 / 1:X / 1:2       winner of the period
//   pou     1:O8.5 / 1:U8.5       total in the period
//   phcp    1:1-2.5 / 1:2+2.5     handicap in the period
//   poe     1:ODD / 1:EVEN        total in the period odd / even
//   pbtts   1:Y / 1:N             both teams score in the half
//
// Games markets settle on the games of every set (events.home_games / away_games); without them,
// or after a retirement, every market but the winner is void.
//
// Other sports: `1x2` is settled on the regulation score when the event has one (ice hockey), `ml`
// always on the final score.

export const OU_LINES = ['0.5', '1.5', '2.5', '3.5', '4.5'];

const LINE = /^[OU]\d{1,3}\.5$/; // over / under a half line (no push)
const OU_LINE = /^[OU]\d{1,3}(\.5)?$/; // main totals also take whole lines (a push voids)
const HCP = /^[12][+-]\d{1,3}(\.5)?$/;

export const MARKETS = {
  '1x2': { name: 'Resultado final', codes: ['1', 'X', '2'] },
  dc: { name: 'Dupla hipótese', codes: ['1X', '12', 'X2'] },
  dnb: { name: 'Empate anula aposta', codes: ['1', '2'] },
  ou: { name: 'Total de golos', valid: OU_LINE },
  btts: { name: 'Ambas as equipas marcam', codes: ['Y', 'N'] },
  ml: { name: 'Vencedor', codes: ['1', '2'] },
  hcp: { name: 'Handicap', valid: HCP },
  gou: { name: 'Total de jogos', valid: LINE },
  ghcp: { name: 'Handicap de jogos', valid: HCP },
  goe: { name: 'Total de jogos par / ímpar', codes: ['ODD', 'EVEN'] },
  oe: { name: 'Total par / ímpar', codes: ['ODD', 'EVEN'] },
  tou: { name: 'Total da equipa', valid: /^[12][OU]\d{1,3}(\.5)?$/ },
  x: { name: 'Mais mercados', valid: /^\d{1,12}~[^~|\n]{1,80}~[^~|\n]{1,80}$/ },
  cs: { name: 'Resultado exato', valid: /^\d{1,2}:\d{1,2}$/ },
  pw: { name: 'Vencedor', period: true, valid: /^\d:[1X2]$/ },
  pou: { name: 'Total', period: true, valid: /^\d:[OU]\d{1,3}\.5$/ },
  phcp: { name: 'Handicap', period: true, valid: /^\d:[12][+-]\d{1,3}(\.5)?$/ },
  poe: { name: 'Par / ímpar', period: true, valid: /^\d:(ODD|EVEN)$/ },
  pbtts: { name: 'Ambas marcam', period: true, valid: /^\d:[YN]$/ },
};
export const PERIOD_MARKETS = new Set(['pw', 'pou', 'phcp', 'poe', 'pbtts']);
/** "2:O8.5" → { period: 2, code: 'O8.5' } */
export const splitPeriod = (code) => { const m = /^(\d):(.+)$/.exec(code); return m ? { period: Number(m[1]), code: m[2] } : null; };

export const MARKET_ORDER = ['ml', '1x2', 'dc', 'dnb', 'ou', 'btts', 'hcp', 'gou', 'ghcp', 'goe', 'oe', 'tou', 'cs', 'x', 'pw', 'pou', 'phcp', 'poe', 'pbtts'];
/** Markets settled on games rather than on the main score. */
export const GAMES_MARKETS = new Set(['gou', 'ghcp', 'goe']);

export const isValidSelection = (market, code) => {
  const m = MARKETS[market];
  return !!m && (m.codes ? m.codes.includes(code) : m.valid.test(code));
};

/** Display order of a selection within its market: fixed codes, else by line (over before under, 1 before 2). */
export function codeRank(market, code) {
  const m = MARKETS[market];
  if (m?.period) {
    const p = splitPeriod(code);
    if (!p) return 999;
    const inner = { pw: '1X2'.indexOf(p.code), poe: p.code === 'ODD' ? 0 : 1, pbtts: p.code === 'Y' ? 0 : 1 }[market]
      ?? codeRank(market === 'pou' ? 'gou' : 'hcp', p.code);
    return p.period * 1000 + inner;
  }
  if (m?.codes) return m.codes.indexOf(code);
  if (market === 'x') return 0; // provider order
  if (market === 'cs') { const [h, a] = code.split(':').map(Number); return (h + a) * 100 + h; }
  if (market === 'tou') return (code[0] === '1' ? 0 : 100_000) + Number(code.slice(2)) * 10 + (code[1] === 'O' ? 0 : 1);
  const line = Math.abs(Number(code.slice(1))) || 0;
  return line * 10 + (code[0] === 'O' || code[0] === '1' ? 0 : 1);
}

/** Handicap code for a side and line: (1, -1.5) → "1-1.5". */
export const hcpCode = (sideCode, line) => `${sideCode}${line >= 0 ? '+' : ''}${line}`;

const overUnder = (code, total) => {
  const line = Number(code.slice(1));
  if (total === line) return 'void'; // whole line hit exactly
  return (code[0] === 'O') === (total > line) ? 'won' : 'lost';
};
const handicap = (code, home, away) => {
  const margin = (code[0] === '1' ? home - away : away - home) + Number(code.slice(1));
  return margin > 0 ? 'won' : margin < 0 ? 'lost' : 'void';
};

export const resultCode = (home, away) => (home > away ? '1' : home < away ? '2' : 'X');

/** Settles one selection against a final score: 'won' | 'lost' | 'void'. */
export function legOutcome(market, code, home, away, { homeGames = null, awayGames = null, periods = null } = {}) {
  if (PERIOD_MARKETS.has(market)) {
    const p = splitPeriod(code);
    const score = p && Array.isArray(periods) ? periods[p.period - 1] : null;
    if (!score || !Number.isInteger(score[0]) || !Number.isInteger(score[1])) return 'void';
    const [h, a] = score;
    switch (market) {
      case 'pw': return p.code === resultCode(h, a) ? 'won' : 'lost';
      case 'pou': return overUnder(p.code, h + a);
      case 'phcp': return handicap(p.code, h, a);
      case 'poe': return (p.code === 'ODD') === ((h + a) % 2 === 1) ? 'won' : 'lost';
      default: return (p.code === 'Y') === (h > 0 && a > 0) ? 'won' : 'lost';
    }
  }
  const result = resultCode(home, away);
  if (GAMES_MARKETS.has(market) && (homeGames === null || awayGames === null)) return 'void';
  switch (market) {
    case '1x2': return code === result ? 'won' : 'lost';
    case 'dc': return code.includes(result) ? 'won' : 'lost';
    case 'dnb':
      if (result === 'X') return 'void';
      return code === result ? 'won' : 'lost';
    case 'ou': return overUnder(code, home + away);
    case 'cs': return code === `${home}:${away}` ? 'won' : 'lost';
    case 'oe': return (code === 'ODD') === ((home + away) % 2 === 1) ? 'won' : 'lost';
    case 'tou': return overUnder(code.slice(1), code[0] === '1' ? home : away);
    case 'x': return 'open'; // settled by the operator
    case 'hcp': return handicap(code, home, away);
    case 'gou': return overUnder(code, homeGames + awayGames);
    case 'ghcp': return handicap(code, homeGames, awayGames);
    case 'goe': return (code === 'ODD') === ((homeGames + awayGames) % 2 === 1) ? 'won' : 'lost';
    case 'btts': return (code === 'Y') === (home > 0 && away > 0) ? 'won' : 'lost';
    case 'ml':
      if (result === 'X') return 'void';
      return code === result ? 'won' : 'lost';
    default: throw new Error(`Mercado desconhecido: ${market}`);
  }
}

/** Human label for a selection, e.g. ("ou","O2.5") → "Mais de 2.5". */
export function selectionLabel(market, code, home = 'Casa', away = 'Fora') {
  if (PERIOD_MARKETS.has(market)) {
    const p = splitPeriod(code);
    if (!p) return code;
    const inner = { pw: '1x2', pou: 'gou', phcp: 'hcp', poe: 'goe', pbtts: 'btts' }[market];
    return selectionLabel(inner, p.code, home, away);
  }
  switch (market) {
    case '1x2': return code === '1' ? home : code === '2' ? away : 'Empate';
    case 'dc': return { '1X': `${home} ou empate`, 12: `${home} ou ${away}`, X2: `Empate ou ${away}` }[code];
    case 'dnb': case 'ml': return code === '1' ? home : away;
    case 'ou': return `${code[0] === 'O' ? 'Mais' : 'Menos'} de ${code.slice(1)}`;
    case 'btts': return code === 'Y' ? 'Sim' : 'Não';
    case 'hcp': case 'ghcp': return `${code[0] === '1' ? home : away} ${code.slice(1)}`;
    case 'gou': return `${code[0] === 'O' ? 'Mais' : 'Menos'} de ${code.slice(1)}`;
    case 'goe': case 'oe': return code === 'ODD' ? 'Ímpar' : 'Par';
    case 'cs': return code.replace(':', ' - ');
    case 'tou': return `${code[0] === '1' ? home : away}: ${code[1] === 'O' ? 'Mais' : 'Menos'} de ${code.slice(2)}`;
    case 'x': return splitSpecial(code)?.label ?? code;
    default: return code;
  }
}

/** "1S", "S1", "SET1", "1ST_SET", "1H", "FIRST_HALF" → 1; full time / unknown → null. */
export function periodNumber(v) {
  const s = String(v || 'FT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (['FT', 'FULLTIME', 'MATCH', ''].includes(s)) return null;
  const words = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5 };
  for (const [w, n] of Object.entries(words)) if (s.startsWith(w)) return n;
  const m = /^(?:SET|S|H|P|Q)?(\d)(?:ST|ND|RD|TH)?(?:SET|S|H|HALF|P|Q)?$/.exec(s);
  return m ? Number(m[1]) : null;
}

/** "1300017~Cantos · Total~Mais de (8.5)" → { id: 1300017, group: "Cantos · Total", label: "Mais de (8.5)" }. */
export function splitSpecial(code) {
  const m = /^(\d{1,12})~([^~]+)~([^~]+)$/.exec(String(code || ''));
  return m ? { id: Number(m[1]), group: m[2], label: m[3] } : null;
}

const plain = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const PERIOD_WORD = /(\d+)\s*\.?\s*[ºo°]?\s*(?:set|tempo|parte|periodo|quarto|period|half|quarter|mapa|map)\b/;
const FIRST_WORD = /\b(primeiro|primeira|1st|first)\s+(set|tempo|parte|periodo|quarto|period|half|quarter|mapa|map)\b/;
const SECOND_WORD = /\b(segundo|segunda|2nd|second)\s+(set|tempo|parte|periodo|quarto|period|half|quarter|mapa|map)\b/;

// Markets about something other than the score (players, goal times, cards, corners, shots…): never
// read from the score; corners, yellow cards and shots have their own reader (statOutcome).
const NOT_SCORE = /(canto|corner|cartao|cartoes|card|booking|amarel|vermelh|remate|shot|falta|foul|fora de jogo|offside|penalt|substitu|lancamento|throw|livre|free.?kick|marcador|scorer|jogador|player|minuto|minute|primeiro golo|first goal|ultimo golo|last goal|proximo golo|next goal|golo de cabeca|header|metodo|method|corrida|race to|primeiro a|first to|\baces?\b|break|tie.?break|posse|possession|assist|defesa|\bsaves?\b|knock.?out|ronda|round|decisao|decision|kills?\b|torre|tower|dragao|dragon|baron|pistol|wicket|innings?|entrada|180|checkout|tempo de|time of|intervalo de|interval of|quando|when|qual|which|como|how|metade com mais|highest scoring|vence (ambas|as duas)|win both|vence a zero|win to nil|baliza inviolada|clean sheet|margem|margin|sem sofrer|to nil)/;
/** Sports whose main score counts sets or maps; sports where only the winner is read from it. */
const SET_SCORE = new Set(['tenis', 'voleibol', 'tenismesa', 'badminton', 'dardos', 'esports']);
const WINNER_ONLY = new Set(['boxe', 'mma', 'criquete']);
const HOME_WORDS = ['1', 'casa', 'home', 'equipa da casa', 'home team', 'w1', 'p1'];
const DRAW_WORDS = ['x', 'empate', 'draw'];
const AWAY_WORDS = ['2', 'fora', 'away', 'visitante', 'equipa visitante', 'away team', 'w2', 'p2'];
/** A side named by a selection: '1' | 'X' | '2', or null. */
function sideOf(v, homeName, awayName) {
  const s = plain(v);
  if (HOME_WORDS.includes(s) || (homeName && s === plain(homeName))) return '1';
  if (DRAW_WORDS.includes(s)) return 'X';
  if (AWAY_WORDS.includes(s) || (awayName && s === plain(awayName))) return '2';
  return null;
}
/** A line we can settle: whole or half ("2.5", "-1", "+0.5"); quarter lines (2.25) split the stake, so null. */
const halfLine = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && Number.isInteger(n * 2) ? n : null; };
/** "Mais de (2.5)" / "Over 2.5" / "Menos 1,5" → ['O' | 'U', line], or null. */
function ouOf(l) {
  const m = /^(mais|over|acima|menos|under|abaixo)\b\D*?([-+]?\d+(?:[.,]\d+)?)\s*\)?$/.exec(l);
  const line = m ? halfLine(m[2]) : null;
  return line === null || line < 0 ? null : [/^(mais|over|acima)$/.test(m[1]) ? 'O' : 'U', line];
}
const okScore = (s) => Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1]);
const yesNo = (l) => (/^(sim|yes)$/.test(l) ? true : /^(nao|no)$/.test(l) ? false : null);
/** The period a market is about ("1.º tempo", "2nd half", "Set 3"), or null. */
const n0 = (g) => PERIOD_WORD.exec(g)?.[1] || (FIRST_WORD.test(g) ? '1' : SECOND_WORD.test(g) ? '2' : null);
const wonIf = (v) => (v === null ? null : v ? 'won' : 'lost');

/**
 * A provider market ('x') read automatically from the score: the match's or a period's (half, set,
 * quarter, map) winner, double chance, draw no bet, totals (match and either team, half and whole
 * lines), handicaps (asian half / whole lines, european "1 (0:1)"), both teams to score, odd / even,
 * correct score, exact total, half time / full time, "1x2 & total" and "a goal in both halves".
 * `periods`: [[home, away], …]; full-time markets use the regulation score where the sport has one
 * (`regHome` / `regAway`, ice hockey) unless they include overtime. 'won' | 'lost' | 'void', or null
 * when it cannot be read safely (it waits for the operator; the settlement engine voids it after a
 * while): markets about players, goal times, cards… and quarter lines are never guessed.
 */
export function specialOutcome(code, {
  periods = null, home = null, away = null, regHome = null, regAway = null, homeName = '', awayName = '', retired = false, sport = null, stats = null,
} = {}) {
  const sp = splitSpecial(code);
  if (!sp) return null;
  // WinHouse's numbered markets are read by their number.
  if (sp.id >= 1_000_000) {
    if (retired) return null;
    const full = Number.isInteger(home) && Number.isInteger(away) ? [home, away] : null;
    const ft = Number.isInteger(regHome) && Number.isInteger(regAway) ? [regHome, regAway] : full;
    const out = whOutcome(code, { periods, ft, stats });
    // A number not listed there: read by its name below (as conservatively as any other market).
    if (out !== undefined) return out;
  }
  const g = plain(sp.group);
  const l = plain(sp.label);
  if (NOT_SCORE.test(g)) return null;
  // Combat sports and cricket: only the winner is read (their "score" says nothing of rounds or runs).
  if (WINNER_ONLY.has(sport) && (n0(g) || !/^(vencedor|vencedor do (jogo|combate)|winner|match winner|1x2|resultado final)$/.test(g))) return null;
  const full = Number.isInteger(home) && Number.isInteger(away) ? [home, away] : null;
  const withOt = /(prolongamento|overtime|incl|extra|\bot\b|penaltis|penalties)/.test(g);
  const hasReg = Number.isInteger(regHome) && Number.isInteger(regAway);
  // "Regulation time" markets need the regulation score (only kept where the sport has overtime).
  if (/(tempo regulamentar|regular time|regulation|tempo normal|normal time)/.test(g) && !hasReg && !n0(g)) return null;
  const ft = !withOt && hasReg ? [regHome, regAway] : full;
  const winnerOnly = (out) => (retired ? null : out);

  // Half time / full time: "1/1", "X/2"…
  if (/(intervalo|half.?time|1st half|1.? ?o? ?tempo|primeiro tempo|\bht\b)\s*[-/]\s*(final|fim do jogo|full.?time|\bft\b|resultado final)/.test(g)) {
    const m = /^([12x]|casa|fora|empate|home|away|draw)\s*\/\s*([12x]|casa|fora|empate|home|away|draw)$/.exec(l);
    const p1 = Array.isArray(periods) ? periods[0] : null;
    if (!m || !okScore(p1) || !ft) return null;
    return wonIf(sideOf(m[1], homeName, awayName) === resultCode(p1[0], p1[1]) && sideOf(m[2], homeName, awayName) === resultCode(ft[0], ft[1]));
  }
  // A goal in both halves.
  if (/(golo em ambas as partes|golo nas duas partes|goal in both halves|golos em ambas)/.test(g)) {
    const [p1, p2] = Array.isArray(periods) ? periods : [];
    if (!okScore(p1) || !okScore(p2) || yesNo(l) === null) return null;
    return winnerOnly(wonIf(yesNo(l) === (p1[0] + p1[1] > 0 && p2[0] + p2[1] > 0)));
  }

  const n = n0(g);
  // Where the score counts sets (tennis, volleyball…) or maps, a full-time total, handicap or odd /
  // even is read only when it is about them ("Total de sets"), never about games or points.
  if (SET_SCORE.has(sport) && !n && /(total|mais|menos|over|under|handicap|impar|\bpar\b|odd|even|exat|exact)/.test(g)
    && !/(resultado exato|resultado correto|correct score|exact score)/.test(g) && (sport === 'dardos' || !/\b(sets?|mapas?|maps?)\b/.test(g))) return null;
  const score = n ? (Array.isArray(periods) ? periods[Number(n) - 1] : null) : ft;
  if (!okScore(score)) return null;
  const [h, a] = score;
  const res = resultCode(h, a);
  const side = sideOf(l, homeName, awayName);

  // "Ambas Marcam & Total de Golos - Mais / Menos (2.5)": "Sim/Mais de (2.5)".
  if (/&/.test(g) && /(ambas|both)/.test(g)) {
    const m = /^(sim|nao)\s*\/\s*(.+)$/.exec(l);
    const ou = m ? ouOf(m[2]) : null;
    if (!ou) return null;
    const total = overUnder(`${ou[0]}${ou[1]}`, h + a);
    return total === 'void' ? null : winnerOnly(wonIf((m[1] === 'sim') === (h > 0 && a > 0) && total === 'won'));
  }
  // "1x2 & Total": "1&Mais de (1.5)".
  if (/&/.test(g) || /&/.test(l)) {
    const m = /^([12x]|casa|fora|empate)\s*&\s*(.+)$/.exec(l);
    if (!m || !/(1x2|resultado|vencedor|winner)/.test(g) || !/(total|mais|menos|over|under)/.test(g)) return null;
    const ou = ouOf(m[2]);
    if (!ou) return null;
    const total = overUnder(`${ou[0]}${ou[1]}`, h + a);
    if (total === 'void') return null;
    return winnerOnly(wonIf(sideOf(m[1], homeName, awayName) === res && total === 'won'));
  }
  if (/(dupla hipotese|double chance)/.test(g)) {
    const m = /^([12x])\s*(?:ou|or|\/|-)?\s*([12x])$/.exec(l);
    if (!m || m[1] === m[2]) return null;
    return winnerOnly(wonIf([m[1].toUpperCase(), m[2].toUpperCase()].includes(res)));
  }
  if (/(empate anula|draw no bet|\bdnb\b)/.test(g)) {
    if (side !== '1' && side !== '2') return null;
    return winnerOnly(res === 'X' ? 'void' : wonIf(side === res));
  }
  if (/(ambas|both teams|btts)/.test(g)) {
    if (yesNo(l) === null || /(total|vencedor|resultado|winner|1x2)/.test(g)) return null;
    return winnerOnly(wonIf(yesNo(l) === (h > 0 && a > 0)));
  }
  if (/(resultado exato|resultado correto|correct score|exact score|placar exato)/.test(g)) {
    const m = /^(\d{1,2})\s*[:-]\s*(\d{1,2})$/.exec(l);
    return m ? winnerOnly(wonIf(Number(m[1]) === h && Number(m[2]) === a)) : null;
  }
  if (/(golos exatos|exact goals|numero exato|total exato|exact total|golos - exato)/.test(g)) {
    const m = /^(\d{1,2})(\+)?$/.exec(l);
    if (!m) return null;
    // "Equipa Casa - Total de Golos - Exato": that team's goals.
    const v = /(casa|home|equipa 1)/.test(g) ? h : /(fora|away|equipa 2)/.test(g) ? a : h + a;
    return winnerOnly(wonIf(m[2] ? v >= Number(m[1]) : v === Number(m[1])));
  }
  if (/(impar|\bpar\b|odd|even)/.test(g) && /^(impar|par|odd|even)$/.test(l)) {
    return winnerOnly(wonIf(/^(impar|odd)$/.test(l) === ((h + a) % 2 === 1)));
  }
  if (/handicap/.test(g)) {
    // European: "1 (0:1)" / "X (1:0)" — the start added to the score, then a three-way result.
    const eu = /^([12x]|casa|fora|empate|home|away|draw|.+?)\s*\(\s*(\d+)\s*[:-]\s*(\d+)\s*\)$/.exec(l);
    if (eu) {
      const sd = sideOf(eu[1], homeName, awayName);
      return sd ? winnerOnly(wonIf(sd === resultCode(h + Number(eu[2]), a + Number(eu[3])))) : null;
    }
    // Asian / two-way: "1 (-1.5)", "2 (-1.5)": the book gives the home side's line for both.
    const as = /^(.+?)\s*\(?\s*([-+]?\d+(?:[.,]\d+)?)\s*\)?$/.exec(l);
    const sd = as ? sideOf(as[1], homeName, awayName) : null;
    const line = as ? halfLine(as[2]) : null;
    if ((sd !== '1' && sd !== '2') || line === null || /europe|3.?way/.test(g)) return null;
    return winnerOnly(handicap(hcpCode(sd, sd === '1' ? line : -line), h, a));
  }
  if (/(vencedor|resultado|1x2|winner|ganha|moneyline|\bml\b)/.test(g) && !/(total|mais|menos|over|under)/.test(g)) {
    if (!side) return null;
    if (res === 'X' && side !== 'X') {
      // A two-way winner after a draw: void when the market says so; after a regulation draw (the
      // match went on to overtime) it is not known whether the market counted overtime: the operator.
      if (/(2.?way|dois resultados|two way|empate anula)/.test(g)) return 'void';
      // After overtime (or penalties) a draw means the final score lacks the decider: the operator.
      if (!n && (withOt || hasReg)) return null;
    }
    return wonIf(side === res);
  }
  if (/(total|totais|mais|menos|over|under|golos|goals|pontos|points)/.test(g)) {
    const ou = ouOf(l);
    if (!ou) return null;
    // One team's total: "Total 1", "Casa - Total", "<team> total"…
    const one = /(total 1\b|equipa 1|team 1|\bcasa\b|\bhome\b)/.test(g) || (homeName && g.includes(plain(homeName)));
    const two = /(total 2\b|equipa 2|team 2|\bfora\b|\baway\b|visitante)/.test(g) || (awayName && g.includes(plain(awayName)));
    if (one && two) return null;
    const t = one ? h : two ? a : h + a;
    return winnerOnly(overUnder(`${ou[0]}${ou[1]}`, t));
  }
  return null;
}

// ---------- Football statistics markets, read from the match tracker's counts ----------
// "Cantos · Total", "Cartões Amarelos · Total 1", "Remates à Baliza · Total 2"… with "Mais de (9.5)" /
// "Menos de (9.5)", half lines only. `stats` = { corners: [h, a], yellow: [h, a], sot: [h, a], final }:
// an "over" already passed is won (and an "under" lost) whenever it was read; the rest only from the
// final counts (the tracker said the match is over). Anything else: null (it waits, as before).
// The book names them in Portuguese or English ("Corners · Total", "Yellow Cards · Total 1"…).
const STAT_GROUP = [[/^(?:cantos|corners) · total( [12])?$/, 'corners'], [/^(?:cartoes amarelos|yellow cards) · total( [12])?$/, 'yellow'],
  [/^(?:remates a baliza|shots on target) · total( [12])?$/, 'sot']];
export function statOutcome(code, stats) {
  const sp = splitSpecial(code);
  if (!sp || !stats) return null;
  const g = plain(sp.group);
  const hit = STAT_GROUP.map(([re, key]) => [re.exec(g), key]).find(([m]) => m);
  if (!hit) return null;
  const [m, key] = hit;
  const pair = stats[key];
  if (!Array.isArray(pair) || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) return null;
  const side = m[1] ? Number(m[1].trim()) : 0;
  const v = side ? pair[side - 1] : pair[0] + pair[1];
  const ou = /^(mais|menos) de\s*\(?\s*(\d+\.5)\s*\)?$/.exec(plain(sp.label));
  if (!ou) return null;
  const line = Number(ou[2]);
  const over = ou[1] === 'mais';
  if (v > line) return over ? 'won' : 'lost';
  if (!stats.final) return null;
  return over ? 'lost' : 'won';
}

// ---------- Tennis: the provider's set and games markets, read from the sets ----------
// WinHouse ids → how each is read. Set markets need the final score in sets (always there); a set's
// winner needs that set over; games markets need every set over and adding up to the final score.
// Anything that cannot be read that way (missing or partial sets, a retirement, a label not
// understood) returns null and waits for the operator: nothing is paid or lost on guesswork.
export const TENNIS_AUTO = {
  1079: 'set-betting', 2721: 'sets-ou', 1874: 'sets-hcp', 1081: 'set1', 1082: 'set2',
  1080: 'games-ou', 1279: 'games-oe', 1881: 'games-hcp', 1872: 'p1-games-ou', 1878: 'p2-games-ou',
};

/** A set that is over: 6 games with a lead of 2 (6-0 … 6-4), or 7-5 / 7-6, either way. */
export const setOver = (s) => {
  if (!Array.isArray(s) || !Number.isInteger(s[0]) || !Number.isInteger(s[1])) return false;
  const hi = Math.max(s[0], s[1]);
  const lo = Math.min(s[0], s[1]);
  return (hi === 6 && hi - lo >= 2) || (hi === 7 && (lo === 5 || lo === 6));
};

/** Every set, when all are over and their winners add up to the final score in sets; else null. */
export function completeSets(sets, home, away) {
  if (!Array.isArray(sets) || !sets.length || !Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (!sets.every(setOver)) return null;
  const first = sets.filter(([h, a]) => h > a).length;
  return first === home && sets.length - first === away ? sets : null;
}

/**
 * One of the TENNIS_AUTO markets of a finished tennis match: 'won' | 'lost' | 'void', or null when
 * it cannot be read safely (the leg waits for the operator). `sets`: games per set ([[6, 4], …]).
 */
export function tennisOutcome(code, { sets = null, home = null, away = null, retired = false } = {}) {
  const sp = splitSpecial(code);
  const kind = sp && TENNIS_AUTO[sp.id];
  if (!kind) return null;
  const l = plain(sp.label);
  // The line at the end ("Mais de 21.5", "1 (-1.5)"); only whole and half lines (quarters split stakes).
  const lineOf = () => {
    const m = /([-+]?\d+(?:[.,]\d+)?)\s*\)?\s*$/.exec(l);
    const v = m ? Number(m[1].replace(',', '.')) : NaN;
    return Number.isFinite(v) && Number.isInteger(v * 2) ? v : null;
  };
  const ou = () => (/^(mais|over|acima)\b/.test(l) ? 'O' : /^(menos|under|abaixo)\b/.test(l) ? 'U' : null);
  const side = () => (/^1\b/.test(l) ? '1' : /^2\b/.test(l) ? '2' : null);
  const total = (t) => { const o = ou(); const v = lineOf(); return o && v !== null && v >= 0 ? overUnder(`${o}${v}`, t) : null; };
  // The book gives the home side's line for both selections ("2 (-1.5)" is the away side +1.5).
  const hcp = (h, a) => { const sd = side(); const v = lineOf(); return sd && v !== null && /\(/.test(l) ? handicap(hcpCode(sd, sd === '1' ? v : -v), h, a) : null; };
  if (retired || !Number.isInteger(home) || !Number.isInteger(away)) {
    // After a retirement only a set that was over stands.
    if (!(kind === 'set1' || kind === 'set2')) return null;
  }
  if (kind === 'set1' || kind === 'set2') {
    const s = Array.isArray(sets) ? sets[kind === 'set1' ? 0 : 1] : null;
    const sd = side();
    if (!setOver(s) || !sd) return null;
    return sd === resultCode(s[0], s[1]) ? 'won' : 'lost';
  }
  if (kind === 'set-betting') {
    const m = /^(\d)\s*[:-]\s*(\d)$/.exec(l);
    return m ? (Number(m[1]) === home && Number(m[2]) === away ? 'won' : 'lost') : null;
  }
  if (kind === 'sets-ou') return total(home + away);
  if (kind === 'sets-hcp') return hcp(home, away);
  const all = completeSets(sets, home, away);
  if (!all) return null;
  const g1 = all.reduce((n, s) => n + s[0], 0);
  const g2 = all.reduce((n, s) => n + s[1], 0);
  if (kind === 'games-ou') return total(g1 + g2);
  if (kind === 'games-oe') {
    const odd = /^(impar|odd)$/.test(l) ? true : /^(par|even)$/.test(l) ? false : null;
    return odd === null ? null : odd === ((g1 + g2) % 2 === 1) ? 'won' : 'lost';
  }
  if (kind === 'games-hcp') return hcp(g1, g2);
  if (kind === 'p1-games-ou') return total(g1);
  if (kind === 'p2-games-ou') return total(g2);
  return null;
}

// ---------- WinHouse's numbered markets (7-digit ids), read by their number ----------
// The id says what is counted and over which part of the match: 10xxxxx the match, 11xxxxx / 73xxxxx
// the 1st half, 12xxxxx / 74xxxxx the 2nd half (goals or points); 13xxxxx corners, 15xxxxx yellow
// cards, 18xxxxx shots on target (the whole match, from the tracker's final counts). The last five
// digits are the market (1 = 1X2, 17 = total, 2854 = asian handicap…). Selections come as the book
// writes them, partly translated ("W1 and TU - Sim (1.5)", "0:1 W1", "Multi goal 1-2"); a line in
// brackets at the end. Handicap lines are the home side's for both selections. Anything not listed
// here, or that cannot be read safely (quarter lines, goal times, next / last goal…), returns null.
const WH_SCORE_SCOPE = { 10: 0, 11: 1, 73: 1, 12: 2, 74: 2 };
const WH_STAT_SCOPE = { 13: 'corners', 15: 'yellow', 18: 'sot' };
// Markets read on the score of each half (needs both halves).
const WH_HALVES = new Set([18, 32, 43, 44, 49, 71, 371, 829, 860, 3007, 3009, 3011, 3239, 2422, 2424, 9404, 9897, 10037, 10038, 10046, 10047, 10048, 10091, 10092, 10096, 10264]);
// Markets that may be read on statistics (corners, cards, shots): the plain score markets.
const WH_STAT_OK = new Set([1, 2, 8, 9, 15, 17, 27, 62, 87, 88, 89, 99, 2854, 8427, 8429]);
// Result + a team's total: which team's total.
const WH_TEAM_TOTAL = { 2987: 1, 2989: 2, 10106: 1, 10107: 1, 10108: 1, 9429: 2, 9430: 1, 9431: 2, 9432: 2, 9433: 1 };

/** "w1" / "1" → '1', "x" → 'X', "w2" / "2" → '2'. */
const whSide = (v) => ({ 1: '1', w1: '1', x: 'X', 2: '2', w2: '2' })[v] ?? null;
/** "1x" / "12" / "2x" / "x2" → the results it covers. */
const whDouble = (v) => ({ '1x': ['1', 'X'], x1: ['1', 'X'], 12: ['1', '2'], 21: ['1', '2'], '2x': ['X', '2'], x2: ['X', '2'] })[v] ?? null;
/** "1-2" / "2-3" → [1, 2]. */
const whRange = (v) => { const m = /^(\d+)\s*-\s*(\d+)$/.exec(v); return m ? [Number(m[1]), Number(m[2])] : null; };
/** A result side or double chance ("w1", "1x", "x") against the score. */
function whResult(v, h, a) {
  const res = resultCode(h, a);
  const s = whSide(v);
  if (s) return s === res;
  const d = whDouble(v);
  return d ? d.includes(res) : null;
}
/** "mais de" / "to" → true, "menos de" / "tu" → false. */
const whOver = (v) => (/^(mais de|mais|to|over)$/.test(v) ? true : /^(menos de|menos|tu|under)$/.test(v) ? false : null);
/** Over / under a half line on a total: true / false; null on a whole line hit exactly or no line. */
const whOu = (over, line, total) => {
  if (over === null || line === null || !Number.isInteger(line * 2)) return null;
  if (total === line) return null;
  return over === total > line;
};

// Every market number read below.
const KNOWN_SUBS = new Set([1, 2, 8, 9, 15, 17, 18, 19, 27, 32, 43, 44, 49, 62, 71, 87, 88, 89, 99, 136, 275, 285, 371, 829, 852, 858, 860,
  2422, 2424, 2440, 2444, 2663, 2665, 2667, 2854, 2866, 2867, 2876, 2878, 2987, 2989, 3005, 3007, 3009, 3011, 3239, 3309, 3311,
  7961, 8427, 8429, 8801, 8803, 8863, 8931, 9322, 9404, 9429, 9430, 9431, 9432, 9433, 9897, 9898, 9913, 9914, 9915, 9939,
  10037, 10038, 10039, 10040, 10046, 10047, 10048, 10091, 10092, 10096, 10106, 10107, 10108, 10161, 10264]);

/**
 * A WinHouse market with a 7-digit id: 'won' | 'lost' | 'void', or null (the operator decides);
 * undefined when the number is not one read here (its name is tried instead).
 * `periods`: the halves' scores; `ft`: the full-time score; `stats`: the tracker's counts.
 */
export function whOutcome(code, { periods = null, ft = null, stats = null } = {}) {
  const sp = splitSpecial(code);
  if (!sp || sp.id < 1_000_000 || sp.id > 9_999_999) return null;
  const prefix = Math.floor(sp.id / 100_000);
  const sub = sp.id % 100_000;
  let pair = null;
  if (prefix in WH_SCORE_SCOPE) {
    const n = WH_SCORE_SCOPE[prefix];
    pair = n === 0 ? ft : Array.isArray(periods) ? periods[n - 1] : null;
  } else if (prefix in WH_STAT_SCOPE) {
    // The whole match's counts, once final; the halves are not counted apart.
    if (!WH_STAT_OK.has(sub)) return undefined;
    if (!stats?.final) return null;
    pair = stats[WH_STAT_SCOPE[prefix]];
  } else return undefined;
  if (!KNOWN_SUBS.has(sub)) return undefined;
  if (!okScore(pair)) return null;
  const [p1, p2] = Array.isArray(periods) ? periods : [];
  if (WH_HALVES.has(sub) && (!(prefix in WH_SCORE_SCOPE) || !okScore(p1) || !okScore(p2))) return null;
  const [h, a] = pair;
  const t = h + a;

  // The selection: "<body> - Sim (1.5)" → body, yes, line.
  let l = plain(sp.label);
  let line = null;
  const lm = /\s*\(\s*([-+]?\d+(?:[.,]\d+)?)\s*\)$/.exec(l);
  if (lm) { line = Number(lm[1].replace(',', '.')); l = l.slice(0, lm.index).trim(); }
  let yes = null;
  const ym = /^(.*?)\s*-?\s*\b(sim|nao)$/.exec(l);
  if (ym) { yes = ym[2] === 'sim'; l = ym[1].trim(); }
  const answer = (c) => (c === null || c === undefined ? null : (yes === null ? c : c === yes) ? 'won' : 'lost');
  const half = Number.isInteger(line * 2) ? line : null;
  const hcpSide = (h1, a1) => { // "1" / "2" with the home side's line
    const s = whSide(l);
    if ((s !== '1' && s !== '2') || half === null) return null;
    return handicap(hcpCode(s, s === '1' ? half : -half), h1, a1);
  };
  const team = (n) => (n === 1 ? h : a);
  const halves = (fn) => fn(p1, p2);

  switch (sub) {
    case 1: return answer(whSide(l) ? whSide(l) === resultCode(h, a) : null); // 1X2
    case 2: case 2854: return hcpSide(h, a); // handicap / asian handicap
    case 8: return answer(whDouble(l) ? whDouble(l).includes(resultCode(h, a)) : null);
    case 9: return answer(yes === null ? null : h === a); // draw
    case 15: case 17: case 62: case 99: case 8427: case 8429: { // totals, asian totals (whole and half lines)
      const v = sub === 15 || sub === 8427 ? h : sub === 62 || sub === 8429 ? a : t;
      const over = whOver(l);
      if (over === null || half === null) return null;
      return overUnder(`${over ? 'O' : 'U'}${half}`, v);
    }
    case 19: return answer(yes === null ? null : h > 0 && a > 0); // both teams score
    case 27: { // european handicap "0:1 W1"
      const m = /^(\d+)\s*:\s*(\d+)\s+(w1|w2|x)$/.exec(l);
      return m ? answer(whSide(m[3]) === resultCode(h + Number(m[1]), a + Number(m[2]))) : null;
    }
    case 87: case 88: case 89: { // 3-way totals: over / exactly / under a whole line
      const v = sub === 88 ? h : sub === 89 ? a : t;
      if (!Number.isInteger(line)) return null;
      if (/^(mais de|mais)$/.test(l)) return answer(v > line);
      if (/^(exatamente|exactly)$/.test(l)) return answer(v === line);
      if (/^(menos de|menos)$/.test(l)) return answer(v < line);
      return null;
    }
    case 136: case 8863: { // correct score "1-0", "Correct Score 1-0 (17Way)"
      const m = /(\d+)\s*[-:]\s*(\d+)/.exec(l.replace(/\(17way\)/, ''));
      return m && !/(other|outro)/.test(l) ? answer(Number(m[1]) === h && Number(m[2]) === a) : null;
    }
    case 852: return answer(yes === null ? null : (h > a && a === 0) || (a > h && h === 0)); // win to nil
    case 2866: case 2867: return answer(yes === null ? null : sub === 2866 ? h > a && a === 0 : a > h && h === 0);
    case 7961: case 8801: case 8803: { // multi goal "Multi goal 1-2" (match / team 1 / team 2)
      const r = whRange(l.replace(/^multi goal\s*/, ''));
      const v = sub === 8801 ? h : sub === 8803 ? a : t;
      return r ? answer(v >= r[0] && v <= r[1]) : null;
    }
    case 9939: { // exact number: "2 - Sim", "1 or Less - Sim", "5 or More - Não", "From 1 To 2 - Sim"
      let m;
      if ((m = /^(\d+)$/.exec(l))) return answer(t === Number(m[1]));
      if ((m = /^(\d+) or less$/.exec(l))) return answer(t <= Number(m[1]));
      if ((m = /^(\d+) or more$/.exec(l))) return answer(t >= Number(m[1]));
      if ((m = /^from (\d+) to (\d+)$/.exec(l))) return answer(t >= Number(m[1]) && t <= Number(m[2]));
      return null;
    }
    case 3309: case 3311: { // a team's exact goals: "0", "1", "2", "Team 1 Total - or More Goals (3)"
      const v = sub === 3309 ? h : a;
      if (/^\d+$/.test(l) && line === null) return answer(v === Number(l));
      if (/or more goals$/.test(l) && Number.isInteger(line)) return answer(v >= line);
      return null;
    }
    case 2663: case 2665: case 2667: { // result + match total: "W1 and TU - Sim (1.5)", "X and TO"
      const m = /^(w1|w2|1x|2x|x2|x|12) and (to|tu)$/.exec(l);
      if (!m) return null;
      const ou = whOu(whOver(m[2]), half, t);
      const r = whResult(m[1], h, a);
      return ou === null || r === null ? null : answer(r && ou);
    }
    case 2987: case 2989: case 10106: case 10107: case 10108: case 9429: case 9430: case 9431: case 9432: case 9433: {
      // result + a team's total: "W1 and Total 1 Mais de - Sim (1.5)", "1X and Mais de - Sim (0.5)"
      const m = /^(w1|w2|1x|2x|x2|x|12) and (?:total [12] )?(mais de|menos de)$/.exec(l);
      if (!m) return null;
      const ou = whOu(whOver(m[2]), half, team(WH_TEAM_TOTAL[sub]));
      const r = whResult(m[1], h, a);
      return ou === null || r === null ? null : answer(r && ou);
    }
    case 2444: { // total and both teams score: "both To Score + TO - Sim (2.5)"
      const m = /^both to score \+ (to|tu)$/.exec(l);
      const ou = m ? whOu(whOver(m[1]), half, t) : null;
      return ou === null ? null : answer(h > 0 && a > 0 && ou);
    }
    case 9322: { // "away team Least One Team Not To Score and 1X" (at least one team not to score)
      const m = /least one team not to score and (1x|2x|x2|12)$/.exec(l);
      return m ? answer(!(h > 0 && a > 0) && whResult(m[1], h, a)) : null;
    }
    case 858: { // "… Least One Team Will Not Score + TU - Sim (2.5)"
      const m = /least one team will not score \+ (to|tu)$/.exec(l);
      const ou = m ? whOu(whOver(m[1]), half, t) : null;
      return ou === null ? null : answer(!(h > 0 && a > 0) && ou);
    }
    case 2440: { // "Only Team 1", "Only Team 2", "no Goals"
      if (/^only team 1$/.test(l)) return answer(h > 0 && a === 0);
      if (/^only team 2$/.test(l)) return answer(a > 0 && h === 0);
      if (/^nao goals$/.test(l)) return answer(t === 0);
      return null;
    }
    case 8931: { // at least one team over the line
      const o = whOver(l);
      return o === true && half !== null && !Number.isInteger(half) ? answer(Math.max(h, a) > half) : null;
    }
    case 285: { // each team over / under the line
      const o = whOver(l);
      if (o === null || half === null || Number.isInteger(half)) return null;
      return answer(o ? h > half && a > half : h < half && a < half);
    }
    case 275: { // any team to win by: "By Goal(s) - Sim (1)", "By or More Goals - Sim (2)", "1-2 Goal(s) - Sim"
      const d = Math.abs(h - a);
      if (/^by goal\(?s\)?$/.test(l) && Number.isInteger(line)) return answer(d === line);
      if (/^by or more goals$/.test(l) && Number.isInteger(line)) return answer(d >= line);
      const r = whRange(l.replace(/\s*goal\(?s\)?$/, ''));
      return r ? answer(d >= r[0] && d <= r[1]) : null;
    }
    case 10039: case 10040: return answer(yes === null ? null : (sub === 10039 ? h - a : a - h) === 1 || h === a);
    case 10161: return answer(yes === null ? null : h === a && h > 0); // score draw
    case 9898: { // "W1 or 0-0 - Sim"
      const m = /^(w1|w2|x) or (\d+)\s*-\s*(\d+)$/.exec(l);
      return m ? answer(whSide(m[1]) === resultCode(h, a) || (Number(m[2]) === h && Number(m[3]) === a)) : null;
    }
    case 9913: { // result or total: "W1 or Mais de (1.5)"
      const m = /^(w1|w2|x) or (mais de|menos de)$/.exec(l);
      const ou = m ? whOu(whOver(m[2]), half, t) : null;
      return ou === null ? null : answer(whSide(m[1]) === resultCode(h, a) || ou);
    }
    case 9914: { // result or both teams score: "W1 or both To Score", "X or both Not To Score"
      const m = /^(w1|w2|x) or both (not )?to score$/.exec(l);
      return m ? answer(whSide(m[1]) === resultCode(h, a) || (h > 0 && a > 0) === !m[2]) : null;
    }
    case 9915: { // both teams score or total: "both To Score or Mais de (0.5)"
      const m = /^both (not )?to score or (mais de|menos de)$/.exec(l);
      const ou = m ? whOu(whOver(m[2]), half, t) : null;
      return ou === null ? null : answer((h > 0 && a > 0) === !m[1] || ou);
    }
    case 3005: { // "W1 and Number Of Goals 2-3 - Sim"
      const m = /^(w1|w2|x) and number of goals (\d+)\s*-\s*(\d+)$/.exec(l);
      return m ? answer(whSide(m[1]) === resultCode(h, a) && t >= Number(m[2]) && t <= Number(m[3])) : null;
    }
    case 2876: case 2878: { // a team scores N goals: "0 - 1 Goals - Sim"
      const r = whRange(l.replace(/\s*goals?$/, ''));
      const v = sub === 2876 ? h : a;
      return r ? answer(v >= r[0] && v <= r[1]) : null;
    }
    // ----- read on both halves -----
    case 18: { // which half has more goals: "1 > 2", "1 = 2", "1 < 2"
      const m = /^1\s*([<=>])\s*2$/.exec(l);
      if (!m) return null;
      const x = p1[0] + p1[1]; const y = p2[0] + p2[1];
      return answer(m[1] === '>' ? x > y : m[1] === '<' ? x < y : x === y);
    }
    case 32: return answer(yes === null ? null : halves((x, y) => x[0] + x[1] > 0 && y[0] + y[1] > 0));
    case 860: return answer(yes === null ? null : halves((x, y) => x[0] > 0 && x[1] > 0 && y[0] > 0 && y[1] > 0));
    case 9897: return answer(yes === null ? null : halves((x, y) => (x[0] > 0 && x[1] > 0) || (y[0] > 0 && y[1] > 0)));
    case 10037: case 10038: { const i = sub === 10037 ? 0 : 1; return answer(yes === null ? null : p1[i] > 0 && p2[i] > 0); }
    case 9404: {
      const m = /^team ([12])$/.exec(l);
      if (!m) return null;
      const i = Number(m[1]) - 1;
      return answer(p1[i] > 0 && p2[i] > 0);
    }
    case 10096: return answer(yes === null ? null : !(p1[0] > 0 && p2[0] > 0) && !(p1[1] > 0 && p2[1] > 0));
    case 10046: case 10047: { const s = sub === 10046 ? '1' : '2'; return answer(yes === null ? null : resultCode(...p1) === s && resultCode(...p2) === s); }
    case 43: case 44: { const s = sub === 43 ? '1' : '2'; return answer(yes === null ? null : resultCode(...p1) === s || resultCode(...p2) === s); }
    case 10048: return answer(yes === null ? null : p1[0] === p1[1] && p2[0] === p2[1]);
    case 49: return answer(yes === null ? null : p1[0] === p1[1] || p2[0] === p2[1]);
    case 3239: { const r1 = resultCode(...p1); const r2 = resultCode(...p2); return answer(yes === null ? null : r1 !== 'X' && r2 !== 'X' && r1 !== r2); }
    case 10091: case 10092: { const s = sub === 10091 ? '1' : '2'; return answer(yes === null ? null : resultCode(...p1) === s && resultCode(h, a) !== s); }
    case 2422: case 2424: { // a team's goals: "first half > second half"
      const i = sub === 2422 ? 0 : 1;
      const m = /^first half ([<=>]) second half$/.exec(l);
      if (!m) return null;
      return answer(m[1] === '>' ? p1[i] > p2[i] : m[1] === '<' ? p1[i] < p2[i] : p1[i] === p2[i]);
    }
    case 71: { // half / half: "W1/W2"
      const m = /^(w1|w2|x)\s*\/\s*(w1|w2|x)$/.exec(l);
      return m ? answer(whSide(m[1]) === resultCode(...p1) && whSide(m[2]) === resultCode(...p2)) : null;
    }
    case 829: { // HT-FT + total: "W1/W1 and TO - Sim (2.5)"
      const m = /^(w1|w2|x)\s*\/\s*(w1|w2|x) and (to|tu)$/.exec(l);
      const ou = m ? whOu(whOver(m[3]), half, t) : null;
      return ou === null ? null : answer(whSide(m[1]) === resultCode(...p1) && whSide(m[2]) === resultCode(h, a) && ou);
    }
    case 3007: { // the 1st half's or the match's result: "W1 - Sim"
      const s = whSide(l);
      return s ? answer(resultCode(...p1) === s || resultCode(h, a) === s) : null;
    }
    case 3009: { // match result + 1st half total: "W1 and Mais de - Sim (1.5)"
      const m = /^(w1|w2|x) and (mais de|menos de)$/.exec(l);
      const ou = m ? whOu(whOver(m[2]), half, p1[0] + p1[1]) : null;
      return ou === null ? null : answer(whSide(m[1]) === resultCode(h, a) && ou);
    }
    case 3011: { // "first half Mais de 0.5 and second half Mais de 1.5 - Sim"
      const m = /^first half (mais de|menos de) (\d+\.5) and second half (mais de|menos de) (\d+\.5)$/.exec(l);
      if (!m) return null;
      return answer(whOu(whOver(m[1]), Number(m[2]), p1[0] + p1[1]) && whOu(whOver(m[3]), Number(m[4]), p2[0] + p2[1]));
    }
    case 371: case 10264: { // the highest / lowest scoring half's total
      const v = (sub === 371 ? Math.max : Math.min)(p1[0] + p1[1], p2[0] + p2[1]);
      const o = whOver(l);
      return o === null || half === null ? null : overUnder(`${o ? 'O' : 'U'}${half}`, v);
    }
    default: return undefined;
  }
}
