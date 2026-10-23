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
    // Until 31 October at midnight (Lisbon is on winter time, UTC+0, from 25 October).
    endsAt: '2026-11-01T00:00:00.000Z',
    collection: {
      title: '🎃 Jogos de Halloween',
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

/** The first game of the catalogue matching each rule, in the rules' order (each game once). */
export function pickGames(catalog, rules) {
  const ids = [];
  for (const r of rules) {
    const g = catalog.find((x) => r.provider.test(x.provider || '') && r.name.test(String(x.name || '').trim()) && !ids.includes(x.id));
    if (g) ids.push(g.id);
  }
  return ids;
}

export function createSeasonal(db, { banners, collections, dir }) {
  let busy = null;
  /** Sets up the campaigns not done yet (the ones still running), given the catalogue's games. */
  async function ensure(loadGames, now = Date.now()) {
    if (busy) return busy;
    const todo = SEASONAL.filter((c) => !getSetting(db, `casino.seasonal.${c.key}`, false) && Date.parse(c.endsAt) > now);
    if (!todo.length) return null;
    busy = (async () => {
      const catalog = (await loadGames())?.games || [];
      for (const c of todo) {
        const games = pickGames(catalog, c.collection.games);
        if (!games.length) continue; // the catalogue has none of them (yet): tried again later
        const file = (n) => fs.readFileSync(path.join(dir, n)).toString('base64');
        const col = collections.save({ title: c.collection.title, games, place: 'link', endsAt: c.endsAt });
        banners.save({
          title: '', subtitle: '', cta: '', link: `#/casino/colecao/${col.id}`, terms: c.banner.terms, audience: 'all',
          endsAt: c.endsAt, imageD: `data:${c.banner.mime};base64,${file(c.banner.d)}`, imageM: `data:${c.banner.mime};base64,${file(c.banner.m)}`,
        });
        // First in the carousel.
        banners.reorder([banners.all().at(-1).id, ...banners.all().slice(0, -1).map((b) => b.id)]);
        setSetting(db, `casino.seasonal.${c.key}`, true);
      }
    })().catch((err) => console.error(`campanhas do casino: ${err.message}`)).finally(() => { busy = null; });
    return busy;
  }
  return { ensure };
}
