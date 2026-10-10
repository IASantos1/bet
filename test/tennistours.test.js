import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tourOf, tourLabel, TOUR_GROUPS } from '../server/tennistours.js';

test('tour tournaments: group, Portuguese label and the host country', () => {
  const t = (name) => { const x = tourOf(name); return x && [x.group, tourLabel(name), x.country]; };
  assert.deepEqual(t('ATP. Shanghai'), ['ATP', 'Shanghai ATP', 'cn']);
  assert.deepEqual(t('ATP. Shanghai. Doubles'), ['ATP', 'Shanghai ATP - Pares', 'cn']);
  assert.deepEqual(t('WTA. Beijing'), ['WTA', 'Pequim WTA', 'cn']);
  assert.deepEqual(t('WTA. Wuhan. Qualification'), ['WTA', 'Wuhan WTA - Qual.', 'cn']);
  assert.deepEqual(t('ATP. Challenger. Braga'), ['Challengers', 'Braga Challenger', 'pt']);
  assert.deepEqual(t('ATP. Challenger. Antofagasta. Doubles'), ['Challengers', 'Antofagasta Challenger - Pares', 'cl']);
  assert.deepEqual(t('WTA. Challenger. Samsun'), ['Challengers', 'Samsun WTA Challenger', 'tr']);
  assert.deepEqual(t('WTA 125. Suzhou. Doubles'), ['Challengers', 'Suzhou WTA Challenger - Pares', 'cn']);
  assert.deepEqual(t('ATP. Challenger. Wuning 3'), ['Challengers', 'Wuning 3 Challenger', 'cn']);
  assert.deepEqual(t('ATP. Challenger. Villena'), ['Challengers', 'Villena Challenger', 'es']);
  assert.deepEqual(t('ATP. Challenger. Palermo'), ['Challengers', 'Palermo Challenger', 'it']);
  assert.deepEqual(t('ATP. Australian Open'), ['ATP', 'Open da Austrália ATP', 'au']);
  assert.deepEqual(t('ATP. Somewhere New'), ['ATP', 'Somewhere New ATP', null]); // unknown city: its own name, no flag
  assert.deepEqual(TOUR_GROUPS, ['ATP', 'WTA', 'Challengers']);
});

test('not the tours: ITF, UTR, exhibitions, juniors; loose keys still recognised', () => {
  for (const n of ['World Tennis. Darwin', 'World Tennis. Monastir. Women', 'UTR Pro Tennis Series', 'ITF. Sharm', 'Exhibition. Abu Dhabi', 'ATP. Juniors. Paris', 'Spain. La Liga']) {
    assert.equal(tourOf(n), null, n);
  }
  assert.ok(tourOf('atpchallengerlyon'));
  assert.ok(tourOf('wtabeijingdoubles'));
  assert.equal(tourOf('worldtennisdarwin'), null);
});
