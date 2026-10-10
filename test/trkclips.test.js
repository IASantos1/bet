import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { CLIPS, clipFormat, scorer, cornerClip, situationClip, createClipGate, createCornerWatch, restartSeen, GOAL_HOLD, GOAL_GAP_MS, CORNER_GAP_MS, CORNER_WAIT_MS } from '../public/trkclips.js';

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

test('corner watch: nothing when the corner is awarded, the clip when it is taken', () => {
  let t = 0;
  const w = createCornerWatch(() => t);
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 60 }), null);
  assert.equal(w.frame({ side: 'home', situation: 'corner', x: 99, y: 97 }), null); // awarded
  t = 4000;
  assert.equal(w.frame({ side: 'home', situation: 'corner', x: 99, y: 97 }), null); // waiting for the kick
  t = 9000;
  assert.equal(w.frame({ side: 'home', situation: 'dangerous_attack', x: 90, y: 50 }), 'corner-right'); // taken
  assert.equal(w.frame({ side: 'home', situation: 'shot', x: 92, y: 48 }), null); // once
});

test('corner watch: a real fix leaving the flag while it still says "corner" is the kick', () => {
  const w = createCornerWatch(() => 0);
  assert.equal(w.frame({ side: 'away', situation: 'corner', x: 1, y: 3 }), null);
  assert.equal(w.frame({ side: 'away', situation: 'corner', x: 2, y: 4 }), null);   // the taker places the ball
  assert.equal(w.frame({ side: 'away', situation: 'corner', x: 12, y: 45 }), 'corner-right');
});

test('corner watch: a guessed spot alternates sides and a later real fix at the flag decides it', () => {
  const w = createCornerWatch(() => 0);
  w.frame({ side: 'home', situation: 'corner', x: 98, y: 4, estimated: true });
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40, estimated: true }), 'corner-right');
  w.frame({ side: 'home', situation: 'corner', x: 98, y: 4, estimated: true });
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40, estimated: true }), 'corner-left');
  w.frame({ side: 'home', situation: 'corner', x: 98, y: 4, estimated: true });
  w.frame({ side: 'home', situation: 'corner', x: 99, y: 96 }); // real: bottom flag
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40 }), 'corner-right');
});

test('corner watch: never taken (half time, too long, reset by a goal) plays nothing', () => {
  let t = 0;
  const w = createCornerWatch(() => t);
  w.frame({ side: 'home', situation: 'corner', x: 99, y: 3 });
  assert.equal(w.frame({ side: null, situation: 'halftime', x: 50, y: 50 }), null);
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40 }), null);
  w.frame({ side: 'home', situation: 'corner', x: 99, y: 3 });
  t = CORNER_WAIT_MS + 1;
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40 }), null);
  w.frame({ side: 'home', situation: 'corner', x: 99, y: 3 });
  w.reset();
  assert.equal(w.pending, false);
  assert.equal(w.frame({ side: 'home', situation: 'attack', x: 80, y: 40 }), null);
});

test('goal hold: the celebration stays until the tracker shows the game going again', () => {
  const hold = { since: 0, sawGoal: true };
  assert.equal(restartSeen(hold, 'goal', 5000), false);          // still the goal
  assert.equal(restartSeen(hold, null, 5000), false);            // no situation: nothing new
  assert.equal(restartSeen(hold, 'possession', 5000), true);     // kick-off taken
  assert.equal(restartSeen(null, 'possession', 5000), false);
  // only the score said "goal": the tracker's lagging frames are not believed for a while
  const byScore = { since: 0, sawGoal: false };
  assert.equal(restartSeen(byScore, 'dangerous_attack', 3000), false);
  assert.equal(restartSeen(byScore, 'possession', GOAL_HOLD.staleMs), true);
  assert.ok(GOAL_HOLD.loopFrom < CLIPS.goal.ms / 1000);
});
