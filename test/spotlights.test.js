import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getSetting } from '../server/db.js';
import { createBanners } from '../server/banners.js';
import { createCollections } from '../server/collections.js';
import { createSpotlights } from '../server/spotlights.js';
import { createSeasonal } from '../server/seasonal.js';

const DIR = new URL('../public/casino/banners', import.meta.url).pathname;

test('destaques: guardar, datas, quem vê, e o cartão sem imagem própria', () => {
  const db = openDb(':memory:');
  const s = createSpotlights(db);
  assert.throws(() => s.save({ tagline: 'x' }), /Escolha o jogo/);
  const a = s.save({ gameId: 7, tagline: 'Esta avozinha é badass!', after: 'novos' });
  assert.equal(a.img, null, 'sem imagem própria: o site usa a arte do jogo');
  assert.equal(a.after, 'novos');
  s.save({ gameId: 8, after: 'nada', audience: 'guest' });
  s.save({ gameId: 9, startsAt: '2030-01-01T00:00:00Z' });
  assert.deepEqual(s.live({ signedIn: true }).map((x) => x.gameId), [7]);
  assert.deepEqual(s.live({ signedIn: false }).map((x) => x.gameId), [7, 8]);
  assert.equal(s.all().find((x) => x.gameId === 8).after, 'novos', 'uma fila desconhecida fica "Acabados de chegar"');
  const img = 'data:image/png;base64,' + Buffer.from('png').toString('base64');
  const b = s.save({ id: a.id, gameId: 7, imageD: img });
  assert.ok(b.img.d && b.img.m === b.img.d);
  assert.equal(s.save({ id: a.id, gameId: 7, removeD: true }).img, null);
});

test('destaques sazonais: Big Bass Halloween até 31/10, depois Gates of Olympus Super Scatter; um jogo que falta é procurado mais tarde', async () => {
  const db = openDb(':memory:');
  const spotlights = createSpotlights(db);
  const seasonal = createSeasonal(db, { banners: createBanners(db), collections: createCollections(db), spotlights, dir: DIR });
  const games = [
    { id: 1, name: 'Big Bass Halloween Splash 1000', provider: 'Pragmatic Play' },
    { id: 2, name: 'Fruity Halloween', provider: 'Habanero' },
  ];
  await seasonal.ensure(async () => ({ games }), Date.parse('2026-10-25T12:00:00Z'));
  const list = spotlights.all();
  assert.deepEqual(list.map((x) => [x.gameId, x.endsAt]), [[1, '2026-11-01T00:00:00.000Z']]);
  assert.equal(list[0].cta, 'Joga agora!');
  assert.equal(getSetting(db, 'casino.spotlight.nov-2026-olympus', false), false, 'ainda não está no catálogo');
  games.push({ id: 3, name: 'Gates of Olympus Super Scatter', provider: 'Pragmatic Play' });
  await seasonal.ensure(async () => ({ games }), Date.parse('2026-10-25T12:00:00Z'));
  assert.deepEqual(spotlights.all().map((x) => x.gameId), [1, 3]);
  assert.equal(spotlights.live({ now: '2026-11-02T00:00:00.000Z' })[0].gameId, 3, 'em novembro só o do Zeus');
});
