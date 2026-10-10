// Faster pages: answers compressed (brotli, else gzip) and the site's own scripts and styles served
// from memory, compressed once, with an ETag, and kept by the browser for a year when the URL
// carries the version (app.js?v=…; a deploy changes the version, so nothing old is ever run).

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const COMPRESSIBLE = /^(application\/(json|javascript|manifest\+json)|text\/|image\/svg\+xml)/i;

/** The encoding this request takes: 'br', 'gzip' or null. */
export function pickEncoding(acceptEncoding) {
  const a = String(acceptEncoding || '').toLowerCase();
  if (/(^|[\s,])br(\s*;\s*q=(?!0(\.0+)?\b)[\d.]+)?\s*(,|$)/.test(a)) return 'br';
  if (/(^|[\s,])gzip(\s*;\s*q=(?!0(\.0+)?\b)[\d.]+)?\s*(,|$)/.test(a)) return 'gzip';
  return null;
}

const encode = (buf, enc, quality = 4) => (enc === 'br'
  ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
  : zlib.gzipSync(buf, { level: quality >= 9 ? 9 : 6 }));

/**
 * Compresses whole answers (res.json / res.send: the API, the pages) of at least `threshold` bytes.
 * Streams (live events, files sent in pieces) pass untouched.
 */
export function compression({ threshold = 1024 } = {}) {
  return (req, res, next) => {
    const enc = req.method === 'HEAD' ? null : pickEncoding(req.headers['accept-encoding']);
    const end = res.end;
    res.end = function compressedEnd(chunk, encoding, cb) {
      if (chunk && typeof chunk !== 'function' && !res.headersSent && !res.getHeader('Content-Encoding')) {
        const type = String(res.getHeader('Content-Type') || '');
        if (COMPRESSIBLE.test(type)) {
          res.setHeader('Vary', [res.getHeader('Vary'), 'Accept-Encoding'].filter(Boolean).join(', '));
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
          if (enc && res.statusCode === 200 && buf.length >= threshold) {
            const out = encode(buf, enc);
            res.setHeader('Content-Encoding', enc);
            res.setHeader('Content-Length', out.length);
            return end.call(this, out, typeof encoding === 'function' ? encoding : cb);
          }
        }
      }
      return end.apply(this, arguments);
    };
    next();
  };
}

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8' };

/**
 * The site's text files (scripts, styles, icons in SVG) from memory: read and compressed once
 * (brotli at a high level, gzip), answered with an ETag (304 when unchanged). With ?v= in the URL
 * the browser keeps them a year; without, it checks each time (a cheap 304).
 */
export function staticText(root, { maxBytes = 4 * 1024 * 1024 } = {}) {
  const base = path.resolve(root);
  const cache = new Map(); // file → { etag, type, raw, br?, gzip? }
  const load = (file) => {
    let c = cache.get(file);
    if (c) return c;
    const raw = fs.readFileSync(file);
    if (raw.length > maxBytes) return null;
    c = { etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`, type: TYPES[path.extname(file)], raw };
    cache.set(file, c);
    return c;
  };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const ext = path.extname(req.path).toLowerCase();
    if (!TYPES[ext] || ext === '.html') return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    const file = path.resolve(base, `.${rel}`);
    if (!file.startsWith(base + path.sep)) return next();
    let c;
    try {
      if (!fs.statSync(file).isFile()) return next();
      c = load(file);
    } catch { return next(); }
    if (!c) return next();
    res.setHeader('Content-Type', c.type);
    res.setHeader('ETag', c.etag);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.headers['if-none-match'] === c.etag) { res.statusCode = 304; return res.end(); }
    const enc = c.raw.length >= 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
    let body = c.raw;
    if (enc) {
      c[enc] ||= encode(c.raw, enc, 9);
      body = c[enc];
      res.setHeader('Content-Encoding', enc);
    }
    res.setHeader('Content-Length', body.length);
    if (req.method === 'HEAD') return res.end();
    // Sent whole: the compression of whole answers must not compress it again.
    res.end(body);
  };
}
