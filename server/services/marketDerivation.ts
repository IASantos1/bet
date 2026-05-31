// server/services/marketDerivation.ts
// Mathematical market derivation from base API odds using Poisson model.
// Generates 80+ markets per soccer match, 20+ for other sports.

export type Selection = { label: string; odd: number; point?: string };
export type MarketMap = Record<string, Selection[]>;

// ── Poisson helpers ──────────────────────────────────────────────────────────

function poissonPMF(lambda: number, k: number): number {
  if (k < 0 || lambda <= 0 || !Number.isFinite(lambda)) return k === 0 ? 1 : 0;
  const logP = -lambda + k * Math.log(lambda);
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.min(1, Math.max(0, Math.exp(logP - logFact)));
}

function poissonCDF(lambda: number, maxK: number): number {
  let s = 0;
  for (let k = 0; k <= maxK; k++) s += poissonPMF(lambda, k);
  return Math.min(1, s);
}

// Binary search: find λ such that P(X > cutoff) = targetProb
function solveLambda(targetProb: number, cutoff: number, lo = 0.05, hi = 15): number {
  const target = Math.max(0.01, Math.min(0.99, targetProb));
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const p = 1 - poissonCDF(mid, Math.floor(cutoff));
    if (p < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Odds utilities ───────────────────────────────────────────────────────────

function impliedProb(odd: number): number {
  return odd > 1 ? 1 / odd : 0;
}

function trueProbs(odds: number[]): number[] {
  const invSum = odds.reduce((s, o) => s + impliedProb(o), 0);
  if (invSum <= 0) return odds.map(() => 0);
  return odds.map((o) => impliedProb(o) / invSum);
}

// Apply bookmaker margin to a set of true probabilities
function applyVig(probs: number[], overround: number): Selection[] {
  return [];
}

function mkOdd(prob: number, overround: number): number {
  const p = Math.max(0.005, Math.min(0.995, prob)) * overround;
  const odd = 1 / p;
  return Math.round(odd * 100) / 100;
}

// ── H2H extraction ───────────────────────────────────────────────────────────

interface H2HOdds {
  homeOdd: number;
  drawOdd: number | null;
  awayOdd: number;
  pH: number;
  pD: number;
  pA: number;
}

function extractH2H(markets: MarketMap): H2HOdds | null {
  const sels = markets['h2h'] || markets['1st_half'] || [];
  let homeOdd = 0, drawOdd = 0, awayOdd = 0;
  for (const s of sels) {
    const l = String(s.label ?? '').toLowerCase().trim();
    const o = Number(s.odd) || 0;
    if (l === 'home' || l === '1' || l === 'casa') homeOdd = homeOdd || o;
    else if (l === 'draw' || l === 'x' || l === 'empate') drawOdd = drawOdd || o;
    else if (l === 'away' || l === '2' || l === 'fora') awayOdd = awayOdd || o;
  }
  // Fallback: pick by position
  if (!(homeOdd > 1) && sels.length >= 2) {
    const valid = sels.map((s) => Number(s.odd) || 0).filter((o) => o > 1);
    if (valid.length === 2) { homeOdd = valid[0]; awayOdd = valid[1]; }
    if (valid.length >= 3) { homeOdd = valid[0]; drawOdd = valid[1]; awayOdd = valid[2]; }
  }
  if (!(homeOdd > 1) || !(awayOdd > 1)) return null;
  const hasDraw = drawOdd > 1;
  const rawOdds = hasDraw ? [homeOdd, drawOdd, awayOdd] : [homeOdd, awayOdd];
  const [pH, pD, pA] = hasDraw ? trueProbs(rawOdds) : [...trueProbs(rawOdds).slice(0, 1), 0, ...trueProbs(rawOdds).slice(1)];
  return { homeOdd, drawOdd: hasDraw ? drawOdd : null, awayOdd, pH, pD, pA };
}

function extractH2HForHalf(markets: MarketMap): H2HOdds | null {
  const sels = markets['1st_half'] || [];
  if (!sels.length) return null;
  let homeOdd = 0, drawOdd = 0, awayOdd = 0;
  for (const s of sels) {
    const l = String(s.label ?? '').toLowerCase().trim();
    const o = Number(s.odd) || 0;
    if (l === 'home' || l === '1') homeOdd = homeOdd || o;
    else if (l === 'draw' || l === 'x') drawOdd = drawOdd || o;
    else if (l === 'away' || l === '2') awayOdd = awayOdd || o;
  }
  if (!(homeOdd > 1) && sels.length >= 2) {
    const valid = sels.map((s) => Number(s.odd) || 0).filter((o) => o > 1);
    if (valid.length === 2) { homeOdd = valid[0]; awayOdd = valid[1]; }
    if (valid.length >= 3) { homeOdd = valid[0]; drawOdd = valid[1]; awayOdd = valid[2]; }
  }
  if (!(homeOdd > 1) || !(awayOdd > 1)) return null;
  const hasDraw = drawOdd > 1;
  const rawOdds = hasDraw ? [homeOdd, drawOdd, awayOdd] : [homeOdd, awayOdd];
  const [pH, pD, pA] = hasDraw ? trueProbs(rawOdds) : [...trueProbs(rawOdds).slice(0, 1), 0, ...trueProbs(rawOdds).slice(1)];
  return { homeOdd, drawOdd: hasDraw ? drawOdd : null, awayOdd, pH, pD, pA };
}

// ── Totals extraction ────────────────────────────────────────────────────────

interface TotalsLine {
  line: number;
  overOdd: number;
  underOdd: number;
  pOver: number;
  pUnder: number;
}

function extractTotalsLines(markets: MarketMap): TotalsLine[] {
  const sels = markets['totals'] || markets['match_goals'] || [];
  const groups: Record<string, { over: number; under: number }> = {};
  for (const s of sels) {
    const pointRaw = String(s.point ?? '').trim();
    const labelRaw = String(s.label ?? '').toLowerCase();
    const odd = Number(s.odd) || 0;
    if (!odd || !(odd > 1)) continue;
    // Extract point from label if missing
    let point = pointRaw;
    if (!point) {
      const m = labelRaw.match(/(\d+\.?\d*)/);
      if (m) point = m[1];
    }
    if (!point) continue;
    const line = parseFloat(point);
    if (!line) continue;
    const key = String(line);
    groups[key] = groups[key] || { over: 0, under: 0 };
    if (labelRaw.includes('over') || labelRaw.startsWith('o') || labelRaw === 'mais' || labelRaw === 'over') {
      groups[key].over = odd;
    } else if (labelRaw.includes('under') || labelRaw.startsWith('u') || labelRaw === 'menos' || labelRaw === 'under') {
      groups[key].under = odd;
    }
  }
  const result: TotalsLine[] = [];
  for (const [lineStr, g] of Object.entries(groups)) {
    if (g.over > 1 && g.under > 1) {
      const [pOver, pUnder] = trueProbs([g.over, g.under]);
      result.push({ line: parseFloat(lineStr), overOdd: g.over, underOdd: g.under, pOver, pUnder });
    }
  }
  return result.sort((a, b) => a.line - b.line);
}

function getBTTSOdds(markets: MarketMap): { pYes: number; pNo: number } | null {
  const sels = markets['btts'] || [];
  let yesOdd = 0, noOdd = 0;
  for (const s of sels) {
    const l = String(s.label ?? '').toLowerCase();
    const o = Number(s.odd) || 0;
    if (l === 'yes' || l === 'sim' || l === 'ambas' || l.includes('sim')) yesOdd = o;
    else if (l === 'no' || l === 'não' || l === 'nao' || l.includes('nao') || l.includes('não')) noOdd = o;
  }
  if (!(yesOdd > 1) || !(noOdd > 1)) return null;
  const [pYes, pNo] = trueProbs([yesOdd, noOdd]);
  return { pYes, pNo };
}

// ── Poisson soccer model ──────────────────────────────────────────────────────

interface SoccerModel {
  lambdaH: number;
  lambdaA: number;
  matrix: number[][];
}

const MAX_G = 8;

function buildSoccerModel(h2h: H2HOdds, totals: TotalsLine[]): SoccerModel {
  let lambdaTotal = 2.6;
  // Prefer 2.5 line, then closest available
  const line25 = totals.find((t) => t.line === 2.5);
  const bestLine = line25 || totals.reduce<TotalsLine | null>((best, t) => {
    if (!best) return t;
    return Math.abs(t.line - 2.5) < Math.abs(best.line - 2.5) ? t : best;
  }, null);

  if (bestLine) {
    const adjustedProb = bestLine.line === 2.5 ? bestLine.pOver : bestLine.pOver;
    const cutoff = Math.floor(bestLine.line);
    lambdaTotal = solveLambda(adjustedProb, cutoff);
  } else {
    // Estimate from h2h: competitive matches ~2.5, one-sided ~2.3
    const asymmetry = Math.abs(Math.log(Math.max(0.05, h2h.pH) / Math.max(0.05, h2h.pA)));
    lambdaTotal = 2.5 - 0.1 * asymmetry;
  }

  // Split: home advantage — √(pH/pA) ratio
  const pHef = Math.max(0.05, h2h.pH + 0.3 * h2h.pD);
  const pAef = Math.max(0.05, h2h.pA + 0.3 * h2h.pD);
  const ratio = Math.sqrt(pHef / pAef);
  const lambdaH = lambdaTotal * ratio / (1 + ratio);
  const lambdaA = lambdaTotal / (1 + ratio);

  // Build score probability matrix
  const matrix: number[][] = [];
  for (let h = 0; h < MAX_G; h++) {
    matrix[h] = [];
    for (let a = 0; a < MAX_G; a++) {
      matrix[h][a] = poissonPMF(lambdaH, h) * poissonPMF(lambdaA, a);
    }
  }
  return { lambdaH, lambdaA, matrix };
}

function sumMatrix(matrix: number[][], fn: (h: number, a: number) => boolean): number {
  let s = 0;
  for (let h = 0; h < MAX_G; h++)
    for (let a = 0; a < MAX_G; a++)
      if (fn(h, a)) s += matrix[h][a];
  return Math.min(1, Math.max(0, s));
}

// ── Soccer derivations ────────────────────────────────────────────────────────

function deriveSoccer(api: MarketMap, home: string, away: string): MarketMap {
  const h2h = extractH2H(api);
  if (!h2h) return {};

  const totalsLines = extractTotalsLines(api);
  const btts = getBTTSOdds(api);
  const htH2h = extractH2HForHalf(api);
  const model = buildSoccerModel(h2h, totalsLines);
  const { lambdaH, lambdaA, matrix } = model;
  const derived: MarketMap = {};
  const VIG3 = 1.07, VIG2 = 1.05, VIG_CS = 1.13, VIG4 = 1.09, VIG5 = 1.10;

  const mk2 = (p: number, v = VIG2) => mkOdd(p, v);
  const mk3 = (p: number, v = VIG3) => mkOdd(p, v);

  const pH = h2h.pH, pD = h2h.pD, pA = h2h.pA;

  // ── Correct Score ──────────────────────────────────────────────
  const topScores: Array<[number, number]> = [
    [0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2],[3,0],[0,3],
    [2,2],[3,1],[1,3],[3,2],[2,3],[3,3],[4,0],[0,4],[4,1],[1,4],
  ];
  let coverageSum = 0;
  const csSelections: Selection[] = [];
  for (const [h, a] of topScores) {
    const p = h < MAX_G && a < MAX_G ? matrix[h][a] : 0;
    if (p < 0.001) continue;
    coverageSum += p;
    csSelections.push({ label: `${h}-${a}`, odd: mkOdd(p, VIG_CS) });
  }
  const otherP = Math.max(0.01, 1 - coverageSum);
  csSelections.push({ label: 'Outro', odd: mkOdd(otherP, VIG_CS) });
  if (csSelections.length >= 4) derived['correct_score'] = csSelections;

  // ── Winning Margin ─────────────────────────────────────────────
  const wmHome1 = sumMatrix(matrix, (h, a) => h - a === 1);
  const wmHome2 = sumMatrix(matrix, (h, a) => h - a === 2);
  const wmHome3 = sumMatrix(matrix, (h, a) => h - a >= 3);
  const wmDraw = sumMatrix(matrix, (h, a) => h === a);
  const wmAway1 = sumMatrix(matrix, (h, a) => a - h === 1);
  const wmAway2 = sumMatrix(matrix, (h, a) => a - h === 2);
  const wmAway3 = sumMatrix(matrix, (h, a) => a - h >= 3);
  const wmV = VIG4;
  derived['winning_margin'] = [
    { label: `${home} +1`, odd: mk3(wmHome1, wmV) },
    { label: `${home} +2`, odd: mk3(wmHome2, wmV) },
    { label: `${home} +3 ou mais`, odd: mk3(wmHome3, wmV) },
    { label: 'Empate', odd: mk3(wmDraw, wmV) },
    { label: `${away} +1`, odd: mk3(wmAway1, wmV) },
    { label: `${away} +2`, odd: mk3(wmAway2, wmV) },
    { label: `${away} +3 ou mais`, odd: mk3(wmAway3, wmV) },
  ];

  // ── Goals Range ─────────────────────────────────────────────────
  const gr0 = sumMatrix(matrix, (h, a) => h + a === 0);
  const gr1 = sumMatrix(matrix, (h, a) => h + a === 1);
  const gr2 = sumMatrix(matrix, (h, a) => h + a === 2);
  const gr3 = sumMatrix(matrix, (h, a) => h + a === 3);
  const gr4 = sumMatrix(matrix, (h, a) => h + a >= 4);
  derived['goals_range'] = [
    { label: '0 Golos', odd: mk3(gr0, VIG5) },
    { label: '1 Golo', odd: mk3(gr1, VIG5) },
    { label: '2 Golos', odd: mk3(gr2, VIG5) },
    { label: '3 Golos', odd: mk3(gr3, VIG5) },
    { label: '4 ou mais', odd: mk3(gr4, VIG5) },
  ];

  // ── Total Goals Odd/Even ────────────────────────────────────────
  const pOdd = sumMatrix(matrix, (h, a) => (h + a) % 2 === 1);
  const pEven = sumMatrix(matrix, (h, a) => (h + a) % 2 === 0);
  derived['total_goal_odd_even'] = [
    { label: 'Ímpar', odd: mk2(pOdd) },
    { label: 'Par', odd: mk2(pEven) },
  ];

  // ── Extra Totals Lines ─────────────────────────────────────────
  const extraLines = [0.5, 1.5, 3.5, 4.5, 5.5, 6.5];
  const existingApiLines = new Set(totalsLines.map((t) => t.line));
  for (const line of extraLines) {
    if (existingApiLines.has(line)) continue;
    const cutoff = Math.floor(line);
    const pOver = sumMatrix(matrix, (h, a) => h + a > cutoff);
    const pUnder = 1 - pOver;
    if (pOver < 0.01 || pOver > 0.99) continue;
    const key = `totals_${String(line).replace('.', '_')}`;
    derived[key] = [
      { label: `Mais ${line}`, odd: mk2(pOver), point: String(line) },
      { label: `Menos ${line}`, odd: mk2(pUnder), point: String(line) },
    ];
  }

  // ── Home / Away Team Totals ────────────────────────────────────
  for (const [teamKey, teamLabel, lam] of [
    ['home_team_totals', home, lambdaH],
    ['away_team_totals', away, lambdaA],
  ] as const) {
    const sels: Selection[] = [];
    for (const line of [0.5, 1.5, 2.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(lam, cut);
      const pU = 1 - pO;
      if (pO > 0.01 && pO < 0.99) {
        sels.push({ label: `${teamLabel} Mais ${line}`, odd: mk2(pO), point: String(line) });
        sels.push({ label: `${teamLabel} Menos ${line}`, odd: mk2(pU), point: String(line) });
      }
    }
    if (sels.length) derived[teamKey] = sels;
  }

  // ── Exact Home/Away Goals ───────────────────────────────────────
  const exactHomeSels: Selection[] = [];
  for (let g = 0; g <= 4; g++) {
    const p = poissonPMF(lambdaH, g);
    const label = g <= 3 ? `${g} Golos` : '4 ou mais';
    const actP = g === 4 ? (1 - poissonCDF(lambdaH, 3)) : p;
    if (actP > 0.005) exactHomeSels.push({ label, odd: mk3(actP, VIG5) });
  }
  if (exactHomeSels.length >= 3) derived['exact_home_goals'] = exactHomeSels;

  const exactAwaySels: Selection[] = [];
  for (let g = 0; g <= 4; g++) {
    const p = poissonPMF(lambdaA, g);
    const label = g <= 3 ? `${g} Golos` : '4 ou mais';
    const actP = g === 4 ? (1 - poissonCDF(lambdaA, 3)) : p;
    if (actP > 0.005) exactAwaySels.push({ label, odd: mk3(actP, VIG5) });
  }
  if (exactAwaySels.length >= 3) derived['exact_away_goals'] = exactAwaySels;

  // ── First Team to Score ────────────────────────────────────────
  const pNeitherScores = matrix[0][0];
  // Approximation: P(home scores first) ≈ λH/(λH+λA) * (1 - P(0-0))
  const rateH = lambdaH / (lambdaH + lambdaA);
  const pHomeFirst = (1 - pNeitherScores) * rateH;
  const pAwayFirst = (1 - pNeitherScores) * (1 - rateH);
  derived['first_team_to_score'] = [
    { label: home, odd: mk3(pHomeFirst) },
    { label: 'Nenhuma', odd: mk3(pNeitherScores) },
    { label: away, odd: mk3(pAwayFirst) },
  ];

  // ── Last Team to Score ─────────────────────────────────────────
  // Symmetric approximation — slightly biased toward higher-scoring team
  const pHomeLast = (1 - pNeitherScores) * (0.45 + 0.1 * (lambdaH - lambdaA) / (lambdaH + lambdaA));
  const pAwayLast = (1 - pNeitherScores) * (0.55 - 0.1 * (lambdaH - lambdaA) / (lambdaH + lambdaA));
  derived['team_to_score_last'] = [
    { label: home, odd: mk3(Math.max(0.05, pHomeLast)) },
    { label: 'Nenhuma', odd: mk3(pNeitherScores) },
    { label: away, odd: mk3(Math.max(0.05, pAwayLast)) },
  ];

  // ── Team Clean Sheet ───────────────────────────────────────────
  const pHomeCS = poissonCDF(lambdaA, 0);
  const pAwayCS = poissonCDF(lambdaH, 0);
  derived['team_clean_sheet'] = [
    { label: `${home} Baliza a Zero`, odd: mk2(pHomeCS) },
    { label: `${home} Sofre`, odd: mk2(1 - pHomeCS) },
    { label: `${away} Baliza a Zero`, odd: mk2(pAwayCS) },
    { label: `${away} Sofre`, odd: mk2(1 - pAwayCS) },
  ];

  // ── Win to Nil ─────────────────────────────────────────────────
  const pHomeWinToNil = sumMatrix(matrix, (h, a) => h > 0 && a === 0);
  const pAwayWinToNil = sumMatrix(matrix, (h, a) => a > 0 && h === 0);
  derived['win_to_nil'] = [
    { label: `${home} Vence sem Sofrer`, odd: mk2(pHomeWinToNil) },
    { label: `${home} Não`, odd: mk2(1 - pHomeWinToNil) },
    { label: `${away} Vence sem Sofrer`, odd: mk2(pAwayWinToNil) },
    { label: `${away} Não`, odd: mk2(1 - pAwayWinToNil) },
  ];

  // ── BTTS + Result ─────────────────────────────────────────────
  if (btts) {
    const pBTTS = btts.pYes;
    const pNoBTTS = btts.pNo;
    // Approximate: home win with BTTS ≈ P(home>0 and away>0 and home>away)
    const pHB = sumMatrix(matrix, (h, a) => h > 0 && a > 0 && h > a);
    const pDB = sumMatrix(matrix, (h, a) => h > 0 && a > 0 && h === a);
    const pAB = sumMatrix(matrix, (h, a) => h > 0 && a > 0 && h < a);
    const pHNB = sumMatrix(matrix, (h, a) => !(h > 0 && a > 0) && h > a);
    const pANB = sumMatrix(matrix, (h, a) => !(h > 0 && a > 0) && h < a);
    derived['btts_and_result'] = [
      { label: `${home} + Ambas Marcam`, odd: mk3(Math.max(0.01, pHB), VIG4) },
      { label: `Empate + Ambas Marcam`, odd: mk3(Math.max(0.01, pDB), VIG4) },
      { label: `${away} + Ambas Marcam`, odd: mk3(Math.max(0.01, pAB), VIG4) },
      { label: `${home} + Não`, odd: mk3(Math.max(0.01, pHNB), VIG4) },
      { label: `${away} + Não`, odd: mk3(Math.max(0.01, pANB), VIG4) },
    ];

    // ── BTTS 1st Half ──────────────────────────────────────────
    const lH1 = lambdaH * 0.45, lA1 = lambdaA * 0.45;
    const pBTTS1 = (1 - poissonCDF(lH1, 0)) * (1 - poissonCDF(lA1, 0));
    derived['btts_first_half'] = [
      { label: 'Sim', odd: mk2(pBTTS1) },
      { label: 'Não', odd: mk2(1 - pBTTS1) },
    ];

    // ── BTTS 2nd Half ─────────────────────────────────────────
    const lH2 = lambdaH * 0.55, lA2 = lambdaA * 0.55;
    const pBTTS2 = (1 - poissonCDF(lH2, 0)) * (1 - poissonCDF(lA2, 0));
    derived['btts_second_half'] = [
      { label: 'Sim', odd: mk2(pBTTS2) },
      { label: 'Não', odd: mk2(1 - pBTTS2) },
    ];
  }

  // ── 1st Half derived markets ───────────────────────────────────
  const lH1 = lambdaH * 0.45;
  const lA1 = lambdaA * 0.45;
  const lH2 = lambdaH * 0.55;
  const lA2 = lambdaA * 0.55;

  // 1st Half Totals
  const ht1Sels: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5]) {
    const cut = Math.floor(line);
    let pO = 0;
    for (let h = 0; h < MAX_G; h++)
      for (let a = 0; a < MAX_G; a++)
        if (poissonPMF(lH1, h) * poissonPMF(lA1, a) > 0 && h + a > cut)
          pO += poissonPMF(lH1, h) * poissonPMF(lA1, a);
    pO = Math.min(0.99, Math.max(0.01, pO));
    ht1Sels.push({ label: `Mais ${line}`, odd: mk2(pO), point: String(line) });
    ht1Sels.push({ label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
  }
  derived['1st_half_totals'] = ht1Sels;

  // 2nd Half Totals
  const ht2Sels: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5]) {
    const cut = Math.floor(line);
    let pO = 0;
    for (let h = 0; h < MAX_G; h++)
      for (let a = 0; a < MAX_G; a++)
        if (poissonPMF(lH2, h) * poissonPMF(lA2, a) > 0 && h + a > cut)
          pO += poissonPMF(lH2, h) * poissonPMF(lA2, a);
    pO = Math.min(0.99, Math.max(0.01, pO));
    ht2Sels.push({ label: `Mais ${line}`, odd: mk2(pO), point: String(line) });
    ht2Sels.push({ label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
  }
  derived['2nd_half_totals'] = ht2Sels;

  // 1st Half Goal Odd/Even
  let pOdd1 = 0;
  for (let h = 0; h < MAX_G; h++)
    for (let a = 0; a < MAX_G; a++)
      if ((h + a) % 2 === 1) pOdd1 += poissonPMF(lH1, h) * poissonPMF(lA1, a);
  derived['1st_half_goal_odd_even'] = [
    { label: 'Ímpar', odd: mk2(Math.min(0.95, Math.max(0.05, pOdd1))) },
    { label: 'Par', odd: mk2(Math.min(0.95, Math.max(0.05, 1 - pOdd1))) },
  ];

  // 2nd Half Result
  const pH2H = 1 - poissonCDF(lH2, 0) - (1 - poissonCDF(lA2, 0)) * (1 - 1 / (1 + lambdaH / lambdaA));
  const p2HHome = sumMatrix(matrix, (h, a) => h > a) * 0.9 + pH * 0.1;
  const p2HDraw = pD * 1.3;
  const p2HAway = sumMatrix(matrix, (h, a) => a > h) * 0.9 + pA * 0.1;
  const s2H = p2HHome + p2HDraw + p2HAway;
  derived['2nd_half'] = [
    { label: home, odd: mk3(p2HHome / s2H) },
    { label: 'Empate', odd: mk3(p2HDraw / s2H) },
    { label: away, odd: mk3(p2HAway / s2H) },
  ];

  // ── Half Time / Full Time ───────────────────────────────────────
  if (htH2h) {
    const htH2hData = htH2h;
    const pHT_H = htH2hData.pH, pHT_D = htH2hData.pD, pHT_A = htH2hData.pA;
    const combos = [
      ['1/1', pHT_H * pH],
      ['1/X', pHT_H * pD],
      ['1/2', pHT_H * pA],
      ['X/1', pHT_D * pH],
      ['X/X', pHT_D * pD],
      ['X/2', pHT_D * pA],
      ['2/1', pHT_A * pH],
      ['2/X', pHT_A * pD],
      ['2/2', pHT_A * pA],
    ] as const;
    const htftVIG = 1.12;
    derived['half_time_full_time'] = combos.map(([label, p]) => ({
      label,
      odd: mk3(Math.max(0.01, p), htftVIG),
    }));

    // Double Chance 1st Half
    derived['double_chance_1st_half'] = [
      { label: `1X`, odd: mk2(pHT_H + pHT_D) },
      { label: `X2`, odd: mk2(pHT_D + pHT_A) },
      { label: `12`, odd: mk2(pHT_H + pHT_A) },
    ];

    // Draw No Bet 1st Half
    const adjHT_H = pHT_H / (pHT_H + pHT_A);
    derived['draw_no_bet_1st_half'] = [
      { label: home, odd: mk2(adjHT_H) },
      { label: away, odd: mk2(1 - adjHT_H) },
    ];
  }

  // ── 1st Half Correct Score ─────────────────────────────────────
  const ht1Scores: Array<[number, number]> = [[0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2]];
  const ht1CS: Selection[] = [];
  let ht1Cover = 0;
  for (const [h, a] of ht1Scores) {
    const p = poissonPMF(lH1, h) * poissonPMF(lA1, a);
    if (p > 0.005) {
      ht1CS.push({ label: `${h}-${a}`, odd: mkOdd(p, VIG_CS * 1.05) });
      ht1Cover += p;
    }
  }
  if (ht1Cover < 0.99) ht1CS.push({ label: 'Outro', odd: mkOdd(Math.max(0.01, 1 - ht1Cover), VIG_CS * 1.05) });
  if (ht1CS.length >= 4) derived['1st_half_correct_score'] = ht1CS;

  // ── 2nd Half Correct Score ─────────────────────────────────────
  const ht2Scores: Array<[number, number]> = [[0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2]];
  const ht2CS: Selection[] = [];
  let ht2Cover = 0;
  for (const [h, a] of ht2Scores) {
    const p = poissonPMF(lH2, h) * poissonPMF(lA2, a);
    if (p > 0.005) {
      ht2CS.push({ label: `${h}-${a}`, odd: mkOdd(p, VIG_CS * 1.05) });
      ht2Cover += p;
    }
  }
  if (ht2Cover < 0.99) ht2CS.push({ label: 'Outro', odd: mkOdd(Math.max(0.01, 1 - ht2Cover), VIG_CS * 1.05) });
  if (ht2CS.length >= 4) derived['2nd_half_correct_score'] = ht2CS;

  // ── Penalty Scored (derived: ~1 in 3 matches has a penalty) ───
  const pPenalty = 0.35 * (0.8 + 0.1 * (lambdaH + lambdaA));
  const pPenaltyCapped = Math.min(0.55, Math.max(0.25, pPenalty));
  derived['penalty_scored'] = [
    { label: 'Sim', odd: mk2(pPenaltyCapped) },
    { label: 'Não', odd: mk2(1 - pPenaltyCapped) },
  ];

  // ── Score Both Halves ──────────────────────────────────────────
  const pHomeBothHalves = (1 - poissonCDF(lH1, 0)) * (1 - poissonCDF(lH2, 0));
  derived['score_both_halves'] = [
    { label: `${home} - Sim`, odd: mk2(pHomeBothHalves) },
    { label: `${home} - Não`, odd: mk2(1 - pHomeBothHalves) },
    { label: `${away} - Sim`, odd: mk2((1 - poissonCDF(lA1, 0)) * (1 - poissonCDF(lA2, 0))) },
    { label: `${away} - Não`, odd: mk2(1 - (1 - poissonCDF(lA1, 0)) * (1 - poissonCDF(lA2, 0))) },
  ];

  // ── Highest Scoring Half ───────────────────────────────────────
  // P(1st > 2nd), P(1st < 2nd), P(equal)
  // Approximate using Poisson for each half
  let pFirst1stMore = 0, pBothEqual = 0, pSecond2ndMore = 0;
  for (let g1 = 0; g1 < MAX_G; g1++) {
    for (let g2 = 0; g2 < MAX_G; g2++) {
      let p1 = 0, p2 = 0;
      for (let h = 0; h < MAX_G; h++)
        for (let a = 0; a < MAX_G; a++)
          if (h + a === g1) p1 += poissonPMF(lH1, h) * poissonPMF(lA1, a);
      for (let h = 0; h < MAX_G; h++)
        for (let a = 0; a < MAX_G; a++)
          if (h + a === g2) p2 += poissonPMF(lH2, h) * poissonPMF(lA2, a);
      const joint = p1 * p2;
      if (g1 > g2) pFirst1stMore += joint;
      else if (g1 === g2) pBothEqual += joint;
      else pSecond2ndMore += joint;
    }
  }
  derived['highest_scoring_half'] = [
    { label: '1º Tempo', odd: mk3(Math.max(0.05, pFirst1stMore)) },
    { label: 'Igual', odd: mk3(Math.max(0.05, pBothEqual)) },
    { label: '2º Tempo', odd: mk3(Math.max(0.05, pSecond2ndMore)) },
  ];

  // ── European Handicap Lines ─────────────────────────────────────
  const ehLines: Array<[number, string]> = [[-2, '-2'], [-1, '-1'], [0, '0'], [+1, '+1'], [+2, '+2']];
  for (const [line, label] of ehLines) {
    const pH = sumMatrix(matrix, (h, a) => (h + line) > a);
    const pD = sumMatrix(matrix, (h, a) => (h + line) === a);
    const pA = sumMatrix(matrix, (h, a) => (h + line) < a);
    if (pH > 0.01 && pA > 0.01) {
      derived[`handicap_european_${label.replace('-', 'neg').replace('+', 'pos').replace('neg', 'neg')}`] = [
        { label: `${home} (${label})`, odd: mk3(pH) },
        { label: 'Empate', odd: mk3(pD) },
        { label: `${away}`, odd: mk3(pA) },
      ];
    }
  }

  // ── Corners markets (derived from API or estimated) ─────────────
  const apiCorners = api['corners_total'] || [];
  // Try to extract corner mean from API lines
  let cornerMean = 10.5;
  const cornerLines: TotalsLine[] = [];
  for (const s of apiCorners) {
    const point = parseFloat(String(s.point ?? ''));
    const label = String(s.label ?? '').toLowerCase();
    const odd = Number(s.odd) || 0;
    if (!point || !(odd > 1)) continue;
    const existing = cornerLines.find((c) => c.line === point);
    if (!existing) {
      cornerLines.push({ line: point, overOdd: 0, underOdd: 0, pOver: 0, pUnder: 0 });
    }
    const entry = cornerLines.find((c) => c.line === point)!;
    if (label.includes('over') || label.includes('mais')) entry.overOdd = odd;
    else if (label.includes('under') || label.includes('menos')) entry.underOdd = odd;
  }
  for (const c of cornerLines) {
    if (c.overOdd > 1 && c.underOdd > 1) {
      const [pO, pU] = trueProbs([c.overOdd, c.underOdd]);
      c.pOver = pO;
      // Estimate lambda from the best line
      if (Math.abs(c.line - 10.5) < Math.abs(cornerMean - 10.5)) {
        cornerMean = solveLambda(pO, Math.floor(c.line));
      }
    }
  }

  // Extra corner lines
  const extraCornerLines = [6.5, 7.5, 8.5, 9.5, 11.5, 12.5, 13.5, 14.5];
  const existingApiCornerLines = new Set(cornerLines.map((c) => c.line));
  for (const cLine of extraCornerLines) {
    if (existingApiCornerLines.has(cLine)) continue;
    const cut = Math.floor(cLine);
    const pO = 1 - poissonCDF(cornerMean, cut);
    if (pO < 0.02 || pO > 0.98) continue;
    const key = `corners_${String(cLine).replace('.', '_')}`;
    derived[key] = [
      { label: `Mais ${cLine}`, odd: mk2(pO), point: String(cLine) },
      { label: `Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) },
    ];
  }

  // Corners Odd/Even
  const pCornersOdd = Math.sin((Math.PI * cornerMean) / (cornerMean + 1)) * 0.5 + 0.47;
  derived['corners_odd_even'] = [
    { label: 'Ímpar', odd: mk2(Math.max(0.42, Math.min(0.58, pCornersOdd))) },
    { label: 'Par', odd: mk2(Math.max(0.42, Math.min(0.58, 1 - pCornersOdd))) },
  ];

  // 1st Half Corners (~40% of game total)
  const cm1 = cornerMean * 0.42;
  const cm2 = cornerMean * 0.58;
  for (const [halfKey, halfLabel, cm] of [
    ['1st_half_corners', '1º Tempo', cm1],
    ['2nd_half_corners', '2º Tempo', cm2],
  ] as const) {
    const halfSels: Selection[] = [];
    for (const cLine of [3.5, 4.5, 5.5, 6.5]) {
      const cut = Math.floor(cLine);
      const pO = 1 - poissonCDF(cm, cut);
      if (pO > 0.02 && pO < 0.98) {
        halfSels.push({ label: `${halfLabel} Mais ${cLine}`, odd: mk2(pO), point: String(cLine) });
        halfSels.push({ label: `${halfLabel} Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) });
      }
    }
    if (halfSels.length >= 2) derived[halfKey] = halfSels;
  }

  // Home / Away corners (each team gets ~half the corners)
  for (const [teamKey, teamLabel, cm] of [
    ['home_corners_total', home, cornerMean * 0.52],
    ['away_corners_total', away, cornerMean * 0.48],
  ] as const) {
    const teamCornerSels: Selection[] = [];
    for (const cLine of [4.5, 5.5, 6.5]) {
      const cut = Math.floor(cLine);
      const pO = 1 - poissonCDF(cm, cut);
      if (pO > 0.03 && pO < 0.97) {
        teamCornerSels.push({ label: `${teamLabel} Mais ${cLine}`, odd: mk2(pO), point: String(cLine) });
        teamCornerSels.push({ label: `${teamLabel} Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) });
      }
    }
    if (teamCornerSels.length >= 2) derived[teamKey] = teamCornerSels;
  }

  // ── Cards markets ──────────────────────────────────────────────
  const apiCards = api['cards_total'] || [];
  let cardMean = 5.0;
  for (const s of apiCards) {
    const point = parseFloat(String(s.point ?? ''));
    const label = String(s.label ?? '').toLowerCase();
    const odd = Number(s.odd) || 0;
    if (!point || !(odd > 1)) continue;
    if (label.includes('over') || label.includes('mais')) {
      const pO = impliedProb(odd);
      cardMean = solveLambda(pO, Math.floor(point));
      break;
    }
  }

  const extraCardLines = [2.5, 3.5, 4.5, 7.5, 8.5];
  const existingApiCardLines = new Set(
    apiCards.map((s) => parseFloat(String(s.point ?? ''))).filter((p) => p > 0)
  );
  for (const cLine of extraCardLines) {
    if (existingApiCardLines.has(cLine)) continue;
    const cut = Math.floor(cLine);
    const pO = 1 - poissonCDF(cardMean, cut);
    if (pO < 0.02 || pO > 0.98) continue;
    const key = `cards_${String(cLine).replace('.', '_')}`;
    derived[key] = [
      { label: `Mais ${cLine}`, odd: mk2(pO), point: String(cLine) },
      { label: `Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) },
    ];
  }

  derived['cards_odd_even'] = [
    { label: 'Ímpar', odd: mk2(0.49) },
    { label: 'Par', odd: mk2(0.51) },
  ];

  // 1st/2nd half cards
  for (const [halfKey, cm] of [
    ['1st_half_cards', cardMean * 0.43],
    ['2nd_half_cards', cardMean * 0.57],
  ] as const) {
    const halfCardSels: Selection[] = [];
    for (const cLine of [1.5, 2.5, 3.5]) {
      const cut = Math.floor(cLine);
      const pO = 1 - poissonCDF(cm, cut);
      if (pO > 0.02 && pO < 0.98) {
        halfCardSels.push({ label: `Mais ${cLine}`, odd: mk2(pO), point: String(cLine) });
        halfCardSels.push({ label: `Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) });
      }
    }
    if (halfCardSels.length >= 2) derived[halfKey] = halfCardSels;
  }

  // Home / Away cards
  for (const [teamKey, teamLabel, cm] of [
    ['home_cards_total', home, cardMean * 0.52],
    ['away_cards_total', away, cardMean * 0.48],
  ] as const) {
    const teamCardSels: Selection[] = [];
    for (const cLine of [1.5, 2.5, 3.5]) {
      const cut = Math.floor(cLine);
      const pO = 1 - poissonCDF(cm, cut);
      if (pO > 0.03 && pO < 0.97) {
        teamCardSels.push({ label: `${teamLabel} Mais ${cLine}`, odd: mk2(pO), point: String(cLine) });
        teamCardSels.push({ label: `${teamLabel} Menos ${cLine}`, odd: mk2(1 - pO), point: String(cLine) });
      }
    }
    if (teamCardSels.length >= 2) derived[teamKey] = teamCardSels;
  }

  // ── Comeback Win ───────────────────────────────────────────────
  const pHomeComeback = pH * 0.10;
  const pAwayComeback = pA * 0.10;
  derived['comeback_win'] = [
    { label: `${home} remonta`, odd: mk2(Math.max(0.03, pHomeComeback)) },
    { label: `${away} remonta`, odd: mk2(Math.max(0.03, pAwayComeback)) },
    { label: 'Não há remontada', odd: mk2(Math.max(0.3, 1 - pHomeComeback - pAwayComeback)) },
  ];

  // ── Win Both Halves ────────────────────────────────────────────
  const pHomeWin1 = sumMatrix(
    (() => {
      const m: number[][] = [];
      for (let h = 0; h < MAX_G; h++) { m[h] = []; for (let a = 0; a < MAX_G; a++) m[h][a] = poissonPMF(lH1, h) * poissonPMF(lA1, a); }
      return m;
    })(),
    (h, a) => h > a
  );
  const pHomeWin2 = sumMatrix(
    (() => {
      const m: number[][] = [];
      for (let h = 0; h < MAX_G; h++) { m[h] = []; for (let a = 0; a < MAX_G; a++) m[h][a] = poissonPMF(lH2, h) * poissonPMF(lA2, a); }
      return m;
    })(),
    (h, a) => h > a
  );
  const pAwayWin1 = sumMatrix(
    (() => {
      const m: number[][] = [];
      for (let h = 0; h < MAX_G; h++) { m[h] = []; for (let a = 0; a < MAX_G; a++) m[h][a] = poissonPMF(lH1, h) * poissonPMF(lA1, a); }
      return m;
    })(),
    (h, a) => a > h
  );
  const pAwayWin2 = sumMatrix(
    (() => {
      const m: number[][] = [];
      for (let h = 0; h < MAX_G; h++) { m[h] = []; for (let a = 0; a < MAX_G; a++) m[h][a] = poissonPMF(lH2, h) * poissonPMF(lA2, a); }
      return m;
    })(),
    (h, a) => a > h
  );
  const pHBothHalves = pHomeWin1 * pHomeWin2;
  const pABothHalves = pAwayWin1 * pAwayWin2;
  derived['win_both_halves'] = [
    { label: `${home} - Sim`, odd: mk2(Math.max(0.03, pHBothHalves)) },
    { label: `${home} - Não`, odd: mk2(1 - Math.max(0.03, pHBothHalves)) },
    { label: `${away} - Sim`, odd: mk2(Math.max(0.03, pABothHalves)) },
    { label: `${away} - Não`, odd: mk2(1 - Math.max(0.03, pABothHalves)) },
  ];

  // ── Goal in Each Half (at least 1 goal per half) ───────────────
  const pGoalIn1st = 1 - poissonCDF(lH1 + lA1, 0);
  const pGoalIn2nd = 1 - poissonCDF(lH2 + lA2, 0);
  const pGoalBothHalves = pGoalIn1st * pGoalIn2nd;
  derived['goal_in_each_half'] = [
    { label: 'Sim', odd: mk2(Math.min(0.96, Math.max(0.04, pGoalBothHalves))) },
    { label: 'Não', odd: mk2(Math.min(0.96, Math.max(0.04, 1 - pGoalBothHalves))) },
  ];

  // ── Home / Away Goals Odd/Even ─────────────────────────────────
  const pHomeGoalOdd = (() => {
    let s = 0;
    for (let k = 1; k <= 8; k += 2) s += poissonPMF(lambdaH, k);
    return Math.min(0.56, Math.max(0.44, s));
  })();
  derived['home_goals_odd_even'] = [
    { label: `${home} Ímpar`, odd: mk2(pHomeGoalOdd) },
    { label: `${home} Par`, odd: mk2(1 - pHomeGoalOdd) },
  ];

  const pAwayGoalOdd = (() => {
    let s = 0;
    for (let k = 1; k <= 8; k += 2) s += poissonPMF(lambdaA, k);
    return Math.min(0.56, Math.max(0.44, s));
  })();
  derived['away_goals_odd_even'] = [
    { label: `${away} Ímpar`, odd: mk2(pAwayGoalOdd) },
    { label: `${away} Par`, odd: mk2(1 - pAwayGoalOdd) },
  ];

  // ── Asian Handicap Extra Lines (derived from Poisson) ───────────
  for (const ahLine of [-2.5, -1.5, +1.5, +2.5]) {
    const pAHHome = sumMatrix(matrix, (h, a) => h - a > ahLine);
    const pAHAway = sumMatrix(matrix, (h, a) => h - a < ahLine);
    if (pAHHome > 0.01 && pAHHome < 0.99) {
      const keyBase = ahLine < 0 ? `neg${Math.abs(ahLine * 10).toFixed(0)}` : `pos${(ahLine * 10).toFixed(0)}`;
      const lineStr = ahLine > 0 ? `+${ahLine}` : String(ahLine);
      derived[`asian_handicap_${keyBase}`] = [
        { label: `${home} ${lineStr}`, odd: mk2(pAHHome), point: String(ahLine) },
        { label: `${away} ${ahLine > 0 ? '-' : '+'}${Math.abs(ahLine)}`, odd: mk2(pAHAway), point: String(-ahLine) },
      ];
    }
  }

  // ── Both Halves Goals Range ────────────────────────────────────
  derived['1st_half_goal_range'] = [
    { label: '0 Golos', odd: mk3(poissonCDF(lH1 + lA1, 0), VIG4) },
    { label: '1 Golo', odd: mk3(poissonPMF(Math.min(8, lH1 + lA1), 1), VIG4) },
    { label: '2+ Golos', odd: mk3(Math.max(0.01, 1 - poissonCDF(lH1 + lA1, 1)), VIG4) },
  ];
  derived['2nd_half_goal_range'] = [
    { label: '0 Golos', odd: mk3(poissonCDF(lH2 + lA2, 0), VIG4) },
    { label: '1 Golo', odd: mk3(poissonPMF(Math.min(8, lH2 + lA2), 1), VIG4) },
    { label: '2+ Golos', odd: mk3(Math.max(0.01, 1 - poissonCDF(lH2 + lA2, 1)), VIG4) },
  ];

  // ── Home / Away Corners per Half ───────────────────────────────
  const homeCm1 = cornerMean * 0.52 * 0.42;
  const homeCm2 = cornerMean * 0.52 * 0.58;
  const awayCm1 = cornerMean * 0.48 * 0.42;
  const awayCm2 = cornerMean * 0.48 * 0.58;
  for (const [key, label, cm] of [
    ['home_corners_1st_half', `${home} 1ºT`, homeCm1],
    ['home_corners_2nd_half', `${home} 2ºT`, homeCm2],
    ['away_corners_1st_half', `${away} 1ºT`, awayCm1],
    ['away_corners_2nd_half', `${away} 2ºT`, awayCm2],
  ] as const) {
    const sels: Selection[] = [];
    for (const line of [2.5, 3.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(cm, cut);
      if (pO > 0.05 && pO < 0.95) {
        sels.push({ label: `${label} Mais ${line}`, odd: mk2(pO), point: String(line) });
        sels.push({ label: `${label} Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
      }
    }
    if (sels.length >= 2) derived[key] = sels;
  }

  // ── Home / Away Cards per Half ─────────────────────────────────
  const homeCardM1 = cardMean * 0.52 * 0.43;
  const homeCardM2 = cardMean * 0.52 * 0.57;
  const awayCardM1 = cardMean * 0.48 * 0.43;
  const awayCardM2 = cardMean * 0.48 * 0.57;
  for (const [cardKey, cardLabel, cardCm] of [
    ['home_cards_1st_half', `${home} 1ºT`, homeCardM1],
    ['home_cards_2nd_half', `${home} 2ºT`, homeCardM2],
    ['away_cards_1st_half', `${away} 1ºT`, awayCardM1],
    ['away_cards_2nd_half', `${away} 2ºT`, awayCardM2],
  ] as const) {
    const sels: Selection[] = [];
    for (const line of [0.5, 1.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(cardCm, cut);
      if (pO > 0.05 && pO < 0.95) {
        sels.push({ label: `${cardLabel} Mais ${line}`, odd: mk2(pO), point: String(line) });
        sels.push({ label: `${cardLabel} Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
      }
    }
    if (sels.length >= 2) derived[cardKey] = sels;
  }

  return derived;
}

// ── Basketball derivations ────────────────────────────────────────────────────

function deriveBasketball(api: MarketMap, home: string, away: string): MarketMap {
  const h2h = extractH2H(api);
  if (!h2h) return {};
  const totalsLines = extractTotalsLines(api);
  const derived: MarketMap = {};
  const VIG2 = 1.05, VIG3 = 1.07;

  const pH = h2h.pH, pA = h2h.pA;

  // Spread-based home strength
  const homeStrength = pH / (pH + pA);

  // Find total line (typically 220 for NBA)
  const bestLine = totalsLines.reduce<TotalsLine | null>((best, t) => {
    if (!best) return t;
    return Math.abs(t.line - 220) < Math.abs(best.line - 220) ? t : best;
  }, null);

  const totalPoints = bestLine?.line ?? 220;
  const homePoints = totalPoints * homeStrength;
  const awayPoints = totalPoints * (1 - homeStrength);

  // Spread line
  const spreadLines = api['spreads'] || [];
  let spreadVal = homePoints - awayPoints;
  for (const s of spreadLines) {
    const point = parseFloat(String(s.point ?? s.label ?? ''));
    if (!isNaN(point) && Math.abs(point) < 30) { spreadVal = -point; break; }
  }

  const mk2 = (p: number) => mkOdd(Math.max(0.05, Math.min(0.95, p)), VIG2);
  const mk3 = (p: number) => mkOdd(Math.max(0.03, Math.min(0.97, p)), VIG3);

  // ── Quarter markets ────────────────────────────────────────────
  const qTotal = totalPoints / 4;
  const qHomePoints = homePoints / 4;
  const qAwayPoints = awayPoints / 4;

  for (const [q, label] of [[1,'1º'],[2,'2º'],[3,'3º'],[4,'4º']] as const) {
    const hQP = qHomePoints * (q === 4 ? 1.05 : 1);
    const aQP = qAwayPoints * (q === 4 ? 1.05 : 1);
    const qTot = hQP + aQP;
    const pHQ = hQP / qTot;

    derived[`q${q}_h2h`] = [
      { label: home, odd: mk2(pHQ) },
      { label: away, odd: mk2(1 - pHQ) },
    ];

    for (const line of [qTot - 5, qTot, qTot + 5].map(n => Math.round(n * 2) / 2)) {
      const pO = Math.max(0.05, Math.min(0.95, 0.5 + (qTot - line) * 0.04));
      derived[`q${q}_totals`] = derived[`q${q}_totals`] || [];
      derived[`q${q}_totals`].push({ label: `Mais ${line}`, odd: mk2(pO), point: String(line) });
      derived[`q${q}_totals`].push({ label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
    }
  }

  // ── Half markets ───────────────────────────────────────────────
  const halfTotal = totalPoints / 2;
  const halfHomeP = homePoints / 2;
  const halfAwayP = awayPoints / 2;
  const pHalf1 = halfHomeP / (halfHomeP + halfAwayP);

  derived['first_half_h2h'] = [
    { label: home, odd: mk2(pHalf1) },
    { label: away, odd: mk2(1 - pHalf1) },
  ];
  derived['second_half_h2h'] = [
    { label: home, odd: mk2(pHalf1 * 0.97 + 0.015) },
    { label: away, odd: mk2((1 - pHalf1) * 0.97 + 0.015) },
  ];

  for (const [halfKey, halfLabel, mid] of [
    ['first_half_totals', '1º Tempo', halfTotal],
    ['second_half_totals', '2º Tempo', halfTotal],
  ] as const) {
    const halfSels: Selection[] = [];
    for (const line of [mid - 5, mid, mid + 5].map(n => Math.round(n * 2) / 2)) {
      const pO = Math.max(0.05, Math.min(0.95, 0.5 + (mid - line) * 0.04));
      halfSels.push({ label: `${halfLabel} Mais ${line}`, odd: mk2(pO), point: String(line) });
      halfSels.push({ label: `${halfLabel} Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
    }
    derived[halfKey] = halfSels;
  }

  // ── Team Totals ────────────────────────────────────────────────
  for (const [teamKey, teamLabel, teamPoints] of [
    ['team_totals_home', home, homePoints],
    ['team_totals_away', away, awayPoints],
  ] as const) {
    const teamSels: Selection[] = [];
    for (const line of [teamPoints - 5, teamPoints, teamPoints + 5].map(n => Math.round(n * 2) / 2)) {
      const pO = Math.max(0.05, Math.min(0.95, 0.5 + (teamPoints - line) * 0.04));
      teamSels.push({ label: `${teamLabel} Mais ${line}`, odd: mk2(pO), point: String(line) });
      teamSels.push({ label: `${teamLabel} Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
    }
    derived[teamKey] = teamSels;
  }

  // ── Winning Margin ─────────────────────────────────────────────
  const spread = Math.abs(spreadVal);
  derived['winning_margin'] = [
    { label: `${home} 1-5`, odd: mk3(pH * 0.20) },
    { label: `${home} 6-10`, odd: mk3(pH * 0.25) },
    { label: `${home} 11-15`, odd: mk3(pH * 0.25) },
    { label: `${home} 16+`, odd: mk3(pH * 0.30) },
    { label: `${away} 1-5`, odd: mk3(pA * 0.20) },
    { label: `${away} 6-10`, odd: mk3(pA * 0.25) },
    { label: `${away} 11-15`, odd: mk3(pA * 0.25) },
    { label: `${away} 16+`, odd: mk3(pA * 0.30) },
  ];

  // ── Double Chance ─────────────────────────────────────────────
  derived['double_chance'] = [
    { label: `${home} ou 10+ pts`, odd: mk2(pH + pA * 0.1) },
    { label: `${away} ou 10+ pts`, odd: mk2(pA + pH * 0.1) },
  ];

  // ── Extra totals lines ─────────────────────────────────────────
  if (bestLine) {
    for (const offset of [-15, -10, -5, +5, +10, +15]) {
      const newLine = Math.round((bestLine.line + offset) * 2) / 2;
      const pO = Math.max(0.05, Math.min(0.95, bestLine.pOver + offset * (-0.03)));
      const key = `totals_${String(newLine).replace('.', '_')}`;
      derived[key] = [
        { label: `Mais ${newLine}`, odd: mk2(pO), point: String(newLine) },
        { label: `Menos ${newLine}`, odd: mk2(1 - pO), point: String(newLine) },
      ];
    }
  }

  return derived;
}

// ── Tennis derivations ────────────────────────────────────────────────────────

function deriveTennis(api: MarketMap, home: string, away: string): MarketMap {
  const h2h = extractH2H(api);
  if (!h2h) return {};
  const derived: MarketMap = {};
  const pH = h2h.pH, pA = h2h.pA;
  const mk2 = (p: number) => mkOdd(Math.max(0.05, Math.min(0.95, p)), 1.05);
  const mk3 = (p: number) => mkOdd(Math.max(0.03, Math.min(0.97, p)), 1.07);

  // ── Total Sets ─────────────────────────────────────────────────
  // In a best-of-3: P(2-0) = P(H wins in 2) + P(A wins in 2)
  // P(H wins in 2) = pH^2 (if sets independent)
  // P(A wins in 2) = pA^2
  // P(3 sets) = 1 - pH^2 - pA^2
  const pHomeWins2Sets = pH * pH;
  const pAwayWins2Sets = pA * pA;
  const p3Sets = 1 - pHomeWins2Sets - pAwayWins2Sets;
  derived['total_sets'] = [
    { label: 'Menos 2.5 (2 Sets)', odd: mk2(pHomeWins2Sets + pAwayWins2Sets) },
    { label: 'Mais 2.5 (3 Sets)', odd: mk2(Math.max(0.05, p3Sets)) },
  ];

  // ── Set Winners ────────────────────────────────────────────────
  derived['set_1_h2h'] = [
    { label: home, odd: mk2(pH) },
    { label: away, odd: mk2(pA) },
  ];
  // Conditional: given we know match probs
  const pS2H = pH * pH / (pH * pH + pA * pA) * pH + pA * pH / (1 - pH * pH - pA * pA) * pH;
  const pS2HNorm = Math.max(0.05, Math.min(0.95, pH * 0.9 + 0.05));
  derived['set_2_h2h'] = [
    { label: home, odd: mk2(pS2HNorm) },
    { label: away, odd: mk2(1 - pS2HNorm) },
  ];
  derived['set_3_h2h'] = [
    { label: home, odd: mk2(pH) },
    { label: away, odd: mk2(pA) },
    { label: 'Não disputado', odd: mk2(pHomeWins2Sets + pAwayWins2Sets) },
  ];

  // ── Match Games ────────────────────────────────────────────────
  // Average game count: 2-set match ~21 games, 3-set ~32 games
  const avgGames = 21 * (pHomeWins2Sets + pAwayWins2Sets) + 32 * Math.max(0.01, p3Sets);
  for (const line of [18.5, 20.5, 22.5, 24.5, 26.5]) {
    const pO = Math.max(0.05, Math.min(0.95, 0.5 + (avgGames - line) * 0.04));
    derived['match_total_games'] = derived['match_total_games'] || [];
    derived['match_total_games'].push({ label: `Mais ${line}`, odd: mk2(pO), point: String(line) });
    derived['match_total_games'].push({ label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
  }

  // ── Set Totals ─────────────────────────────────────────────────
  for (const setN of [1, 2, 3]) {
    const sels: Selection[] = [];
    for (const line of [9.5, 10.5, 11.5]) {
      const pO = 0.5 + (10.5 - line) * 0.08;
      sels.push({ label: `Mais ${line}`, odd: mk2(Math.max(0.1, Math.min(0.9, pO))), point: String(line) });
      sels.push({ label: `Menos ${line}`, odd: mk2(Math.max(0.1, Math.min(0.9, 1 - pO))), point: String(line) });
    }
    derived[`set_${setN}_totals`] = sels;
  }

  // ── Handicap (Sets) ────────────────────────────────────────────
  derived['sets_handicap'] = [
    { label: `${home} -1.5`, odd: mk2(pHomeWins2Sets) },
    { label: `${away} -1.5`, odd: mk2(pAwayWins2Sets) },
    { label: `${home} +1.5`, odd: mk2(pHomeWins2Sets + Math.max(0.01, p3Sets) * pH) },
    { label: `${away} +1.5`, odd: mk2(pAwayWins2Sets + Math.max(0.01, p3Sets) * pA) },
  ];

  // ── Tie Break in Match ─────────────────────────────────────────
  const pTieb = p3Sets * 0.4 + (1 - p3Sets) * 0.25;
  derived['tie_break_in_match'] = [
    { label: 'Sim', odd: mk2(pTieb) },
    { label: 'Não', odd: mk2(1 - pTieb) },
  ];

  // ── Player to win a set ────────────────────────────────────────
  const pHomeWinsASet = 1 - pAwayWins2Sets;
  derived['player_to_win_a_set'] = [
    { label: home, odd: mk2(pHomeWinsASet) },
    { label: away, odd: mk2(1 - pHomeWins2Sets) },
  ];

  // ── Games Odd/Even ─────────────────────────────────────────────
  derived['games_odd_even'] = [
    { label: 'Par', odd: mk2(0.5) },
    { label: 'Ímpar', odd: mk2(0.5) },
  ];

  // ── Correct Score (sets) ────────────────────────────────────────
  derived['correct_score'] = [
    { label: `${home} 2-0`, odd: mk2(pHomeWins2Sets) },
    { label: `${home} 2-1`, odd: mk2(Math.max(0.01, p3Sets) * pH) },
    { label: `${away} 2-0`, odd: mk2(pAwayWins2Sets) },
    { label: `${away} 2-1`, odd: mk2(Math.max(0.01, p3Sets) * pA) },
  ];

  return derived;
}

// ── Ice Hockey derivations ────────────────────────────────────────────────────

function deriveHockey(api: MarketMap, home: string, away: string): MarketMap {
  const h2h = extractH2H(api);
  if (!h2h) return {};
  const totalsLines = extractTotalsLines(api);
  const derived: MarketMap = {};
  const pH = h2h.pH, pA = h2h.pA;
  // Hockey typically has 3-way (with OT draw → home/away after OT)
  const pD = h2h.pD || 0;
  const mk2 = (p: number) => mkOdd(Math.max(0.05, Math.min(0.95, p)), 1.05);
  const mk3 = (p: number) => mkOdd(Math.max(0.03, Math.min(0.97, p)), 1.07);

  const bestLine = totalsLines[0];
  const totalGoals = bestLine?.line ?? 5.5;
  const lambdaTotal = solveLambda(bestLine?.pOver ?? 0.5, Math.floor(totalGoals));
  const lambdaH = lambdaTotal * (pH + 0.3 * pD) / (pH + pA + pD);
  const lambdaA = lambdaTotal - lambdaH;

  // ── BTTS ───────────────────────────────────────────────────────
  const pBTTS = (1 - poissonCDF(lambdaH, 0)) * (1 - poissonCDF(lambdaA, 0));
  derived['btts'] = [
    { label: 'Sim', odd: mk2(pBTTS) },
    { label: 'Não', odd: mk2(1 - pBTTS) },
  ];

  // ── Double Chance ──────────────────────────────────────────────
  derived['double_chance'] = [
    { label: `${home} ou Empate`, odd: mk2(pH + pD) },
    { label: `${away} ou Empate`, odd: mk2(pA + pD) },
    { label: `${home} ou ${away}`, odd: mk2(pH + pA) },
  ];

  // ── Draw No Bet ────────────────────────────────────────────────
  const pHnoDraw = pH / (pH + pA);
  derived['draw_no_bet'] = [
    { label: home, odd: mk2(pHnoDraw) },
    { label: away, odd: mk2(1 - pHnoDraw) },
  ];

  // ── Periods ────────────────────────────────────────────────────
  const lHp = lambdaH / 3, lAp = lambdaA / 3;
  for (const [perN, perLabel] of [[1,'1º'],[2,'2º'],[3,'3º']] as const) {
    const pHP = lHp / (lHp + lAp);
    derived[`period_${perN}_h2h`] = [
      { label: home, odd: mk2(pHP) },
      { label: 'Empate', odd: mk2(0.35) },
      { label: away, odd: mk2(1 - pHP - 0.35) },
    ];

    const perTot = (lHp + lAp);
    const perSels: Selection[] = [];
    for (const line of [0.5, 1.5, 2.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(perTot, cut);
      if (pO > 0.02 && pO < 0.98) {
        perSels.push({ label: `${perLabel} Per. Mais ${line}`, odd: mk2(pO), point: String(line) });
        perSels.push({ label: `${perLabel} Per. Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
      }
    }
    if (perSels.length) derived[`period_${perN}_totals`] = perSels;
  }

  // ── Extra Totals Lines ─────────────────────────────────────────
  for (const line of [3.5, 4.5, 5.5, 6.5, 7.5]) {
    const cut = Math.floor(line);
    const pO = 1 - poissonCDF(lambdaTotal, cut);
    if (pO < 0.02 || pO > 0.98) continue;
    derived[`totals_${String(line).replace('.', '_')}`] = [
      { label: `Mais ${line}`, odd: mk2(pO), point: String(line) },
      { label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) },
    ];
  }

  // ── Winning Margin ─────────────────────────────────────────────
  const buildMatrix = (lH: number, lA: number) => {
    const m: number[][] = [];
    for (let h = 0; h < 10; h++) {
      m[h] = [];
      for (let a = 0; a < 10; a++) m[h][a] = poissonPMF(lH, h) * poissonPMF(lA, a);
    }
    return m;
  };
  const hkMatrix = buildMatrix(lambdaH, lambdaA);
  const sumM = (fn: (h: number, a: number) => boolean) => {
    let s = 0;
    for (let h = 0; h < 10; h++)
      for (let a = 0; a < 10; a++)
        if (fn(h, a)) s += hkMatrix[h][a];
    return Math.min(1, s);
  };

  derived['winning_margin'] = [
    { label: `${home} 1 golo`, odd: mk3(sumM((h, a) => h - a === 1)) },
    { label: `${home} 2 golos`, odd: mk3(sumM((h, a) => h - a === 2)) },
    { label: `${home} 3+`, odd: mk3(sumM((h, a) => h - a >= 3)) },
    { label: 'Empate', odd: mk3(sumM((h, a) => h === a)) },
    { label: `${away} 1 golo`, odd: mk3(sumM((h, a) => a - h === 1)) },
    { label: `${away} 2 golos`, odd: mk3(sumM((h, a) => a - h === 2)) },
    { label: `${away} 3+`, odd: mk3(sumM((h, a) => a - h >= 3)) },
  ];

  // ── Puck Line ─────────────────────────────────────────────────
  if (!api['puck_line']) {
    const pHL15 = sumM((h, a) => h - a >= 2);
    const pAL15 = sumM((h, a) => a - h >= 2);
    derived['puck_line'] = [
      { label: `${home} -1.5`, odd: mk2(pHL15), point: '-1.5' },
      { label: `${away} +1.5`, odd: mk2(1 - pHL15), point: '+1.5' },
      { label: `${home} +1.5`, odd: mk2(1 - pAL15), point: '+1.5' },
      { label: `${away} -1.5`, odd: mk2(pAL15), point: '-1.5' },
    ];
  }

  // ── Highest Scoring Period ─────────────────────────────────────
  derived['highest_scoring_period'] = [
    { label: '1º Período', odd: mk3(0.32) },
    { label: '2º Período', odd: mk3(0.33) },
    { label: '3º Período', odd: mk3(0.35) },
  ];

  return derived;
}

// ── Baseball derivations ──────────────────────────────────────────────────────

function deriveBaseball(api: MarketMap, home: string, away: string): MarketMap {
  const h2h = extractH2H(api);
  if (!h2h) return {};
  const derived: MarketMap = {};
  const pH = h2h.pH, pA = h2h.pA;
  const mk2 = (p: number) => mkOdd(Math.max(0.05, Math.min(0.95, p)), 1.05);
  const mk3 = (p: number) => mkOdd(Math.max(0.03, Math.min(0.97, p)), 1.07);

  // Typical MLB: 8.5-9.5 total runs, ~4.5-5 per team
  const totalRuns = 9.0;
  const lambdaH = totalRuns * (pH + 0.1) / (pH + pA + 0.2);
  const lambdaA = totalRuns - lambdaH;

  // ── Run Line ──────────────────────────────────────────────────
  if (!api['run_line'] && !api['spreads']) {
    const pHL15 = 1 - poissonCDF(lambdaH - lambdaA, 1);
    derived['run_line'] = [
      { label: `${home} -1.5`, odd: mk2(Math.max(0.05, pHL15)), point: '-1.5' },
      { label: `${away} +1.5`, odd: mk2(Math.max(0.05, 1 - pHL15)), point: '+1.5' },
    ];
  }

  // ── Totals ────────────────────────────────────────────────────
  if (!api['totals']) {
    const totSels: Selection[] = [];
    for (const line of [7.5, 8.5, 9.5, 10.5, 11.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(totalRuns, cut);
      if (pO > 0.02 && pO < 0.98) {
        totSels.push({ label: `Mais ${line}`, odd: mk2(pO), point: String(line) });
        totSels.push({ label: `Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
      }
    }
    derived['totals'] = totSels;
  }

  // ── NRFI / YRFI ───────────────────────────────────────────────
  const pNRFI = poissonCDF(lambdaH / 9, 0) * poissonCDF(lambdaA / 9, 0);
  derived['nrfi'] = [
    { label: 'NRFI - Sem corrida no 1º inning', odd: mk2(pNRFI) },
    { label: 'YRFI - Com corrida no 1º inning', odd: mk2(1 - pNRFI) },
  ];

  // ── First Inning ───────────────────────────────────────────────
  const lH1i = lambdaH / 9, lA1i = lambdaA / 9;
  const pHWins1 = (1 - poissonCDF(lH1i, 0)) * poissonCDF(lA1i, 0);
  const pAWins1 = poissonCDF(lH1i, 0) * (1 - poissonCDF(lA1i, 0));
  const pTie1 = 1 - pHWins1 - pAWins1;
  derived['first_inning_h2h'] = [
    { label: home, odd: mk3(Math.max(0.02, pHWins1)) },
    { label: 'Empate', odd: mk3(Math.max(0.02, pTie1)) },
    { label: away, odd: mk3(Math.max(0.02, pAWins1)) },
  ];

  // ── BTTS ─────────────────────────────────────────────────────
  const pBTTS = (1 - poissonCDF(lambdaH, 0)) * (1 - poissonCDF(lambdaA, 0));
  derived['btts'] = [
    { label: 'Sim', odd: mk2(pBTTS) },
    { label: 'Não', odd: mk2(1 - pBTTS) },
  ];

  // ── Team Totals ───────────────────────────────────────────────
  for (const [teamKey, teamLabel, lam] of [
    ['team_totals_home', home, lambdaH],
    ['team_totals_away', away, lambdaA],
  ] as const) {
    const teamSels: Selection[] = [];
    for (const line of [3.5, 4.5, 5.5, 6.5]) {
      const cut = Math.floor(line);
      const pO = 1 - poissonCDF(lam, cut);
      if (pO > 0.03 && pO < 0.97) {
        teamSels.push({ label: `${teamLabel} Mais ${line}`, odd: mk2(pO), point: String(line) });
        teamSels.push({ label: `${teamLabel} Menos ${line}`, odd: mk2(1 - pO), point: String(line) });
      }
    }
    if (teamSels.length) derived[teamKey] = teamSels;
  }

  // ── Winning Margin (runs) ─────────────────────────────────────
  derived['winning_margin'] = [
    { label: `${home} 1-2 corridas`, odd: mk3(pH * 0.40) },
    { label: `${home} 3-4 corridas`, odd: mk3(pH * 0.35) },
    { label: `${home} 5+ corridas`, odd: mk3(pH * 0.25) },
    { label: `${away} 1-2 corridas`, odd: mk3(pA * 0.40) },
    { label: `${away} 3-4 corridas`, odd: mk3(pA * 0.35) },
    { label: `${away} 5+ corridas`, odd: mk3(pA * 0.25) },
  ];

  // ── Extra Innings ─────────────────────────────────────────────
  const pExtraInnings = 0.08 + 0.04 * (1 - Math.abs(pH - pA));
  derived['extra_innings'] = [
    { label: 'Sim', odd: mk2(pExtraInnings) },
    { label: 'Não', odd: mk2(1 - pExtraInnings) },
  ];

  // ── Double Chance ─────────────────────────────────────────────
  derived['double_chance'] = [
    { label: `${home} ou Empate Técnico`, odd: mk2(pH + 0.05) },
    { label: `${away} ou Empate Técnico`, odd: mk2(pA + 0.05) },
  ];

  return derived;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function deriveAdditionalMarkets(
  apiMarkets: MarketMap,
  sport: string,
  homeTeam: string,
  awayTeam: string,
): MarketMap {
  const s = String(sport || '').toLowerCase();
  const home = homeTeam || 'Casa';
  const away = awayTeam || 'Fora';

  try {
    const isSoccer = s.includes('soccer') || (s.includes('football') && !s.includes('american'));
    const isBasketball = s.includes('basketball');
    const isTennis = s.includes('tennis');
    const isHockey = s.includes('ice') || s.includes('hockey');
    const isBaseball = s.includes('baseball');

    let derived: MarketMap = {};

    if (isSoccer) derived = deriveSoccer(apiMarkets, home, away);
    else if (isBasketball) derived = deriveBasketball(apiMarkets, home, away);
    else if (isTennis) derived = deriveTennis(apiMarkets, home, away);
    else if (isHockey) derived = deriveHockey(apiMarkets, home, away);
    else if (isBaseball) derived = deriveBaseball(apiMarkets, home, away);

    // Remove any derived market that already exists in API markets (prefer real odds)
    const out: MarketMap = {};
    for (const [key, sels] of Object.entries(derived)) {
      if (!apiMarkets[key] && Array.isArray(sels) && sels.length >= 2) {
        out[key] = sels;
      }
    }
    return out;
  } catch (err) {
    console.error('[marketDerivation] Error:', err);
    return {};
  }
}
