// Casino skins ("películas"): a cover can be scoped to Free Spins only (fs), separate from the normal game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSkins } from '../server/skins.js';

const box = [10, 20, 30, 10];
const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('skins: a cover can be marked Free-Spins-only, kept apart from the normal cover', () => {
  const db = openDb(':memory:');
  const skins = createSkins(db);
  const normal = skins.save({ code: 'vs20bbbxmas', name: 'Big Bass', side: 'port', ratio: 0.64, box, image: img });
  assert.equal(normal.fs, false); // default: the normal game
  const fs = skins.save({ code: 'vs20bbbxmas', name: 'Big Bass (FS)', side: 'port', ratio: 0.64, box, image: img, fs: true, block: true });
  assert.equal(fs.fs, true);

  // Both are live, each carrying its scope so the site can pick by mode.
  const live = skins.live();
  assert.equal(live.length, 2);
  assert.equal(live.filter((s) => s.fs).length, 1);
  assert.equal(live.filter((s) => !s.fs).length, 1);

  // Editing keeps the scope unless changed.
  const back = skins.save({ id: fs.id, code: 'vs20bbbxmas', name: 'Big Bass (FS)', side: 'port', ratio: 0.64, box, fs: false });
  assert.equal(back.fs, false);
  db.close();
});
