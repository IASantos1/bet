// Telegram channel (brought from Bet62Novo): the bot posts to TELEGRAM_CHANNEL_ID.
//
//   - Admin posts: a title and text (news, promotion, ticket), with an optional button.
//   - Automatic posts: one football game of the big leagues at a time (at least `gapMinutes`
//     apart), the soonest to start first, with its 1X2 and both-teams-to-score prices as buttons
//     that open the game here. The same message then follows the game: AO VIVO with the score and
//     minute while it is played (edited at most every `editSeconds`), FINALIZADO with the final
//     score and no buttons at the end, and it is deleted `deleteMinutes` later.
//   - Suggested tickets: at the times set in the admin, a multiple of the day's favourites with a
//     stake and what it would return — posted only, no bet is placed. Its button puts the picks
//     into the slip on the site; the message then marks each game ✅ / ❌ and the outcome.
//
// TELEGRAM_BOT_TOKEN is the bot made with @BotFather, added to the channel as an administrator
// that can post; TELEGRAM_CHANNEL_ID is "@channel" or the "-100…" id of a private one.
import { nowIso, getSetting } from './db.js';

const API = 'https://api.telegram.org';

/** Telegram's HTML only needs these three escaped. */
export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** The same game listed twice (another id, another time): its teams, compared loosely. */
const teamsKey = (home, away) => `${fold(home).replace(/[^a-z0-9]/g, '')}|${fold(away).replace(/[^a-z0-9]/g, '')}`;

// ---------- which games are promoted (Bet62Novo's list) ----------

// Youth, women's, amateur and reserve sides never qualify (league or team names).
const EXCLUDED = /\bsub-?\d{1,2}\b|\bu-?\d{2}\b|feminin[oa]|mulheres|\bwomen\b|amador|amateur|\bii\b|\breservas?\b/i;
// A lower tier whose name also carries an allowed keyword ("Spain. Primera RFEF. Group 1").
const SUB_TIER = /\brfef\b|\bgrupo\s*\d+\b|\bgroup\s*\d+\b|expansion|primera\s*[bc]\b|primeira\s*[bc]\b|\bb\s*nacional\b|\bc\s*metropolitana\b/i;
// Player markets listed as games ("Team vs Player").
const PLAYER_PROP = /\b(team|equipe|time)\s*(vs\.?|x)\s*(player|jogador)\b/i;

// [countries (any, in the league name), league keywords, tier]
const LEAGUES = [
  [['inglaterra', 'england'], ['premier league'], 'grande'],
  [['espanha', 'spain'], ['la liga', 'laliga'], 'grande'],
  [['italia', 'italy'], ['serie a'], 'grande'],
  [['alemanha', 'germany'], ['bundesliga'], 'grande'],
  [['franca', 'france'], ['ligue 1'], 'grande'],
  [['holanda', 'netherlands'], ['eredivisie'], 'grande'],
  [['portugal'], ['primeira liga', 'liga portugal'], 'grande'],
  [['brasil', 'brazil'], ['serie a', 'brasileirao', 'brasileiro'], 'grande'],
  [['argentina'], ['primeira divisao', 'primera division', 'liga profesional'], 'grande'],
  [[], ['uefa champions league', 'uefa europa league'], 'grande'],
  [[], ['liga das nacoes da uefa', 'uefa nations league'], 'grande'],
  [[], ['liga das nacoes da concacaf', 'concacaf nations league'], 'grande'],
  [['inglaterra', 'england'], ['championship'], 'média'],
  [['espanha', 'spain'], ['segunda divisao', 'segunda division'], 'média'],
  [['italia', 'italy'], ['serie b'], 'média'],
  [['alemanha', 'germany'], ['2. bundesliga'], 'média'],
  [['franca', 'france'], ['ligue 2'], 'média'],
  [['belgica', 'belgium'], ['pro league', 'jupiler'], 'média'],
  [['turquia', 'turkey'], ['super lig'], 'média'],
  [['escocia', 'scotland'], ['premiership'], 'média'],
  [['mexico'], ['liga mx'], 'média'],
  [['estados unidos', 'united states', 'usa'], ['mls'], 'média'],
  [['russia'], ['premier league'], 'média'],
  [['grecia', 'greece'], ['super league'], 'média'],
  [['dinamarca', 'denmark'], ['superliga'], 'média'],
  [['austria'], ['bundesliga'], 'média'],
  [['suica', 'switzerland'], ['super league'], 'média'],
  [['japao', 'japan'], ['j1 league', 'j-league', 'j.league'], 'média'],
  [['arabia saudita', 'saudi arabia'], ['saudi pro league', 'pro league'], 'média'],
  [[], ['conference league', 'libertadores', 'sudamericana'], 'média'],
];

