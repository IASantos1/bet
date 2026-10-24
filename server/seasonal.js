// Seasonal campaigns that come with the site, put in once (then they are ordinary banners and
// collections, changed or removed in the admin like any other): a collection of games opened only
// by its address, and a banner (a video for computers and one for phones) whose button opens it.
// The games are found by provider and name in the catalogue, so the campaign is set up when the
// catalogue answers (tried again at each lobby visit until then).

import fs from 'node:fs';
import path from 'node:path';
import { getSetting, setSetting } from './db.js';

export const SEASONAL = [
  {
    key: 'halloween-2026',
    // Raised when something below changes: the banner and collection already made get it.
    rev: 3,
    // Until 31 October at midnight (Lisbon is on winter time, UTC+0, from 25 October).
    endsAt: '2026-11-01T00:00:00.000Z',
    collection: {
      title: '🎃 Jogos de Halloween',
      // A row near the top of the lobby (with "Ver todos"), and the banner's button opens it.
      place: 'top',
      games: [
        { provider: /pragmatic/i, name: /^big bass halloween splash 1000$|^big bass halloween.*1000/i },
        { provider: /amusnet|egt/i, name: /^halloween$/i },
        { provider: /habanero/i, name: /^hot hot halloween$/i },
        { provider: /habanero/i, name: /^fruity halloween$/i },
      ],
    },
    banner: { d: 'halloween-d.mp4', m: 'halloween-m.mp4', mime: 'video/mp4', terms: 'Jogos de Halloween disponíveis até 31/10.' },
  },
];

// Destaques that come with the site: one game shown big between the rows ("Joga agora!"), each in its
// own dates, so the casino changes by itself (Halloween, then November, then Christmas). A game the
// catalogue does not have is looked for again later; a destaque whose end has passed is not made.
export const SEASONAL_SPOTLIGHTS = [
  { key: 'halloween-2026-bigbass', game: [{ provider: /pragmatic|reel ?kingdom/i, name: /^big bass halloween splash 1000$|^big bass halloween.*1000/i }],
    tagline: 'O pescador mais assustador voltou! 🎃🎣', endsAt: '2026-11-01T00:00:00.000Z' },
  { key: 'nov-2026-olympus', game: [{ provider: /pragmatic/i, name: /^gates of olympus super scatter$/i }],
    tagline: 'Zeus voltou com Super Scatters! ⚡', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z' },
  { key: 'natal-2026', game: [{ provider: /pragmatic|reel ?kingdom/i, name: /^big bass christmas bash$/i }, { provider: /pragmatic/i, name: /^sweet bonanza xmas$/i }],
    tagline: 'O Natal chegou ao casino! 🎄', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-27T00:00:00.000Z' },
];

/** The first game of the catalogue matching each rule, in the rules' order (each game once). */
export function pickGames(catalog, rules) {
  const ids = [];
  for (const r of rules) {
    const g = catalog.find((x) => r.provider.test(x.provider || '') && r.name.test(String(x.name || '').trim()) && !ids.includes(x.id));
    if (g) ids.push(g.id);
  }
  return ids;
}

export function createSeasonal(db, { banners, collections, spotlights = null, dir }) {
  let busy = null;
  /** Sets up the campaigns not done yet (the ones still running), given the catalogue's games. */
  async function ensure(loadGames, now = Date.now()) {
    if (busy) return busy;
    const running = SEASONAL.filter((c) => Date.parse(c.endsAt) > now);
    const file = (c, n) => `data:${c.banner.mime};base64,${fs.readFileSync(path.join(dir, n)).toString('base64')}`;
    // Made by an older version (true = the first): the same banner and collection get the changes.
    for (const c of running) {
      const done = getSetting(db, `casino.seasonal.${c.key}`, false);
      if (!done || Number(done === true ? 1 : done) >= (c.rev || 1)) continue;
      try {
        for (const b of banners.all().filter((x) => x.terms === c.banner.terms && /^#\/casino\/colecao\//.test(x.link))) {
          banners.setImage(b.id, 'd', file(c, c.banner.d));
          banners.setImage(b.id, 'm', file(c, c.banner.m));
          collections.setPlace(b.link.split('/').pop(), c.collection.place);
        }
        setSetting(db, `casino.seasonal.${c.key}`, c.rev || 1);
      } catch (err) { console.error(`banners sazonais: ${err.message}`); }
    }
    const todo = running.filter((c) => !getSetting(db, `casino.seasonal.${c.key}`, false));
    const spots = spotlights ? SEASONAL_SPOTLIGHTS.filter((x) => Date.parse(x.endsAt) > now && !getSetting(db, `casino.spotlight.${x.key}`, false)) : [];
    if (!todo.length && !spots.length) return null;
    busy = (async () => {
      const catalog = (await loadGames())?.games || [];
      for (const x of spots) {
        const [gameId] = pickGames(catalog, x.game);
        if (!gameId) continue; // not in the catalogue (yet): looked for again later
        spotlights.save({ gameId, tagline: x.tagline, cta: 'Joga agora!', after: 'novos', startsAt: x.startsAt, endsAt: x.endsAt });
        setSetting(db, `casino.spotlight.${x.key}`, true);
      }
      for (const c of todo) {
        const games = pickGames(catalog, c.collection.games);
        if (!games.length) continue; // the catalogue has none of them (yet): tried again later
        const col = collections.save({ title: c.collection.title, games, place: c.collection.place, endsAt: c.endsAt });
        banners.save({
          title: '', subtitle: '', cta: '', link: `#/casino/colecao/${col.id}`, terms: c.banner.terms, audience: 'all',
          endsAt: c.endsAt, imageD: file(c, c.banner.d), imageM: file(c, c.banner.m),
        });
        // First in the carousel.
        banners.reorder([banners.all().at(-1).id, ...banners.all().slice(0, -1).map((b) => b.id)]);
        setSetting(db, `casino.seasonal.${c.key}`, c.rev || 1);
      }
    })().catch((err) => console.error(`campanhas do casino: ${err.message}`)).finally(() => { busy = null; });
    return busy;
  }
  return { ensure };
}
