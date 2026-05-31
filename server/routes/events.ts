import type http from 'http';
import type pg from 'pg';
import {
  fetchSportsApiProLive,
  fetchSportsApiProMatchOddsAll,
  fetchSportsApiProMatchOddsLive,
  fetchSportsApiProMatchOddsPreMatch,
  fetchSportsApiProMatchStatistics,
  fetchSportsApiProMatchIncidents,
  fetchSportsApiProSchedule,
  fetchSportsApiProWorldCup2026,
  fetchSportsApiProWorldCup2026Groups,
  fetchSportsApiProWorldCup2026Info,
  fetchSportsApiProWorldCup2026Matches,
} from '../services/sportsApiPro';
import { deriveAdditionalMarkets } from '../services/marketDerivation';
import { sendJson, badRequest } from '../lib/http';

type CacheEntry<T> = { ts: number; data: T };

type AnyEvent = any;

const SPORTS_DEFAULT = ['soccer', 'tennis', 'basketball', 'ice-hockey', 'baseball'];
const ODDS_FRESH_TTL_MS = 90_000;
const LIVE_ODDS_FRESH_TTL_MS = 8_000;
const ODDS_STALE_TTL_MS = 15 * 60_000;
const LIVE_HOLD_MS = 6 * 60_000;

function nowMs(): number {
  return Date.now();
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ttlOk(ts: number, ttlMs: number): boolean {
  return ts > 0 && nowMs() - ts < ttlMs;
}

function parseMarkets(v: any): any {
  if (!v) return {};
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return {};
  const s = v.trim();
  if (!s) return {};
  try {
    const j = JSON.parse(s);
    if (typeof j === 'string') {
      try {
        return JSON.parse(j);
      } catch {
        return j;
      }
    }
    return j;
  } catch {
    return {};
  }
}

function pruneMarketsForList(sport: string, markets: Record<string, any[]>): Record<string, any[]> {
  if (!markets || typeof markets !== 'object') return {};
  // Return all markets — no cap
  return markets;
}

export type EventsService = {
  handleEventsRoutes: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ) => Promise<boolean>;
  getAdminOddsEvents: () => Promise<any[]>;
  setOddsOverride: (eventId: string, odds: { home_odd?: number; draw_odd?: number; away_odd?: number }) => Promise<void>;
};

