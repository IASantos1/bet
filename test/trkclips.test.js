import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { CLIPS, clipFormat, scorer, cornerClip, situationClip, createClipGate, GOAL_GAP_MS, CORNER_GAP_MS } from '../public/trkclips.js';

test('the clips are in public/media and small enough for a phone', () => {
  for (const { src } of Object.values(CLIPS)) {
    for (const ext of ['mp4', 'webm']) {
      const file = new URL(`../public${src}.${ext}`, import.meta.url);
      assert.ok(existsSync(file), `${src}.${ext}`);
      assert.ok(statSync(file).size < 700_000, `${src}.${ext} is too big`);
    }
  }
});

test('clip format: MP4 where the browser is sure, WebM without H.264, nothing without either', () => {
  const browser = (types) => (t) => types[t.split(';')[0]] || '';
  assert.equal(clipFormat(browser({ 'video/mp4': 'probably', 'video/webm': 'probably' })), 'mp4');
  assert.equal(clipFormat(browser({ 'video/webm': 'probably' })), 'webm');
  assert.equal(clipFormat(browser({ 'video/mp4': 'maybe' })), 'mp4');
  assert.equal(clipFormat(browser({})), null);
});

test('scorer: a goal for one side; nothing on the first look, a correction or no change', () => {
  assert.equal(scorer({ home: 0, away: 0 }, { home: 1, away: 0 }), 'home');
  assert.equal(scorer({ home: 1, away: 0 }, { home: 1, away: 1 }), 'away');
  assert.equal(scorer(null, { home: 2, away: 1 }), null);
  assert.equal(scorer({ home: 1, away: 1 }, { home: 0, away: 1 }), null); // VAR took it back
  assert.equal(scorer({ home: 1, away: 1 }, { home: 1, away: 1 }), null);
  assert.equal(scorer({ home: 0, away: 0 }, { home: 1, away: 1 }), null); // two at once: catching up, not live
});

test('corner clip: right or left of the goal from where the ball is; turns when the spot is a guess', () => {
  // home attacks left→right: bottom flags are right of the goal
  assert.equal(cornerClip({ side: 'home', x: 99, y: 97 }), 'corner-right');
  assert.equal(cornerClip({ side: 'home', x: 99, y: 3 }), 'corner-left');
  // away attacks right→left: top flags are right of the goal
  assert.equal(cornerClip({ side: 'away', x: 1, y: 3 }), 'corner-right');
  assert.equal(cornerClip({ side: 'away', x: 1, y: 97 }), 'corner-left');
  assert.equal(cornerClip({ side: 'home', x: 98, y: 4, estimated: true }, 0), 'corner-right');
  assert.equal(cornerClip({ side: 'home', x: 98, y: 4, estimated: true }, 1), 'corner-left');
  assert.equal(cornerClip(null, 2), 'corner-right');
});

test('situation clip: only when the situation turns into a goal or a corner', () => {
  assert.equal(situationClip({ situation: 'attack' }, { situation: 'corner' }), 'corner');
  assert.equal(situationClip({ situation: 'corner' }, { situation: 'corner' }), null);
  assert.equal(situationClip(null, { situation: 'goal' }), 'goal');
  assert.equal(situationClip({ situation: 'goal' }, { situation: 'goal' }), null);
  assert.equal(situationClip({ situation: 'corner' }, { situation: 'dangerous_attack' }), null);
});

test('clip gate: once per happening, a goal takes over a corner, a corner never cuts a goal', () => {
  let t = 0;
  const g = createClipGate(() => t);
  assert.ok(g.want('corner-right'));
  g.start('corner-right', 5000);
  t = 1000;
  assert.ok(!g.want('corner-left'));      // the same corner again
  assert.ok(g.want('goal'));              // a goal cuts in
  g.start('goal', 30_000);
  assert.equal(g.playing, 'goal');
  t = CORNER_GAP_MS + 2000;
  assert.ok(!g.want('corner-left'));      // still celebrating
  g.stop();                               // the clip ended
  assert.equal(g.playing, null);
  assert.ok(g.want('corner-left'));       // a new corner
  assert.ok(!g.want('goal'));             // the score confirming the same goal
  t = 1000 + GOAL_GAP_MS;
  assert.ok(g.want('goal'));
});
