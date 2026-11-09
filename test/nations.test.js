import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nationOf, nationalSides } from '../server/nations.js';

test('national teams: Portuguese name and flag, English feed variants', () => {
  assert.deepEqual(nationOf('Spain'), { pt: 'Espanha', flag: 'https://flagcdn.com/w80/es.png' });
  assert.equal(nationOf('Republic of Ireland').pt, 'Irlanda');
  assert.equal(nationOf('Türkiye').pt, 'Turquia');
  assert.equal(nationOf('Northern Ireland').flag, 'https://flagcdn.com/w80/gb-nir.png');
  assert.equal(nationOf('Portugal U21').pt, 'Portugal Sub-21');
  assert.equal(nationOf('Spain (W)').pt, 'Espanha (F)');
  assert.equal(nationOf('Benfica'), null);
});

test('nationalSides only when both sides are countries', () => {
  assert.equal(nationalSides('Germany', 'Netherlands').away.pt, 'Países Baixos');
  assert.equal(nationalSides('Georgia', 'Dinamo Tbilisi'), null);
});
