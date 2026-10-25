import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createBackups } from '../server/backups.js';

test('database copies: one a day after 04:00 Lisbon, a manual one, the last N kept, each a full database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bet62-'));
  const dbPath = path.join(dir, 'classicbet.db');
  const db = openDb(dbPath);
  db.prepare("INSERT INTO users (email, name, birthdate, password_hash, role, created_at) VALUES ('a@b.pt', 'A', '1990-01-01', 'x', 'user', '2026-01-01')").run();
  let t = new Date('2026-10-25T02:00:00Z'); // 03:00 Lisbon: too early
  const b = createBackups(db, { dbPath, keep: 2, now: () => t });
  assert.equal(b.tick(), null);
  t = new Date('2026-10-25T05:00:00Z');
  assert.equal(b.tick().name, 'bet62-2026-10-25.db');
  assert.equal(b.tick(), null); // once a day
  const copy = new DatabaseSync(path.join(dir, 'backups', 'bet62-2026-10-25.db'));
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('a@b.pt').n, 1);
  copy.close();
  t = new Date('2026-10-26T05:00:00Z'); b.tick();
  t = new Date('2026-10-27T05:00:00Z'); b.tick();
  assert.deepEqual(b.list().map((x) => x.name), ['bet62-2026-10-27.db', 'bet62-2026-10-26.db']); // the oldest gone
  assert.match(b.run({ manual: true }).name, /^bet62-2026-10-27-\d{6}\.db$/);
  assert.equal(b.fileOf('../classicbet.db'), null);
  assert.ok(b.fileOf('bet62-2026-10-27.db'));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
