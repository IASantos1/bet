#!/usr/bin/env node
/**
 * sync-events-local.js
 *
 * Objetivo:
 * - Buscar eventos (fixtures/games) da API-Sports (API-Football e outras)
 * - Buscar odds + mercados reais da odds-api.io (v3)
 * - Fazer upsert direto no D1 local (wrangler --persist-to)
 *
 * Requisitos (.dev.vars):
 * - API_SPORTS_KEY=...
 * - ODDS_API_KEY=...
 * - API_SPORTS_SEASON=2025 (opcional)
 * - ODDS_API_BOOKMAKERS=Bet365,1xbet,... (opcional)
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import process from 'process';
import crypto from 'crypto';
import { setTimeout as delay } from 'timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadDevVars() {
  const varsPath = path.join(ROOT, '.dev.vars');
  if (!existsSync(varsPath)) return;
  const txt = readFileSync(varsPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const existing = String(process.env[k] || '').trim();
    const isPlaceholder = (s) => {
      const u = String(s || '').toUpperCase();
      return (
        !u ||
        u.includes('SUA_KEY') ||
        u.includes('YOUR_KEY') ||
        u.includes('YOUR_API_KEY') ||
        u.includes('CHAVE_AQUI')
      );
    };
    if (!existing || isPlaceholder(existing)) process.env[k] = v;
  }
}

loadDevVars();

const API_SPORTS_KEY = process.env.API_SPORTS_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const API_SPORTS_SEASON = process.env.API_SPORTS_SEASON || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token';
const WORKER_BASE = process.env.WORKER_BASE || 'http://127.0.0.1:8788';

const PERSIST_TO = './.wrangler-local';
const DB_NAME = 'bet62-db';
const ODDS_API_BASE = 'https://api.odds-api.io/v3';
const BOOKMAKERS = process.env.ODDS_API_BOOKMAKERS || 'Bet365,1xbet,Betano,888Sport,SportingBet';

if (!API_SPORTS_KEY) {
  console.error('[sync] ERROR: API_SPORTS_KEY not set. Check your .dev.vars file.');
  process.exit(1);
}
const hasRealOddsApiKey =
  !!ODDS_API_KEY &&
  !String(ODDS_API_KEY).toUpperCase().includes('SUA_KEY') &&
  !String(ODDS_API_KEY).toUpperCase().includes('YOUR_KEY') &&
  !String(ODDS_API_KEY).toUpperCase().includes('CHAVE_AQUI');
if (!hasRealOddsApiKey) {
  console.warn('[sync] WARNING: ODDS_API_KEY inválida/placeholder. Vou importar só eventos (sem odds/mercados).');
}

const BLOCKED_KEYWORDS = [
  'women', 'woman', 'female', 'femenin', 'feminin', 'femenil', 'ladies', 'dames',
  'mulheres', 'feminino', ' w ', '(w)', '- w', 'frauen', 'féminin',
  'u16', 'u17', 'u18', 'u19', 'u20', 'u21', 'u22', 'u23',
  'under-16', 'under-17', 'under-18', 'under-19', 'under-20', 'under-21', 'under-23',
  'youth', 'junior', 'sub-17', 'sub-18', 'sub-20', 'sub-23',
  'reserve', 'reserva', 'reserves', 'filiali',
  'virtual', 'esport', 'e-sport', 'cyber', 'simulated', 'test league',
  'amateur', 'amador', 'regional', 'futsal', 'beach', 'indoor', 'sala',
  '5x5', '4x4', '3x3', 'setka', 'tt-cup', 'masters.',
  'student', 'university', 'college', 'school',
  'friendly', 'amistoso', 'cup alagoas', 'copa alagoas',
];

function isBlocked(league) {
  const l = String(league || '').toLowerCase();
  return BLOCKED_KEYWORDS.some((kw) => l.includes(kw));
}

const SPORT_CONFIG = {
  soccer: { base: 'https://v3.football.api-sports.io', endpoint: '/fixtures', dateQuery: (date) => `date=${date}${API_SPORTS_SEASON ? `&season=${encodeURIComponent(API_SPORTS_SEASON)}` : ''}` },
  basketball: { base: 'https://v1.basketball.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  baseball: { base: 'https://v1.baseball.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  'ice-hockey': { base: 'https://v1.hockey.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  handball: { base: 'https://v1.handball.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  volleyball: { base: 'https://v1.volleyball.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  rugby: { base: 'https://v1.rugby.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  'american-football': { base: 'https://v1.american-football.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
  nba: { base: 'https://v2.nba.api-sports.io', endpoint: '/games', dateQuery: (date) => `date=${date}` },
};

function getDateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function normTeam(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|ss|cd|sd|ud|rcd|bsc|fk|sk|nk|ok|if|bf|bk|hk|ik|vfb|vfl|tsg|rsg|sv|rsc|rsca|krc|kjk|kaa|ksk|kvo|kvv|kvc|mvv|pec|nac|ajax|psv|ado|az|fci|fcn|fca|fcb|fct|fcg|fcm|fcr|fcs|fcv|fcz|sfc|bfc|gfc|dfc|nfc|mfc|wfc|ifc|jfc|rfc|cfc|lfc|efc|tfc|pfc|hfc|ufc|qfc|ofc|afc|bvb|rbh|rbl|m\\.s\\.k\\.|m\\.s\\.v\\.|m\\.s\\.g\\.|v\\.v\\.v)\\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a, b) {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(' ').filter((w) => w.length > 3);
  const wb = nb.split(' ').filter((w) => w.length > 3);
  return wa.length > 0 && wb.length > 0 && wa.some((w) => wb.includes(w));
}

async function apiSportsGet(url) {
  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_SPORTS_KEY },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.json();
}

async function oddsApiGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.json();
}

async function oddsApiSportsList() {
  const url = `${ODDS_API_BASE}/sports`;
  const data = await oddsApiGet(url);
  if (!Array.isArray(data)) return [];
  return data.map((x) => ({ name: String(x?.name || ''), slug: String(x?.slug || '') })).filter((x) => x.name && x.slug);
}

function normKey(input) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function resolveOddsSportSlug(sports, sport) {
  const aliases = {
    soccer: 'football',
    football: 'football',
    'ice-hockey': 'hockey',
    hockey: 'hockey',
    'american-football': 'american-football',
    nfl: 'american-football',
    mma: 'mma',
    ufc: 'mma',
    'formula-1': 'formula-1',
    f1: 'formula-1',
    afl: 'afl',
  };
  const want = aliases[String(sport || '').toLowerCase()] || String(sport || '').toLowerCase();
  const wantKey = normKey(want);
  const exact = sports.find((s) => normKey(s.slug) === wantKey || normKey(s.name) === wantKey);
  if (exact) return exact.slug;
  const partial = sports.find((s) => normKey(s.slug).includes(wantKey) || wantKey.includes(normKey(s.slug)));
  return partial ? partial.slug : want;
}

function pickNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMarketKey(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'ml' || n.includes('moneyline') || n.includes('match winner') || n.includes('1x2') || n.includes('h2h') || n === 'result') return 'h2h';
  if (n.includes('double chance')) return 'double_chance';
  if (n.includes('draw no bet')) return 'dnb';
  if (n.includes('both teams to score')) return 'btts';
  if (n.includes('spread') || n.includes('asian handicap') || (n.includes('handicap') && !n.includes('corner') && !n.includes('card'))) return 'handicap';
  if (n.includes('totals') || n.includes('goals over/under') || n.includes('over/under') || n.includes('total goals')) return 'totals';
  if (n.includes('half time') && (n.includes('result') || n.includes('ml'))) return 'h2h_ht';
  if (n.includes('totals ht')) return 'totals_ht';
  if (n.includes('ht/ft') || (n.includes('half') && n.includes('full') && n.includes('time'))) return 'half_time_full_time';
  if (n.includes('correct score') || n.includes('exact score')) return 'correct_score';
  if (n.includes('next goal')) return 'next_goal';
  if (n.includes('team to score first') || n.includes('first team to score') || n.includes('first to score')) return 'team_to_score_first';
  if (n.includes('corners') && (n.includes('over/under') || n.includes('totals'))) return 'corners_total';
  if (n.includes('corner') && n.includes('handicap')) return 'corner_handicap';
  if (n.includes('cards') && (n.includes('over/under') || n.includes('totals'))) return 'cards_total';
  if (n.includes('run line')) return 'run_line';
  if (n.includes('puck line')) return 'puck_line';
  return `special_${normKey(n).slice(0, 32) || 'misc'}`;
}

function pushSel(list, id, label, odd) {
  if (!(odd > 1)) return;
  list.push({ id, label, odd });
}

function payloadToLegacyMarkets(payload, resolvedBooks) {
  const result = {};
  const mk = (k) => {
    if (!result[k]) result[k] = [];
    return result[k];
  };

  const outByKey = new Map();
  const limitPerMarket = 80;
  const books = resolvedBooks
    ? resolvedBooks.split(',').map((s) => s.trim()).filter(Boolean)
    : Object.keys(payload?.bookmakers || {});
  const bmObj = payload?.bookmakers || {};
  const bmKeys = Object.keys(bmObj);
  const getBookArr = (book) => {
    if (Array.isArray(bmObj?.[book])) return bmObj[book];
    const norm = normKey(book);
    const alt = bmKeys.find((k) => normKey(k) === norm);
    if (alt && Array.isArray(bmObj?.[alt])) return bmObj[alt];
    return null;
  };

  for (const book of books) {
    const arr = getBookArr(book);
    if (!arr) continue;
    for (const m of arr) {
      const rawName = String(m?.name || m?.key || '');
      const key = toMarketKey(rawName);
      if (!outByKey.has(key)) outByKey.set(key, { key, selections: [] });
      const market = outByKey.get(key);
      if (market.selections.length >= limitPerMarket) continue;

      if (key === 'h2h' || key === 'h2h_ht') {
        const o = Array.isArray(m?.odds) && m.odds.length ? m.odds[0] : null;
        if (o) {
          pushSel(market.selections, 'sel_home', 'Casa', pickNum(o.home));
          pushSel(market.selections, 'sel_draw', 'Empate', pickNum(o.draw));
          pushSel(market.selections, 'sel_away', 'Fora', pickNum(o.away));
        }
      } else if (key === 'double_chance') {
        const o = Array.isArray(m?.odds) && m.odds.length ? m.odds[0] : null;
        if (o) {
          pushSel(market.selections, 'sel_1x', '1X', pickNum(o['1X'] ?? o['1x'] ?? o['1x2'] ?? o['1X2']));
          pushSel(market.selections, 'sel_x2', 'X2', pickNum(o['X2'] ?? o['x2']));
          pushSel(market.selections, 'sel_12', '12', pickNum(o['12']));
        }
      } else if (key === 'dnb') {
        const o = Array.isArray(m?.odds) && m.odds.length ? m.odds[0] : null;
        if (o) {
          pushSel(market.selections, 'sel_home', 'Casa', pickNum(o.home));
          pushSel(market.selections, 'sel_away', 'Fora', pickNum(o.away));
        }
      } else if (key === 'btts') {
        const o = Array.isArray(m?.odds) && m.odds.length ? m.odds[0] : null;
        if (o) {
          pushSel(market.selections, 'sel_yes', 'Sim', pickNum(o.yes));
          pushSel(market.selections, 'sel_no', 'Não', pickNum(o.no));
        }
      } else if (key === 'totals' || key === 'totals_ht') {
        if (Array.isArray(m?.odds)) {
          for (const line of m.odds) {
            if (market.selections.length >= limitPerMarket) break;
            const point = line?.hdp;
            const over = pickNum(line?.over);
            const under = pickNum(line?.under);
            if (point !== undefined && (over > 1 || under > 1)) {
              pushSel(market.selections, `sel_over_${point}`, `Over ${point}`, over);
              pushSel(market.selections, `sel_under_${point}`, `Under ${point}`, under);
            }
          }
        }
      } else if (key === 'handicap') {
        if (Array.isArray(m?.odds)) {
          for (const line of m.odds) {
            if (market.selections.length >= limitPerMarket) break;
            const point = line?.hdp;
            const h = pickNum(line?.home);
            const a = pickNum(line?.away);
            if (point !== undefined && (h > 1 || a > 1)) {
              pushSel(market.selections, `sel_home_${point}`, `Casa ${point}`, h);
              pushSel(market.selections, `sel_away_${point}`, `Fora ${point}`, a);
            }
          }
        }
      } else {
        if (Array.isArray(m?.odds)) {
          for (const o of m.odds) {
            if (market.selections.length >= limitPerMarket) break;
            const label = String(o?.label || o?.name || o?.outcome || o?.selection || '').trim();
            const price =
              pickNum(o?.price) ||
              pickNum(o?.odd) ||
              pickNum(o?.value) ||
              pickNum(o?.under) ||
              pickNum(o?.over) ||
              pickNum(o?.home) ||
              pickNum(o?.away);
            if (label && price > 1) pushSel(market.selections, `sel_${normKey(label).slice(0, 24)}`, label, price);
          }
        }
      }
    }
  }

  const markets = Array.from(outByKey.entries()).filter(([, v]) => v.selections.length > 0);
  let primary = { home: 0, draw: 0, away: 0 };
  for (const [key, m] of markets) {
    const arr = mk(key);
    for (const s of m.selections) {
      if (arr.length >= 120) break;
      arr.push({ name: s.label, label: s.label, price: s.odd, odd: s.odd });
    }
    if (key === 'h2h') {
      const pick = (lbl) => m.selections.find((s) => String(s.label).toLowerCase() === lbl)?.odd || 0;
      primary = { home: pick('casa'), draw: pick('empate'), away: pick('fora') };
    }
  }

  return { markets: result, primary };
}

function parseArgs() {
  const out = { daysBack: 1, daysAhead: 2, sports: Object.keys(SPORT_CONFIG), limitPerSport: 120 };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--daysBack') out.daysBack = Number(process.argv[++i] || out.daysBack);
    else if (a === '--daysAhead') out.daysAhead = Number(process.argv[++i] || out.daysAhead);
    else if (a === '--sports') out.sports = String(process.argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limitPerSport') out.limitPerSport = Number(process.argv[++i] || out.limitPerSport);
  }
  out.daysBack = Number.isFinite(out.daysBack) ? out.daysBack : 1;
  out.daysAhead = Number.isFinite(out.daysAhead) ? out.daysAhead : 2;
  out.limitPerSport = Number.isFinite(out.limitPerSport) ? out.limitPerSport : 120;
  return out;
}

function toSqlStr(val) {
  if (val == null) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function toSqlNum(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0';
  return String(n);
}

function npX() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function wrangler(args) {
  const res = spawnSync(npX(), ['wrangler', ...args], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`[sync] wrangler failed: ${args.join(' ')}`);
  }
}

function d1Execute(sql) {
  wrangler(['d1', 'execute', DB_NAME, '--local', '--persist-to', PERSIST_TO, '--command', sql]);
}

async function upsertEventsViaWorker(events) {
  const waitForWorker = async () => {
    for (let i = 0; i < 25; i++) {
      try {
        const r = await fetch(`${WORKER_BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (r.ok) return;
      } catch {
        // ignore
      }
      await delay(250);
    }
    throw new Error(`[sync] Worker not reachable at ${WORKER_BASE}. Run: npm run worker`);
  };

  await waitForWorker();

  let lastErr = null;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(`${WORKER_BASE}/api/dev/upsert-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`[sync] worker upsert failed: HTTP ${res.status} ${t}`);
      }
      return res.json().catch(() => ({}));
    } catch (e) {
      lastErr = e;
      await delay(400);
    }
  }
  throw lastErr || new Error('[sync] worker upsert failed');
}

function buildExternalId(sport, id) {
  return `${sport}_${id}`;
}

function toDbDate(isoOrDate) {
  const d = new Date(isoOrDate);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function extractEventFromApiSports(item, sport) {
  if (sport === 'soccer') {
    const home = item.teams?.home?.name || '';
    const away = item.teams?.away?.name || '';
    const league = item.league?.name || '';
    if (!home || !away || !league || isBlocked(league)) return null;
    const dt = item.fixture?.date || '';
    const date = toDbDate(dt);
    const id = String(item.fixture?.id || '');
    if (!id || !date) return null;

    const status = item.fixture?.status?.short || 'NS';
    const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'].includes(status) ? 1 : 0;
    const elapsed = Number(item.fixture?.status?.elapsed || 0) || 0;

    const scoreHome = item.goals?.home ?? null;
    const scoreAway = item.goals?.away ?? null;
    const score = JSON.stringify({ home: scoreHome, away: scoreAway });

    return {
      external_event_id: buildExternalId(sport, id),
      sport,
      league,
      country: item.league?.country || '',
      home_team: home,
      away_team: away,
      team_match: `${home} vs ${away}`,
      event_date: date,
      status,
      is_live: isLive,
      elapsed,
      score,
      home_team_logo: item.teams?.home?.logo || '',
      away_team_logo: item.teams?.away?.logo || '',
      home_odd: 0,
      draw_odd: 0,
      away_odd: 0,
      markets: '{}',
    };
  }

  const g = item;
  const home = g.teams?.home?.name || '';
  const away = g.teams?.away?.name || '';
  const league = g.league?.name || '';
  if (!home || !away || !league || isBlocked(league)) return null;

  const dateVal = g.date || g.time?.date || '';
  const timeVal = g.time?.time || '00:00';
  let dt = '';
  if (dateVal) {
    if (String(dateVal).includes('T') || (String(dateVal).length > 10 && String(dateVal).includes(' '))) {
      dt = toDbDate(dateVal);
    } else {
      dt = toDbDate(`${dateVal}T${timeVal}:00Z`);
    }
  }
  const id = String(g.id || '');
  if (!id || !dt) return null;

  const rawStatus = g.status?.short || g.status?.long || 'NS';
  const liveStatuses = new Set(['LIVE', 'Q1', 'Q2', 'Q3', 'Q4', 'HT', 'OT', 'P1', 'P2', 'P3', 'BT', 'INT', 'IN', 'IN_PROGRESS']);
  const status = String(rawStatus || 'NS');
  const isLive = liveStatuses.has(status) ? 1 : 0;
  const elapsed = Number(g.periods?.current || 0) || 0;

  const scoreHome = g.scores?.home?.total ?? null;
  const scoreAway = g.scores?.away?.total ?? null;
  const score = JSON.stringify({ home: scoreHome, away: scoreAway });

  return {
    external_event_id: buildExternalId(sport, id),
    sport,
    league,
    country: g.country?.name || g.country?.code || '',
    home_team: home,
    away_team: away,
    team_match: `${home} vs ${away}`,
    event_date: dt,
    status,
    is_live: isLive,
    elapsed,
    score,
    home_team_logo: g.teams?.home?.logo || '',
    away_team_logo: g.teams?.away?.logo || '',
    home_odd: 0,
    draw_odd: 0,
    away_odd: 0,
    markets: '{}',
  };
}

function pickBestOddsEvent(ev, oddsEvents) {
  const t = Date.parse(String(ev.event_date).replace(' ', 'T') + 'Z');
  let best = null;
  let bestScore = Infinity;
  for (const o of oddsEvents) {
    const ot = Date.parse(o.date);
    if (!Number.isFinite(ot) || !Number.isFinite(t)) continue;
    const diffMin = Math.abs(ot - t) / 60000;
    if (diffMin > 360) continue;
    const direct = teamsMatch(ev.home_team, o.home) && teamsMatch(ev.away_team, o.away);
    const swapped = teamsMatch(ev.home_team, o.away) && teamsMatch(ev.away_team, o.home);
    if (!direct && !swapped) continue;
    const score = diffMin + (direct ? 0 : 10);
    if (score < bestScore) {
      bestScore = score;
      best = { item: o, swapped };
    }
  }
  return best;
}

function stableId() {
  return crypto.randomBytes(8).toString('hex');
}

function upsertBatchSql(events) {
  const now = new Date().toISOString();
  const rows = events
    .map((e) => `(
      ${toSqlStr(e.external_event_id)},
      ${toSqlStr(e.sport)},
      ${toSqlStr(e.league)},
      ${toSqlStr(e.home_team)},
      ${toSqlStr(e.away_team)},
      ${toSqlStr(e.team_match)},
      ${toSqlStr(e.event_date)},
      ${toSqlStr(e.status)},
      ${toSqlNum(e.is_live)},
      ${toSqlNum(e.home_odd)},
      ${toSqlNum(e.draw_odd)},
      ${toSqlNum(e.away_odd)},
      ${toSqlNum(e.elapsed)},
      ${toSqlStr(e.score)},
      ${toSqlStr(e.markets)},
      ${toSqlStr(e.home_team_logo || '')},
      ${toSqlStr(e.away_team_logo || '')},
      ${toSqlStr(e.country || '')},
      ${toSqlStr(now)}
    )`)
    .join(',');

  return `
    INSERT INTO events (
      external_event_id, sport, league, home_team, away_team, team_match,
      event_date, status, is_live, home_odd, draw_odd, away_odd,
      elapsed, score, markets, home_team_logo, away_team_logo, country, updated_at
    ) VALUES ${rows}
    ON CONFLICT(external_event_id) DO UPDATE SET
      sport           = excluded.sport,
      league          = excluded.league,
      home_team       = excluded.home_team,
      away_team       = excluded.away_team,
      team_match      = excluded.team_match,
      event_date      = excluded.event_date,
      status          = excluded.status,
      is_live         = excluded.is_live,
      home_odd        = CASE WHEN excluded.home_odd > 0   THEN excluded.home_odd   ELSE events.home_odd END,
      draw_odd        = CASE WHEN excluded.draw_odd > 0   THEN excluded.draw_odd   ELSE events.draw_odd END,
      away_odd        = CASE WHEN excluded.away_odd > 0   THEN excluded.away_odd   ELSE events.away_odd END,
      elapsed         = excluded.elapsed,
      score           = CASE WHEN excluded.score    != '{"home":null,"away":null}' THEN excluded.score    ELSE events.score    END,
      markets         = CASE WHEN excluded.markets  != '{}' THEN excluded.markets  ELSE events.markets  END,
      home_team_logo  = CASE WHEN excluded.home_team_logo != '' THEN excluded.home_team_logo ELSE events.home_team_logo END,
      away_team_logo  = CASE WHEN excluded.away_team_logo != '' THEN excluded.away_team_logo ELSE events.away_team_logo END,
      country         = CASE WHEN excluded.country != '' THEN excluded.country ELSE events.country END,
      updated_at      = excluded.updated_at
  `;
}

async function fetchOddsEventsForSport(slug, fromIso, toIso) {
  if (!hasRealOddsApiKey) return [];
  const url =
    `${ODDS_API_BASE}/events?apiKey=${encodeURIComponent(ODDS_API_KEY)}` +
    `&sport=${encodeURIComponent(slug)}` +
    `&status=${encodeURIComponent('pending,live')}` +
    `&from=${encodeURIComponent(fromIso)}` +
    `&to=${encodeURIComponent(toIso)}` +
    `&limit=300` +
    `&bookmakers=${encodeURIComponent(BOOKMAKERS)}`;
  const data = await oddsApiGet(url);
  const list = Array.isArray(data) ? data : (Array.isArray(data?.events) ? data.events : []);
  return list.map((e) => ({
    id: String(e?.id || ''),
    home: String(e?.home || e?.home_team || ''),
    away: String(e?.away || e?.away_team || ''),
    date: String(e?.date || e?.kickoff || e?.start_time || ''),
    league: String(e?.league_name || e?.league || ''),
  })).filter((e) => e.id && e.home && e.away && e.date);
}

async function fetchOddsMarkets(eventId) {
  if (!hasRealOddsApiKey) return null;
  const url =
    `${ODDS_API_BASE}/odds?apiKey=${encodeURIComponent(ODDS_API_KEY)}` +
    `&eventId=${encodeURIComponent(eventId)}` +
    `&bookmakers=${encodeURIComponent(BOOKMAKERS)}`;
  return oddsApiGet(url);
}

async function main() {
  const { daysBack, daysAhead, sports, limitPerSport } = parseArgs();
  const dateOffsets = [];
  for (let d = -Math.abs(daysBack); d <= Math.abs(daysAhead); d++) dateOffsets.push(d);
  const dates = dateOffsets.map((o) => getDateStr(o));

  console.log(`[sync] sports=${sports.join(',')} dates=${dates.join(',')} limitPerSport=${limitPerSport}`);

  const oddsSports = await oddsApiSportsList();
  const oddsSlugBySport = new Map();
  for (const s of sports) {
    oddsSlugBySport.set(s, await resolveOddsSportSlug(oddsSports, s));
  }

  const fromIso = new Date(`${dates[0]}T00:00:00Z`).toISOString();
  const toIso = new Date(`${dates[dates.length - 1]}T23:59:59Z`).toISOString();

  for (const sport of sports) {
    const cfg = SPORT_CONFIG[sport];
    if (!cfg) {
      console.warn(`[sync] skip sport=${sport} (no config)`);
      continue;
    }

    console.log(`\n[sync] ===== ${sport} =====`);
    const allEvents = [];
    for (const date of dates) {
      const url = `${cfg.base}${cfg.endpoint}?${cfg.dateQuery(date)}`;
      try {
        const data = await apiSportsGet(url);
        const items = Array.isArray(data?.response) ? data.response : [];
        for (const item of items) {
          const ev = extractEventFromApiSports(item, sport);
          if (!ev) continue;
          const finished = ['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD', 'FIN', 'FINAL', 'Finished', 'Final', 'Ended', 'AOT', 'AP', 'POST', 'SUSP', 'CANC', 'TBD', 'FT_PEN'].includes(String(ev.status || '').toUpperCase());
          if (finished) continue;
          allEvents.push(ev);
          if (allEvents.length >= limitPerSport) break;
        }
        console.log(`[sync] ${sport} ${date}: ${items.length} items`);
      } catch (e) {
        console.warn(`[sync] ${sport} ${date} error: ${e?.message || e}`);
      }
      if (allEvents.length >= limitPerSport) break;
      await delay(150);
    }

    console.log(`[sync] ${sport}: extracted ${allEvents.length} events`);
    if (allEvents.length === 0) continue;

    const slug = oddsSlugBySport.get(sport) || 'football';
    let oddsEvents = [];
    try {
      oddsEvents = await fetchOddsEventsForSport(slug, fromIso, toIso);
      console.log(`[sync] odds-api.io sport=${slug}: ${oddsEvents.length} candidate events`);
    } catch (e) {
      console.warn(`[sync] odds-api.io events fetch failed (${slug}): ${e?.message || e}`);
    }

    let enriched = 0;
    for (const ev of allEvents) {
      const best = pickBestOddsEvent(ev, oddsEvents);
      if (!best) continue;
      try {
        const payload = await fetchOddsMarkets(best.item.id);
        if (!payload) continue;
        const { markets, primary } = payloadToLegacyMarkets(payload, BOOKMAKERS);
        if (best.swapped && primary.home > 0 && primary.away > 0) {
          const tmp = primary.home;
          primary.home = primary.away;
          primary.away = tmp;
        }
        if (primary.home > 1) {
          ev.home_odd = primary.home;
          ev.draw_odd = primary.draw;
          ev.away_odd = primary.away;
        }
        ev.markets = JSON.stringify(markets || {});
        enriched++;
      } catch (e) {
        console.warn(`[sync] odds fetch failed: ${ev.external_event_id} (${best.item.id}) → ${e?.message || e} [${stableId()}]`);
      }
      await delay(120);
    }

    console.log(`[sync] ${sport}: enriched with odds-api.io markets=${enriched}/${allEvents.length}`);

    const BATCH = 5;
    for (let i = 0; i < allEvents.length; i += BATCH) {
      const batch = allEvents.slice(i, i + BATCH);
      try {
        await upsertEventsViaWorker(batch);
      } catch (e) {
        const sql = upsertBatchSql(batch);
        d1Execute(sql);
      }
      await delay(50);
    }

    console.log(`[sync] ${sport}: upserted ${allEvents.length} rows into D1 local`);
  }

  console.log('\n[sync] done');
}

main().catch((e) => {
  console.error('[sync] fatal:', e);
  process.exit(1);
});
