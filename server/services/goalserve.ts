/**
 * GoalServe sports data client — full replacement for sportsApiPro.ts, covering the same 5 sports
 * currently live (soccer, tennis, basketball, ice-hockey, baseball): live scores, schedule/fixtures
 * by date, and pregame/live odds. Produces the exact same NormalizedEvent/OddsResult shapes as
 * sportsApiPro.ts so it's a drop-in swap in server/routes/events.ts.
 *
 * All 5 sports' field names, status vocabularies, match-nesting structure (wrapped vs. unwrapped),
 * and odds feed structure (type/bookmaker/odd, Total/Handicap line wrappers, `stop` suspension
 * flags) are now CONFIRMED against GoalServe's own official "<Sport> Data Feed" PDFs, including
 * real sample XML for each — every place that reflects it is marked CONFIRMED in a comment:
 *   - Soccer:      category/matches(date-wrapped)/match/localteam/visitorteam/goals,
 *                  "Country: League" category name, FT/AET/Pen./WO/Awarded/HT/Break Time/etc.
 *   - Hockey/Basketball/Baseball: category/match (NO date wrapper)/localteam/awayteam/totalscore,
 *                  plus their own status words (Finished, After Over Time, Walk Over, Overtime,
 *                  Nth Quarter, Top/Bot of Nth, Final/Final-N, Live).
 *   - Tennis:      category/match (no wrapper on livescore, `<matches>`-wrapped on odds only)/
 *                  generic `<player>` elements (no localteam/awayteam) with totalscore=sets won,
 *                  plus Retired/Set 1..Set 5.
 * The odds feed's type/bookmaker/total/handicap/odd/stop structure is confirmed IDENTICAL across
 * all 5 sports, so parseOddsMatch()/extractOddsFromType() need no sport-specific branching.
 * UFC/MMA documentation was also provided but UFC isn't part of this app's supported sports list
 * (fighter-vs-fighter, no draw outcome, different stats shape) — not integrated here.
 *
 * ⚠️ NONE OF THIS has been exercised against a real live response — this sandbox's network egress
 * blocks goalserve.com entirely (confirmed via both curl and Node's fetch — "Host not in
 * allowlist", not even the target server's own rejection like the casino aggregator's IP
 * whitelist was). The PDFs give the schema; they don't prove this code reads it correctly end to
 * end. Validate against real live/odds responses for every sport before trusting this in
 * production; until then keep SPORTS_DATA_PROVIDER unset/'sportsapipro' so the known-working path
 * stays live.
 */

import { gunzipSync } from 'node:zlib';
import type { NormalizedEvent, OddsResult } from './sportsApiPro';

// https, not http: every real example URL across all 5 official Data Feed PDFs and the general
// reference doc uses https — http was an unverified leftover from before any PDF was read.
const BASE_URL = 'https://www.goalserve.com/getfeed';
const ODDS_BASE_URL = 'https://www.goalserve.com/getfeed';

/** GoalServe uses a different URL segment per sport, unlike sportsApiPro's uniform subdomain
 *  pattern. Matches the "SPORT_TYPES" list and per-sport feed paths in the shared docs. */
function sportSegment(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccernew';
  if (s === 'tennis' || s === 'tênis') return 'tennis_scores';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'bsktbl';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'baseball') return 'baseball';
  if (s === 'handball') return 'handball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'rugby-union' || s === 'rugby') return 'rugby';
  if (s === 'cricket') return 'cricket';
  if (s === 'esports') return 'esports';
  return 'soccernew';
}

/** The single odds-comparison endpoint namespace is always "soccer" in the path — the actual
 *  sport is selected via the `cat` query param (`{oddsCat}_10`), per the shared docs. */
function oddsCat(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'tennis' || s === 'tênis') return 'tennis';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'basket';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'baseball') return 'baseball';
  if (s === 'handball') return 'handball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'rugby-union' || s === 'rugby') return 'rugby';
  if (s === 'cricket') return 'cricket';
  if (s === 'esports') return 'esports';
  return 'soccer';
}

/** Redacts the API key segment of a GoalServe URL before it hits logs (server logs are often
 *  shipped to third-party log aggregators in production — the key shouldn't end up there). */
function redactKey(url: string): string {
  return url.replace(/(getfeed\/)[^/]+/i, '$1***').replace(/([?&]k=)[^&]+/i, '$1***');
}

/** CONFIRMED against a real production response (soccernew/home?json=1, captured via the app's
 *  own Railway container): GoalServe's XML->JSON conversion prefixes every XML ATTRIBUTE with `@`
 *  (`@name`, `@id`, `@status`, `@goals`, ...) while leaving XML ELEMENT names (which become object
 *  keys holding nested objects/arrays, like `category`, `matches`, `match`, `localteam`,
 *  `visitorteam`, `events`) unprefixed. None of the per-sport PDFs ever showed a real JSON sample
 *  (only XML), so every accessor in this file (`m?.status`, `category?.name`, `t?.value`, etc.)
 *  was written assuming attributes came through as plain keys — which is why, even once network
 *  access and the API key were both confirmed working, live/schedule/odds all still parsed to
 *  empty: every single field read back `undefined`.
 *
 *  Fixed at the single fetch choke point instead of touching every accessor across this file:
 *  strip the `@` prefix from every key, recursively, right after JSON.parse. Every existing
 *  accessor then reads the plain key it always assumed, unchanged. (The root `"?xml"` declaration
 *  key is untouched — nothing reads it, and its `?` isn't the `@` prefix being stripped anyway.) */
function stripAttrPrefix(node: any): any {
  if (Array.isArray(node)) return node.map(stripAttrPrefix);
  if (node && typeof node === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k.startsWith('@') ? k.slice(1) : k] = stripAttrPrefix(v);
    }
    return out;
  }
  return node;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGzipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function decodeBodyBuffer(buf: Buffer, contentEncoding?: string | null): string {
  const enc = String(contentEncoding || '').toLowerCase().trim();
  if (enc.includes('gzip') || isGzipBuffer(buf)) {
    try {
      return gunzipSync(buf).toString('utf8');
    } catch {
      // Some fetch implementations auto-decompress but still expose headers/URLs that suggest
      // gzip. Fall back to raw utf8 instead of treating that as a hard failure.
    }
  }
  return buf.toString('utf8');
}

function bodyPreview(text: string, max = 300): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

// Railway's "Static Outbound IPs" feature spreads this service's own outbound traffic across
// several replicas, each pinned to a different egress IP — but only some of those IPs may be
// whitelisted with GoalServe at any given time. A 403/429/5xx from GoalServe is therefore not
// necessarily a hard, per-URL failure: a retry can land on a different replica (different egress
// IP) and succeed outright. Retrying a couple of times with a short delay costs little and masks
// exactly this class of intermittent, infra-level failure while the whitelist gap is closed.
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000, 7000];

