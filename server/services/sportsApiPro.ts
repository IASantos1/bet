export interface NormalizedEvent {
  external_event_id: string;
  sport: string;
  league: string;
  home_team: string;
  away_team: string;
  team_match: string;
  event_date: string;
  status: string;
  status_short?: string;
  status_long?: string;
  is_live: number;
  home_odd: number;
  draw_odd: number;
  away_odd: number;
  elapsed: number;
  timer: string;
  score: string;
  markets: string;
  country: string;
  home_team_logo: string;
  away_team_logo: string;
  fixture?: any;
  teams?: any;
  goals?: any;
}

export interface OddsResult {
  home: number;
  draw: number;
  away: number;
  markets: Record<string, any[]>;
}

function apiHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    accept: 'application/json',
  };
}

function normalizeSportKey(sport: string): string {
  const raw = String(sport || '').toLowerCase().trim();
  const primary = raw.split(',')[0]?.split('|')[0] ?? '';
  return primary
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function toSubdomain(sport: string): string {
  const s = normalizeSportKey(sport);
  if (s === 'football' || s === 'futebol' || s === 'soccer') return 'football';
  if (s === 'hockey' || s === 'icehockey' || s === 'ice-hockey') return 'hockey';
  return s || 'football';
}

function extractEvents(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.data?.events)) return payload.data.events;
  if (Array.isArray(payload.response)) return payload.response;
  if (Array.isArray(payload.data?.response)) return payload.data.response;
  if (Array.isArray(payload.data) && payload.data.length > 0) return payload.data;
  if (Array.isArray(payload.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload.matches)) return payload.matches;
  if (Array.isArray(payload.data?.schedule)) return payload.data.schedule;
  const tournaments = payload.data?.tournaments ?? payload.tournaments;
  if (Array.isArray(tournaments)) {
    const out: any[] = [];
    for (const t of tournaments) {
      const arr = t?.events ?? t?.matches ?? t?.games ?? [];
      if (Array.isArray(arr)) out.push(...arr);
    }
    return out;
  }
  return [];
}

function num(v: any): number {
  const n = typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickScore(x: any): number | null {
  if (x == null) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'string') {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  const candidates = [x.current, x.display, x.normaltime, x.total];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function statusText(status: any): string {
  return String(status?.description ?? status?.type ?? status ?? '').trim();
}

function statusKey(status: any): string {
  return statusText(status)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

function isFinishedStatus(status: any): boolean {
  const k = statusKey(status);
  if (!k) return false;
  if (
    k === 'FT' ||
    k === 'FINAL' ||
    k === 'FINISHED' ||
    k === 'ENDED' ||
    k === 'END' ||
    k === 'FULL_TIME' ||
    k === 'MATCH_FINISHED' ||
    k === 'COMPLETED' ||
    k === 'CANCELLED' ||
    k === 'CANCELED' ||
    k === 'POSTPONED' ||
    k === 'SUSPENDED' ||
    k === 'ABANDONED' ||
    k === 'WALKOVER' ||
    k === 'WO'
  ) return true;
  if (/FINISH|ENDED|FINAL|FULLTIME|GAMEOVER|CANCEL|POSTPON|ABANDON|WALKOVER/.test(k)) return true;
  return false;
}

function isNotStartedStatus(status: any): boolean {
  const k = statusKey(status);
  if (!k) return true;
  if (k === 'NS' || k === 'SCHEDULED' || k === 'UPCOMING' || k === 'NOT_STARTED' || k === 'PRE_MATCH') return true;
  if (/NOT_STARTED|SCHEDUL|UPCOMING|TIMED|PRE_MATCH/.test(k)) return true;
  return false;
}

function isLive(status: any): boolean {
  if (isFinishedStatus(status)) return false;
  if (isNotStartedStatus(status)) return false;
  const s = statusText(status).toLowerCase();
  if (!s) return false;
  if (s.includes('inprogress') || s.includes('in progress') || s.includes('live')) return true;
  if (s.includes('half') || s.includes('quarter') || s.includes('inning') || s.includes('set')) return true;
  if (s.includes('1st') || s.includes('2nd') || s.includes('3rd') || s.includes('4th')) return true;
  return false;
}

function deriveElapsedAndTimer(sport: string, e: any): { elapsed: number; timer: string } {
  const takeNum = (v: any) => {
    const n = typeof v === 'string' ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 1000) return null;
    return n;
  };
  const takeTimer = (v: any) => {
    const t = String(v ?? '').trim();
    if (!t) return '';
    if (t.length > 16) return '';
    return t;
  };

  const elapsedCandidates = [
    e?.elapsed,
    e?.time?.elapsed,
    e?.time?.minute,
    e?.minute,
    e?.status?.elapsed,
    e?.status?.minute,
    e?.clock?.minute,
    e?.clock?.minutes,
  ];

  let elapsed = 0;
  for (const c of elapsedCandidates) {
    const n = takeNum(c);
    if (n == null || n === 0) continue;
    elapsed = n;
    break;
  }

  const timerCandidates = [
    e?.timer,
    e?.time?.timer,
    e?.clock?.display,
    e?.clock?.time,
    e?.status?.timer,
  ];
  let timer = '';
  for (const c of timerCandidates) {
    const t = takeTimer(c);
    if (!t) continue;
    timer = t;
    break;
  }

  const sportKey = normalizeSportKey(sport);

  if (!timer && elapsed > 0) {
    if (sportKey === 'soccer' || sportKey === 'football') timer = `${elapsed}'`;
    else timer = String(elapsed);
  }

  void import('node:fs').then((fs) => {
    let u = '';
    let s = '';
    try {
      const env = fs.readFileSync('.dbg/live-delay-clock.env', 'utf8');
      u = /DEBUG_SERVER_URL=(.+)/.exec(env)?.[1] || '';
      s = /DEBUG_SESSION_ID=(.+)/.exec(env)?.[1] || '';
    } catch { void 0; }
    if (!u || !s) return;
    const status = String(e?.status?.description ?? e?.status?.type ?? e?.status ?? e?.statusCode ?? e?.statusText ?? '');
    fetch(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: s,
        runId: 'pre',
        hypothesisId: 'B',
        location: 'server/services/sportsApiPro.ts:deriveElapsedAndTimer',
        msg: '[DEBUG] deriveElapsedAndTimer',
        data: {
          sport: String(sport || ''),
          sportKey,
          status,
          elapsed,
          timer,
          candidates: {
            elapsed: {
              e: e?.elapsed ?? null,
              timeElapsed: e?.time?.elapsed ?? null,
              timeMinute: e?.time?.minute ?? null,
              minute: e?.minute ?? null,
              statusElapsed: e?.status?.elapsed ?? null,
              statusMinute: e?.status?.minute ?? null,
              clockMinute: e?.clock?.minute ?? null,
              clockMinutes: e?.clock?.minutes ?? null,
            },
            timer: {
              e: e?.timer ?? null,
              timeTimer: e?.time?.timer ?? null,
              clockDisplay: e?.clock?.display ?? null,
              clockTime: e?.clock?.time ?? null,
              statusTimer: e?.status?.timer ?? null,
            },
          },
          start: { startTimestamp: e?.startTimestamp ?? null, startTime: e?.startTime ?? null, event_date: e?.event_date ?? null },
        },
        ts: Date.now(),
      }),
    }).catch(() => null);
  }).catch(() => null);

  return { elapsed: Number.isFinite(elapsed) ? elapsed : 0, timer };
}

