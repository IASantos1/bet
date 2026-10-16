// Versioned module imports: each script asks for its siblings as ./x.js?v=… (the hash of their own
// content, imports included), so the browser keeps them for a year and a deploy changes the URLs.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.\/([\w./-]+\.js)\2/g;

export function createAssets(root) {
  const base = path.resolve(root);
  const memo = new Map(); // rel → { body: Buffer, v }
  const hash = (buf) => createHash('sha1').update(buf).digest('base64url').slice(0, 12);

  /** A script with its relative imports versioned (theirs first, so a change anywhere below shows up here). */
  function file(rel, seen = new Set()) {
    if (memo.has(rel)) return memo.get(rel);
    const full = path.resolve(base, rel);
    if (!full.startsWith(base + path.sep)) return null;
    let raw;
    try { raw = fs.readFileSync(full); } catch { return null; }
    let body = raw;
    if (rel.endsWith('.js') && !seen.has(rel)) {
      seen.add(rel);
      const dir = path.posix.dirname(rel);
      const text = raw.toString('utf8').replace(IMPORT_RE, (m, lead, q, spec) => {
        const dep = file(path.posix.normalize(path.posix.join(dir, spec)), seen);
        return dep ? `${lead}${q}./${spec}?v=${dep.v}${q}` : m;
      });
      body = Buffer.from(text);
    }
    const out = { body, v: hash(body) };
    memo.set(rel, out);
    return out;
  }

  /** The direct static imports of a script (to announce with modulepreload). */
  function staticDeps(rel) {
    const raw = fs.readFileSync(path.resolve(base, rel), 'utf8');
    const dir = path.posix.dirname(rel);
    return [...raw.matchAll(/\bfrom\s*(['"])\.\/([\w./-]+\.js)\1/g)].map((m) => path.posix.normalize(path.posix.join(dir, m[2])));
  }

  /** <link rel="modulepreload"> for a script's static imports, at the URLs it will ask for. */
  const preloads = (rel) => staticDeps(rel).flatMap((dep) => {
    const f = file(dep);
    return f ? [`<link rel="modulepreload" href="${dep}?v=${f.v}" />`] : [];
  });

  return { file, preloads };
}
