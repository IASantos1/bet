import { config } from './config.js';
import { openDb, getSetting, tx } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { createFeed } from './feed.js';
import { createLiveSocket } from './livews.js';
import { createCasino } from './casino.js';
import { createSettlementEngine } from './settlement.js';
import { createTennisFeed, TENNIS_SOURCE } from './tennis.js';
import { createSportFeed, SPORT_SPECS } from './sports.js';
import { createPropLineFeed, DEFAULT_SPORT_KEYS } from './propline.js';
import { setRequestsPerMinute } from './providerlimit.js';
import { createWinHouseClient, createWinHouseFeed } from './winhouse.js';
import { createWinHouseTracker } from './whtracker.js';
import { createWinHouseOddsPush, sioUrl } from './whpush.js';
import { createWinHouseLive } from './whlive.js';
import { createRapidStream } from './rapidstream.js';
import { createStripe } from './stripe.js';
import { createEupago } from './eupago.js';
import { createRevolut } from './revolut.js';
import { createBrevo } from './brevo.js';
import { createTeamLogos } from './teamlogos.js';
import { createGoalApi } from './goalapi.js';
import { expireDue, runCashback, seedFsGames, retireWelcome } from './promotions.js';
import { createBigBang } from './bigbang.js';
import { createTelegram } from './telegram.js';
import { startLoopDelay } from './loopdelay.js';
import { createBackups } from './backups.js';
import { createSanctions } from './sanctions.js';
import { createPush } from './push.js';

const db = openDb(config.dbPath);
if (retireWelcome(db)) console.log('[promoções] bónus de boas-vindas de 100% desligado (no 1.º depósito: Free Bet de depósito)');
startLoopDelay();
if (!config.dbPersistent) {
  console.warn(`ATENÇÃO: a base de dados (${config.dbPath}) está no disco do contentor e é apagada em cada deploy. `
    + 'Crie um Volume no Railway (Settings → Volumes) para guardar saldos, apostas e utilizadores.');
}
// A copy of the database a day (backups.js), downloadable from the admin panel.
const backups = createBackups(db, { dbPath: config.dbPath, keep: config.backupKeep, log: (msg) => console.log(`[cópias] ${msg}`) });
const stopBackups = backups.start();
setRequestsPerMinute(config.feed.maxRequestsPerMinute);
const log = (msg) => console.warn(`[feed] ${msg}`);
const liveSocket = config.feed.token && config.feed.liveWs
  ? createLiveSocket(db, { token: config.feed.token, url: config.feed.liveWsUrl, maxSockets: config.feed.liveMaxSockets, liveOddsStale: config.feed.liveOddsStaleSeconds, bookmaker: config.feed.liveOddsBookmaker, log })
  : null;
const feed = createFeed(db, { ...config.feed, log, liveSocket });
seed(db, (msg) => console.log(`[seed] ${msg}`), { sampleEvents: !config.feed.token && !config.winhouse.baseUrl });
const loops = { liveMs: config.livePollSeconds * 1000, oddsMs: config.prematchOddsSeconds * 1000 };
const stopFeed = feed.start(loops);
const tennisToken = config.tennis.enabled ? config.feed.token : '';
const tennisLive = tennisToken && config.feed.liveWs
  ? createLiveSocket(db, {
    token: tennisToken, url: config.tennis.liveWsUrl, sport: 'tennis', source: TENNIS_SOURCE,
    maxSockets: 2, log: (msg) => console.warn(`[ténis] ${msg}`),
  })
  : null;
const tennis = createTennisFeed(db, {
  token: tennisToken, baseUrl: config.tennis.baseUrl, days: config.tennis.days, liveSocket: tennisLive,
  liveOddsMaxAge: config.liveOddsMaxAgeSeconds, prematchOddsSeconds: config.prematchOddsSeconds,
  liveOddsEveryMs: config.feed.restLiveOdds ? 20_000 : Infinity,
  liveListEveryMs: (tennisLive ? 2 : 1) * config.feed.sportsLivePollSeconds * 1000,
  log: (msg) => console.warn(`[ténis] ${msg}`),
});
const stopTennis = tennis.start({ liveMs: loops.liveMs });