/** 'grande' / 'média' when a football game of this competition is promoted, else null. */
export function promoTier(competition, home = '', away = '') {
  const league = fold(competition);
  if (EXCLUDED.test(`${competition} ${home} ${away}`) || PLAYER_PROP.test(competition) || SUB_TIER.test(competition)) return null;
  // The first match wins, so "Austria. Bundesliga" is média (not Germany's).
  for (const [countries, keywords, tier] of LEAGUES) {
    if (countries.length && !countries.some((c) => league.includes(c))) continue;
    if (keywords.some((k) => league.includes(k))) return tier;
  }
  return null;
}

// ---------- national-team flags (exact names only: a club never gets one) ----------

const FLAGS = Object.fromEntries(Object.entries({
  'albania': '🇦🇱', 'albânia': '🇦🇱',
  'andorra': '🇦🇩',
  'armenia': '🇦🇲', 'arménia': '🇦🇲', 'armênia': '🇦🇲',
  'austria': '🇦🇹', 'áustria': '🇦🇹',
  'azerbaijan': '🇦🇿', 'azerbaijão': '🇦🇿',
  'belarus': '🇧🇾', 'bielorrússia': '🇧🇾',
  'belgium': '🇧🇪', 'bélgica': '🇧🇪',
  'bosnia and herzegovina': '🇧🇦', 'bósnia e herzegovina': '🇧🇦', 'bosnia-herzegovina': '🇧🇦',
  'bulgaria': '🇧🇬', 'bulgária': '🇧🇬',
  'croatia': '🇭🇷', 'croácia': '🇭🇷',
  'cyprus': '🇨🇾', 'chipre': '🇨🇾',
  'czech republic': '🇨🇿', 'chequia': '🇨🇿', 'república checa': '🇨🇿',
  'denmark': '🇩🇰', 'dinamarca': '🇩🇰',
  'england': '🏴', 'inglaterra': '🏴', 'scotland': '🏴', 'escócia': '🏴', 'wales': '🏴', 'gales': '🏴',
  'estonia': '🇪🇪', 'estónia': '🇪🇪', 'estônia': '🇪🇪',
  'faroe islands': '🇫🇴', 'ilhas faroe': '🇫🇴',
  'finland': '🇫🇮', 'finlândia': '🇫🇮',
  'france': '🇫🇷', 'frança': '🇫🇷',
  'georgia': '🇬🇪', 'geórgia': '🇬🇪',
  'germany': '🇩🇪', 'alemanha': '🇩🇪',
  'gibraltar': '🇬🇮',
  'greece': '🇬🇷', 'grécia': '🇬🇷',
  'hungary': '🇭🇺', 'hungria': '🇭🇺',
  'iceland': '🇮🇸', 'islândia': '🇮🇸',
  'ireland': '🇮🇪', 'irlanda': '🇮🇪',
  'israel': '🇮🇱',
  'italy': '🇮🇹', 'itália': '🇮🇹',
  'kazakhstan': '🇰🇿', 'cazaquistão': '🇰🇿',
  'kosovo': '🇽🇰',
  'latvia': '🇱🇻', 'letónia': '🇱🇻', 'letônia': '🇱🇻',
  'liechtenstein': '🇱🇮',
  'lithuania': '🇱🇹', 'lituânia': '🇱🇹',
  'luxembourg': '🇱🇺', 'luxemburgo': '🇱🇺',
  'malta': '🇲🇹',
  'moldova': '🇲🇩',
  'monaco': '🇲🇨', 'mónaco': '🇲🇨', 'mônaco': '🇲🇨',
  'montenegro': '🇲🇪',
  'netherlands': '🇳🇱', 'holanda': '🇳🇱', 'países baixos': '🇳🇱',
  'north macedonia': '🇲🇰', 'macedónia do norte': '🇲🇰', 'macedônia do norte': '🇲🇰',
  'northern ireland': '🇬🇧', 'irlanda do norte': '🇬🇧',
  'norway': '🇳🇴', 'noruega': '🇳🇴',
  'poland': '🇵🇱', 'polónia': '🇵🇱', 'polônia': '🇵🇱',
  'portugal': '🇵🇹',
  'romania': '🇷🇴', 'roménia': '🇷🇴', 'romênia': '🇷🇴',
  'russia': '🇷🇺', 'rússia': '🇷🇺',
  'san marino': '🇸🇲',
  'serbia': '🇷🇸', 'sérvia': '🇷🇸',
  'slovakia': '🇸🇰', 'eslováquia': '🇸🇰',
  'slovenia': '🇸🇮', 'eslovénia': '🇸🇮', 'eslovênia': '🇸🇮',
  'spain': '🇪🇸', 'espanha': '🇪🇸',
  'sweden': '🇸🇪', 'suécia': '🇸🇪',
  'switzerland': '🇨🇭', 'suíça': '🇨🇭',
  'turkey': '🇹🇷', 'turquia': '🇹🇷',
  'ukraine': '🇺🇦', 'ucrânia': '🇺🇦',
  'antigua and barbuda': '🇦🇬', 'antígua e barbuda': '🇦🇬',
  'argentina': '🇦🇷',
  'aruba': '🇦🇼',
  'bahamas': '🇧🇸',
  'barbados': '🇧🇧',
  'belize': '🇧🇿',
  'bermuda': '🇧🇲', 'bermudas': '🇧🇲',
  'bolivia': '🇧🇴', 'bolívia': '🇧🇴',
  'bonaire': '🇧🇶',
  'brazil': '🇧🇷', 'brasil': '🇧🇷',
  'canada': '🇨🇦', 'canadá': '🇨🇦',
  'cayman islands': '🇰🇾', 'ilhas caimão': '🇰🇾',
  'chile': '🇨🇱',
  'colombia': '🇨🇴', 'colômbia': '🇨🇴',
  'costa rica': '🇨🇷',
  'cuba': '🇨🇺',
  'curacao': '🇨🇼', 'curaçao': '🇨🇼',
  'dominica': '🇩🇲',
  'dominican republic': '🇩🇴', 'república dominicana': '🇩🇴',
  'ecuador': '🇪🇨', 'equador': '🇪🇨',
  'el salvador': '🇸🇻',
  'french guiana': '🇬🇫', 'guiana francesa': '🇬🇫',
  'grenada': '🇬🇩',
  'guadeloupe': '🇬🇵', 'guadalupe': '🇬🇵',
  'guatemala': '🇬🇹',
  'guyana': '🇬🇾',
  'haiti': '🇭🇹',
  'honduras': '🇭🇳',
  'jamaica': '🇯🇲',
  'martinique': '🇲🇶', 'martinica': '🇲🇶',
  'mexico': '🇲🇽', 'méxico': '🇲🇽',
  'nicaragua': '🇳🇮', 'nicarágua': '🇳🇮',
  'panama': '🇵🇦', 'panamá': '🇵🇦',
  'paraguay': '🇵🇾', 'paraguai': '🇵🇾',
  'peru': '🇵🇪',
  'puerto rico': '🇵🇷',
  'saint kitts and nevis': '🇰🇳', 'são cristóvão e névis': '🇰🇳',
  'saint lucia': '🇱🇨', 'santa lúcia': '🇱🇨',
  'saint vincent and the grenadines': '🇻🇨', 'são vicente e granadinas': '🇻🇨',
  'suriname': '🇸🇷',
  'trinidad and tobago': '🇹🇹', 'trindade e tobago': '🇹🇹',
  'turks and caicos islands': '🇹🇨', 'ilhas turcas e caicos': '🇹🇨',
  'united states': '🇺🇸', 'estados unidos': '🇺🇸',
  'uruguay': '🇺🇾', 'uruguai': '🇺🇾',
  'venezuela': '🇻🇪',
  'japan': '🇯🇵', 'japão': '🇯🇵',
  'saudi arabia': '🇸🇦', 'arábia saudita': '🇸🇦',
}).map(([k, v]) => [fold(k), v]));
export const teamFlag = (name) => FLAGS[fold(name)] || null;

