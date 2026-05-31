import { Market } from '@/shared/types';

export function normalizeOdds(raw: any): Market[] {
  const markets: Market[] = [];

  if (!raw) return markets;

  // NEW: Handle Odds API structure (h2h array)
  if (raw.h2h && Array.isArray(raw.h2h)) {
      const h2h = raw.h2h;
      const home = h2h.find((o: any) => String(o.outcome) === '1' || o.id === 'home');
      const draw = h2h.find((o: any) => String(o.outcome) === 'X' || o.id === 'draw');
      const away = h2h.find((o: any) => String(o.outcome) === '2' || o.id === 'away');

      if (home && away) {
           markets.push({
              id: 'mkt_h2h',
              key: 'h2h',
              name: 'Resultado Final',
              selections: [
                { id: 'sel_home', label: 'Casa', odd: Number(home.value || home.odd || home.price) },
                { id: 'sel_draw', label: 'Empate', odd: Number(draw?.value || draw?.odd || draw?.price || 0) },
                { id: 'sel_away', label: 'Fora', odd: Number(away.value || away.odd || away.price) }
              ].filter(s => s.id !== 'sel_draw' || s.odd > 0)
           });
      }
      // If we found h2h in this format, we assume it's the structured format and return.
      // TODO: Add support for totals/spreads in this format if needed later.
      return markets; 
  }

  // ---------- 1X2 ----------
  // Check for both string '1'/'X'/'2' and numeric keys if possible, or standard properties
  // The user input used raw['1'], raw['X'], raw['2'] which implies the raw object structure.
  // I will support common variations just in case, but prioritize the user's specific logic.
  
  const h = raw['1'] ?? raw['home_odd'] ?? raw['home'];
  const d = raw['X'] ?? raw['x'] ?? raw['draw_odd'] ?? raw['draw'];
  const a = raw['2'] ?? raw['away_odd'] ?? raw['away'];

  if (h && a) {
    markets.push({
      id: 'mkt_h2h',
      key: 'h2h',
      name: 'Resultado Final',
      selections: [
        { id: 'sel_home', label: 'Casa', odd: Number(h) },
        d && { id: 'sel_draw', label: 'Empate', odd: Number(d) },
        { id: 'sel_away', label: 'Fora', odd: Number(a) }
      ].filter(Boolean) as any
    });
  }

  // ---------- OVER / UNDER ----------
  Object.entries(raw).forEach(([k, odd]) => {
    // Regex to match over/under keys like "over_2.5", "under 2.5", "goals_over_2.5"
    // User provided: /(over|under)[\s_]?(\d+(\.\d+)?)/i
    const m = k.match(/(over|under)[\s_]?(\d+(\.\d+)?)/i);
    if (!m) return;

    const line = m[2];
    const key = `ou_${line}`;

    let market = markets.find(x => x.key === key);
    if (!market) {
      market = {
        id: `mkt_${key}`,
        key,
        name: `Total de Gols ${line}`,
        selections: []
      };
      markets.push(market);
    }

    market.selections.push({
      id: `sel_${k.toLowerCase()}`,
      label: m[1].toLowerCase() === 'over'
        ? `Mais de ${line}`
        : `Menos de ${line}`,
      odd: Number(odd)
    });
  });

  // ---------- BTTS ----------
  const bttsYes = raw['btts_yes'] ?? raw['both_teams_score_yes'];
  const bttsNo = raw['btts_no'] ?? raw['both_teams_score_no'];

  if (bttsYes || bttsNo) {
    markets.push({
      id: 'mkt_btts',
      key: 'btts',
      name: 'Ambas Marcam',
      selections: [
        bttsYes && { id: 'sel_yes', label: 'Sim', odd: Number(bttsYes) },
        bttsNo && { id: 'sel_no', label: 'Não', odd: Number(bttsNo) }
      ].filter(Boolean) as any
    });
  }

  // ---------- HANDICAP ----------
  Object.entries(raw).forEach(([k, odd]) => {
    const h = k.match(/(home|away)[\s_]?([+-]\d+(\.\d+)?)/i);
    if (!h) return;

    const side = h[1];
    const line = h[2];
    const key = `hcp_${line}`;

    let market = markets.find(x => x.key === key);
    if (!market) {
      market = {
        id: `mkt_${key}`,
        key,
        name: `Handicap ${line}`,
        selections: []
      };
      markets.push(market);
    }

    market.selections.push({
      id: `sel_${side}_${line}`,
      label: side.toLowerCase() === 'home'
        ? `Casa ${line}`
        : `Fora ${line}`,
      odd: Number(odd)
    });
  });

  return markets;
}
