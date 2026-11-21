import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchClub } from '../server/bigclubs.js';

test('bigclubs: whitelist matching, tiers, and the tricky look-alikes', () => {
  const tier = (n) => { const r = matchClub(n); return r ? r.tier : null; };
  const cases = [
    ['Real Madrid', 1], ['FC Barcelona', 1], ['Atletico de Madrid', 1], ['Manchester City', 1], ['Man City', 1],
    ['Manchester United', 1], ['Tottenham Hotspur', 1], ['Bayern Munich', 1], ['Borussia Dortmund', 1],
    ['Paris Saint-Germain', 1], ['Juventus', 1], ['AC Milan', 1], ['Inter', 1], ['Inter Milan', 1], ['Napoli', 1],
    ['FC Porto', 1], ['Sporting CP', 1], ['Ajax', 1], ['Benfica', 1],
    ['Real Sociedad', 2], ['Real Betis', 2], ['Celta Vigo', 2], ['Aston Villa', 2], ['Wolves', 2], ['West Ham United', 2],
    ['AZ Alkmaar', 2], ['Vitoria Guimaraes', 2], ['Sporting Braga', 2],
    ['Flamengo', 3], ['Sao Paulo', 3], ['Gremio', 3], ['Cruzeiro', 3], ['Atletico Mineiro', 3], ['Internacional', 3],
    // look-alikes that must NOT match (or match a different club)
    ['Bayer Leverkusen', null], ['Borussia Monchengladbach', null], ['Paris FC', null], ['Inter Miami', null],
    ['Sporting Gijon', null], ['Granada', null], ['Sabadell', null], ['Ascoli Calcio 1898', null],
    // reserve / women / youth sides are never the first team
    ['Real Madrid Castilla', null], ['Barcelona B', null], ['Real Madrid W', null], ['Porto U23', null],
  ];
  for (const [name, exp] of cases) assert.equal(tier(name), exp, `${name} → ${exp}`);
});
