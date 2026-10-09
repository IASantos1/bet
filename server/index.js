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
import { createStripe } from './stripe.js';
import { expireDue, runCashback } from './promotions.js';
import { createBigBang } from './bigbang.js';

const db = openDb(config.dbPath);
if (!config.dbPersistent) {
  console.warn(`ATENÇÃO: a base de dados (${config.dbPath}) está no disco do contentor e é apagada em cada deploy. `
    + 'Crie um Volume no Railway (Settings → Volumes) para guardar saldos, apostas e utilizadores.');
}
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
  ? createWinHouseFeed(db, { client: winhouse, tzOffsetMinutes: config.winhouse.tzOffsetMinutes, finishConfirmSeconds: config.winhouse.finishConfirmSeconds, blockWomen: config.winhouse.blockWomen, blockYouth: config.winhouse.blockYouth, blockMinor: config.winhouse.blockMinor, blockLeagues: config.winhouse.blockLeagues, footballLeagues: config.winhouse.footballLeagues, basketballLeagues: config.winhouse.basketballLeagues, tennisLeagues: config.winhouse.tennisLeagues, detailHours: config.winhouse.detailHours, detailPerCycle: config.winhouse.detailPerCycle, detailRefreshMinutes: config.winhouse.detailRefreshMinutes, futureDays: () => getSetting(db, 'winhouse.futureDays', config.winhouse.futureDays), futureMinutes: config.winhouse.futureMinutes, liveDetailPerCycle: config.winhouse.liveDetailPerCycle, liveDetailSeconds: config.winhouse.liveDetailSeconds, onOdds: (id) => winhouseTracker?.bus.emit(`e:${id}`, { type: 'odds', data: { at: new Date().toISOString() } }), log: (msg) => console.warn(`[winhouse] ${msg}`) })
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
const stopWinhouseOdds = winhouseOdds ? winhouseOdds.start() : () => {};
const stopWinhouse = () => { stopWinhouseFeed(); stopWinhouseOdds(); };

// Live video as HLS (/api/live): only when WINHOUSE_HLS=1 (the WinHouse agreement must allow it).
const winhouseLive = winhouse.enabled && config.winhouse.hls
  ? createWinHouseLive({ client: winhouse, hlsPath: config.winhouse.hlsPath, tvBase: config.winhouse.tvUrl, playerId: config.winhouse.streamPlayer, log: (msg) => console.warn(`[winhouse] ${msg}`) })
  : null;

const casino = createCasino(db, { ...config.casino, log: (msg) => console.warn(`[casino] ${msg}`) });

const settlement = createSettlementEngine(db, {
  postponedVoidHours: config.settlement.postponedVoidHours,
  noResultVoidHours: config.settlement.noResultVoidHours,
  log: (msg) => console.log(`[liquidação] ${msg}`),
});
const stopSettlement = settlement.start();

const stripe = config.stripe.secretKey
  ? createStripe(db, { ...config.stripe, log: (m) => console.warn(m) })
  : null;
if (stripe) {
  console.log(`Stripe: ${stripe.live ? 'live' : 'teste'}, webhook ${stripe.hasWebhook ? 'configurado' : 'em falta (STRIPE_WEBHOOK_SECRET)'}, cartão ${stripe.hasPublishable ? 'ok' : 'sem STRIPE_PUBLISHABLE_KEY'}`);
  // A missed webhook still credits: pending deposits are checked with Stripe every minute.
  const sweep = () => stripe.sweep().then((r) => { if (r.credited) console.log(`Stripe: ${r.credited} depósito(s) creditado(s) pela verificação`); }).catch((err) => console.warn(`stripe sweep: ${err.message}`));
  setTimeout(sweep, 10_000).unref();
  setInterval(sweep, 60_000).unref();
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

const bigbang = createBigBang(db, { ...config.bigbang, log: (m) => console.warn(`[bigbang] ${m}`) });
if (bigbang.enabled) console.log(`Casino BigBang: chave ${bigbang.sandbox ? 'sandbox (ek_test_)' : 'real'}`);

const server = createApp(db, { feed, tennis, tennisLive, sports, casino, liveSocket, settlement, propline, winhouse, winhouseFeed, winhouseTracker, winhouseLive, stripe, bigbang }).listen(config.port, () => {
  console.log(`ClassicBet a correr em http://localhost:${config.port} (${config.env}, pagamentos: ${config.paymentsMode})`);
});

const shutdown = () => {
  stopFeed();
  stopTennis();
  stopSports.forEach((stop) => stop());
  tennisLive?.stop();
  stopSettlement();
  stopPropline();
  stopWinhouse();
  liveSocket?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