// ---------- messages ----------

const odd = (x100) => (x100 / 100).toFixed(2);
const kickoff = (iso, tz = 'Europe/Lisbon') => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-PT', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-PT', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  return `📅 ${date} 🕐 ${time}`;
};

/** An admin post: bold title (with the type's emoji) and the text as written. */
export function formatPost({ type, title, body }) {
  const prefix = { promotion: '🎁 ', bet_ticket: '🎟️ ' }[type] || '';
  return `<b>${prefix}${escapeHtml(String(title).trim())}</b>\n\n${escapeHtml(String(body).trim())}`;
}

/** Before the game: teams, competition, kick-off; the prices are buttons (one row per market). */
export function formatTicket(ev, prices, url) {
  const lines = [`⚽ <b>${escapeHtml(ev.home)} x ${escapeHtml(ev.away)}</b>`, `🏟️ <i>${escapeHtml(ev.competition)}</i>`, '', kickoff(ev.start_time)];
  const keyboard = [];
  const flag = (n) => (teamFlag(n) ? `${teamFlag(n)} ` : '');
  // Three buttons share a row: a team's name would cut the price off on a phone ("Modena…"), so
  // the buttons say 1 / X / 2 and the text says who is who.
  const row1 = ['1', 'X', '2'].filter((c) => prices[`1x2|${c}`]).map((c) => ({ text: `${c} · ${odd(prices[`1x2|${c}`])}`, url }));
  if (row1.length) {
    lines.push('', '🏆 <b>RESULTADO FINAL</b>', `1 = ${flag(ev.home)}${escapeHtml(ev.home)} · X = Empate · 2 = ${flag(ev.away)}${escapeHtml(ev.away)}`);
    keyboard.push(row1);
  }
  const row2 = [['Y', '✅ Sim'], ['N', '❌ Não']].filter(([c]) => prices[`btts|${c}`]).map(([c, label]) => ({ text: `${label} ${odd(prices[`btts|${c}`])}`, url }));
  if (row2.length) { lines.push('', '⚽ <b>AMBAS MARCAM</b>'); keyboard.push(row2); }
  keyboard.push([{ text: '🔥 APOSTAR AGORA', url }]);
  return { html: lines.join('\n'), keyboard };
}