const sports = Object.fromEntries(config.sportsAddon.sports.filter((k) => SPORT_SPECS[k]).map((k) => [k, createSportFeed(db, k, {
  token: config.feed.token, days: config.sportsAddon.days, liveOddsMaxAge: config.liveOddsMaxAgeSeconds, prematchOddsSeconds: config.prematchOddsSeconds,
  liveOddsEveryMs: config.feed.restLiveOdds ? 20_000 : Infinity, liveListEveryMs: config.feed.sportsLivePollSeconds * 1000,
  log: (msg) => console.warn(`[${k}] ${msg}`),
})]));
const stopSports = Object.values(sports).map((f) => f.start({ liveMs: loops.liveMs }));

// Second odds source: prices only, for markets the main provider leaves empty.
const propline = createPropLineFeed(db, {
  ...config.propline, sportKeys: config.propline.sportKeys.length ? config.propline.sportKeys : DEFAULT_SPORT_KEYS,
  log: (msg) => console.warn(`[propline] ${msg}`),
});
const stopPropline = propline.start();
if (propline.enabled) console.log(`[propline] ligado: ${propline.status().sports.length} competições, ${config.propline.dailyRequests} pedidos/dia`);

const winhouse = createWinHouseClient({ ...config.winhouse, log: (msg) => console.log(`[winhouse] ${msg}`) });
// WinHouse as the data source: events, scores, odds and results (Bzzoiro stays off without its token).
const winhouseFeed = winhouse.enabled && config.winhouse.feed
  ? createWinHouseFeed(db, { client: winhouse, tzOffsetMinutes: config.winhouse.tzOffsetMinutes, finishConfirmSeconds: config.winhouse.finishConfirmSeconds, blockWomen: config.winhouse.blockWomen, blockYouth: config.winhouse.blockYouth, blockMinor: config.winhouse.blockMinor, blockLeagues: config.winhouse.blockLeagues, footballLeagues: config.winhouse.footballLeagues, basketballLeagues: config.winhouse.basketballLeagues, tennisLeagues: config.winhouse.tennisLeagues, hockeyLeagues: config.winhouse.hockeyLeagues, volleyballLeagues: config.winhouse.volleyballLeagues, handballLeagues: config.winhouse.handballLeagues, futsalLeagues: config.winhouse.futsalLeagues, detailHours: config.winhouse.detailHours, footballDetailHours: config.winhouse.footballDetailHours, detailPerCycle: config.winhouse.detailPerCycle, detailRefreshMinutes: config.winhouse.detailRefreshMinutes, futureDays: () => getSetting(db, 'winhouse.futureDays', config.winhouse.futureDays), futureMinutes: config.winhouse.futureMinutes, liveDetailPerCycle: config.winhouse.liveDetailPerCycle, liveDetailSeconds: config.winhouse.liveDetailSeconds, onOdds: (id) => winhouseTracker?.bus.emit(`e:${id}`, { type: 'odds', data: { at: new Date().toISOString() } }), log: (msg) => console.warn(`[winhouse] ${msg}`) })
  : null;
// WinHouse match tracker (football in play): stats, ball and timeline, read only for watched matches.
const winhouseTracker = winhouse.enabled && config.winhouse.tracker
  ? createWinHouseTracker(db, { client: winhouse, pollMs: config.winhouse.trackerPollMs, ws: config.winhouse.trackerWs, log: (msg) => console.warn(`[winhouse] ${msg}`) })
  : null;
const stopWinhouseFeed = winhouseFeed ? winhouseFeed.start({ liveMs: config.winhouse.liveMs, prematchMs: config.winhouse.prematchMs }) : () => {};
// Real-time odds: every price change of the book, applied to the live games we carry.
const winhouseOdds = winhouseFeed && config.winhouse.oddsPush
  ? createWinHouseOddsPush({ url: sioUrl(config.winhouse.baseUrl, config.winhouse.oddsPushPath), onCoefs: winhouseFeed.applyCoefs, log: (msg) => console.warn(`[winhouse] ${msg}`) })
  : null;
winhouseFeed?.setOddsPush(winhouseOdds);
// Tennis cards: the point (15 / 30 / 40 / AD) read the way the match page reads it.
if (winhouseTracker?.enabled) winhouseFeed?.setTrackerState(winhouseTracker.state);
const stopTrackLive = winhouseTracker?.enabled ? winhouseTracker.followLive({ max: config.winhouse.trackLive }) : () => {};
const stopWinhouseOdds = winhouseOdds ? winhouseOdds.start() : () => {};
const stopWinhouse = () => { stopWinhouseFeed(); stopWinhouseOdds(); };

