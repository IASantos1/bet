import type http from 'http';
import type { Duplex } from 'stream';
import WebSocket, { WebSocketServer } from 'ws';
import {
  fetchSportsApiProLive,
  fetchSportsApiProMatchOddsAll,
  fetchSportsApiProMatchOddsLive,
  fetchSportsApiProMatchOddsPreMatch,
  parseSportsApiProMatchOddsPayload,
} from '../services/sportsApiPro';
import { fetchGoalServeLive, fetchGoalServeMatchOddsAll, fetchGoalServeMatchOddsLive, fetchGoalServeMatchOddsPreMatch, fetchGoalServeBallPositions } from '../services/goalserve';

// Same SPORTS_DATA_PROVIDER switch as server/routes/events.ts — keeps this file's live-score/odds
// source in sync with whichever provider that file is using. GoalServe has no push channel at all
// (see the "no upstream WS for GoalServe" note on connectUpstream below), so this only changes
// *what* feeds the polling snapshot loop already built into this file — it doesn't add a second
// transport.
const USE_GOALSERVE = String(process.env.SPORTS_DATA_PROVIDER || '').toLowerCase().trim() === 'goalserve';
const providerFetchLive = USE_GOALSERVE ? fetchGoalServeLive : fetchSportsApiProLive;
const providerFetchOddsAll = USE_GOALSERVE ? fetchGoalServeMatchOddsAll : fetchSportsApiProMatchOddsAll;
const providerFetchOddsLive = USE_GOALSERVE ? fetchGoalServeMatchOddsLive : fetchSportsApiProMatchOddsLive;
const providerFetchOddsPreMatch = USE_GOALSERVE ? fetchGoalServeMatchOddsPreMatch : fetchSportsApiProMatchOddsPreMatch;

type ClientInfo = { ws: WebSocket; sport: string };
type UpstreamInfo = {
  localSport: string;
  wsSport: string;
  ws: WebSocket | null;
  backoffMs: number;
  connecting: boolean;
  stopped: boolean;
  lastMessageAt: number;
  pingTimer: NodeJS.Timeout | null;
};