/** In play: score and minute (the buttons stay). */
export function formatLive(ev) {
  const lines = ['🔴 <b>AO VIVO</b>', '', `⚽ <b>${escapeHtml(ev.home)} x ${escapeHtml(ev.away)}</b>`, `🏟️ <i>${escapeHtml(ev.competition)}</i>`, ''];
  if (ev.clock) lines.push(`⏱ ${escapeHtml(ev.clock)}`);
  lines.push(`📊 ${ev.home_score ?? 0} - ${ev.away_score ?? 0}`);
  return lines.join('\n');
}

/** Over: the final score (the buttons are removed). */
export function formatFinished(ev) {
  const score = ev.status === 'finished' && ev.home_score !== null && ev.home_score !== undefined;
  return ['✅ <b>FINALIZADO</b>', '',
    score ? `⚽ <b>${escapeHtml(ev.home)} ${ev.home_score} x ${ev.away_score} ${escapeHtml(ev.away)}</b>` : `⚽ <b>${escapeHtml(ev.home)} x ${escapeHtml(ev.away)}</b>`,
    `🏟️ <i>${escapeHtml(ev.competition)}</i>`, '', ev.status === 'cancelled' ? '🚫 Jogo cancelado' : '🏁 Resultado final'].join('\n');
}

// ---------- suggested tickets (posted only; no bet is placed) ----------

/** Suggested tickets' settings (admin → Telegram): off until switched on. */
export const TICKET_DEFAULTS = { on: false, times: ['12:00', '18:00'], legs: 3, minOdds: 1.4, maxOdds: 1.7, stake: 10, hours: 12 };
export function ticketConfig(db) {
  const c = { ...TICKET_DEFAULTS, ...(getSetting(db, 'telegram.tickets', {}) || {}) };
  c.times = (Array.isArray(c.times) ? c.times : []).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  return c;
}

