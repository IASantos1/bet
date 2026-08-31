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

async function fetchJson(url: string, timeoutMs = 12000, _retriedJsonParam = false): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const text = await res.text().catch(() => '');
    clearTimeout(t);
    if (!res.ok) {
      // Previously swallowed silently — a 401/403 (bad/unwhitelisted key), 404 (wrong URL
      // segment), or 5xx from GoalServe looked identical to "no matches today" with no log line
      // at all, which made a real outage or misconfiguration indistinguishable from an empty
      // schedule in production. Always log the status so that distinction is visible.
      console.error('[goalserve] HTTP', res.status, redactKey(url), text.slice(0, 300));
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
      console.error('[goalserve] non-JSON response (check ?json=1/?json=true and the feed path):', redactKey(url), text.slice(0, 200));
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

/** "Country: League" — CONFIRMED category.name format for soccer. */
function splitCategoryName(name: string): { country: string; league: string } {
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

  const categoryName = str(category?.name ?? category?.['@name']);
  const { country, league } = splitCategoryName(categoryName);

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
    score: JSON.stringify({ home: homeScore, away: awayScore }),
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

function extractLogoEntries(payload: any): Array<{ id: string; url: string }> {
  if (!payload) return [];
  const candidates = [payload?.teams, payload?.leagues, payload?.players, payload?.data, payload?.logos, payload?.results, payload];
  for (const c of candidates) {
    const arr = Array.isArray(c) ? c : Array.isArray(c?.team) ? c.team : Array.isArray(c?.league) ? c.league : null;
    if (!arr) continue;
    const out: Array<{ id: string; url: string }> = [];
    for (const item of arr) {
      const id = str(item?.id ?? item?.['@id'] ?? item?.team_id ?? item?.league_id);
      const url = str(item?.logo ?? item?.url ?? item?.image ?? item?.badge ?? item?.path ?? item?.['#text']);
      if (id && url) out.push({ id, url });
    }
    if (out.length) return out;
  }
  return [];
}

/** Batch-fetches team logos for every id not already cached, in one comma-separated request —
 *  naturally respects the 1 req/sec limit as long as callers don't fan out per-event requests.
 *  Never throws: a failed or unconfirmed-shape response just leaves those ids uncached, and
 *  callers fall back to no logo rather than losing the event data over it. */
async function fetchTeamLogos(apiKey: string, sport: string, teamIds: string[]): Promise<void> {
  const type = logosSportType(sport);
  const missing = Array.from(new Set(teamIds)).filter((id) => {
    const cached = logoCache.get(`${type}:${id}`);
    return !cached || Date.now() - cached.ts >= LOGO_CACHE_TTL_MS;
  });
  if (!missing.length || !apiKeyOk(apiKey)) return;

  const run = async () => {
    const url = `${LOGO_BASE_URL}/${type}/teams?k=${encodeURIComponent(apiKey)}&ids=${missing.map(encodeURIComponent).join(',')}`;
    const json = await fetchJson(url, 8000);
    for (const { id, url: logoUrl } of extractLogoEntries(json)) {
      logoCache.set(`${type}:${id}`, { ts: Date.now(), url: logoUrl });
    }
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
  return attachTeamLogos(apiKey, sport, flattenMatches(sport, json));
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
  return attachTeamLogos(apiKey, sport, flattenMatches(sport, json));
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
function extractOddsFromType(typeBlock: any): Array<{ name: string; value: number; settlementOddname: string }> {
  if (isStopped(typeBlock)) return [];
  const bookmakers = Array.isArray(typeBlock?.bookmaker) ? typeBlock.bookmaker : typeBlock?.bookmaker ? [typeBlock.bookmaker] : [];
  const out: Array<{ name: string; value: number; settlementOddname: string }> = [];
  for (const bm of bookmakers) {
    if (isStopped(bm)) continue;
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
          if (name && value > 1) out.push({ name: point ? `${name} ${point}` : name, value, settlementOddname: point ? `${name}:${point}` : name });
        }
      }
      continue;
    }
    const odds = Array.isArray(bm?.odd) ? bm.odd : bm?.odd ? [bm.odd] : [];
    for (const o of odds) {
      const name = str(o?.name);
      const value = num(o?.value);
      if (name && value > 1) out.push({ name, value, settlementOddname: name });
    }
  }
  return out;
}

function findMatchInOddsPayload(payload: any, matchId: string): any | null {
  const categories = extractCategories(payload);
  for (const cat of categories) {
    for (const group of extractMatchGroups(cat)) {
      for (const m of group.matches) {
        const id = str(m?.id ?? m?.['@id']);
        // GoalServe's match id here is its own (not prefixed) — matchId passed in may carry our
        // "goalserve_" prefix from normalizeMatch(), so compare both forms.
        if (id === matchId || `goalserve_${id}` === matchId || id === matchId.replace(/^goalserve_/, '')) return m;
      }
    }
  }
  return null;
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
    const odds = extractOddsFromType(t);
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

  const home = Math.max(0, ...h2h.filter((s) => s.label === 'Home').map((s) => s.odd), 0);
  const draw = Math.max(0, ...h2h.filter((s) => s.label === 'Draw').map((s) => s.odd), 0);
  const away = Math.max(0, ...h2h.filter((s) => s.label === 'Away').map((s) => s.odd), 0);
  if (!home && !away && !Object.keys(markets).length) return null;

  return { home, draw, away, markets };
}

// CONFIRMED (all 5 official Data Feed PDFs, PREGAME ODDS COMPARISON FEED section): "requests
// limit – 1 request every 10 seconds per sport" — this is a per-SPORT limit on the whole
// comparison feed (which returns every priced match for that sport in one payload), not a
// per-match limit. A caller asking for N different matches' odds in the same sport must reuse one
// fetch, not issue N requests — every exported fetchGoalServeMatchOdds*() below goes through this
// shared cache so that's true regardless of call pattern (e.g. server/ws/liveWs.ts polling odds
// for every live match in a sport on each snapshot cycle).
const ODDS_PAYLOAD_TTL_MS = 9_000;
const oddsPayloadCache = new Map<string, { ts: number; payload: any }>();
const oddsPayloadInflight = new Map<string, Promise<any | null>>();

async function fetchOddsPayload(apiKey: string, sport: string): Promise<any | null> {
  if (!apiKeyOk(apiKey)) return null;
  const cat = oddsCat(sport);
  const cached = oddsPayloadCache.get(cat);
  if (cached && Date.now() - cached.ts < ODDS_PAYLOAD_TTL_MS) return cached.payload;
  const inflight = oddsPayloadInflight.get(cat);
  if (inflight) return inflight;

  const url = `${ODDS_BASE_URL}/${encodeURIComponent(apiKey)}/getodds/soccer?cat=${cat}_10&json=1`;
  const p = fetchJson(url, 15000)
    .then((json) => {
      oddsPayloadCache.set(cat, { ts: Date.now(), payload: json });
      return json;
    })
    .finally(() => {
      oddsPayloadInflight.delete(cat);
    });
  oddsPayloadInflight.set(cat, p);
  return p;
}

/** GoalServe doesn't split "all / live / pre-match" odds into separate endpoints the way
 *  sportsApiPro does — the same comparison feed carries whatever matches are currently priced,
 *  live or upcoming. All three exported functions below share this one fetch+parse path; kept as
 *  three functions only to match events.ts's existing call sites without changing its logic. */
async function fetchGoalServeMatchOdds(
  apiKey: string,
  sport: string,
  matchId: string,
  _opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  const payload = await fetchOddsPayload(apiKey, sport);
  if (!payload) return null;
  const match = findMatchInOddsPayload(payload, matchId);
  return parseOddsMatch(match);
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
