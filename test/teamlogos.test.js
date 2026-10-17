import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { createTeamLogos, nameVariants, sameTeam, teamKey } from '../server/teamlogos.js';

test('team names: loose key and other spellings to try', () => {
  assert.equal(teamKey('futebol', 'Atlético  Madrid'), 'futebol|atletico madrid');
  assert.deepEqual(nameVariants('1. Koln'), ['1. Koln', 'Koln']);
  assert.deepEqual(nameVariants('FC Porto'), ['FC Porto', 'Porto']);
  assert.deepEqual(nameVariants('Benfica'), ['Benfica']);
});

test('a result is only taken when it is the same team', () => {
  assert.ok(sameTeam({ strTeam: 'FC Porto' }, 'Porto'));
  assert.ok(sameTeam({ strTeam: 'Atlético Madrid' }, 'Atletico  Madrid'));
  assert.ok(sameTeam({ strTeam: 'Manchester United', strTeamAlternate: 'Man United, Man Utd' }, 'Man Utd'));
  assert.ok(!sameTeam({ strTeam: 'Nacional', strTeamAlternate: 'Club Nacional de Football' }, 'Nacional Madeira'));
  assert.ok(!sameTeam({ strTeam: 'Somewhere United' }, 'Nowhere United'));
});

test('entries from the older lax lookup are looked up again', async () => {
  const db = openDb(':memory:');
  db.exec(`CREATE TABLE team_logos (team_key TEXT PRIMARY KEY, logo TEXT, colors TEXT, checked_at TEXT NOT NULL)`);
  db.prepare("INSERT INTO team_logos VALUES ('futebol|benfica', 'https://x/old.png', '[\"#00ff00\"]', ?)").run(nowIso());
  db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol', 'L', 'Benfica', 'Porto', ?, 'scheduled', 'winhouse', ?, ?)`).run(new Date(Date.now() + 3_600_000).toISOString(), nowIso(), nowIso());
  const fetchImpl = async (url) => {
    const t = new URL(url).searchParams.get('t');
    const teams = t === 'Benfica' ? [{ strTeam: 'Benfica', strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/slb.png', strColour1: '#E20E0E', strColour2: '#FFFFFF' }] : null;
    return { ok: true, status: 200, json: async () => ({ teams }) };
  };
  const logos = createTeamLogos(db, { fetchImpl });
  assert.equal(logos.get('futebol', 'Benfica').logo, 'https://x/old.png');
  await logos.run();
  assert.deepEqual(logos.get('futebol', 'Benfica').colors, ['#e20e0e', '#ffffff']);
  assert.equal(logos.get('futebol', 'Benfica').logo, 'https://r2.thesportsdb.com/slb.png');
});

test('badges looked up by name for teams the feed sends without one; misses kept a month', async () => {
  const db = openDb(':memory:');
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const ins = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, home_team_ext, away_team_ext, created_at, updated_at)
    VALUES (?, 'L', ?, ?, ?, 'scheduled', 'winhouse', ?, NULL, ?, ?)`);
  ins.run('futebol', 'Eintracht Frankfurt', '1. Koln', soon, null, nowIso(), nowIso());
  ins.run('futebol', 'Porto', 'Nowhere United', soon, 'https://cdn.sportapi.net/a.png', nowIso(), nowIso());
  const asked = [];
  const fetchImpl = async (url) => {
    const t = decodeURIComponent(new URL(url).searchParams.get('t'));
    asked.push(t);
    const teams = {
      'Eintracht Frankfurt': [{ strTeam: 'Eintracht Frankfurt', strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/ef.png', strColour1: '#E1000F', strColour2: '#000000', strEquipment: 'https://r2.thesportsdb.com/images/media/team/equipment/ef.png' }],
      Koln: [{ strTeam: 'Koln', strSport: 'Basketball', strBadge: 'https://x/b.png' }, { strTeam: 'Wrong Koln Town', strSport: 'Soccer', strBadge: 'https://x/w.png', strColour1: '#00ff00' },
        { strTeam: '1. FC Köln', strTeamAlternate: 'Cologne, FC Koln', strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/k.png', strColour1: 'fff' }],
      'Nowhere United': [{ strTeam: 'Somewhere United', strSport: 'Soccer', strBadge: 'https://x/s.png', strColour1: '#ff0000' }],
    }[t] || null;
    return { ok: true, status: 200, json: async () => ({ teams }) };
  };
  const logos = createTeamLogos(db, { fetchImpl });
  assert.equal(logos.get('futebol', 'Eintracht Frankfurt'), null);
  const r = await logos.run();
  assert.deepEqual(r, { asked: 4, found: 2 });
  assert.equal(asked.at(-1), 'Porto'); // Porto has the feed's badge: looked up last (a spare)
  assert.deepEqual(logos.get('futebol', 'Eintracht Frankfurt'), { logo: 'https://r2.thesportsdb.com/images/media/team/badge/ef.png', colors: ['#e1000f', '#000000'], kit: 'https://r2.thesportsdb.com/images/media/team/equipment/ef.png', ver: 2, apif: false, alt: [], checkedAt: logos.get('futebol', 'Eintracht Frankfurt').checkedAt });
  assert.equal(logos.get('futebol', '1. Koln').logo, 'https://r2.thesportsdb.com/k.png'); // second spelling, football one
  assert.deepEqual(logos.get('futebol', '1. Koln').colors, ['#ffffff']);
  assert.equal(logos.get('futebol', 'Nowhere United').logo, null); // another club's name: not taken
  assert.equal(logos.get('futebol', 'Nowhere United').colors, null);
  // Kept across restarts; a miss is not asked again for a month.
  const again = createTeamLogos(db, { fetchImpl });
  assert.equal(again.get('futebol', '1. Koln').logo, 'https://r2.thesportsdb.com/k.png');
  assert.deepEqual(await again.run(), { asked: 0, found: 0 });
  // Rate-limited: stops for this run without marking anyone.
  db.prepare("DELETE FROM team_logos WHERE team_key LIKE '%nowhere%'").run();
  const limited = createTeamLogos(db, { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.deepEqual(await limited.run(), { asked: 0, found: 0 });
  assert.equal(limited.get('futebol', 'Nowhere United'), null);
});

test('API-Football badges when its key is set, within the daily allowance; TheSportsDB still gives the kit colours', async () => {
  const db = openDb(':memory:');
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const ins = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES (?, 'L', ?, ?, ?, 'scheduled', 'winhouse', ?, ?)`);
  ins.run('futebol', 'Benfica', 'Sporting CP', soon, nowIso(), nowIso());
  ins.run('futebol', 'Braga', 'Arouca', soon, nowIso(), nowIso());
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    if (u.hostname === 'media.api-sports.io') {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
    }
    if (u.hostname.endsWith('api-sports.io')) {
      calls.push([u.hostname, u.searchParams.get('search'), opts.headers]);
      const q = u.searchParams.get('search');
      const response = q === 'Benfica' ? [{ team: { name: 'Benfica B', logo: 'https://media.api-sports.io/football/teams/1.png' } },
        { team: { name: 'Benfica', code: 'BEN', logo: 'https://media.api-sports.io/football/teams/211.png' } }] : [];
      return { ok: true, status: 200, json: async () => ({ errors: [], response }) };
    }
    const t = u.searchParams.get('t');
    const teams = t === 'Benfica' ? [{ strTeam: 'Benfica', strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/slb.png', strColour1: '#E20E0E' }] : null;
    return { ok: true, status: 200, json: async () => ({ teams }) };
  };
  const logos = createTeamLogos(db, { fetchImpl, apiFootballKey: 'k', apiFootballDaily: 3, leaguePacks: {} });
  await logos.run();
  // Not "Benfica B"; the badge is kept here and served from /team-logo/<id>.
  const kept = logos.get('futebol', 'Benfica').logo;
  assert.match(kept, /^\/team-logo\/[0-9a-f]{20}$/);
  assert.deepEqual([...logos.file(kept.split('/').pop()).body], [137, 80, 78, 71]);
  assert.equal(logos.file('../x'), null);
  assert.deepEqual(logos.get('futebol', 'Benfica').colors, ['#e20e0e']);
  assert.equal(calls[0][0], 'v3.football.api-sports.io');
  assert.deepEqual(calls[0][2], { 'x-apisports-key': 'k' }); // only the key header
  assert.equal(logos.apiFootballUsed('futebol'), 3); // Benfica, Sporting CP, Braga: allowance spent
  assert.equal(logos.get('futebol', 'Arouca').apif, false); // left for tomorrow
  // Out of requests for the day (the API says so): stops asking today.
  const db2 = openDb(':memory:');
  db2.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol', 'L', 'Porto', 'Gil Vicente', ?, 'scheduled', 'winhouse', ?, ?)`).run(soon, nowIso(), nowIso());
  let apiCalls = 0;
  const limited = createTeamLogos(db2, { apiFootballKey: 'k', leaguePacks: {}, fetchImpl: async (url) => {
    if (url.includes('api-sports.io')) { apiCalls += 1; return { ok: true, status: 200, json: async () => ({ errors: { requests: 'You have reached the request limit for the day' }, response: [] }) }; }
    return { ok: true, status: 200, json: async () => ({ teams: null }) };
  } });
  await limited.run();
  assert.equal(apiCalls, 1);
  assert.ok(limited.apiFootballUsed('futebol') >= 90);
});

test('hybrid match: the official name TheSportsDB knows finds the API-Football team', async () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol', 'L', 'Man Utd', 'Wolves', ?, 'live', 'winhouse', ?, ?)`).run(nowIso(), nowIso(), nowIso());
  const searched = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'media.api-sports.io') return { ok: false, status: 503, headers: new Headers() };
    if (u.hostname.endsWith('api-sports.io')) {
      const q = u.searchParams.get('search');
      searched.push(q);
      const response = q === 'Manchester United' ? [{ team: { name: 'Manchester United', code: 'MUN', logo: 'https://media.api-sports.io/football/teams/33.png' } }] : [];
      return { ok: true, status: 200, headers: new Headers({ 'x-ratelimit-requests-remaining': '95' }), json: async () => ({ errors: [], response }) };
    }
    const t = u.searchParams.get('t');
    const teams = t === 'Man Utd' ? [{ strTeam: 'Manchester United', strTeamAlternate: 'Man United, Man Utd', strSport: 'Soccer', strColour1: '#DA020E' }] : null;
    return { ok: true, status: 200, json: async () => ({ teams }) };
  };
  const logos = createTeamLogos(db, { fetchImpl, apiFootballKey: 'k', apiFootballPerMinute: 3, leaguePacks: {} });
  await logos.run();
  assert.deepEqual(searched.slice(0, 2), ['Man Utd', 'Manchester United']);
  // The logo could not be downloaded: the remote address is used.
  assert.equal(logos.get('futebol', 'Man Utd').logo, 'https://media.api-sports.io/football/teams/33.png');
  assert.equal(searched.length, 3); // Wolves: one search, then the minute's allowance is spent
});

