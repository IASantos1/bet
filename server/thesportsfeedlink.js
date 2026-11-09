// Link a site match to its TheSports feed game WITHOUT SportScore: the live feed itself carries, per
// game (its uuid), the decoded lineup names (and the ball). So we find the feed game whose names are
// this fixture's two sides and use that uuid. For tennis the "sides" are the two players, which the
// lineup lists directly, so the link is exact; where the feed does not carry the side names (some team
// sports only list players), no game matches and the court falls back to showing nothing until linked.
// Pure matching, reusing the logo/name matcher. Nothing here reaches the network.

import { closeName } from './teamlogos.js';

const sameName = (a, b) => !!(a && b && closeName(a, [{ name: b, logo: 1 }]));
const hasName = (names, who) => (names || []).some((n) => sameName(who, n));

/**
 * The feed game whose lineup names are the fixture's `home` and `away` (either order). Prefers a game
 * that currently has a ball, then the most recently updated. Returns { id, score, players, hasBall,
 * count } or null.
 */
export function matchFeedGame(games, home, away) {
  if (!home || !away) return null;
  const hits = (games || []).filter((g) => {
    const ns = g.players || [];
    return ns.length >= 2 && hasName(ns, home) && hasName(ns, away);
  });
  if (!hits.length) return null;
  hits.sort((a, b) => (b.ball ? 1 : 0) - (a.ball ? 1 : 0) || String(b.lastAt).localeCompare(String(a.lastAt)));
  const best = hits[0];
  return { id: best.id, score: best.score || null, players: best.players || [], hasBall: !!best.ball, count: hits.length };
}
