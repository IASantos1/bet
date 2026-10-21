// WinHouse availability, for the admin: every read of the live list (every ~15 s) is noted as a
// success or a failure with how long it took. Kept per minute for 8 days, plus the outages: 3 failed
// reads in a row open one (from the first failure), the next good read closes it.
//
// summary() → { state: 'online' | 'instavel' | 'em_baixo' | 'sem_leituras', since, lastOkAt, lastFailAt,
//   lastError, avgMs, uptime24h, uptime7d, timeline: [{ at, state }] (24 h in 15-min slots, oldest first),
//   outages: [{ startedAt, endedAt, minutes, error }] (7 days, newest first) }

const MIN = 60_000;
const KEEP_DAYS = 8;
const OPEN_AFTER = 3; // failed reads in a row that make an outage

export function createWinHouseHealth(db, { now = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS winhouse_health (
    minute INTEGER PRIMARY KEY, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, error TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS winhouse_outages (
    id INTEGER PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, error TEXT, fails INTEGER NOT NULL DEFAULT 0)`);
  const bump = db.prepare(`INSERT INTO winhouse_health (minute, ok, fail, ms, error) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(minute) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail, ms = ms + excluded.ms,
      error = COALESCE(excluded.error, error)`);
  const openOutage = db.prepare('SELECT * FROM winhouse_outages WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1');
  let streak = 0; // failed reads in a row
  let streakStart = null;
  let streakError = null;
  let lastOkAt = null;
  let lastFailAt = null;
  let lastError = null;
  let pruned = 0;

  /** One read of WinHouse: ok or not, how long it took, the error when it failed. */
  function note(ok, ms = 0, error = null) {
    const t = now();
    bump.run(Math.floor(t / MIN), ok ? 1 : 0, ok ? 0 : 1, ok ? Math.max(0, Math.round(ms)) : 0, ok ? null : String(error || 'erro').slice(0, 200));
    const open = openOutage.get();
    if (ok) {
      lastOkAt = t;
      streak = 0;
      streakStart = null;
      if (open) db.prepare('UPDATE winhouse_outages SET ended_at = ? WHERE id = ?').run(t, open.id);
    } else {
      lastFailAt = t;
      lastError = String(error || 'erro').slice(0, 200);
      if (!streak) { streakStart = t; streakError = lastError; }
      streak += 1;
      if (open) db.prepare('UPDATE winhouse_outages SET fails = fails + 1, error = ? WHERE id = ?').run(lastError, open.id);
      else if (streak >= OPEN_AFTER) db.prepare('INSERT INTO winhouse_outages (started_at, error, fails) VALUES (?, ?, ?)').run(streakStart, streakError, streak);
    }
    if (t - pruned > 3_600_000) {
      pruned = t;
      const cut = t - KEEP_DAYS * 24 * 3_600_000;
      db.prepare('DELETE FROM winhouse_health WHERE minute < ?').run(Math.floor(cut / MIN));
      db.prepare('DELETE FROM winhouse_outages WHERE ended_at IS NOT NULL AND ended_at < ?').run(cut);
    }
  }

  // Share of minutes with reads in which WinHouse answered at least once.
  const uptime = (from) => {
    const r = db.prepare('SELECT COUNT(*) AS n, SUM(ok > 0) AS up FROM winhouse_health WHERE minute >= ?').get(Math.floor(from / MIN));
    return r.n ? Math.round((r.up / r.n) * 1000) / 10 : null;
  };

  function summary() {
    const t = now();
    const recent = db.prepare('SELECT SUM(ok) AS ok, SUM(fail) AS fail, SUM(ms) AS ms FROM winhouse_health WHERE minute >= ?').get(Math.floor((t - 3 * MIN) / MIN));
    const hour = db.prepare('SELECT SUM(ok) AS ok, SUM(ms) AS ms FROM winhouse_health WHERE minute >= ?').get(Math.floor((t - 60 * MIN) / MIN));
    const open = openOutage.get();
    const state = open ? 'em_baixo' : !recent.ok && !recent.fail ? 'sem_leituras' : recent.fail ? 'instavel' : 'online';
    const since = open ? open.started_at : state === 'online' ? (db.prepare('SELECT MAX(ended_at) AS e FROM winhouse_outages').get().e ?? null) : null;
    // 24 h in 15-minute slots: ok (all good), partial (some failures), down (no good read), none (no reads).
    const slot = 15 * MIN;
    const first = Math.floor(t / slot) * slot - 95 * slot;
    const rows = db.prepare('SELECT minute, ok, fail FROM winhouse_health WHERE minute >= ?').all(Math.floor(first / MIN));
    const slots = Array.from({ length: 96 }, (_, i) => ({ at: new Date(first + i * slot).toISOString(), ok: 0, fail: 0 }));
    for (const r of rows) {
      const i = Math.floor((r.minute * MIN - first) / slot);
      if (slots[i]) { slots[i].ok += r.ok; slots[i].fail += r.fail; }
    }
    const timeline = slots.map((s) => ({ at: s.at, state: !s.ok && !s.fail ? 'none' : !s.ok ? 'down' : s.fail ? 'partial' : 'ok' }));
    const outages = db.prepare('SELECT * FROM winhouse_outages WHERE started_at >= ? OR ended_at IS NULL ORDER BY started_at DESC LIMIT 30')
      .all(t - 7 * 24 * 3_600_000)
      .map((o) => ({ startedAt: new Date(o.started_at).toISOString(), endedAt: o.ended_at ? new Date(o.ended_at).toISOString() : null,
        minutes: Math.max(1, Math.round(((o.ended_at ?? t) - o.started_at) / MIN)), error: o.error }));
    return {
      state, since: since ? new Date(since).toISOString() : null,
      lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null, lastFailAt: lastFailAt ? new Date(lastFailAt).toISOString() : null, lastError,
      avgMs: hour.ok ? Math.round(hour.ms / hour.ok) : null,
      uptime24h: uptime(t - 24 * 3_600_000), uptime7d: uptime(t - 7 * 24 * 3_600_000), timeline, outages,
    };
  }

  /** WinHouse is down now (an outage is open). */
  const down = () => !!openOutage.get();
  /** An outage overlapped this time span (ms): what was last seen in it may be out of date. */
  const downBetween = (from, to) => !!db.prepare('SELECT 1 FROM winhouse_outages WHERE started_at <= ? AND (ended_at IS NULL OR ended_at >= ?) LIMIT 1').get(to, from);

  return { note, summary, down, downBetween };
}
