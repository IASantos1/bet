import { config } from './config.js';
import { nowIso, tx } from './db.js';
import { hashPassword } from './security.js';

const H = 3600_000;

// Fictional teams/competitions so the platform has something to bet on from the first start.
// Operators replace these through the admin panel (or an odds-feed integration).
const SAMPLE_EVENTS = [
  { sport: 'futebol', competition: 'Liga Portugal', home: 'Lisboa SC', away: 'Porto Norte', in: -1.1, live: ['1', '0', "67'"], odds: [2.3, 3.2, 2.85], featured: 1 },
  { sport: 'basquetebol', competition: 'Liga Betclic', home: 'Central Basket', away: 'North Lions', in: -0.6, live: ['58', '61', 'Q3'], odds: [1.95, null, 1.85] },
  { sport: 'futebol', competition: 'Premier League', home: 'North London FC', away: 'Manchester Red', in: 3, odds: [2.15, 3.45, 2.72], featured: 1 },
  { sport: 'futebol', competition: 'La Liga', home: 'Madrid Athletic', away: 'Barcelona City', in: 4, odds: [2.4, 3.3, 2.48], featured: 1 },
  { sport: 'futebol', competition: 'Serie A', home: 'Milano FC', away: 'Roma Sporting', in: 5, odds: [1.92, 3.6, 3.7], featured: 1 },
  { sport: 'futebol', competition: 'Bundesliga', home: 'Berlin 04', away: 'Munich Stars', in: 26, odds: [3.2, 3.55, 2.05] },
  { sport: 'futebol', competition: 'Ligue 1', home: 'Paris United', away: 'Lyon FC', in: 27, odds: [1.72, 4.1, 4.65] },
  { sport: 'futebol', competition: 'Liga Portugal', home: 'Braga Minho', away: 'Guimarães FC', in: 28, odds: [2.05, 3.3, 3.5] },
  { sport: 'tenis', competition: 'ATP Lisboa', home: 'R. Almeida', away: 'D. Novak', in: 6, odds: [1.65, null, 2.2] },
  { sport: 'basquetebol', competition: 'EuroLeague', home: 'Madrid Hoops', away: 'Athens BC', in: 29, odds: [1.55, null, 2.45] },
];

export function seed(db, log = () => {}) {
  seedAdmin(db, log);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (n > 0) return;
  const now = Date.now();
  const insertEvent = db.prepare(
    `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSel = db.prepare('INSERT INTO selections (event_id, code, odds_x100) VALUES (?, ?, ?)');
  tx(db, () => {
    for (const e of SAMPLE_EVENTS) {
      const start = new Date(Math.round((now + e.in * H) / (15 * 60_000)) * 15 * 60_000).toISOString();
      const ts = nowIso();
      const { lastInsertRowid } = insertEvent.run(
        e.sport, e.competition, e.home, e.away, start, e.live ? 'live' : 'scheduled',
        e.live ? Number(e.live[0]) : null, e.live ? Number(e.live[1]) : null, e.live ? e.live[2] : null,
        e.featured ? 1 : 0, ts, ts
      );
      ['1', 'X', '2'].forEach((code, i) => {
        if (e.odds[i]) insertSel.run(Number(lastInsertRowid), code, Math.round(e.odds[i] * 100));
      });
    }
  });
  log(`Criados ${SAMPLE_EVENTS.length} eventos de exemplo.`);
}

function seedAdmin(db, log) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
  if (n > 0) return;
  let email = config.adminEmail;
  let password = config.adminPassword;
  if (!email || !password) {
    if (config.isProduction) {
      log('AVISO: defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador.');
      return;
    }
    email = 'admin@classicbet.local';
    password = 'admin12345';
    log(`Administrador de desenvolvimento: ${email} / ${password}`);
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    return;
  }
  db.prepare(
    `INSERT INTO users (email, name, birthdate, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`
  ).run(email, 'Administrador', '1990-01-01', hashPassword(password), nowIso());
}
