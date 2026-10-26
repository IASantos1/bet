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
  periods = null, home = null, away = null, regHome = null, regAway = null, homeName = '', awayName = '', retired = false, sport = null,
} = {}) {
  const sp = splitSpecial(code);
  if (!sp) return null;
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
  if (/(intervalo|half.?time|1st half|1.o tempo|primeiro tempo|\bht\b).{0,6}(final|full.?time|\bft\b|resultado final)|\bht\s*\/\s*ft\b/.test(g)) {
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
  if (/(golos exatos|exact goals|numero exato|total exato|exact total)/.test(g)) {
    const m = /^(\d{1,2})(\+)?$/.exec(l);
    if (!m) return null;
    return winnerOnly(wonIf(m[2] ? h + a >= Number(m[1]) : h + a === Number(m[1])));
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
    // Asian / two-way: "1 (-1.5)", "Casa (+1)", "<team> -0.5".
    const as = /^(.+?)\s*\(?\s*([-+]?\d+(?:[.,]\d+)?)\s*\)?$/.exec(l);
    const sd = as ? sideOf(as[1], homeName, awayName) : null;
    const line = as ? halfLine(as[2]) : null;
    if ((sd !== '1' && sd !== '2') || line === null || /europe|3.?way/.test(g)) return null;
    return winnerOnly(handicap(hcpCode(sd, line), h, a));
  }
  if (/(vencedor|resultado|1x2|winner|ganha|moneyline|\bml\b)/.test(g) && !/(total|mais|menos|over|under)/.test(g)) {
    if (!side) return null;
    if (res === 'X' && side !== 'X') {
      // A two-way winner after a draw: void when the market says so; after a regulation draw (the
      // match went on to overtime) it is not known whether the market counted overtime: the operator.
      if (/(2.?way|dois resultados|two way|empate anula)/.test(g)) return 'void';
      if (!n && hasReg && !withOt) return null;
    }
    return wonIf(side === res);
  }
  if (/(total|mais|menos|over|under|golos|goals|pontos|points)/.test(g)) {
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
  const hcp = (h, a) => { const sd = side(); const v = lineOf(); return sd && v !== null && /\(/.test(l) ? handicap(hcpCode(sd, v), h, a) : null; };
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
