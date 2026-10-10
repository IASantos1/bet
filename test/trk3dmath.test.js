import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PITCH, pitchPoint, flightHeight, zoneStyle, qualityTier, fovFor } from '../public/trk3dmath.js';

test('a tracker fix lands on the 3D pitch: corners, centre, the goal mouth beyond the line', () => {
  assert.deepEqual(pitchPoint(50, 50), { x: 0, z: 0 });
  assert.deepEqual(pitchPoint(0, 0), { x: -PITCH.L / 2, z: -PITCH.W / 2 });     // far-left corner
  assert.deepEqual(pitchPoint(100, 100), { x: PITCH.L / 2, z: PITCH.W / 2 });   // near-right corner
  assert.ok(pitchPoint(101.6, 50).x > PITCH.L / 2);                              // in the net
  assert.equal(pitchPoint(500, -20).x, -PITCH.L / 2 + 1.02 * PITCH.L);           // clamped
  assert.equal(pitchPoint(500, -20).z, -PITCH.W / 2);
});

test('flight: short passes on the grass, long balls and set pieces in the air (never above 9 m)', () => {
  const a = { x: 0, z: 0 };
  assert.equal(flightHeight(a, { x: 3, z: 0 }, 'shot'), 0);           // a tap
  assert.equal(flightHeight(a, { x: 15, z: 0 }, 'attack'), 0);        // a pass
  assert.ok(flightHeight(a, { x: 15, z: 0 }, 'shot') > 0);            // a shot rises
  assert.ok(flightHeight(a, { x: 40, z: 0 }, 'possession') > 0);      // a long ball
  assert.equal(flightHeight(a, { x: 100, z: 60 }, 'corner'), 9);
});

test('zone like the 2D arrow: grey, orange when attacking, pulsing red in danger', () => {
  assert.equal(zoneStyle('neutral').color, 0x6b6b6b);
  assert.equal(zoneStyle('attacking').color, 0xdc8228);
  assert.deepEqual([zoneStyle('danger').color, zoneStyle('danger').pulse], [0xd20a0a, true]);
});

test('quality: phones, small screens, few cores and data saver draw less', () => {
  assert.equal(qualityTier({ coarse: false, width: 1440, cores: 8 }), 'high');
  assert.equal(qualityTier({ coarse: true, width: 1440, cores: 8 }), 'low');
  assert.equal(qualityTier({ width: 600, cores: 8 }), 'low');
  assert.equal(qualityTier({ width: 1440, cores: 4 }), 'low');
  assert.equal(qualityTier({ width: 1440, cores: 8, saveData: true }), 'low');
});

test('camera: the horizontal view of a 16:9 frame is kept in narrower boxes', () => {
  assert.equal(fovFor(16 / 9), 40);
  assert.equal(fovFor(2.4), 40);
  const narrow = fovFor(1.55);
  assert.ok(narrow > 40 && narrow < 50);
  // same horizontal angle
  const h = (fov, a) => 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * a);
  assert.ok(Math.abs(h(narrow, 1.55) - h(40, 16 / 9)) < 1e-9);
  assert.ok(fovFor(0.6) <= 75);
});
