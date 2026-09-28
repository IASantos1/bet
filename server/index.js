import { config } from './config.js';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { createFeed } from './feed.js';
import { createLiveSocket } from './livews.js';
import { createCasino } from './casino.js';
import { createSettlementEngine } from './settlement.js';
import { createTennisFeed } from './tennis.js';

const db = openDb(config.dbPath);
const log = (msg) => console.warn(`[feed] ${msg}`);
const liveSocket = config.feed.token && config.feed.liveWs
  ? createLiveSocket(db, { token: config.feed.token, url: config.feed.liveWsUrl, maxSockets: config.feed.liveMaxSockets, log })
  : null;
const feed = createFeed(db, { ...config.feed, log, liveSocket });
seed(db, (msg) => console.log(`[seed] ${msg}`), { sampleEvents: !config.feed.token });
const stopFeed = feed.start();
const tennis = createTennisFeed(db, {
  token: config.tennis.enabled ? config.feed.token : '', baseUrl: config.tennis.baseUrl, days: config.tennis.days,
  log: (msg) => console.warn(`[ténis] ${msg}`),
});
const stopTennis = tennis.start();

const casino = createCasino(db, { ...config.casino, log: (msg) => console.warn(`[casino] ${msg}`) });

const settlement = createSettlementEngine(db, {
  postponedVoidHours: config.settlement.postponedVoidHours,
  log: (msg) => console.log(`[liquidação] ${msg}`),
});
const stopSettlement = settlement.start();

const server = createApp(db, { feed, tennis, casino, liveSocket, settlement }).listen(config.port, () => {
  console.log(`ClassicBet a correr em http://localhost:${config.port} (${config.env}, pagamentos: ${config.paymentsMode})`);
});

const shutdown = () => {
  stopFeed();
  stopTennis();
  stopSettlement();
  liveSocket?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