// Live video as HLS (/api/live): only when WINHOUSE_HLS=1 (the WinHouse agreement must allow it).
const winhouseLive = winhouse.enabled && config.winhouse.hls
  ? createWinHouseLive({ client: winhouse, hlsPath: config.winhouse.hlsPath, tvBase: config.winhouse.tvUrl, playerId: config.winhouse.streamPlayer, log: (msg) => console.warn(`[winhouse] ${msg}`) })
  : null;

// Trial video source (RapidAPI), beside WinHouse's TV and independent of it.
// With only the key the admin route tool still works (to find a new API's routes); video needs the list route too.
const rapidStream = config.rapidStream.apiKey ? createRapidStream({ ...config.rapidStream, log: (msg) => console.warn(`[rapidapi] ${msg}`) }) : null;

const casino = createCasino(db, { ...config.casino, log: (msg) => console.warn(`[casino] ${msg}`) });

const settlement = createSettlementEngine(db, {
  postponedVoidHours: config.settlement.postponedVoidHours,
  noResultVoidHours: config.settlement.noResultVoidHours,
  specialVoidHours: config.settlement.specialVoidHours,
  log: (msg) => console.log(`[liquidação] ${msg}`),
});
const stopSettlement = settlement.start();

// Initialize Stripe only when it is the explicitly selected payment provider.
// Eupago mode sends card, MB WAY and Multibanco transactions to Eupago.
const stripe = config.paymentsMode === 'stripe' && config.stripe.secretKey
  ? createStripe(db, { ...config.stripe, log: (m) => console.warn(m) })
  : null;
if (stripe) {
  console.log(`Stripe: ${stripe.live ? 'live' : 'teste'}, webhook ${stripe.hasWebhook ? 'configurado' : 'em falta (STRIPE_WEBHOOK_SECRET)'}, cartão ${stripe.hasPublishable ? 'ok' : 'sem STRIPE_PUBLISHABLE_KEY'}`);
  // A missed webhook still credits: pending deposits are checked with Stripe every minute.
  const sweep = () => stripe.sweep().then((r) => { if (r.credited) console.log(`Stripe: ${r.credited} depósito(s) creditado(s) pela verificação`); }).catch((err) => console.warn(`stripe sweep: ${err.message}`));
  setTimeout(sweep, 10_000).unref();
  setInterval(sweep, 60_000).unref();
}

const eupago = config.paymentsMode === 'eupago' && config.eupago.apiKey
  ? createEupago(db, { ...config.eupago, log: (m) => console.warn(`[eupago] ${m}`) })
  : null;
if (config.paymentsMode === 'eupago') {
  console.log(`Eupago: ${eupago ? config.eupago.environment : 'não configurada'}`);
}

// Promotions: expired bonuses / free bets removed, and the weekly cashback credited (once per week).
const promoJobs = () => {
  try {
    tx(db, () => expireDue(db));
    const n = tx(db, () => runCashback(db));
    if (n) console.log(`Promoções: cashback creditado a ${n} jogador(es)`);
  } catch (err) { console.warn(`promoções: ${err.message}`); }
};
setTimeout(promoJobs, 15_000).unref();
setInterval(promoJobs, 5 * 60_000).unref();

// BigBang; with Palace configured, the admin can give the slots to Palace and keep BigBang for live tables.
const bigbang = createBigBang(db, {
  ...config.bigbang, log: (m) => console.warn(`[bigbang] ${m}`),
  palace: casino.enabled ? async () => (await casino.games()).games : null,
  split: () => casino.enabled && getSetting(db, 'casino.split', false) === true,
});
if (bigbang.enabled) console.log(`Casino BigBang: chave ${bigbang.sandbox ? 'sandbox (ek_test_)' : 'real'}`);
// The house's free-spins games (Fortune Tiger, Big Bass Splash…) go into the free-spins list once the
// catalogue has loaded: tried after start and every 10 minutes until done.
if (bigbang.enabled) {
  const seedFs = async () => {
    try {
      const r = seedFsGames(db, (await bigbang.games()).games);
      if (r) { console.log(`[free spins] jogos da casa: ${r.added.join(', ') || 'nenhum'}${r.missing.length ? ` · não encontrados: ${r.missing.join(', ')}` : ''}`); clearInterval(fsSeedTimer); }
      else if (getSetting(db, 'promo.fsDefaults', null)) clearInterval(fsSeedTimer);
    } catch (err) { console.warn(`[free spins] jogos da casa: ${err.message}`); }
  };
  const fsSeedTimer = setInterval(seedFs, 10 * 60_000);
  fsSeedTimer.unref();
  setTimeout(seedFs, 30_000).unref();
}

