// Betting markets: what can be offered on a match and how each selection is settled from the
// full-time score. Every market here is settled on the regulation-time result.
//
//   market  code            meaning
//   1x2     1 / X / 2       home win / draw / away win
//   dc      1X / 12 / X2    double chance
//   dnb     1 / 2           draw no bet (a draw voids the stake)
//   ou      O2.5 / U2.5 …   total goals over / under a line (0.5 … 4.5)
//   btts    Y / N           both teams to score
//   ml      1 / 2           match winner including overtime / extra sets (a tie voids the stake)
//   hcp     1-1.5 / 2+1.5 … handicap on the main score (sets in tennis); the line is that side's
//   gou     O20.5 / U20.5 … total games (tennis)
//   ghcp    1+3.5 / 2-3.5 … games handicap (tennis)
//   goe     ODD / EVEN      total games odd / even (tennis)
//
// Games markets settle on the games of every set (events.home_games / away_games); without them,
// or after a retirement, every market but the winner is void.
//
// Other sports: `1x2` is settled on the regulation score when the event has one (ice hockey), `ml`
// always on the final score.

export const OU_LINES = ['0.5', '1.5', '2.5', '3.5', '4.5'];

const LINE = /^[OU]\d{1,3}\.5$/;
const HCP = /^[12][+-]\d{1,3}(\.5)?$/;

export const MARKETS = {
  '1x2': { name: 'Resultado final', codes: ['1', 'X', '2'] },
  dc: { name: 'Dupla hipótese', codes: ['1X', '12', 'X2'] },
  dnb: { name: 'Empate anula aposta', codes: ['1', '2'] },
  ou: { name: 'Total de golos', codes: OU_LINES.flatMap((l) => [`O${l}`, `U${l}`]) },
  btts: { name: 'Ambas as equipas marcam', codes: ['Y', 'N'] },
  ml: { name: 'Vencedor', codes: ['1', '2'] },
  hcp: { name: 'Handicap', valid: HCP },
  gou: { name: 'Total de jogos', valid: LINE },
  ghcp: { name: 'Handicap de jogos', valid: HCP },
  goe: { name: 'Total de jogos par / ímpar', codes: ['ODD', 'EVEN'] },
};

export const MARKET_ORDER = ['ml', '1x2', 'dc', 'dnb', 'ou', 'btts', 'hcp', 'gou', 'ghcp', 'goe'];
/** Markets settled on games rather than on the main score. */
export const GAMES_MARKETS = new Set(['gou', 'ghcp', 'goe']);

export const isValidSelection = (market, code) => {
  const m = MARKETS[market];
  return !!m && (m.codes ? m.codes.includes(code) : m.valid.test(code));
};

/** Display order of a selection within its market: fixed codes, else by line (over before under, 1 before 2). */
export function codeRank(market, code) {
  const m = MARKETS[market];
  if (m?.codes) return m.codes.indexOf(code);
  const line = Math.abs(Number(code.slice(1))) || 0;
  return line * 10 + (code[0] === 'O' || code[0] === '1' ? 0 : 1);
}

/** Handicap code for a side and line: (1, -1.5) → "1-1.5". */
export const hcpCode = (sideCode, line) => `${sideCode}${line >= 0 ? '+' : ''}${line}`;

const overUnder = (code, total) => {
  const over = total > Number(code.slice(1));
  return (code[0] === 'O') === over ? 'won' : 'lost';
};
const handicap = (code, home, away) => {
  const margin = (code[0] === '1' ? home - away : away - home) + Number(code.slice(1));
  return margin > 0 ? 'won' : margin < 0 ? 'lost' : 'void';
};

export const resultCode = (home, away) => (home > away ? '1' : home < away ? '2' : 'X');

/** Settles one selection against a final score: 'won' | 'lost' | 'void'. */
export function legOutcome(market, code, home, away, { homeGames = null, awayGames = null } = {}) {
  const result = resultCode(home, away);
  if (GAMES_MARKETS.has(market) && (homeGames === null || awayGames === null)) return 'void';
  switch (market) {
    case '1x2': return code === result ? 'won' : 'lost';
    case 'dc': return code.includes(result) ? 'won' : 'lost';
    case 'dnb':
      if (result === 'X') return 'void';
      return code === result ? 'won' : 'lost';
    case 'ou': return overUnder(code, home + away);
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
  switch (market) {
    case '1x2': return code === '1' ? home : code === '2' ? away : 'Empate';
    case 'dc': return { '1X': `${home} ou empate`, 12: `${home} ou ${away}`, X2: `Empate ou ${away}` }[code];
    case 'dnb': case 'ml': return code === '1' ? home : away;
    case 'ou': return `${code[0] === 'O' ? 'Mais' : 'Menos'} de ${code.slice(1)}`;
    case 'btts': return code === 'Y' ? 'Sim' : 'Não';
    case 'hcp': case 'ghcp': return `${code[0] === '1' ? home : away} ${code.slice(1)}`;
    case 'gou': return `${code[0] === 'O' ? 'Mais' : 'Menos'} de ${code.slice(1)}`;
    case 'goe': return code === 'ODD' ? 'Ímpar' : 'Par';
    default: return code;
  }
}