async function fetchJson(url: string, timeoutMs = 12000, _retriedJsonParam = false, _attempt = 0): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const text = decodeBodyBuffer(buf, res.headers.get('content-encoding'));
    clearTimeout(t);
    if (!res.ok) {
      // Previously swallowed silently — a 401/403 (bad/unwhitelisted key), 404 (wrong URL
      // segment), or 5xx from GoalServe looked identical to "no matches today" with no log line
      // at all, which made a real outage or misconfiguration indistinguishable from an empty
      // schedule in production. Always log the status so that distinction is visible.
      console.error('[goalserve] HTTP', res.status, redactKey(url), bodyPreview(text));
      if (RETRYABLE_STATUS.has(res.status) && _attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[_attempt]);
        return fetchJson(url, timeoutMs, _retriedJsonParam, _attempt + 1);
      }
      return null;
    }
    if (!text) {
      console.error('[goalserve] empty response body:', redactKey(url));
      return null;
    }
    try {
      return stripAttrPrefix(JSON.parse(text));
    } catch {
      // GoalServe's own docs disagree on the boolean-flag spelling: the general reference doc and
      // 4 of 5 sport PDFs say `?json=1`, but the Soccer PDF's own "Basic feed format" section says
      // `?json=true` — since this is unverified against a live response, try the other spelling
      // once before giving up, instead of assuming "1" is universally correct.
      if (!_retriedJsonParam && /[?&]json=1(&|$)/.test(url)) {
        return fetchJson(url.replace(/([?&])json=1(&|$)/, '$1json=true$2'), timeoutMs, true);
      }
      console.error('[goalserve] non-JSON response (check ?json=1/?json=true and the feed path):', redactKey(url), bodyPreview(text, 200));
      return null;
    }
  } catch (e) {
    console.error('[goalserve] fetch failed:', redactKey(url), String((e as any)?.message || e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

function apiKeyOk(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/** GoalServe wraps most feeds under `scores.category` (soccer) or a sport-specific root key.
 *  ??? exact root key names per sport are the single biggest unknown here — this checks every
 *  plausible shape from the docs and falls back broad rather than narrow. */
function extractCategories(payload: any): any[] {
  if (!payload) return [];
  const roots = [
    payload?.scores?.category,
    payload?.category,
    payload?.data?.category,
    payload?.matches?.category, // ??? bsktbl/tennis_scores/hockey/baseball may nest one level differently
    payload?.tournaments?.tournament,
    payload?.scores?.tournament,
  ];
  for (const r of roots) {
    if (Array.isArray(r)) return r;
    if (r && typeof r === 'object') return [r]; // GoalServe often omits the array wrapper for a single category
  }
  return [];
}

/** CONFIRMED (official Soccer Data Feed PDF): a soccer category's matches sit under a single
 *  `<matches date="May 15" formatted_date="15.05.2020">` wrapper carrying the date, itself
 *  containing one or more `<match>` elements (which only carry `time`, not their own date). This
 *  returns each date-wrapper with its `match` list attached, so callers can pull formatted_date
 *  down onto every match.
 *
 *  CONFIRMED (official Hockey/Basketball/Baseball Data Feed PDFs, and Tennis's livescore feed):
 *  these sports have NO `<matches>` wrapper at all — `<category>` directly contains one or more
 *  `<match>` elements, each carrying its own `date`/`time`. That's exactly the `category?.match`
 *  fallback branch below, so it needed no code change — only this confirmation that it's the
 *  correct primary path for those sports, not just a lucky fallback.
 *
 *  CONFIRMED (official Tennis Data Feed PDF, odds feed only): tennis's ODDS feed (unlike its
 *  livescore feed) DOES wrap matches in a plain `<matches>` element with no date attributes —
 *  still read correctly by the wrapper branch below since formattedDate simply comes back empty
 *  and normalizeMatch() already falls back to reading the date straight off the match. */
function extractMatchGroups(category: any): Array<{ formattedDate: string; matches: any[] }> {
  if (!category) return [];
  const wrappers = Array.isArray(category?.matches) ? category.matches : category?.matches ? [category.matches] : [];
  if (wrappers.length) {
    return wrappers.map((w: any) => ({
      formattedDate: str(w?.formatted_date),
      matches: Array.isArray(w?.match) ? w.match : w?.match ? [w.match] : [],
    }));
  }
  // Hockey/basketball/baseball/tennis-livescore: matches directly under the category, or under a
  // plain (non-array) `game`/`games` container (kept as a defensive fallback for other sports).
  const flat = category?.match ?? category?.game ?? category?.games;
  const matches = Array.isArray(flat) ? flat : flat ? [flat] : [];
  return matches.length ? [{ formattedDate: '', matches }] : [];
}

function num(v: any): number {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

/** CONFIRMED for soccer: `<localteam>` / `<visitorteam>`. CONFIRMED for hockey/basketball/baseball
 *  (official Hockey/Basketball/Baseball Data Feed PDFs): `<localteam>` / `<awayteam>` — already
 *  reachable via the fallback chain below. CONFIRMED for tennis (official Tennis Data Feed PDF):
 *  there is no localteam/awayteam at all — a match carries two generic `<player>` elements instead,
 *  first = home/player1, second = away/player2 (no attribute distinguishes them beyond order). */
function extractTeams(m: any, sport?: string): { home: any; away: any } {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'tennis' || s === 'tênis') {
    const players = Array.isArray(m?.player) ? m.player : m?.player ? [m.player] : [];
    return { home: players[0] ?? {}, away: players[1] ?? {} };
  }
  const home = m?.localteam ?? m?.hometeam ?? m?.home_team ?? m?.home ?? {};
  const away = m?.visitorteam ?? m?.awayteam ?? m?.away_team ?? m?.away ?? {};
  return { home, away };
}

// Some leagues' real-world sponsorship title (e.g. Brazil's Série A is officially "Brasileirão
// Betano") ends up embedded straight in GoalServe's category name. A rival sportsbook's brand
// must never appear anywhere on BET62, so every league/category name is scrubbed of known
// bookmaker/sponsor names before it reaches any consumer.
const SPONSOR_BRAND_NAMES = [
  'betano', 'bet365', 'betfair', 'betway', 'bwin', 'betsson', 'sportingbet', 'kto',
  'betmgm', 'betfred', 'betvictor', 'unibet', 'parimatch', 'rivalo', 'estrelabet',
  'novibet', 'vbet', 'betsul', 'superbet', 'f12bet', 'mcgames', 'betnacional', 'blaze',
  'pinnacle', '1xbet', 'stake', 'leovegas', 'betclic', 'marathonbet', 'william hill',
  'ladbrokes', 'betrivers', 'draftkings', 'fanduel', 'pokerstars', 'caesars', 'betsafe',
];
const SPONSOR_BRAND_RE = new RegExp(
  `\\b(${SPONSOR_BRAND_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
);

function stripSponsorBrands(name: string): string {
  if (!name) return name;
  return name
    .replace(SPONSOR_BRAND_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
}

/** "Country: League" — CONFIRMED category.name format for soccer. */
function splitCategoryName(name: string): { country: string; league: string } {
  name = stripSponsorBrands(name);
  const idx = name.indexOf(':');
  if (idx === -1) return { country: '', league: name };
  return { country: name.slice(0, idx).trim(), league: name.slice(idx + 1).trim() };
}

function teamName(t: any): string {
  return str(t?.name ?? t?.['@name'] ?? t);
}

function teamId(t: any): string {
  return str(t?.id ?? t?.['@id']);
}

function teamLogo(t: any): string {
  return str(t?.logo ?? t?.badge ?? t?.image ?? '');
}

function normalizeComparableName(name: string): string {
  return str(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function teamPairKey(home: string, away: string): string {
  const h = normalizeComparableName(home);
  const a = normalizeComparableName(away);
  return h && a ? `${h}::${a}` : '';
}

/** CONFIRMED for soccer: `goals` on the team element (e.g. `<localteam name="Liverpool" goals="3"
 *  id="9249" />`) — not `score`. CONFIRMED for hockey/basketball/baseball (official Data Feed
 *  PDFs): `totalscore` (already the 3rd fallback below, so this needed no code change — verified
 *  it's not just being reached "by luck"). CONFIRMED for tennis: `totalscore` is sets won per
 *  player, also read via the same fallback. Empty string (not-started matches always report
 *  `goals=""`/`totalscore=""`) correctly falls through to null. */
function teamScore(t: any, m: any, side: 'home' | 'away'): number | null {
  const direct = t?.goals ?? t?.score ?? t?.totalscore;
  if (direct != null && direct !== '') return num(direct);
  const fromMatch = side === 'home' ? (m?.localteam_score ?? m?.hscore) : (m?.awayteam_score ?? m?.ascore);
  if (fromMatch != null && fromMatch !== '') return num(fromMatch);
  return null;
}

/** CONFIRMED against all 5 official Data Feed PDFs (Soccer/Hockey/Basketball/Tennis/Baseball) —
 *  vocabulary varies per sport but is merged into one parser since it's a superset with no
 *  overlapping contradictions:
 *  Not started  → the literal kickoff time as the status string, e.g. status="14:30", or the
 *                 literal "Not Started" (all 5 sports).
 *  Live         → soccer: bare minute number, "HT", "Break Time", "ET", "P". Hockey/basketball:
 *                 "1st".."4th Quarter", "Overtime", "Half Time". Tennis: "Set 1".."Set 5".
 *                 Baseball: "Top of 1st"/"Bot of 1st".. (any inning), bare "Live", "Break Time".
 *  Finished     → "FT", "AET", "Pen.", "WO"/"Walk Over"/"Walk over" (walkover, spacing/casing
 *                 varies by sport), "Awarded" (technical loss), "Finished" (hockey/basketball/
 *                 tennis literal), "After Over Time"/"After Extra Time"/"After Penalties" (finished
 *                 after OT/penalties), "Retired" (tennis technical finish), "Final"/"Final/11"
 *                 (baseball, "/N" = finished after N extra innings).
 *  Not playable → "Postp.", "Postponed", "Aban.", "Abandoned", "Cancl.", "Cancelled", "Susp.",
 *                 "Suspended", "Int.", "Interrupted", "Delayed" — never finished, never live; left
 *                 for manual admin resolution rather than guessed at.
 *
 *  CRITICAL: server/routes/events.ts's Settlement Engine checks `status_short === 'FT'` as an
 *  exact string match to decide a bet is resolvable — every finished variant below must map to
 *  precisely 'FT', not a close variant, or matches will simply never settle. */
function parseStatus(raw: string): { status: string; statusShort: string; isLive: number; elapsed: number } {
  const s = str(raw);
  if (!s) return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 };

  if (
    /^(FT|AET|Pen\.?|WO|Walk[ ]?[Oo]ver|Awarded|Full-?time|After Penalties|After Extra Time|After Over Time|Finished|Retired|Final(\/\d+)?)$/i.test(
      s,
    )
  ) {
    return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: 90 };
  }

  if (/^(Postp\.?|Postponed|Aban\.?|Abandoned|Cancl\.?|Cancell?ed|Susp\.?|Suspended|Int\.?|Interrupted|Delayed)$/i.test(s)) {
    return { status: s, statusShort: s.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase(), isLive: 0, elapsed: 0 };
  }

  // A bare "HH:mm" kickoff time (or the commentaries feed's own "Not Started" text) means the
  // match hasn't started.
  if (/^\d{1,2}:\d{2}$/.test(s) || /^Not Started$/i.test(s)) {
    return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 };
  }

  if (/^(HT|Half[ -]?[Tt]ime)$/i.test(s)) return { status: 'Half Time', statusShort: 'HT', isLive: 1, elapsed: 45 };
  if (/^Break Time$/i.test(s)) return { status: s, statusShort: 'BREAK', isLive: 1, elapsed: 90 };
  if (/^(ET|Extra Time)$/i.test(s)) return { status: 'Extra Time', statusShort: 'ET', isLive: 1, elapsed: 105 };
  if (/^(P|Penalties)$/i.test(s)) return { status: 'Penalties', statusShort: 'PEN', isLive: 1, elapsed: 120 };
  if (/^First Half$/i.test(s)) return { status: s, statusShort: '1H', isLive: 1, elapsed: 1 };
  if (/^Second Half$/i.test(s)) return { status: s, statusShort: '2H', isLive: 1, elapsed: 46 };

  // Hockey/basketball (CONFIRMED PDFs): "1st"/"2nd"/"3rd"/"4th Quarter" and "Overtime" live states.
  const quarterMatch = /^(1st|2nd|3rd|4th)\s+Quarter$/i.exec(s);
  if (quarterMatch) {
    const n = ({ '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 } as Record<string, number>)[quarterMatch[1].toLowerCase()] || 1;
    return { status: s, statusShort: `Q${n}`, isLive: 1, elapsed: n * 10 };
  }
  if (/^Overtime$/i.test(s)) return { status: s, statusShort: 'OT', isLive: 1, elapsed: 65 };

  // Tennis (CONFIRMED PDF): "Set 1".."Set 5" live states.
  const setMatch = /^Set\s+([1-5])$/i.exec(s);
  if (setMatch) return { status: s, statusShort: `S${setMatch[1]}`, isLive: 1, elapsed: Number(setMatch[1]) };

  // Baseball (CONFIRMED PDF): "Top of 1st"/"Bot of 1st".. (any inning number/ordinal) and the bare
  // "Live" state (inning unknown or extra innings in progress).
  const inningMatch = /^(Top|Bot) of (\d+)(st|nd|rd|th)$/i.exec(s);
  if (inningMatch) {
    return { status: s, statusShort: `${inningMatch[1].toUpperCase()}${inningMatch[2]}`, isLive: 1, elapsed: Number(inningMatch[2]) };
  }
  if (/^Live$/i.test(s)) return { status: s, statusShort: 'LIVE', isLive: 1, elapsed: 0 };

  // Otherwise: a bare minute number (regular time in progress), possibly "45+2" style injury time.
  const minuteMatch = /^(\d{1,3})/.exec(s);
  if (minuteMatch) {
    const elapsed = Number(minuteMatch[1]);
    return { status: s, statusShort: elapsed <= 45 ? '1H' : '2H', isLive: 1, elapsed };
  }

  // Unrecognized text — surfaced as-is (not live, not finished) rather than silently misclassified.
  return { status: s, statusShort: s.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase(), isLive: 0, elapsed: 0 };
}

/** CONFIRMED (official Tennis Data Feed PDF, livescore feed): each `<player>` carries `s1`..`s5`
 *  (set score, or "6.5" for a set decided by tiebreak — "6" is the set score, "5" the tiebreak
 *  score, so only the part before the dot matters for display) and `game_score` (the current
 *  game's point score: "", "0", "15", "30", "40", or "A" for advantage — "" when the match isn't
 *  live). Building this here (rather than leaving it to the frontend) keeps normalizeMatch() the
 *  single place that reads GoalServe's raw field names. */
function tennisSets(home: any, away: any): Record<string, { home: number | null; away: number | null }> {
  const parseSet = (v: any): number | null => {
    const s = str(v);
    if (!s) return null;
    const dot = s.indexOf('.');
    return num(dot === -1 ? s : s.slice(0, dot));
  };
  const out: Record<string, { home: number | null; away: number | null }> = {};
  for (let i = 1; i <= 5; i++) {
    const h = home?.[`s${i}`];
    const a = away?.[`s${i}`];
    if (!str(h) && !str(a)) continue;
    out[`s${i}`] = { home: parseSet(h), away: parseSet(a) };
  }
  return out;
}

function tennisPoint(gameScore: any): '15' | '30' | '40' | 'AD' | null {
  const s = str(gameScore).toUpperCase();
  if (s === '15' || s === '30' || s === '40') return s as '15' | '30' | '40';
  if (s === 'A') return 'AD';
  return null;
}

/** Converts one GoalServe match object (soccer or otherwise) into the NormalizedEvent shape every
 *  other part of the app (odds versioning, bet settlement, EventCard) already relies on.
 *  `wrapperFormattedDate` is the confirmed date source for soccer — see extractMatchGroups(). */
function normalizeMatch(sport: string, category: any, m: any, wrapperFormattedDate: string): NormalizedEvent | null {
  if (!m) return null;
  const { home, away } = extractTeams(m, sport);
  const homeName = teamName(home);
  const awayName = teamName(away);
  if (!homeName || !awayName) return null;

  const id = str(m?.id ?? m?.['@id'] ?? m?.fixture_id);
  if (!id) return null;

  const { status, statusShort, isLive, elapsed } = parseStatus(str(m?.status ?? m?.status_name));
  const homeScore = teamScore(home, m, 'home');
  const awayScore = teamScore(away, m, 'away');

  // CONFIRMED for soccer: formatted_date="dd.MM.yyyy" lives on the parent <matches> wrapper (see
  // extractMatchGroups), while time="HH:mm" (UTC) lives on the <match> element itself. Falls back
  // to reading date directly off the match for sports without a confirmed schema.
  const dateRaw = wrapperFormattedDate || str(m?.formatted_date ?? m?.date);
  const timeRaw = str(m?.time ?? m?.formatted_time);
  let eventDate = '';
  const dm = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateRaw);
  if (dm) {
    const [, dd, mm, yyyy] = dm;
    eventDate = `${yyyy}-${mm}-${dd}T${timeRaw || '00:00'}:00Z`;
  } else if (dateRaw) {
    eventDate = timeRaw ? `${dateRaw}T${timeRaw}:00Z` : dateRaw;
  }

  const categoryName = stripSponsorBrands(str(category?.name ?? category?.['@name']));
  const { country, league } = splitCategoryName(categoryName);

  const sLower = String(sport || '').toLowerCase().trim();
  const scoreObj: Record<string, unknown> = { home: homeScore, away: awayScore };
  if (sLower === 'tennis' || sLower === 'tênis') {
    scoreObj.sets = tennisSets(home, away);
    const homePoint = tennisPoint(home?.game_score);
    const awayPoint = tennisPoint(away?.game_score);
    if (homePoint || awayPoint) scoreObj.point = { home: homePoint, away: awayPoint };
    if (toBool(home?.serve)) scoreObj.serve = 'home';
    else if (toBool(away?.serve)) scoreObj.serve = 'away';
  }

  return {
    external_event_id: `goalserve_${id}`,
    sport,
    league: league || categoryName,
    home_team: homeName,
    away_team: awayName,
    team_match: `${homeName} vs ${awayName}`,
    event_date: eventDate,
    status,
    status_short: statusShort,
    status_long: status,
    is_live: isLive,
    home_odd: 0,
    draw_odd: 0,
    away_odd: 0,
    elapsed,
    timer: str(m?.timer ?? m?.minute ?? (elapsed || '')),
    score: JSON.stringify(scoreObj),
    markets: '{}',
    country,
    home_team_logo: teamLogo(home),
    away_team_logo: teamLogo(away),
    fixture: { id, date: eventDate, status: { description: status } },
    teams: { home: { id: teamId(home), name: homeName, logo: teamLogo(home) }, away: { id: teamId(away), name: awayName, logo: teamLogo(away) } },
    goals: { home: homeScore, away: awayScore },
  };
}

function flattenMatches(sport: string, payload: any): NormalizedEvent[] {
  const categories = extractCategories(payload);
  const out: NormalizedEvent[] = [];
  for (const cat of categories) {
    for (const group of extractMatchGroups(cat)) {
      for (const m of group.matches) {
        const n = normalizeMatch(sport, cat, m, group.formattedDate);
        if (n) out.push(n);
      }
    }
  }
  return out;
}

// ---- League/team logos ----
// Separate API host and auth style from every other GoalServe feed above: base
// data2.goalserve.com:8084, key passed as `?k=` rather than in the URL path, and its own
// {SPORT_TYPES} segment naming (documented separately from the main feed docs — e.g. plain
// "basketball"/"hockey", not "bsktbl"/"hockey" mixed with GoalServe's feed-path abbreviations).
// ??? whether {USER_GUID} is the same account key used everywhere else, or a distinct value, is
// unconfirmed — the shared docs only call it "User's global unique identifier" with no example.
// ??? the response shape is entirely unconfirmed — no sample was provided; parsed defensively.

const LOGO_BASE_URL = 'http://data2.goalserve.com:8084/api/v1/logotips';
const LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // logos change rarely — cache generously
const LOGO_MIN_INTERVAL_MS = 1100; // docs: "Requests limit - 1 request per second"

const logoCache = new Map<string, { ts: number; url: string }>();
let logoRateLimitChain: Promise<void> = Promise.resolve();

function logosSportType(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'basketball';
  if (s === 'baseball') return 'baseball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'tennis' || s === 'tênis') return 'tennis';
  if (s === 'handball') return 'handball';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'cricket') return 'cricket';
  return 'soccer';
}

function logoEntityType(sport: string): 'teams' | 'players' {
  const s = String(sport || '').toLowerCase().trim();
  return s === 'tennis' || s === 'tênis' ? 'players' : 'teams';
}

function extractLogoEntries(payload: any): Array<{ id: string; url: string }> {
  if (!payload) return [];
  const candidates = [payload?.teams, payload?.leagues, payload?.players, payload?.data, payload?.logos, payload?.results, payload];
  for (const c of candidates) {
    const arr = Array.isArray(c)
      ? c
      : Array.isArray(c?.team)
        ? c.team
        : Array.isArray(c?.league)
          ? c.league
          : Array.isArray(c?.player)
            ? c.player
            : null;
    if (!arr) continue;
    const out: Array<{ id: string; url: string }> = [];
    for (const item of arr) {
      const id = str(item?.id ?? item?.['@id'] ?? item?.team_id ?? item?.league_id ?? item?.player_id);
      const url = str(item?.logo ?? item?.url ?? item?.image ?? item?.badge ?? item?.path ?? item?.['#text']);
      if (id && url) out.push({ id, url });
    }
    if (out.length) return out;
  }
  return [];
}

// CONFIRMED against a real production log: a single request batching several hundred ids (tennis,
// with its much larger per-day player count, hit this first) came back 404 rather than a partial
// result — some limit on request/URL size is being exceeded, though GoalServe's own docs don't
// state the exact number for this endpoint specifically (only a "max 20 ids" note on a *different*
// basketball profile endpoint). 60 is a deliberately conservative guess to stay well clear of
// whatever the real ceiling is, not a confirmed value — safe either way since an over-sized chunk
// just fails that one chunk's ids the same way the unchunked call already did, never the whole
// batch or the events those ids belong to (this function never throws).
const LOGO_MAX_IDS_PER_REQUEST = 60;
const LOGO_FETCH_COOLDOWN_MS = 5 * 60 * 1000;
const logoFailureCache = new Map<string, number>();

/** Batch-fetches team logos for every id not already cached, chunked to stay under whatever size
 *  limit this endpoint enforces (see LOGO_MAX_IDS_PER_REQUEST) — naturally respects the 1 req/sec
 *  limit as long as callers don't fan out per-event requests. Never throws: a failed or
 *  unconfirmed-shape response just leaves those ids uncached, and callers fall back to no logo
 *  rather than losing the event data over it. */
async function fetchTeamLogos(apiKey: string, sport: string, teamIds: string[]): Promise<void> {
  const type = logosSportType(sport);
  const entity = logoEntityType(sport);
  const failureKey = `${type}:${entity}`;
  const blockedUntil = logoFailureCache.get(failureKey) || 0;
  if (blockedUntil > Date.now()) return;
  const missing = Array.from(new Set(teamIds)).filter((id) => {
    const cached = logoCache.get(`${type}:${id}`);
    return !cached || Date.now() - cached.ts >= LOGO_CACHE_TTL_MS;
  });
  if (!missing.length || !apiKeyOk(apiKey)) return;

  const run = async () => {
    for (let i = 0; i < missing.length; i += LOGO_MAX_IDS_PER_REQUEST) {
      const chunk = missing.slice(i, i + LOGO_MAX_IDS_PER_REQUEST);
      const url = `${LOGO_BASE_URL}/${type}/${entity}?k=${encodeURIComponent(apiKey)}&ids=${chunk.map(encodeURIComponent).join(',')}`;
      const json = await fetchJson(url, 8000);
      if (!json) {
        logoFailureCache.set(failureKey, Date.now() + LOGO_FETCH_COOLDOWN_MS);
        return;
      }
      for (const { id, url: logoUrl } of extractLogoEntries(json)) {
        logoCache.set(`${type}:${id}`, { ts: Date.now(), url: logoUrl });
      }
    }
    logoFailureCache.delete(failureKey);
  };

  // Serialize against any other in-flight logo fetch so concurrent live+schedule calls for
  // different sports still respect the shared 1 req/sec limit.
  const chained = logoRateLimitChain.then(run).catch(() => void 0);
  logoRateLimitChain = chained.then(() => new Promise((resolve) => setTimeout(resolve, LOGO_MIN_INTERVAL_MS)));
  return chained;
}

/** Patches home_team_logo/away_team_logo (and the nested teams.*.logo mirrors) onto already-
 *  normalized events, using whatever logos are cached or can be fetched in one batch call.
 *  Best-effort — never removes or blocks on events whose logo isn't available. */
async function attachTeamLogos(apiKey: string, sport: string, events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
  if (!events.length) return events;
  const ids = events.flatMap((e) => [e.teams?.home?.id, e.teams?.away?.id]).filter((id): id is string => !!id);
  await fetchTeamLogos(apiKey, sport, ids).catch(() => void 0);
  const type = logosSportType(sport);
  const lookup = (id: string | undefined) => (id ? logoCache.get(`${type}:${id}`)?.url || '' : '');
  for (const e of events) {
    const homeLogo = lookup(e.teams?.home?.id) || e.home_team_logo;
    const awayLogo = lookup(e.teams?.away?.id) || e.away_team_logo;
    e.home_team_logo = homeLogo;
    e.away_team_logo = awayLogo;
    if (e.teams?.home) e.teams.home.logo = homeLogo;
    if (e.teams?.away) e.teams.away.logo = awayLogo;
  }
  return events;
}

/** Calls the sport's "home" livescore feed (today's live + finished matches). */
export async function fetchGoalServeLive(apiKey: string, sport: string): Promise<NormalizedEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const seg = sportSegment(sport);
  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/${seg}/home?json=1`;
  const json = await fetchJson(url);
  const events = flattenMatches(sport, json);
  // Logos are secondary enrichment (their own rate-limited endpoint, data2.goalserve.com) — never
  // block the live feed on them. attachTeamLogos() mutates these same event objects in place, so
  // logos still show up once the batch resolves; a live snapshot just isn't held hostage to it.
  void attachTeamLogos(apiKey, sport, events).catch(() => void 0);
  return events;
}

/** GoalServe has no arbitrary-date schedule endpoint like sportsApiPro's `/api/schedule/{date}` —
 *  it only offers relative day-offset feeds (d-7..d-1, home, d1..d7). Converts the caller's
 *  "YYYY-MM-DD" date into the nearest day offset from today (UTC) and clamps to that ±7 window;
 *  a date further out than that returns an empty list rather than guessing at another endpoint. */
function dayOffsetSuffix(date: string): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const targetUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);
  if (diffDays === 0) return 'home';
  if (diffDays < -7 || diffDays > 7) return null;
  return diffDays > 0 ? `d${diffDays}` : `d${diffDays}`; // GoalServe's own negative segments already read "d-1".."d-7"
}

export async function fetchGoalServeSchedule(apiKey: string, sport: string, date: string): Promise<NormalizedEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const suffix = dayOffsetSuffix(date);
  if (!suffix) return [];
  const seg = sportSegment(sport);
  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/${seg}/${suffix}?json=1`;
  const json = await fetchJson(url);
  const events = flattenMatches(sport, json);
  // Same reasoning as fetchGoalServeLive(): logos are secondary enrichment, never block the
  // schedule on them. A full day's schedule can need many logo-id batches, each serialized behind
  // data2.goalserve.com's own rate limit (logoRateLimitChain/LOGO_MIN_INTERVAL_MS above) — awaiting
  // that here was turning a single schedule fetch into a multi-second wait dominated by logos.
  void attachTeamLogos(apiKey, sport, events).catch(() => void 0);
  return events;
}

// ---- Odds ----

function normalizeOutcomeKey(name: string): 'home' | 'draw' | 'away' | null {
  const n = str(name).toLowerCase();
  if (n === 'home' || n === '1' || n === 'localteam') return 'home';
  if (n === 'draw' || n === 'x' || n === 'tie') return 'draw';
  if (n === 'away' || n === '2' || n === 'visitorteam' || n === 'awayteam') return 'away';
  return null;
}

/** CONFIRMED IDENTICAL across all 5 official Data Feed PDFs (Soccer/Hockey/Basketball/Tennis/
 *  Baseball, PREGAME ODDS COMPARISON FEED section in each) — no sport-specific branching needed:
 *  <type value="Match Winner" stop="False" id="1">
 *    <bookmaker name="bwin" stop="False" ts="..." id="2">
 *      <odd name="Home" value="1.05"/>
 *  For Total/Handicap markets an extra line-value wrapper sits between bookmaker and odd:
 *    <bookmaker ...><total name="3.5" ismain="False" stop="False"><odd name="Over" value="1.9"/>
 *    <bookmaker ...><handicap name="-1.75" ismain="False" stop="False"><odd name="Home" .../>
 *  `stop="True"` at any level (type/bookmaker/total/handicap) means suspended/inactive — those
 *  odds are skipped rather than surfaced as if bettable. Line values get folded into the
 *  selection name ("Over 3.5") since OddsResult's market lines are flat {label, value, odd}. */
function isStopped(node: any): boolean {
  return node?.stop === 'True' || node?.stop === true || node?.stop === 'true';
}

/** `settlementOddname` is the string to pass as `oddname` to GoalServe's own Pregame Odds
 *  Settlements API (see fetchGoalServeOddSettlement below) — kept separate from `name` (the
 *  display string, e.g. "Over 3.5") because the ONE documented example of that API
 *  (`oddname=Under:8`) uses a colon between the selection and the line value, not a space. For
 *  plain markets with no line (h2h) the two are identical. ??? this colon convention is confirmed
 *  by exactly one example in the docs, not a formal field spec — if it turns out wrong for some
 *  market, the settlement lookup simply won't match anything (fails safe: the leg just stays
 *  'pending' for manual review, per settlementEngine.ts's design, never a wrong payout). */
function normalizeBookmakerName(name: any): string {
  return str(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function extractOddsFromType(typeBlock: any): Array<{ name: string; value: number; settlementOddname: string; bookmaker: string }> {
  if (isStopped(typeBlock)) return [];
  const bookmakers = Array.isArray(typeBlock?.bookmaker) ? typeBlock.bookmaker : typeBlock?.bookmaker ? [typeBlock.bookmaker] : [];
  const out: Array<{ name: string; value: number; settlementOddname: string; bookmaker: string }> = [];
  for (const bm of bookmakers) {
    if (isStopped(bm)) continue;
    const bookmaker = normalizeBookmakerName(bm?.name ?? bm?.bookmaker ?? bm?.title);
    const lineWrappers = [
      ...(Array.isArray(bm?.total) ? bm.total : bm?.total ? [bm.total] : []),
      ...(Array.isArray(bm?.handicap) ? bm.handicap : bm?.handicap ? [bm.handicap] : []),
    ];
    if (lineWrappers.length) {
      for (const w of lineWrappers) {
        if (isStopped(w)) continue;
        const point = str(w?.name);
        const odds = Array.isArray(w?.odd) ? w.odd : w?.odd ? [w.odd] : [];
        for (const o of odds) {
          const name = str(o?.name);
          const value = num(o?.value);
          if (name && value > 1) out.push({ name: point ? `${name} ${point}` : name, value, settlementOddname: point ? `${name}:${point}` : name, bookmaker });
        }
      }
      continue;
    }
    const odds = Array.isArray(bm?.odd) ? bm.odd : bm?.odd ? [bm.odd] : [];
    for (const o of odds) {
      const name = str(o?.name);
      const value = num(o?.value);
      if (name && value > 1) out.push({ name, value, settlementOddname: name, bookmaker });
    }
  }
  return out;
}

/** extractOddsFromType() above returns one entry per (bookmaker, selection) pair — for a market
 *  with N bookmakers priced, the same selection (e.g. "Home", or "Over 3.5") appears N times with
 *  different values. GoalServe's own PDFs describe this as intentional ("comparison feed between
 *  various bookmakers"), but BET62 shows one single best price per selection, not a bookmaker
 *  comparison table — surfacing all N duplicates to the frontend/bet slip is a real product bug,
 *  not just noise. `settlementOddname` already uniquely encodes the selection AND its line
 *  ("Over:3.5" vs "Home"), so it alone is enough to key on; keep the highest-value (best-for-the-
 *  bettor) entry per key. */
function bestOddsByOutcome<T extends { name: string; value: number; settlementOddname: string; bookmaker?: string }>(odds: T[]): T[] {
  const best = new Map<string, T>();
  for (const o of odds) {
    const key = o.settlementOddname;
    const existing = best.get(key);
    const preferCurrent =
      !existing ||
      (normalizeBookmakerName(o.bookmaker) === 'bet365' && normalizeBookmakerName(existing.bookmaker) !== 'bet365') ||
      (normalizeBookmakerName(o.bookmaker) === normalizeBookmakerName(existing.bookmaker) && o.value > existing.value);
    if (preferCurrent) best.set(key, o);
  }
  return Array.from(best.values());
}

/** Builds the OddsResult.markets.h2h array plus derived home/draw/away, matching exactly what
 *  parseSportsApiProMatchOddsPayload() produces so deriveAdditionalMarkets() and the settlement/
 *  odds-versioning code downstream work unmodified.
 *
 *  Every market entry additionally carries `market_id` (GoalServe's own numeric `<type id="...">`)
 *  and `goalserve_oddname` (settlementOddname from extractOddsFromType) — additive fields, nothing
 *  existing reads them so this can't change current behavior. They exist so a bet placed on one of
 *  these selections can later be looked up against GoalServe's own Pregame Odds Settlements API
 *  (fetchGoalServeOddSettlement), which is the only way this app can auto-settle markets beyond
 *  h2h (see server/lib/settlementEngine.ts's module docstring on that gap). Markets synthesized by
 *  server/services/marketDerivation.ts (correct_score, cards_odd_even, etc.) never carry these —
 *  GoalServe never priced them, so there is nothing to settle them against; they correctly keep
 *  requiring manual admin resolution, same as before this feature existed. */
function parseOddsMatch(m: any): OddsResult | null {
  if (!m) return null;
  const typeBlocks: any[] = Array.isArray(m?.odds?.type) ? m.odds.type : m?.odds?.type ? [m.odds.type] : [];
  const h2h: Array<{ label: string; value: string; odd: number; market_id?: number; goalserve_oddname?: string }> = [];
  const markets: Record<string, any[]> = {};

  for (const t of typeBlocks) {
    if (isStopped(t)) continue;
    // CONFIRMED across all 5 sports' PDFs: the base 1X2/Home-Away market's <type value="..."> is
    // literally "Match Winner". A couple of synonym fallbacks are kept for resilience regardless.
    const label = str(t?.value ?? t?.name ?? t?.['@value']).toLowerCase();
    const isH2H = label === 'match winner' || label.includes('1x2') || label.includes('full time result') || label === 'winner' || label === 'home/draw/away';
    const odds = bestOddsByOutcome(extractOddsFromType(t));
    if (!odds.length) continue;
    const marketId = Number(t?.id);
    const hasMarketId = Number.isFinite(marketId) && marketId > 0;

    if (isH2H) {
      for (const o of odds) {
        const key = normalizeOutcomeKey(o.name);
        if (!key) continue;
        h2h.push({
          label: key === 'home' ? 'Home' : key === 'away' ? 'Away' : 'Draw',
          value: o.name,
          odd: o.value,
          ...(hasMarketId ? { market_id: marketId } : {}),
          goalserve_oddname: o.settlementOddname,
        });
      }
    } else {
      const marketKey = label.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
      markets[marketKey] = odds.map((o) => ({
        label: o.name,
        value: o.name,
        odd: o.value,
        ...(hasMarketId ? { market_id: marketId } : {}),
        goalserve_oddname: o.settlementOddname,
      }));
    }
  }

  if (h2h.length) markets.h2h = h2h;
  if (!Object.keys(markets).length) return null;

  // h2h was already deduped to one entry per outcome above (bestOddsByOutcome), so there is at
  // most one "Home"/"Draw"/"Away" left — .find() makes that single-selection invariant explicit,
  // instead of Math.max() silently doing the same reduction over what used to be duplicates.
  const home = h2h.find((s) => s.label === 'Home')?.odd ?? 0;
  const draw = h2h.find((s) => s.label === 'Draw')?.odd ?? 0;
  const away = h2h.find((s) => s.label === 'Away')?.odd ?? 0;
  if (!home && !away && !Object.keys(markets).length) return null;

  return { home, draw, away, markets };
}

// CONFIRMED (all 5 official Data Feed PDFs, PREGAME ODDS COMPARISON FEED section): "requests
// limit – 1 request every 10 seconds per sport" — but the Tennis PDF spells out the condition
// that limit depends on: "1 request every 10 seconds per sport WITH ts attribute. Without ts the
// limit is 1 request per 30 seconds." fetchOddsPayload() below never sends `ts` (see the ts/delta
// TODO on fetchOddsPayload itself), so the real ceiling for every sport here is 1 request/30s, not
// 1/10s — this was previously set to 9s, well under even the relaxed limit, and was the actual
// cause of the intermittent 500s on tennis/hockey/baseball/basket confirmed against production
// (getodds/soccer?cat=X_10 is otherwise byte-for-byte the documented URL for every sport).
//
// This is a per-SPORT limit on the whole comparison feed (which returns every priced match for
// that sport in one payload), not a per-match limit. A caller asking for N different matches' odds
// in the same sport must reuse one fetch, not issue N requests — every exported
// fetchGoalServeMatchOdds*() below goes through this shared cache, and so does every caller of
// those (server/routes/events.ts's REST odds queue/fetchOddsStrict, server/ws/liveWs.ts's live
// snapshot loop) — grep for "getodds" in this repo turns up exactly one call site, this one, so
// this cache is the sole gate between any caller and GoalServe's odds endpoint for a given sport;
// no caller-side TTL (events.ts's LIVE_ODDS_FRESH_TTL_MS, liveWs.ts's own ODDS_FRESH_TTL_MS — both
// 8s, tuned only for perceived UI freshness) can cause an actual network request more often than
// this constant allows, since a "stale" caller-side cache still resolves through this same
// payload cache/inflight-dedup pair below.
//
// CAVEAT not addressed here: this cache is per-process (a plain in-memory Map). If this service
// ever runs more than one instance/replica sharing the same GoalServe API key (Railway's own
// multi-replica "Static Outbound IPs" setup makes this a real possibility, not hypothetical — see
// the IP-whitelist investigation elsewhere in this codebase's history), each replica enforces this
// 30s+ ceiling independently, and GoalServe could still see N replicas' worth of requests within
// the same window. A durable, cross-replica gate (e.g. a timestamp row in Postgres) would be
// needed to guarantee the limit account-wide; out of scope for this fix.
const ODDS_PAYLOAD_TTL_MS = 32_000; // 30s documented minimum without `ts` + 2s clock/latency margin

/** Builds a matchId -> parsed-odds lookup for one sport's whole odds payload, once per fetch,
 *  instead of walking the full category/match tree and re-running parseOddsMatch() (per-bookmaker
 *  dedup across every market) again for every single match lookup — the soccer feed alone runs
 *  ~150MB with thousands of matches, so re-walking it per event was the real cost behind an odds
 *  lookup, not the network fetch (already cached/throttled above). */
type OddsLookupEntry = {
  id: string;
  home: string;
  away: string;
  pairKey: string;
  odds: OddsResult;
};

type OddsPayloadIndexes = {
  byId: Map<string, OddsLookupEntry>;
  byTeams: Map<string, OddsLookupEntry[]>;
};

function indexOddsPayload(payload: any, sport: string): OddsPayloadIndexes {
  const byId = new Map<string, OddsLookupEntry>();
  const byTeams = new Map<string, OddsLookupEntry[]>();
  for (const cat of extractCategories(payload)) {
    for (const group of extractMatchGroups(cat)) {
      for (const match of group.matches) {
        const id = str(match?.id ?? match?.['@id']);
        const odds = parseOddsMatch(match);
        if (!odds) continue;
        const { home, away } = extractTeams(match, sport);
        const homeName = teamName(home);
        const awayName = teamName(away);
        const pairKey = teamPairKey(homeName, awayName);
        const item: OddsLookupEntry = { id, home: homeName, away: awayName, pairKey, odds };
        if (id) byId.set(id, item);
        if (pairKey) {
          const existing = byTeams.get(pairKey) || [];
          existing.push(item);
          byTeams.set(pairKey, existing);
        }
      }
    }
  }
  return { byId, byTeams };
}

type OddsPayloadEntry = { ts: number; payload: any; index: OddsPayloadIndexes };
const oddsPayloadCache = new Map<string, OddsPayloadEntry>();
const oddsPayloadInflight = new Map<string, Promise<OddsPayloadEntry | null>>();
const oddsPayloadFailures = new Map<string, { count: number; blockedUntil: number; lastAt: number }>();
const ODDS_BREAKER_BASE_MS = 2 * 60 * 1000;
const ODDS_BREAKER_MAX_MS = 15 * 60 * 1000;

async function fetchOddsPayloadEntry(apiKey: string, sport: string): Promise<OddsPayloadEntry | null> {
  if (!apiKeyOk(apiKey)) return null;
  const cat = oddsCat(sport);
  const cached = oddsPayloadCache.get(cat);
  const breaker = oddsPayloadFailures.get(cat);
  if (breaker && breaker.blockedUntil > Date.now()) return cached ?? null;
  if (cached && Date.now() - cached.ts < ODDS_PAYLOAD_TTL_MS) return cached;
  const inflight = oddsPayloadInflight.get(cat);
  if (inflight) return inflight;

  const url = `${ODDS_BASE_URL}/${encodeURIComponent(apiKey)}/getodds/soccer?cat=${cat}_10&json=1`;
  const p = fetchJson(url, 15000)
    .then((json) => {
      // A transient GoalServe failure (fetchJson already retried and still came back null) must
      // never blank out odds that were serving fine a moment ago — that turns a momentary 500 on
      // their end into "odds disappeared" for every bettor on this sport. Keep the last good
      // payload/index in the cache and serve it stale until a fetch actually succeeds.
      if (json != null) {
        const entry: OddsPayloadEntry = { ts: Date.now(), payload: json, index: indexOddsPayload(json, sport) };
        oddsPayloadCache.set(cat, entry);
        oddsPayloadFailures.delete(cat);
        return entry;
      }
      const prev = oddsPayloadFailures.get(cat);
      const count = (prev?.count || 0) + 1;
      const blockMs = count >= 2 ? Math.min(ODDS_BREAKER_BASE_MS * Math.pow(2, count - 2), ODDS_BREAKER_MAX_MS) : 0;
      const blockedUntil = blockMs > 0 ? Date.now() + blockMs : 0;
      oddsPayloadFailures.set(cat, { count, blockedUntil, lastAt: Date.now() });
      if (blockedUntil > 0) {
        console.warn('[goalserve] odds circuit open', cat, `for ${Math.round(blockMs / 1000)}s`);
      }
      return cached ?? null;
    })
    .finally(() => {
      oddsPayloadInflight.delete(cat);
    });
  oddsPayloadInflight.set(cat, p);
  return p;
}

async function fetchOddsPayload(apiKey: string, sport: string): Promise<any | null> {
  const entry = await fetchOddsPayloadEntry(apiKey, sport);
  return entry ? entry.payload : null;
}

/** Debug-only: returns the raw match ids/team names the odds-comparison feed actually carries for
 *  a sport right now, without going through the per-match parse/dedup path — used to check
 *  whether this feed's own match ids line up with the schedule feed's (server/routes/events.ts's
 *  /api/dev/provider-debug), since a real, high-profile match (e.g. a Rio derby) coming back with
 *  no odds is far more likely to be an id mismatch between the two GoalServe feeds than that match
 *  genuinely being unpriced by every bookmaker GoalServe aggregates. */
export async function fetchOddsPayloadSample(apiKey: string, sport: string): Promise<{ totalMatches: number; sample: Array<{ id: string; home: string; away: string }> } | null> {
  const payload = await fetchOddsPayload(apiKey, sport);
  if (!payload) return null;
  const categories = extractCategories(payload);
  const sample: Array<{ id: string; home: string; away: string }> = [];
  let totalMatches = 0;
  for (const cat of categories) {
    for (const group of extractMatchGroups(cat)) {
      for (const m of group.matches) {
        totalMatches += 1;
        if (sample.length < 10) {
          const { home, away } = extractTeams(m, sport);
          sample.push({ id: str(m?.id ?? m?.['@id']), home: teamName(home), away: teamName(away) });
        }
      }
    }
  }
  return { totalMatches, sample };
}

/** GoalServe doesn't split "all / live / pre-match" odds into separate endpoints the way
 *  sportsApiPro does — the same comparison feed carries whatever matches are currently priced,
 *  live or upcoming. All three exported functions below share this one fetch+parse path; kept as
 *  three functions only to match events.ts's existing call sites without changing its logic.
 *  Lookup is a Map.get() against the shared per-sport index built once per fetch in
 *  fetchOddsPayloadEntry() — no per-call tree-walk. */
async function fetchGoalServeMatchOdds(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  const entry = await fetchOddsPayloadEntry(apiKey, sport);
  if (!entry) return null;
  // GoalServe's match id in the index is its own (not prefixed) — matchId passed in may carry
  // our "goalserve_" prefix from normalizeMatch(), so strip it before looking up.
  const normalizedId = str(matchId).replace(/^goalserve_/, '');
  const exact = entry.index.byId.get(normalizedId);
  if (exact) return exact.odds;
  const pairKey = teamPairKey(str(opts?.homeTeam), str(opts?.awayTeam));
  if (!pairKey) return null;
  const matches = entry.index.byTeams.get(pairKey) || [];
  return matches.length === 1 ? matches[0].odds : null;
}

export async function debugGoalServeOddsLookup(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<{
  sport: string;
  requestedId: string;
  normalizedId: string;
  requestedTeams: { home: string; away: string; pairKey: string };
  cache: { byId: number; byTeams: number };
  matchedBy: 'id' | 'teams' | 'ambiguous_teams' | 'miss';
  exactMatch?: { id: string; home: string; away: string };
  teamCandidates: Array<{ id: string; home: string; away: string }>;
}> {
  const entry = await fetchOddsPayloadEntry(apiKey, sport);
  const normalizedId = str(matchId).replace(/^goalserve_/, '');
  const pairKey = teamPairKey(str(opts?.homeTeam), str(opts?.awayTeam));
  const exact = entry?.index.byId.get(normalizedId);
  const teamCandidates = pairKey
    ? (entry?.index.byTeams.get(pairKey) || []).map((x) => ({ id: x.id, home: x.home, away: x.away }))
    : [];
  return {
    sport,
    requestedId: str(matchId),
    normalizedId,
    requestedTeams: { home: str(opts?.homeTeam), away: str(opts?.awayTeam), pairKey },
    cache: { byId: entry?.index.byId.size || 0, byTeams: entry?.index.byTeams.size || 0 },
    matchedBy: exact ? 'id' : teamCandidates.length === 1 ? 'teams' : teamCandidates.length > 1 ? 'ambiguous_teams' : 'miss',
    ...(exact ? { exactMatch: { id: exact.id, home: exact.home, away: exact.away } } : {}),
    teamCandidates,
  };
}

export async function fetchGoalServeMatchOddsAll(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}

export async function fetchGoalServeMatchOddsLive(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}

export async function fetchGoalServeMatchOddsPreMatch(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}

// ---- Live ball/event position (soccer "commentaries" / play-by-play feed) ----
//
// CONFIRMED (official Soccer Data Feed PDF, "LIVE GAME LINEUPS/STATS FEED (COMMENTARIES)"
// section) — SOCCER ONLY. No equivalent x/y coordinate data exists anywhere in the Hockey/
// Basketball/Tennis/Baseball PDFs (basketball's own "point-by-point" feed is just a running score
// log — home_score/away_score/team_scored, no coordinates).
//
// Each individual match event (shot, goal, corner, card, foul, substitution, etc.) optionally
// carries `x`/`y` — normalized 0..1 float PITCH coordinates of WHERE that event happened. This is
// NOT a continuously-updating ball tracker (no fixed-rate stream of ball positions); it's one
// coordinate per discrete play, refreshed at the feed's own cadence (documented "refresh time
// every 30 seconds"), same as the rest of this section's live stats.
//
// `/commentaries/1.xml?json=1` — the literal id "1" is documented as "all today matches" across
// every league in one call, which is what a live-events poller needs (as opposed to
// "/commentaries/{leagueId}.xml", which is scoped to one specific league).
//
// ??? The exact XML nesting of the per-match play-by-play `<comment>` list (its parent wrapper
// tag) isn't shown in the PDF's sample — only the fields on a single `<comment>` element are
// documented. Every plausible wrapper name is checked below, the same defensive style used
// elsewhere in this file for genuinely undocumented shapes.
const COMMENTARIES_URL = BASE_URL;

export interface GoalServeMatchEvent {
  matchId: string;
  type: string;
  minute: string;
  team: 'home' | 'away' | '';
  isGoal: boolean;
  important: boolean;
  player1: string;
  player2: string;
  x: number | null;
  y: number | null;
  timestamp: string;
  comment: string;
}

function toBool(v: any): boolean {
  return v === 'True' || v === true || v === 'true';
}

function toCoord(v: any): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCommentaryEvent(matchId: string, c: any): GoalServeMatchEvent | null {
  if (!c) return null;
  const type = str(c?.type);
  if (!type) return null;
  const teamRaw = str(c?.team).toLowerCase();
  return {
    matchId,
    type,
    minute: str(c?.minute),
    team: teamRaw === 'localteam' ? 'home' : teamRaw === 'visitorteam' ? 'away' : '',
    isGoal: toBool(c?.isgoal),
    important: toBool(c?.important),
    player1: str(c?.pl_name1),
    player2: str(c?.pl_name2),
    x: toCoord(c?.x),
    y: toCoord(c?.y ?? c?.Y),
    timestamp: str(c?.timestamp ?? c?.Timestamp),
    comment: str(c?.comment),
  };
}

/** Extracts every match's play-by-play list from a commentaries payload, checking each plausible
 *  wrapper shape (see the ??? note above) before falling back to no events for that match.
 *
 *  Returns BOTH id fields the PDF documents on a commentaries `<match>` — `id` and `static_id` —
 *  rather than picking one. The PDF calls `static_id` the correct cross-feed mapping key and `id`
 *  "[obsolete]", but this app's own soccer NormalizedEvent id (built in normalizeMatch() above,
 *  from the *livescore* feed) is `m?.id`, and the soccer PDF's own livescore sample shows `id` and
 *  `static_id` as genuinely different numbers on the same match — so matching commentaries back to
 *  a live event by only one of the two risks silently matching nothing. This is a best-effort
 *  overlay (a "last play" position marker, nothing settlement-related), so returning both keys to
 *  maximize the match hit rate costs nothing if one turns out to be redundant. */
function extractCommentaryMatches(payload: any): Array<{ matchIds: string[]; events: GoalServeMatchEvent[] }> {
  const tournaments = Array.isArray(payload?.commentaries?.tournament)
    ? payload.commentaries.tournament
    : payload?.commentaries?.tournament
      ? [payload.commentaries.tournament]
      : [];
  const out: Array<{ matchIds: string[]; events: GoalServeMatchEvent[] }> = [];
  for (const t of tournaments) {
    const matches = Array.isArray(t?.match) ? t.match : t?.match ? [t.match] : [];
    for (const m of matches) {
      const id = str(m?.id);
      const staticId = str(m?.static_id);
      const matchIds = Array.from(new Set([id, staticId].filter(Boolean)));
      if (!matchIds.length) continue;
      const primaryId = staticId || id;
      const rawList =
        m?.comment ?? m?.commentary?.comment ?? m?.comments?.comment ?? m?.playbyplay?.comment ?? m?.commentaries?.comment ?? null;
      const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
      const events = list.map((c: any) => parseCommentaryEvent(primaryId, c)).filter((e): e is GoalServeMatchEvent => !!e);
      if (events.length) out.push({ matchIds, events });
    }
  }
  return out;
}

/** Fetches today's soccer commentaries feed and returns, per match, only the most recent event
 *  that carries a pitch position (x/y) — the only piece this app currently has a use for (a live
 *  "last play" marker). Keyed by both `id` and `static_id` (see extractCommentaryMatches) so a
 *  caller can look up by whichever id its own event object carries. Best-effort: never throws, an
 *  empty/unparseable payload just yields no positions rather than breaking the live snapshot that
 *  calls this alongside it. */
export async function fetchGoalServeBallPositions(apiKey: string): Promise<Map<string, GoalServeMatchEvent>> {
  const out = new Map<string, GoalServeMatchEvent>();
  if (!apiKeyOk(apiKey)) return out;
  const url = `${COMMENTARIES_URL}/${encodeURIComponent(apiKey)}/commentaries/1.xml?json=1`;
  const json = await fetchJson(url, 12000).catch(() => null);
  if (!json) return out;
  for (const { matchIds, events } of extractCommentaryMatches(json)) {
    const positioned = events.filter((e) => e.x != null && e.y != null);
    if (!positioned.length) continue;
    // Events are documented in chronological play order — the last positioned one is the latest.
    const latest = positioned[positioned.length - 1];
    for (const id of matchIds) out.set(id, latest);
  }
  return out;
}

// ---- Pregame Odds Settlements (per-odd authoritative result) ----
//
// CONFIRMED (general GoalServe reference doc — not any per-sport PDF, this endpoint isn't
// mentioned in any of the 5 sport-specific PDFs at all): a dedicated host/API, entirely separate
// from getfeed/getodds above — no auth-in-path, `k=` query param instead, and its own numeric
// sportId scheme (soccer=4, basketball=7, tennis=5 — hockey/baseball aren't documented at all;
// GOALSERVE_SPORT_IDS below only maps what's confirmed, and callers for an unmapped sport get
// `null` back immediately rather than a guessed id that could return someone else's match).
//
// This is the only thing in this app that can auto-settle a bet on anything other than h2h — see
// server/lib/settlementEngine.ts's module docstring. It answers ONE specific odd's real-money
// result (Win/Loose/Half win/Half loose/Stake refund), sparing this app from re-implementing
// totals/handicap settlement math (and its edge cases: pushes, half-win asian handicap lines).
//
// ??? no JSON response sample was given anywhere, only the bare XML tag `<result>Win</result>` —
// every plausible JSON root shape is checked below. If none match, the lookup just returns null
// (leg stays 'pending' for manual review) — this never fabricates a result from a shape it isn't
// sure of.
const SETTLEMENTS_BASE_URL = 'http://oddsfeed.goalserve.com/api/v1/odds/pre-game';

const GOALSERVE_SPORT_IDS: Record<string, number> = {
  soccer: 4,
  football: 4,
  futebol: 4,
  basketball: 7,
  basket: 7,
  basquete: 7,
  tennis: 5,
  'tênis': 5,
};

function goalServeSportId(sport: string): number | null {
  const id = GOALSERVE_SPORT_IDS[String(sport || '').toLowerCase().trim()];
  return id ?? null;
}

export type GoalServeSettlementOutcome = 'won' | 'lost' | 'half_won' | 'half_lost' | 'void';

/** CONFIRMED (general reference doc) possible <result> values: Loose, Win, Stake refund, Half
 *  win, Half loose. Mapped to this app's own vocabulary; anything unrecognized returns null
 *  rather than being guessed into one of these. */
function mapSettlementResult(raw: string): GoalServeSettlementOutcome | null {
  const s = str(raw).toLowerCase().trim();
  if (s === 'win') return 'won';
  if (s === 'loose' || s === 'lose' || s === 'loss') return 'lost';
  if (s === 'half win' || s === 'half-win' || s === 'halfwin') return 'half_won';
  if (s === 'half loose' || s === 'half-loose' || s === 'halfloose' || s === 'half lose' || s === 'half loss') return 'half_lost';
  if (s === 'stake refund' || s === 'refund' || s === 'push' || s === 'void') return 'void';
  return null;
}

function extractSettlementResult(payload: any): string {
  return str(
    payload?.result ??
      payload?.results?.result ??
      payload?.settlement?.result ??
      payload?.settlements?.result ??
      payload?.response?.result ??
      payload,
  );
}

// "request limit - 1 request per second per sport" — same chained-rate-limit pattern already
// proven for the logo API (fetchTeamLogos) and reused here per sportId.
const settlementRateLimitChains = new Map<number, Promise<void>>();

/** Looks up GoalServe's own authoritative result for ONE specific odd on ONE match — the
 *  `market_id`/`goalserve_oddname` a bet leg carries only when it was placed on a selection that
 *  came straight from parseOddsMatch() above (never for markets synthesized by
 *  marketDerivation.ts, which GoalServe never priced and can't settle). Returns null for: an
 *  unmapped sport, a missing API key, a network/parse failure, or a `<result>` value this app
 *  doesn't recognize — every one of those cases is "we don't know", never "it lost"/"it won". */
export async function fetchGoalServeOddSettlement(
  apiKey: string,
  sport: string,
  gsId: string,
  marketId: number,
  oddname: string,
): Promise<GoalServeSettlementOutcome | null> {
  if (!apiKeyOk(apiKey)) return null;
  const sportId = goalServeSportId(sport);
  if (sportId == null) return null;
  const id = str(gsId).replace(/^goalserve_/, '');
  if (!id || !Number.isFinite(marketId) || marketId <= 0 || !oddname) return null;

  const chain = settlementRateLimitChains.get(sportId) || Promise.resolve();
  const run = async () => {
    const url =
      `${SETTLEMENTS_BASE_URL}/settlement?sportId=${sportId}&gsId=${encodeURIComponent(id)}` +
      `&marketId=${encodeURIComponent(String(marketId))}&oddname=${encodeURIComponent(oddname)}` +
      `&k=${encodeURIComponent(apiKey)}&json=1`;
    const json = await fetchJson(url, 8000);
    if (!json) return null;
    return mapSettlementResult(extractSettlementResult(json));
  };
  const p = chain.then(run).catch(() => null);
  settlementRateLimitChains.set(
    sportId,
    p.then(() => new Promise<void>((resolve) => setTimeout(resolve, 1050))),
  );
  return p;
}

// ── GoalServe "Inplay API" — a separate product/host from the getfeed/* endpoints above (own
// account entitlement, confirmed enabled). Per GoalServe's own Inplay reference doc: 8
// sport-specific feeds, refreshed every second, served as gzip-compressed JSON straight from
// inplay.goalserve.com — not the XML-converted-to-JSON-with-`@`-prefixes shape read everywhere
// else in this file. The URLs carry no API key/token at all; access is controlled purely by the
// whitelisted server IP, same posture as the casino aggregator's IP whitelist.
//
// This sandbox's own egress still blocks inplay.goalserve.com (same restriction the top-of-file
// comment notes for www.goalserve.com — a 403 "Host not in allowlist" from the sandbox's own
// outbound proxy, not a rejection from GoalServe), so none of this has been exercised against a
// live fetch. But the account owner supplied a real sample event object straight from GoalServe's
// own docs (soccer, 2 matches, full odds) — every field name below (`core.finished/removed/
// stopped`, `info.id/mid/period/minute/seconds/score`, `team_info.home/away`, `odds.<id>.
// participants.<id>.value_eu/handicap/suspend`) is read verbatim off that sample, not guessed —
// same discipline as stripAttrPrefix()'s fix above, just skipping the "guess wrong first" step.
// Still genuinely unconfirmed: every sport other than soccer (tennis in particular carries a
// `Serve` field, capitalized differently from the getfeed feed's lowercase `serve` — plausible
// but unverified without a tennis sample), and whether `info.mid` really is the pregame↔inplay
// match id correlator it looks like (GoalServe's own pregame feeds never expose an `mid` field
// under that exact name to cross-check against).
const INPLAY_HOST = 'http://inplay.goalserve.com';

function inplaySportSegment(sport: string): string | null {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'basket';
  if (s === 'tennis' || s === 'tênis') return 'tennis';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'american-football' || s === 'amfootball' || s === 'nfl') return 'amfootball';
  if (s === 'esports') return 'esports';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'baseball') return 'baseball';
  return null; // handball/rugby/cricket/etc. have no Inplay feed per GoalServe's own doc
}