const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const lisbon = (iso, opts) => new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', ...opts });
/** Today in Lisbon ("2026-10-11") and the time ("18:05"). */
export function lisbonNow(ms = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const pickLabel = (l) => (l.code === 'X' ? 'Empate' : `Vitória ${l.code === '1' ? l.home : l.away}`);
const MARK = { won: '✅', lost: '❌', void: '↩️' };

/** The ticket: each game with its pick and price, the total price, the stake and what it would return. */
export function formatSuggestedTicket(t, results = null) {
  const lines = ['🎟️ <b>BILHETE DO DIA</b>', ''];
  t.legs.forEach((l, i) => {
    const r = results?.[i];
    lines.push(`${r && MARK[r] ? `${MARK[r]} ` : ''}⚽ <b>${escapeHtml(l.home)} x ${escapeHtml(l.away)}</b>`);
    lines.push(`🕐 ${lisbon(l.startTime, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · <i>${escapeHtml(l.competition)}</i>`);
    lines.push(`👉 ${escapeHtml(pickLabel(l))} — <b>${l.odds.toFixed(2)}</b>`, '');
  });
  const odds = t.odds_x100 / 100;
  lines.push(`📊 Odd total: <b>${odds.toFixed(2)}</b>`);
  lines.push(`💶 Aposta: ${euro(t.stake_cents)} ➜ 💰 Retorno: <b>${euro(Math.round(t.stake_cents * odds))}</b>`);
  if (t.status === 'won') lines.push('', `🏆 <b>BILHETE GANHO!</b> ${euro(Math.round(t.stake_cents * (t.final_x100 ?? t.odds_x100) / 100))}`);
  else if (t.status === 'lost') lines.push('', '❌ <b>Bilhete perdido</b>');
  else if (t.status === 'void') lines.push('', '↩️ <b>Bilhete anulado</b>');
  lines.push('', '<i>Sugestão Bet62. Jogue com responsabilidade. 18+</i>');
  return lines.join('\n');
}

/** A leg's outcome from its match: won / lost / void, or null while not over. */
export function legResult(l, ev) {
  if (!ev || ev.status === 'cancelled') return 'void';
  if (ev.status !== 'finished') return null;
  if (!ev.result) return null;
  return ev.result === l.code ? 'won' : 'lost';
}

// ---------- the bot ----------

export function createTelegram(db, {
  token = '', channel = '', publicUrl = '', auto = true, gapMinutes = 10, editSeconds = 30, deleteMinutes = 10,
  production = true, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const enabled = !!(token && channel);
  const site = String(publicUrl || '').replace(/\/+$/, '');
  const state = { lastTick: null, lastMonitor: null, lastTicket: null };

  async function call(method, body) {
    if (!enabled) return { ok: false, error: 'Telegram não está configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID).' };
    try {
      const res = await fetchImpl(`${API}/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: channel, ...body }), signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.description || `Telegram HTTP ${res.status}` };
      return { ok: true, result: data.result };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  async function send(html, keyboard = null) {
    const r = await call('sendMessage', { text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
    return r.ok ? { ok: true, messageId: String(r.result?.message_id ?? '') } : r;
  }
  async function edit(messageId, html, { removeKeyboard = false } = {}) {
    const r = await call('editMessageText', { message_id: Number(messageId), text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...(removeKeyboard ? { reply_markup: { inline_keyboard: [] } } : {}) });
    // "message is not modified": Telegram saw no change — not a failure.
    return r.ok || /message is not modified/i.test(r.error || '') ? { ok: true } : r;
  }
  async function remove(messageId) {
    const r = await call('deleteMessage', { message_id: Number(messageId) });
    return r.ok || /message to delete not found/i.test(r.error || '') ? { ok: true } : r;
  }

  /** Admin: publish a post now; the attempt is kept either way (the history shows the error). */
  async function publish({ type = 'custom', title, body, ctaText = '', ctaUrl = '', by = null }) {
    const html = formatPost({ type, title, body });
    const r = await send(html, ctaText && ctaUrl ? [[{ text: ctaText, url: ctaUrl }]] : null);
    const id = Number(db.prepare(`INSERT INTO telegram_posts (type, title, body, cta_text, cta_url, status, message_id, error, created_by, created_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(type, title, body, ctaText || null, ctaUrl || null, r.ok ? 'sent' : 'failed', r.messageId || null, r.ok ? null : r.error, by, nowIso(), r.ok ? nowIso() : null).lastInsertRowid);
    return { ...r, id };
  }

  const gameUrl = (id) => `${site}/#/jogo/${id}`;
  const pricesOf = (id) => Object.fromEntries(db.prepare("SELECT market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1 AND market IN ('1x2', 'btts')")
    .all(id).map((s) => [`${s.market}|${s.code}`, s.odds_x100]));
  const autoOn = () => auto && getSetting(db, 'telegram.auto', true) !== false;

  // Games listed twice by the feed (another id, another start time): the copy already in play or
  // over, within 12 h of this one, is the real one.
  const nearGames = db.prepare(`SELECT id, home, away, status, home_score, away_score, clock, competition, start_time FROM events
    WHERE sport = 'futebol' AND id != ? AND start_time BETWEEN ? AND ?`);
  function twinsOf(ev) {
    const t = new Date(ev.start_time).getTime();
    const key = teamsKey(ev.home, ev.away);
    return nearGames.all(ev.id, new Date(t - 12 * 3_600_000).toISOString(), new Date(t + 12 * 3_600_000).toISOString())
      .filter((r) => teamsKey(r.home, r.away) === key);
  }
  /** A game whose copy is already in play / over, or already posted, is not posted again. */
  function alreadyCovered(ev) {
    const twins = twinsOf(ev);
    return twins.some((r) => r.status === 'live' || r.status === 'finished')
      || twins.some((r) => db.prepare("SELECT 1 FROM telegram_promos WHERE event_id = ? AND status != 'failed'").get(r.id));
  }

  /**
   * One automatic post at most: when the last one is `gapMinutes` old, the promoted game starting
   * soonest (within 24 h) that was never posted, with its 1X2 open.
   */
  async function promoteNext({ now = Date.now(), force = false } = {}) {
    if (!enabled) return { action: 'skipped', reason: 'telegram_not_configured' };
    if (!site) return { action: 'skipped', reason: 'no_public_url' };
    if (!force) {
      const last = db.prepare("SELECT created_at FROM telegram_promos WHERE status != 'failed' ORDER BY id DESC LIMIT 1").get();
      if (last && now - new Date(last.created_at).getTime() < gapMinutes * 60_000) return { action: 'skipped', reason: 'too_soon' };
    }
    const rows = db.prepare(`SELECT e.* FROM events e WHERE e.sport = 'futebol' AND e.status = 'scheduled' AND e.start_time > ? AND e.start_time <= ?
        AND NOT EXISTS (SELECT 1 FROM telegram_promos p WHERE p.event_id = e.id AND p.status != 'failed')
        AND EXISTS (SELECT 1 FROM selections s WHERE s.event_id = e.id AND s.market = '1x2' AND s.active = 1)
      ORDER BY e.start_time, e.id`).all(new Date(now).toISOString(), new Date(now + 24 * 3_600_000).toISOString());
    let ev = null;
    let tier = null;
    for (const r of rows) { if ((tier = promoTier(r.competition, r.home, r.away)) && !alreadyCovered(r)) { ev = r; break; } }
    if (!ev) return { action: 'skipped', reason: 'no_candidates' };
    const prices = pricesOf(ev.id);
    if (!prices['1x2|1'] || !prices['1x2|2']) return { action: 'skipped', reason: 'no_candidates' };
    const ticket = formatTicket(ev, prices, gameUrl(ev.id));
    const r = await send(ticket.html, ticket.keyboard);
    db.prepare(`INSERT INTO telegram_promos (event_id, tier, status, message_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(ev.id, tier, r.ok ? 'sent' : 'failed', r.messageId || null, r.ok ? null : r.error, new Date(now).toISOString());
    if (!r.ok) log(`Telegram: falhou o envio de ${ev.home} - ${ev.away}: ${r.error}`);
    return { action: 'posted', eventId: ev.id, status: r.ok ? 'sent' : 'failed', error: r.ok ? undefined : r.error };
  }

  /** The posted games: AO VIVO while played, FINALIZADO at the end, deleted `deleteMinutes` later. */
  async function followGames({ now = Date.now() } = {}) {
    const out = { edited: 0, finished: 0, deleted: 0 };
    if (!enabled) return out;
    const iso = new Date(now).toISOString();
    for (const p of db.prepare("SELECT * FROM telegram_promos WHERE status = 'finished' AND delete_at <= ?").all(iso)) {
      if (p.message_id && !(await remove(p.message_id)).ok) continue; // tried again next run
      db.prepare("UPDATE telegram_promos SET status = 'deleted' WHERE id = ?").run(p.id);
      out.deleted += 1;
    }
    const active = db.prepare(`SELECT p.*, e.home, e.away, e.competition, e.start_time, e.status AS ev_status, e.home_score, e.away_score, e.clock
      FROM telegram_promos p LEFT JOIN events e ON e.id = p.event_id WHERE p.status IN ('sent', 'live')`).all();
    for (const p of active) {
      if (!p.message_id) continue;
      // The posted row still waits while its copy (listed again by the feed) is played: follow the copy.
      if (p.ev_status === 'scheduled') {
        const twin = twinsOf({ id: p.event_id, home: p.home, away: p.away, start_time: p.start_time }).find((r) => r.status === 'live' || r.status === 'finished');
        if (twin) Object.assign(p, { ev_status: twin.status, home_score: twin.home_score, away_score: twin.away_score, clock: twin.clock });
      }
      const ev = { home: p.home, away: p.away, competition: p.competition, status: p.ev_status, home_score: p.home_score, away_score: p.away_score, clock: p.clock };
      if (!p.ev_status || p.ev_status === 'finished' || p.ev_status === 'cancelled') {
        if (!p.ev_status || (await edit(p.message_id, formatFinished(ev), { removeKeyboard: true })).ok) {
          db.prepare("UPDATE telegram_promos SET status = 'finished', finished_at = ?, delete_at = ? WHERE id = ?")
            .run(iso, new Date(now + deleteMinutes * 60_000).toISOString(), p.id);
          out.finished += 1;
        }
        continue;
      }
      if (p.ev_status !== 'live') continue;
      const signature = `${ev.home_score ?? 0}-${ev.away_score ?? 0}|${ev.clock || ''}`;
      const due = p.status === 'sent' || (signature !== p.signature && (!p.edited_at || now - new Date(p.edited_at).getTime() >= editSeconds * 1000));
      if (!due) continue;
      if ((await edit(p.message_id, formatLive(ev))).ok) {
        db.prepare("UPDATE telegram_promos SET status = 'live', signature = ?, edited_at = ? WHERE id = ?").run(signature, iso, p.id);
        out.edited += 1;
      }
    }
    return out;
  }

  // ---------- suggested tickets ----------

  /**
   * Draws a ticket: `legs` football favourites (a home or away win priced between minOdds and
   * maxOdds) from different games starting in 30 min to `hours` h, the promoted leagues first,
   * none already on a ticket today. Null when there are not enough.
   */
  function drawTicket({ now = Date.now(), rng = Math.random } = {}) {
    const c = ticketConfig(db);
    const used = new Set(db.prepare('SELECT legs FROM telegram_tickets WHERE created_at > ?').all(new Date(now - 24 * 3_600_000).toISOString())
      .flatMap((r) => JSON.parse(r.legs).map((l) => l.eventId)));
    const rows = db.prepare(`SELECT s.id, s.code, s.odds_x100, e.id AS event_id, e.home, e.away, e.competition, e.start_time
        FROM selections s JOIN events e ON e.id = s.event_id
        WHERE e.sport = 'futebol' AND e.status = 'scheduled' AND e.start_time > ? AND e.start_time <= ?
          AND s.market = '1x2' AND s.code IN ('1', '2') AND s.active = 1 AND s.odds_x100 BETWEEN ? AND ?`)
      .all(new Date(now + 30 * 60_000).toISOString(), new Date(now + c.hours * 3_600_000).toISOString(), Math.round(c.minOdds * 100), Math.round(c.maxOdds * 100))
      .filter((r) => !used.has(r.event_id) && !EXCLUDED.test(`${r.competition} ${r.home} ${r.away}`) && !PLAYER_PROP.test(r.competition)
        && !twinsOf({ id: r.event_id, home: r.home, away: r.away, start_time: r.start_time }).some((t) => t.status === 'live' || t.status === 'finished'));
    // One pick per game (its favourite), the promoted leagues first, at random within each group.
    const best = new Map();
    for (const r of rows) if (!best.has(r.event_id) || r.odds_x100 < best.get(r.event_id).odds_x100) best.set(r.event_id, r);
    const rank = (r) => ({ grande: 0, 'média': 1 }[promoTier(r.competition, r.home, r.away)] ?? 2);
    const pool = [...best.values()].map((r) => ({ r, k: rank(r) + rng() })).sort((a, b) => a.k - b.k).map((x) => x.r);
    if (pool.length < c.legs) return null;
    const legs = pool.slice(0, c.legs)
      .map((r) => ({ selectionId: r.id, eventId: r.event_id, code: r.code, odds: r.odds_x100 / 100, home: r.home, away: r.away, competition: r.competition, startTime: r.start_time }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const odds = Math.round(legs.reduce((p, l) => p * l.odds, 1) * 100);
    return { legs, odds_x100: odds, stake_cents: Math.round(c.stake * 100), status: 'sent' };
  }

  /** Draws a ticket and posts it; the button puts its picks into the slip on the site. */
  async function postTicket({ now = Date.now(), slot = null, rng } = {}) {
    if (!enabled) return { action: 'skipped', reason: 'telegram_not_configured' };
    if (!site) return { action: 'skipped', reason: 'no_public_url' };
    const t = drawTicket({ now, rng });
    if (!t) return { action: 'skipped', reason: 'not_enough_games' };
    const url = `${site}/#/bilhete/${t.legs.map((l) => l.selectionId).join('-')}`;
    const r = await send(formatSuggestedTicket(t), [[{ text: '🔥 APOSTAR NESTE BILHETE', url }]]);
    const id = Number(db.prepare(`INSERT INTO telegram_tickets (slot, legs, odds_x100, stake_cents, status, message_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(slot, JSON.stringify(t.legs), t.odds_x100, t.stake_cents, r.ok ? 'sent' : 'failed', r.messageId || null, r.ok ? null : r.error, new Date(now).toISOString()).lastInsertRowid);
    if (!r.ok) log(`Telegram: falhou o envio do bilhete: ${r.error}`);
    return { action: 'posted', ticketId: id, status: r.ok ? 'sent' : 'failed', error: r.ok ? undefined : r.error };
  }

  /** At each configured time (Lisbon), one ticket — not later than an hour after it (a restart). */
  async function ticketsDue({ now = Date.now() } = {}) {
    const c = ticketConfig(db);
    if (!c.on) return { action: 'skipped', reason: 'tickets_off' };
    const { date, time } = lisbonNow(now);
    const late = lisbonNow(now - 60 * 60_000);
    for (const t of c.times) {
      if (t > time || (late.date === date && t < late.time)) continue;
      const slot = `${date} ${t}`;
      if (db.prepare('SELECT 1 FROM telegram_tickets WHERE slot = ?').get(slot)) continue;
      const r = await postTicket({ now, slot });
      // Not enough games: the slot is marked, so it is not tried every minute.
      if (r.reason === 'not_enough_games') db.prepare("INSERT INTO telegram_tickets (slot, legs, odds_x100, stake_cents, status, error, created_at) VALUES (?, '[]', 0, 0, 'failed', ?, ?)")
        .run(slot, 'Jogos insuficientes nas condições escolhidas', new Date(now).toISOString());
      return r;
    }
    return { action: 'skipped', reason: 'not_time' };
  }

  /** Each posted ticket follows its games: ✅ / ❌ per game, then won / lost; the button goes at kick-off. */
  async function followTickets({ now = Date.now() } = {}) {
    let edited = 0;
    if (!enabled) return { edited };
    const getEv = db.prepare('SELECT status, result, start_time FROM events WHERE id = ?');
    for (const t of db.prepare("SELECT * FROM telegram_tickets WHERE status = 'sent' AND message_id IS NOT NULL").all()) {
      const legs = JSON.parse(t.legs);
      const evs = legs.map((l) => getEv.get(l.eventId));
      const results = legs.map((l, i) => legResult(l, evs[i]));
      let status = 'sent';
      if (results.includes('lost')) status = 'lost';
      else if (results.every((r) => r === 'void')) status = 'void';
      else if (results.every(Boolean)) status = 'won';
      // Void legs count as 1.00.
      const final = Math.round(legs.reduce((p, l, i) => p * (results[i] === 'void' ? 1 : l.odds), 1) * 100);
      const started = evs.some((e) => !e || e.status !== 'scheduled' || new Date(e.start_time).getTime() <= now);
      const signature = `${results.join(',')}|${status}|${started ? 1 : 0}`;
      if (signature === t.signature) continue;
      const view = { ...t, legs, status, final_x100: final };
      if (!(await edit(t.message_id, formatSuggestedTicket(view, results), { removeKeyboard: started })).ok) continue;
      db.prepare('UPDATE telegram_tickets SET status = ?, signature = ?, settled_at = ? WHERE id = ?')
        .run(status, signature, status === 'sent' ? null : new Date(now).toISOString(), t.id);
      edited += 1;
    }
    return { edited };
  }

  function start({ promoMs = 2 * 60_000, followMs = 15_000 } = {}) {
    if (!enabled) return () => {};
    if (!production) { log('Telegram: publicação automática desligada (não é o ambiente de produção)'); return () => {}; }
    let busy = false;
    const guarded = (fn, key) => async () => {
      if (busy) return;
      busy = true;
      try { state[key] = { at: nowIso(), result: await fn() }; } catch (err) { state[key] = { at: nowIso(), error: err.message }; log(`Telegram: ${err.message}`); } finally { busy = false; }
    };
    const promo = guarded(() => (autoOn() ? promoteNext() : { action: 'skipped', reason: 'auto_off' }), 'lastTick');
    const follow = guarded(async () => ({ ...(await followGames()), tickets: (await followTickets()).edited }), 'lastMonitor');
    const tickets = guarded(() => ticketsDue(), 'lastTicket');
    const first = setTimeout(promo, 15_000);
    const timers = [setInterval(promo, promoMs), setInterval(follow, followMs), setInterval(tickets, 60_000)];
    return () => { clearTimeout(first); timers.forEach(clearInterval); };
  }

  const status = () => ({
    enabled, channel: enabled ? channel : null, publicUrl: site || null, production, auto: autoOn(), gapMinutes, deleteMinutes,
    lastTick: state.lastTick, lastMonitor: state.lastMonitor, lastTicket: state.lastTicket, tickets: ticketConfig(db),
  });

  return { enabled, publish, promoteNext, followGames, drawTicket, postTicket, ticketsDue, followTickets, start, status, send, edit, remove };
}
