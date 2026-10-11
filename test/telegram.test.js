import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../server/db.js';
import { createTelegram, promoTier, teamFlag, formatTicket, formatPost } from '../server/telegram.js';

function setup() {
  const db = openDb(':memory:');
  const calls = [];
  let nextId = 100;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: url.split('/').pop(), body });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: nextId++ } }) };
  };
  const tg = createTelegram(db, { token: 'T', channel: '@bet62', publicUrl: 'https://bet62.plus/', fetchImpl });
  const at = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  const event = (competition, home, away, hours, prices = { 1: 210, X: 330, 2: 340 }) => {
    const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
      VALUES ('futebol', ?, ?, ?, ?, 'scheduled', ?, ?)`).run(competition, home, away, at(hours), at(0), at(0)).lastInsertRowid);
    for (const [code, x] of Object.entries(prices)) db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', ?, ?)").run(id, code, x);
    return id;
  };
  return { db, tg, calls, event };
}

test('telegram: which games are promoted, as Bet62Novo chose them', () => {
  assert.equal(promoTier('England. Premier League', 'Arsenal', 'Chelsea'), 'grande');
  assert.equal(promoTier('Spain. LaLiga'), 'grande');
  assert.equal(promoTier('Austria. Bundesliga'), 'média');           // not Germany's
  assert.equal(promoTier('Russia. Premier League'), 'média');        // not England's
  assert.equal(promoTier('Spain. Primera RFEF. Group 1'), null);     // lower tier
  assert.equal(promoTier('England. Premier League. Women'), null);
  assert.equal(promoTier('England. Premier League', 'Arsenal U21', 'Chelsea U21'), null);
  assert.equal(promoTier('Peru. Liga 1'), null);
  assert.equal(teamFlag('Portugal'), '🇵🇹');
  assert.equal(teamFlag('Sporting Portugal'), null);                 // exact names only
  assert.equal(formatPost({ type: 'promotion', title: 'Bónus <50%>', body: 'Texto' }), '<b>🎁 Bónus &lt;50%&gt;</b>\n\nTexto');
});

test('telegram: one game at a time, the soonest first; buttons open the game here', async () => {
  const { db, tg, calls, event } = setup();
  event('Peru. Liga 1', 'A', 'B', 1);
  const later = event('Spain. LaLiga', 'Sevilla', 'Betis', 5);
  const soon = event('England. Premier League', 'Arsenal', 'Chelsea', 2);
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, 'btts', 'Y', 175), (?, 'btts', 'N', 200)").run(soon, soon);
  const r = await tg.promoteNext();
  assert.deepEqual(r, { action: 'posted', eventId: soon, status: 'sent', error: undefined });
  const sent = calls[0];
  assert.equal(sent.method, 'sendMessage');
  assert.equal(sent.body.chat_id, '@bet62');
  assert.match(sent.body.text, /Arsenal x Chelsea/);
  assert.deepEqual(sent.body.reply_markup.inline_keyboard.map((row) => row.map((b) => b.text)),
    [['Arsenal 2.10', 'Empate 3.30', 'Chelsea 3.40'], ['✅ Sim 1.75', '❌ Não 2.00'], ['🔥 APOSTAR AGORA']]);
  assert.equal(sent.body.reply_markup.inline_keyboard[0][0].url, `https://bet62.plus/#/jogo/${soon}`);
  // The next one waits for the gap; forced from the admin it goes now.
  assert.deepEqual(await tg.promoteNext(), { action: 'skipped', reason: 'too_soon' });
  assert.equal((await tg.promoteNext({ force: true })).eventId, later);
  setSetting(db, 'telegram.auto', false);
  assert.equal(tg.status().auto, false);
});

test('telegram: the posted game is followed — AO VIVO, FINALIZADO without buttons, then deleted', async () => {
  const { db, tg, calls, event } = setup();
  const id = event('Italy. Serie A', 'Milan', 'Inter', 1);
  await tg.promoteNext();
  const msg = calls[0] && 100;
  db.prepare("UPDATE events SET status = 'live', home_score = 1, away_score = 0, clock = ? WHERE id = ?").run("23'", id);
  assert.equal((await tg.followGames()).edited, 1);
  assert.equal(calls[1].method, 'editMessageText');
  assert.equal(calls[1].body.message_id, msg);
  assert.match(calls[1].body.text, /AO VIVO[\s\S]*23'[\s\S]*1 - 0/);
  assert.equal(calls[1].body.reply_markup, undefined);               // the buttons stay
  assert.equal((await tg.followGames()).edited, 0);                  // nothing changed
  db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 1 WHERE id = ?").run(id);
  assert.equal((await tg.followGames()).finished, 1);
  assert.match(calls[2].body.text, /FINALIZADO[\s\S]*Milan 2 x 1 Inter/);
  assert.deepEqual(calls[2].body.reply_markup, { inline_keyboard: [] });
  assert.equal((await tg.followGames()).deleted, 0);                 // kept 10 minutes
  assert.equal((await tg.followGames({ now: Date.now() + 11 * 60_000 })).deleted, 1);
  assert.equal(calls[3].method, 'deleteMessage');
  assert.equal(db.prepare('SELECT status FROM telegram_promos').get().status, 'deleted');
});

test('telegram: admin posts are kept with their outcome; not configured, nothing is sent', async () => {
  const { db, tg, calls } = setup();
  const r = await tg.publish({ type: 'custom', title: 'Olá', body: 'Bem-vindos', ctaText: 'Abrir', ctaUrl: 'https://bet62.plus', by: 'admin@x' });
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0].body.reply_markup, { inline_keyboard: [[{ text: 'Abrir', url: 'https://bet62.plus' }]] });
  assert.equal(db.prepare('SELECT status, created_by FROM telegram_posts').get().status, 'sent');
  const off = createTelegram(db, {});
  assert.equal(off.enabled, false);
  assert.equal((await off.promoteNext()).reason, 'telegram_not_configured');
  assert.equal(formatTicket({ home: 'A', away: 'B', competition: 'C', start_time: new Date().toISOString() }, {}, 'u').keyboard.length, 1);
});
