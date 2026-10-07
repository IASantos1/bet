import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { summary as providerSummary } from './providerlimit.js';
import { nowIso, tx } from './db.js';
import {
  HttpError, createRateLimiter, hashPassword, hashToken, newSessionToken, parseEuros, verifyPassword,
} from './security.js';
import { placeBets, resultCode, settleEvent, settleBet } from './betting.js';
import { postTransaction } from './wallet.js';
import { MARKETS, MARKET_ORDER, selectionLabel, codeRank, PERIOD_MARKETS, splitPeriod, splitSpecial } from './markets.js';
import { createSettlementEngine } from './settlement.js';
import { TENNIS_SOURCE } from './tennis.js';
import { SPORT_SPECS, sportTeamImage } from './sports.js';
import { leagueTier } from './leagues.js';
import { createMarketCatalog } from './catalog.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Version of the frontend: a hash of the script and the stylesheet. index.html is served with the
// files stamped (app.js?v=…), so a browser can never keep running an old script after a deploy,
// and the footer shows it so the running version can be checked.
const readPublic = (f) => fs.readFileSync(path.join(PUBLIC_DIR, f), 'utf8');
export const APP_VERSION = createHash('sha256').update(readPublic('app.js')).update(readPublic('styles.css'))
  .update(readPublic('admin/admin.js')).update(readPublic('admin/admin.css')).digest('hex').slice(0, 8);
const INDEX_HTML = readPublic('index.html')
  .replace('src="app.js"', `src="app.js?v=${APP_VERSION}"`)
  .replace('href="styles.css"', `href="styles.css?v=${APP_VERSION}"`);
// The administration is a separate page at /admin, with its own login.
const ADMIN_HTML = readPublic('admin/index.html').replace(/(\/(?:admin\/admin|styles)\.(?:js|css))"/g, `$1?v=${APP_VERSION}"`);
const COOKIE = 'cb_session';
const SPORTS = ['futebol', 'basquetebol', 'tenis', 'hoquei', 'dardos', 'esports', 'voleibol', 'andebol', 'futsal', 'tenismesa', 'badminton'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- helpers ----------

const cents = (c) => Math.round(c) / 100;
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function ageOn(birthdate, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate || '');
  if (!m) return -1;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return -1;
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) age -= 1;
  return age;
}

// Club badges from the data provider's public image proxy (no token needed).
const providerImg = (type) => (source, id) => (source === 'bzzoiro' && /^\d+$/.test(String(id || '')) ? `https://sports.bzzoiro.com/img/${type}/${id}/?bg=transparent` : null);
const footballLogo = providerImg('team');
// Player photos for tennis and darts from the same image proxy (the page falls back to the flag).
const PLAYER_IMG = { 'bzzoiro-tennis': 'tennis/player', 'bzzoiro-darts': 'darts/player' };
const playerPhoto = (source, id) => (PLAYER_IMG[source] && /^\d+$/.test(String(id || '')) ? `https://sports.bzzoiro.com/img/${PLAYER_IMG[source]}/${id}/?bg=transparent` : null);
// WinHouse sends the badge URL itself (its image CDN, checked when stored).
const winhouseLogo = (source, v) => (source === 'winhouse' && typeof v === 'string' && v.startsWith('https://cdn.sportapi.net/') ? v : null);
const teamLogo = (source, id) => winhouseLogo(source, id) || footballLogo(source, id) || sportTeamImage(source, id) || playerPhoto(source, id);
// League badge; for national-team competitions this is the flag/emblem the provider publishes.
const leagueLogo = providerImg('league');

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, phone: u.phone, birthdate: u.birthdate, role: u.role,
    balance: cents(u.balance_cents), excludedUntil: u.excluded_until, createdAt: u.created_at,
    casinoActive: !!u.casino_active,
  };
}

function oddsInput(v, label) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 1 || n > 1000) throw new HttpError(400, `Odd ${label} inválida (tem de ser maior que 1.00).`);
  return Math.round(n * 100);
}

function scoreInput(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new HttpError(400, `Resultado (${label}) inválido.`);
  return n;
}

const parseJson = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

// ---------- app ----------

