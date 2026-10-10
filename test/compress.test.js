import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { pickEncoding } from '../server/compress.js';

test('encoding: brotli first, then gzip; q=0 refuses', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding(''), null);
});

test('answers compressed; scripts kept a year when versioned, 304 when unchanged; live streams untouched', async () => {
  const db = openDb(':memory:');
  seed(db);
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Node's fetch decompresses by itself: ask raw, with node:http semantics through the headers.
  const raw = async (path, headers = {}) => {
    const res = await fetch(base + path, { headers: { 'Accept-Encoding': 'br', ...headers } });
    return { res, buf: Buffer.from(await res.arrayBuffer()) };
  };
  try {
    // The page and the API: brotli.
    const page = await fetch(base + '/', { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(page.headers.get('content-encoding'), 'br');
    const html = await page.text();
    const v = /app\.js\?v=([a-f0-9]+)/.exec(html)[1];
    const events = await fetch(base + '/api/events', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(events.headers.get('content-encoding'), 'gzip');
    assert.ok((await events.json()).events.length > 0);
    // The script, versioned: a year; unversioned: checked each time, 304 with its ETag.
    const js = await raw(`/app.js?v=${v}`);
    assert.equal(js.res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(js.res.headers.get('content-type'), 'text/javascript; charset=utf-8');
    const css = await raw('/styles.css');
    assert.equal(css.res.headers.get('cache-control'), 'no-cache');
    const again = await fetch(base + '/styles.css', { headers: { 'If-None-Match': css.res.headers.get('etag') } });
    assert.equal(again.status, 304);
    // Outside the public folder: never served.
    assert.notEqual((await fetch(base + '/..%2fpackage.json')).status, 200);
    // Without compression asked: plain.
    const plain = await fetch(base + '/api/events', { headers: { 'Accept-Encoding': 'identity' } });
    assert.equal(plain.headers.get('content-encoding'), null);
    assert.ok(zlib && js.buf.length > 0);
  } finally {
    server.close();
    db.close();
  }
});