function extractTennisSets(e: any): Record<string, { home: number | null; away: number | null }> | null {
  const byIndex = new Map<number, { home: number | null; away: number | null }>();
  const toNumOrNull = (v: any): number | null => {
    const n = typeof v === 'string' ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const put = (idx: number, pair: { home: number | null; away: number | null } | null) => {
    if (!pair) return;
    if (!Number.isFinite(idx) || idx < 1 || idx > 10) return;
    if (pair.home === null && pair.away === null) return;
    const prev = byIndex.get(idx);
    if (!prev) {
      byIndex.set(idx, pair);
      return;
    }
    const home = prev.home === null ? pair.home : prev.home;
    const away = prev.away === null ? pair.away : prev.away;
    byIndex.set(idx, { home, away });
  };

  const readPairFromObj = (obj: any, key: string): { home: number | null; away: number | null } | null => {
    const v = obj?.[key];
    if (!v || typeof v !== 'object') return null;
    const h = toNumOrNull((v as any).home ?? (v as any).h ?? (v as any).homeScore);
    const a = toNumOrNull((v as any).away ?? (v as any).a ?? (v as any).awayScore);
    if (h === null && a === null) return null;
    return { home: h, away: a };
  };

  const mergeSetsObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (let i = 1; i <= 10; i++) {
      const cands = [`s${i}`, `set${i}`, `set_${i}`, `SET${i}`, `SET_${i}`, `period${i}`, `p${i}`];
      for (const k of cands) {
        const found = readPairFromObj(obj, k);
        if (found) {
          put(i, found);
          break;
        }
      }
    }
  };

  const mergePeriodArray = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || typeof it !== 'object') continue;
      const h = toNumOrNull((it as any).home ?? (it as any).homeScore ?? (it as any).home_points ?? (it as any).h);
      const a = toNumOrNull((it as any).away ?? (it as any).awayScore ?? (it as any).away_points ?? (it as any).a);
      if (h === null && a === null) continue;
      put(i + 1, { home: h, away: a });
    }
  };

  mergeSetsObject(e?.score?.sets);
  mergeSetsObject(e?.sets);
  mergeSetsObject(e?.setScores);
  mergeSetsObject(e?.periodScores);

  const hs = e?.homeScore;
  const as = e?.awayScore;
  if (hs && as && typeof hs === 'object' && typeof as === 'object') {
    for (let i = 1; i <= 5; i++) {
      const h = toNumOrNull((hs as any)[`period${i}`]);
      const a = toNumOrNull((as as any)[`period${i}`]);
      if (h !== null || a !== null) put(i, { home: h, away: a });
    }
  }

  mergePeriodArray(e?.periods ?? e?.scores ?? e?.score?.periods ?? e?.score?.scores);
  const hPeriods = e?.homeScore?.periods ?? e?.homeScore?.periodScores ?? e?.homeScore?.scores ?? null;
  const aPeriods = e?.awayScore?.periods ?? e?.awayScore?.periodScores ?? e?.awayScore?.scores ?? null;
  if (Array.isArray(hPeriods) && Array.isArray(aPeriods) && hPeriods.length > 0) {
    for (let i = 0; i < Math.max(hPeriods.length, aPeriods.length); i++) {
      const h = toNumOrNull(hPeriods[i]);
      const a = toNumOrNull(aPeriods[i]);
      if (h !== null || a !== null) put(i + 1, { home: h, away: a });
    }
  }
  if (byIndex.size === 0) return null;
  const out: Record<string, { home: number | null; away: number | null }> = {};
  for (let i = 1; i <= 5; i++) {
    const x = byIndex.get(i);
    if (!x) continue;
    out[`s${i}`] = { home: x.home, away: x.away };
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

function deriveTennisSetNumber(status: any, tennisSets: Record<string, { home: number | null; away: number | null }> | null): number | null {
  const s = statusText(status).toUpperCase();
  const m1 = s.match(/\bS(?:ET)?\s*(\d{1,2})\b/);
  if (m1) {
    const n = Number(m1[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  }
  const m2 = s.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  }
  const m3 = s.match(/\b(\d{1,2})\s*[º°]?\s*SET\b/);
  if (m3) {
    const n = Number(m3[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  }
  if (tennisSets) {
    let last = 0;
    for (let i = 1; i <= 5; i++) {
      const x = (tennisSets as any)[`s${i}`];
      if (!x) continue;
      if (x.home == null && x.away == null) continue;
      const sum = Number(x.home ?? 0) + Number(x.away ?? 0);
      if (sum > 0) last = i;
    }
    return Math.max(1, Math.min(5, last || 1));
  }
  return null;
}

function deriveStatusShort(sport: string, status: any, elapsed: number, tennisSets: Record<string, { home: number | null; away: number | null }> | null): string {
  if (isFinishedStatus(status)) return 'FT';
  if (isNotStartedStatus(status)) return 'NS';
  const sKey = normalizeSportKey(sport);
  if (sKey.includes('tennis')) {
    const n = deriveTennisSetNumber(status, tennisSets);
    if (n) return `S${n}`;
    return 'LIVE';
  }
  if (sKey === 'soccer' || sKey === 'football') {
    if (elapsed >= 46) return '2H';
    if (elapsed > 0) return '1H';
    return 'LIVE';
  }
  return 'LIVE';
}

function normalizeEvent(sport: string, e: any): NormalizedEvent | null {
  const pickId = (): string => {
    const candidates = [
      e?.id,
      e?.match_id,
      e?.matchId,
      e?.event_id,
      e?.eventId,
      e?.game_id,
      e?.gameId,
      e?.fixture_id,
      e?.fixtureId,
      e?.fixture?.id,
      e?.external_id,
      e?.externalId,
    ];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined') return s;
    }
    return '';
  };
  const id = pickId();
  if (!id) return null;

  const pickTeamName = (side: 'home' | 'away'): string => {
    const candidates = [
      e?.[`${side}Team`]?.name,
      e?.[`${side}Team`]?.team?.name,
      e?.[`${side}Team`],
      e?.teams?.[side]?.name,
      e?.team?.[side]?.name,
      e?.[side]?.name,
      e?.[side]?.team?.name,
      e?.[`${side}_team`],
      e?.[`${side}Name`],
      e?.[`${side}_name`],
    ];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined') return s;
    }
    return '';
  };
  const pickTeamLogo = (side: 'home' | 'away'): string => {
    const candidates = [
      e?.[`${side}Team`]?.logo,
      e?.teams?.[side]?.logo,
      e?.[side]?.logo,
      e?.[`${side}Team`]?.team?.logo,
      e?.[side]?.team?.logo,
    ];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s) return s;
    }
    return '';
  };

  const homeName = pickTeamName('home');
  const awayName = pickTeamName('away');
  if (!homeName || !awayName) return null;

  const pickStartTs = (): number => {
    const candidates = [
      e?.startTimestamp,
      e?.start_timestamp,
      e?.timestamp,
      e?.ts,
      e?.startTs,
      e?.fixture?.timestamp,
      e?.fixture?.startTimestamp,
    ];
    for (const c of candidates) {
      const n = num(c);
      if (n > 0) return n;
    }
    return 0;
  };
  const pickStartDate = (): string => {
    const candidates = [
      e?.startTime,
      e?.start_time,
      e?.event_date,
      e?.date,
      e?.fixture?.date,
      e?.start_date?.iso,
      e?.startDate,
    ];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s) return s;
    }
    return '';
  };

  const ts = pickStartTs();
  const date = ts > 0 ? new Date(ts * 1000).toISOString() : pickStartDate();
  if (!date) return null;

  const tournament = e?.tournament?.name ?? e?.tournament ?? '';
  const country = e?.tournament?.category?.name ?? e?.category?.name ?? e?.country?.name ?? '';
  const statusRaw =
    e?.status?.description ??
    e?.status?.type ??
    e?.status?.short ??
    e?.status?.long ??
    e?.fixture?.status?.short ??
    e?.fixture?.status?.long ??
    e?.status ??
    e?.statusCode ??
    e?.statusText ??
    '';
  const status = String(statusRaw || 'NS');
  const statusObj = e?.status ?? status;
  const live = isLive(statusObj);
  const t = live ? deriveElapsedAndTimer(sport, e) : { elapsed: 0, timer: '' };
  // #region debug-point C:normalize-event-clock
  void import('node:fs').then((fs) => { let u = 'http://127.0.0.1:7777/event', s = 'live-delay-clock'; try { const env = fs.readFileSync('.dbg/live-delay-clock.env', 'utf8'); u = /DEBUG_SERVER_URL=(.+)/.exec(env)?.[1] || u; s = /DEBUG_SESSION_ID=(.+)/.exec(env)?.[1] || s; } catch { void 0; } const keys = e && typeof e === 'object' ? Object.keys(e) : []; const keyMatches = keys.filter((k) => /elapsed|minute|timer|clock|time/i.test(k)).slice(0, 50); fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'C', location: 'server/services/sportsApiPro.ts:normalizeEvent', msg: '[DEBUG] normalizeEvent clock/status', data: { sport: String(sport || ''), id, status: String(status || ''), isLive: live, computedDate: date, elapsed: t.elapsed, timer: t.timer, raw: { startTimestamp: e?.startTimestamp ?? null, startTime: e?.startTime ?? null, event_date: e?.event_date ?? null, time: e?.time ?? null, clock: e?.clock ?? null, minute: e?.minute ?? null, elapsed: e?.elapsed ?? null }, keyMatches }, ts: Date.now() }) }).catch(() => null); }).catch(() => null);
  // #endregion

  const sLower = String(sport || '').toLowerCase();
  const tennisSets = sLower.includes('tennis') || sLower.includes('tênis') ? extractTennisSets(e) : null;
  const hs =
    tennisSets
      ? (() => {
          const v = pickScore(e?.homeScore?.sets ?? e?.homeScore?.set ?? e?.homeScore?.setsWon ?? e?.homeScore?.totalSets);
          return v != null ? v : pickScore(e?.homeScore);
        })()
      : pickScore(e?.homeScore);
  const as =
    tennisSets
      ? (() => {
          const v = pickScore(e?.awayScore?.sets ?? e?.awayScore?.set ?? e?.awayScore?.setsWon ?? e?.awayScore?.totalSets);
          return v != null ? v : pickScore(e?.awayScore);
        })()
      : pickScore(e?.awayScore);

  const short = deriveStatusShort(sport, statusObj, t.elapsed, tennisSets);
  const sanitizedSets = (() => {
    if (!tennisSets) return null;
    const m = String(short || '').match(/^S(\d)$/);
    const n = m ? Number(m[1]) : 0;
    if (!(n >= 1 && n <= 5)) return tennisSets;
    const out: Record<string, { home: number | null; away: number | null }> = {};
    for (let i = 1; i <= 5; i++) {
      const x = (tennisSets as any)[`s${i}`];
      if (!x) continue;
      let home = x.home ?? null;
      let away = x.away ?? null;
      if (i > n) {
        home = null;
        away = null;
      } else if (i < n && home === 0 && away === 0) {
        home = null;
        away = null;
      }
      out[`s${i}`] = { home, away };
    }
    return out;
  })();
  const fixture = {
    id,
    date,
    status: {
      short,
      long: status,
      elapsed: t.elapsed,
      timer: t.timer,
    },
  };
  const teams = {
    home: { name: homeName, logo: pickTeamLogo('home') },
    away: { name: awayName, logo: pickTeamLogo('away') },
  };
  const goals = { home: hs, away: as };

  return {
    external_event_id: `${sport}_${id}`,
    sport,
    league: String(tournament || ''),
    home_team: homeName,
    away_team: awayName,
    team_match: `${homeName} vs ${awayName}`,
    event_date: date,
    status,
    status_short: short,
    status_long: status,
    is_live: live ? 1 : 0,
    home_odd: 0,
    draw_odd: 0,
    away_odd: 0,
    elapsed: t.elapsed,
    timer: t.timer,
    score: JSON.stringify({
      home: hs,
      away: as,
      ...(sanitizedSets ? { sets: sanitizedSets } : {}),
      ...((() => {
        if (!sLower.includes('tennis') && !sLower.includes('tênis')) return {};
        const ph = e?.homeScore?.point ?? e?.homeScore?.currentPoint ?? e?.homeScore?.game ?? e?.homeScore?.points ?? e?.homeScore?.current;
        const pa = e?.awayScore?.point ?? e?.awayScore?.currentPoint ?? e?.awayScore?.game ?? e?.awayScore?.points ?? e?.awayScore?.current;
        if (ph == null && pa == null) return {};
        return { point: { home: ph, away: pa } };
      })()),
    }),
    markets: '{}',
    country: String(country || ''),
    home_team_logo: String(e?.homeTeam?.logo ?? ''),
    away_team_logo: String(e?.awayTeam?.logo ?? ''),
    fixture,
    teams,
    goals,
  };
}

