import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leagueCountry } from '../server/countryleagues.js';
import { allowedLeagues, blockedGame, BASKETBALL_TREE, HOCKEY_TREE } from '../server/winhouse.js';

test('basketball: every league of the covered countries, the big ones named without a country too', () => {
  assert.equal(leagueCountry('basquetebol', 'Lithuania. LKL'), 'Lithuania');
  assert.equal(leagueCountry('basquetebol', 'Turkey. Super Ligi'), 'Turkey');
  assert.equal(leagueCountry('basquetebol', 'Portugal. LPB'), 'Portugal');
  assert.equal(leagueCountry('basquetebol', 'South Korea. KBL'), 'South Korea');
  assert.equal(leagueCountry('basquetebol', 'Philippines. PBA'), 'Philippines');
  assert.equal(leagueCountry('basquetebol', 'NBA'), 'United States');
  assert.equal(leagueCountry('basquetebol', 'EuroCup'), 'Europe');
  assert.equal(leagueCountry('basquetebol', 'FIBA World Cup'), 'World');
  assert.equal(leagueCountry('basquetebol', 'Kosovo. Superliga'), null);   // not covered
  assert.equal(leagueCountry('basquetebol', 'Germany'), null);             // a bare country is no league
});

test('ice hockey: the covered countries and the big leagues; junior leagues out', () => {
  assert.equal(leagueCountry('hoquei', 'Sweden. SHL'), 'Sweden');
  assert.equal(leagueCountry('hoquei', 'Switzerland. National League'), 'Switzerland');
  assert.equal(leagueCountry('hoquei', 'Czech Republic. Extraliga'), 'Czech Republic');
  assert.equal(leagueCountry('hoquei', 'NHL'), 'United States');
  assert.equal(leagueCountry('hoquei', 'KHL'), 'Russia');
  assert.equal(leagueCountry('hoquei', 'ICE Hockey League'), 'Austria');
  assert.equal(leagueCountry('hoquei', 'Champions Hockey League'), 'Europe');
  assert.equal(leagueCountry('hoquei', 'World Championship'), 'World');
  assert.equal(leagueCountry('hoquei', 'MHL'), null);
  assert.equal(leagueCountry('hoquei', 'Russia. MHL'), null);
  assert.equal(leagueCountry('hoquei', 'Kazakhstan. Championship'), null);
  assert.equal(leagueCountry('hoquei', 'Portugal. Liga'), null);            // Portugal is basketball's only
});

test('the feed shows those leagues and leaves out the rest, women\'s leagues of a covered country too', () => {
  const block = { leagues: { basquetebol: allowedLeagues('', BASKETBALL_TREE), hoquei: allowedLeagues('', HOCKEY_TREE) } };
  const game = (sport_id, league, extra = {}) => ({ sport_id, league, name: 'A - B', home_team: 'A', away_team: 'B', ...extra });
  assert.equal(blockedGame(game(2, 'Greece. Basket League'), block), false);
  assert.equal(blockedGame(game(2, 'Spain. Liga ACB'), block), false);            // listed by name
  assert.equal(blockedGame(game(2, 'Kosovo. Superliga'), block), true);
  assert.equal(blockedGame(game(2, 'Greece. A1 Women'), block), true);
  assert.equal(blockedGame(game(4, 'Finland. Liiga'), block), false);
  assert.equal(blockedGame(game(4, 'Kazakhstan. Championship'), block), true);
  assert.equal(blockedGame(game(4, 'Sweden. SDHL Women'), block), true);
  // A list set by the operator still replaces it.
  assert.equal(blockedGame(game(4, 'Finland. Liiga'), { leagues: { hoquei: allowedLeagues('Sweden. SHL', HOCKEY_TREE) } }), true);
});
