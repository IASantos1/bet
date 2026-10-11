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
    [['1 · 2.10', 'X · 3.30', '2 · 3.40'], ['✅ Sim 1.75', '❌ Não 2.00'], ['🔥 APOSTAR AGORA']]);
  assert.match(sent.body.text, /1 = Arsenal · X = Empate · 2 = Chelsea/);
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

test('suggested tickets: favourites in the odds range, from different games, posted with stake and return; no bet is placed', async () => {
  const { db, tg, calls, event } = setup();
  setSetting(db, 'telegram.tickets', { on: true, times: ['00:00'], legs: 3, minOdds: 1.4, maxOdds: 1.7, stake: 10, hours: 12 });
  const a = event('England. Premier League', 'Arsenal', 'Chelsea', 2, { 1: 150, X: 400, 2: 600 });
  const b = event('Spain. LaLiga', 'Real Madrid', 'Getafe', 3, { 1: 160, X: 380, 2: 550 });
  const c = event('Italy. Serie A', 'Lecce', 'Inter', 4, { 1: 500, X: 380, 2: 155 });
  event('Germany. Bundesliga', 'Bayern', 'Bochum', 5, { 1: 110, X: 900, 2: 2000 }); // too short a price
  event('France. Ligue 1', 'Lyon', 'Nice', 0.2, { 1: 150, X: 400, 2: 600 });           // starts too soon
  const r = await tg.postTicket({ rng: () => 0 });
  assert.equal(r.status, 'sent');
  const msg = calls.at(-1).body;
  assert.match(msg.text, /BILHETE DO DIA[\s\S]*Arsenal x Chelsea[\s\S]*Vitória Arsenal — <b>1.50<\/b>[\s\S]*Vitória Inter — <b>1.55<\/b>/);
  assert.match(msg.text, /Odd total: <b>3.72<\/b>[\s\S]*Aposta: 10,00 € ➜ 💰 Retorno: <b>37,20 €<\/b>/);
  const t = db.prepare('SELECT * FROM telegram_tickets').get();
  const ids = JSON.parse(t.legs).map((l) => l.selectionId);
  assert.equal(msg.reply_markup.inline_keyboard[0][0].url, `https://bet62.plus/#/bilhete/${ids.join('-')}`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bets').get().n, 0);
  // The same games are not used again the same day.
  assert.equal((await tg.postTicket()).reason, 'not_enough_games');
  // Followed: one game won, then one lost → the ticket is lost and marked.
  db.prepare("UPDATE events SET status = 'finished', result = '1' WHERE id = ?").run(a);
  assert.equal((await tg.followTickets()).edited, 1);
  assert.match(calls.at(-1).body.text, /✅ ⚽ <b>Arsenal x Chelsea/);
  assert.deepEqual(calls.at(-1).body.reply_markup, { inline_keyboard: [] }); // a game started: the button goes
  db.prepare("UPDATE events SET status = 'finished', result = 'X' WHERE id = ?").run(b);
  await tg.followTickets();
  assert.match(calls.at(-1).body.text, /❌ ⚽ <b>Real Madrid x Getafe[\s\S]*Bilhete perdido/);
  assert.equal(db.prepare('SELECT status FROM telegram_tickets WHERE id = ?').get(t.id).status, 'lost');
  assert.equal((await tg.followTickets()).edited, 0);
  void c;
});

test('suggested tickets: posted once per configured time, and a won ticket shows what it paid', async () => {
  const { db, tg, calls, event } = setup();
  const x = event('England. Premier League', 'A1', 'B1', 2, { 1: 150, X: 400, 2: 600 });
  const y = event('Spain. LaLiga', 'A2', 'B2', 3, { 1: 160, X: 380, 2: 550 });
  setSetting(db, 'telegram.tickets', { on: true, times: ['00:00', '23:59'], legs: 2, minOdds: 1.4, maxOdds: 1.7, stake: 20, hours: 12 });
  const { lisbonNow } = await import('../server/telegram.js');
  const now = Date.now();
  const { time } = lisbonNow(now);
  setSetting(db, 'telegram.tickets', { on: true, times: [time], legs: 2, minOdds: 1.4, maxOdds: 1.7, stake: 20, hours: 12 });
  assert.equal((await tg.ticketsDue({ now })).status, 'sent');
  assert.equal((await tg.ticketsDue({ now })).reason, 'not_time');      // that slot is done
  setSetting(db, 'telegram.tickets', { on: false, times: [time] });
  assert.equal((await tg.ticketsDue({ now })).reason, 'tickets_off');
  db.prepare("UPDATE events SET status = 'finished', result = '1' WHERE id IN (?, ?)").run(x, y);
  await tg.followTickets();
  assert.match(calls.at(-1).body.text, /BILHETE GANHO!<\/b> 48,00 €/);  // 20 € × 1.50 × 1.60
});

test('telegram: a game listed twice (another id, another time) is not posted again, and the post follows the copy in play', async () => {
  const { db, tg, calls, event } = setup();
  const posted = event('Italy. Serie B', 'Modena', 'Hellas Verona', 0.6);
  await tg.promoteNext();
  // The feed lists it again, 1 h later, while the first row goes on as scheduled and the copy plays.
  const copy = event('Italy. Serie B', 'MODENA', 'Hellas Verona', 1.6);
  assert.equal((await tg.promoteNext({ force: true })).reason, 'no_candidates'); // already posted under the other id
  db.prepare("UPDATE events SET status = 'live', home_score = 1, away_score = 0, clock = ? WHERE id = ?").run("22'", copy);
  assert.equal((await tg.followGames()).edited, 1);
  assert.match(calls.at(-1).body.text, /AO VIVO[\s\S]*22'[\s\S]*1 - 0/);
  db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 0 WHERE id = ?").run(copy);
  assert.equal((await tg.followGames()).finished, 1);
  assert.match(calls.at(-1).body.text, /Modena 2 x 0 Hellas Verona/);
  void posted;
});