async function fetchJson(url: string, apiKey: string, timeoutMs: number = 15000): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { headers: apiHeaders(apiKey), signal: controller.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) return null;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(t);
  }
}

const __live_cache = new Map<string, { ts: number; data: NormalizedEvent[] }>();

export async function fetchSportsApiProLive(apiKey: string, sport: string): Promise<NormalizedEvent[]> {
  const primarySub = toSubdomain(sport);
  const primaryUrl = `https://v2.${primarySub}.sportsapipro.com/api/live`;
  const jsonPrimary = await fetchJson(primaryUrl, apiKey, 8000);
  const itemsPrimary = extractEvents(jsonPrimary);
  let items = itemsPrimary;

  const fallbackSub = normalizeSportKey(sport);
  if (items.length === 0 && fallbackSub && fallbackSub !== primarySub) {
    const fallbackUrl = `https://v2.${fallbackSub}.sportsapipro.com/api/live`;
    const jsonFallback = await fetchJson(fallbackUrl, apiKey, 8000);
    items = extractEvents(jsonFallback);
  }
  if (!jsonPrimary && items.length === 0) {
    const cached = __live_cache.get(sport);
    if (cached && Date.now() - cached.ts < 120_000) return cached.data;
  }
  const out: NormalizedEvent[] = [];
  for (const e of items) {
    const n = normalizeEvent(sport, e);
    if (n) out.push(n);
  }
  __live_cache.set(sport, { ts: Date.now(), data: out });
  return out;
}

