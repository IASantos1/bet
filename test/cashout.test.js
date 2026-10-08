import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { placeBets, settleEvent } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { cashoutOffer, cashOut, saveCashoutConfig, cashoutConfig } from '../server/cashout.js';

function setup() {
  const db = openDb(':memory:');
  const u = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('c@x', 'C', '1990-01-01', 'x', ?)").run(nowIso()).lastInsertRowid);
  tx(db, () => postTransaction(db, u, 10000, 'deposit', 'd'));
  return { db, u };
}
function match(db, odds = 200) {
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'A', 'B', ?, 'scheduled', ?, ?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const sel = Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', ?)").run(id, odds).lastInsertRowid);
  return { id, sel };
}
/** A bet placed `ageSec` seconds ago. */
function bet(db, u, picks, { mode = 'single', stake = 1000, ageSec = 120 } = {}) {
  const [id] = tx(db, () => placeBets(db, { id: u }, { mode, stakeCents: stake, picks }));
  db.prepare('UPDATE bets SET created_at = ? WHERE id = ?').run(new Date(Date.now() - ageSec * 1000).toISOString(), id);
  return id;
}
const bal = (db, u) => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(u).balance_cents;
const row = (db, id) => db.prepare('SELECT * FROM bets WHERE id = ?').get(id);
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

test('cash out: fair value × margin; a lower value is confirmed again, a higher one pays what was accepted; paid once, audited, later results pay nothing', () => {
  const { db, u } = setup();
  const f = cashoutConfig(db).factor;
  const m = match(db, 200);
  const id = bet(db, u, [{ selectionId: m.sel, odds: 2 }]);
  db.prepare('UPDATE selections SET odds_x100 = 125 WHERE id = ?').run(m.sel);
  const o = cashoutOffer(db, row(db, id));
  assert.equal(o.status, 'available');
  assert.equal(o.fairCents, 1600);
  assert.equal(o.valueCents, Math.floor(1600 * f));
  // The player saw more than it is worth now: refused, with the new offer.
  assert.throws(() => tx(db, () => cashOut(db, u, id, o.valueCents + 50)), /mudou/);
  // The player saw less (the price moved their way): the accepted amount is paid.
  const r = tx(db, () => cashOut(db, u, id, o.valueCents - 100));
  assert.equal(r.valueCents, o.valueCents - 100);
  assert.equal(bal(db, u), 9000 + r.valueCents);
  assert.equal(row(db, id).status, 'cashout');
  assert.deepEqual({ ...db.prepare('SELECT value_cents, fair_cents, seen_cents FROM cashouts WHERE bet_id = ?').get(id) }, { value_cents: r.valueCents, fair_cents: 1600, seen_cents: r.valueCents });
  assert.throws(() => tx(db, () => cashOut(db, u, id, r.valueCents)), /indisponível|resolvida/);
  tx(db, () => { db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0 WHERE id = ?").run(m.id); settleEvent(db, m.id); });
  assert.equal(bal(db, u), 9000 + r.valueCents);
});

test('cash out: not in the first seconds after the bet; capped; off before the start, in play or entirely', () => {
  const { db, u } = setup();
  const m = match(db, 300);
  const fresh = bet(db, u, [{ selectionId: m.sel, odds: 3 }], { ageSec: 5 });
  assert.match(cashoutOffer(db, row(db, fresh)).reason, /depois de apostar/);
  const id = bet(db, u, [{ selectionId: m.sel, odds: 3 }]);
  db.prepare('UPDATE selections SET odds_x100 = 105 WHERE id = ?').run(m.sel);
  saveCashoutConfig(db, { maxValue: 20 });
  assert.equal(cashoutOffer(db, row(db, id)).valueCents, 2000);
  saveCashoutConfig(db, { prematch: false });
  assert.equal(cashoutOffer(db, row(db, id)).status, 'unavailable');
  saveCashoutConfig(db, { prematch: true, enabled: false });
  assert.match(cashoutOffer(db, row(db, id)).reason, /desligado/);
  assert.throws(() => saveCashoutConfig(db, { factor: 2 }), /inválido/);
});

test('cash out in play: needs a fresh live price newer than the last goal, and waits the lock after it', () => {
  const { db, u } = setup();
  const m = match(db, 200);
  const id = bet(db, u, [{ selectionId: m.sel, odds: 2 }]);
  db.prepare("UPDATE events SET status = 'live', source = 'winhouse', live_odds_at = ?, score_at = ? WHERE id = ?").run(ago(5), ago(120), m.id);
  const o = cashoutOffer(db, row(db, id));
  assert.equal(o.status, 'available');
  assert.equal(o.live, true);
  // A goal 10 s ago: the price is older than the goal → suspended.
  db.prepare('UPDATE events SET score_at = ? WHERE id = ?').run(ago(10), m.id);
  assert.match(cashoutOffer(db, row(db, id)).reason, /revisão/);
  // A new price after the goal, but the lock (30 s) is not over yet.
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(ago(2), m.id);
  assert.match(cashoutOffer(db, row(db, id)).reason, /revisão/);
  db.prepare('UPDATE events SET score_at = ?, live_odds_at = ? WHERE id = ?').run(ago(60), ago(2), m.id);
  assert.equal(cashoutOffer(db, row(db, id)).status, 'available');
  // An old live price: suspended. Off in play: unavailable.
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(ago(3600), m.id);
  assert.equal(cashoutOffer(db, row(db, id)).status, 'suspended');
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(ago(2), m.id);
  saveCashoutConfig(db, { live: false });
  assert.equal(cashoutOffer(db, row(db, id)).status, 'unavailable');
});

test('cash out: won legs count at their odds; suspended with a closed market or a started/finished match; unavailable for builders, free bets, bonus money and lost legs', () => {
  const { db, u } = setup();
  const f = cashoutConfig(db).factor;
  const a = match(db, 150);
  const b = match(db, 180);
  const multi = bet(db, u, [{ selectionId: a.sel, odds: 1.5 }, { selectionId: b.sel, odds: 1.8 }], { mode: 'multiple' });
  db.prepare("UPDATE bet_legs SET status = 'won' WHERE bet_id = ? AND selection_id = ?").run(multi, a.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).valueCents, Math.floor(Math.floor(1000 * 1.5) * f));
  db.prepare('UPDATE selections SET active = 0 WHERE id = ?').run(b.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).status, 'suspended');
  db.prepare('UPDATE selections SET active = 1 WHERE id = ?').run(b.sel);
  db.prepare("UPDATE events SET status = 'finished' WHERE id = ?").run(b.id);
  assert.match(cashoutOffer(db, row(db, multi)).reason, /resultado/);
  db.prepare("UPDATE bet_legs SET status = 'lost' WHERE bet_id = ? AND selection_id = ?").run(multi, b.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).status, 'unavailable');
  for (const extra of [{ type: 'builder' }, { freebet_stake_cents: 500 }, { bonus_stake_cents: 100 }]) {
    assert.equal(cashoutOffer(db, { ...row(db, multi), status: 'open', ...extra }).status, 'unavailable');
  }
});

