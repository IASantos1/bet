// Links one of the site's live matches to its TheSports live tracker, through SportScore. SportScore
// lists the matches of a sport (by team names) and, in a match's detail, carries `tracker: { id, sport }`
// — and that id is exactly the topic the MQTT feed publishes on (v3/live/m1/<id>, see thesports.js).
// So: list the sport's matches, find the one whose two teams are the site match's teams, read its detail,
// and return the tracker id. The MATCHING here is pure (unit-tested); the SportScore reads live in
// sportscore.js. Nothing here reaches the network. No tracker found → null, never throws.

import { closeName } from './teamlogos.js';

// The site's sport key → SportScore's sport name.
export const SS_SPORT = { futebol: 'football', basquetebol: 'basketball', tenis: 'tennis', criquete: 'cricket' };

const teamName = (t) => (typeof t === 'string' ? t : t?.name || t?.short_name || t?.title || t?.slug || '');
const matchTeams = (m) => ({ home: teamName(m.home_team || m.home || m.homeTeam), away: teamName(m.away_team || m.away || m.awayTeam) });
const matchSlug = (m) => m.slug || m.match_slug || /\/match\/([^/?#]+)/.exec(m.url || '')?.[1] || '';
const isLive = (m) => m.status === 'live' || m?.status?.type === 'inprogress' || m?.status?.type === 'live';
const listOf = (data) => (Array.isArray(data) ? data : data?.matches || data?.data || data?.results || []);

// One loose team-name comparison, reusing the logo matcher's "every telling word corresponds" rule.
const sameClub = (a, b) => !!(a && b && closeName(a, [{ name: b, logo: 1 }]));

/** Whether a SportScore match `m` is the fixture home-vs-away (either side round). */
export function sameFixture(m, home, away) {
  const t = matchTeams(m);
  if (!t.home || !t.away || !home || !away) return false;
  return (sameClub(home, t.home) && sameClub(away, t.away)) || (sameClub(home, t.away) && sameClub(away, t.home));
}

/** From a matches-list answer, the fixture whose teams are home/away — a live one first. null when none. */
export function pickFixture(listData, home, away) {
  const cand = listOf(listData).filter((m) => sameFixture(m, home, away));
  if (!cand.length) return null;
  const m = cand.find(isLive) || cand[0];
  return { slug: matchSlug(m), live: isLive(m), teams: matchTeams(m) };
}

/** The tracker `{ id, sport }` carried by a match's detail, or null. Accepts a few shapes. */
export function trackerOf(detailData) {
  const d = detailData?.match || detailData?.data || detailData || {};
  const tr = d.tracker ?? detailData?.tracker ?? null;
  const id = tr == null ? null : typeof tr === 'string' ? tr : tr.id || tr.tracker_id || tr.external_id;
  if (!id || !/^[a-z0-9-]{6,40}$/i.test(String(id))) return null;
  return { id: String(id), sport: (tr && tr.sport) || null, profile: (tr && tr.profile) || null };
}

/** The TheSports 3D widget URL for a tracker (their own iframe), when we embed it instead of our court. */
export function trackerWidgetUrl(ssSport, uuid, profile) {
  if (!uuid) return null;
  const path = ssSport === 'cricket' ? 'cricket' : `3D/${ssSport}`; // tennis/basketball under /3D/, cricket not
  const q = profile ? `profile=${encodeURIComponent(profile)}&` : '';
  return `https://widgets.thesports01.com/en/${path}?${q}uuid=${encodeURIComponent(uuid)}`;
}

/** A SportScore-style slug from a name: no accents, lower case, non-alphanumerics → single hyphens. */
export const slugify = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The slug a "home vs away" match may have, in both orders (SportScore sometimes names it reversed). */
export function slugCandidates(home, away) {
  const h = slugify(home), a = slugify(away);
  return h && a ? [`${h}-vs-${a}`, `${a}-vs-${h}`] : [];
}

/**
 * Resolve a site match to its TheSports tracker, making the needed SportScore reads.
 * `sportscore` is the client from createSportScore. Returns
 *   { trackerId, sport, ssSport, slug, live, teams, via } or { found:false, reason }.
 *
 * It asks the match DETAIL directly by a guessed slug first — this works even when the match is not in
 * SportScore's (limited) live list — and only falls back to scanning that list by names.
 */
export async function resolveTracker(sportscore, { sport, home, away } = {}) {
  const ssSport = SS_SPORT[sport];
  if (!ssSport) return { found: false, reason: 'Desporto sem ligação à SportScore.' };
  if (!sportscore?.enabled) return { found: false, reason: 'SportScore desligado.' };
  if (!home || !away) return { found: false, reason: 'Indique as duas equipas.' };
  // 1) the match detail, straight from a guessed slug (bypasses the 50-match list).
  for (const slug of slugCandidates(home, away)) {
    const det = await sportscore.match(ssSport, slug);
    const tr = det?.ok ? trackerOf(det.data) : null;
    if (tr) return { found: true, trackerId: tr.id, trackerProfile: tr.profile || null, sport, ssSport, slug, live: null, teams: { home, away }, trackerSport: tr.sport, via: 'slug' };
  }
  // 2) fall back to the live list, matched by names.
  const list = await sportscore.matches(ssSport, 50);
  if (!list?.ok) return { found: false, reason: list?.error || 'A lista da SportScore não respondeu.' };
  const fx = pickFixture(list.data, home, away);
  if (!fx?.slug) return { found: false, reason: 'Não encontrei este jogo (nem pelo slug nem na lista da SportScore).' };
  const det = await sportscore.match(ssSport, fx.slug);
  if (!det?.ok) return { found: false, reason: det?.error || 'O detalhe do jogo não respondeu.', slug: fx.slug };
  const tr = trackerOf(det.data);
  if (!tr) return { found: false, reason: 'O jogo não traz tracker ao vivo (sem posição de bola).', slug: fx.slug, teams: fx.teams };
  return { found: true, trackerId: tr.id, trackerProfile: tr.profile || null, sport, ssSport, slug: fx.slug, live: fx.live, teams: fx.teams, trackerSport: tr.sport, via: 'list' };
}