export async function fetchSportsApiProSchedule(apiKey: string, sport: string, date: string): Promise<NormalizedEvent[]> {
  const primarySub = toSubdomain(sport);
  const primaryUrl = `https://v2.${primarySub}.sportsapipro.com/api/schedule/${encodeURIComponent(date)}?timezoneName=UTC`;
  const jsonPrimary = await fetchJson(primaryUrl, apiKey, 9000);
  const itemsPrimary = extractEvents(jsonPrimary);
  let items = itemsPrimary;

  const fallbackSub = normalizeSportKey(sport);
  if (items.length === 0 && fallbackSub && fallbackSub !== primarySub) {
    const fallbackUrl = `https://v2.${fallbackSub}.sportsapipro.com/api/schedule/${encodeURIComponent(date)}?timezoneName=UTC`;
    const jsonFallback = await fetchJson(fallbackUrl, apiKey, 9000);
    items = extractEvents(jsonFallback);
  }
  const out: NormalizedEvent[] = [];
  for (const e of items) {
    const n = normalizeEvent(sport, e);
    if (n) out.push(n);
  }
  return out;
}

export async function fetchSportsApiProWorldCup2026(apiKey: string): Promise<any | null> {
  const url = 'https://v2.football.sportsapipro.com/api/world-cup-2026';
  return fetchJson(url, apiKey, 9000);
}

export async function fetchSportsApiProWorldCup2026Info(apiKey: string): Promise<any | null> {
  const url = 'https://v2.football.sportsapipro.com/api/world-cup-2026/info';
  return fetchJson(url, apiKey, 9000);
}

export async function fetchSportsApiProWorldCup2026Groups(apiKey: string): Promise<any | null> {
  const url = 'https://v2.football.sportsapipro.com/api/world-cup-2026/groups';
  return fetchJson(url, apiKey, 9000);
}

export async function fetchSportsApiProWorldCup2026Matches(apiKey: string, page: number): Promise<NormalizedEvent[]> {
  const p = Number.isFinite(page) ? Math.max(0, Math.min(20, Math.floor(page))) : 0;
  const url = `https://v2.football.sportsapipro.com/api/world-cup-2026/matches?page=${p}`;
  const json = await fetchJson(url, apiKey, 9000);
  const items = extractEvents(json);
  const out: NormalizedEvent[] = [];
  for (const e of items) {
    const n = normalizeEvent('soccer', e);
    if (n) out.push(n);
  }
  return out;
}

