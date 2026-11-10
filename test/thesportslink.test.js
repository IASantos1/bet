import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SS_SPORT, sameFixture, pickFixture, trackerOf, resolveTracker, slugify, slugCandidates, trackerWidgetUrl } from '../server/thesportslink.js';

// A matches-list answer shaped like SportScore's (teams as objects, status, url with the slug).
const cricketList = {
  matches: [
    { url: '/cricket/match/india-vs-england/', home_team: { name: 'India' }, away_team: { name: 'England' }, status: 'finished' },
    { url: '/cricket/match/pakistan-vs-sri-lanka/', home_team: { name: 'Pakistan' }, away_team: { name: 'Sri Lanka' }, status: 'live' },
  ],
};

test('TheSports link: site sport maps to SportScore sport', () => {
  assert.equal(SS_SPORT.tenis, 'tennis');
  assert.equal(SS_SPORT.basquetebol, 'basketball');
  assert.equal(SS_SPORT.criquete, 'cricket');
  assert.equal(SS_SPORT.futebol, 'football');
});

test('TheSports link: sameFixture matches both teams, either way round, loosely', () => {
  const m = { home_team: { name: 'Pakistan' }, away_team: { name: 'Sri Lanka' } };
  assert.ok(sameFixture(m, 'Pakistan', 'Sri Lanka'));
  assert.ok(sameFixture(m, 'Sri Lanka', 'Pakistan')); // home/away swapped
  assert.ok(!sameFixture(m, 'Pakistan', 'India'));
  assert.ok(!sameFixture({ home_team: { name: 'Pakistan' } }, 'Pakistan', 'Sri Lanka')); // missing a team
});

test('TheSports link: pickFixture finds the right slug and prefers the live game', () => {
  const fx = pickFixture(cricketList, 'Pakistan', 'Sri Lanka');
  assert.equal(fx.slug, 'pakistan-vs-sri-lanka');
  assert.equal(fx.live, true);
  assert.equal(pickFixture(cricketList, 'Brazil', 'Argentina'), null);
});

test('TheSports link: slug building (accents, spaces, both orders)', () => {
  assert.equal(slugify('Aryna Sabalenka'), 'aryna-sabalenka');
  assert.equal(slugify('Tseng Chun-hsin'), 'tseng-chun-hsin');
  assert.equal(slugify('S D Prajwal Dev'), 's-d-prajwal-dev');
  assert.deepEqual(slugCandidates('Aryna Sabalenka', 'Karolina Muchova'),
    ['aryna-sabalenka-vs-karolina-muchova', 'karolina-muchova-vs-aryna-sabalenka']);
  assert.deepEqual(slugCandidates('', 'B'), []);
});

test('TheSports link: trackerWidgetUrl builds the iframe URL (tennis under /3D/, cricket not)', () => {
  assert.equal(trackerWidgetUrl('tennis', 'n54ql4fw1p1lrvy', 'vzrxjfyp7u6uymd'),
    'https://widgets.thesports01.com/en/3D/tennis?profile=vzrxjfyp7u6uymd&uuid=n54ql4fw1p1lrvy');
  assert.equal(trackerWidgetUrl('cricket', 'zp5rzpcdx6n4q82', '47q3ktv6gh1u8mx'),
    'https://widgets.thesports01.com/en/cricket?profile=47q3ktv6gh1u8mx&uuid=zp5rzpcdx6n4q82');
  assert.equal(trackerWidgetUrl('basketball', 'abc123', null),
    'https://widgets.thesports01.com/en/3D/basketball?uuid=abc123');
  assert.equal(trackerWidgetUrl('tennis', '', 'x'), null);
});

test('TheSports link: trackerOf reads tracker.id from the match detail', () => {
  assert.deepEqual(trackerOf({ tracker: { id: 'zp5rzpcdx6n4q82', profile: 'cricket', sport: 'cricket' } }),
    { id: 'zp5rzpcdx6n4q82', sport: 'cricket', profile: 'cricket' });
  assert.deepEqual(trackerOf({ match: { tracker: { id: 'y0or5ofw6p5vmwz' } } }),
    { id: 'y0or5ofw6p5vmwz', sport: null, profile: null });
  assert.equal(trackerOf({}), null); // no tracker
  assert.equal(trackerOf({ tracker: { id: 'no spaces allowed!' } }), null); // invalid id
});

test('TheSports link: resolveTracker walks list → detail → tracker id', async () => {
  const sportscore = {
    enabled: true,
    matches: async (sport) => (sport === 'cricket' ? { ok: true, data: cricketList } : { ok: false }),
    match: async (_sport, slug) => (slug === 'pakistan-vs-sri-lanka'
      ? { ok: true, data: { tracker: { id: 'zp5rzpcdx6n4q82', sport: 'cricket' } } }
      : { ok: false, error: 'não encontrado' }),
  };
  const r = await resolveTracker(sportscore, { sport: 'criquete', home: 'Pakistan', away: 'Sri Lanka' });
  assert.equal(r.found, true);
  assert.equal(r.trackerId, 'zp5rzpcdx6n4q82');
  assert.equal(r.ssSport, 'cricket');
  assert.equal(r.slug, 'pakistan-vs-sri-lanka');
  assert.equal(r.via, 'slug'); // found straight from the guessed slug, no need for the list
});

test('TheSports link: resolveTracker guesses the slug even for a match not in the list', async () => {
  // The list has only other games; the detail answers by slug (either name order).
  const sportscore = {
    enabled: true,
    matches: async () => ({ ok: true, data: { matches: [{ url: '/tennis/match/a-vs-b/', home_team: { name: 'A' }, away_team: { name: 'B' }, status: 'live' }] } }),
    match: async (_s, slug) => (slug === 'karolina-muchova-vs-aryna-sabalenka'
      ? { ok: true, data: { tracker: { id: 'trkwta123', sport: 'tennis' } } } : { ok: false }),
  };
  const r = await resolveTracker(sportscore, { sport: 'tenis', home: 'Aryna Sabalenka', away: 'Karolina Muchova' });
  assert.equal(r.found, true);
  assert.equal(r.trackerId, 'trkwta123'); // matched the reversed-order slug
  assert.equal(r.via, 'slug');
});

test('TheSports link: resolveTracker reports why it found nothing', async () => {
  const sportscore = { enabled: true, matches: async () => ({ ok: true, data: cricketList }), match: async () => ({ ok: true, data: {} }) };
  assert.equal((await resolveTracker(sportscore, { sport: 'voleibol', home: 'A', away: 'B' })).found, false); // unmapped sport
  assert.equal((await resolveTracker({ enabled: false }, { sport: 'criquete', home: 'A', away: 'B' })).found, false); // off
  assert.equal((await resolveTracker(sportscore, { sport: 'criquete', home: 'Nobody', away: 'Nowhere' })).found, false); // not in list
  const noTracker = await resolveTracker(sportscore, { sport: 'criquete', home: 'Pakistan', away: 'Sri Lanka' });
  assert.equal(noTracker.found, false); // fixture found but detail has no tracker
  assert.match(noTracker.reason, /tracker/i);
});
