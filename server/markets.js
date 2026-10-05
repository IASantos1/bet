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

export const MARKET_ORDER = ['ml', '1x2', 'dc', 'dnb', 'ou', 'btts', 'hcp', 'gou', 'ghcp', 'goe', 'oe', 'cs', 'pw', 'pou', 'phcp', 'poe', 'pbtts'];
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
  if (market === 'cs') { const [h, a] = code.split(':').map(Number); return (h + a) * 100 + h; }
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