function extractOddsAll(payload: any): any[] {
  if (!payload) return [];
  // SportsApiPro v2 primary format: { data: { markets: [...] } }
  if (Array.isArray(payload.data?.markets) && payload.data.markets.length > 0) return payload.data.markets;
  if (Array.isArray(payload.markets) && payload.markets.length > 0) return payload.markets;
  if (Array.isArray(payload.odds) && payload.odds.length > 0) return payload.odds;
  if (Array.isArray(payload.data?.odds) && payload.data.odds.length > 0) return payload.data.odds;
  // Handle providerOdds as object with markets array
  if (Array.isArray(payload.providerOdds?.markets)) return payload.providerOdds.markets;
  if (Array.isArray(payload.data?.providerOdds?.markets)) return payload.data.providerOdds.markets;
  // Handle providerOdds as array of provider objects
  if (Array.isArray(payload.providerOdds)) {
    for (const p of payload.providerOdds) {
      if (Array.isArray(p?.markets) && p.markets.length > 0) return p.markets;
      if (Array.isArray(p?.odds) && p.odds.length > 0) return p.odds;
      if (Array.isArray(p?.lines) && p.lines.length > 0) return p.lines;
    }
  }
  if (Array.isArray(payload.data?.providerOdds)) {
    for (const p of payload.data.providerOdds) {
      if (Array.isArray(p?.markets) && p.markets.length > 0) return p.markets;
      if (Array.isArray(p?.odds) && p.odds.length > 0) return p.odds;
      if (Array.isArray(p?.lines) && p.lines.length > 0) return p.lines;
    }
  }
  if (Array.isArray(payload.data?.lines)) return payload.data.lines;
  if (Array.isArray(payload.data?.providerOdds?.odds)) return payload.data.providerOdds.odds;
  if (Array.isArray(payload.lines)) return payload.lines;
  if (Array.isArray(payload.data?.selections)) return payload.data.selections;
  return [];
}