// Telegram channel: the admin's posts, and the big games posted and followed automatically.
const telegram = createTelegram(db, { ...config.telegram, publicUrl: config.publicUrl, log: (m) => console.warn(`[telegram] ${m}`) });
const stopTelegram = telegram.start();
if (telegram.enabled) console.log(`Telegram: canal ${config.telegram.channel}, publicação automática ${telegram.status().auto && config.telegram.production ? 'ligada' : 'desligada'}`);

// Revolut Business: withdrawals paid to the player's IBAN (off until its variables are set).
const revolut = config.revolut.clientId ? createRevolut({ ...config.revolut, log: (m) => console.warn(m) }) : null;
if (revolut) console.log(`Revolut: ${revolut.configured ? `ligada (${revolut.environment}), pagamento automático €${revolut.autoMinCents / 100}–€${revolut.autoMaxCents / 100}` : 'incompleta (faltam variáveis)'}`);
const teamLogos = createTeamLogos(db, { ...config.teamLogos, persistent: config.dbPersistent, log: (m) => console.warn(`[emblemas] ${m}`) });
const stopTeamLogos = teamLogos.start();
if (config.teamLogos.apiFootballKey && config.teamLogos.enabled) console.log(`[emblemas] API-Football ativo (até ${config.teamLogos.apiFootballDaily} pesquisas por dia e desporto)`);
const brevo = createBrevo({ ...config.brevo, log: (m) => console.warn(`[brevo] ${m}`) });
if (brevo.configured) console.log(`Brevo: emails de ${config.brevo.senderEmail}${brevo.smsConfigured ? ', SMS ligado' : ''}`);
const goalApi = createGoalApi(db, { ...config.goalApi, log: (m) => console.warn(`[goal-api] ${m}`) });
if (goalApi.enabled) console.log(`[goal-api] estatísticas ativas (até ${config.goalApi.daily} pedidos por dia)`);
// Sanctions lists (EU, UN; UK optional): downloaded once a day, every player compared with them.
const sanctions = createSanctions(db, { urls: config.sanctions, log: (msg) => console.log(`[sanções] ${msg}`) });
const stopSanctions = sanctions.start();
// Notifications on the phone: a won bet announced within ~20 s of being settled.
const push = createPush(db, { ...config.push, log: (m) => console.warn(`[push] ${m}`) });
const stopPush = push.start();
const app = createApp(db, { feed, tennis, tennisLive, sports, casino, liveSocket, settlement, propline, winhouse, winhouseFeed, winhouseTracker, winhouseLive, rapidStream, stripe, eupago, bigbang, telegram, revolut, brevo, teamLogos, goalApi, backups, sanctions, push, boardCacheMs: 2000 });
// Free spins played on the Palace casino that ran out of time: their money there is taken back first.
setInterval(() => app.locals.expirePalaceSpins().catch((err) => console.warn(`free spins palace: ${err.message}`)), 5 * 60_000).unref();
// A Palace game closed without leaving it (tab closed): its balance comes back to the wallet.
setInterval(() => app.locals.returnIdleCasino().catch((err) => console.warn(`casino: ${err.message}`)), 60_000).unref();
const server = app.listen(config.port, () => {
  console.log(`ClassicBet a correr em http://localhost:${config.port} (${config.env}, pagamentos: ${config.paymentsMode})`);
});

const shutdown = () => {
  stopFeed();
  stopBackups();
  stopSanctions();
  stopPush();
  stopTrackLive();
  stopTennis();
  stopSports.forEach((stop) => stop());
  tennisLive?.stop();
  stopSettlement();
  stopPropline();
  stopWinhouse();
  stopTelegram();
  stopTeamLogos();
  liveSocket?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
