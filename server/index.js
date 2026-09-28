import { config } from './config.js';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
seed(db, (msg) => console.log(`[seed] ${msg}`));

const server = createApp(db).listen(config.port, () => {
  console.log(`ClassicBet a correr em http://localhost:${config.port} (${config.env}, pagamentos: ${config.paymentsMode})`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
