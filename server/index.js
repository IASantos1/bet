import { config } from './config.js';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { createFeed } from './feed.js';

const db = openDb(config.dbPath);
const feed = createFeed(db, { ...config.feed, log: (msg) => console.warn(`[feed] ${msg}`) });
seed(db, (msg) => console.log(`[seed] ${msg}`), { sampleEvents: !config.feed.token });
const stopFeed = feed.start();

const server = createApp(db, { feed }).listen(config.port, () => {
  console.log(`ClassicBet a correr em http://localhost:${config.port} (${config.env}, pagamentos: ${config.paymentsMode})`);
});

const shutdown = () => {
  stopFeed();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
