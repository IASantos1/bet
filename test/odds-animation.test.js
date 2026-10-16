import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollingOddsMarkup } from '../public/odds.js';

test('odds stay static when there is no previous price or no visible change', () => {
  for (const markup of [
    rollingOddsMarkup(undefined, 2.05, 'up'),
    rollingOddsMarkup(1.231, 1.234, 'up'),
    rollingOddsMarkup(2.05, 2.05, 'down'),
  ]) {
    assert.match(markup, /2\.05|1\.23/);
    assert.doesNotMatch(markup, /odd-roll-track|odd-roll-digit/);
  }
});

test('only the changed digit rolls upward or downward', () => {
  const up = rollingOddsMarkup(1.24, 1.25, 'up');
  const down = rollingOddsMarkup(1.25, 1.24, 'down');

  assert.equal((up.match(/odd-roll-digit rolling-up/g) || []).length, 1);
  assert.match(up, /--roll-from-y:-14em;--roll-to-y:-15em/);
  assert.equal((down.match(/odd-roll-digit rolling-down/g) || []).length, 1);
  assert.match(down, /--roll-from-y:-15em;--roll-to-y:-14em/);
});

test('digit carries wrap in the rolling direction and wider prices remain aligned', () => {
  const carry = rollingOddsMarkup(1.99, 2.00, 'up');
  const wider = rollingOddsMarkup(9.99, 10.00, 'up');

  assert.equal((carry.match(/odd-roll-digit rolling-up/g) || []).length, 3);
  assert.match(carry, /--roll-from-y:-19em;--roll-to-y:-20em/);
  assert.match(wider, /odd-value-digit">1<\/span>/);
  assert.equal((wider.match(/odd-roll-digit rolling-up/g) || []).length, 3);
});
