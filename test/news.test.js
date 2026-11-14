import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsRss } from '../server/app.js';

test('Google News RSS parser: decodes entities, strips the source suffix, keeps only http links', () => {
  const xml = `<rss><channel>
    <item><title>Benfica vence o Porto 2-1 no cl&#225;ssico - A Bola</title><link>https://news.google.com/rss/articles/a1</link><pubDate>Thu, 13 Nov 2026 21:30:00 GMT</pubDate><source url="https://abola.pt">A Bola</source></item>
    <item><title>Refor&#231;o a caminho &amp; mais - Record</title><link>https://news.google.com/rss/articles/a2</link><pubDate>Thu, 13 Nov 2026 18:00:00 GMT</pubDate><source url="https://record.pt">Record</source></item>
    <item><title>Sem link válido</title><link>not-a-url</link></item>
  </channel></rss>`;
  const n = parseNewsRss(xml);
  assert.equal(n.length, 2, 'drops the item without a valid http link');
  assert.equal(n[0].title, 'Benfica vence o Porto 2-1 no clássico'); // entity decoded, " - A Bola" removed
  assert.equal(n[0].source, 'A Bola');
  assert.ok(n[0].link.startsWith('https://'));
  assert.equal(n[1].title, 'Reforço a caminho & mais');
  assert.deepEqual(parseNewsRss(''), []);
  assert.deepEqual(parseNewsRss('<rss></rss>'), []);
});