export function createApp(db, {
  loginAttempts = 10, registrations = 10, feed = null, tennis = null, sports = {}, tennisLive = null, casino = null, liveSocket = null, propline = null, winhouse = null, winhouseFeed = null, winhouseTracker = null, settlement = createSettlementEngine(db),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: loginAttempts });
  const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: registrations });

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
        // Casino games run inside the page in an iframe from the provider's host.
        `frame-src https:${config.isProduction ? '' : ' http:'}; ` +
        "manifest-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    if (config.isProduction) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use('/api', express.json({ limit: '32kb' }));

  // CSRF: state-changing API calls must be JSON (cross-site forms cannot send it without CORS)
  // and, when the browser sends an Origin, it must be this site.
  app.use('/api', (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (!req.is('application/json')) return next(new HttpError(415, 'Pedido inválido.'));
    const origin = req.get('origin');
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch { /* invalid origin */ }
      // Behind a proxy (Railway, Render…) the public host can arrive as X-Forwarded-Host.
      const own = [req.get('host'), ...String(req.get('x-forwarded-host') || '').split(',')].map((h) => h?.trim()).filter(Boolean);
      if (!own.includes(host)) return next(new HttpError(403, 'Origem não permitida.'));
    }
    next();
  });

  // Session
  const getSession = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`
  );
  app.use('/api', (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.user = token ? getSession.get(hashToken(token), nowIso()) || null : null;
    next();
  });

  const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Inicie sessão para continuar.')));
  const requireAdmin = (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Inicie sessão para continuar.'));
    if (req.user.role !== 'admin') return next(new HttpError(403, 'Acesso reservado a administradores.'));
    next();
  };

  function startSession(res, userId) {
    const token = newSessionToken();
    const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), userId, expires.toISOString(), nowIso());
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.isProduction, expires, path: '/',
    });
  }

  const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  // Single wallet: anything that uses the balance first brings back money left in the casino.
  const reclaimCasino = async (req, _res, next) => {
    if (!req.user?.casino_active || !casino?.enabled) return next();
    try {
      await casino.syncBack(req.user);
      req.user = userById(req.user.id);
      next();
    } catch (err) {
      next(err instanceof HttpError ? err : new HttpError(502, `Não foi possível recuperar o saldo do casino: ${err.message}`));
    }
  };

  // ---------- events ----------


  /**
   * Events with their match-result (1X2) selections — what lists and cards show. With
   * `allMarkets`, also every market grouped for the match page.
   */
  const TENNIS_NAMES = {
    '1x2': 'Vencedor do encontro', ou: 'Total de sets', hcp: 'Handicap de sets',
    pw: 'Vencedor do set', pou: 'Total de jogos', phcp: 'Handicap de jogos', poe: 'Jogos par / ímpar',
  };
  const PERIOD_NAMES = { pw: 'Resultado', pou: 'Total de golos', phcp: 'Handicap', poe: 'Par / ímpar', pbtts: 'Ambas as equipas marcam' };
  const periodLabel = (sport, n) => (sport === 'tenis' ? `${n}.º set` : sport === 'futebol' ? `${n}.ª parte` : `${n}.º período`);
  // Market titles per sport ("Vencedor do encontro" in tennis, regulation time in ice hockey…).
  const marketName = (sport, m) => {
    if (sport === 'tenis' && TENNIS_NAMES[m]) return TENNIS_NAMES[m];
    return SPORT_SPECS[sport]?.marketName?.[m] || PERIOD_NAMES[m] || MARKETS[m].name;
  };

  function loadEvents(where, params = [], order = 'e.start_time ASC', limit = 300, { allMarkets = false } = {}) {
    const events = db.prepare(`SELECT e.* FROM events e WHERE ${where} ORDER BY ${order} LIMIT ${limit}`).all(...params);
    if (!events.length) return [];
    const ids = events.map((e) => e.id);
    const sels = db.prepare(
      `SELECT id, event_id, market, code, odds_x100, active, src FROM selections WHERE event_id IN (${ids.map(() => '?').join(',')})
       ${allMarkets ? '' : "AND (market IN ('1x2', 'ml') OR active = 1)"}`
    ).all(...ids);
    const byEvent = new Map(ids.map((id) => [id, []]));
    for (const s of sels) byEvent.get(s.event_id).push(s);
    const plFresh = (e) => e.pl_live_at && Date.now() - new Date(e.pl_live_at).getTime() <= config.liveOddsMaxAgeSeconds * 1000;
    return events.map((e) => {
      // In play a PropLine price shows only while its live confirmation is recent.
      const rows = byEvent.get(e.id).map((s) => (s.src === 'pl' && e.status === 'live' && !plFresh(e) ? { ...s, active: 0 } : s));
      // Main market on the cards: 1X2, or the match winner in sports without a draw.
      const main = rows.some((s) => s.market === '1x2') || !rows.some((s) => s.market === 'ml') ? '1x2' : 'ml';
      const pub = (s) => ({ id: s.id, market: s.market, code: s.code, label: selectionLabel(s.market, s.code, e.home, e.away), odds: s.odds_x100 / 100, active: !!s.active });
      const out = {
        id: e.id, sport: e.sport, competition: e.competition, home: e.home, away: e.away,
        startTime: e.start_time, status: e.status, homeScore: e.home_score, awayScore: e.away_score,
        clock: e.clock, result: e.result, featured: !!e.featured, source: e.source,
        selections: rows.filter((s) => s.market === main).sort((a, b) => codeRank(main, a.code) - codeRank(main, b.code)).map(pub),
        marketCount: new Set(rows.filter((s) => s.active && s.market !== main).map((s) => (s.market === 'x' ? `x${splitSpecial(s.code)?.id}` : s.market))).size,
        homeLogo: teamLogo(e.source, e.home_team_ext), awayLogo: teamLogo(e.source, e.away_team_ext),
        leagueLogo: leagueLogo(e.source, e.league_ext),
        homeCountry: e.home_country || null, awayCountry: e.away_country || null,
        tier: leagueTier(e.sport, e.competition),
        tennis: e.sport === 'tenis' && e.status === 'live' ? parseJson(e.live_detail) : null,
        liveTracker: e.status === 'live' && (e.source === 'bzzoiro' || (e.source === 'winhouse' && e.sport === 'futebol' && !!winhouseTracker?.enabled)),
        // Live video on WinHouse for this game (the TV filter and the play button).
        stream: e.status === 'live' && e.source === 'winhouse' && !!winhouseFeed?.streamOf?.(e.external_id).has,
      };
      if (allMarkets && out.stream) out.streamUrl = winhouseFeed.streamOf(e.external_id).url;
      if (allMarkets) {
        const block = (m, list, suffix = '') => ({
          market: m, name: marketName(e.sport, m) + suffix,
          selections: list.sort((a, b) => codeRank(m, a.code) - codeRank(m, b.code)).map(pub),
        });
        const full = MARKET_ORDER.filter((m) => !PERIOD_MARKETS.has(m) && m !== 'x')
          .map((m) => block(m, rows.filter((s) => s.market === m)));
        // Every other provider market: one block each, in the provider's order (settled by the operator).
        const specials = new Map();
        for (const s of rows.filter((r) => r.market === 'x').sort((a, b) => a.id - b.id)) {
          const sp = splitSpecial(s.code);
          if (!sp) continue;
          if (!specials.has(sp.id)) specials.set(sp.id, { market: 'x', name: sp.group, selections: [] });
          specials.get(sp.id).selections.push(pub(s));
        }
        // Period markets: one block per set / half, after the full-match ones.
        const periods = [...new Set(rows.filter((s) => PERIOD_MARKETS.has(s.market)).map((s) => splitPeriod(s.code)?.period).filter(Boolean))].sort();
        const perPeriod = periods.flatMap((n) => MARKET_ORDER.filter((m) => PERIOD_MARKETS.has(m))
          .map((m) => block(m, rows.filter((s) => s.market === m && splitPeriod(s.code)?.period === n), ` — ${periodLabel(e.sport, n)}`)));
        out.markets = [...full, ...perPeriod, ...specials.values()].filter((m) => m.selections.length);
      }
      return out;
    });
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/config', (_req, res) => {
    const { limits } = config;
    res.json({
      paymentsMode: config.paymentsMode,
      minStake: cents(limits.minStakeCents), maxStake: cents(limits.maxStakeCents),
      maxPayout: cents(limits.maxPayoutCents), minDeposit: cents(limits.minDepositCents),
      maxDeposit: cents(limits.maxDepositCents), minWithdraw: cents(limits.minWithdrawCents),
      liveOddsMaxAge: config.liveOddsMaxAgeSeconds,
      sports: SPORTS, version: APP_VERSION,
    });
  });

  app.get('/api/events', (req, res) => {
    const now = nowIso();
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const sport = str(req.query.sport, 30);
    const status = str(req.query.status, 20);
    const clauses = [];
    const params = [];
    if (status === 'live') clauses.push("e.status = 'live'");
    else if (status === 'upcoming') { clauses.push("e.status = 'scheduled' AND e.start_time > ? AND e.start_time < ?"); params.push(now, until); }
    else { clauses.push("(e.status = 'live' OR (e.status = 'scheduled' AND e.start_time > ? AND e.start_time < ?))"); params.push(now, until); }
    if (sport) { clauses.push('e.sport = ?'); params.push(sport); }
    // Imported fixtures stay hidden until the feed has priced them.
    clauses.push("(e.status = 'live' OR e.source = 'manual' OR EXISTS (SELECT 1 FROM selections s WHERE s.event_id = e.id AND s.active = 1))");
    res.json({ events: loadEvents(clauses.join(' AND '), params, 'e.start_time ASC', 800), serverTime: now });
  });

  // One match with every market (the match page).
  app.get('/api/events/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, 'Evento não encontrado.');
    const [event] = loadEvents('e.id = ?', [id], 'e.id', 1, { allMarkets: true });
    if (!event) throw new HttpError(404, 'Evento não encontrado.');
    res.json({ event });
  });

  const eventRow = (id) => db.prepare('SELECT * FROM events WHERE id = ?').get(Number(id));

  // The data provider behind an imported event (football or tennis), if it is switched on.
  const providerFor = (ev) => {
    if (ev.source === 'bzzoiro' && feed?.status().enabled) return feed;
    if (ev.source === TENNIS_SOURCE && tennis?.status().enabled) return tennis;
    const other = Object.values(sports).find((f) => f.source === ev.source);
    return other?.status().enabled ? other : null;
  };

  // Statistics and timeline for the match page (feed matches only).
  app.get('/api/events/:id/stats', async (req, res, next) => {
    try {
      const ev = eventRow(req.params.id);
      if (!ev) throw new HttpError(404, 'Evento não encontrado.');
      // WinHouse football: statistics and timeline from its match tracker.
      if (ev.source === 'winhouse' && ev.sport === 'futebol' && winhouseTracker?.enabled && ev.status === 'live') {
        return res.json(await winhouseTracker.matchExtras(ev.external_id));
      }
      const provider = providerFor(ev);
      if (!provider || ev.status === 'scheduled') return res.json({ stats: [], incidents: [] });
      res.json(await provider.matchExtras(ev.external_id, { live: ev.status === 'live' }));
    } catch (err) { next(err); }
  });

  // Head-to-head, model prediction and league table / rankings (before and during the match).
  app.get('/api/events/:id/insights', async (req, res, next) => {
    try {
      const ev = eventRow(req.params.id);
      if (!ev) throw new HttpError(404, 'Evento não encontrado.');
      const provider = providerFor(ev);
      if (!provider) return res.json({ h2h: null, prediction: null, standings: null, rankings: null });
      res.json(await provider.matchInsights(ev));
    } catch (err) { next(err); }
  });

  // Server-sent events for a live match: score/clock/stats, ball position, actions and odds changes.
  app.get('/api/events/:id/live', (req, res) => {
    const ev = eventRow(req.params.id);
    const tracker = ev?.source === 'winhouse' && ev.sport === 'futebol' && winhouseTracker?.enabled ? winhouseTracker : null;
    const socket = ev?.source === 'bzzoiro' ? liveSocket : ev?.source === TENNIS_SOURCE ? tennisLive : tracker;
    if (!ev || ev.status !== 'live' || !socket) return res.status(204).end();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    // WinHouse: its tracker is read only while someone watches the match.
    const unfollow = tracker ? tracker.follow(ev.id, ev.external_id) : null;
    send('snapshot', { ...socket.snapshot(ev.id), following: tracker ? true : socket.isFollowing(ev.external_id) });
    const onMessage = (m) => send(m.type, m.data);
    socket.bus.on(`e:${ev.id}`, onMessage);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      socket.bus.off(`e:${ev.id}`, onMessage);
      unfollow?.();
    });
  });

  app.get('/api/results', (_req, res) => {
    res.json({ events: loadEvents("e.status = 'finished'", [], 'e.updated_at DESC', 30) });
  });

  // ---------- auth ----------

  app.post('/api/auth/register', (req, res) => {
    if (!registerLimiter(req.ip)) throw new HttpError(429, 'Demasiadas tentativas. Tente mais tarde.');
    const name = str(req.body.name, 80);
    const email = str(req.body.email, 160).toLowerCase();
    const phone = str(req.body.phone, 30) || null;
    const birthdate = str(req.body.birthdate, 10);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2) throw new HttpError(400, 'Indique o seu nome.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email inválido.');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'A palavra-passe deve ter pelo menos 8 caracteres.');
    const age = ageOn(birthdate);
    if (age < 0) throw new HttpError(400, 'Data de nascimento inválida.');
    if (age < config.minAge) throw new HttpError(403, `É necessário ter ${config.minAge} anos ou mais para criar conta.`);
    if (req.body.acceptTerms !== true) throw new HttpError(400, 'Tem de aceitar os termos e condições.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Já existe uma conta com este email.');

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (email, name, birthdate, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, name, birthdate, phone, hashPassword(password), nowIso());
    startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: publicUser(userById(Number(lastInsertRowid))) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    if (!loginLimiter(`${req.ip}|${email}`)) throw new HttpError(429, 'Demasiadas tentativas. Tente mais tarde.');
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // The administrator's password is stored trimmed; a phone keyboard may add a trailing space.
    const ok = user && (verifyPassword(password, user.password_hash) || (password.trim() !== password && verifyPassword(password.trim(), user.password_hash)));
    if (!ok) throw new HttpError(401, 'Email ou palavra-passe incorretos.');
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---------- account ----------

  app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  app.patch('/api/me', requireUser, (req, res) => {
    const name = str(req.body.name, 80);
    const phone = str(req.body.phone, 30) || null;
    if (name.length < 2) throw new HttpError(400, 'Indique o seu nome.');
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
    res.json({ user: publicUser(userById(req.user.id)) });
  });

  app.post('/api/me/password', requireUser, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!verifyPassword(String(currentPassword || ''), req.user.password_hash)) throw new HttpError(400, 'Palavra-passe atual incorreta.');
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw new HttpError(400, 'A nova palavra-passe deve ter pelo menos 8 caracteres.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
    // Sign out every other device.
    const token = parseCookies(req.headers.cookie)[COOKIE];
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(req.user.id, hashToken(token));
    res.json({ ok: true });
  });

  app.post('/api/me/self-exclusion', requireUser, (req, res) => {
    const days = Number(req.body.days);
    if (![1, 7, 30, 90, 180, 365].includes(days)) throw new HttpError(400, 'Período inválido.');
    const current = req.user.excluded_until && req.user.excluded_until > nowIso() ? new Date(req.user.excluded_until) : new Date();
    const until = new Date(Math.max(current.getTime(), Date.now() + days * 86_400_000)).toISOString();
    db.prepare('UPDATE users SET excluded_until = ? WHERE id = ?').run(until, req.user.id);
    res.json({ user: publicUser(userById(req.user.id)) });
  });

  // ---------- wallet ----------

  app.get('/api/wallet', requireUser, reclaimCasino, (req, res) => {
    const transactions = db.prepare(
      'SELECT id, type, amount_cents, balance_after_cents, description, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100'
    ).all(req.user.id).map((t) => ({
      id: t.id, type: t.type, amount: cents(t.amount_cents), balanceAfter: cents(t.balance_after_cents),
      description: t.description, createdAt: t.created_at,
    }));
    const withdrawals = db.prepare(
      'SELECT id, amount_cents, iban, status, created_at, decided_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50'
    ).all(req.user.id).map((w) => ({
      id: w.id, amount: cents(w.amount_cents), iban: `${w.iban.slice(0, 4)}…${w.iban.slice(-4)}`, status: w.status,
      createdAt: w.created_at, decidedAt: w.decided_at,
    }));
    res.json({ balance: cents(req.user.balance_cents), transactions, withdrawals });
  });

  app.post('/api/wallet/deposit', requireUser, (req, res) => {
    if (config.paymentsMode !== 'demo') {
      throw new HttpError(503, 'Os depósitos ainda não estão disponíveis: nenhum fornecedor de pagamentos está configurado.');
    }
    if (req.user.excluded_until && req.user.excluded_until > nowIso()) throw new HttpError(403, 'Conta em autoexclusão: depósitos bloqueados.');
    const amount = parseEuros(req.body.amount, 'Valor do depósito');
    const { minDepositCents, maxDepositCents } = config.limits;
    if (amount < minDepositCents || amount > maxDepositCents) {
      throw new HttpError(400, `O depósito deve estar entre €${cents(minDepositCents)} e €${cents(maxDepositCents)}.`);
    }
    const method = ['mbway', 'multibanco', 'cartao'].includes(req.body.method) ? req.body.method : 'cartao';
    const label = { mbway: 'MB WAY', multibanco: 'Multibanco', cartao: 'Cartão' }[method];
    const balance = tx(db, () => postTransaction(db, req.user.id, amount, 'deposit', `Depósito ${label} (modo demonstração)`));
    res.status(201).json({ balance: cents(balance) });
  });

  app.post('/api/wallet/withdraw', requireUser, reclaimCasino, (req, res) => {
    const amount = parseEuros(req.body.amount, 'Valor do levantamento');
    if (amount < config.limits.minWithdrawCents) throw new HttpError(400, `Levantamento mínimo: €${cents(config.limits.minWithdrawCents)}.`);
    const iban = str(req.body.iban, 60).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw new HttpError(400, 'IBAN inválido.');
    const balance = tx(db, () => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO withdrawals (user_id, amount_cents, iban, created_at) VALUES (?, ?, ?, ?)'
      ).run(req.user.id, amount, iban, nowIso());
      return postTransaction(db, req.user.id, -amount, 'withdrawal', 'Pedido de levantamento', `withdrawal:${lastInsertRowid}`);
    });
    res.status(201).json({ balance: cents(balance) });
  });

  // ---------- bets ----------

  app.post('/api/bets', requireUser, reclaimCasino, (req, res) => {
    const stakeCents = parseEuros(req.body.stake, 'Valor da aposta');
    const picks = Array.isArray(req.body.selections)
      ? req.body.selections.map((s) => ({ selectionId: s?.selectionId, odds: s?.odds }))
      : [];
    const betIds = tx(db, () => placeBets(db, req.user, { mode: req.body.mode, stakeCents, picks }));
    res.status(201).json({ betIds, balance: cents(userById(req.user.id).balance_cents) });
  });

  app.get('/api/bets', requireUser, (req, res) => {
    const bets = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
    res.json({ bets: withLegs(bets) });
  });

  function withLegs(bets) {
    if (!bets.length) return [];
    const ids = bets.map((b) => b.id);
    const legs = db.prepare(
      `SELECT l.bet_id, l.market, l.code, l.odds_x100, l.status, e.sport, e.home, e.away, e.competition, e.home_score, e.away_score, e.status AS event_status
         FROM bet_legs l JOIN events e ON e.id = l.event_id WHERE l.bet_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.id`
    ).all(...ids);
    return bets.map((b) => ({
      id: b.id, type: b.type, stake: cents(b.stake_cents), totalOdds: b.total_odds, potential: cents(b.potential_cents),
      status: b.status, payout: cents(b.payout_cents), createdAt: b.created_at, settledAt: b.settled_at,
      legs: legs.filter((l) => l.bet_id === b.id).map((l) => ({
        match: `${l.home} vs ${l.away}`, competition: l.competition, market: l.market,
        marketName: l.market === 'x' ? splitSpecial(l.code)?.group || MARKETS.x.name : MARKETS[l.market] ? marketName(l.sport, l.market) + (PERIOD_MARKETS.has(l.market) && splitPeriod(l.code) ? ` — ${periodLabel(l.sport, splitPeriod(l.code).period)}` : '') : l.market,
        code: l.code, label: selectionLabel(l.market, l.code, l.home, l.away), odds: l.odds_x100 / 100,
        status: l.status, score: l.home_score === null ? null : `${l.home_score} - ${l.away_score}`, eventStatus: l.event_status,
      })),
    }));
  }

  // ---------- casino ----------

  const casinoOn = () => casino && casino.enabled;
  const casinoError = (err) => {
    if (err instanceof HttpError) return err;
    return new HttpError(502, err.message || 'Erro no servidor de jogos.');
  };
  const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(casinoError(err)); }
  };

  app.get('/api/casino/games', wrap(async (req, res) => {
    if (!casinoOn()) return res.json({ enabled: false, games: [], providers: [], total: 0 });
    const q = req.query;
    const data = await casino.gamesPage({ offset: q.offset, limit: q.limit, provider: str(q.provider, 20), category: str(q.category, 20), q: str(q.q, 60) });
    // Players get a generic message; the operator sees the provider's reason.
    if (data.error && req.user?.role !== 'admin') data.error = 'O casino está temporariamente indisponível.';
    res.json(data);
  }));

  // One wallet: the balance shown while playing is the casino balance (the ClassicBet part is 0).
  app.get('/api/casino/wallet', requireUser, wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    const u = userById(req.user.id);
    const casinoCents = u.casino_active ? await casino.casinoBalanceCents(u) : 0;
    res.json({ balance: cents(u.balance_cents + casinoCents), inCasino: !!u.casino_active });
  }));

  // Opens a game: the whole balance goes with the player into the casino.
  app.post('/api/casino/launch', requireUser, wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    const providerId = Number(req.body.providerId);
    const gameCode = str(req.body.gameCode, 80);
    if (!Number.isInteger(providerId) || !gameCode) throw new HttpError(400, 'Jogo inválido.');
    const origin = `${req.protocol}://${req.get('host')}`;
    // The game runs in an iframe; its "home" button lands on a page that sends the tab back to the casino.
    const { url, casinoCents } = await casino.enterGame(req.user, { providerId, gameCode, returnUrl: `${origin}/casino-return.html` });
    res.json({ url, balance: cents(casinoCents) });
  }));

  // Leaving the game: the balance comes back to the ClassicBet wallet.
  app.post('/api/casino/close', requireUser, wrap(async (req, res) => {
    if (!casinoOn()) return res.json({ amount: 0, balance: cents(req.user.balance_cents) });
    const amountCents = await casino.leaveGame(req.user);
    res.json({ amount: cents(amountCents), balance: cents(userById(req.user.id).balance_cents) });
  }));

  // ---------- admin ----------

  const admin = express.Router();
  admin.use(requireAdmin);

  admin.get('/stats', (_req, res) => {
    const one = (sql, ...p) => db.prepare(sql).get(...p);
    const users = one("SELECT COUNT(*) AS n FROM users WHERE role = 'user'").n;
    const open = one("SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS s FROM bets WHERE status = 'open'");
    const settled = one("SELECT COALESCE(SUM(stake_cents), 0) AS s, COALESCE(SUM(payout_cents), 0) AS p FROM bets WHERE status <> 'open'");
    const pending = one("SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS s FROM withdrawals WHERE status = 'pending'");
    const balances = one("SELECT COALESCE(SUM(balance_cents), 0) AS s FROM users").s;
    res.json({
      users, openBets: open.n, openStake: cents(open.s), settledStake: cents(settled.s), settledPayout: cents(settled.p),
      grossRevenue: cents(settled.s - settled.p), pendingWithdrawals: pending.n, pendingWithdrawalAmount: cents(pending.s),
      customerBalances: cents(balances),
    });
  });

  admin.get('/events', (_req, res) => {
    res.json({ events: loadEvents("e.status IN ('scheduled', 'live') OR e.updated_at > ?", [new Date(Date.now() - 3 * 86_400_000).toISOString()],
      "CASE e.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, e.start_time ASC", 500) });
  });

  // Market catalogue: what the provider really returns, sampled on real games of each sport.
  const catalog = createMarketCatalog(db, [
    feed && { sport: 'futebol', source: 'bzzoiro', enabled: () => feed.status().enabled, rawOdds: feed.rawOdds, extra: feed.rawOddsExtra },
    tennis && { sport: 'tenis', source: TENNIS_SOURCE, enabled: () => tennis.status().enabled, rawOdds: tennis.rawOdds },
    ...Object.entries(sports).map(([sport, f]) => ({ sport, source: f.source, enabled: () => f.status().enabled, rawOdds: f.rawOdds })),
  ].filter((p) => p && p.rawOdds));
  admin.get('/market-catalog', (_req, res) => res.json({ catalog: catalog.last(), running: catalog.running() }));
  admin.post('/market-catalog/run', async (req, res, next) => {
    try {
      const sample = Math.min(30, Math.max(3, Number(req.body.sample) || 12));
      res.json({ catalog: await catalog.run({ sample }) });
    } catch (err) { next(err); }
  });

  // Diagnostics: what the data provider answers for this event's odds, as received.
  admin.get('/events/:id/provider-odds', async (req, res, next) => {
    try {
      const ev = eventRow(req.params.id);
      if (!ev) throw new HttpError(404, 'Evento não encontrado.');
      const provider = providerFor(ev);
      if (!provider?.rawOdds) throw new HttpError(409, 'Evento sem fornecedor de odds (futebol usa o painel Dados ao vivo).');
      let data;
      try { data = await provider.rawOdds(ev.external_id); } catch (err) { data = { erro: err.message }; }
      const text = JSON.stringify(data, null, 2);
      res.json({ status: ev.status, liveOddsAt: ev.live_odds_at, raw: text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text });
    } catch (err) { next(err); }
  });

  function writeOdds(eventId, odds) {
    if (!odds || typeof odds !== 'object') return;
    const upsert = db.prepare(
      `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, '1x2', ?, ?, 1)
       ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1, src = NULL`
    );
    for (const code of ['1', 'X', '2']) {
      if (!(code in odds)) continue;
      const v = oddsInput(odds[code], code);
      if (v === null) db.prepare("UPDATE selections SET active = 0 WHERE event_id = ? AND market = '1x2' AND code = ?").run(eventId, code);
      else upsert.run(eventId, code, v);
    }
  }

  admin.post('/events', (req, res) => {
    const sport = SPORTS.includes(req.body.sport) ? req.body.sport : null;
    const competition = str(req.body.competition, 80);
    const home = str(req.body.home, 80);
    const away = str(req.body.away, 80);
    const start = new Date(req.body.startTime);
    if (!sport) throw new HttpError(400, 'Desporto inválido.');
    if (!competition || !home || !away) throw new HttpError(400, 'Preencha competição e equipas.');
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Data de início inválida.');
    const odds = req.body.odds || {};
    if (oddsInput(odds['1'], '1') === null || oddsInput(odds['2'], '2') === null) throw new HttpError(400, 'Indique pelo menos as odds 1 e 2.');
    const id = tx(db, () => {
      const ts = nowIso();
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO events (sport, competition, home, away, start_time, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(sport, competition, home, away, start.toISOString(), req.body.featured ? 1 : 0, ts, ts);
      writeOdds(Number(lastInsertRowid), odds);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ event: loadEvents('e.id = ?', [id])[0] });
  });

  function editableEvent(id) {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(id));
    if (!ev) throw new HttpError(404, 'Evento não encontrado.');
    if (ev.status === 'finished' || ev.status === 'cancelled') throw new HttpError(409, 'Evento já encerrado.');
    return ev;
  }

  admin.patch('/events/:id', (req, res) => {
    const ev = editableEvent(req.params.id);
    const b = req.body;
    tx(db, () => {
      const set = {};
      if (b.status !== undefined) {
        if (!['scheduled', 'live'].includes(b.status)) throw new HttpError(400, 'Estado inválido.');
        set.status = b.status;
      }
      if (b.homeScore !== undefined) set.home_score = b.homeScore === null ? null : scoreInput(b.homeScore, 'casa');
      if (b.awayScore !== undefined) set.away_score = b.awayScore === null ? null : scoreInput(b.awayScore, 'fora');
      if (b.clock !== undefined) set.clock = str(b.clock, 20) || null;
      if (b.featured !== undefined) set.featured = b.featured ? 1 : 0;
      if (b.startTime !== undefined) {
        const d = new Date(b.startTime);
        if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Data de início inválida.');
        set.start_time = d.toISOString();
      }
      if (set.status === 'live') {
        if (set.home_score === undefined && ev.home_score === null) set.home_score = 0;
        if (set.away_score === undefined && ev.away_score === null) set.away_score = 0;
      }
      const keys = Object.keys(set);
      if (keys.length) {
        db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...keys.map((k) => set[k]), nowIso(), ev.id);
      }
      writeOdds(ev.id, b.odds);
      if (typeof b.suspended === 'boolean') {
        db.prepare('UPDATE selections SET active = ? WHERE event_id = ?').run(b.suspended ? 0 : 1, ev.id);
      }
    });
    res.json({ event: loadEvents('e.id = ?', [ev.id])[0] });
  });

  admin.post('/events/:id/result', (req, res) => {
    const ev = editableEvent(req.params.id);
    const home = scoreInput(req.body.homeScore, 'casa');
    const away = scoreInput(req.body.awayScore, 'fora');
    const settled = tx(db, () => {
      db.prepare(
        "UPDATE events SET status = 'finished', home_score = ?, away_score = ?, result = ?, clock = 'Final', updated_at = ? WHERE id = ?"
      ).run(home, away, resultCode(home, away), nowIso(), ev.id);
      return settleEvent(db, ev.id, { source: 'admin', userId: req.user.id, note: str(req.body.note, 200) || null });
    });
    res.json({ event: loadEvents('e.id = ?', [ev.id])[0], settledBets: settled });
  });

  admin.post('/events/:id/cancel', (req, res) => {
    const ev = editableEvent(req.params.id);
    const settled = tx(db, () => {
      db.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), ev.id);
      return settleEvent(db, ev.id, { source: 'admin', userId: req.user.id, note: str(req.body.reason, 200) || 'Anulado pelo operador' });
    });
    res.json({ event: loadEvents('e.id = ?', [ev.id])[0], settledBets: settled });
  });

  // Operator-settled markets ('x'): one selection of a finished event won, lost or void.
  admin.post('/events/:id/special', (req, res) => {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
    if (!ev) throw new HttpError(404, 'Evento não encontrado.');
    if (ev.status !== 'finished') throw new HttpError(409, 'Só depois de o evento terminar.');
    const code = String(req.body?.code || '');
    const result = String(req.body?.result || '');
    if (!['won', 'lost', 'void'].includes(result)) throw new HttpError(400, 'Resultado inválido.');
    const settled = tx(db, () => {
      const legs = db.prepare("SELECT id, bet_id FROM bet_legs WHERE event_id = ? AND market = 'x' AND code = ? AND status = 'open'").all(ev.id, code);
      if (!legs.length) throw new HttpError(404, 'Nenhuma aposta em aberto nessa seleção.');
      for (const l of legs) db.prepare('UPDATE bet_legs SET status = ? WHERE id = ?').run(result, l.id);
      const betIds = [...new Set(legs.map((l) => l.bet_id))];
      let paid = 0;
      for (const id of betIds) paid += settleBet(db, id);
      const sp = splitSpecial(code);
      db.prepare(`INSERT INTO settlements (event_id, action, home_score, away_score, bets_settled, payout_cents, source, user_id, note, created_at)
        VALUES (?, 'result', ?, ?, ?, ?, 'admin', ?, ?, ?)`).run(ev.id, ev.home_score, ev.away_score, betIds.length, paid, req.user.id,
        `${sp?.group || 'Mercado'}: ${sp?.label || code} → ${{ won: 'ganha', lost: 'perdida', void: 'anulada' }[result]}`.slice(0, 200), nowIso());
      return betIds.length;
    });
    res.json({ settledBets: settled });
  });

  // Settlement desk: what is at stake, what needs a decision, and everything already settled.
  admin.get('/settlement', (_req, res) => {
    res.json({ summary: settlement.summary(), queue: settlement.queue(), history: settlement.history(50) });
  });

  admin.post('/settlement/run', (_req, res) => {
    res.json({ result: settlement.runOnce(), summary: settlement.summary() });
  });

  admin.get('/withdrawals', (_req, res) => {
    const rows = db.prepare(
      `SELECT w.*, u.email, u.name FROM withdrawals w JOIN users u ON u.id = w.user_id
        ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.id DESC LIMIT 100`
    ).all();
    res.json({
      withdrawals: rows.map((w) => ({
        id: w.id, user: w.name, email: w.email, amount: cents(w.amount_cents), iban: w.iban, status: w.status,
        createdAt: w.created_at, decidedAt: w.decided_at,
      })),
    });
  });

  admin.post('/withdrawals/:id/:decision', (req, res) => {
    const { decision } = req.params;
    if (decision !== 'approve' && decision !== 'reject') throw new HttpError(404, 'Ação desconhecida.');
    tx(db, () => {
      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(req.params.id));
      if (!w) throw new HttpError(404, 'Levantamento não encontrado.');
      if (w.status !== 'pending') throw new HttpError(409, 'Levantamento já decidido.');
      db.prepare('UPDATE withdrawals SET status = ?, decided_at = ? WHERE id = ?')
        .run(decision === 'approve' ? 'approved' : 'rejected', nowIso(), w.id);
      if (decision === 'reject') {
        postTransaction(db, w.user_id, w.amount_cents, 'withdrawal_refund', 'Levantamento rejeitado — valor devolvido', `withdrawal:${w.id}`);
      }
    });
    res.json({ ok: true });
  });

  admin.get('/users', (_req, res) => {
    const rows = db.prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bets
         FROM users u ORDER BY u.id DESC LIMIT 200`
    ).all();
    res.json({ users: rows.map((u) => ({ ...publicUser(u), bets: u.bets })) });
  });

  admin.get('/bets', (_req, res) => {
    const bets = db.prepare(
      'SELECT b.*, u.email FROM bets b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT 100'
    ).all();
    const emails = new Map(bets.map((b) => [b.id, b.email]));
    res.json({ bets: withLegs(bets).map((b) => ({ ...b, email: emails.get(b.id) })) });
  });

  admin.post('/casino/test', wrap(async (_req, res) => {
    if (!casino) return res.json({ steps: [{ name: 'Configuração', ok: false, detail: 'Casino não inicializado.' }] });
    res.json({ steps: await casino.diagnose() });
  }));

  admin.get('/casino', wrap(async (_req, res) => {
    if (!casinoOn()) {
      return res.json({ enabled: false, urlSet: !!config.casino.baseUrl, tokenSet: !!config.casino.token });
    }
    let agent = null;
    let error = null;
    try { agent = await casino.agentInfo(); } catch (err) { error = err.message; }
    const moved = db.prepare(
      "SELECT type, COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE type IN ('casino_out', 'casino_in') GROUP BY type"
    ).all().reduce((acc, r) => ({ ...acc, [r.type]: cents(r.s) }), {});
    res.json({ enabled: true, agent, error, sentToCasino: -(moved.casino_out || 0), returnedFromCasino: moved.casino_in || 0 });
  }));

  admin.get('/feed', (_req, res) => {
    res.json({
      ...(feed ? feed.status() : { enabled: false, provider: 'sports.bzzoiro.com' }),
      tennis: tennis ? { ...tennis.status(), liveSocket: tennisLive ? tennisLive.status() : { enabled: false } } : { enabled: false },
      sports: Object.values(sports).map((f) => f.status()),
      propline: propline ? propline.status() : { enabled: false, keySet: false },
      requestBudget: providerSummary()[0] || null,
      winhouse: { enabled: !!winhouse?.enabled, feed: winhouseFeed ? winhouseFeed.status() : null },
    });
  });

  // WinHouse (evaluation): call every route from this server and report what comes back.
  admin.post('/winhouse/health', async (req, res, next) => {
    try {
      if (!winhouse?.enabled) throw new HttpError(409, 'WinHouse desligado: defina WINHOUSE_BASE_URL nas variáveis do servidor.');
      const gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      res.json(await winhouse.health({ gameId }));
    } catch (err) { next(err); }
  });

  // WinHouse: the match tracker's raw answers for one game (or the first live football match).
  admin.post('/winhouse/tracker', async (req, res, next) => {
    try {
      if (!winhouseTracker?.enabled) throw new HttpError(409, 'Tracker WinHouse desligado: defina WINHOUSE_BASE_URL (e não WINHOUSE_TRACKER=0).');
      let gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      if (!gameId) {
        gameId = db.prepare("SELECT external_id FROM events WHERE source = 'winhouse' AND sport = 'futebol' AND status = 'live' ORDER BY start_time LIMIT 1").get()?.external_id ?? null;
        if (!gameId) throw new HttpError(404, 'Nenhum jogo de futebol ao vivo da WinHouse agora.');
      }
      res.json(await winhouseTracker.inspect(gameId));
    } catch (err) { next(err); }
  });

  // WinHouse: every market one game page offers (to map new ones).
  // WinHouse: the routes its own iframe uses (pages + scripts), to find the live game page.
  admin.post('/winhouse/discover', async (req, res, next) => {
    try {
      if (!winhouse?.enabled) throw new HttpError(409, 'WinHouse desligado: defina WINHOUSE_BASE_URL nas variáveis do servidor.');
      const gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      res.json(await winhouse.discover({ gameId }));
    } catch (err) { next(err); }
  });

  admin.post('/winhouse/markets', async (req, res, next) => {
    try {
      if (!winhouse?.enabled) throw new HttpError(409, 'WinHouse desligado: defina WINHOUSE_BASE_URL nas variáveis do servidor.');
      const gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      res.json(await winhouse.markets({ gameId, live: req.body?.live === true }));
    } catch (err) { next(err); }
  });

  // Second odds source: sync now, and its raw odds for one event.
  admin.post('/propline/sync', async (_req, res, next) => {
    try {
      if (!propline?.enabled) throw new HttpError(409, 'PropLine desligado: defina PROPLINE_API_KEY no servidor.');
      await propline.tick();
      res.json({ status: propline.status() });
    } catch (err) { next(err); }
  });
  admin.get('/events/:id/propline-odds', async (req, res, next) => {
    try {
      if (!propline?.enabled) throw new HttpError(409, 'PropLine desligado: defina PROPLINE_API_KEY no servidor.');
      let data;
      try { data = await propline.rawOdds(Number(req.params.id)); } catch (err) { data = { erro: err.message }; }
      if (data === null) data = { erro: 'Jogo ainda não associado a nenhum jogo da PropLine.' };
      const text = JSON.stringify(data, null, 2);
      res.json({ raw: text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text });
    } catch (err) { next(err); }
  });

  admin.post('/feed/sync', async (_req, res, next) => {
    try {
      if (!feed || !feed.status().enabled) throw new HttpError(409, 'Feed desativado: defina BZZOIRO_API_TOKEN no servidor.');
      const result = await feed.syncAll();
      if (tennis?.status().enabled) result.tennis = await tennis.syncAll();
      for (const [key, f] of Object.entries(sports)) if (f.status().enabled) result[key] = await f.syncAll();
      res.json({ result, status: feed.status() });
    } catch (err) { next(err); }
  });

  app.use('/api/admin', admin);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Recurso não encontrado.')));

  // ---------- static frontend ----------
  // Pages, scripts and styles are revalidated on every load (ETag), so a new version is picked up
  // right after a deploy; images and icons can be cached for a day.
  app.get(['/', '/index.html'], (_req, res) => {
    res.set('Cache-Control', 'no-cache').type('html').send(INDEX_HTML);
  });
  app.get(['/admin', '/admin/', '/admin/index.html', '/administrador'], (_req, res) => {
    res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow' }).type('html').send(ADMIN_HTML);
  });
  app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders(res, file) {
      res.setHeader('Cache-Control', /\.(html|js|css|json)$/.test(file) ? 'no-cache' : 'public, max-age=86400');
    },
  }));

  // ---------- errors ----------
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Pedido demasiado grande.' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  });

  return app;
}
