// Notifications on the phone (Web Push): a won bet reaches the player even with the app closed.
// Delivered free by the browser's own service (Google for Chrome / Android, Apple for Safari / iOS,
// Mozilla for Firefox); the site signs each message with its VAPID keys. Without VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY set, a pair is made once and kept in the database (settings), so nothing needs
// configuring. A subscription made under other keys is never used (it would be refused).
import webpush from 'web-push';
import { getSetting, setSetting, nowIso } from './db.js';
import { shortTeam } from './shortnames.js';

const fmt = (cents) => `€${(cents / 100).toFixed(2).replace('.', ',')}`;

export function ensurePushTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, vapid TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, ok_at TEXT)`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs (user_id)');
  // Each won bet once: when its notification went out, and when the player saw the celebration.
  db.exec(`CREATE TABLE IF NOT EXISTS win_notices (
    bet_id INTEGER PRIMARY KEY REFERENCES bets(id), user_id INTEGER NOT NULL, pushed_at TEXT, seen_at TEXT)`);
}

/** The won bets a player has not seen celebrated yet (the last 48 hours). */
export function unseenWins(db, userId, now = Date.now()) {
  return db.prepare(`SELECT b.* FROM bets b LEFT JOIN win_notices n ON n.bet_id = b.id
    WHERE b.user_id = ? AND b.status = 'won' AND b.payout_cents > 0 AND b.settled_at > ? AND n.seen_at IS NULL
    ORDER BY b.settled_at DESC LIMIT 5`).all(userId, new Date(now - 48 * 3_600_000).toISOString());
}

export function markWinsSeen(db, userId, ids) {
  const up = db.prepare(`INSERT INTO win_notices (bet_id, user_id, seen_at) SELECT id, user_id, ? FROM bets WHERE id = ? AND user_id = ?
    ON CONFLICT(bet_id) DO UPDATE SET seen_at = excluded.seen_at`);
  const at = nowIso();
  for (const id of ids) up.run(at, id, userId);
}

/** The notification of a won bet: the match (or how many picks) and what was paid. */
export function winMessage(bet, legs) {
  const one = legs.length === 1 ? legs[0] : null;
  const match = one ? `${shortTeam(one.home, one.sport) || one.home} – ${shortTeam(one.away, one.sport) || one.away}` : `Múltipla de ${legs.length} seleções`;
  return {
    kind: 'win', title: '🏆 A sua aposta ganhou!',
    body: `${match} · +${fmt(bet.payout_cents)} creditados no seu saldo.`,
    url: '/#/apostas', tag: `bet-${bet.id}`, image: '/img/push-win.jpg',
  };
}

export function createPush(db, { publicKey = '', privateKey = '', subject = '', log = () => {} } = {}) {
  ensurePushTables(db);
  let keys = publicKey && privateKey ? { publicKey, privateKey } : getSetting(db, 'push.vapid', null);
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    setSetting(db, 'push.vapid', keys);
    log('chaves VAPID criadas e guardadas na base de dados');
  }
  webpush.setVapidDetails(subject || 'mailto:suporte@bet62.plus', keys.publicKey, keys.privateKey);

  function subscribe(userId, sub, ua = '') {
    const endpoint = String(sub?.endpoint || '');
    const p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return false;
    db.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, vapid, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, vapid = excluded.vapid, ua = excluded.ua`)
      .run(userId, endpoint, p256dh, auth, keys.publicKey, String(ua).slice(0, 200), nowIso());
    return true;
  }
  const unsubscribe = (userId, endpoint) => db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''));

  /** Sends a message to every phone of a player; the ones the service no longer knows are removed. */
  async function sendTo(userId, message) {
    const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ? AND vapid = ?').all(userId, keys.publicKey);
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 86_400, urgency: 'high' });
        db.prepare('UPDATE push_subs SET ok_at = ? WHERE id = ?').run(nowIso(), s.id);
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id);
        else log(`envio falhou (${err.statusCode || err.message})`);
      }
    }
    return sent;
  }

  /** Won bets of the last hours not announced yet: each one notified once. */
  let busy = false;
  async function notifyWins() {
    if (busy) return 0;
    busy = true;
    try {
      const bets = db.prepare(`SELECT b.*, json_extract(u.prefs, '$.notifyPush') AS wants FROM bets b JOIN users u ON u.id = b.user_id
        LEFT JOIN win_notices n ON n.bet_id = b.id
        WHERE b.status = 'won' AND b.payout_cents > 0 AND b.settled_at > ? AND n.pushed_at IS NULL AND n.seen_at IS NULL
        ORDER BY b.settled_at LIMIT 200`).all(new Date(Date.now() - 6 * 3_600_000).toISOString());
      const legsOf = db.prepare('SELECT e.sport, e.home, e.away FROM bet_legs l JOIN events e ON e.id = l.event_id WHERE l.bet_id = ? ORDER BY l.id');
      const mark = db.prepare(`INSERT INTO win_notices (bet_id, user_id, pushed_at) VALUES (?, ?, ?)
        ON CONFLICT(bet_id) DO UPDATE SET pushed_at = excluded.pushed_at`);
      let n = 0;
      for (const b of bets) {
        mark.run(b.id, b.user_id, nowIso());
        // Turned off in the player's notifications: marked as announced, nothing sent.
        if (b.wants === 0) continue;
        n += await sendTo(b.user_id, winMessage(b, legsOf.all(b.id)));
      }
      return n;
    } finally { busy = false; }
  }

  function start(everyMs = 20_000) {
    const tick = () => notifyWins().catch((err) => log(`apostas ganhas: ${err.message}`));
    const t = setInterval(tick, everyMs);
    t.unref?.();
    return () => clearInterval(t);
  }

  return { publicKey: keys.publicKey, subscribe, unsubscribe, sendTo, notifyWins, start };
}
