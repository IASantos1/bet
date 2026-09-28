// Sports Addon feeds from sports.bzzoiro.com: basketball, ice hockey, darts and CS2.
//
// The four APIs share one shape (a list of games, a live list, a detail, per-bookmaker odds,
// predictions), so one feed engine runs them, with a small spec per sport for what differs:
//   - fixtures: games of the next N days; odds come from /{id}/odds/ (average of the bookmakers)
//   - markets:  match winner (market `ml`, overtime included, a tie voids) — for ice hockey the
//               3-way result on regulation time (`1x2`) and draw-no-bet when the books price them
//   - live:     score and clock; the market closes at the start (the prices are pre-match)
//   - results:  finished games settle on the final score (hockey 1X2 on the regulation score);
//               walkovers and cancellations void; a retirement settles on who advances
//
// The match page gets per-sport statistics, head-to-head/form, predictions and the table.

import { nowIso, tx } from './db.js';
import { settleEvent } from './betting.js';
import { listOf } from './feed.js';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const toInt = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const nm = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? first(v.name, v.nickname, v.short_name) : undefined);
const cc = (v) => (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null);
const pct = (v) => (num(v) === null ? null : Math.round(num(v) * 1000) / 10); // 0–1 → 0–100

export function mapSportStatus(raw) {
  const s = String(raw || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (!s || ['scheduled', 'notstarted', 'upcoming', 'ns'].includes(s)) return 'scheduled';
  if (['finished', 'ended', 'ft', 'awarded', 'aot', 'afterovertime', 'ap'].includes(s)) return 'finished';
  if (s === 'retired') return 'retired';
  if (s === 'walkover') return 'walkover';
  if (['postponed', 'delayed', 'unresolved', 'suspended'].includes(s)) return 'postponed';
  if (['cancelled', 'canceled', 'abandoned'].includes(s)) return 'cancelled';
  return 'live';
}

/** "1-0, 1-1, 0-2" → [[1,0],[1,1],[0,2]] */
export function parsePeriods(v) {
  if (Array.isArray(v)) {
    return v.map((p) => (Array.isArray(p) ? [toInt(p[0]), toInt(p[1])] : [toInt(first(p?.home, p?.p1)), toInt(first(p?.away, p?.p2))]))
      .filter(([a, b]) => a !== null && b !== null);
  }
  if (typeof v !== 'string') return [];
  return v.split(/[,;]/).map((x) => x.trim().match(/^(\d+)\s*[-:]\s*(\d+)/)).filter(Boolean).map((m) => [Number(m[1]), Number(m[2])]);
}

const side = (o) => (o && typeof o === 'object'
  ? { id: toInt(o.id), name: String(nm(o) || '').slice(0, 80), country: cc(first(o.country_code, o.country)) }
  : { id: null, name: typeof o === 'string' ? o.slice(0, 80) : '', country: null });

/** Common part of a game/match from any of the four APIs. */
function baseMatch(m, { homeKey = 'home_team', awayKey = 'away_team', dateKeys = ['event_date', 'match_date', 'start_time', 'date'], compKey = 'league' } = {}) {
  if (!m || typeof m !== 'object' || m.id === undefined) return null;
  const h = side(m[homeKey]);
  const a = side(m[awayKey]);
  const start = first(...dateKeys.map((k) => m[k]));
  if (!h.name || !a.name || !start || Number.isNaN(new Date(start).getTime())) return null;
  const comp = m[compKey] && typeof m[compKey] === 'object' ? m[compKey] : {};
  return {
    externalId: String(m.id), home: h.name, away: a.name, homeId: h.id, awayId: a.id,
    homeCountry: h.country, awayCountry: a.country, startTime: new Date(start).toISOString(),
    competitionId: toInt(comp.id), competitionName: String(first(comp.name, typeof m[compKey] === 'string' ? m[compKey] : null, '') || ''),
    status: mapSportStatus(m.status), winnerId: toInt(first(m.winner_id, m.winner_pair_id)),
  };
}

// ---------- per-sport specs ----------

/**
 * Books to average. In play (`since` set) only prices a bookmaker updated after `since` count, so a
 * pre-match price never carries into the game.
 */
const freshBooks = (list, since) => (Array.isArray(list) ? list : [])
  .filter((b) => !since || (b.updated_at && new Date(b.updated_at).getTime() >= since));

const winnerAverages = (data, homeKeys, awayKeys, since = null) => {
  const books = freshBooks(data?.bookmakers, since);
  const avg = (keys) => {
    const vals = books.map((b) => num(first(...keys.map((k) => b[k])))).filter((v) => v !== null && v > 1);
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  };
  // A single consensus price at the top level has no timestamp: pre-match only.
  const top = (keys) => (since ? null : num(first(...keys.map((k) => data?.[k]))));
  return {
    home: avg(homeKeys) ?? top(homeKeys), away: avg(awayKeys) ?? top(awayKeys),
    draw: avg(['odds_draw']) ?? top(['odds_draw']),
    drawBooks: books.filter((b) => num(b.odds_draw) > 1).length, books: books.length,
  };
};
const x100 = (v) => (v !== null && v > 1.01 && v < 1000 ? Math.round(v * 100) : null);

/** Average price of one market from the `markets` list (e.g. hockey DNB). */
function marketAverage(data, kind, selections, since = null) {
  const mk = (Array.isArray(data?.markets) ? data.markets : [])
    .find((m) => String(m.market_kind).toUpperCase() === kind && (m.market_period || 'FT') === 'FT' && (m.market_line === null || m.market_line === undefined));
  if (!mk) return null;
  const out = {};
  for (const sel of selections) {
    const vals = freshBooks(mk.bookmakers, since).map((b) => num(b.prices?.[sel]?.price)).filter((v) => v !== null && v > 1);
    if (!vals.length) return null;
    out[sel] = vals.reduce((x, y) => x + y, 0) / vals.length;
  }
  return out;
}

/** Match-winner prices (two outcomes) from an /odds/ payload: { 'market|1', 'market|2' }. */
export function twoWayPrices(data, homeKeys, awayKeys, { market = 'ml', since = null } = {}) {
  const w = winnerAverages(data, homeKeys, awayKeys, since);
  const h = x100(w.home);
  const a = x100(w.away);
  return h && a ? { [`${market}|1`]: h, [`${market}|2`]: a } : {};
}

const twoWay = (homeKeys, awayKeys) => (data, { since = null } = {}) => twoWayPrices(data, homeKeys, awayKeys, { since });

function streakRows(list, selfId) {
  return (Array.isArray(list) ? list : []).map((r) => {
    const w = String(first(r.result, r.outcome, '')).toUpperCase();
    const won = w ? w.startsWith('W') : toInt(r.winner_id) !== null && selfId ? toInt(r.winner_id) === selfId : null;
    return { date: first(r.date, r.match_date, r.event_date) || null, home: nm(first(r.home_team, r.home, r.player1)) || '', away: nm(first(r.away_team, r.away, r.player2)) || '',
      competition: nm(first(r.tournament, r.league)) || '', score: first(r.score, r.sets_detail) || null, won };
  });
}

/** "WWLOTLW" or ['W','L'] → ['V','V','D','D','V'] (overtime/shootout results count as W/L). */
export function formLetters(v) {
  const tokens = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.toUpperCase().match(/OTW|OTL|SOW|SOL|OT|SO|W|L|D|T/g) || [] : [];
  return tokens.map((t) => (/W$/.test(t) || t === 'W' ? 'V' : /L$/.test(t) ? 'D' : 'E')).slice(-5);
}

const predictionFrom = (p, homeId, { homeKey = 'home_win_prob', awayKey = 'away_win_prob' } = {}) => {
  if (!p) return null;
  const home = pct(first(p[homeKey], p.player1_win_prob, p.prob_home));
  const away = pct(first(p[awayKey], p.player2_win_prob, p.prob_away));
  if (home === null && away === null) return null;
  const w = toInt(p.predicted_winner_id);
  return { home, away, draw: null, predicted: w === null ? null : w === homeId ? 'home' : 'away', confidence: pct(p.confidence) };
};

/** A spec per sport: API paths, normalisation, odds, clock, statistics and insights. */
export const SPORT_SPECS = {
  basquetebol: {
    name: 'Basquetebol', source: 'bzzoiro-basketball', path: '/basketball/api/v2', list: '/events/', img: 'basketball/team',
    marketName: { ml: 'Vencedor (incl. prolongamento)' },
    normalize(m) {
      const b = baseMatch(m);
      if (!b) return null;
      const q = toInt(first(m.current_period, m.period, m.quarter));
      return {
        ...b, competition: b.competitionName || 'Basquetebol',
        homeScore: toInt(m.home_score), awayScore: toInt(m.away_score),
        clock: first(m.clock, m.time?.display, m.status_detail) || (q ? `${q > 4 ? 'Prol.' : `${q}.º Q`}${m.time_remaining ? ` ${m.time_remaining}` : ''}` : null),
      };
    },
    prices: twoWay(['odds_home'], ['odds_away']),
    async extras(get, id) {
      const [ts, box] = await Promise.all([
        get(`/events/${id}/team-stats/`).catch(() => null),
        get(`/events/${id}/box-score/`).catch(() => null),
      ]);
      const player = (p) => ({ name: String(first(p.name, p.player_name, '')), min: first(p.minutes, p.min, ''), pts: first(p.points, 0), reb: first(p.rebounds, ''),
        ast: first(p.assists, ''), fg: first(p.fg, ''), tp: first(p.three_pt, '') });
      const tables = ['home', 'away'].map((k) => ({
        side: k, columns: [['name', 'Jogador'], ['min', 'Min'], ['pts', 'Pts'], ['reb', 'Res'], ['ast', 'Ast'], ['fg', 'Lanç.'], ['tp', '3 pts']],
        rows: (Array.isArray(box?.[k]) ? box[k] : []).map(player).sort((x, y) => Number(y.pts) - Number(x.pts)).slice(0, 10),
      })).filter((t) => t.rows.length);
      return { groups: statGroups(ts), tables };
    },
    async insights(api, row, ids) {
      const league = toInt(row.league_ext);
      const [pre, pred, table] = await Promise.all([
        api.get(`/events/${ids.ext}/pregame/`).catch(() => null),
        league ? api.cached(`pred:${league}`, 10 * 60_000, () => api.get('/predictions/', { league, days: 7, limit: 200 })).catch(() => null) : null,
        league ? api.cached(`st:${league}`, 30 * 60_000, () => api.get('/standings/', { league })).catch(() => null) : null,
      ]);
      const p = listOf(pred).find((x) => String(first(x.event_id, x.event?.id)) === row.external_id);
      const form = (k) => formLetters(first(pre?.[`${k}_form`], pre?.form?.[k], pre?.[`${k}_team`]?.form, pre?.[k]?.form));
      return {
        h2h: pregameH2H(pre, form('home'), form('away')),
        prediction: predictionFrom(p, ids.home),
        standings: standingsFrom(table, [ids.home, ids.away], BASKET_COLS),
      };
    },
  },
  hoquei: {
    name: 'Hóquei no gelo', source: 'bzzoiro-hockey', path: '/hockey/api/v2', list: '/matches/', img: 'hockey/team',
    marketName: { ml: 'Vencedor (incl. prolongamento)', '1x2': 'Resultado (tempo regulamentar)', dnb: 'Empate anula (tempo regulamentar)' },
    normalize(m) {
      const b = baseMatch(m);
      if (!b) return null;
      const home = toInt(m.home_score);
      const away = toInt(m.away_score);
      const periods = parsePeriods(first(m.periods_score, m.periods));
      // Regulation score: the first three periods; after overtime or a shootout it was level.
      let reg = null;
      if (periods.length >= 3) reg = periods.slice(0, 3).reduce(([x, y], [p, q]) => [x + p, y + q], [0, 0]);
      else if (home !== null && away !== null) reg = m.is_overtime || m.is_shootout ? [Math.min(home, away), Math.min(home, away)] : [home, away];
      const per = toInt(m.current_period);
      return {
        ...b, competition: [b.competitionName || 'Hóquei', m.round_name && m.round_name !== 'Regular season' ? m.round_name : null].filter(Boolean).join(' · '),
        homeScore: home, awayScore: away, regHome: reg?.[0] ?? null, regAway: reg?.[1] ?? null,
        clock: per ? `${per > 3 ? 'Prol.' : `${per}.º P`}${toInt(m.current_minute) !== null ? ` ${m.current_minute}'` : ''}` : null,
        detail: [typeof m.periods_score === 'string' ? m.periods_score : null, m.is_shootout ? 'penáltis' : m.is_overtime ? 'prolongamento' : null].filter(Boolean).join(' · ') || null,
      };
    },
    prices(data, { since = null } = {}) {
      const w = winnerAverages(data, ['odds_home'], ['odds_away'], since);
      const out = {};
      // Books quoting a draw price the 3-way regulation market; otherwise it is the moneyline.
      if (w.draw && w.drawBooks * 2 >= Math.max(1, w.books)) {
        const [h, d, a] = [x100(w.home), x100(w.draw), x100(w.away)];
        if (h && d && a) Object.assign(out, { '1x2|1': h, '1x2|X': d, '1x2|2': a });
      } else if (x100(w.home) && x100(w.away)) Object.assign(out, { 'ml|1': x100(w.home), 'ml|2': x100(w.away) });
      const dnb = marketAverage(data, 'DNB', ['HOME', 'AWAY'], since);
      if (dnb && x100(dnb.HOME) && x100(dnb.AWAY)) Object.assign(out, { 'dnb|1': x100(dnb.HOME), 'dnb|2': x100(dnb.AWAY) });
      return out;
    },
    async extras(get, id) {
      const m = await get(`/matches/${id}/`);
      const periods = parsePeriods(m?.periods_score);
      return {
        groups: [],
        tables: periods.length ? [{ title: 'Golos por período', columns: [['p', 'Período'], ['h', 'Casa'], ['a', 'Fora']],
          rows: periods.map(([h, a], i) => ({ p: i < 3 ? `${i + 1}.º` : i === 3 ? 'Prolongamento' : 'Penáltis', h, a })) }] : [],
        detail: [m?.periods_score, m?.is_shootout ? 'decidido nos penáltis' : m?.is_overtime ? 'decidido no prolongamento' : null].filter(Boolean).join(' · ') || null,
      };
    },
    async insights(api, row, ids) {
      const league = toInt(row.league_ext);
      const [h, pred, table] = await Promise.all([
        api.get(`/matches/${ids.ext}/h2h/`).catch(() => null),
        api.cached('pred', 10 * 60_000, () => api.get('/predictions/', { upcoming: true, limit: 200 })).catch(() => null),
        league ? api.cached(`st:${league}`, 30 * 60_000, () => api.get('/standings/', { league })).catch(() => null) : null,
      ]);
      const hh = h?.head_to_head;
      const f = (k) => h?.[`${k}_form`];
      let h2h = null;
      if (hh || f('home') || f('away')) {
        h2h = {
          total: toInt(hh?.total_matches) ?? 0, homeWins: toInt(hh?.home_wins) ?? 0, awayWins: toInt(hh?.away_wins) ?? 0, draws: null,
          homeGoals: toInt(hh?.home_goals), awayGoals: toInt(hh?.away_goals), avgGoals: num(hh?.avg_total_goals),
          meetings: (hh?.recent_matches || []).map((r) => ({
            date: r.date || null, home: row.home, away: row.away, competition: '',
            score: toInt(r.home_goals) !== null ? `${r.home_goals}-${r.away_goals}` : null, won: r.winner === 'home' ? true : r.winner === 'away' ? false : null,
          })).slice(0, 10),
          homeFormLetters: formLetters(f('home')?.form_string), awayFormLetters: formLetters(f('away')?.form_string),
          compare: [
            ['Pontos na época', f('home')?.points, f('away')?.points],
            ['Pontos por jogo', f('home')?.points_per_game, f('away')?.points_per_game],
            ['Pontos por jogo em casa / fora', f('home')?.home?.points_per_game, f('away')?.away?.points_per_game],
          ].filter(([, a, b]) => a !== undefined && a !== null && b !== undefined && b !== null),
        };
      }
      const p = listOf(pred).find((x) => String(first(x.match_id, x.match?.id)) === row.external_id);
      return { h2h, prediction: predictionFrom(p, ids.home), standings: standingsFrom(table, [ids.home, ids.away], HOCKEY_COLS) };
    },
  },
  dardos: {
    name: 'Dardos', source: 'bzzoiro-darts', path: '/darts/api/v2', list: '/matches/', img: null, players: true,
    marketName: { ml: 'Vencedor do encontro' },
    normalize(m) {
      const b = baseMatch(m, { homeKey: 'player1', awayKey: 'player2', compKey: 'tournament' });
      if (!b) return null;
      const bySets = toInt(m.player1_sets) !== null && (toInt(m.best_of_sets) ?? 2) > 1;
      const home = bySets ? toInt(m.player1_sets) : toInt(first(m.player1_legs, m.player1_sets));
      const away = bySets ? toInt(m.player2_sets) : toInt(first(m.player2_legs, m.player2_sets));
      const legs = toInt(m.player1_legs) !== null && bySets ? ` · legs ${m.player1_legs}-${m.player2_legs}` : '';
      return {
        ...b, competition: [b.competitionName || 'Dardos', m.round_name].filter(Boolean).join(' · '),
        homeScore: home, awayScore: away,
        clock: b.status === 'live' ? `${bySets ? 'Sets' : 'Legs'} ${home ?? 0}-${away ?? 0}${legs}` : null,
        detail: typeof m.sets_detail === 'string' ? m.sets_detail : null,
      };
    },
    prices: twoWay(['odds_player1', 'odds_home'], ['odds_player2', 'odds_away']),
    async extras(get, id) {
      const m = await get(`/matches/${id}/`);
      const sets = parsePeriods(m?.sets_detail);
      return {
        groups: [],
        tables: sets.length ? [{ title: 'Legs por set', columns: [['s', 'Set'], ['h', 'Jogador 1'], ['a', 'Jogador 2']], rows: sets.map(([h, a], i) => ({ s: `${i + 1}.º`, h, a })) }] : [],
        detail: [m?.sets_detail, m?.best_of_sets ? `melhor de ${m.best_of_sets} sets` : m?.best_of_legs ? `melhor de ${m.best_of_legs} legs` : null].filter(Boolean).join(' · ') || null,
      };
    },
    async insights(api, row, ids) {
      const [h, pred, rank] = await Promise.all([
        api.get(`/matches/${ids.ext}/h2h/`).catch(() => null),
        api.cached('pred', 10 * 60_000, () => api.get('/predictions/', { upcoming: true, limit: 200 })).catch(() => null),
        api.cached('rank', 30 * 60_000, () => api.get('/rankings/', { type: 'PDC', limit: 20 })).catch(() => null),
      ]);
      const h2h = h && (toInt(h.total_matches) || (h.recent_matches || []).length) ? {
        total: toInt(h.total_matches) ?? 0, homeWins: toInt(h.player1_wins) ?? 0, awayWins: toInt(h.player2_wins) ?? 0, draws: null,
        meetings: (h.recent_matches || []).map((r) => ({
          date: r.date || null, home: row.home, away: row.away, competition: [nm(r.tournament), r.round_name].filter(Boolean).join(' · '),
          score: toInt(r.player1_sets) !== null ? `${r.player1_sets}-${r.player2_sets}` : null,
          won: r.winner === 'player1' ? true : r.winner === 'player2' ? false : null,
        })).slice(0, 10),
        compare: num(h.player1_avg) !== null ? [['Média de 3 dardos nos confrontos', num(h.player1_avg), num(h.player2_avg)]] : [],
      } : null;
      const p = listOf(pred).find((x) => String(first(x.match_id, x.match?.id)) === row.external_id);
      const rows = listOf(rank).map((r) => ({
        position: toInt(r.position), points: toInt(first(r.prize_money, r.points)), playerId: toInt(r.player?.id),
        player: String(nm(r.player) || ''), country: cc(r.player?.country_code),
      })).filter((r) => r.player);
      return {
        h2h, prediction: predictionFrom(p, ids.home),
        rankings: rows.length ? {
          type: 'PDC', valueLabel: 'Prémios (£)', rows,
          home: rows.find((r) => r.playerId === ids.home) || null, away: rows.find((r) => r.playerId === ids.away) || null,
        } : null,
      };
    },
  },
  esports: {
    name: 'CS2', source: 'bzzoiro-csgo', path: '/csgo/api/v2', list: '/matches/', img: 'csgo/team',
    marketName: { ml: 'Vencedor do encontro' },
    normalize(m) {
      const b = baseMatch(m, { compKey: 'tournament' });
      if (!b) return null;
      const home = toInt(m.home_score);
      const away = toInt(m.away_score);
      return {
        ...b, competition: [b.competitionName || 'CS2', m.stage, m.best_of ? `BO${m.best_of}` : null].filter(Boolean).join(' · '),
        homeScore: home, awayScore: away, clock: b.status === 'live' ? `Mapas ${home ?? 0}-${away ?? 0}` : null,
      };
    },
    prices: twoWay(['odds_home'], ['odds_away']),
    async extras(get, id) {
      const m = await get(`/matches/${id}/`);
      const maps = Array.isArray(m?.maps) ? m.maps : [];
      return {
        groups: [],
        tables: maps.length ? [{ title: 'Mapas', columns: [['map', 'Mapa'], ['h', 'Casa'], ['a', 'Fora']],
          rows: maps.map((x) => ({ map: String(first(x.map, x.map_name, '')), h: first(x.home_rounds, ''), a: first(x.away_rounds, '') })) }] : [],
        detail: m?.best_of ? `Melhor de ${m.best_of}` : null,
      };
    },
    async insights(api, row, ids) {
      const [st, pred] = await Promise.all([
        api.get(`/matches/${ids.ext}/stats/`).catch(() => null),
        api.cached('pred', 10 * 60_000, () => api.get('/predictions/', { upcoming: true, limit: 200 })).catch(() => null),
      ]);
      const teams = Array.isArray(st?.teams) ? st.teams : [];
      const t = (id, i) => teams.find((x) => toInt(x.team?.id) === id) || teams[i] || null;
      const [th, ta] = [t(ids.home, 0), t(ids.away, 1)];
      const hh = st?.head_to_head;
      const compare = [
        ['Mapas ganhos (%)', th?.map_winrate, ta?.map_winrate], ['Rondas ganhas (%)', th?.round_winrate_all, ta?.round_winrate_all],
        ['Rondas ganhas como T (%)', th?.round_winrate_t, ta?.round_winrate_t], ['Rondas ganhas como CT (%)', th?.round_winrate_ct, ta?.round_winrate_ct],
        ['Pistol rounds (%)', th?.pistol_winrate, ta?.pistol_winrate], ['K/D', th?.kd_ratio, ta?.kd_ratio], ['Dano médio (ADR)', th?.avg_damage, ta?.avg_damage],
      ].filter(([, a, b]) => num(a) !== null && num(b) !== null).map(([l, a, b]) => [l, num(a), num(b)]);
      const h2h = hh || compare.length ? {
        total: toInt(hh?.total_matches) ?? 0, homeWins: toInt(hh?.home_wins) ?? 0, awayWins: toInt(hh?.away_wins) ?? 0, draws: null,
        meetings: streakRows(hh?.recent_matches, ids.home).slice(0, 10),
        homeFormLetters: formLetters(th?.form_results), awayFormLetters: formLetters(ta?.form_results), compare,
      } : null;
      const p = listOf(pred).find((x) => String(first(x.match_id, x.match?.id)) === row.external_id);
      return { h2h, prediction: predictionFrom(p, ids.home) };
    },
  },
};

const BASKET_COLS = [['played', 'J'], ['won', 'V'], ['lost', 'D'], ['winPct', '% vit.']];
const HOCKEY_COLS = [['played', 'J'], ['won', 'V'], ['otWins', 'VP'], ['otLosses', 'DP'], ['lost', 'D'], ['goals', 'Golos'], ['points', 'Pts']];

/** /standings/ of basketball or hockey → { rows, columns } with the two teams highlighted by id. */
export function standingsFrom(data, teamIds, columns) {
  const rows = listOf(first(data?.standings, data?.results, data)).map((r) => ({
    position: toInt(first(r.position, r.rank)), teamId: toInt(first(r.team?.id, r.team_id)), team: String(first(nm(r.team), r.team_name, '')),
    played: toInt(first(r.played, r.matches_played, r.games_played)), won: toInt(first(r.wins, r.won)), lost: toInt(first(r.losses, r.lost)),
    otWins: toInt(r.overtime_wins), otLosses: toInt(r.overtime_losses),
    winPct: num(r.win_pct) !== null ? `${Math.round(num(r.win_pct) * 1000) / 10}%` : null,
    goals: toInt(r.goals_scored) !== null ? `${r.goals_scored}:${r.goals_conceded}` : null,
    // The table keeps the provider's W/D/L letters (the page translates them).
    points: toInt(first(r.points, r.pts)), form: formLetters(first(r.form_string, r.form)).map((c) => ({ V: 'W', D: 'L', E: 'D' }[c])).join('') || null, zone: null,
  })).filter((r) => r.team);
  return rows.length ? { name: null, rows, zones: [], columns: columns.map(([key, label]) => ({ key, label })), teamIds } : null;
}

/** Basketball pregame report → the head-to-head/form block (shape read tolerantly). */
function pregameH2H(pre, homeForm, awayForm) {
  if (!pre || typeof pre !== 'object') return homeForm.length || awayForm.length ? { total: 0, homeWins: 0, awayWins: 0, draws: null, meetings: [], homeFormLetters: homeForm, awayFormLetters: awayForm } : null;
  const hh = first(pre.head_to_head, pre.h2h) || {};
  const standing = (k) => first(pre.standings?.[k], pre[`${k}_standing`], pre[`${k}_team`]?.standing) || {};
  const compare = [
    ['Posição na tabela', standing('home').position, standing('away').position],
    ['Vitórias - derrotas', standing('home').wins !== undefined ? `${standing('home').wins}-${standing('home').losses}` : null, standing('away').wins !== undefined ? `${standing('away').wins}-${standing('away').losses}` : null],
  ].filter(([, a, b]) => a !== undefined && a !== null && b !== undefined && b !== null);
  const meetings = listOf(first(hh.recent_matches, hh.matches)).map((r) => ({
    date: first(r.date, r.event_date) || null, home: nm(first(r.home_team, r.home)) || '', away: nm(first(r.away_team, r.away)) || '', competition: '',
    score: toInt(r.home_score) !== null ? `${r.home_score}-${r.away_score}` : first(r.score, null), won: null,
  })).slice(0, 10);
  if (!meetings.length && !compare.length && !homeForm.length && !awayForm.length && !toInt(hh.total_matches)) return null;
  return {
    total: toInt(hh.total_matches) ?? meetings.length, homeWins: toInt(hh.home_wins) ?? 0, awayWins: toInt(hh.away_wins) ?? 0, draws: null,
    meetings, homeFormLetters: homeForm, awayFormLetters: awayForm, compare,
  };
}

/** Per-quarter / full-game team stats → [{ set, stats }] (the tennis per-set shape). */
function statGroups(data) {
  if (!data || typeof data !== 'object') return [];
  const raw = first(data.periods, data.quarters, data.statistics, data.stats);
  const groups = [];
  const push = (label, x) => {
    const a = first(x?.home, x?.home_team) || {};
    const b = first(x?.away, x?.away_team) || {};
    const stats = Object.keys(a).filter((k) => num(a[k]) !== null && num(b[k]) !== null)
      .map((k) => ({ key: k, label: k.replace(/_/g, ' ').replace(/\bpct\b|percentage/g, '(%)').replace(/^./, (c) => c.toUpperCase()), home: num(a[k]), away: num(b[k]), unit: /pct|percentage/.test(k) ? '%' : '' }));
    if (stats.length) groups.push({ set: label, stats });
  };
  if (data.home || data.full_game || data.game) push('Jogo', first(data.full_game, data.game, data));
  if (Array.isArray(raw)) raw.forEach((x, i) => push(`${first(x.period, x.quarter, i + 1)}.º período`, x));
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, x]) => push(/^(all|game|total|full)/i.test(k) ? 'Jogo' : `${k}.º período`, x));
  return groups;
}

