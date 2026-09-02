import { OddButton } from '@/react-app/components/OddButton';
import { useMemo, useState, memo, useEffect, useRef, Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { formatLeagueHeader, abbreviateTeamName, getSportFromLeague, getSportIcon, labelOutcome } from '@/shared/helpers';
import type { LiveScore, SuspendedMarket } from '@/shared/types';
import type { LiveCardSignals } from '@/react-app/hooks/useBatchMarketSignals';
import { useTrend } from '@/react-app/hooks/useTrend';

// ── Module-level clock singleton ──────────────────────────────────────────────
// One shared interval drives all live cards; no per-card timers.
let _clockTick = 0;
const _clockSubs = new Set<() => void>();
let _clockTimer: ReturnType<typeof setInterval> | null = null;
function _subClock(fn: () => void) {
  _clockSubs.add(fn);
  if (!_clockTimer) {
    _clockTimer = setInterval(() => {
      _clockTick++;
      _clockSubs.forEach(f => { try { f(); } catch { /* */ } });
    }, 20_000);
  }
  return () => {
    _clockSubs.delete(fn);
    if (_clockSubs.size === 0 && _clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
  };
}

// Football period clock — estimates current minute from kick-off time when
// the API (Statpal) does not return an elapsed field.
// `lastSeenAt` = Date.now() when the event data was last received from the API.
// We add the minutes elapsed since then so the badge ticks forward between polls.
function computeFootballClock(
  eventDate: string | undefined,
  apiElapsed: number,
  apiTimer: string,
  statusU: string,
  lastSeenAt?: number,
): string {
  if (statusU === 'HT') return 'HT';
  if (statusU === 'ET' || statusU === 'ET1' || statusU === 'ET2') return 'ET';
  if (statusU === 'PEN' || statusU === 'P') return 'PEN';

  // Minutes elapsed since the API last refreshed this event's data.
  const msSinceUpdate = lastSeenAt && lastSeenAt > 0 ? Math.max(0, Date.now() - lastSeenAt) : 0;
  const tickAdj = Math.floor(msSinceUpdate / 60_000);

  const baseMin = apiElapsed > 0
    ? apiElapsed
    : (apiTimer ? (parseInt(apiTimer.replace(/[^0-9]/g, ''), 10) || 0) : 0);

  if (baseMin > 0) {
    // Advance by time-since-last-update so the clock ticks between API polls.
    return `${baseMin + tickAdj}'`;
  }

  // Fallback: derive minute entirely from kick-off timestamp.
  if (!eventDate) return '';
  const kickoff = new Date(eventDate).getTime();
  if (!Number.isFinite(kickoff) || kickoff <= 0) return '';
  const totalMins = Math.floor((Date.now() - kickoff) / 60_000);
  if (totalMins < 0) return '';
  if (totalMins <= 46) return `${Math.min(totalMins, 45)}'`;
  if (totalMins <= 61) return 'HT';
  if (totalMins <= 106) return `${Math.min(45 + (totalMins - 61), 90)}'`;
  return '90+';
}
// ─────────────────────────────────────────────────────────────────────────────

const normalizeSport = (s: string) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('football') && !v.includes('american')) return 'soccer';
  if (v.includes('american') && v.includes('football')) return 'american-football';
  if (v.includes('ice') && v.includes('hockey')) return 'ice-hockey';
  return v.replace(/\s+/g, '-');
};

interface EventCardProps { 
  event: any; // Allow both Event (shared) and LegacyEvent
  onOpenEvent: (event: any) => void;
  liveScore?: LiveScore;
  suspension?: SuspendedMarket;
  signals?: LiveCardSignals;
}