function normalizeLineType(x: any): string {
  return String(x ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeLineName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickLineValue(x: any): string | null {
  const v =
    x?.lineValue ??
    x?.line_value ??
    x?.choiceGroup ??       // SportsApiPro v2: spread/total line value
    x?.handicap ??
    x?.handicapValue ??
    x?.total ??
    x?.totalValue ??
    x?.spread ??
    x?.value ??
    null;
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseFractionalOdd(s: string): number {
  const parts = s.split('/');
  if (parts.length !== 2) return 0;
  const num = parseFloat(parts[0].trim());
  const den = parseFloat(parts[1].trim());
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den + 1;
}

function parseOddDecimal(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = String(v).trim().replace(',', '.');
    if (s.includes('/')) return parseFractionalOdd(s);
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  const cands = [v.decimal, v.dec, v.value, v.odd, v.price, v.rate, v.decimalValue, v.decimal_value];
  for (const c of cands) {
    if (c == null) continue;
    const n = typeof c === 'string' ? parseFloat(String(c).trim().replace(',', '.')) : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function hasNumericPointInName(name: string, point: string): boolean {
  const m = /([+-]?\d+(?:[.,]\d+)?)/.exec(String(name || ''));
  if (!m) return false;
  const a = parseFloat(String(m[1]).replace(',', '.'));
  const b = parseFloat(String(point).replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 1e-9;
}

function formatSelectionName(marketKey: string, optionName: string, point: string | null): string {
  const base = String(optionName || '').trim();
  if (!base) return '';
  if (!point) return base;
  const n = normalizeLineName(base);
  const isTotals = marketKey.includes('total');
  const isHandicap = marketKey.includes('handicap') || marketKey.includes('spread') || marketKey.includes('line');
  if (isTotals && (n.startsWith('over') || n.startsWith('under') || n.startsWith('o/') || n.startsWith('u/'))) return `${base} ${point}`;
  if (isHandicap) return `${base} ${point}`;
  return base;
}

// marketKeyFromOddsAll accepts both lineType/lineName (legacy) AND
// marketGroup/marketName/marketPeriod (SportsApiPro v2 format).
// Extra params: marketGroup and marketPeriod from the SportsApiPro row.
function marketKeyFromOddsAll(lineType: string, lineName: string, marketGroup?: string, marketPeriod?: string): string {
  const t = normalizeLineType(lineType);
  const n = normalizeLineName(lineName);
  const g = normalizeLineName(marketGroup || '');   // e.g. "home away", "over under", "point spread"
  const p = normalizeLineName(marketPeriod || '');  // e.g. "match", "1st half", "1st period", "current set"

  const combo = `${g} ${n} ${t}`.trim();

  // ── SportsApiPro v2 period-based markets (checked FIRST) ──────────────────
  if (p === '1st half' || p === 'first half') {
    if (g.includes('over') || g.includes('under') || n.includes('total')) return '1st_half_totals';
    return '1st_half';
  }
  if (p === '2nd half' || p === 'second half') {
    if (g.includes('over') || g.includes('under') || n.includes('total')) return '2nd_half_totals';
    return '2nd_half';
  }
  if (p === '1st period' || p === 'first period') {
    if (g.includes('over') || g.includes('under') || n.includes('total')) return 'period_1_totals';
    return 'period_1_h2h';
  }
  if (p === '2nd period' || p === 'second period') {
    if (g.includes('over') || g.includes('under') || n.includes('total')) return 'period_2_totals';
    return 'period_2_h2h';
  }
  if (p === '3rd period' || p === 'third period') {
    if (g.includes('over') || g.includes('under') || n.includes('total')) return 'period_3_totals';
    return 'period_3_h2h';
  }
  if (p === '1st quarter' || p === 'first quarter') return g.includes('over') || g.includes('under') ? 'q1_totals' : 'q1_h2h';
  if (p === '2nd quarter' || p === 'second quarter') return g.includes('over') || g.includes('under') ? 'q2_totals' : 'q2_h2h';
  if (p === '3rd quarter' || p === 'third quarter') return g.includes('over') || g.includes('under') ? 'q3_totals' : 'q3_h2h';
  if (p === '4th quarter' || p === 'fourth quarter') return g.includes('over') || g.includes('under') ? 'q4_totals' : 'q4_h2h';
  if (p === 'current set' || p.includes('current set')) {
    if (g.includes('winner') || n.includes('winner')) return 'current_set_winner';
    if (g.includes('over') || g.includes('under') || n.includes('total')) return 'current_set_totals';
  }
  if (p === '1st set' || p === 'first set') return g.includes('over') || g.includes('under') ? 'set_1_totals' : 'set_1_h2h';
  if (p === '2nd set' || p === 'second set') return g.includes('over') || g.includes('under') ? 'set_2_totals' : 'set_2_h2h';
  if (p === '3rd set' || p === 'third set') return g.includes('over') || g.includes('under') ? 'set_3_totals' : 'set_3_h2h';
  if (p.includes('inning')) return g.includes('over') || g.includes('under') ? 'innings_totals' : 'innings_h2h';

  // ── Player markets (scorer/assists/cards) ────────────────────────────────
  if (
    combo.includes('scorer') ||
    combo.includes('to score') ||
    combo.includes('goalscorer') ||
    combo.includes('goal scorer')
  ) {
    if (combo.includes('first') || combo.includes('1st')) return 'first_goal_scorer';
    if (combo.includes('anytime') || combo.includes('at any time')) return 'anytime_goal_scorer';
    return 'anytime_goal_scorer';
  }
  if (combo.includes('assist') && (combo.includes('player') || combo.includes('assist by'))) {
    return 'player_assists';
  }
  if (
    combo.includes('booked') ||
    combo.includes('to be booked') ||
    (combo.includes('player') && (combo.includes('card') || combo.includes('cards')))
  ) {
    if (combo.includes('red')) return 'red_cards_player';
    return 'yellow_cards_player';
  }

  // ── SportsApiPro v2 marketGroup-based markets ─────────────────────────────
  // Explicit group mappings (highest priority)
  if (g === '1x2' || g === '1 x 2') return 'h2h';
  if (g === 'home away' || g === 'home away draw') {
    // Full time Home/Away (no draw for tennis/basketball/baseball/hockey)
    if (n === 'full time' || n === 'match' || !n || p === 'match') return 'h2h';
  }
  if (g === 'home draw away') return 'h2h';
  if (g === 'over under' || g === 'overunder') {
    if (n.includes('game') || n.includes('total game') || n === 'total games won') return 'match_total_games';
    if (n.includes('set') || n.includes('total set')) return 'total_sets';
    if (n.includes('corner')) return 'corners_total';
    if (n.includes('card')) return 'cards_total';
    return 'totals';
  }
  if (g === 'point spread' || g === 'pointspread') return 'spreads';
  if (g === 'asian handicap' || g === 'asianhandicap') return 'spreads';
  if (g === 'double chance' || g === 'doublechance') return 'double_chance';
  if (g === 'both teams to score' || g === 'bothteamstoscore') return 'btts';
  if (g === 'correct score' || g === 'correctscore') return 'correct_score';
  if (g === 'draw no bet' || g === 'drawnabet') return 'draw_no_bet';
  if (g === 'puck line' || g === 'puckline') return 'puck_line';
  if (g === 'run line' || g === 'runline') return 'run_line';
  // Soccer-specific groups from SportsApiPro v2
  if (g === 'match goals' || g.includes('match goals')) return 'totals';
  if (g === 'total cards' || g === 'cards in match' || g.includes('total cards') || g.includes('cards in match')) return 'cards_total';
  if (g === 'corners 2 way' || g === 'corners 2way' || g.includes('corners 2') || g.includes('corner 2')) return 'corners_total';
  if (g === 'first team to score' || g.includes('first team to score') || g.includes('first to score')) return 'first_team_to_score';
  if (g.includes('corner') && (g.includes('total') || g.includes('over') || g.includes('under'))) return 'corners_total';
  if (g.includes('corner') && !g.includes('total')) return 'corners_h2h';
  if (g.includes('card') && (g.includes('total') || g.includes('over') || g.includes('under'))) return 'cards_total';
  if (g.includes('btts') || g.includes('both team')) return 'btts';
  // Name check before group for "total games won" to avoid misclassifying as total_sets
  if (n === 'total games won' || n === 'total games') return 'match_total_games';
  if (g.includes('total sets') || g.includes('total set') || g.includes('total sets games')) return 'total_sets';
  if (g.includes('total game') || g.includes('game total')) return 'match_total_games';
  if (g.includes('current set winner')) return 'current_set_winner';
  if (g.includes('winner') && g.includes('set')) return 'current_set_winner';

  // marketName based (SportsApiPro)
  if (n === 'full time' && !marketGroup) return 'h2h';
  if (n === 'game total') return 'totals';
  if (n === 'point spread') return 'spreads';
  if (n === 'total games won' || n === 'total games') return 'match_total_games';
  if (n === 'current set winner') return 'current_set_winner';

  // ── Legacy lineType / lineName mapping ────────────────────────────────────
  if (n.includes('1st half') || n.includes('first half')) return '1st_half';
  if (n.includes('2nd half') || n.includes('second half')) return '2nd_half';
  if ((n.includes('first set') || n.includes('1st set')) && n.includes('winner')) return 'set_1_h2h';
  if ((n.includes('second set') || n.includes('2nd set')) && n.includes('winner')) return 'set_2_h2h';
  if ((n.includes('third set') || n.includes('3rd set')) && n.includes('winner')) return 'set_3_h2h';
  if (n.includes('set winner') && !n.includes('first') && !n.includes('second') && !n.includes('third')) return 'current_set_winner';
  if ((n.includes('total') && n.includes('games')) || n === 'total games won') return 'match_total_games';
  if (n.includes('total sets') || n === 'number of sets') return 'total_sets';

  if (n === '1x2' || n === 'full time result' || n === 'fulltime result') return 'h2h';
  if (n === 'full time' || n === 'fulltime' || n === 'match result' || n === 'match winner') return 'h2h';
  if (n.includes('1x2') || n.includes('full time result') || n.includes('fulltime result')) return 'h2h';
  if (n.includes('moneyline') || n.includes('match winner') || n === 'winner') return 'h2h';
  if (t === '1x2' || t === 'threewaymoneyline' || t === 'fulltimeresult') return 'h2h';
  if (t === 'fulltime' || t === 'matchresult' || t === 'matchwinner') return 'h2h';
  if (t === 'moneyline' || t === 'winner') return 'h2h';
  if (t === 'doublechance') return 'double_chance';
  if (t === 'correctscore' || t === 'scoreexact' || t === 'setbetting') return 'correct_score';
  if (t === 'totalgoals' || t === 'overunder' || t === 'asianoverunder') return 'totals';
  if (t === 'totalpoints' || t === 'totalruns' || t === 'gametotal') return 'totals';
  if (t === 'teamtotalpoints' || t === 'teamtotalruns' || t === 'teamtotalgoals') return 'team_totals';
  if (t === 'asianhandicap' || t === 'pointspread') return 'spreads';
  if (t === 'handicap' || t === 'europeanhandicap') return 'handicap';
  if (t === 'puckline') return 'puck_line';
  if (t === 'runline') return 'run_line';
  if (t === 'totalgames' || t === 'overundergames') return 'match_total_games';
  if (t === 'gamehandicap') return 'handicap';
  if (t === 'sethandicap') return 'sets_handicap';
  if (t === 'totalsets' || t === 'overundersets' || t === 'overunderset') return 'total_sets';

  if (t.includes('firstperiod') || n.includes('1st period') || n.includes('first period')) return (t.includes('total') || g.includes('over')) ? 'period_1_totals' : 'period_1_h2h';
  if (t.includes('secondperiod') || n.includes('2nd period') || n.includes('second period')) return (t.includes('total') || g.includes('over')) ? 'period_2_totals' : 'period_2_h2h';
  if (t.includes('thirdperiod') || n.includes('3rd period') || n.includes('third period')) return (t.includes('total') || g.includes('over')) ? 'period_3_totals' : 'period_3_h2h';

  if (t.includes('quarter') || n.includes('quarter')) {
    if (t.includes('winner') || n.includes('winner')) return 'quarters_h2h';
    if (t.includes('total') || n.includes('total') || n.includes('over under')) return 'quarters_totals';
  }

  if (t.includes('inning') || n.includes('inning')) {
    if (t.includes('winner') || n.includes('winner')) return 'innings_h2h';
    if (t.includes('total') || n.includes('total') || n.includes('over under')) return 'innings_totals';
  }

  return n ? n.replace(/\s+/g, '_') : t || '';
}

function normalizeOutcomeName(name: any): string {
  const s = String(name ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'home' || s === '1') return 'home';
  if (s === 'away' || s === '2') return 'away';
  if (s === 'draw' || s === 'x' || s === 'tie') return 'draw';
  if (s === 'empate') return 'draw';
  if (s === 'casa' || s === 'mandante') return 'home';
  if (s === 'fora' || s === 'visitante') return 'away';
  return s;
}

function tokenizeName(input: string): string[] {
  const s = normalizeLineName(input);
  if (!s) return [];
  return s.split(' ').filter(Boolean);
}

function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeName(a));
  const tb = new Set(tokenizeName(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function canonicalTennisTeamKey(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const normalized = raw
    .replace(/&/g, '/')
    .replace(/\+/g, '/')
    .replace(/\band\b/gi, '/')
    .replace(/\s*-\s*/g, '/')
    .replace(/\s*\/\s*/g, '/');
  const parts = normalized.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return normalizeLineName(raw).replace(/\s+/g, '_');
  const playerKey = (p: string) => {
    const s = String(p || '').trim();
    const swapped = s.includes(',') ? s.split(',').reverse().join(' ') : s;
    const tokens = tokenizeName(swapped);
    if (tokens.length === 0) return '';
    const last = tokens[tokens.length - 1];
    const first = tokens[0];
    const fi = first ? first[0] : '';
    return `${last}${fi ? `_${fi}` : ''}`;
  };
  const keys = parts.map(playerKey).filter(Boolean).sort();
  return keys.join('__');
}

export async function fetchSportsApiProMatchOddsAll(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string }
): Promise<OddsResult | null> {
  return fetchSportsApiProMatchOddsGeneric(apiKey, sport, matchId, 'all', opts);
}

export async function fetchSportsApiProMatchOddsLive(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string }
): Promise<OddsResult | null> {
  return fetchSportsApiProMatchOddsGeneric(apiKey, sport, matchId, 'live', opts);
}

export async function fetchSportsApiProMatchOddsPreMatch(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string }
): Promise<OddsResult | null> {
  return fetchSportsApiProMatchOddsGeneric(apiKey, sport, matchId, 'pre-match', opts);
}

export function parseSportsApiProMatchOddsPayload(
  sport: string,
  payload: any,
  opts?: { homeTeam?: string; awayTeam?: string }
): OddsResult | null {
  if (!payload) return null;
  const rows = extractOddsAll(payload);
  if (!rows.length) return null;

  type SelectionMap = Map<string, { label: string; odd: number; point?: string }>;
  type PerKeyMap = Record<string, SelectionMap>;

  const perKeyLive: PerKeyMap = {};
  const perKeyPre: PerKeyMap = {};

  const addSelectionTo = (target: PerKeyMap, key: string, value: string, odd: number, point?: string | null) => {
    if (!key || !value || !(odd > 1)) return;
    const p = point ? String(point) : '';
    const mk = target[key] || (target[key] = new Map());
    const k = `${normalizeLineName(value)}|${p}`;
    const prev = mk.get(k);
    if (!prev || odd > prev.odd) {
      const out: any = { label: value, value, odd };
      if (p) out.point = p;
      mk.set(k, out);
    }
  };

  for (const row of rows) {
    const lineType = row?.lineType ?? row?.type ?? row?.line_type ?? '';
    const lineName =
      row?.lineName ??
      row?.name ??
      row?.marketName ??
      row?.market ??
      row?.market_name ??
      row?.market?.name ??
      row?.market?.title ??
      '';
    const marketGroup = row?.marketGroup ?? row?.market_group ?? '';
    const marketPeriod = row?.marketPeriod ?? row?.market_period ?? row?.period ?? '';
    const key = marketKeyFromOddsAll(String(lineType || ''), String(lineName || ''), String(marketGroup || ''), String(marketPeriod || ''));
    if (!key) continue;
    if (row?.suspended === true || row?.suspended === 1 || row?.suspended === '1') continue;
    // Separate live vs pre-match rows — live data always has priority for the same market key
    const isLiveRow = row?.isLive === true || row?.isLive === 1 || row?.isLive === 'true';
    const target = isLiveRow ? perKeyLive : perKeyPre;
    const point = pickLineValue(row);
    const options =
      Array.isArray(row?.options) ? row.options :
      Array.isArray(row?.choices) ? row.choices :
      Array.isArray(row?.outcomes) ? row.outcomes :
      Array.isArray(row?.selections) ? row.selections :
      Array.isArray(row?.values) ? row.values :
      [];
    for (const opt of options) {
      if (opt?.suspended === true || opt?.suspended === 1) continue;
      const rawName = opt?.name ?? opt?.label ?? opt?.option ?? opt?.value ?? '';
      const odd = parseOddDecimal(
        opt?.rate ?? opt?.odd ?? opt?.price ?? opt?.decimalValue ?? opt?.decimal ??
        opt?.fractionalValue ?? opt?.initialFractionalValue ?? opt?.value
      );
      const pointForName = point && !hasNumericPointInName(String(rawName || ''), point) ? point : null;
      const value = formatSelectionName(key, String(rawName || ''), pointForName);
      addSelectionTo(target, key, value, odd, point);
    }
  }

  // Merge: live data has full priority. Pre-match only fills keys with no live data.
  const perKey: PerKeyMap = { ...perKeyLive };
  for (const [key, mp] of Object.entries(perKeyPre)) {
    if (!perKey[key]) perKey[key] = mp;
  }

  const outMarkets: Record<string, any[]> = {};
  for (const [key, mp] of Object.entries(perKey)) {
    const arr = Array.from(mp.values());
    if (arr.length) outMarkets[key] = arr;
  }

  if (!Array.isArray(outMarkets.h2h) || outMarkets.h2h.length === 0) {
    const aliases = [
      'h2h_3_way',
      '1x2',
      'main',
      'match_winner',
      'match_result',
      'full_time_result',
      'fulltime_result',
      'moneyline',
      'winner',
    ];
    for (const k of aliases) {
      const arr = (outMarkets as any)[k];
      if (Array.isArray(arr) && arr.length > 0) {
        outMarkets.h2h = arr;
        break;
      }
    }
  }

  const h2h = outMarkets.h2h || [];
  let home = 0;
  let draw = 0;
  let away = 0;
  const isTennis = normalizeSportKey(sport) === 'tennis';
  const isSoccer = (() => {
    const s = normalizeSportKey(sport);
    return s === 'soccer' || s === 'football';
  })();
  const homeKey = isTennis ? canonicalTennisTeamKey(String(opts?.homeTeam || '')) : normalizeLineName(String(opts?.homeTeam || ''));
  const awayKey = isTennis ? canonicalTennisTeamKey(String(opts?.awayTeam || '')) : normalizeLineName(String(opts?.awayTeam || ''));

  for (const s of h2h) {
    const name = s?.label ?? s?.value ?? s?.name ?? '';
    const n = normalizeOutcomeName(name);
    const odd = parseOddDecimal(s?.odd);
    if (!(odd > 1)) continue;
    const nk = isTennis ? canonicalTennisTeamKey(String(name || '')) : normalizeLineName(String(name || ''));
    if (n === 'home' || (homeKey && nk && (nk === homeKey || nk.includes(homeKey) || homeKey.includes(nk)))) home = Math.max(home || 0, odd);
    else if (n === 'away' || (awayKey && nk && (nk === awayKey || nk.includes(awayKey) || awayKey.includes(nk)))) away = Math.max(away || 0, odd);
    else if (n === 'draw') draw = Math.max(draw || 0, odd);
    else if (isTennis && homeKey && awayKey && nk && !(home > 1 && away > 1)) {
      const sHome = tokenSetSimilarity(nk, homeKey);
      const sAway = tokenSetSimilarity(nk, awayKey);
      if (sHome >= 0.75 && sHome >= sAway + 0.06) home = Math.max(home || 0, odd);
      else if (sAway >= 0.75 && sAway >= sHome + 0.06) away = Math.max(away || 0, odd);
    } else if (isSoccer && homeKey && awayKey && nk && !(home > 1 && away > 1)) {
      const sHome = tokenSetSimilarity(nk, homeKey);
      const sAway = tokenSetSimilarity(nk, awayKey);
      if (sHome >= 0.72 && sHome >= sAway + 0.08) home = Math.max(home || 0, odd);
      else if (sAway >= 0.72 && sAway >= sHome + 0.08) away = Math.max(away || 0, odd);
    }
  }

  if (isSoccer && (!(home > 1) || !(away > 1)) && homeKey && awayKey) {
    type Cand = { odd: number; sHome: number; sAway: number };
    const cands: Cand[] = [];
    for (const s of h2h) {
      const name = s?.value ?? s?.label;
      const n = normalizeOutcomeName(name);
      if (n === 'draw') continue;
      const odd = parseOddDecimal(s?.odd);
      if (!(odd > 1)) continue;
      const nk = normalizeLineName(String(name || ''));
      if (!nk) continue;
      cands.push({ odd, sHome: tokenSetSimilarity(nk, homeKey), sAway: tokenSetSimilarity(nk, awayKey) });
    }
    if (!(home > 1) && cands.length) {
      const bestHome = cands.reduce((m, x) => (x.sHome > m.sHome ? x : m), cands[0]);
      if (bestHome.sHome >= 0.55) home = bestHome.odd;
    }
    if (!(away > 1) && cands.length) {
      const bestAway = cands.reduce((m, x) => (x.sAway > m.sAway ? x : m), cands[0]);
      if (bestAway.sAway >= 0.55) away = bestAway.odd;
    }
  }

  if (!isSoccer && (!(home > 1) || !(away > 1))) {
    const out: number[] = [];
    for (const s of h2h) {
      const n = normalizeOutcomeName(s?.label ?? s?.value ?? s?.name ?? '');
      if (n === 'draw') continue;
      const odd = parseOddDecimal(s?.odd);
      if (!(odd > 1)) continue;
      out.push(odd);
      if (out.length >= 2) break;
    }
    if (out.length >= 2) {
      if (!(home > 1)) home = out[0];
      if (!(away > 1)) away = out[1];
    }
  }

  if (Object.keys(outMarkets).length === 0 && !(home > 1) && !(away > 1)) return null;
  return { home, draw, away, markets: outMarkets };
}

async function fetchSportsApiProMatchOddsGeneric(
  apiKey: string,
  sport: string,
  matchId: string,
  mode: 'all' | 'live' | 'pre-match',
  opts?: { homeTeam?: string; awayTeam?: string }
): Promise<OddsResult | null> {
  const sub = toSubdomain(sport);
  const url = `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/odds/${mode}`;
  const json = await fetchJson(url, apiKey);
  if (!json) return null;
  return parseSportsApiProMatchOddsPayload(sport, json, opts);
}

export async function fetchSportsApiProMatchStatistics(apiKey: string, sport: string, matchId: string): Promise<any | null> {
  const sub = toSubdomain(sport);
  const url = `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/statistics`;
  const json = await fetchJson(url, apiKey);
  return json || null;
}

export async function fetchSportsApiProMatchIncidents(apiKey: string, sport: string, matchId: string): Promise<any | null> {
  const sub = toSubdomain(sport);
  const url = `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/incidents`;
  const json = await fetchJson(url, apiKey);
  return json || null;
}