export function createLiveWs(apiKey: string) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<ClientInfo>();
  const timers = new Map<string, NodeJS.Timeout>();
  const lastSent = new Map<string, number>();
  const upstreams = new Map<string, UpstreamInfo>();
  const SPORTS_DEFAULT = ['soccer', 'tennis', 'basketball', 'ice-hockey', 'baseball'];
  const ODDS_FRESH_TTL_MS = 8_000;
  const ODDS_STALE_TTL_MS = 15 * 60_000;
  const oddsCache = new Map<string, { ts: number; data: any | null }>();
  const oddsInflight = new Map<string, Promise<any | null>>();
  const snapshotCache = new Map<string, { ts: number; live: any[] }>();
  const snapshotInflight = new Set<string>();
  const upstreamState = new Map<string, Map<string, { ts: number; status?: string; statusDesc?: string; home?: number | null; away?: number | null }>>();
  const matchMeta = new Map<string, { ts: number; sport: string; homeTeam: string; awayTeam: string }>();
  const oddsSubscribed = new Map<string, number>();
  let allBootstrapAt = 0;
  let allBootstrapInflight: Promise<void> | null = null;

  // GoalServe-only, soccer-only (see fetchGoalServeBallPositions doc comment): the commentaries
  // feed's own documented refresh period is 30s, well above the 5s livescore poll rate above, so
  // this gets its own slower cache instead of being re-fetched on every snapshot tick.
  const BALL_POSITIONS_TTL_MS = 25_000;
  let ballPositionsCache: { ts: number; data: Map<string, any> } | null = null;
  let ballPositionsInflight: Promise<Map<string, any>> | null = null;

  const getBallPositions = async (): Promise<Map<string, any>> => {
    if (!USE_GOALSERVE) return new Map();
    if (ballPositionsCache && Date.now() - ballPositionsCache.ts < BALL_POSITIONS_TTL_MS) return ballPositionsCache.data;
    if (ballPositionsInflight) return ballPositionsInflight;
    ballPositionsInflight = fetchGoalServeBallPositions(apiKey)
      .then((data) => {
        ballPositionsCache = { ts: Date.now(), data };
        return data;
      })
      .catch(() => ballPositionsCache?.data || new Map())
      .finally(() => {
        ballPositionsInflight = null;
      });
    return ballPositionsInflight;
  };

  /** Attaches a `ball_position` field (pitch x/y of the latest positioned play, per the
   *  GoalServeMatchEvent shape) onto live soccer events, best-effort. No-op for every other
   *  provider/sport — this data only exists in GoalServe's soccer commentaries feed. */
  const attachBallPositions = async (list: any[]): Promise<any[]> => {
    if (!USE_GOALSERVE || !list.length) return list;
    const positions = await getBallPositions().catch(() => new Map());
    if (!positions.size) return list;
    return list.map((e) => {
      if (String(e?.sport || '').toLowerCase() !== 'soccer') return e;
      const id = String(e?.id || '').trim();
      const pos = id ? positions.get(id) : undefined;
      return pos ? { ...e, ball_position: pos } : e;
    });
  };

  const normalize = (s: string) => String(s || '').trim().toLowerCase() || 'all';

  const toWsSport = (localSport: string): string => {
    const s = String(localSport || '').trim().toLowerCase();
    if (s === 'soccer') return 'football';
    if (s === 'ice-hockey') return 'ice-hockey';
    return s;
  };

  const normalizeMatchId = (sport: string, rawId: string): string => {
    const id = String(rawId || '').trim();
    if (!id) return '';
    if (!id.includes('_')) return id;
    const parts = id.split('_').filter(Boolean);
    if (parts.length < 2) return id;
    const last = parts[parts.length - 1] || '';
    const first = parts[0] || '';
    const s = String(sport || '').toLowerCase().trim();
    const f = String(first || '').toLowerCase().trim();
    if (!s) return last || id;
    if (f === s) return last || id;
    if (f === 'football' && s === 'soccer') return last || id;
    if (f === 'soccer' && s === 'football') return last || id;
    if (f === 'hockey' && s === 'ice-hockey') return last || id;
    if (f === 'ice-hockey' && s === 'hockey') return last || id;
    return last || id;
  };

  const ttlOk = (ts: number, ttlMs: number) => ts > 0 && Date.now() - ts < ttlMs;

  const hasOdds = (e: any) => Number(e?.home_odd) > 1 && Number(e?.away_odd) > 1;

  const isBlockedLeague = (leagueName: string, country?: string): boolean => {
    const l = String(leagueName || '').toLowerCase();
    const c = String(country || '').toLowerCase();

    if (
      /\bu\d{2}\b/.test(l) ||
      l.includes('youth') ||
      l.includes('junior') ||
      l.includes('u-17') ||
      l.includes('u-21') ||
      l.includes('u-23') ||
      l.includes('under-17') ||
      l.includes('under-21') ||
      l.includes('under-23') ||
      l.includes('under 17') ||
      l.includes('under 21') ||
      l.includes('under 23') ||
      l.includes('revelacao') ||
      l.includes('primavera') ||
      l.includes('nextgen') ||
      l.includes('reserve') ||
      l.includes('akademi') ||
      l.includes('juvenil') ||
      l.includes('sub-17') ||
      l.includes('sub-20') ||
      l.includes('sub-21') ||
      l.includes('sub-23')
    )
      return true;

    if (l.includes('amateur') || l.includes('amateure') || l.includes('amador') || l.includes('amatör')) return true;

    if (
      l.includes('regionalliga') ||
      l.includes('kakkonen') ||
      l.includes('gamma ethniki') ||
      l.includes('esiliiga') ||
      l.includes('derde divisie') ||
      l.includes('vierde') ||
      l.includes('quinta') ||
      l.includes('6th division') ||
      l.includes('7th division')
    )
      return true;

    if (l.includes('friendly') || l.includes('amistoso') || l.includes('amical') || l.includes('testspiel')) return true;

    const allowed = ['saudi', 'saudi arabia', 'egypt', 'egyptian', 'israel', 'israeli', 'turkey', 'turkish', 'greece', 'greek'];
    const blocked = [
      'qatar',
      'qatari',
      'uae',
      'united arab',
      'kuwait',
      'kuwaiti',
      'bahrain',
      'bahraini',
      'oman',
      'omani',
      'jordan',
      'jordanian',
      'iraq',
      'iraqi',
      'syria',
      'syrian',
      'lebanon',
      'lebanese',
      'palestine',
      'palestinian',
      'yemen',
      'yemeni',
      'iran',
      'iranian',
      'libya',
      'libyan',
      'algeria',
      'algerian',
      'morocco',
      'moroccan',
      'tunisia',
      'tunisian',
      'sudan',
      'sudanese',
      'uzbek',
      'uzbekistan',
      'tajik',
      'kyrgyz',
      'afghan',
      'pakistan',
      'pakistan',
    ];
    const leagueAndCountry = `${l} ${c}`;
    const isAllowed = allowed.some((a) => leagueAndCountry.includes(a));
    const isBlocked = blocked.some((b) => leagueAndCountry.includes(b));
    if (isBlocked && !isAllowed) return true;

    return false;
  };

  const mergeOddsResults = (results: any[]): any | null => {
    const valid = results.filter((r) => r != null);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];
    const merged: Record<string, any[]> = {};
    for (const r of valid) {
      const markets = r.markets && typeof r.markets === 'object' ? r.markets : {};
      for (const [key, lines] of Object.entries(markets)) {
        if (!Array.isArray(lines) || lines.length === 0) continue;
        if (!merged[key]) {
          merged[key] = lines;
        } else {
          const existing = merged[key];
          const existingSet = new Set(existing.map((l: any) => `${String(l.value || '')}|${String(l.point || '')}`));
          for (const line of lines) {
            const k = `${String(line.value || '')}|${String(line.point || '')}`;
            if (!existingSet.has(k)) {
              existing.push(line);
              existingSet.add(k);
            }
          }
        }
      }
    }
    const best = { home: 0, draw: 0, away: 0 };
    for (const r of valid) {
      const h = Number(r?.home || 0);
      const d = Number(r?.draw || 0);
      const a = Number(r?.away || 0);
      if (h > best.home) best.home = h;
      if (d > best.draw) best.draw = d;
      if (a > best.away) best.away = a;
    }
    return { home: best.home, draw: best.draw, away: best.away, markets: merged };
  };

  const trySubscribeMatchOdds = (sport: string, matchId: string) => {
    const localSport = String(sport || '').trim().toLowerCase();
    const id = String(matchId || '').trim();
    if (!localSport || !id) return;
    const u = upstreams.get(localSport);
    if (!u?.ws || u.ws.readyState !== WebSocket.OPEN) return;
    const key = `${localSport}:${id}`;
    const last = oddsSubscribed.get(key) || 0;
    if (Date.now() - last < 10 * 60_000) return;
    if (oddsSubscribed.size >= 240) return;
    oddsSubscribed.set(key, Date.now());
    try {
      u.ws.send(JSON.stringify({ action: 'subscribe', channel: `match:${id}:odds` }));
    } catch {
      void 0;
    }
  };

  const fetchOddsBestEffort = async (
    sport: string,
    matchId: string,
    ctx: { homeTeam?: string; awayTeam?: string },
    budget: { remaining: number } | null,
  ): Promise<any | null> => {
    const id = normalizeMatchId(sport, matchId);
    const key = `${sport}:${id}`;
    const cached = oddsCache.get(key);

    if (cached && cached.data != null && ttlOk(cached.ts, ODDS_FRESH_TTL_MS)) {
      return cached.data;
    }
    if (cached && cached.data != null && ttlOk(cached.ts, ODDS_STALE_TTL_MS)) {
      if (budget && budget.remaining > 0 && !oddsInflight.has(key)) {
        budget.remaining -= 1;
        fetchOddsBestEffort(sport, id, ctx, null).catch(() => null);
      }
      return cached.data;
    }
    if (budget && budget.remaining <= 0) return cached ? cached.data : null;

    if (budget) budget.remaining -= 1;
    const inflight = oddsInflight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const opts = { homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam };
      // See the identical note in server/routes/events.ts's fetchOddsStrict — GoalServe's
      // all/live/pre-match odds functions all resolve to the same shared payload+index, so
      // fetching all 3 and merging was 3x the parse work for 3 copies of identical data.
      if (USE_GOALSERVE) {
        return providerFetchOddsAll(apiKey, sport, id, opts).catch(() => null);
      }
      const [allResult, liveResult, preResult] = await Promise.all([
        providerFetchOddsAll(apiKey, sport, id, opts).catch(() => null),
        providerFetchOddsLive(apiKey, sport, id, opts).catch(() => null),
        providerFetchOddsPreMatch(apiKey, sport, id, opts).catch(() => null),
      ]);
      return mergeOddsResults([allResult, liveResult, preResult].filter(Boolean));
    })()
      .then((odds) => {
        oddsCache.set(key, { ts: Date.now(), data: odds });
        return odds;
      })
      .catch(() => null)
      .finally(() => {
        oddsInflight.delete(key);
      });

    oddsInflight.set(key, p);
    return p;
  };

  const mapLimit = async <T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let idx = 0;
    const run = async () => {
      for (;;) {
        const i = idx++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    };
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run);
    await Promise.all(workers);
    return out;
  };

  const normalizeAndFilterLive = (sp: string, list: any[]): any[] => {
    const normalizedList = (Array.isArray(list) ? list : []).map((e: any) => {
      const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
      const evSport = String(e?.sport || sp);
      const key = `${evSport}:${normalizeMatchId(evSport, id)}`;
      matchMeta.set(key, { ts: Date.now(), sport: evSport, homeTeam: String(e?.home_team || ''), awayTeam: String(e?.away_team || '') });
      const st = upstreamState.get(evSport)?.get(id) || upstreamState.get(sp)?.get(id) || null;
      if (st && Date.now() - st.ts < 2 * 60_000) {
        const patched: any = { ...e, id };
        if (st.home != null || st.away != null) {
          patched.goals = { home: st.home ?? (patched.goals?.home ?? null), away: st.away ?? (patched.goals?.away ?? null) };
          try {
            const rawScore = (patched as any).score;
            const obj = typeof rawScore === 'string' ? JSON.parse(rawScore) : rawScore && typeof rawScore === 'object' ? rawScore : {};
            if (obj && typeof obj === 'object') {
              obj.home = patched.goals.home;
              obj.away = patched.goals.away;
              patched.score = JSON.stringify(obj);
            }
          } catch {
            void 0;
          }
        }
        const descU = String(st.statusDesc || '').toUpperCase();
        const short =
          descU.includes('1ST HALF') ? '1H' :
          descU.includes('2ND HALF') ? '2H' :
          descU.includes('HALF TIME') || descU.includes('INTERVAL') ? 'HT' :
          descU.includes('PEN') ? 'PEN' :
          descU.includes('EXTRA') ? 'ET' :
          '';
        if (short) {
          patched.status_short = short;
          patched.fixture = patched.fixture && typeof patched.fixture === 'object'
            ? { ...patched.fixture, status: { ...(patched.fixture.status || {}), short } }
            : patched.fixture;
        }
        return patched;
      }
      return { ...e, id };
    });
    return normalizedList
      .filter((e: any) => Number(e?.is_live || 0) === 1)
      .filter((e: any) => !isBlockedLeague(String(e?.league || ''), String(e?.country || '')));
  };

  const sendSnapshot = async (sport: string) => {
    const now = Date.now();
    const prev = lastSent.get(sport) || 0;
    if (now - prev < 2500) return;
    lastSent.set(sport, now);

    if (snapshotInflight.has(sport)) {
      const cached = snapshotCache.get(sport);
      if (cached && now - cached.ts < 30_000) {
        const msg = JSON.stringify({ type: 'snapshot', live: cached.live });
        for (const c of clients) {
          if (c.sport !== sport) continue;
          if (c.ws.readyState !== WebSocket.OPEN) continue;
          try {
            c.ws.send(msg);
          } catch {
            void 0;
          }
        }
      }
      return;
    }
    snapshotInflight.add(sport);
    const t0 = Date.now();
    try {
      if (sport === 'all' && USE_GOALSERVE) {
        // GoalServe has no push connection at all (connectUpstream() is a no-op for it — see
        // there), so nothing keeps each sport's snapshotCache entry warm between polls the way
        // SportsAPI Pro's upstream WS does for the merge-from-per-sport-cache path just below.
        // Left as-is, that path only re-fetches a sport once EVERY sport's cache is simultaneously
        // empty/stale (a rare coincidence), so live scores/rosters freeze in place for up to 5
        // minutes at a time — reported as matches randomly appearing/disappearing between the
        // live list (fed by this WS) and other pages that fetch fresh data directly over REST.
        // Simplest correct fix for a no-push provider: always re-fetch every sport on every 'all'
        // tick, the same straightforward way the single-sport path further below already does.
        const entries = await Promise.all(
          SPORTS_DEFAULT.map(async (sp) => ({ sp, list: await providerFetchLive(apiKey, sp).catch(() => []) })),
        );
        let liveAll: any[] = [];
        for (const { sp, list } of entries) liveAll.push(...normalizeAndFilterLive(sp, list));

        const prevAll = snapshotCache.get('all');
        if (liveAll.length === 0 && prevAll && Array.isArray(prevAll.live) && prevAll.live.length > 0 && now - prevAll.ts < 120_000) {
          liveAll = prevAll.live;
        }

        const liveAllWithPositions = await attachBallPositions(liveAll);
        snapshotCache.set('all', { ts: Date.now(), live: liveAllWithPositions });
        const msg = JSON.stringify({ type: 'snapshot', live: liveAllWithPositions });
        for (const c of clients) {
          if (c.sport !== 'all') continue;
          if (c.ws.readyState !== WebSocket.OPEN) continue;
          try {
            c.ws.send(msg);
          } catch {
            void 0;
          }
        }
        return;
      }

      if (sport === 'all') {
        const mergedFromCache: any[] = [];
        for (const sp of SPORTS_DEFAULT) {
          const cached = snapshotCache.get(sp);
          if (!cached || !Array.isArray(cached.live) || cached.live.length === 0) continue;
          if (now - cached.ts > 5 * 60_000) continue;
          mergedFromCache.push(...cached.live);
        }

        const prevAll = snapshotCache.get('all');
        if (mergedFromCache.length === 0) {
          const canBootstrap = !allBootstrapInflight && now - allBootstrapAt > 25_000;
          if (canBootstrap) {
            allBootstrapAt = now;
            allBootstrapInflight = (async () => {
              const entries = await Promise.all(
                SPORTS_DEFAULT.map(async (sp) => ({ sp, list: await providerFetchLive(apiKey, sp).catch(() => []) })),
              );
              const ts = Date.now();
              for (const { sp, list } of entries) {
                const live = normalizeAndFilterLive(sp, list);
                if (live.length > 0) snapshotCache.set(sp, { ts, live });
              }
            })()
              .catch(() => null)
              .then(() => void 0)
              .finally(() => {
                allBootstrapInflight = null;
              });
          }
        }

        let liveAll = mergedFromCache;
        if (liveAll.length === 0 && prevAll && Array.isArray(prevAll.live) && prevAll.live.length > 0 && now - prevAll.ts < 120_000) {
          liveAll = prevAll.live;
        }

        const toSportKey = (v: any) => String(v || '').trim().toLowerCase();
        const group: Record<string, string[]> = {};
        for (const e of liveAll) {
          const sp = toSportKey(e?.sport);
          const id = String(e?.id || '').trim();
          if (!sp || !id) continue;
          if (!group[sp]) group[sp] = [];
          if (group[sp].length < 20) group[sp].push(id);
        }
        for (const [sp, ids] of Object.entries(group)) {
          for (const id of ids) trySubscribeMatchOdds(sp, id);
        }

        const liveAllWithPositions = await attachBallPositions(liveAll);
        snapshotCache.set('all', { ts: Date.now(), live: liveAllWithPositions });
        const msg = JSON.stringify({ type: 'snapshot', live: liveAllWithPositions });
        for (const c of clients) {
          if (c.sport !== 'all') continue;
          if (c.ws.readyState !== WebSocket.OPEN) continue;
          try {
            c.ws.send(msg);
          } catch {
            void 0;
          }
        }
        return;
      }

      const sports = sport === 'all' ? ['soccer', 'tennis', 'basketball', 'ice-hockey', 'baseball'] : [sport];
      const liveAll: any[] = [];
      try {
        const entries = await Promise.all(
          sports.map(async (sp) => ({ sp, list: await providerFetchLive(apiKey, sp).catch(() => []) })),
        );
        for (const { sp, list } of entries) {
          liveAll.push(...normalizeAndFilterLive(sp, list));
        }
      } catch {
        void 0;
      }

      let baseLive = liveAll;
      const prevSnap = snapshotCache.get(sport);
      if (baseLive.length === 0 && prevSnap && Array.isArray(prevSnap.live) && prevSnap.live.length > 0 && Date.now() - prevSnap.ts < 120_000) {
        baseLive = prevSnap.live;
      }
      snapshotCache.set(sport, { ts: Date.now(), live: baseLive });
      const baseMsg = JSON.stringify({ type: 'snapshot', live: baseLive });
      for (const c of clients) {
        if (c.sport !== sport) continue;
        if (c.ws.readyState !== WebSocket.OPEN) continue;
        try {
          c.ws.send(baseMsg);
        } catch {
          void 0;
        }
      }

      const toSportKey = (v: any) => String(v || '').trim().toLowerCase();
      const group: Record<string, string[]> = {};
      for (const e of liveAll) {
        const sp = toSportKey(e?.sport);
        const id = String(e?.id || '').trim();
        if (!sp || !id) continue;
        if (!group[sp]) group[sp] = [];
        if (group[sp].length < 20) group[sp].push(id);
      }
      for (const [sp, ids] of Object.entries(group)) {
        for (const id of ids) trySubscribeMatchOdds(sp, id);
      }

      const budget = { remaining: 24 };
      const withOdds = await mapLimit(liveAll, 8, async (e) => {
      const sportKey = String(e?.sport || '').trim().toLowerCase();
      const mid0 = String(e?.id || '').trim();
      const cacheKey0 = `${sportKey}:${normalizeMatchId(sportKey, mid0)}`;
      const cached0 = oddsCache.get(cacheKey0);
      if (cached0 && cached0.data && Date.now() - cached0.ts < ODDS_FRESH_TTL_MS) {
        const od = cached0.data;
        const h0 = Number(e.home_odd || 0);
        const d0 = Number(e.draw_odd || 0);
        const a0 = Number(e.away_odd || 0);
        const h1 = Number(od.home || 0);
        const d1 = Number(od.draw || 0);
        const a1 = Number(od.away || 0);
        return {
          ...e,
          home_odd: h1 > 1 ? h1 : h0,
          draw_odd: d1 > 1 ? d1 : d0,
          away_odd: a1 > 1 ? a1 : a0,
          markets: od.markets || e.markets,
        };
      }
      if (hasOdds(e) && sportKey === 'soccer') {
        const mid = String(e?.id || '').trim();
        const cacheKey = `${sportKey}:${normalizeMatchId(sportKey, mid)}`;
        const cached = oddsCache.get(cacheKey);
        const age = cached ? (Date.now() - cached.ts) : Number.POSITIVE_INFINITY;
        if (age > ODDS_FRESH_TTL_MS && budget.remaining > 0) {
          const odds = await fetchOddsBestEffort(
            sportKey,
            mid,
            { homeTeam: String(e?.home_team || ''), awayTeam: String(e?.away_team || '') },
            budget,
          ).catch(() => null);
          if (odds) {
            return {
              ...e,
              home_odd: odds?.home ? Number(odds.home) : Number(e?.home_odd || 0),
              draw_odd: odds?.draw ? Number(odds.draw) : Number(e?.draw_odd || 0),
              away_odd: odds?.away ? Number(odds.away) : Number(e?.away_odd || 0),
              markets: odds?.markets ? odds.markets : e?.markets,
            };
          }
        }
      }
      if (hasOdds(e)) return e;
        const odds = await fetchOddsBestEffort(
          String(e?.sport || ''),
          String(e?.id || ''),
          { homeTeam: String(e?.home_team || ''), awayTeam: String(e?.away_team || '') },
          budget,
        ).catch(() => null);
        if (!odds) return e;
        return {
          ...e,
          home_odd: odds?.home ? Number(odds.home) : Number(e?.home_odd || 0),
          draw_odd: odds?.draw ? Number(odds.draw) : Number(e?.draw_odd || 0),
          away_odd: odds?.away ? Number(odds.away) : Number(e?.away_odd || 0),
          markets: odds?.markets ? odds.markets : e?.markets,
        };
      });

      const live = await attachBallPositions(withOdds);
      snapshotCache.set(sport, { ts: Date.now(), live });
      const msg = JSON.stringify({ type: 'snapshot', live });
      for (const c of clients) {
        if (c.sport !== sport) continue;
        if (c.ws.readyState !== WebSocket.OPEN) continue;
        try {
          c.ws.send(msg);
        } catch {
          void 0;
        }
      }
    } finally {
      snapshotInflight.delete(sport);
    }
  };

  const connectUpstream = (sport: string) => {
    const localSport = String(sport || '').trim().toLowerCase();
    if (!localSport || localSport === 'all') return;
    // GoalServe has no push/WebSocket channel at all — every endpoint documented in its official
    // Data Feed PDFs (livescore, stats, odds, commentaries) is plain HTTPS GET with a per-feed
    // refresh period, not a subscribe/push protocol. So there is no upstream socket to open here;
    // the periodic sendSnapshot() polling loop below (started by ensureTimer, at a GoalServe-safe
    // interval) is this file's own real-time layer for that provider — it's already a from-scratch
    // "our own websocket" (this file/wss IS that server) fed by polling instead of by pass-through.
    if (USE_GOALSERVE) return;
    const wsSport = toWsSport(localSport);
    const existing = upstreams.get(localSport);
    if (existing && (existing.connecting || (existing.ws && existing.ws.readyState === WebSocket.OPEN))) return;

    const u: UpstreamInfo = existing || {
      localSport,
      wsSport,
      ws: null,
      backoffMs: 1000,
      connecting: false,
      stopped: false,
      lastMessageAt: 0,
      pingTimer: null,
    };
    u.connecting = true;
    u.stopped = false;
    upstreams.set(localSport, u);

    const url = `wss://v2.${wsSport}.sportsapipro.com/ws?x-api-key=${encodeURIComponent(apiKey)}`;
    const ws = new WebSocket(url, { headers: { 'x-sport': wsSport } as any });
    u.ws = ws;

    ws.on('open', () => {
      u.connecting = false;
      u.backoffMs = 1000;
      try {
        ws.send(JSON.stringify({ action: 'subscribe', channel: 'live-scores' }));
      } catch {
        void 0;
      }
      if (u.pingTimer) clearInterval(u.pingTimer);
      u.pingTimer = setInterval(() => {
        if (!u.ws || u.ws.readyState !== WebSocket.OPEN) return;
        try {
          u.ws.send(JSON.stringify({ action: 'ping', channel: 'live-scores' }));
        } catch {
          void 0;
        }
      }, 30_000);
      sendSnapshot(localSport).catch(() => null);
    });

    ws.on('message', (raw) => {
      u.lastMessageAt = Date.now();
      try {
        const txt = String((raw as any)?.toString ? (raw as any).toString() : raw);
        const msg = JSON.parse(txt);
        if (msg && msg.channel === 'live-scores' && msg.data && typeof msg.data === 'object') {
          const d = msg.data;
          const id = String(d.eventId ?? d.id ?? '').trim();
          if (id) {
            const homeRaw = d['homeScore.current'] ?? d['homeScore.display'] ?? d.homeScore?.current ?? d.homeScore?.display ?? null;
            const awayRaw = d['awayScore.current'] ?? d['awayScore.display'] ?? d.awayScore?.current ?? d.awayScore?.display ?? null;
            const home = homeRaw == null ? null : (Number.isFinite(Number(homeRaw)) ? Number(homeRaw) : null);
            const away = awayRaw == null ? null : (Number.isFinite(Number(awayRaw)) ? Number(awayRaw) : null);
            const statusDesc = String(d['status.description'] ?? d.statusDescription ?? d['statusDescription'] ?? d.statusDescriptionText ?? '').trim();
            const status = String(d['status.type'] ?? d['status.code'] ?? d['statusType'] ?? d.statusType ?? '').trim();
            const m = upstreamState.get(localSport) || (upstreamState.set(localSport, new Map()), upstreamState.get(localSport)!);
            m.set(id, { ts: Date.now(), status: status || undefined, statusDesc: statusDesc || undefined, home, away });
            trySubscribeMatchOdds(localSport, id);
          }
        }
        if (msg && typeof msg.channel === 'string') {
          const mOdds = /^match:(\d+):odds$/i.exec(msg.channel);
          if (mOdds) {
            const matchId = String(mOdds[1] || '').trim();
            const key = `${localSport}:${normalizeMatchId(localSport, matchId)}`;
            const meta = matchMeta.get(key);
            const parsed = parseSportsApiProMatchOddsPayload(localSport, msg.data, meta ? { homeTeam: meta.homeTeam, awayTeam: meta.awayTeam } : undefined);
            if (parsed) {
              oddsCache.set(key, { ts: Date.now(), data: parsed });
            } else {
              oddsCache.delete(key);
            }
          }
        }
      } catch {
        void 0;
      }
      sendSnapshot(localSport).catch(() => null);
      sendSnapshot('all').catch(() => null);
    });

    const scheduleReconnect = () => {
      if (u.stopped) return;
      if (u.pingTimer) {
        clearInterval(u.pingTimer);
        u.pingTimer = null;
      }
      const delay = Math.min(20_000, Math.max(1000, u.backoffMs));
      u.backoffMs = Math.min(20_000, u.backoffMs * 2);
      setTimeout(() => {
        const stillNeeded = Array.from(clients).some((c) => c.sport === localSport || c.sport === 'all');
        if (!stillNeeded) return;
        connectUpstream(localSport);
      }, delay);
    };

    ws.on('close', scheduleReconnect);
    ws.on('error', scheduleReconnect);
  };

  const stopUpstreamIfUnused = (sport: string) => {
    const localSport = String(sport || '').trim().toLowerCase();
    if (!localSport || localSport === 'all') return;
    const any = Array.from(clients).some((c) => c.sport === localSport || c.sport === 'all');
    if (any) return;
    const u = upstreams.get(localSport);
    if (!u) return;
    u.stopped = true;
    if (u.pingTimer) {
      clearInterval(u.pingTimer);
      u.pingTimer = null;
    }
    if (u.ws) {
      try {
        u.ws.close();
      } catch {
        void 0;
      }
      u.ws = null;
    }
  };

  const ensureTimer = (sport: string) => {
    if (timers.has(sport)) return;
    if (sport === 'all') {
      for (const s of SPORTS_DEFAULT) connectUpstream(s);
    } else {
      connectUpstream(sport);
    }
    // SportsAPI Pro's upstream WS pushes changes in real time, so this interval is just a fallback
    // safety net for it — 2.5s for soccer/all is fine. GoalServe has no push at all (see
    // connectUpstream above): this interval IS the live-update rate, so it must respect the
    // documented "refresh period every 5 seconds" for every sport's livescore feed — never poll
    // faster than that.
    const intervalMs = USE_GOALSERVE ? (sport === 'all' || sport === 'soccer' ? 5000 : 8000) : sport === 'all' || sport === 'soccer' ? 2500 : 8000;
    const id = setInterval(() => {
      sendSnapshot(sport).catch(() => null);
    }, intervalMs);
    timers.set(sport, id);
    sendSnapshot(sport).catch(() => null);
  };

  const cleanupTimer = (sport: string) => {
    const any = Array.from(clients).some((c) => c.sport === sport && c.ws.readyState === WebSocket.OPEN);
    if (any) return;
    const t = timers.get(sport);
    if (t) clearInterval(t);
    timers.delete(sport);
    if (sport === 'all') {
      for (const s of SPORTS_DEFAULT) stopUpstreamIfUnused(s);
    } else {
      stopUpstreamIfUnused(sport);
    }
  };

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const u = new URL(req.url || '', 'http://localhost');
    const sport = normalize(u.searchParams.get('sport') || 'all');
    const c: ClientInfo = { ws, sport };
    clients.add(c);
    ensureTimer(sport);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data || ''));
        if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        void 0;
      }
    });

    ws.on('close', () => {
      clients.delete(c);
      cleanupTimer(sport);
    });
    ws.on('error', () => {
      clients.delete(c);
      cleanupTimer(sport);
    });
  });

  const handleUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  return { wss, handleUpgrade };
}