// ---------- feed engine ----------

export function createSportFeed(db, sport, {
  token, baseUrl = 'https://sports.bzzoiro.com', days = 3, maxOddsCalls = 40, maxResultCalls = 40, maxLiveOddsCalls = 25,
  liveOddsMaxAge = 180, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const spec = SPORT_SPECS[sport];
  if (!spec) throw new Error(`Desporto desconhecido: ${sport}`);
  const SOURCE = spec.source;
  const state = { enabled: !!token, running: false, last: {}, lastError: null, lastErrorAt: null, addonMissing: false };
  const root = `${baseUrl.replace(/\/+$/, '')}${spec.path}`;

  async function get(p, params = {}) {
    const url = new URL(`${root}${p}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, { headers: { Authorization: `Token ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 402) {
      state.addonMissing = true;
      throw new Error(`A conta não tem o Sports Addon (necessário para ${spec.name}).`);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()).slice(0, 200); } catch { /* not JSON */ }
      throw new Error(`HTTP ${res.status} em ${url.pathname} ${detail}`.trim());
    }
    state.addonMissing = false;
    return res.json();
  }

  async function getAll(p, params, maxPages = 10) {
    const out = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await get(p, { ...params, limit: 200, offset: page * 200 });
      const rows = listOf(data);
      out.push(...rows);
      if (rows.length < 200 || !data?.next) break;
    }
    return out;
  }

  const cache = new Map();
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 800) cache.delete(cache.keys().next().value);
    return data;
  };

  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');
  const suspend = (id) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(id);
  const upsertSel = db.prepare(
    `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
  );

  function upsert(m) {
    const row = findEvent.get(SOURCE, m.externalId);
    const ts = nowIso();
    const ext = (v) => (v ? String(v) : null);
    if (!row) {
      if (m.status !== 'scheduled' && m.status !== 'live') return null;
      db.prepare(
        `INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id,
                             home_team_ext, away_team_ext, league_ext, home_country, away_country, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(sport, m.competition.slice(0, 80), m.home, m.away, m.startTime, SOURCE, m.externalId,
        ext(m.homeId), ext(m.awayId), ext(m.competitionId), spec.players ? m.homeCountry : null, spec.players ? m.awayCountry : null, ts, ts);
      return { ...findEvent.get(SOURCE, m.externalId), created: true };
    }
    if (row.status === 'finished' || row.status === 'cancelled') return { ...row, closed: true };
    db.prepare(
      `UPDATE events SET competition = ?, home = ?, away = ?, start_time = ?, league_ext = COALESCE(?, league_ext), updated_at = ? WHERE id = ?`
    ).run(m.competition.slice(0, 80), m.home, m.away, m.startTime, ext(m.competitionId), ts, row.id);
    return findEvent.get(SOURCE, m.externalId);
  }

  /** Writes a full price set: markets missing from it are closed. */
  function writePrices(eventId, prices) {
    db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);
    for (const [key, v] of Object.entries(prices)) {
      const [market, code] = key.split('|');
      upsertSel.run(eventId, market, code, v);
    }
  }

  const voidEvent = (row, note) => {
    db.prepare("UPDATE events SET status = 'cancelled', clock = ?, updated_at = ? WHERE id = ?").run(note.slice(0, 60), nowIso(), row.id);
    return settleEvent(db, row.id, { source: 'feed', note });
  };

  /** Final state from the provider → settle. Returns the bets settled. */
  function applyTerminal(row, m) {
    if (m.status === 'walkover') return tx(db, () => voidEvent(row, 'Walkover — apostas anuladas'));
    if (m.status === 'cancelled') return tx(db, () => voidEvent(row, 'Cancelado — apostas anuladas'));
    if (m.status === 'postponed') {
      tx(db, () => {
        suspend(row.id);
        db.prepare("UPDATE events SET status = 'scheduled', clock = NULL, start_time = ?, postponed_at = COALESCE(postponed_at, ?), updated_at = ? WHERE id = ?")
          .run(m.startTime, nowIso(), nowIso(), row.id);
      });
      return 0;
    }
    if (m.status !== 'finished' && m.status !== 'retired') return 0;
    let home = m.homeScore;
    let away = m.awayScore;
    const winner = m.winnerId !== null && m.winnerId === m.homeId ? '1' : m.winnerId !== null && m.winnerId === m.awayId ? '2' : null;
    if (m.status === 'retired' && !winner) return 0;
    if (home === null || away === null) {
      if (!winner) return 0; // no result yet: ask again on the next pass
      [home, away] = winner === '1' ? [1, 0] : [0, 1];
    }
    // The player/team the provider names as winner wins the match market (retirement, awarded).
    if (winner === '1' && home <= away) home = away + 1;
    if (winner === '2' && away <= home) away = home + 1;
    const regulation = sport === 'hoquei' && m.regHome !== null && m.regHome !== undefined;
    const clock = (m.status === 'retired' ? `Desistência${m.detail ? ` · ${m.detail}` : ''}` : m.detail || 'Final').slice(0, 60);
    return tx(db, () => {
      db.prepare(`UPDATE events SET status = 'finished', home_score = ?, away_score = ?, reg_home_score = ?, reg_away_score = ?, result = ?,
                   clock = ?, updated_at = ? WHERE id = ?`)
        .run(home, away, regulation ? m.regHome : null, regulation ? m.regAway : null, home > away ? '1' : home < away ? '2' : 'X', clock, nowIso(), row.id);
      return settleEvent(db, row.id, { source: 'feed' });
    });
  }

  async function syncFixtures() {
    const from = new Date();
    const to = new Date(Date.now() + days * 86_400_000);
    const games = (await getAll(spec.list, { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) }))
      .map((g) => spec.normalize(g)).filter(Boolean);
    let created = 0;
    for (const m of games) {
      tx(db, () => {
        const row = upsert(m);
        if (row?.created) created += 1;
      });
    }
    const odds = await syncOdds();
    return { games: games.length, created, ...odds };
  }

  /** Per-game odds for upcoming games, soonest first, each refreshed every 10 min (3 min in the last hour). */
  async function syncOdds() {
    const now = Date.now();
    const rows = db.prepare(
      `SELECT * FROM events WHERE source = ? AND status = 'scheduled' AND start_time > ? AND postponed_at IS NULL
         AND (odds_next_at IS NULL OR odds_next_at <= ?) ORDER BY start_time LIMIT ?`
    ).all(SOURCE, new Date(now).toISOString(), new Date(now).toISOString(), maxOddsCalls);
    let priced = 0;
    for (const row of rows) {
      try {
        const prices = spec.prices(await get(`${spec.list}${encodeURIComponent(row.external_id)}/odds/`));
        const soon = new Date(row.start_time).getTime() - now < 3_600_000;
        tx(db, () => {
          writePrices(row.id, prices);
          db.prepare('UPDATE events SET odds_next_at = ? WHERE id = ?').run(new Date(now + (soon ? 3 : 10) * 60_000).toISOString(), row.id);
        });
        if (Object.keys(prices).length) priced += 1;
      } catch (err) {
        log(`${spec.name} odds ${row.external_id}: ${err.message}`);
        db.prepare('UPDATE events SET odds_next_at = ? WHERE id = ?').run(new Date(now + 10 * 60_000).toISOString(), row.id);
      }
    }
    return { oddsChecked: rows.length, priced };
  }

  async function syncLive() {
    const live = listOf(await get(`${spec.list}live/`)).map((g) => spec.normalize(g)).filter(Boolean);
    let updated = 0;
    for (const m of live) {
      const terminal = tx(db, () => {
        const row = upsert({ ...m, status: m.status === 'scheduled' ? 'live' : m.status });
        if (!row || row.closed) return null;
        if (!['live', 'scheduled'].includes(m.status)) return row;
        db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, postponed_at = NULL, updated_at = ? WHERE id = ?")
          .run(m.homeScore ?? 0, m.awayScore ?? 0, m.clock, nowIso(), row.id);
        updated += 1;
        return null;
      });
      if (terminal) applyTerminal(terminal, m);
    }
    const inPlay = await syncLiveOdds();
    return { live: live.length, updated, ...inPlay };
  }

  /**
   * In-play prices: the bookmakers' prices updated in the last LIVE_ODDS_MAX_AGE_SECONDS (and after
   * kick-off). With none the market stays closed; betting.js refuses a bet once live_odds_at ages.
   */
  async function syncLiveOdds() {
    const rows = db.prepare(`SELECT * FROM events WHERE source = ? AND status = 'live' ORDER BY start_time LIMIT ?`).all(SOURCE, maxLiveOddsCalls);
    let open = 0;
    for (const row of rows) {
      try {
        const since = Math.max(Date.now() - liveOddsMaxAge * 1000, new Date(row.start_time).getTime());
        const prices = spec.prices(await get(`${spec.list}${encodeURIComponent(row.external_id)}/odds/`), { since });
        tx(db, () => {
          if (!Object.keys(prices).length) {
            suspend(row.id);
            db.prepare('UPDATE events SET live_odds_at = NULL WHERE id = ?').run(row.id);
            return;
          }
          writePrices(row.id, prices);
          db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(nowIso(), row.id);
          open += 1;
        });
      } catch (err) {
        log(`${spec.name} odds ao vivo ${row.external_id}: ${err.message}`);
        suspend(row.id);
      }
    }
    return { liveOddsChecked: rows.length, liveMarketsOpen: open };
  }

  async function syncResults() {
    const rows = db.prepare(
      `SELECT * FROM events WHERE source = ? AND status IN ('scheduled', 'live') AND start_time <= ? ORDER BY start_time LIMIT ?`
    ).all(SOURCE, nowIso(), maxResultCalls);
    let settledEvents = 0;
    let settledBets = 0;
    for (const row of rows) {
      try {
        const m = spec.normalize(await get(`${spec.list}${encodeURIComponent(row.external_id)}/`));
        if (!m) continue;
        if (['finished', 'retired', 'walkover', 'cancelled'].includes(m.status)) {
          const n = applyTerminal(row, m);
          if (db.prepare('SELECT status FROM events WHERE id = ?').get(row.id).status !== row.status) { settledEvents += 1; settledBets += n; }
        } else if (m.status === 'postponed') applyTerminal(row, m);
        else if (m.status === 'scheduled' && (m.startTime !== row.start_time || row.postponed_at)) {
          db.prepare('UPDATE events SET start_time = ?, postponed_at = NULL, updated_at = ? WHERE id = ?').run(m.startTime, nowIso(), row.id);
        }
      } catch (err) {
        log(`${spec.name} ${row.external_id}: ${err.message}`);
      }
    }
    return { checked: rows.length, settledEvents, settledBets };
  }

  async function run(kind, fn) {
    if (!state.enabled) return { skipped: 'sem token' };
    try {
      const result = await fn();
      state.last[kind] = { at: nowIso(), ...result };
      return result;
    } catch (err) {
      state.lastError = `${kind}: ${err.message}`;
      state.lastErrorAt = nowIso();
      log(state.lastError);
      return { error: err.message };
    }
  }

  async function syncAll() {
    if (state.running) return { skipped: 'sincronização em curso' };
    state.running = true;
    try {
      return { fixtures: await run('fixtures', syncFixtures), live: await run('live', syncLive), results: await run('results', syncResults) };
    } finally {
      state.running = false;
    }
  }

  function start({ liveMs = 30_000, fixturesMs = 10 * 60_000, resultsMs = 2 * 60_000, oddsMs = 3 * 60_000 } = {}) {
    if (!state.enabled) return () => {};
    const guard = (kind, fn) => async () => {
      if (state.running || (state.addonMissing && kind !== 'fixtures')) return;
      state.running = true;
      try { await run(kind, fn); } finally { state.running = false; }
    };
    const timers = [
      setInterval(guard('live', syncLive), liveMs),
      setInterval(guard('fixtures', syncFixtures), fixturesMs),
      setInterval(guard('odds', syncOdds), oddsMs),
      setInterval(guard('results', syncResults), resultsMs),
    ];
    syncAll();
    return () => timers.forEach(clearInterval);
  }

  const status = () => ({
    sport, name: spec.name, enabled: state.enabled, running: state.running, addonMissing: state.addonMissing,
    last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    events: db.prepare('SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status').all(SOURCE)
      .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
  });

  function matchExtras(externalId, { live = false } = {}) {
    return cached(`x:${externalId}`, live ? 30_000 : 5 * 60_000, async () => {
      const x = await spec.extras(get, encodeURIComponent(externalId));
      return { sets: x.groups || [], tables: x.tables || [], setsDetail: x.detail || null };
    });
  }

  function matchInsights(row) {
    const ids = { ext: encodeURIComponent(row.external_id), home: toInt(row.home_team_ext), away: toInt(row.away_team_ext) };
    return cached(`i:${row.external_id}`, 10 * 60_000, async () => ({
      h2h: null, prediction: null, standings: null, rankings: null,
      ...(await spec.insights({ get, cached }, row, ids)),
      homeTeamId: ids.home, awayTeamId: ids.away,
    }));
  }

  return { source: SOURCE, syncFixtures, syncOdds, syncLive, syncLiveOdds, syncResults, syncAll, start, status, matchExtras, matchInsights };
}

/** Badge from the provider's image proxy for a team of this source (null for player sports). */
export function sportTeamImage(source, id) {
  const spec = Object.values(SPORT_SPECS).find((s) => s.source === source);
  if (!spec?.img || !/^\d+$/.test(String(id || ''))) return null;
  return `https://sports.bzzoiro.com/img/${spec.img}/${id}/?bg=transparent`;
}