export function createEventsService(pool: pg.Pool | null, apiKey: string): EventsService {
  const liveCache = new Map<string, CacheEntry<AnyEvent[]>>();
  const scheduleCache = new Map<string, CacheEntry<AnyEvent[]>>();
  const oddsCache = new Map<string, CacheEntry<any>>();
  const oddsInflight = new Map<string, Promise<any | null>>();
  const bySportCache = new Map<string, CacheEntry<{ live: AnyEvent[]; pregame: AnyEvent[] }>>();
  const worldCupCache = new Map<string, CacheEntry<any>>();
  const worldCupMatchesCache = new Map<string, CacheEntry<AnyEvent[]>>();
  const oddsQueue: Array<{ sport: string; matchId: string }> = [];
  const oddsQueued = new Set<string>();
  let oddsQueueInFlight = 0;
  let oddsQueueStarted = false;
  const idToSport = new Map<string, CacheEntry<string>>();
  const lastEventById = new Map<string, CacheEntry<AnyEvent>>();
  const liveSeen = new Map<string, CacheEntry<{ sport: string; event: AnyEvent }>>();
  const overridesCache = new Map<string, CacheEntry<{ home_odd: number | null; draw_odd: number | null; away_odd: number | null }>>();

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

  const normalizeIdLoose = (rawId: string): string => {
    const id = String(rawId || '').trim();
    if (!id) return '';
    if (!id.includes('_')) return id;
    const parts = id.split('_').filter(Boolean);
    if (parts.length < 2) return id;
    return parts[parts.length - 1] || id;
  };

  const matchIdOf = (e: AnyEvent): string => {
    const sport = String((e as any)?.sport || '').trim();
    const idRaw = String((e as any)?.id || (e as any)?.external_event_id || '').trim();
    return normalizeMatchId(sport, idRaw);
  };

  const getSports = (sportsParam: string | null): string[] => {
    const raw = String(sportsParam || '').trim();
    if (!raw || raw === 'all') return SPORTS_DEFAULT.slice();
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length === 0) return SPORTS_DEFAULT.slice();
    return parts;
  };

  const rememberSport = (matchId: string, sport: string) => {
    if (!matchId) return;
    idToSport.set(matchId, { ts: nowMs(), data: sport });
  };

  const resolveSport = async (matchId: string): Promise<string | null> => {
    const c = idToSport.get(matchId);
    if (c && ttlOk(c.ts, 6 * 60 * 60 * 1000)) return c.data;
    for (const s of SPORTS_DEFAULT) {
      const live = await fetchLive(s).catch(() => []);
      if (live.some((e: any) => String(e.id) === String(matchId))) {
        rememberSport(matchId, s);
        return s;
      }
      const days = 7;
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const date = ymd(d);
        const list = await fetchSchedule(s, date).catch(() => []);
        if (list.some((e: any) => String(e.id) === String(matchId))) {
          rememberSport(matchId, s);
          return s;
        }
      }
    }
    return null;
  };

  const isFinishedLike = (e: any): boolean => {
    const status = (e as any)?.status ?? (e as any)?.fixture?.status ?? '';
    const raw =
      (typeof status === 'object' && status !== null)
        ? ((status as any).short ?? (status as any).long ?? (status as any).description ?? (status as any).type)
        : status;
    const su = String(raw || '').toUpperCase().trim();
    if (!su) return false;
    const s = su.replace(/[^A-Z0-9_]+/g, '_').replace(/^_+/, '').replace(/_+$/, '');
    if (
      s === 'FT' ||
      s === 'FINAL' ||
      s === 'FINISHED' ||
      s === 'ENDED' ||
      s === 'END' ||
      s === 'FULL_TIME' ||
      s === 'MATCH_FINISHED' ||
      s === 'COMPLETED' ||
      s === 'CANCELLED' ||
      s === 'CANCELED' ||
      s === 'POSTPONED' ||
      s === 'SUSPENDED' ||
      s === 'ABANDONED' ||
      s === 'WALKOVER' ||
      s === 'WO'
    ) return true;
    if (/FINISH|ENDED|FINAL|FULLTIME|GAMEOVER|CANCEL|POSTPON|ABANDON|WALKOVER/.test(s)) return true;
    return false;
  };

  const queueOddsRefresh = (sport: string, matchId: string) => {
    const s = String(sport || '').trim();
    const id = normalizeMatchId(s, String(matchId || '').trim());
    if (!s || !id) return;
    const key = `${s}:${id}`;
    const cached = oddsCache.get(key);
    if (cached && ttlOk(cached.ts, ODDS_FRESH_TTL_MS)) return;
    if (oddsQueued.has(key)) return;
    oddsQueued.add(key);
    oddsQueue.push({ sport: s, matchId: id });
  };

  const startOddsQueue = () => {
    if (oddsQueueStarted) return;
    oddsQueueStarted = true;
    setInterval(() => {
      if (oddsQueueInFlight >= 6) return;
      const next = oddsQueue.shift();
      if (!next) return;
      const key = `${next.sport}:${next.matchId}`;
      oddsQueueInFlight += 1;
      fetchOddsStrict(next.sport, next.matchId)
        .catch(() => null)
        .finally(() => {
          oddsQueueInFlight -= 1;
          oddsQueued.delete(key);
        });
    }, 120);
  };

  const fetchLive = async (sport: string): Promise<AnyEvent[]> => {
    const key = sport;
    const cached = liveCache.get(key);
    if (cached && ttlOk(cached.ts, 7_000)) return cached.data;
    if (cached && ttlOk(cached.ts, 2 * 60_000)) {
      fetchSportsApiProLive(apiKey, sport)
        .then((list) => {
          const normalized = (Array.isArray(list) ? list : []).map((e: any) => {
            const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
            const out = { ...e, id, sport };
            rememberSport(id, sport);
            lastEventById.set(id, { ts: nowMs(), data: out });
            if (Number((out as any)?.is_live || 0) === 1) {
              liveSeen.set(id, { ts: nowMs(), data: { sport, event: out } });
            }
            return out;
          });
          liveCache.set(key, { ts: nowMs(), data: normalized });
        })
        .catch(() => void 0);
      return cached.data;
    }
    const list = await fetchSportsApiProLive(apiKey, sport).catch(() => []);
    const normalized = (Array.isArray(list) ? list : []).map((e: any) => {
      const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
      const out = { ...e, id, sport };
      rememberSport(id, sport);
      lastEventById.set(id, { ts: nowMs(), data: out });
      if (Number((out as any)?.is_live || 0) === 1) {
        liveSeen.set(id, { ts: nowMs(), data: { sport, event: out } });
      }
      return out;
    });
    liveCache.set(key, { ts: nowMs(), data: normalized });
    return normalized;
  };

  const fetchSchedule = async (sport: string, date: string): Promise<AnyEvent[]> => {
    const key = `${sport}:${date}`;
    const cached = scheduleCache.get(key);
    if (cached && ttlOk(cached.ts, 20 * 60_000)) return cached.data;
    if (cached && ttlOk(cached.ts, 3 * 60 * 60 * 1000)) {
      fetchSportsApiProSchedule(apiKey, sport, date)
        .then((list) => {
          const normalized = (Array.isArray(list) ? list : []).map((e: any) => {
            const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
            const out = { ...e, id, sport };
            rememberSport(id, sport);
            lastEventById.set(id, { ts: nowMs(), data: out });
            return out;
          });
          scheduleCache.set(key, { ts: nowMs(), data: normalized });
        })
        .catch(() => void 0);
      return cached.data;
    }
    const list = await fetchSportsApiProSchedule(apiKey, sport, date).catch(() => []);
    const normalized = (Array.isArray(list) ? list : []).map((e: any) => {
      const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
      const out = { ...e, id, sport };
      rememberSport(id, sport);
      lastEventById.set(id, { ts: nowMs(), data: out });
      return out;
    });
    scheduleCache.set(key, { ts: nowMs(), data: normalized });
    return normalized;
  };

  const fetchWorldCupMeta = async (kind: 'tournament' | 'info' | 'groups'): Promise<any | null> => {
    const key = `meta:${kind}`;
    const cached = worldCupCache.get(key);
    if (cached && ttlOk(cached.ts, 60 * 60_000)) return cached.data;
    let data: any | null = null;
    if (kind === 'tournament') data = await fetchSportsApiProWorldCup2026(apiKey).catch(() => null);
    if (kind === 'info') data = await fetchSportsApiProWorldCup2026Info(apiKey).catch(() => null);
    if (kind === 'groups') data = await fetchSportsApiProWorldCup2026Groups(apiKey).catch(() => null);
    worldCupCache.set(key, { ts: nowMs(), data });
    return data;
  };

  const fetchWorldCupMatches = async (page: number): Promise<AnyEvent[]> => {
    const p = Number.isFinite(page) ? Math.max(0, Math.min(20, Math.floor(page))) : 0;
    const key = `matches:${p}`;
    const cached = worldCupMatchesCache.get(key);
    if (cached && ttlOk(cached.ts, 20 * 60_000)) return cached.data;
    const list = await fetchSportsApiProWorldCup2026Matches(apiKey, p).catch(() => []);
    const normalized = (Array.isArray(list) ? list : []).map((e: any) => {
      const id = String((e as any).id || '').trim() || String((e as any).external_event_id || '').split('_').pop() || '';
      const out = { ...e, id, sport: 'soccer' };
      rememberSport(id, 'soccer');
      lastEventById.set(id, { ts: nowMs(), data: out });
      return out;
    });
    worldCupMatchesCache.set(key, { ts: nowMs(), data: normalized });
    return normalized;
  };

  const getOverride = async (eventId: string): Promise<{ home_odd: number | null; draw_odd: number | null; away_odd: number | null } | null> => {
    const c = overridesCache.get(eventId);
    if (c && ttlOk(c.ts, 10_000)) return c.data;
    if (!pool) return null;
    const r = await pool.query(`SELECT home_odd, draw_odd, away_odd FROM odds_overrides WHERE event_id = $1 LIMIT 1`, [eventId]);
    const row = r.rows?.[0];
    if (!row) return null;
    const data = {
      home_odd: row.home_odd == null ? null : Number(row.home_odd),
      draw_odd: row.draw_odd == null ? null : Number(row.draw_odd),
      away_odd: row.away_odd == null ? null : Number(row.away_odd),
    };
    overridesCache.set(eventId, { ts: nowMs(), data });
    return data;
  };

  const mergeOddsResults = (results: any[]): any | null => {
    const valid = results.filter(r => r != null);
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
          const existingSet = new Set(existing.map((l: any) => `${String(l.label || l.value || '')}|${String(l.point || '')}`));
          for (const line of lines) {
            const k = `${String(line.label || line.value || '')}|${String(line.point || '')}`;
            if (!existingSet.has(k)) {
              existing.push(line);
              existingSet.add(k);
            }
          }
        }
      }
    }
    const pick = (k: 'home' | 'draw' | 'away'): number => {
      for (const r of valid) {
        const v = Number((r as any)?.[k] || 0);
        if (v > 1) return v;
      }
      return Number((valid[0] as any)?.[k] || 0) || 0;
    };
    return {
      home: pick('home'),
      draw: pick('draw'),
      away: pick('away'),
      markets: merged,
    };
  };

  const fetchOddsStrict = async (
    sport: string,
    matchId: string,
    ctx: { isLive?: boolean; homeTeam?: string; awayTeam?: string; forceAll?: boolean } = {},
  ): Promise<any | null> => {
    const normalizedId = normalizeMatchId(sport, matchId);
    const key = `${sport}:${normalizedId}`;
    const inflight = oddsInflight.get(key);
    if (inflight) return inflight;
    const p = (async () => {
      const opts = { homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam };
      // Fetch all 3 endpoints in parallel to get maximum market coverage
      const [allResult, liveResult, preResult] = await Promise.all([
        fetchSportsApiProMatchOddsAll(apiKey, sport, normalizedId, opts).catch(() => null),
        fetchSportsApiProMatchOddsLive(apiKey, sport, normalizedId, opts).catch(() => null),
        fetchSportsApiProMatchOddsPreMatch(apiKey, sport, normalizedId, opts).catch(() => null),
      ]);
      const merged = mergeOddsResults([liveResult, allResult, preResult].filter(Boolean));
      if (merged && merged.markets && typeof merged.markets === 'object') {
        const derived = deriveAdditionalMarkets(
          merged.markets,
          sport,
          ctx.homeTeam || '',
          ctx.awayTeam || '',
        );
        // Derived markets fill gaps — real API odds always take priority
        merged.markets = { ...derived, ...merged.markets };
      }
      return merged;
    })()
      .then((odds) => {
        oddsCache.set(key, { ts: nowMs(), data: odds });
        return odds;
      })
      .catch(() => null)
      .finally(() => {
        oddsInflight.delete(key);
      });
    oddsInflight.set(key, p);
    return p;
  };

  const fetchOddsBestEffort = async (
    sport: string,
    matchId: string,
    ctx: { isLive?: boolean; homeTeam?: string; awayTeam?: string; forceAll?: boolean },
    refreshBudget: { remaining: number } | null,
  ): Promise<any | null> => {
    const key = `${sport}:${matchId}`;
    const cached = oddsCache.get(key);

    const freshTtl = ctx.isLive ? LIVE_ODDS_FRESH_TTL_MS : ODDS_FRESH_TTL_MS;
    if (cached && cached.data != null && ttlOk(cached.ts, freshTtl)) {
      return cached.data;
    }

    if (cached && cached.data != null && ttlOk(cached.ts, ODDS_STALE_TTL_MS)) {
      if (refreshBudget && refreshBudget.remaining > 0 && !oddsInflight.has(key)) {
        refreshBudget.remaining -= 1;
        fetchOddsStrict(sport, matchId, ctx).catch(() => null);
      } else {
        queueOddsRefresh(sport, matchId);
      }
      return cached.data;
    }

    if (cached && cached.data == null) {
      queueOddsRefresh(sport, matchId);
    }

    if (refreshBudget && refreshBudget.remaining <= 0) {
      queueOddsRefresh(sport, matchId);
      return cached ? cached.data : null;
    }

    if (refreshBudget) refreshBudget.remaining -= 1;
    return fetchOddsStrict(sport, matchId, ctx);
  };

  const enrichEventOdds = async (
    e: AnyEvent,
    refreshBudget: { remaining: number } | null,
    fullMarkets: boolean,
  ): Promise<AnyEvent> => {
    const id = matchIdOf(e);
    const sport = String(e?.sport || '').trim();
    if (!id || !sport) return e;

    const override = await getOverride(id).catch(() => null);
    const odds = await fetchOddsBestEffort(
      sport,
      id,
      {
        isLive: Number(e?.is_live || 0) === 1,
        homeTeam: String(e?.home_team || ''),
        awayTeam: String(e?.away_team || ''),
      },
      refreshBudget,
    ).catch(() => null);
    const marketsAll = odds?.markets ? odds.markets : parseMarkets((e as any).markets);
    const markets =
      fullMarkets
        ? marketsAll
        : pruneMarketsForList(sport, (marketsAll && typeof marketsAll === 'object') ? marketsAll : {});
    const base = {
      ...e,
      id,
      home_odd: odds?.home ? Number(odds.home) : Number((e as any).home_odd || 0),
      draw_odd: odds?.draw ? Number(odds.draw) : Number((e as any).draw_odd || 0),
      away_odd: odds?.away ? Number(odds.away) : Number((e as any).away_odd || 0),
      markets,
      markets_count: marketsAll && typeof marketsAll === 'object' ? Object.keys(marketsAll).length : 0,
    };
    if (override) {
      const ho = override.home_odd != null ? Number(override.home_odd) : null;
      const doo = override.draw_odd != null ? Number(override.draw_odd) : null;
      const ao = override.away_odd != null ? Number(override.away_odd) : null;
      return {
        ...base,
        home_odd: ho != null && ho > 0 ? ho : base.home_odd,
        draw_odd: doo != null && doo > 0 ? doo : base.draw_odd,
        away_odd: ao != null && ao > 0 ? ao : base.away_odd,
      };
    }
    return base;
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

  const buildBySport = async (
    sportsParam: string | null,
    includeOdds: boolean,
    league: string | null,
    realtime: boolean,
    fullMarkets: boolean,
    only: 'live' | 'pregame' | 'both',
    daysAhead: number,
    requireOdds: boolean,
    allowBlocked: boolean,
  ): Promise<{ live: AnyEvent[]; pregame: AnyEvent[] }> => {
    startOddsQueue();
    const sports = getSports(sportsParam);
    const liveAll: AnyEvent[] = [];
    const preAll: AnyEvent[] = [];

    const includeLive = only === 'both' || only === 'live';
    const includePregame = only === 'both' || only === 'pregame';
    const days = Math.max(0, Math.min(14, Number.isFinite(daysAhead) ? daysAhead : 0));
    const now = nowMs();
    const toStartMs = (e: any) => {
      const raw = (e as any)?.event_date ?? (e as any)?.fixture?.date ?? (e as any)?.start_time ?? (e as any)?.startTimestamp;
      if (!raw) return 0;
      if (typeof raw === 'number') return raw > 10_000_000_000 ? raw : raw * 1000;
      const t = new Date(String(raw)).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    if (includeLive && sports.length > 0) {
      const lists = await mapLimit(sports, 5, (s) => fetchLive(s).catch(() => []));
      for (const live of lists) {
        liveAll.push(...(live || []).filter((e: any) => Number(e?.is_live || 0) === 1));
      }
    }

    if (includePregame && sports.length > 0) {
      const isNotStartedLike = (e: any) => {
        const status = (e as any)?.status ?? (e as any)?.fixture?.status ?? '';
        const raw =
          (typeof status === 'object' && status !== null)
            ? ((status as any).short ?? (status as any).long ?? (status as any).description ?? (status as any).type)
            : status;
        const su = String(raw || '').toUpperCase().trim();
        if (!su) return true;
        const s = su.replace(/[^A-Z0-9_]+/g, '_').replace(/^_+/, '').replace(/_+$/, '');
        if (s === 'NS' || s === 'SCHEDULED' || s === 'UPCOMING' || s === 'NOT_STARTED' || s === 'PRE_MATCH' || s === 'TIMED') return true;
        if (/NOT_STARTED|SCHEDUL|UPCOMING|TIMED|PRE_MATCH/.test(s)) return true;
        return false;
      };
      const isPregameCandidate = (e: any) => {
        if (Number((e as any)?.is_live || 0) !== 0) return false;
        if (isFinishedLike(e)) return false;
        const t = toStartMs(e);
        if (t && t < now - 2 * 60 * 1000) return false;
        if (t && t >= now) return true;
        return isNotStartedLike(e);
      };
      const tasks: Array<{ sport: string; date: string }> = [];
      for (const s of sports) {
        const sKey = String(s || '').toLowerCase().trim();
        const perSportDays = Math.max(days, (sKey === 'soccer' || sKey === 'football') ? 7 : 0);
        for (let i = 0; i < Math.min(14, perSportDays); i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          tasks.push({ sport: s, date: ymd(d) });
        }
      }
      const lists = await mapLimit(tasks, 6, (t) => fetchSchedule(t.sport, t.date).catch(() => []));
      for (const sched of lists) {
        preAll.push(...(sched || []).filter(isPregameCandidate));
      }

      if (sports.some((s) => {
        const k = String(s || '').toLowerCase().trim();
        return k === 'soccer' || k === 'football' || k === 'all';
      })) {
        const pages = [0, 1, 2, 3];
        const wcLists = await mapLimit(pages, 2, (p) => fetchWorldCupMatches(p).catch(() => []));
        for (const sched of wcLists) {
          preAll.push(...(sched || []).filter(isPregameCandidate));
        }
      }
    }

    const cleanLeague = String(league || '').trim().toLowerCase();
    const filterLeague = (arr: AnyEvent[]) => {
      if (!cleanLeague) return arr;
      return arr.filter((e: any) => String(e?.league || '').toLowerCase().includes(cleanLeague));
    };

    const isBlockedLeague = (leagueName: string, country?: string): boolean => {
      const l = leagueName.toLowerCase().trim();
      const c = (country || '').toLowerCase().trim();

      if (!l) return true;

      // Always block youth / junior / reserve regardless of country
      if (/\bu\d{2}\b/.test(l) || /\bsub-?\d{2}\b/.test(l) ||
          /youth|junior|revelacao|primavera|nextgen|reserve|akademi|juvenil/.test(l) ||
          /under-?\d{2}|under \d{2}/.test(l) ||
          l.includes('u-17') || l.includes('u-21') || l.includes('u-23')) return true;

      // Always block amateur
      if (/amateur|amateure|amador|amatör/.test(l)) return true;

      // Always block women's competitions
      if (/\bwomen\b|\bwoman\b|feminino|femenino|\bdamen\b|\bféminine\b|toppserien|\bwsl\b|\bnwsl\b/.test(l)) return true;

      // Block testspiel
      if (/testspiel/.test(l)) return true;

      // Block known lower-division names that might leak through
      if (/série d|serie d|série e|serie e/.test(l)) return true; // Brazil 4th+ div
      if (/mls next pro/.test(l)) return true;                    // MLS reserve tier
      if (/nations league women|world cup.*women|women.*world cup/.test(l)) return true;

      // ── ALLOWLIST ── only show leagues from the configured list ─────────────
      // Block non-soccer world cups (3x3 basketball, FIBA, etc.)
      if (/\b3x3\b|fiba|basketball.*world|world.*basketball/.test(l)) return true;

      // UEFA / FIFA international competitions — always allowed (men's only after the block above)
      if (/champions league|europa league|conference league|nations league/.test(l)) return false;
      if (/world cup|copa do mundo|copa mundial/.test(l)) return false;
      if (/friendly international|international friendly/.test(l)) return false;
      if (/club friendl/.test(l)) return false;
      if (/olympics|olympic games|jogos ol[íi]mpicos/.test(l)) return false;
      if (/supercopa|super cup|uefa super/.test(l)) return false;
      if (/euro 20\d{2}|euro qualif|world cup qualif/.test(l)) return false;

      // England
      if (/england|inglaterra/.test(c)) {
        if (/premier league|championship|fa cup|efl cup|carabao|league one|league two|league cup/.test(l)) return false;
      }

      // Spain
      if (/spain|espanha|españa/.test(c)) {
        if (/la liga|liga 2|segunda divisi|copa del rey/.test(l)) return false;
      }

      // Germany
      if (/germany|alemanha|deutschland/.test(c)) {
        if (/bundesliga|dfb.?pokal/.test(l)) return false;
      }

      // Italy
      if (/italy|ital/.test(c)) {
        if (/serie a|serie b|coppa italia/.test(l)) return false;
      }

      // France
      if (/france|fran[cç]/.test(c)) {
        if (/ligue 1|ligue 2|coupe de france/.test(l)) return false;
      }

      // Netherlands / Países Baixos
      if (/netherlands|holland|holanda|pa[íi]ses baixos/.test(c)) {
        if (/eredivisie|eerste divisie|knvb/.test(l)) return false;
      }

      // Portugal
      if (/portugal/.test(c) || /portugal/.test(l)) {
        if (/liga portugal|primeira liga|ta[çc]a de portugal|ta[çc]a da liga/.test(l)) return false;
      }
      // Also match by league name alone (proxy returns "Liga Portugal" without country sometimes)
      if (/liga portugal|ta[çc]a de portugal|ta[çc]a da liga/.test(l)) return false;

      // Brazil
      if (/brazil|brasil/.test(c)) {
        if (/brasileir|serie [abc]|copa do brasil|campeonato paulista|campeonato carioca|campeonato mineiro|campeonato ga[uú]cho|campeonato baiano|campeonato pernambucano/.test(l)) return false;
      }
      // By league name alone
      if (/brasileir|copa do brasil/.test(l)) return false;

      // Argentina
      if (/argentina/.test(c)) {
        if (/liga profesional|primera nacional|copa argentina|primera divisi/.test(l)) return false;
      }
      if (/liga profesional argentina/.test(l)) return false;

      // USA
      if (/united states|usa|estados unidos/.test(c)) {
        if (/\bmls\b|us open cup|\busl\b/.test(l)) return false;
      }
      if (/\bmls\b|us open cup/.test(l)) return false;

      // Turkey
      if (/turkey|turquia|türkiye/.test(c)) {
        if (/s[üu]per lig|turkish cup|1\. lig/.test(l)) return false;
      }
      if (/s[üu]per lig/.test(l)) return false;

      // Belgium
      if (/belgium|belgi[qe]|bélgica/.test(c)) {
        if (/jupiler|pro league|belgian cup/.test(l)) return false;
      }
      if (/jupiler/.test(l)) return false;

      // Colombia
      if (/colombia/.test(c)) {
        if (/primera a|primera b|liga bet?play|copa colombia/.test(l)) return false;
      }

      // Denmark
      if (/denmark|dinamarca|danmark/.test(c)) {
        if (/superliga|danish cup|DBU/.test(l)) return false;
      }

      // Greece
      if (/greece|gr[eé]cia|grecia|ellada/.test(c)) {
        if (/super league|greek cup/.test(l)) return false;
      }

      // Japan
      if (/japan|jap[oã]o/.test(c)) {
        if (/j1 league|j2 league|emperor/.test(l)) return false;
      }
      if (/j1 league|j2 league/.test(l)) return false;

      // Mexico
      if (/mexico|méx/.test(c)) {
        if (/liga mx|copa mx|expansi[oó]n/.test(l)) return false;
      }
      if (/liga mx/.test(l)) return false;

      // Saudi Arabia
      if (/saudi/.test(c)) {
        if (/pro league|professional league|saudi/.test(l)) return false;
      }
      if (/saudi pro league|saudi professional/.test(l)) return false;

      // Switzerland
      if (/switzerland|su[íi][çc]a|schweiz/.test(c)) {
        if (/super league|swiss cup|challenge league/.test(l)) return false;
      }

      // Uruguay
      if (/uruguay/.test(c)) {
        if (/primera divisi/.test(l)) return false;
      }

      // Scotland — allow all recognised Scottish leagues
      if (/scotland|esc[oó]cia/.test(c)) {
        if (/premiership|cup|championship|league/.test(l)) return false;
      }

      // Everything else is blocked
      return true;
    };

    if (includeLive) {
      const sportSet = new Set(sports);
      const ids = new Set(liveAll.map((e: any) => String((e as any)?.id || '')));
      for (const [id, entry] of liveSeen.entries()) {
        if (!ttlOk(entry.ts, LIVE_HOLD_MS)) continue;
        if (ids.has(id)) continue;
        if (!sportSet.has(entry.data.sport)) continue;
        if (isFinishedLike(entry.data.event)) continue;
        liveAll.push({ ...(entry.data.event as any), id, is_live: 1 });
      }
    }

    const sortStable = (arr: AnyEvent[]) => {
      return [...arr].sort((a: any, b: any) => {
        const at = toStartMs(a);
        const bt = toStartMs(b);
        if (at && bt && at !== bt) return at - bt;
        const al = String((a as any)?.league || '');
        const bl = String((b as any)?.league || '');
        const lc = al.localeCompare(bl, 'pt-PT');
        if (lc !== 0) return lc;
        return String((a as any)?.id || '').localeCompare(String((b as any)?.id || ''), 'pt-PT');
      });
    };

    const dayKeyOf = (e: any): string => {
      const raw = (e as any)?.event_date ?? (e as any)?.fixture?.date ?? (e as any)?.start_time ?? (e as any)?.startTimestamp;
      if (typeof raw === 'string') {
        const m = raw.match(/\d{4}-\d{2}-\d{2}/);
        if (m) return m[0] || '';
      }
      const t = toStartMs(e);
      return t ? ymd(new Date(t)) : '';
    };

    const spreadAcrossDays = (arr: AnyEvent[], desiredDays: number, overallLimit: number): AnyEvent[] => {
      const list = Array.isArray(arr) ? arr : [];
      if (overallLimit <= 0) return [];
      if (list.length <= overallLimit) return list;
      if (desiredDays <= 1) return list.slice(0, overallLimit);

      const byDay = new Map<string, AnyEvent[]>();
      for (const e of list) {
        const k = dayKeyOf(e);
        if (!k) continue;
        const bucket = byDay.get(k);
        if (bucket) bucket.push(e);
        else byDay.set(k, [e]);
      }

      const expectedDays: string[] = [];
      for (let i = 0; i < Math.min(14, desiredDays); i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        expectedDays.push(ymd(d));
      }

      const perDayLimit = Math.max(10, Math.floor(overallLimit / Math.max(1, expectedDays.length)));
      const out: AnyEvent[] = [];
      const taken = new Map<string, number>();
      const idx = new Map<string, number>();

      for (;;) {
        if (out.length >= overallLimit) break;
        let progressed = false;
        for (const d of expectedDays) {
          if (out.length >= overallLimit) break;
          const bucket = byDay.get(d);
          if (!bucket || bucket.length === 0) continue;
          const used = taken.get(d) || 0;
          if (used >= perDayLimit) continue;
          const i = idx.get(d) || 0;
          if (i >= bucket.length) continue;
          out.push(bucket[i]);
          idx.set(d, i + 1);
          taken.set(d, used + 1);
          progressed = true;
        }
        if (!progressed) break;
      }

      for (const d of expectedDays) {
        if (out.length >= overallLimit) break;
        const bucket = byDay.get(d);
        if (!bucket || bucket.length === 0) continue;
        const i0 = idx.get(d) || 0;
        for (let i = i0; i < bucket.length && out.length < overallLimit; i++) {
          out.push(bucket[i]);
        }
      }

      return out.length > 0 ? out : list.slice(0, overallLimit);
    };

    const filterBlocked = (arr: AnyEvent[]) =>
      allowBlocked
        ? arr
        : arr.filter((e: any) => !isBlockedLeague(String((e as any)?.league || ''), String((e as any)?.country || '')));
    const live = sortStable(filterBlocked(filterLeague(liveAll))).slice(0, 120);
    const preSorted = sortStable(filterBlocked(filterLeague(preAll)));
    const preLimit = days > 1 ? 300 : 120;
    const pregame = days > 1 ? spreadAcrossDays(preSorted, days, preLimit) : preSorted.slice(0, preLimit);

    if (!includeOdds) {
      return { live, pregame };
    }

    for (const e of live) queueOddsRefresh(String((e as any)?.sport || ''), String((e as any)?.id || ''));
    for (const e of pregame) queueOddsRefresh(String((e as any)?.sport || ''), String((e as any)?.id || ''));

    const oddsFromCache = (sport: string, matchId: string): any | null => {
      const key = `${sport}:${matchId}`;
      const cached = oddsCache.get(key);
      if (!cached) return null;
      if (cached.data == null) return null;
      if (!ttlOk(cached.ts, ODDS_STALE_TTL_MS)) return null;
      return cached.data;
    };

    const hasAnyMarkets = (mkObj: any): boolean => {
      if (!mkObj || typeof mkObj !== 'object') return false;
      if (Array.isArray(mkObj)) return mkObj.length > 0;
      const entries = Object.entries(mkObj as Record<string, any>).slice(0, 80);
      for (const [, v] of entries) {
        if (!v) continue;
        if (Array.isArray(v) && v.length > 0) return true;
        if (typeof v === 'object') {
          const inner = (v as any).selections || (v as any).outcomes || (v as any).values || (v as any).lines;
          if (Array.isArray(inner) && inner.length > 0) return true;
          if (Object.keys(v as any).length > 0) return true;
        }
      }
      return Object.keys(mkObj as any).length > 0;
    };

    const hasAnyOddsFromOdds = (odds: any): boolean => {
      const h = Number(odds?.home || 0);
      const d = Number(odds?.draw || 0);
      const a = Number(odds?.away || 0);
      if (h > 1 && a > 1) return true;
      if (d > 1) return true;
      const mkObj = odds?.markets && typeof odds.markets === 'object' ? odds.markets : null;
      return hasAnyMarkets(mkObj);
    };

    const hasAnyOddsEvent = (e: any) => {
      const h = Number(e?.home_odd || 0);
      const d = Number(e?.draw_odd || 0);
      const a = Number(e?.away_odd || 0);
      if (h > 1 && a > 1) return true;
      if (d > 1) return true;
      const mkRaw = (e as any)?.markets ?? (e as any)?.odds;
      const mkObj = mkRaw && typeof mkRaw === 'object' ? mkRaw : parseMarkets(mkRaw);
      return hasAnyMarkets(mkObj);
    };

    if (realtime) {
      const budget0 = { remaining: 0 };

      const liveFiltered = includeLive ? live : [];
      const preFiltered = includePregame ? pregame : [];

      const liveEnriched = includeLive ? await mapLimit(liveFiltered, 10, (x) => enrichEventOdds(x, budget0, fullMarkets)) : [];
      const preEnriched = includePregame ? await mapLimit(preFiltered, 8, (x) => enrichEventOdds(x, budget0, fullMarkets)) : [];
      return { live: liveEnriched, pregame: preEnriched };
    }

    const liveBudget = { remaining: Math.min(30, live.length) };
    const liveEnriched = await mapLimit(live, 10, (x) => enrichEventOdds(x, liveBudget, fullMarkets));
    let preEnriched: AnyEvent[] = pregame;
    if (includePregame && pregame.length > 0) {
      const eagerCount = Math.min(requireOdds ? 80 : 24, pregame.length);
      const head = pregame.slice(0, eagerCount);
      const tail = pregame.slice(eagerCount);
      const preBudget = { remaining: head.length };
      const headEnriched = await mapLimit(head, 10, (x) => enrichEventOdds(x, preBudget, fullMarkets));
      preEnriched = [...headEnriched, ...tail];
    }

    const filteredLive = requireOdds && includeLive ? liveEnriched.filter(hasAnyOddsEvent) : liveEnriched;
    const filteredPregame = requireOdds && includePregame
      ? preEnriched.filter((e: any) => {
          if (hasAnyOddsEvent(e)) return true;
          const sport = String(e?.sport || '').trim();
          if (!sport) return false;
          const id = matchIdOf(e);
          if (!id) return false;
          const odds = oddsFromCache(sport, id);
          return odds ? hasAnyOddsFromOdds(odds) : false;
        })
      : preEnriched;
    return { live: filteredLive, pregame: filteredPregame };
  };

  const handleEventsRoutes = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> => {
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (req.method === 'GET' && path === '/api/sports') {
      sendJson(res, 200, SPORTS_DEFAULT.slice());
      return true;
    }

    if (req.method === 'GET' && path === '/api/events/by-sport') {
      const sports = url.searchParams.get('sports');
      const include = url.searchParams.get('include');
      const includeOdds = String(include || '').toLowerCase().includes('odds');
      const league = url.searchParams.get('league');
      const realtime = String(url.searchParams.get('realtime') || '') === '1';
      const onlyRaw = String(url.searchParams.get('only') || '').toLowerCase().trim();
      const only = onlyRaw === 'live' || onlyRaw === 'pregame' ? (onlyRaw as any) : 'both';
      const requireOdds = String(url.searchParams.get('requireOdds') || '') === '1';
      const allowBlocked = String(url.searchParams.get('allowBlocked') || '') === '1';
      const daysParam = Number(url.searchParams.get('days') || 0);
      const daysAhead = Number.isFinite(daysParam) ? Math.max(0, Math.min(14, Math.floor(daysParam))) : 0;
      const fullMarkets =
        String(url.searchParams.get('markets') || '').toLowerCase() === 'full' ||
        String(url.searchParams.get('markets') || '').toLowerCase() === 'all';
      const cacheKey = `bySport:${String(sports || 'all')}|league:${String(league || '')}|includeOdds:${includeOdds ? '1' : '0'}|realtime:${realtime ? '1' : '0'}|fullMarkets:${fullMarkets ? '1' : '0'}|only:${only}|days:${daysAhead}|requireOdds:${requireOdds ? '1' : '0'}|allowBlocked:${allowBlocked ? '1' : '0'}`;
      const cached = bySportCache.get(cacheKey);
      const ttl = realtime ? 2_000 : includeOdds ? 12_000 : 25_000;
      if (cached && ttlOk(cached.ts, ttl)) {
        sendJson(res, 200, cached.data);
        return true;
      }
      const defaultDays = only === 'live' ? 0 : 7;
      const data = await buildBySport(
        sports,
        includeOdds,
        league,
        realtime,
        fullMarkets,
        only,
        daysAhead || defaultDays,
        requireOdds,
        allowBlocked,
      ).catch(() => ({ live: [], pregame: [] }));
      bySportCache.set(cacheKey, { ts: nowMs(), data });
      sendJson(res, 200, data);
      return true;
    }

    if (req.method === 'GET' && path === '/api/world-cup-2026') {
      const data = await fetchWorldCupMeta('tournament').catch(() => null);
      sendJson(res, 200, data || {});
      return true;
    }

    if (req.method === 'GET' && path === '/api/world-cup-2026/info') {
      const data = await fetchWorldCupMeta('info').catch(() => null);
      sendJson(res, 200, data || {});
      return true;
    }

    if (req.method === 'GET' && path === '/api/world-cup-2026/groups') {
      const data = await fetchWorldCupMeta('groups').catch(() => null);
      sendJson(res, 200, data || {});
      return true;
    }

    if (req.method === 'GET' && path === '/api/world-cup-2026/matches') {
      const pageRaw = Number(url.searchParams.get('page') || 0);
      const page = Number.isFinite(pageRaw) ? Math.max(0, Math.min(20, Math.floor(pageRaw))) : 0;
      const data = await fetchWorldCupMatches(page).catch(() => []);
      sendJson(res, 200, { page, matches: data });
      return true;
    }

    if (req.method === 'GET' && path === '/api/dev/odds-debug') {
      const tokenEnv = String(process.env.ODDS_DEBUG_TOKEN || '').trim();
      if (!tokenEnv) return false;
      const token = String(url.searchParams.get('token') || req.headers['x-debug-token'] || '').trim();
      if (!token || token !== tokenEnv) return sendJson(res, 403, { error: 'Forbidden' }), true;

      const sport = String(url.searchParams.get('sport') || '').trim() || 'soccer';
      const idRaw = String(url.searchParams.get('id') || '').trim();
      const mode = String(url.searchParams.get('mode') || 'all').trim().toLowerCase();
      if (!idRaw) return sendJson(res, 400, { error: 'Missing id' }), true;
      if (mode !== 'all' && mode !== 'live' && mode !== 'pre-match') return sendJson(res, 400, { error: 'Invalid mode' }), true;
      const id = normalizeMatchId(sport, idRaw) || normalizeIdLoose(idRaw);

      const normalizeSportKey = (s: string): string =>
        String(s || '')
          .toLowerCase()
          .trim()
          .replace(/[_\s]+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      const toSubdomain = (s: string): string => {
        const k = normalizeSportKey(s);
        if (k === 'football' || k === 'futebol' || k === 'soccer') return 'football';
        if (k === 'hockey' || k === 'icehockey' || k === 'ice-hockey') return 'hockey';
        return k || 'football';
      };

      const sub = toSubdomain(sport);
      const targetUrl = `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(id)}/odds/${mode}`;
      try {
        const r = await fetch(targetUrl, { headers: { 'x-api-key': apiKey, accept: 'application/json' } });
        const text = await r.text().catch(() => '');
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        const topKeys = json && typeof json === 'object' ? Object.keys(json).slice(0, 30) : [];
        sendJson(res, 200, {
          url: targetUrl,
          status: r.status,
          ok: r.ok,
          idRaw,
          idUsed: id,
          topKeys,
          bodyPreview: String(text || '').slice(0, 1600),
        });
      } catch (e: any) {
        sendJson(res, 200, { url: targetUrl, status: 0, ok: false, error: String(e?.message || e) });
      }
      return true;
    }

    if (req.method === 'GET' && path === '/api/dev/cache-debug') {
      const tokenEnv = String(process.env.ODDS_DEBUG_TOKEN || '').trim();
      if (!tokenEnv) return false;
      const token = String(url.searchParams.get('token') || req.headers['x-debug-token'] || '').trim();
      if (!token || token !== tokenEnv) return sendJson(res, 403, { error: 'Forbidden' }), true;

      const at = (ts: number) => (ts ? nowMs() - ts : 0);
      const sample = <T>(m: Map<string, CacheEntry<T>>, n: number) => {
        const out: Array<{ key: string; ageMs: number }> = [];
        for (const [k, v] of m.entries()) {
          out.push({ key: k, ageMs: at(v.ts) });
        }
        out.sort((a, b) => a.ageMs - b.ageMs);
        return out.slice(0, n);
      };

      sendJson(res, 200, {
        liveCache: { size: liveCache.size, sample: sample(liveCache as any, 6) },
        scheduleCache: { size: scheduleCache.size, sample: sample(scheduleCache as any, 6) },
        bySportCache: { size: bySportCache.size, sample: sample(bySportCache as any, 6) },
        oddsCache: { size: oddsCache.size, sample: sample(oddsCache as any, 12) },
        oddsInflight: { size: oddsInflight.size },
        oddsQueue: { length: oddsQueue.length },
        oddsQueued: { size: oddsQueued.size },
        idToSport: { size: idToSport.size },
        liveSeen: { size: liveSeen.size },
      });
      return true;
    }

    if (req.method === 'GET' && path === '/api/dev/schedule-debug') {
      const tokenEnv = String(process.env.ODDS_DEBUG_TOKEN || '').trim();
      if (!tokenEnv) return false;
      const token = String(url.searchParams.get('token') || req.headers['x-debug-token'] || '').trim();
      if (!token || token !== tokenEnv) return sendJson(res, 403, { error: 'Forbidden' }), true;

      const sport = String(url.searchParams.get('sport') || '').trim() || 'soccer';
      const date = String(url.searchParams.get('date') || '').trim() || ymd(new Date());
      const normalizeSportKey = (s: string): string =>
        String(s || '')
          .toLowerCase()
          .trim()
          .replace(/[_\s]+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      const toSubdomain = (s: string): string => {
        const k = normalizeSportKey(s);
        if (k === 'football' || k === 'futebol' || k === 'soccer') return 'football';
        if (k === 'hockey' || k === 'icehockey' || k === 'ice-hockey') return 'hockey';
        return k || 'football';
      };
      const sub = toSubdomain(sport);
      const targetUrl = `https://v2.${sub}.sportsapipro.com/api/schedule/${encodeURIComponent(date)}?timezoneName=UTC`;
      try {
        const r = await fetch(targetUrl, { headers: { 'x-api-key': apiKey, accept: 'application/json' } });
        const text = await r.text().catch(() => '');
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        const extractedCount = (() => {
          try {
            const items = (json as any) ? (Array.isArray((json as any).events) ? (json as any).events : Array.isArray((json as any).data?.events) ? (json as any).data.events : null) : null;
            if (Array.isArray(items)) return items.length;
            return 0;
          } catch {
            return 0;
          }
        })();
        const normalizedCount = (() => {
          try {
            // use the same extractor as the service layer, but without importing it
            const payload = json;
            if (!payload) return 0;
            if (Array.isArray((payload as any).events)) return (payload as any).events.length;
            if (Array.isArray((payload as any).data?.events)) return (payload as any).data.events.length;
            const tournaments = (payload as any).data?.tournaments ?? (payload as any).tournaments;
            if (Array.isArray(tournaments)) {
              let n = 0;
              for (const t of tournaments) {
                const arr = t?.events ?? t?.matches ?? t?.games ?? [];
                if (Array.isArray(arr)) n += arr.length;
              }
              return n;
            }
            return 0;
          } catch {
            return 0;
          }
        })();
        const topKeys = json && typeof json === 'object' ? Object.keys(json).slice(0, 30) : [];
        sendJson(res, 200, {
          url: targetUrl,
          status: r.status,
          ok: r.ok,
          sport,
          date,
          topKeys,
          extractedCount,
          normalizedCount,
          bodyPreview: String(text || '').slice(0, 1600),
        });
      } catch (e: any) {
        sendJson(res, 200, { url: targetUrl, status: 0, ok: false, error: String(e?.message || e) });
      }
      return true;
    }

    const evMatch = path.match(/^\/api\/events\/([^/]+)$/);
    if (evMatch && req.method === 'GET') {
      const idRaw = decodeURIComponent(evMatch[1] || '');
      const id = normalizeIdLoose(idRaw);
      const cached = lastEventById.get(id);
      if (cached && ttlOk(cached.ts, 30 * 60_000)) {
        sendJson(res, 200, cached.data);
        return true;
      }
      const sport = await resolveSport(id);
      if (!sport) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
      const live = await fetchLive(sport).catch(() => []);
      const foundLive = live.find((e: any) => String(e.id) === String(id));
      if (foundLive) return sendJson(res, 200, foundLive), true;
      const date = ymd(new Date());
      const sched = await fetchSchedule(sport, date).catch(() => []);
      const found = sched.find((e: any) => String(e.id) === String(id));
      if (found) return sendJson(res, 200, found), true;
      return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
    }

    const oddsMatch = path.match(/^\/api\/events\/([^/]+)\/odds$/);
    if (oddsMatch && req.method === 'GET') {
      const idRaw = decodeURIComponent(oddsMatch[1] || '');
      const id = normalizeIdLoose(idRaw);
      const sportParam = String(url.searchParams.get('sport') || '').trim();
      const sport = sportParam || await resolveSport(id);
      if (!sport) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
      const odds = await fetchOddsStrict(sport, id, { forceAll: true }).catch(() => null);
      const markets = odds?.markets || {};
      sendJson(res, 200, { home: odds?.home || 0, draw: odds?.draw || 0, away: odds?.away || 0, markets });
      return true;
    }

    const statsMatch = path.match(/^\/api\/events\/([^/]+)\/stats$/);
    if (statsMatch && req.method === 'GET') {
      const idRaw = decodeURIComponent(statsMatch[1] || '');
      const id = normalizeIdLoose(idRaw);
      const sportParam = String(url.searchParams.get('sport') || '').trim();
      const sport = sportParam || await resolveSport(id);
      if (!sport) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
      const statsRaw = await fetchSportsApiProMatchStatistics(apiKey, sport, id).catch(() => null);

      // Normalise a SportsApiPro v2 home/away object into API-Football statistics array
      const normalizeStatsObject = (obj: any, teamLabel: string): any[] => {
        if (!obj || typeof obj !== 'object') return [];
        const map: Record<string, string> = {
          possession: 'Ball Possession',
          ball_possession: 'Ball Possession',
          shots_on_target: 'Shots on Goal',
          on_target: 'Shots on Goal',
          total_shots: 'Total Shots',
          shots_total: 'Total Shots',
          shots_off_target: 'Shots off Goal',
          corners: 'Corner Kicks',
          corner_kicks: 'Corner Kicks',
          yellow_cards: 'Yellow Cards',
          red_cards: 'Red Cards',
          fouls: 'Fouls',
          offsides: 'Offsides',
          saves: 'Goalkeeper Saves',
          attacks: 'Total Attacks',
          dangerous_attacks: 'Dangerous Attacks',
          passes: 'Total passes',
          pass_accuracy: 'Passes accurate',
          free_kicks: 'Free Kicks',
          goal_kicks: 'Goal Kicks',
          throw_ins: 'Throw-in',
        };
        return Object.entries(obj)
          .filter(([k]) => map[k.toLowerCase()])
          .map(([k, v]) => ({ type: map[k.toLowerCase()], value: v, team: { name: teamLabel } }));
      };

      // Extract stats from various SportsApiPro response formats
      const extractStats = (raw: any): any[] => {
        if (!raw) return [];
        // Direct array
        if (Array.isArray(raw)) return raw;
        // API-Football style: { data: { response: [{ statistics: [...] }] } }
        if (Array.isArray(raw.data?.response?.[0]?.statistics)) return raw.data.response[0].statistics;
        if (Array.isArray(raw.data?.response)) return raw.data.response;
        if (Array.isArray(raw.data?.statistics)) return raw.data.statistics;
        if (Array.isArray(raw.statistics)) return raw.statistics;
        if (Array.isArray(raw.data?.stats)) return raw.data.stats;
        if (Array.isArray(raw.stats)) return raw.stats;
        // SportsApiPro v2: { data: { home: {...}, away: {...} } }
        const d = raw.data ?? raw;
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          const homeStats = d.home ?? d.home_team ?? d.homeTeam;
          const awayStats = d.away ?? d.away_team ?? d.awayTeam;
          if (homeStats || awayStats) {
            return [
              ...normalizeStatsObject(homeStats, 'home'),
              ...normalizeStatsObject(awayStats, 'away'),
            ];
          }
          // Flat object with direct stat keys
          const flatKeys = ['possession', 'ball_possession', 'shots', 'corners', 'yellow_cards'];
          if (flatKeys.some(k => k in d)) {
            return normalizeStatsObject(d, 'home');
          }
        }
        return [];
      };
      const extractMatchEvents = (raw: any): any[] => {
        if (!raw) return [];
        if (Array.isArray(raw.data?.events)) return raw.data.events;
        if (Array.isArray(raw.events)) return raw.events;
        if (Array.isArray(raw.data?.matchEvents)) return raw.data.matchEvents;
        if (Array.isArray(raw.matchEvents)) return raw.matchEvents;
        if (Array.isArray(raw.data?.incidents)) return raw.data.incidents;
        if (Array.isArray(raw.incidents)) return raw.incidents;
        if (Array.isArray(raw.data?.response)) return raw.data.response;
        return [];
      };
      const stats = extractStats(statsRaw);
      const events = extractMatchEvents(statsRaw);
      sendJson(res, 200, { stats, events, _debug: statsRaw ? Object.keys(statsRaw) : [], _rawKeys: statsRaw?.data ? Object.keys(statsRaw.data) : [] });
      return true;
    }

    // ── /api/events/:id/incidents ─────────────────────────────────────────
    const incidentsMatch = path.match(/^\/api\/events\/([^/]+)\/incidents$/);
    if (incidentsMatch && req.method === 'GET') {
      const idRaw = decodeURIComponent(incidentsMatch[1] || '');
      const id = normalizeIdLoose(idRaw);
      const sportParam = String(url.searchParams.get('sport') || '').trim();
      const sport = sportParam || await resolveSport(id);
      if (!sport) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;

      // Fetch incidents and statistics in parallel
      const [incidentsRaw, statsRaw] = await Promise.all([
        fetchSportsApiProMatchIncidents(apiKey, sport, id).catch(() => null),
        fetchSportsApiProMatchStatistics(apiKey, sport, id).catch(() => null),
      ]);

      // Map SportsApiPro typeId → canonical incident type
      const TYPE_MAP: Record<number, string> = {
        1:  'goal',
        2:  'yellow_card',
        3:  'red_card',
        4:  'yellow_red',
        5:  'substitution',
        6:  'penalty',
        7:  'own_goal',
        8:  'missed_penalty',
        9:  'disallowed_goal',
        10: 'VAR',
        11: 'penalty_awarded',
        12: 'injury',
        13: 'offside',
      };

      const extractIncidents = (raw: any): any[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw.data?.incidents)) return raw.data.incidents;
        if (Array.isArray(raw.incidents)) return raw.incidents;
        if (Array.isArray(raw.data?.events)) return raw.data.events;
        if (Array.isArray(raw.events)) return raw.events;
        if (Array.isArray(raw.data)) return raw.data;
        return [];
      };

      const rawIncidents = extractIncidents(incidentsRaw);
      const incidents = rawIncidents.map((inc: any, i: number) => {
        const typeId = Number(inc.typeId ?? inc.type_id ?? inc.incident_type ?? 0);
        const canonicalType = TYPE_MAP[typeId] || inc.type || 'other';
        const minute = Number(inc.time ?? inc.minute ?? inc.elapsed ?? 0);
        const addedTime = Number(inc.addedTime ?? inc.added_time ?? inc.injuryTime ?? 0);
        const teamSide = String(inc.teamSide ?? inc.team_side ?? inc.team ?? '').toLowerCase();
        const isHome = teamSide === 'home' || teamSide === '1';
        const isAway = teamSide === 'away' || teamSide === '2';
        const player = inc.player?.name ?? inc.playerName ?? inc.player ?? null;
        const assist = inc.player2?.name ?? inc.assistName ?? inc.assist ?? null;
        return {
          id: String(inc.id ?? `${id}-${i}`),
          typeId,
          type: canonicalType,
          minute,
          addedTime,
          team: isHome ? 'home' : isAway ? 'away' : null,
          player,
          assist,
          description: inc.description ?? inc.text ?? null,
          isConfirmed: inc.isConfirmed ?? inc.confirmed ?? inc.is_confirmed ?? true,
        };
      });

      // Extract Big Chances Created (stat ID 24) from statistics
      const extractBigChances = (raw: any): { home: number; away: number } => {
        const empty = { home: 0, away: 0 };
        if (!raw) return empty;
        const d = raw.data ?? raw;
        // Array format: [{id:24, name:'Big Chances Created', home:X, away:Y}]
        if (Array.isArray(d)) {
          const stat = d.find((s: any) => s.id === 24 || s.name === 'Big Chances Created');
          if (stat) return { home: Number(stat.home ?? stat.homeValue ?? 0), away: Number(stat.away ?? stat.awayValue ?? 0) };
        }
        // Object format: { home: { big_chances: X }, away: { big_chances: X } }
        if (d && typeof d === 'object') {
          const h = d.home?.big_chances ?? d.home?.bigChances ?? d.big_chances_created?.home ?? null;
          const a = d.away?.big_chances ?? d.away?.bigChances ?? d.big_chances_created?.away ?? null;
          if (h !== null || a !== null) return { home: Number(h ?? 0), away: Number(a ?? 0) };
        }
        return empty;
      };

      const bigChances = extractBigChances(statsRaw);

      sendJson(res, 200, {
        incidents,
        bigChances,
        _meta: { total: incidents.length, matchId: id, sport },
      });
      return true;
    }

    if (req.method === 'POST' && path === '/api/dev/force-import') {
      sendJson(res, 200, { ok: true });
      return true;
    }

    return false;
  };

  const getAdminOddsEvents = async (): Promise<any[]> => {
    const data = await buildBySport('all', true, null, false, true, 'both', 7, false, false);
    const all = [...data.live, ...data.pregame];
    return all.map((e: any) => ({
      id: String(e.id),
      home_team: String(e.home_team || ''),
      away_team: String(e.away_team || ''),
      league: String(e.league || ''),
      home_odd: Number(e.home_odd || 0),
      draw_odd: Number(e.draw_odd || 0),
      away_odd: Number(e.away_odd || 0),
      is_live: Number(e.is_live || 0),
      sport: String(e.sport || ''),
    }));
  };

  const setOddsOverride = async (eventId: string, odds: { home_odd?: number; draw_odd?: number; away_odd?: number }): Promise<void> => {
    if (!pool) throw new Error('Database not configured');
    const ho = odds.home_odd != null ? Number(odds.home_odd) : null;
    const doo = odds.draw_odd != null ? Number(odds.draw_odd) : null;
    const ao = odds.away_odd != null ? Number(odds.away_odd) : null;
    if ((ho != null && !Number.isFinite(ho)) || (doo != null && !Number.isFinite(doo)) || (ao != null && !Number.isFinite(ao))) {
      throw new Error('Invalid odds');
    }
    await pool.query(
      `INSERT INTO odds_overrides (event_id, home_odd, draw_odd, away_odd, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (event_id) DO UPDATE SET home_odd = EXCLUDED.home_odd, draw_odd = EXCLUDED.draw_odd, away_odd = EXCLUDED.away_odd, updated_at = NOW()`,
      [eventId, ho, doo, ao],
    );
    overridesCache.delete(eventId);
  };

  return { handleEventsRoutes, getAdminOddsEvents, setOddsOverride };
}