test('whole league lists are kept: their teams get a badge with no request of their own', async () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol', 'Liga Portugal', 'SL Benfica', 'FC Porto', ?, 'live', 'winhouse', ?, ?)`).run(nowIso(), nowIso(), nowIso());
  const api = [];
  let images = 0;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'media.api-sports.io') {
      images += 1;
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
    }
    if (u.hostname.endsWith('api-sports.io')) {
      api.push(u.pathname + u.search);
      const season = u.searchParams.get('season');
      if (season && season !== '2024') return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' }, response: [] }) };
      const response = [{ team: { name: 'Benfica', code: 'BEN', logo: 'https://media.api-sports.io/football/teams/211.png' } },
        { team: { name: 'FC Porto', code: 'POR', logo: 'https://media.api-sports.io/football/teams/212.png' } }];
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [], response }) };
    }
    return { ok: true, status: 200, json: async () => ({ teams: null }) };
  };
  const logos = createTeamLogos(db, { fetchImpl, apiFootballKey: 'k', leaguePacks: { futebol: [94] } });
  await logos.run();
  assert.ok(api.every((p) => p.startsWith('/teams?league=94')), api.join(' ')); // no search per team
  assert.equal(api.at(-1), '/teams?league=94&season=2024'); // the plan's latest season
  assert.match(logos.get('futebol', 'SL Benfica').logo, /^\/team-logo\//);
  assert.match(logos.get('futebol', 'FC Porto').logo, /^\/team-logo\//);
  assert.equal(images, 2);
  // Kept: a new game of these teams needs no request at all.
  const before = api.length;
  const again = createTeamLogos(db, { fetchImpl, apiFootballKey: 'k', leaguePacks: { futebol: [94] } });
  await again.run();
  assert.equal(api.length, before);
  assert.equal(images, 2);
  const steps = await again.diagnose();
  assert.ok(steps.some((x) => /Ligas guardadas/.test(x.name) && /1 de 1 ligas/.test(x.detail)));
  assert.ok(!(await logos.diagnose()).some((x) => /Último erro/.test(x.name))); // the refused seasons are not errors
});