export type InplayTimeStatus = { status: string; statusShort: string; isLive: number; elapsed: number };

/** GoalServe's Inplay `time_status` enum (own reference doc — 0 Not Started, 1 InPlay, 2 To Be
 *  Fixed, 3 Ended, 4 Postponed, 5 Cancelled, 6 Walkover, 7 Interrupted, 8 Abandoned, 9 Retired, 99
 *  Removed) mapped into this file's shared {status, statusShort, isLive, elapsed} shape (see
 *  parseStatus() above, which handles the getfeed/* word-based statuses instead of this numeric
 *  one). statusShort MUST be exactly 'FT' for a finished match — the Settlement Engine
 *  (server/routes/events.ts) matches on that exact string to decide a bet is resolvable, so Ended/
 *  Walkover/Retired (3/6/9 — all definitive results) map to it, the same way parseStatus() above
 *  already treats WO/Retired as FT-equivalent. `elapsed` for the live case (1) is left at 0 here —
 *  the real per-sport clock comes from the match's own fields once those are confirmed, not from
 *  time_status alone. */
export function parseInplayTimeStatus(timeStatus: number): InplayTimeStatus {
  const abbrev = (s: string) => s.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase();
  switch (timeStatus) {
    case 0: return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 };
    case 1: return { status: 'Live', statusShort: 'LIVE', isLive: 1, elapsed: 0 };
    case 2: return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 }; // "To Be Fixed" — date/time not confirmed yet
    case 3: return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: 90 }; // Ended
    case 4: return { status: 'Postponed', statusShort: abbrev('Postponed'), isLive: 0, elapsed: 0 };
    case 5: return { status: 'Cancelled', statusShort: abbrev('Cancelled'), isLive: 0, elapsed: 0 };
    case 6: return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: 90 }; // Walkover — definitive result
    case 7: return { status: 'Interrupted', statusShort: abbrev('Interrupted'), isLive: 0, elapsed: 0 };
    case 8: return { status: 'Abandoned', statusShort: abbrev('Abandoned'), isLive: 0, elapsed: 0 };
    case 9: return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: 90 }; // Retired — definitive result
    case 99: return { status: 'Removed', statusShort: abbrev('Removed'), isLive: 0, elapsed: 0 };
    default: return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 };
  }
}

