// Sanctions screening with the public lists (free): the European Union's consolidated financial
// sanctions list and the United Nations Security Council's consolidated list, refreshed once a day,
// and optionally the United Kingdom's (SANCTIONS_UK_URL, the OFSI consolidated CSV). Only people
// are kept (not companies), with every name they are listed under and their dates of birth.
//
// Each player is compared at sign-up, when they send identity documents, and after every refresh:
// a listed name whose words are all in the player's name (or the other way round, two words at
// least) is a possible match; with the same date of birth a strong one; a different year of birth
// rules it out. A match blocks withdrawals and appears in Admin → Risco until the operator decides
// (false positive, or confirmed: the account is blocked).
//
// Politically exposed persons have no free list for commercial use: players declare it at sign-up
// (users.pep_declared) and the declaration shows as an alert for enhanced due diligence.

import { nowIso, tx } from './db.js';

export const SOURCES = {
  eu: { label: 'União Europeia', url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw', parse: (t) => parseEuCsv(t) },
  un: { label: 'Nações Unidas', url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', parse: (t) => parseUnXml(t) },
  uk: { label: 'Reino Unido', url: '', parse: (t) => parseUkCsv(t) },
};

/** "José  Álvarez-Ruiz" → ['jose', 'alvarez', 'ruiz']. */
export const nameWords = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 1);

/** One CSV line → its fields (quotes and doubled quotes handled). */
function csvLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
const isoDate = (v) => {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return m[1] === '00' || m[2] === '00' ? m[3] : `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})$/.exec(s);
  return m ? m[1] : null;
};

/**
 * The EU list (CSV, ";"): one row per name / date of birth / … of each entity, grouped by
 * Entity_LogicalId; people only (Entity_SubjectType "person" / "P").
 */
export function parseEuCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const head = csvLine(lines.shift() || '', ';').map((h) => h.trim().replace(/^﻿/, ''));
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const [id, type, whole, birth] = [col('Entity_LogicalId'), col('Entity_SubjectType'), col('NameAlias_WholeName'), col('BirthDate_BirthDate')];
  if (id < 0 || whole < 0) throw new Error('lista UE: colunas não encontradas');
  const people = new Map();
  for (const line of lines) {
    const f = csvLine(line, ';');
    if (type >= 0 && !/^(person|p)$/i.test(String(f[type] || '').trim())) continue;
    const p = people.get(f[id]) || { ref: `EU-${f[id]}`, names: new Set(), births: new Set() };
    if (f[whole]?.trim()) p.names.add(f[whole].trim());
    const b = birth >= 0 ? isoDate(f[birth]) : null;
    if (b) p.births.add(b);
    people.set(f[id], p);
  }
  return [...people.values()];
}

/** The UN list (XML): each INDIVIDUAL with its names, aliases and dates (or years) of birth. */
export function parseUnXml(text) {
  const tag = (block, name) => [...block.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const out = [];
  for (const m of String(text).matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g)) {
    const b = m[1];
    const ref = tag(b, 'REFERENCE_NUMBER')[0] || tag(b, 'DATAID')[0] || String(out.length);
    const full = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((n) => tag(b, n)[0]).filter(Boolean).join(' ');
    const names = new Set([full, ...tag(b, 'ALIAS_NAME')].filter(Boolean));
    const births = new Set();
    for (const d of b.matchAll(/<INDIVIDUAL_DATE_OF_BIRTH>([\s\S]*?)<\/INDIVIDUAL_DATE_OF_BIRTH>/g)) {
      const date = tag(d[1], 'DATE')[0] || tag(d[1], 'YEAR')[0];
      if (isoDate(date)) births.add(isoDate(date));
    }
    out.push({ ref: `UN-${ref}`, names, births });
  }
  return out;
}

/** The UK OFSI consolidated list (CSV, ","; a "Last Updated" line, then the header). */
export function parseUkCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  while (lines.length && !/Name 6/i.test(lines[0])) lines.shift();
  const head = csvLine(lines.shift() || '', ',').map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const parts = ['Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5', 'Name 6'].map(col);
  const [dob, type, group] = [col('DOB'), col('Group Type'), col('Group ID')];
  if (parts[5] < 0) throw new Error('lista UK: colunas não encontradas');
  const people = new Map();
  for (const line of lines) {
    const f = csvLine(line, ',');
    if (type >= 0 && !/individual/i.test(f[type] || '')) continue;
    const key = group >= 0 ? f[group] : String(people.size);
    const p = people.get(key) || { ref: `UK-${key}`, names: new Set(), births: new Set() };
    const name = parts.filter((i) => i >= 0).map((i) => (f[i] || '').trim()).filter(Boolean).join(' ');
    if (name) p.names.add(name);
    const b = dob >= 0 ? isoDate(f[dob]) : null;
    if (b) p.births.add(b);
    people.set(key, p);
  }
  return [...people.values()];
}

/** Replaces one source's people (names already reduced to words) in the table. */
export function storeList(db, source, people) {
  tx(db, () => {
    db.prepare('DELETE FROM sanctions_list WHERE source = ?').run(source);
    const ins = db.prepare('INSERT INTO sanctions_list (source, ref, name, words, births) VALUES (?, ?, ?, ?, ?)');
    let n = 0;
    for (const p of people) {
      const births = [...p.births].join(',') || null;
      for (const name of p.names) {
        const w = nameWords(name);
        if (w.length < 2) continue; // one word alone would match half the players
        ins.run(source, p.ref, name.slice(0, 200), w.join(' '), births);
        n += 1;
      }
    }
    db.prepare(`INSERT INTO sanctions_sources (source, people, names, updated_at, error) VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(source) DO UPDATE SET people = excluded.people, names = excluded.names, updated_at = excluded.updated_at, error = NULL`).run(source, people.length, n, nowIso());
  });
}

/** Whether a listed name matches a player: 'strong' (same date of birth), 'possible', or null. */
export function matchStrength(playerName, playerBirth, listedWords, listedBirths) {
  const p = new Set(nameWords(playerName));
  const l = String(listedWords).split(' ').filter(Boolean);
  if (p.size < 2 || l.length < 2) return null;
  const common = l.filter((w) => p.has(w)).length;
  if (common < 2 || (common < l.length && common < p.size)) return null; // all of one name in the other
  const births = String(listedBirths || '').split(',').filter(Boolean);
  if (!playerBirth || !births.length) return 'possible';
  if (births.some((b) => b === playerBirth)) return 'strong';
  if (births.some((b) => String(playerBirth).startsWith(b.slice(0, 4)))) return 'possible'; // same year (or year only)
  return null;
}

/**
 * Compares players (one, or all) with the lists; a new match is kept (once per listed person) and
 * marks the player 'hit' until decided. Returns the number of new matches.
 */
export function screen(db, userId = null) {
  const users = userId ? db.prepare('SELECT id, name, birthdate FROM users WHERE id = ?').all(userId)
    : db.prepare("SELECT id, name, birthdate FROM users WHERE role = 'user'").all();
  // Candidates by word: the listed names that share a word with the player.
  const byWord = db.prepare("SELECT source, ref, name, words, births FROM sanctions_list WHERE (' ' || words || ' ') LIKE ?");
  const seen = db.prepare('SELECT 1 FROM sanctions_hits WHERE user_id = ? AND source = ? AND ref = ?');
  const add = db.prepare("INSERT INTO sanctions_hits (user_id, source, ref, listed_name, listed_births, strength, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)");
  let found = 0;
  for (const u of users) {
    const words = nameWords(u.name);
    if (words.length < 2) continue;
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    for (const l of byWord.all(`% ${longest} %`)) {
      const strength = matchStrength(u.name, u.birthdate, l.words, l.births);
      if (!strength || seen.get(u.id, l.source, l.ref)) continue;
      add.run(u.id, l.source, l.ref, l.name, l.births, strength, nowIso());
      db.prepare("UPDATE users SET sanctions_status = 'hit' WHERE id = ?").run(u.id);
      found += 1;
    }
  }
  return found;
}

/** The operator decides a match: a false positive (cleared) or confirmed (the account blocked). */
export function decideHit(db, hitId, decision, adminId) {
  const h = db.prepare('SELECT * FROM sanctions_hits WHERE id = ?').get(Number(hitId));
  if (!h) throw Object.assign(new Error('Correspondência não encontrada.'), { status: 404 });
  if (!['cleared', 'confirmed'].includes(decision)) throw Object.assign(new Error('Decisão inválida.'), { status: 400 });
  db.prepare('UPDATE sanctions_hits SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?').run(decision, adminId, nowIso(), h.id);
  if (decision === 'confirmed') db.prepare("UPDATE users SET risk_profile = 'blocked', risk_note = ? WHERE id = ?").run(`Sanções: ${h.listed_name} (${h.ref})`, h.user_id);
  const open = db.prepare("SELECT COUNT(*) AS n FROM sanctions_hits WHERE user_id = ? AND status = 'open'").get(h.user_id).n;
  const confirmed = db.prepare("SELECT COUNT(*) AS n FROM sanctions_hits WHERE user_id = ? AND status = 'confirmed'").get(h.user_id).n;
  db.prepare('UPDATE users SET sanctions_status = ? WHERE id = ?').run(confirmed ? 'confirmed' : open ? 'hit' : 'clear', h.user_id);
  return { id: h.id, status: decision };
}

/** The lists' state and the matches waiting for a decision (Admin → Risco). */
export function sanctionsView(db) {
  const sources = Object.entries(SOURCES).map(([id, s]) => {
    const r = db.prepare('SELECT * FROM sanctions_sources WHERE source = ?').get(id);
    return { id, label: s.label, people: r?.people || 0, names: r?.names || 0, updatedAt: r?.updated_at || null, error: r?.error || null };
  });
  const hits = db.prepare(`SELECT h.*, u.name, u.email, u.birthdate FROM sanctions_hits h JOIN users u ON u.id = h.user_id
    WHERE h.status = 'open' ORDER BY h.strength = 'strong' DESC, h.id DESC LIMIT 200`).all()
    .map((h) => ({ id: h.id, userId: h.user_id, name: h.name, email: h.email, birthdate: h.birthdate, source: SOURCES[h.source]?.label || h.source,
      ref: h.ref, listedName: h.listed_name, listedBirths: h.listed_births, strength: h.strength, at: h.created_at }));
  return { sources, hits };
}

/** Downloads the lists (each on its own: one failing leaves the others) and screens every player. */
export function createSanctions(db, { urls = {}, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  async function refresh() {
    for (const [id, s] of Object.entries(SOURCES)) {
      const url = urls[id] ?? s.url;
      if (!url) continue;
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const people = s.parse(await res.text());
        if (!people.length) throw new Error('lista vazia');
        storeList(db, id, people);
        log(`sanções ${id}: ${people.length} pessoas`);
      } catch (err) {
        db.prepare(`INSERT INTO sanctions_sources (source, people, names, updated_at, error) VALUES (?, 0, 0, NULL, ?)
          ON CONFLICT(source) DO UPDATE SET error = excluded.error`).run(id, String(err.message).slice(0, 200));
        log(`sanções ${id}: ${err.message}`);
      }
    }
    const found = screen(db);
    if (found) log(`sanções: ${found} nova(s) correspondência(s)`);
    return found;
  }
  function start(everyMs = 24 * 3600_000) {
    const run = () => refresh().catch((err) => log(`sanções: ${err.message}`));
    const first = setTimeout(run, 60_000);
    const timer = setInterval(run, everyMs);
    first.unref?.();
    timer.unref?.();
    return () => { clearTimeout(first); clearInterval(timer); };
  }
  return { refresh, start };
}
