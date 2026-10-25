// Copies of the database: one a day (after 04:00 Lisbon), kept next to it in a "backups" folder on the
// same volume, the last BACKUP_KEEP of them; the operator downloads one from the admin panel (to keep
// it somewhere else) or makes one now. A copy is a complete, consistent SQLite file (VACUUM INTO): it
// opens as the live database if it ever has to be put back.
import fs from 'node:fs';
import path from 'node:path';

const NAME = /^bet62-(\d{4}-\d{2}-\d{2})(?:-(\d{6}))?\.db$/;
const lisbon = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

export function createBackups(db, { dbPath, dir = null, keep = 3, hour = 4, now = () => new Date(), log = () => {} } = {}) {
  const enabled = !!dbPath && dbPath !== ':memory:';
  const folder = dir || (enabled ? path.join(path.dirname(path.resolve(dbPath)), 'backups') : null);
  const state = { last: null, lastError: null };

  function list() {
    if (!enabled || !fs.existsSync(folder)) return [];
    return fs.readdirSync(folder).filter((f) => NAME.test(f))
      .map((name) => { const st = fs.statSync(path.join(folder, name)); return { name, bytes: st.size, at: st.mtime.toISOString() }; })
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  /** Makes a copy now (`manual`: with the time in its name, besides the day's): its { name, bytes }. */
  function run({ manual = false } = {}) {
    if (!enabled) throw new Error('Base de dados em memória: sem cópias.');
    fs.mkdirSync(folder, { recursive: true });
    const { day } = lisbon(now());
    const stamp = manual ? `-${now().toISOString().slice(11, 19).replaceAll(':', '')}` : '';
    const name = `bet62-${day}${stamp}.db`;
    const file = path.join(folder, name);
    const tmp = `${file}.part`;
    if (fs.existsSync(tmp)) fs.rmSync(tmp);
    try {
      db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
      fs.renameSync(tmp, file);
    } catch (err) {
      if (fs.existsSync(tmp)) fs.rmSync(tmp);
      state.lastError = { at: now().toISOString(), message: err.message };
      throw err;
    }
    // The oldest go once there are more than `keep` (manual copies count too).
    for (const old of list().slice(keep)) fs.rmSync(path.join(folder, old.name), { force: true });
    state.last = { at: now().toISOString(), name };
    state.lastError = null;
    log(`cópia da base de dados: ${name}`);
    return { name, bytes: fs.statSync(file).size };
  }

  /** The day's copy, once, after `hour` (Lisbon). */
  function tick() {
    if (!enabled) return null;
    const { day, hour: h } = lisbon(now());
    if (h < hour || list().some((b) => NAME.exec(b.name)?.[1] === day)) return null;
    try { return run(); } catch (err) { log(`cópia da base de dados falhou: ${err.message}`); return null; }
  }

  /** The file of a copy (by its exact name), or null. */
  const fileOf = (name) => (enabled && NAME.test(String(name)) && fs.existsSync(path.join(folder, name)) ? path.join(folder, name) : null);

  const start = (everyMs = 30 * 60_000) => { tick(); const t = setInterval(tick, everyMs); t.unref?.(); return () => clearInterval(t); };
  const status = () => ({ enabled, folder, keep, hour, list: list(), last: state.last, lastError: state.lastError });

  return { run, tick, list, fileOf, start, status };
}