/** Fetches and gunzips one sport's Inplay feed (odds refreshed every second). Returns the parsed
 *  JSON payload exactly as GoalServe sent it — shape not yet mapped into NormalizedEvent[], see
 *  the doc comment above this section — or null on any unsupported-sport/network/decompression/
 *  parse failure, logged the same way fetchJson() above does. */
export async function fetchInplayFeed(sport: string, timeoutMs = 8000, _attempt = 0): Promise<any | null> {
  const segment = inplaySportSegment(sport);
  if (!segment) return null;
  const url = `${INPLAY_HOST}/inplay-${segment}.gz`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { signal: controller.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = decodeBodyBuffer(buf, res.headers.get('content-encoding'));
    if (!res.ok) {
      console.error('[goalserve-inplay] HTTP', res.status, url, bodyPreview(text));
      // Same rationale as fetchJson() above: a 403/429/5xx here can be one specific Railway
      // replica's un-whitelisted egress IP, not a real outage — retry a couple of times so a
      // different replica gets a chance to serve the request.
      if (RETRYABLE_STATUS.has(res.status) && _attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[_attempt]);
        return fetchInplayFeed(sport, timeoutMs, _attempt + 1);
      }
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error('[goalserve-inplay] non-JSON response after decode:', url, bodyPreview(text, 200));
      return null;
    }
  } catch (e) {
    console.error('[goalserve-inplay] fetch failed:', url, String((e as any)?.message || e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** CONFIRMED against GoalServe's own published Inplay API reference (documentation.goalserve.com):
 *  `core.finished`/`removed`/`stopped`/`blocked` are documented as numeric 1/0 flags (the real
 *  sample sends them as quoted "1"/"0" strings — isInplayTrue() below accepts both). `core.stopped`
 *  is explicitly "match time is stopped ... e.g. a referee stops the time while there is an injury
 *  on the pitch" — a routine, momentary, many-times-a-match occurrence, NOT a suspension. Treating
 *  it as isLive:0 (tried first, wrong) would flicker a match in and out of the live list on every
 *  injury break; it stays live here, just with the clock paused. `core.blocked` isn't documented
 *  beyond its name — since every sample showing blocked:1 also has every odds participant's own
 *  `suspend` flag set (the actual betting-availability signal parseInplayOdds() already respects),
 *  it's left out of status classification entirely rather than guessed at.
 *
 *  `info.period` uses numeric-ordinal wording ("1st Half", "2nd Half") — CONFIRMED different from
 *  parseStatus()'s getfeed/* vocabulary ("First Half"/"Second Half", spelled out). Delegating to
 *  parseStatus() here was tried and is wrong: it doesn't recognize "1st Half"/"2nd Half" as half
 *  markers at all, falls through to its bare-leading-digit branch, and reads the "2" off "2nd Half"
 *  as if it were a 2-minute-elapsed match — so status is classified straight off `info.period`/
 *  `info.minute` here instead, never through parseStatus(). statusShort stays exactly 'FT' when
 *  finished, matching the Settlement Engine's exact-string check. */
function parseInplayEventStatus(core: any, info: any): { status: string; statusShort: string; isLive: number; elapsed: number } {
  const minute = num(info?.minute);
  if (isInplayTrue(core?.removed)) return { status: 'Removed', statusShort: 'REMOVE', isLive: 0, elapsed: 0 };
  if (isInplayTrue(core?.finished)) return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: minute || 90 };

  const period = str(info?.period);
  if (isInplayTrue(core?.stopped)) {
    return { status: period || 'Pausa', statusShort: 'PAUSE', isLive: 1, elapsed: minute };
  }
  let statusShort = '';
  if (/^(1st|First)[\s-]*Half$/i.test(period)) statusShort = '1H';
  else if (/^(2nd|Second)[\s-]*Half$/i.test(period)) statusShort = '2H';
  else if (/^(HT|Half[\s-]?Time)$/i.test(period)) statusShort = 'HT';
  else if (/^(ET|Extra[\s-]?Time)$/i.test(period)) statusShort = 'ET';
  else if (/^(P|Penalties)$/i.test(period)) statusShort = 'PEN';
  else if (minute > 0) statusShort = minute <= 45 ? '1H' : '2H'; // regular-time fallback when period's wording isn't one of the above
  else statusShort = 'LIVE';

  // This feed, by definition, only carries matches GoalServe is actively tracking as in-play — a
  // bare/unrecognized `period` here still means live, never "not started".
  return { status: period || 'Live', statusShort, isLive: 1, elapsed: minute };
}

// This feed's own boolean convention is "1"/"0" (or ""/absent for false) — CONFIRMED against the
// real sample's `core.finished`/`removed`/`stopped` and `odds.*.suspend`/`participants.*.suspend`.
// Deliberately NOT toBool() above, which checks for "True"/true (the getfeed/* feeds' XML-derived
// convention) and would silently treat every one of these fields as always-false.
function isInplayTrue(v: any): boolean {
  return v === '1' || v === 1 || v === true || v === 'true';
}

/** Builds the same OddsResult shape parseOddsMatch() produces for the getfeed/* odds-comparison
 *  feed (`{home, draw, away, markets: {h2h: [...], other_key: [...]}}`) from this feed's own
 *  `odds: {<market_id>: {name, participants: {<id>: {name, value_eu, suspend, handicap}}}}` shape
 *  — CONFIRMED against the real sample (Home/Away Team Goals, 3-Way Handicap, Asian Handicap).
 *  Each participant is already self-contained (its own handicap value, no separate wrapper level
 *  like getfeed's <total>/<handicap> element), so no line-grouping is needed before folding the
 *  handicap into the display name. `is_main` (which of several handicap lines GoalServe considers
 *  the default) is read but not used to filter — every line is kept, same as parseOddsMatch(). */
function parseInplayOdds(rawOdds: any): OddsResult | null {
  const marketBlocks: any[] = rawOdds && typeof rawOdds === 'object' ? Object.values(rawOdds) : [];
  if (!marketBlocks.length) return null;

  const h2h: Array<{ label: string; value: string; odd: number; market_id?: number; goalserve_oddname?: string }> = [];
  const markets: Record<string, any[]> = {};

  for (const market of marketBlocks) {
    if (isInplayTrue(market?.suspend)) continue;
    const marketName = str(market?.name ?? market?.short_name);
    const label = marketName.toLowerCase();
    const isH2H = label === 'match winner' || label.includes('1x2') || label.includes('full time result') || label === 'winner' || label === 'home/draw/away';
    const marketId = Number(market?.id);
    const hasMarketId = Number.isFinite(marketId) && marketId > 0;

    const participants: any[] = market?.participants && typeof market.participants === 'object' ? Object.values(market.participants) : [];
    const odds: Array<{ rawName: string; name: string; value: number; settlementOddname: string }> = [];
    for (const p of participants) {
      if (isInplayTrue(p?.suspend)) continue;
      const pName = str(p?.name ?? p?.short_name);
      const value = num(p?.value_eu);
      if (!pName || value <= 1) continue;
      const handicap = str(p?.handicap);
      odds.push({
        rawName: pName,
        name: handicap ? `${pName} ${handicap}` : pName,
        value,
        settlementOddname: handicap ? `${pName}:${handicap}` : pName,
      });
    }
    if (!odds.length) continue;

    if (isH2H) {
      for (const o of odds) {
        const key = normalizeOutcomeKey(o.rawName);
        if (!key) continue;
        h2h.push({
          label: key === 'home' ? 'Home' : key === 'away' ? 'Away' : 'Draw',
          value: o.name,
          odd: o.value,
          ...(hasMarketId ? { market_id: marketId } : {}),
          goalserve_oddname: o.settlementOddname,
        });
      }
    } else {
      const marketKey = label.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
      markets[marketKey] = odds.map((o) => ({
        label: o.name,
        value: o.name,
        odd: o.value,
        ...(hasMarketId ? { market_id: marketId } : {}),
        goalserve_oddname: o.settlementOddname,
      }));
    }
  }

  if (h2h.length) markets.h2h = h2h;
  if (!Object.keys(markets).length) return null;

  const home = Math.max(0, ...h2h.filter((s) => s.label === 'Home').map((s) => s.odd), 0);
  const draw = Math.max(0, ...h2h.filter((s) => s.label === 'Draw').map((s) => s.odd), 0);
  const away = Math.max(0, ...h2h.filter((s) => s.label === 'Away').map((s) => s.odd), 0);
  return { home, draw, away, markets };
}

/** Converts one Inplay feed event object (`payload.events["<id>"]`) into the same NormalizedEvent
 *  shape normalizeMatch() produces for the getfeed/* feeds — CONFIRMED field-by-field against the
 *  real sample. Unlike the getfeed/* odds-comparison feed (fetched separately, on its own 10s
 *  rate limit), odds arrive bundled directly on the event here, so home_odd/draw_odd/away_odd/
 *  markets are populated in the same call — no second request needed for in-play odds.
 *  `info.mid` (a second id distinct from `info.id`) is kept on `fixture.goalserve_mid` in case it
 *  turns out to be the pregame↔inplay match id correlator it looks like — additive only, nothing
 *  existing reads it. */
function parseInplayEvent(sport: string, id: string, raw: any): NormalizedEvent | null {
  const core = raw?.core ?? {};
  const info = raw?.info ?? {};
  const homeInfo = raw?.team_info?.home ?? {};
  const awayInfo = raw?.team_info?.away ?? {};
  const homeName = str(homeInfo?.name ?? info?.name?.split?.(' vs ')?.[0]);
  const awayName = str(awayInfo?.name ?? info?.name?.split?.(' vs ')?.[1]);
  if (!homeName || !awayName) return null;

  const { status, statusShort, isLive, elapsed } = parseInplayEventStatus(core, info);

  // CONFIRMED against GoalServe's own published Inplay API reference: `start_date`/`start_time`/
  // `start_ts` are all documented "(GMT+1)" — treating them as UTC (the first version of this code
  // did, appending "Z" directly) is silently off by 1+ hours. `start_ts_utc` is the documented,
  // unambiguous UTC field and is preferred whenever present; the GMT+1 fields are only a best-effort
  // fallback (no DST/CEST handling — the docs don't clarify it) for the rare case it's missing.
  let eventDate = '';
  const startTsUtc = num(info?.start_ts_utc);
  if (startTsUtc > 0) {
    eventDate = new Date(startTsUtc * 1000).toISOString();
  } else {
    const startDate = str(info?.start_date); // "dd.MM.yyyy", GMT+1
    const startTime = str(info?.start_time); // "HH:mm", GMT+1
    const dm = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(startDate);
    if (dm) {
      const [, dd, mm, yyyy] = dm;
      const [hh, mi] = (startTime || '00:00').split(':').map((v) => Number(v) || 0);
      eventDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hh - 1, mi)).toISOString();
    } else {
      const startTs = num(info?.start_ts); // GMT+1
      if (startTs > 0) eventDate = new Date((startTs - 3600) * 1000).toISOString();
    }
  }

  // `|| null` would wrongly turn a genuine 0-0 scoreline into "no score" — 0 is falsy in JS —
  // so presence is checked explicitly instead, the same way teamScore() above does for the
  // getfeed/* feeds.
  const scoreParts = str(info?.score).split(':');
  const homeScoreRaw = homeInfo?.score ?? scoreParts[0];
  const awayScoreRaw = awayInfo?.score ?? scoreParts[1];
  const homeScore = homeScoreRaw != null && homeScoreRaw !== '' ? num(homeScoreRaw) : null;
  const awayScore = awayScoreRaw != null && awayScoreRaw !== '' ? num(awayScoreRaw) : null;

  const league = stripSponsorBrands(str(info?.league));
  const odds = parseInplayOdds(raw?.odds);

  return {
    external_event_id: `goalserve_${id}`,
    sport,
    league,
    home_team: homeName,
    away_team: awayName,
    team_match: `${homeName} vs ${awayName}`,
    event_date: eventDate,
    status,
    status_short: statusShort,
    status_long: status,
    is_live: isLive,
    home_odd: odds?.home ?? 0,
    draw_odd: odds?.draw ?? 0,
    away_odd: odds?.away ?? 0,
    elapsed,
    timer: str(info?.seconds || info?.minute || (elapsed || '')),
    score: JSON.stringify({ home: homeScore, away: awayScore }),
    markets: odds ? JSON.stringify(odds.markets) : '{}',
    country: '',
    home_team_logo: '',
    away_team_logo: '',
    fixture: { id, date: eventDate, status: { description: status }, goalserve_mid: str(info?.mid) || undefined },
    teams: { home: { id: '', name: homeName, logo: '' }, away: { id: '', name: awayName, logo: '' } },
    goals: { home: homeScore, away: awayScore },
  };
}

/** Fetches one sport's Inplay feed and returns every event on it as NormalizedEvent, odds already
 *  attached (see parseInplayEvent's doc comment). `payload.events` is a plain map keyed by event
 *  id — CONFIRMED against the real sample — not an array, so this reads Object.values(). Returns
 *  [] for an unsupported sport or any fetch/decompression/parse failure (already logged inside
 *  fetchInplayFeed). */
export async function fetchInplayEvents(sport: string): Promise<NormalizedEvent[]> {
  const payload = await fetchInplayFeed(sport);
  const events = payload?.events && typeof payload.events === 'object' ? payload.events : {};
  const out: NormalizedEvent[] = [];
  for (const [id, raw] of Object.entries(events)) {
    const n = parseInplayEvent(sport, id, raw);
    if (n) out.push(n);
  }
  return out;
}