export function EventCard({ event, onOpenEvent, suspension, signals }: EventCardProps) { 
  const { darkMode, addNotification, addToBetSlip } = useApp(); 
  const [isHovered, setIsHovered] = useState(false);

  // Scroll-vs-tap detection: only navigate if the user didn't scroll. A real scroll gesture on a
  // touchscreen commonly starts with only a few px of movement per frame — an 10px-only vertical
  // threshold left a window where a deliberate scroll starting on a card still read as a tap
  // (reported as "too sensitive": touching a card to scroll opened its market instead). Catch it
  // sooner: a lower per-axis threshold, checked on both axes (a horizontal swipe is a scroll too,
  // not just vertical), plus a duration fallback — a touch held longer than a quick tap almost
  // always means the finger is dragging, even if that frame's delta happens to be small.
  const touchScrollRef = useRef<{ x: number; y: number; startedAt: number; moved: boolean }>({ x: 0, y: 0, startedAt: 0, moved: false });

  // Robustly extract event ID (support both structures)
  const eventId = event.id || event.fixture?.id;
  
  // Robustly extract team names
  const homeTeamName = event.home_team || event.teams?.home?.name || (event.match ? event.match.split(' vs ')[0] : '') || (event.match ? event.match.split(' - ')[0] : '') || 'Home Team';
  const awayTeamName = event.away_team || event.teams?.away?.name || (event.match ? event.match.split(' vs ')[1] : '') || (event.match ? event.match.split(' - ')[1] : '') || 'Away Team';
  
  const eventLeague = event.league?.name || event.league || 'Unknown League'; // Handle object or string
  const eventSport = event.sport;
  const sport = eventSport ? normalizeSport(eventSport) : getSportFromLeague(typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''));

  // Removed useRealtimeOdds hook
  
  // Helpers
  const handleLabelOutcome = (market: string, name: string) => {
    return labelOutcome(market, name, homeTeamName, awayTeamName);
  };

  // Simplified data access (since we poll fresh events)
  const currentMarkets = useMemo(() => {
      let raw: any = (event as any)?.markets ?? (event as any)?.odds;
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (s) {
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try {
              const j = JSON.parse(s);
              raw = typeof j === 'string' ? JSON.parse(j) : j;
            } catch { void 0; }
          }
        }
      }
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object') {
        return Object.entries(raw).map(([key, v]: [string, any]) => {
          if (Array.isArray(v)) return { key, selections: v };
          if (v && typeof v === 'object') {
            const selections =
              Array.isArray(v.selections) ? v.selections :
              Array.isArray(v.outcomes) ? v.outcomes :
              Array.isArray(v.values) ? v.values :
              [];
            return { key, ...v, selections };
          }
          return { key, selections: [] };
        });
      }
      return [];
  }, [event]);

  const eventTime = useMemo(() => {
    if (!event.event_date) return '';
    const d = new Date(event.event_date);
    const h = d.getHours();
    const m = d.getMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
  }, [event.event_date]);

  const eventDayMonth = useMemo(() => {
    if (!event.event_date) return '';
    const d = new Date(event.event_date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }, [event.event_date]);

  const isLiveEvent = useMemo(() => {
    if (Number(event?.is_live || 0) === 1) return true;
    const rawSt = event?.status;
    const status = (rawSt && typeof rawSt === 'object'
      ? String((rawSt as any).short ?? (rawSt as any).code ?? '')
      : String(rawSt ?? event?.fixture?.status?.short ?? '')
    ).toUpperCase().trim();
    const liveStatuses = new Set([
      '1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE',
      'AT', 'ST',
      'Q1', 'Q2', 'Q3', 'Q4', 'OT',
      'P1', 'P2', 'P3',
      'SO',
      'S1', 'S2', 'S3', 'S4', 'S5',
      'IN', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
      'IN_PROGRESS',
      '2MW', '2MIN',
    ]);
    return liveStatuses.has(status);
  }, [event]);

  // Subscribe to the module-level clock for live soccer — so the minute badge
  // updates every 20 s without per-card timers.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!isLiveEvent || sport !== 'soccer') return;
    return _subClock(() => setClockTick(t => t + 1));
  }, [isLiveEvent, sport]);

  const isFinishedEvent = useMemo(() => {
    const statusRaw = String(event?.status ?? event?.fixture?.status?.short ?? event?.fixture?.status?.long ?? '');
    const statusKey = statusRaw
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_]+/g, '');
    const finishedKeys = new Set(['FT', 'AET', 'FT_PEN', 'FTPEN', 'AWD', 'WO', 'ABD', 'CANC', 'PST', 'FIN', 'FINAL', 'FINISHED', 'ENDED']);
    if (finishedKeys.has(statusKey)) return true;
    if (/MATCHFINISHED|FULLTIME|GAMEOVER|ENCERRAD|TERMINAD/.test(statusKey)) return true;
    return false;
  }, [event]);

  const cleanTeam = (s: string) => {
    const raw = String(s || '');
    const head = raw.split(',')[0] || raw;
    return abbreviateTeamName(head.trim());
  };

  const detectTennisCurrentSet = useMemo((): number | 'TB' | 0 => {
    if (sport !== 'tennis') return 0;
    const ordinalSetRe = /(\d{1,2})(?:ST|ND|RD|TH)\s*SET/i;
    const simpleSetRe = /\b(?:SET|S)\s*(\d{1,2})\b/i;

    const mc = (event as any)?.matchClock;
    if (mc && typeof mc === 'object') {
      if (typeof mc.period === 'string') {
        const p = mc.period.toUpperCase().trim();
        if (p === 'FIRST_SET' || p === '1ST_SET' || p === 'SET_1') return 1;
        if (p === 'SECOND_SET' || p === '2ND_SET' || p === 'SET_2') return 2;
        if (p === 'THIRD_SET' || p === '3RD_SET' || p === 'SET_3') return 3;
        if (p === 'FOURTH_SET' || p === '4TH_SET' || p === 'SET_4') return 4;
        if (p === 'FIFTH_SET' || p === '5TH_SET' || p === 'SET_5') return 5;
        if (p === 'TIEBREAK' || p === 'TIE_BREAK' || p === 'TB') return 'TB';
        const ord = ordinalSetRe.exec(mc.period);
        if (ord) return Math.max(0, Math.min(5, Number(ord[1]) || 0));
        const sm = simpleSetRe.exec(mc.period);
        if (sm) return Math.max(0, Math.min(5, Number(sm[1]) || 0));
      }
      if (typeof mc.periodId !== undefined && mc.periodId !== null) {
        const pn = Number(mc.periodId);
        if (Number.isFinite(pn) && pn >= 1 && pn <= 5) return pn;
      }
    }

    const moreInfo = (event as any)?.moreInfo;
    if (moreInfo && typeof moreInfo.currentPeriod === 'string') {
      const cp = String(moreInfo.currentPeriod);
      const ord = ordinalSetRe.exec(cp);
      if (ord) return Math.max(0, Math.min(5, Number(ord[1]) || 0));
      const sm = simpleSetRe.exec(cp);
      if (sm) return Math.max(0, Math.min(5, Number(sm[1]) || 0));
      const up = cp.toUpperCase().trim();
      if (up === 'TIEBREAK' || /TIE[-_ ]?BREAK/i.test(up)) return 'TB';
    }

    const sc = (event as any)?.score;
    let scoreObj: any = null;
    if (sc && typeof sc === 'object') scoreObj = sc;
    else if (typeof sc === 'string') {
      try { const j = JSON.parse(sc); if (j && typeof j === 'object') scoreObj = j; } catch { /* */ }
    }
    if (scoreObj && typeof scoreObj.info === 'string') {
      const info = scoreObj.info.toUpperCase();
      const m = info.match(/\b(?:SET|S)\s*(\d{1,2})\b/);
      if (m) return Number(m[1]) || 0;
      if (/TIE[-_ ]?BREAK/i.test(info)) return 'TB';
      const ord = ordinalSetRe.exec(scoreObj.info);
      if (ord) return Math.max(0, Math.min(5, Number(ord[1]) || 0));
    }
    if (Array.isArray(currentMarkets) && currentMarkets.length > 0) {
      let best: number | 'TB' | 0 = 0;
      for (const m of currentMarkets) {
        const period = String(m?.period || '').toUpperCase().trim();
        const rawName = String(m?.rawName || '').toUpperCase().trim();
        let p: number | 'TB' | 0 = 0;
        if (period === 'FIRST_SET' || period === '1ST_SET') p = 1;
        else if (period === 'SECOND_SET' || period === '2ND_SET') p = 2;
        else if (period === 'THIRD_SET' || period === '3RD_SET') p = 3;
        else if (period === 'FOURTH_SET' || period === '4TH_SET') p = 4;
        else if (period === 'FIFTH_SET' || period === '5TH_SET') p = 5;
        else if (period === 'TIEBREAK' || /TIE[-_ ]?BREAK/i.test(period)) p = 'TB';
        if (!p) {
          const mm = rawName.match(/(\d{1,2})(?:ST|ND|RD|TH)\s+SET/);
          if (mm) p = Number(mm[1]) || 0;
          else {
            const mm2 = rawName.match(/\bSET\s*(\d{1,2})\b/);
            if (mm2) p = Number(mm2[1]) || 0;
          }
        }
        if (p === 'TB') { best = 'TB'; break; }
        if (typeof p === 'number' && p > (typeof best === 'number' ? best : 0)) best = p;
      }
      if (best !== 0) return best;
    }
    const statusShort = String((event as any)?.status ?? (event as any)?.fixture?.status?.short ?? '').toUpperCase().trim();
    const statusLong = String((event as any)?.fixture?.status?.long ?? (event as any)?.status_long ?? '').toUpperCase().trim();
    const m1 = statusShort.match(/^S(\d{1,2})$/);
    if (m1) return Number(m1[1]);
    const m2 = statusLong.match(/\bSET\s*(\d{1,2})\b/);
    if (m2) return Number(m2[1]);
    const m3 = statusShort.match(/\bSET\s*(\d{1,2})\b/);
    if (m3) return Number(m3[1]);
    const m4 = statusShort.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
    if (m4) return Number(m4[1]);
    const m5 = statusLong.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
    if (m5) return Number(m5[1]);
    return 0;
  }, [event, sport, currentMarkets]);

  const tennisScore = useMemo(() => {
    if (sport !== 'tennis') return null;
    const raw = (event as any)?.score;
    const matchClockInfo = String((event as any)?.matchClock?.info || '').trim();
    const statistics = (event as any)?.statistics;
    const moreInfo = (event as any)?.moreInfo;

    let obj: any = null;
    let rawString = '';
    if (typeof raw === 'string') {
      rawString = raw.trim();
      if (rawString && (rawString.startsWith('{') || rawString.startsWith('['))) {
        try { obj = JSON.parse(rawString); } catch { obj = null; }
      }
    } else if (raw && typeof raw === 'object') {
      obj = raw;
    }

    const toNumOrNull = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const readSetPair = (v: any): { home: number | null; away: number | null } => {
      if (!v || typeof v !== 'object') return { home: null, away: null };
      return { home: toNumOrNull(v.home), away: toNumOrNull(v.away) };
    };

    const sets: Array<{ home: number | null; away: number | null }> = [];
    let pHome: '15' | '30' | '40' | 'AD' | null = null;
    let pAway: '15' | '30' | '40' | 'AD' | null = null;

    const normalizePoint = (v: any): '15' | '30' | '40' | 'AD' | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim().toUpperCase();
      if (!s) return null;
      if (s === '0' || s === 'LOVE') return null;
      if (s === '15' || s === '30' || s === '40') return s as any;
      if (s === 'A' || s === 'AD' || s === 'ADV' || s === 'ADVANTAGE') return 'AD';
      const n = Number(s);
      if (Number.isFinite(n) && (n === 15 || n === 30 || n === 40)) return String(n) as any;
      return null;
    };

    if (obj && typeof obj === 'object') {
      const setsRoot = obj.sets || obj.set || {};
      let maxIdxObj = 0;
      if (setsRoot && typeof setsRoot === 'object') {
        for (const k of Object.keys(setsRoot)) {
          const mm = /^(?:s|set)\s*(\d{1,2})$/i.exec(String(k).trim());
          if (!mm) continue;
          const n = Number(mm[1]);
          if (Number.isFinite(n) && n > maxIdxObj) maxIdxObj = n;
        }
      }
      maxIdxObj = Math.min(10, Math.max(0, maxIdxObj));
      for (let i = 1; i <= maxIdxObj; i++) {
        const v = (setsRoot as any)[`s${i}`] ?? (setsRoot as any)[`set${i}`] ?? (setsRoot as any)[`S${i}`] ?? (setsRoot as any)[`SET${i}`];
        sets.push(readSetPair(v));
      }

      const pointRoot = obj.point || obj.points || obj.currentPoint || obj.current_point || {};
      pHome = normalizePoint(pointRoot.home ?? pointRoot.h ?? obj.pointHome ?? obj.homePoint);
      pAway = normalizePoint(pointRoot.away ?? pointRoot.a ?? obj.pointAway ?? obj.awayPoint);

      if ((!pHome || !pAway) && obj.currentGame && typeof obj.currentGame === 'object') {
        const cg = obj.currentGame;
        if (!pHome) pHome = normalizePoint(cg.home ?? cg.h ?? cg.points?.home ?? cg.score?.home);
        if (!pAway) pAway = normalizePoint(cg.away ?? cg.a ?? cg.points?.away ?? cg.score?.away);
      }
      if ((!pHome || !pAway) && obj.info && typeof obj.info === 'string') {
        const im = obj.info.match(/(\d{1,2}|AD|A|ADV|ADVANTAGE)\s*[-:]\s*(\d{1,2}|AD|A|ADV|ADVANTAGE)/i);
        if (im) {
          if (!pHome) pHome = normalizePoint(im[1]);
          if (!pAway) pAway = normalizePoint(im[2]);
        }
      }
    }

    if (statistics && typeof statistics === 'object') {
      const statSets = (statistics as any).sets;
      if (statSets && Array.isArray(statSets.home) && Array.isArray(statSets.away)) {
        const len = Math.min(10, Math.max(statSets.home.length, statSets.away.length));
        for (let i = 0; i < len; i++) {
          const h = toNumOrNull(statSets.home[i]);
          const a = toNumOrNull(statSets.away[i]);
          if (!sets[i]) sets[i] = { home: null, away: null };
          if (sets[i].home == null && h != null) sets[i].home = h;
          if (sets[i].away == null && a != null) sets[i].away = a;
        }
      }
      if ((!pHome || !pAway)) {
        const gs = (statistics as any).gameScore ?? (statistics as any).currentGame ?? (statistics as any).points;
        if (gs && typeof gs === 'object') {
          if (!pHome) pHome = normalizePoint(gs.home ?? gs.h ?? gs.pointHome);
          if (!pAway) pAway = normalizePoint(gs.away ?? gs.a ?? gs.pointAway);
        } else if (typeof gs === 'string') {
          const im = gs.match(/(\d{1,2}|AD|A)\s*[-:]\s*(\d{1,2}|AD|A)/i);
          if (im) {
            if (!pHome) pHome = normalizePoint(im[1]);
            if (!pAway) pAway = normalizePoint(im[2]);
          }
        }
      }
    }

    if ((!pHome || !pAway) && matchClockInfo) {
      const im = matchClockInfo.match(/(\d{1,2}|AD|A|ADV)\s*[-:]\s*(\d{1,2}|AD|A|ADV)/i);
      if (im) {
        if (!pHome) pHome = normalizePoint(im[1]);
        if (!pAway) pAway = normalizePoint(im[2]);
      }
    }
    if ((!pHome || !pAway) && moreInfo && typeof moreInfo === 'object') {
      const gp = typeof moreInfo.gamePoints === 'string' ? moreInfo.gamePoints : typeof moreInfo.game_score === 'string' ? moreInfo.game_score : null;
      if (gp) {
        const im = gp.match(/(\d{1,2}|AD|A|ADV|LOVE)\s*[-:]\s*(\d{1,2}|AD|A|ADV|LOVE)/i);
        if (im) {
          if (!pHome) pHome = normalizePoint(im[1]);
          if (!pAway) pAway = normalizePoint(im[2]);
        }
      }
    }

    if (rawString) {
      const setMatches = rawString.match(/(\d+)\s*[-–]\s*(\d+)/g);
      const setPairs: Array<[number, number]> = [];
      if (setMatches) {
        for (const sm of setMatches) {
          const parts = sm.split(/[-–]/).map(s => Number(s.trim()));
          if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
            setPairs.push([parts[0], parts[1]]);
          }
        }
      }
      const setCount = setPairs.length;
      for (let i = 0; i < setPairs.length; i++) {
        if (sets[i] == null) sets.push({ home: null, away: null });
        if (sets[i].home == null) sets[i].home = setPairs[i][0];
        if (sets[i].away == null) sets[i].away = setPairs[i][1];
      }
      if ((!pHome || !pAway) && setCount > 0 && setMatches) {
        const lastSetStr = setMatches[setMatches.length - 1];
        const lastIdx = rawString.lastIndexOf(lastSetStr);
        const tail = rawString.slice(lastIdx + lastSetStr.length);
        const pt = tail.match(/(\d{1,2}|AD|A)\s*[-:]\s*(\d{1,2}|AD|A)/i);
        if (pt) {
          const candidateHome = normalizePoint(pt[1]);
          const candidateAway = normalizePoint(pt[2]);
          if (candidateHome && candidateAway) {
            if (!pHome) pHome = candidateHome;
            if (!pAway) pAway = candidateAway;
          }
        }
      }
    }

    const hasAnySet = sets.some((s) => s.home != null || s.away != null);

    return { hasAnySet, sets, pHome, pAway };
  }, [event, sport, detectTennisCurrentSet, currentMarkets]);

  // Score + live-clock derivation for the stacked team rows below. Same parsing logic the
  // single-line layout used to run inline; just relocated so both team rows (and the status
  // column) can read the same computed values instead of one shared middle badge.
  const matchStatus = useMemo(() => {
    if (sport === 'tennis') return null; // tennis renders its own set grid above
    const rawHome = (event as any).goals?.home ?? (event as any).golsCasa ?? (event as any).score_home;
    const rawAway = (event as any).goals?.away ?? (event as any).golsFora ?? (event as any).score_away;

    const formatScore = (val: any) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'object') {
        const picks = [(val as any).total, (val as any).score, (val as any).current, (val as any).goals];
        for (const p of picks) {
          if (p === null || p === undefined) continue;
          const n = Number(p);
          if (Number.isFinite(n)) return n;
        }
        return undefined;
      }
      const n = Number(val);
      if (Number.isFinite(n)) return n;
      return undefined;
    };

    let homeScore = formatScore(rawHome);
    let awayScore = formatScore(rawAway);
    let forceTimer = '';

    if (isLiveEvent && (homeScore === undefined || awayScore === undefined) && (event as any).score) {
      const s = (event as any).score;
      if (typeof s === 'string') {
        const str = s.trim();
        if (str) {
          if (str.includes('{') || str.includes(':')) {
            try {
              const j = JSON.parse(str);
              const hn = Number(j?.home);
              const an = Number(j?.away);
              if (homeScore === undefined && Number.isFinite(hn)) homeScore = hn;
              if (awayScore === undefined && Number.isFinite(an)) awayScore = an;
            } catch { void 0 }
          } else {
            if (/pen/i.test(str)) forceTimer = 'PEN';
            const m = str.match(/(\d+)\s*[-:]\s*(\d+)/);
            if (m) {
              const hs = Number(m[1]);
              const awayStr = String(m[2] || '').trim();
              let as = Number(awayStr);

              if (sport === 'soccer' && awayStr.length >= 3 && Number.isFinite(hs) && Number.isFinite(as) && as > 9) {
                const tryLens = [2, 3];
                for (const minLen of tryLens) {
                  if (awayStr.length <= minLen) continue;
                  const awayPart = awayStr.slice(0, -minLen);
                  const minPart = awayStr.slice(-minLen);
                  const awayN = Number(awayPart);
                  const minN = Number(minPart);
                  if (!Number.isFinite(awayN) || !Number.isFinite(minN)) continue;
                  if (awayN < 0 || awayN > 9) continue;
                  if (minLen === 2 && minN > 99) continue;
                  if (minLen === 3 && minN < 100) continue;
                  if (minN < 0 || minN > 130) continue;
                  as = awayN;
                  break;
                }
              }

              if (homeScore === undefined && Number.isFinite(hs)) homeScore = hs;
              if (awayScore === undefined && Number.isFinite(as)) awayScore = as;
            }
          }
        }
      } else if (typeof s === 'object') {
        const hn = Number((s as any)?.home);
        const an = Number((s as any)?.away);
        if (homeScore === undefined && Number.isFinite(hn)) homeScore = hn;
        if (awayScore === undefined && Number.isFinite(an)) awayScore = an;
      }
    }

    let scoreStr = '';
    if (isLiveEvent && homeScore !== undefined && awayScore !== undefined) {
      scoreStr = `${homeScore}-${awayScore}`;
    } else if (isLiveEvent && (event as any).score) {
      let displayScore: any = (event as any).score;
      if (typeof displayScore === 'string' && (displayScore.includes('{') || displayScore.includes(':'))) {
        try {
          const parsed = JSON.parse(displayScore);
          const hn = Number(parsed?.home);
          const an = Number(parsed?.away);
          if (Number.isFinite(hn) && Number.isFinite(an)) {
            displayScore = `${hn}-${an}`;
          }
        } catch {
          displayScore = String(displayScore);
        }
      } else if (typeof displayScore === 'object' && displayScore?.home !== undefined) {
        const hn = Number(displayScore?.home);
        const an = Number(displayScore?.away);
        displayScore = Number.isFinite(hn) && Number.isFinite(an) ? `${hn}-${an}` : '';
      }
      scoreStr = String(displayScore);
    }

    // Prefer the fully-resolved "H-A" string when it differs from the raw home/away numbers
    // above (it can come from a different fallback path) so nothing regresses vs. the old badge.
    if (scoreStr && scoreStr.includes('-')) {
      const parts = scoreStr.split('-');
      if (parts.length === 2) {
        const h = Number(parts[0]);
        const a = Number(parts[1]);
        if (Number.isFinite(h)) homeScore = h;
        if (Number.isFinite(a)) awayScore = a;
      }
    }

    const elapsed = Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? (event as any).status?.elapsed ?? 0) || 0;
    const timer = String((event as any).timer || (event as any).fixture?.status?.timer || '').trim();
    const statusShort = (() => {
      const raw = (event as any).status;
      if (raw && typeof raw === 'object') return String((raw as any).short ?? (raw as any).code ?? '');
      return String(raw ?? (event as any).fixture?.status?.short ?? '');
    })().trim();
    const statusLong = String((event as any).fixture?.status?.long ?? (event as any).status_long ?? (event as any).status?.long ?? '').trim();
    const statusU = statusShort.toUpperCase();

    const derivedTimer = (() => {
      const candidate = String(statusLong || statusShort || '').trim();
      const cu = candidate.toUpperCase();

      if (sport === 'soccer') {
        if (forceTimer) return forceTimer;
        if (statusU === 'AT' || statusU === 'ST') return statusU;
        if (/HALF\s*TIME|INTERVAL/.test(cu)) return 'HT';
        if (/EXTRA\s*TIME/.test(cu)) return 'ET';
        if (/^PEN/.test(cu) && statusU !== '1H' && statusU !== '2H') return 'PEN';
        return computeFootballClock(
          String((event as any)?.event_date || (event as any)?.fixture?.date || ''),
          elapsed,
          timer,
          statusU,
          Number((event as any)?.__lastSeenAt || 0) || undefined,
        );
      }

      if (sport === 'basketball') {
        if (timer && /:/.test(timer)) return timer;
        if (statusU === 'Q1' || statusU === 'Q2' || statusU === 'Q3' || statusU === 'Q4') return statusU;
        if (statusU === 'OT') return 'OT';
        if (statusU === 'HT') return 'HT';
        if (/\b(1ST|FIRST)\b.*QUARTER|QUARTER.*\b(1ST|FIRST)\b|^Q1$/.test(cu)) return 'Q1';
        if (/\b(2ND|SECOND)\b.*QUARTER|QUARTER.*\b(2ND|SECOND)\b|^Q2$/.test(cu)) return 'Q2';
        if (/\b(3RD|THIRD)\b.*QUARTER|QUARTER.*\b(3RD|THIRD)\b|^Q3$/.test(cu)) return 'Q3';
        if (/\b(4TH|FOURTH)\b.*QUARTER|QUARTER.*\b(4TH|FOURTH)\b|^Q4$/.test(cu)) return 'Q4';
        if (/\bOVERTIME\b|\bOT\b/.test(cu)) return 'OT';
        if (/\bHALF\s*TIME\b/.test(cu)) return 'HT';
        return '';
      }

      if (sport === 'ice-hockey') {
        if (timer && /:/.test(timer)) return timer;
        if (statusU === 'P1' || statusU === 'P2' || statusU === 'P3' || statusU === 'OT' || statusU === 'SO') return statusU;
        if (cu === 'P1' || cu === 'P2' || cu === 'P3' || cu === 'OT' || cu === 'SO') return cu;
        return '';
      }

      if (sport === 'american-football') {
        if (timer && /:/.test(timer)) return timer;
        if (statusU === '2MW' || statusU === '2MIN') return '2MIN';
        if (statusU === 'Q1' || statusU === 'Q2' || statusU === 'Q3' || statusU === 'Q4' || statusU === 'OT' || statusU === 'HT') return statusU;
        if (cu === 'Q1' || cu === 'Q2' || cu === 'Q3' || cu === 'Q4' || cu === 'OT' || cu === 'HT') return cu;
        return '';
      }

      if (sport === 'baseball') {
        if (/\b(TOP|BOTTOM)\b/i.test(candidate) || /\b(1ST|2ND|3RD|4TH|5TH|6TH|7TH|8TH|9TH)\b/i.test(candidate)) return candidate;
        return '';
      }

      if (!candidate) return '';
      if (cu === 'LIVE' || cu === 'INPLAY' || cu === 'IN PLAY' || cu === 'PLAYING') return '';
      if (/\b(TOP|BOTTOM)\b/i.test(candidate) || /\b(1ST|2ND|3RD|4TH|5TH|6TH|7TH|8TH|9TH)\b/i.test(candidate)) return candidate;
      if (cu === 'Q1' || cu === 'Q2' || cu === 'Q3' || cu === 'Q4') return candidate;
      if (cu === 'P1' || cu === 'P2' || cu === 'P3') return candidate;
      return candidate.length <= 8 ? candidate : '';
    })();

    return { homeScore, awayScore, scoreStr, displayTimer: derivedTimer };
  }, [event, sport, isLiveEvent]);

  // useTrend hook imported from @/react-app/hooks/useTrend

  // Get odds strictly from markets[] (Golden Rule)
  const h2hMarket = currentMarkets?.find((m: any) => m.key === 'h2h');
  
  // Robustly handle 'outcomes' (DB format) vs 'selections' (Frontend format)
  const selections = h2hMarket?.selections || h2hMarket?.outcomes;
  
  // const cleanStr = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // const hRef = cleanStr(homeTeamName);
  // const aRef = cleanStr(awayTeamName);

  const hhSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Casa';
  });

  const ddSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Empate';
  });

  const aaSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Fora';
  });

  const pickOdd = (v: any) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim().replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const rawHh = pickOdd(hhSelection?.odd || hhSelection?.price || hhSelection?.value) || pickOdd((event as any)?.home_odd);
  const rawDd = pickOdd(ddSelection?.odd || ddSelection?.price || ddSelection?.value) || pickOdd((event as any)?.draw_odd);
  const rawAa = pickOdd(aaSelection?.odd || aaSelection?.price || aaSelection?.value) || pickOdd((event as any)?.away_odd);

  const capOdd = (v: number): number => {
    if (!(v > 0)) return v;
    const elapsed = Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? 0) || 0;
    const timerStr = String((event as any).timer || (event as any).fixture?.status?.timer || '');
    const minute = parseInt(timerStr.replace(/[^\d]/g, ''), 10) || elapsed;
    let cap = 40;
    if (isLiveEvent) {
      if (minute < 70) cap = 20;
      else if (minute < 80) cap = 28;
      else if (minute < 85) cap = 33;
      else cap = 40;
    }
    return Math.min(v, cap);
  };

  const hh = capOdd(rawHh);
  const dd = capOdd(rawDd);
  const aa = capOdd(rawAa);

  const homeTrend = useTrend(hh);
  const drawTrend = useTrend(dd);
  const awayTrend = useTrend(aa);

  // Market suspended check
  const isH2hSuspended = h2hMarket?.suspended ?? false;
  const h2hReason = h2hMarket?.suspended_reason;
  const marketSuspended = isH2hSuspended ? { reason: h2hReason || 'SUSPENSO' } : undefined;

  // Add bet handler
  const addPrimary = (label: string, price: number, selectionSuspended?: boolean) => {
    if (!(price > 0)) { addNotification({ type: 'warning', message: 'Odd indisponível' }); return; }
    
    // Map label to standard selection names if needed
    let selection = label;
    if (label === 'Casa') selection = 'Home';
    if (label === 'Empate') selection = 'Draw';
    if (label === 'Fora') selection = 'Away';

    const idStr = `ev-${eventId}-${selection.toLowerCase()}`;
    addToBetSlip({ 
      id: idStr, 
      event_id: eventId, 
      match: String(event.match || `${homeTeamName} vs ${awayTeamName}`), 
      selection: selection, 
      market: 'Resultado Final', // Explicit market name
      odd: price, 
      stake: 0,
      league: typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''),
      sport: (eventSport ? normalizeSport(eventSport) : getSportFromLeague(typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''))),
      suspended: selectionSuspended,
      market_suspended: isH2hSuspended
    });
  };

  // Check if we have valid odds locally, even if realtime thinks it's suspended
  const hasLocalOdds = currentMarkets && currentMarkets.length > 0;

  const apiVarActive = !!signals?.varActive;
  const isSuspended = apiVarActive || ((!!suspension || (event as any).oddsFrozen || event.suspended) && !hasLocalOdds);

  const suspendReason = apiVarActive
    ? 'VAR'
    : (suspension?.reason || (event as any).suspendReason || ((event as any).oddsFrozen ? 'EVENT_FROZEN' : 'SUSPENSO'));

  const apiCritState = useMemo(() => {
    if (apiVarActive) return 'var_review' as const
    const c = signals?.cta
    if (!c || c === 'idle') return 'idle' as const
    return c as any
  }, [apiVarActive, signals?.cta])

  // ─────────────────────────────────────────────────────────────────────
  // Critical-event state machine — listing card
  // ─────────────────────────────────────────────────────────────────────
  type CritState = 'idle' | 'big_chance' | 'var_review' | 'var_penalty' | 'goal' | 'penalty' | 'cards';
  const [critState, setCritState] = useState<CritState>('idle');
  const lastEventIdRef = useRef<string>('');
  const lastNotifCritRef = useRef<string>('');   // dedup toast notifications

  const liveEventList: any[] = useMemo(() => {
    const a = (event as any)?.events;
    if (Array.isArray(a)) return a;
    const b = (event as any)?.fixture?.events;
    return Array.isArray(b) ? b : [];
  }, [event]);

  // Duration config per state
  const CRIT_DURATIONS: Record<CritState, number> = {
    idle: 0, goal: 18000, var_penalty: 25000, penalty: 20000,
    var_review: 30000, big_chance: 12000, cards: 10000,
  };

  // Notification messages per state
  const CRIT_NOTIF: Partial<Record<CritState, string>> = {
    goal:        '⚽ GOL! Odds bloqueadas.',
    var_review:  '📺 Revisão VAR em curso.',
    var_penalty: '🎯 VAR: Pênalti confirmado!',
    penalty:     '🎯 Pênalti marcado!',
    big_chance:  '🔥 Grande chance de gol!',
    cards:       '🟨 Cartão mostrado.',
  };

  // ODD suspend reason per crit state
  const CRIT_TO_REASON: Partial<Record<CritState, string>> = {
    goal:        'GOAL',
    var_review:  'VAR',
    var_penalty: 'VAR_PENALTY',
    penalty:     'PENALTY',
    big_chance:  'CHANCE',
    cards:       'CARD',
  };

  useEffect(() => {
    if (!isLiveEvent || liveEventList.length === 0) return;
    const latest = liveEventList[liveEventList.length - 1];
    if (!latest) return;
    const id = `${latest?.timer || latest?.minute || latest?.time?.elapsed || ''}|${latest?.type || ''}|${latest?.detail || ''}|${latest?.player?.name || latest?.player || ''}`;
    if (id === lastEventIdRef.current) return;
    lastEventIdRef.current = id;

    const text = `${latest?.type || ''} ${latest?.detail || ''} ${latest?.text || ''}`.toLowerCase();
    let next: CritState | null = null;
    if (/(var.*pen|pen.*var|p[eê]nalti.*confirmad|penalty.*confirmed)/.test(text)) next = 'var_penalty';
    else if (/\bvar\b|video.*assist|review/.test(text)) next = 'var_review';
    else if (/\b(goal|gol)\b/.test(text) && !/disallow|cancel|anulad|missed|own/.test(text)) next = 'goal';
    else if (/pen[aâ]lti|penalty/.test(text)) next = 'penalty';
    else if (/cart[aã]o|card|yellow|red/.test(text)) next = 'cards';
    else if (/big.*chance|grande.*chance|great.*chance|big_chance/.test(text)) next = 'big_chance';

    if (next) {
      setCritState(next);
      const dur = CRIT_DURATIONS[next] || 10000;
      const t = setTimeout(() => setCritState('idle'), dur);
      return () => clearTimeout(t);
    }
  }, [liveEventList, isLiveEvent]);

  useEffect(() => {
    if (!isLiveEvent) return;
    const effectiveCrit: CritState = apiCritState !== 'idle' ? (apiCritState as CritState) : critState;
    if (effectiveCrit === 'idle') return;
    const key = `${eventId}|${effectiveCrit}`;
    if (lastNotifCritRef.current === key) return;
    lastNotifCritRef.current = key;
    const msg = CRIT_NOTIF[effectiveCrit];
    if (!msg) return;
    const matchStr = String((event as any)?.match || `${homeTeamName} vs ${awayTeamName}`);
    addNotification({ type: 'info', message: `${matchStr}: ${msg}` });
  }, [addNotification, apiCritState, critState, event, eventId, homeTeamName, awayTeamName, isLiveEvent]);
  const apostaJaActive = useMemo(() => {
    if (!isLiveEvent) return false;
    const h2hCount = (hh > 0 ? 1 : 0) + (dd > 0 ? 1 : 0) + (aa > 0 ? 1 : 0);
    const isTwoWaySport = ['basketball', 'tennis', 'american-football', 'baseball', 'mma', 'volleyball', 'handball', 'ice-hockey', 'hockey', 'cricket'].includes(sport);
    if (hh > 0 && hh <= 1.03) return true;
    if (dd > 0 && dd <= 1.03) return true;
    if (aa > 0 && aa <= 1.03) return true;
    if (!isTwoWaySport && h2hCount > 0 && h2hCount < 3) return true;
    return false;
  }, [isLiveEvent, hh, dd, aa, sport]);

  // Choose the favourite (lowest non-zero odd) for one-tap betting
  const favBet = useMemo(() => {
    const opts: { label: 'Casa' | 'Empate' | 'Fora'; odd: number }[] = [];
    if (hh > 0) opts.push({ label: 'Casa', odd: hh });
    if (dd > 0) opts.push({ label: 'Empate', odd: dd });
    if (aa > 0) opts.push({ label: 'Fora', odd: aa });
    if (opts.length === 0) return null;
    return opts.reduce((m, x) => x.odd < m.odd ? x : m, opts[0]);
  }, [hh, dd, aa]);

  return (
    <div
      className={`@container border rounded-lg p-3 transition-all duration-300 ${
        darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:border-red-400 hover:shadow-lg' 
      } ${isHovered ? 'scale-[1.02]' : ''}`} 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)} 
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchScrollRef.current = { x: t.clientX, y: t.clientY, startedAt: Date.now(), moved: false };
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - touchScrollRef.current.x);
        const dy = Math.abs(t.clientY - touchScrollRef.current.y);
        const heldMs = Date.now() - touchScrollRef.current.startedAt;
        if (dx > 6 || dy > 6 || heldMs > 250) {
          touchScrollRef.current.moved = true;
        }
      }}
      onClick={() => {
        if (touchScrollRef.current.moved) {
          touchScrollRef.current.moved = false;
          return;
        }
        onOpenEvent(event);
      }}
    > 
      <div className="flex items-center gap-2 mb-2">
         {(() => {
          const { flag, country, league: formattedLeague, flagUrl } = formatLeagueHeader(event);
          const sportIcon = getSportIcon(sport);
          
          const leagueLabel = sport === 'cricket' ? 'Críquete' : formattedLeague;

          return (
            <span className={`flex items-center gap-2 text-xs font-din ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
               <div className="relative w-6 h-6 flex-shrink-0">
                    <img src={sportIcon} alt={sport} className="w-full h-full object-contain p-0.5 opacity-90" />
                    {(flagUrl || flag) && (
                        <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full shadow-sm border ${darkMode ? 'border-gray-800 bg-gray-700' : 'border-white bg-white'} overflow-hidden`}>
                            {flagUrl ? <img src={flagUrl} alt={country} className="w-full h-full object-cover" /> : <span className="text-[10px]">{flag}</span>}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold uppercase tracking-tight">{leagueLabel}</span>
                    {country && <span className="opacity-70 font-normal hidden sm:inline">· {country}</span>}
                    
                    <div className="flex items-center gap-1 ml-1 pl-1 border-l border-gray-300 dark:border-gray-600">
                        {eventDayMonth && <span className="opacity-80 text-[10px]">{eventDayMonth}</span>}
                        {sport === 'tennis' && eventTime && <span className="opacity-80 text-[10px]">{eventTime}</span>}
                    </div>
                </div>
            </span>
          );
        })()}
       </div>

      <div className="flex flex-col @[420px]:flex-row justify-between items-start @[420px]:items-center gap-2">
        <div className="flex-1 w-full @[420px]:w-auto">
      <div className="flex items-center gap-3 w-full">
        <button
          onPointerDown={(e) => { e.stopPropagation(); onOpenEvent(event); }}
          onClick={(e: ReactMouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenEvent(event); }} 
          className={`text-left w-full ${darkMode ? 'text-white hover:text-red-300' : 'text-gray-900 hover:text-red-700'} underline-offset-2 hover:underline overflow-hidden`} 
        > 
          {sport === 'tennis' ? (
            <span className="relative flex items-center gap-2 w-full justify-start">
              <div className="flex flex-col gap-1.5 min-w-0 flex-1 pr-14">
                {(() => {
                  const curSet = detectTennisCurrentSet;
                  const curSetNum = typeof curSet === 'number' ? curSet : 0;

                  const setsAll = tennisScore?.sets || [];
                  let maxWithAny = 0;
                  for (let i = 0; i < Math.min(10, setsAll.length); i++) {
                    const s = setsAll[i];
                    if (!s) continue;
                    if (s.home != null || s.away != null) maxWithAny = i + 1;
                  }

                  const maxCols = 5;
                  let cols: number;
                  if (isLiveEvent) {
                    cols = Math.min(maxCols, Math.max(curSetNum, maxWithAny));
                  } else {
                    cols = Math.min(maxCols, maxWithAny);
                  }
                  const visibleColIndexes: number[] = [];
                  for (let i = 0; i < cols; i++) {
                    const setIdx = i;
                    const existing = setsAll[setIdx];
                    const hasScore = existing && (existing.home != null || existing.away != null);
                    const isCurrentSet = isLiveEvent && curSetNum >= 1 && (setIdx + 1) === curSetNum;
                    if (hasScore || isCurrentSet) visibleColIndexes.push(i);
                  }
                  const displayCols = visibleColIndexes.length;
                  const showSets = displayCols > 0 && (isLiveEvent || !!tennisScore?.hasAnySet);
                  const pointHome = tennisScore?.pHome ?? null;
                  const pointAway = tennisScore?.pAway ?? null;
                  const showPoint = isLiveEvent && (pointHome != null || pointAway != null);

                  return (
                    <div
                      className="grid gap-x-1 gap-y-1 items-center tabular-nums"
                      style={{
                        gridTemplateColumns:
                          showSets
                            ? `minmax(0,1fr) repeat(${displayCols}, 1.25rem) ${showPoint ? 'auto' : 'minmax(0,0.01px)'}`
                            : `minmax(0,1fr) ${showPoint ? 'auto' : 'minmax(0,0.01px)'}`,
                      }}
                    >
                      {showSets ? (
                        <>
                          <span />
                          {visibleColIndexes.map((origIdx) => (
                            <span key={`hdr-s-${origIdx + 1}`} className={`text-[10px] font-bold text-right ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              {`S${origIdx + 1}`}
                            </span>
                          ))}
                          {showPoint && (
                            <span className={`text-[10px] font-bold text-right ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>PT</span>
                          )}
                        </>
                      ) : showPoint ? (
                        <>
                          <span />
                          <span className={`text-[10px] font-bold text-right ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>PT</span>
                        </>
                      ) : null}

                      {(['home', 'away'] as const).map((side) => {
                        const name = side === 'home' ? homeTeamName : awayTeamName;
                        const point = side === 'home' ? pointHome : pointAway;
                        return (
                          <Fragment key={side}>
                            <span className="text-sm font-semibold truncate leading-tight min-w-0">
                              {String(name || '').split(',')[0].trim() || '-'}
                            </span>
                            {showSets
                              ? visibleColIndexes.map((origIdx) => {
                                  const s = setsAll[origIdx] || { home: null, away: null };
                                  const val = side === 'home' ? s.home : s.away;
                                  return (
                                    <span key={`${side}-s-${origIdx}`} className={`text-right text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                      {val ?? ''}
                                    </span>
                                  );
                                })
                              : null}
                            {showPoint && point ? (
                              <span className="text-right text-xs font-black text-[#39FF14]">
                                {point}
                              </span>
                            ) : showPoint ? (
                              <span className="text-right text-xs opacity-40">—</span>
                            ) : (
                              <span />
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                if (!isLiveEvent) {
                  return (
                    <span className={`text-xs font-bold shrink-0 px-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {'vs'}
                    </span>
                  );
                }

                const curSet = detectTennisCurrentSet;
                let setLabel = '';
                if (curSet === 'TB') setLabel = 'TIE-BREAK';
                else if (typeof curSet === 'number' && curSet >= 1) setLabel = `${curSet}º SET`;

                const statusShort = String(event?.status ?? event?.fixture?.status?.short ?? '').toUpperCase().trim();
                const timerRaw = String((event as any).timer || (event as any).fixture?.status?.timer || '').trim();
                const statusU = (statusShort || '').toUpperCase();
                const timer = (sport === 'soccer' && isLiveEvent)
                  ? computeFootballClock(
                      String((event as any)?.event_date || (event as any)?.fixture?.date || ''),
                      Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? 0) || 0,
                      timerRaw,
                      statusU,
                      Number((event as any)?.__lastSeenAt || 0) || undefined,
                    )
                  : timerRaw;

                return (
                  <span className="absolute right-0 top-0 flex flex-col items-end gap-0.5">
                    {setLabel ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-600/10 rounded px-1 leading-tight">{setLabel}</span>
                    ) : (
                      <span className="text-xs font-bold text-red-600">AO VIVO</span>
                    )}
                    {timer && sport !== 'tennis' ? (
                      <span className="text-[10px] font-bold text-[#39FF14]">{timer}</span>
                    ) : null}
                  </span>
                );
              })()}
            </span>
          ) : (
            <span className="flex items-start gap-3 w-full">
              {/* Time/date column — swaps to a live/full-time badge once the match is underway */}
              <div className="flex flex-col items-start shrink-0 w-10 pt-0.5">
                {isLiveEvent ? (
                  <>
                    <span className="text-[11px] font-bold text-red-600 leading-tight">AO VIVO</span>
                    {matchStatus?.displayTimer && (
                      <span
                        className="text-[10px] font-bold rounded px-1 leading-tight mt-0.5"
                        style={sport === 'soccer'
                          ? { color: '#39FF14', background: 'rgba(57,255,20,0.12)' }
                          : { color: '#ef4444', background: 'rgba(239,68,68,0.10)' }}
                      >{matchStatus.displayTimer}</span>
                    )}
                  </>
                ) : isFinishedEvent ? (
                  <span className={`text-[11px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>FIM</span>
                ) : (
                  <>
                    <span className={`text-xs font-bold leading-tight ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{eventTime}</span>
                    <span className={`text-[10px] leading-tight mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{eventDayMonth}</span>
                  </>
                )}
              </div>

              {/* Teams stacked home-over-away, crest + name + (when live) that team's score */}
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  {(event as any).home_team_logo && (
                    <img src={(event as any).home_team_logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold truncate leading-tight flex-1 min-w-0">{cleanTeam(homeTeamName)}</span>
                  {isLiveEvent && matchStatus?.homeScore !== undefined && (
                    <span className="text-sm font-bold tabular-nums shrink-0 min-w-[1rem] text-right">{matchStatus.homeScore}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {(event as any).away_team_logo && (
                    <img src={(event as any).away_team_logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold truncate leading-tight flex-1 min-w-0">{cleanTeam(awayTeamName)}</span>
                  {isLiveEvent && matchStatus?.awayScore !== undefined && (
                    <span className="text-sm font-bold tabular-nums shrink-0 min-w-[1rem] text-right">{matchStatus.awayScore}</span>
                  )}
                </div>
              </div>
            </span>
          )}
        </button>
        
      </div>
        </div>
        <div className="text-left @[420px]:text-right w-full @[420px]:w-auto">
          {(() => {
          const hasPrimary = (hh > 0) || (dd > 0) || (aa > 0);
          const isTwoWaySport = ['basketball', 'tennis', 'american-football', 'baseball', 'mma', 'volleyball', 'handball', 'ice-hockey', 'hockey', 'cricket'].includes(sport);
          const showDraw = !isTwoWaySport && dd > 0;
          const gridCols = showDraw ? 'grid-cols-3' : 'grid-cols-2';
          
          if (!hasPrimary) {
              return (
                  <div className={`grid ${gridCols} gap-2 w-full @[420px]:w-[340px] opacity-50 cursor-not-allowed`}>
                      <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                           <span className="text-xs text-gray-500 font-bold">-</span>
                      </div>
                      {showDraw && (
                         <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                             <span className="text-xs text-gray-500 font-bold">-</span>
                        </div>
                      )}
                       <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                           <span className="text-xs text-gray-500 font-bold">-</span>
                      </div>
                  </div>
              );
          }
            
            if (isFinishedEvent) {
              return (
                <div className="w-full @[420px]:w-[340px]">
                  <div className={`w-full h-12 rounded-lg flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest border
                    ${darkMode
                      ? 'bg-gray-700/70 border-gray-600 text-gray-300'
                      : 'bg-gray-100 border-gray-300 text-gray-600'}`}
                  >
                    <span className="text-base opacity-80">⏹</span>
                    <span>Fim de Jogo</span>
                  </div>
                </div>
              );
            }

            const effectiveCrit: CritState = apiCritState !== 'idle' ? (apiCritState as CritState) : critState

            // Odds are blocked during any critical event OR explicit suspension
            const isOddsBlocked = isSuspended || (effectiveCrit !== 'idle' && isLiveEvent)
            const blockReason: string = isSuspended
              ? (suspendReason === 'VAR' ? 'VAR' : suspendReason === 'EVENT_FROZEN' ? 'GOAL' : 'SUSPENSO')
              : (CRIT_TO_REASON[effectiveCrit] || 'SUSPENSO')

            // Suspension object passed to OddButton
            const critSuspended = isOddsBlocked ? { reason: blockReason } : undefined

            // CTA banner — shown during any active critical state
            if (effectiveCrit !== 'idle' && isLiveEvent) {
              const cfgMap: Record<string, { label: string; bg: string; ring: string; anim: string; clickable: boolean }> = {
                goal:        { label: '⚽ GOL!',                    bg: 'from-emerald-500 to-green-600',   ring: 'ring-emerald-300', anim: 'animate-bounce',  clickable: false },
                big_chance:  { label: '🔥 GRANDE CHANCE',           bg: 'from-orange-500 to-amber-600',    ring: 'ring-orange-300',  anim: 'animate-pulse',   clickable: true  },
                var_review:  { label: '📺 REVISÃO VAR',             bg: 'from-indigo-600 to-purple-700',   ring: 'ring-purple-300',  anim: 'animate-pulse',   clickable: false },
                var_penalty: { label: '🎯 VAR: PÊNALTI CONFIRMADO', bg: 'from-yellow-500 to-amber-600',    ring: 'ring-yellow-300',  anim: 'animate-pulse',   clickable: false },
                penalty:     { label: '🎯 PÊNALTI',                 bg: 'from-orange-500 to-red-600',      ring: 'ring-orange-300',  anim: 'animate-pulse',   clickable: false },
                cards:       { label: '🟨 CARTÕES',                 bg: 'from-yellow-500 to-amber-600',    ring: 'ring-yellow-300',  anim: '',                clickable: true  },
              }
              const cfg = cfgMap[effectiveCrit] || cfgMap.big_chance
              const canClick = cfg.clickable && !!favBet && !isSuspended
              return (
                <div className="w-full @[420px]:w-[340px]">
                  <button
                    disabled={!canClick}
                    onClick={canClick ? (e) => { e.stopPropagation(); addPrimary(favBet!.label, favBet!.odd); } : undefined}
                    className={`w-full h-12 rounded-lg font-black text-sm uppercase tracking-wider text-white shadow-lg
                      bg-gradient-to-r ${cfg.bg} ring-2 ${cfg.ring} ring-opacity-60 ${cfg.anim}
                      transition-all duration-200 flex items-center justify-center gap-2
                      ${canClick ? 'hover:scale-[1.02] active:scale-95 cursor-pointer' : 'cursor-default opacity-95'}`}
                  >
                    <span>{cfg.label}</span>
                    {canClick && favBet && (
                      <span className="ml-1 opacity-80 text-xs normal-case font-bold">
                        {favBet.label} {favBet.odd.toFixed(2)}
                      </span>
                    )}
                  </button>
                </div>
              );
            }

            if (apostaJaActive && !isSuspended) {
              return (
                <div className="w-full @[420px]:w-[340px]">
                  <div
                    className="w-full h-12 rounded-lg font-black text-sm uppercase tracking-wider text-white shadow-lg
                      bg-gradient-to-r from-red-600 to-rose-700 ring-2 ring-red-400 ring-opacity-50 animate-pulse
                      flex items-center justify-center gap-2 cursor-default select-none"
                  >
                    <span>⚡ APOSTA JÁ</span>
                  </div>
                </div>
              );
            }

            return (
              <div className={`grid ${gridCols} gap-2 relative transition-opacity duration-300 w-full @[420px]:w-[340px] ${isOddsBlocked ? 'opacity-70' : ''}`}>
                {sport === 'tennis' ? (
                  <>
                    {(hh > 0) ? (
                      <div className="flex flex-col gap-1">
                        <OddButton
                          label="Casa"
                          teamName={String(homeTeamName || '').split(',')[0].trim()}
                          price={hh}
                          trend={homeTrend}
                          onClick={(e) => { e.stopPropagation(); addPrimary('Casa', hh, hhSelection?.suspended); }}
                          className="w-full h-full min-h-[44px] px-1 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-between gap-1"
                          suspended={critSuspended || marketSuspended || (hhSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                        />
                      </div>
                    ) : <div />}

                    {(aa > 0) ? (
                      <div className="flex flex-col gap-1">
                        <OddButton
                          label="Fora"
                          teamName={String(awayTeamName || '').split(',')[0].trim()}
                          price={aa}
                          trend={awayTrend}
                          onClick={(e) => { e.stopPropagation(); addPrimary('Fora', aa, aaSelection?.suspended); }}
                          className="w-full h-full min-h-[44px] px-1 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-between gap-1"
                          suspended={critSuspended || marketSuspended || (aaSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                        />
                      </div>
                    ) : <div />}
                  </>
                ) : (
                  <>
                    {(hh > 0) ? (
                      <OddButton
                        label="Casa"
                        price={hh}
                        trend={homeTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Casa', hh, hhSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-1 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (hhSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    ) : <div />}

                    {showDraw && (
                      <OddButton
                        label="Empate"
                        price={dd}
                        trend={drawTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Empate', dd, ddSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-1 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (ddSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    )}

                    {(aa > 0) ? (
                      <OddButton
                        label="Fora"
                        price={aa}
                        trend={awayTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Fora', aa, aaSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-1 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (aaSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    ) : <div />}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div> 
  ); 
}

export const MemoEventCard = memo(EventCard);
export default MemoEventCard;