test('cash out API: live requests wait the acceptance delay; a second request for the same bet is refused while one runs', async () => {
  const db = openDb(':memory:');
  seed(db);
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  try {
    await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'co@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true });
    const uid = db.prepare("SELECT id FROM users WHERE email = 'co@example.com'").get().id;
    tx(db, () => postTransaction(db, uid, 5000, 'deposit', 'd'));
    const m = match(db, 200);
    const id = bet(db, uid, [{ selectionId: m.sel, odds: 2 }]);
    db.prepare("UPDATE events SET status = 'live', source = 'manual' WHERE id = ?").run(m.id);
    saveCashoutConfig(db, { liveDelaySeconds: 1 });
    const offer = (await call('GET', '/api/bets')).body.bets[0].cashout;
    assert.equal(offer.status, 'available');
    assert.equal(offer.live, true);
    const t0 = Date.now();
    const [first, second] = await Promise.all([
      call('POST', `/api/bets/${id}/cashout`, { value: offer.value }),
      new Promise((ok) => setTimeout(ok, 100)).then(() => call('POST', `/api/bets/${id}/cashout`, { value: offer.value })),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.ok(Date.now() - t0 >= 1000);
    assert.equal(second.status, 409);
    assert.equal(first.body.value, offer.value);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'cashout'").get().n, 1);
  } finally {
    server.close();
    db.close();
  }
});
