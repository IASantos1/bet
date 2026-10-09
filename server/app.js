import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { parseLivestream, sessionRefused } from './whlive.js';
import { LEAGUE_TREES, leagueKey, SOURCE as WH_SOURCE, SPORT_MARKETS as WH_SPORT_MARKETS, eventsOf, liveGamesByRank } from './winhouse.js';
import { summary as providerSummary } from './providerlimit.js';
import { nowIso, tx, getSetting, setSetting } from './db.js';
import { createFeatured } from './featured.js';
import {
  HttpError, createRateLimiter, hashPassword, hashToken, newSessionToken, parseEuros, verifyPassword,
} from './security.js';
import { placeBets, resultCode, settleEvent, settleBet } from './betting.js';
import {
  promoConfig, savePromoConfig, publicCampaigns, playerPromos, depositOffer, onDeposit, cancelBonus, cancelUserPromos,
  activeDepositBonus, bonusView, freebetView, grantFreebet, freebetCents, bonusBalanceCents, CAMPAIGN_NAMES,
  casinoOffer, claimSpins, spinsRow, spinsView,
} from './promotions.js';
import { playerToken } from './bigbang.js';
import { cashoutOffer, cashOut, offerView, precheck, pending as cashoutPending, cashoutConfig, saveCashoutConfig } from './cashout.js';
import { currentLimits, setLimits, limitsView, checkDeposit } from './limits.js';
import { postTransaction } from './wallet.js';
import { MARKETS, MARKET_ORDER, selectionLabel, codeRank, PERIOD_MARKETS, splitPeriod, splitSpecial } from './markets.js';
import { createSettlementEngine } from './settlement.js';
import { TENNIS_SOURCE } from './tennis.js';
import { SPORT_SPECS, sportTeamImage } from './sports.js';
import { leagueTier } from './leagues.js';
import { createMarketCatalog } from './catalog.js';
import { playableServers, createVideoProxy } from './rapidstream.js';
import {
  CODE_RE, normalizeCode, profileByCode, attribute, ipHash, affiliateConfig, saveAffiliateConfig, affiliateView, affiliateStats,
  affiliateReferrals, affiliateCommissions, adminAffiliates, adminCommissions, adminAudit, reconcile, recover, reviewCommission,
  payCommission, reverseCommission, setAffiliateStatus, onReferredDeposit, refreshProfile, siteUrl, audit as affiliateAudit,
} from './affiliates.js';

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
const REF_COOKIE = 'b62_ref'; // the referral code a visitor arrived with (affiliates)
const REF_DAYS = 30;
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
    freebet: cents(u.freebet_cents || 0), kycStatus: u.kyc_status || 'not_submitted', banned: !!u.banned_at,
    nif: u.nif || null, iban: u.iban || null, ibanName: u.iban_name || null, prefs: parsePrefs(u.prefs),
  };
}

// Account preferences the player can change in the profile (unknown keys are dropped).
const PREF_DEFAULTS = { notifyResults: true, notifyPromos: false, notifySms: false, notifyPush: true, cookiesAnalytics: true, cookiesMarketing: false, shareData: false };
function parsePrefs(raw) {
  let v = {};
  try { v = JSON.parse(raw || '{}') || {}; } catch { /* keep defaults */ }
  return Object.fromEntries(Object.entries(PREF_DEFAULTS).map(([k, d]) => [k, typeof v[k] === 'boolean' ? v[k] : d]));
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
  loginAttempts = 10, registrations = 10, feed = null, tennis = null, sports = {}, tennisLive = null, casino = null, liveSocket = null, propline = null, winhouse = null, winhouseFeed = null, winhouseTracker = null, winhouseLive = null, rapidStream = null, stripe = null, bigbang = null, settlement = createSettlementEngine(db),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: loginAttempts });
  const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: registrations });

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        // Stripe.js (card form) must load from js.stripe.com and talk to api.stripe.com.
        "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self' https://js.stripe.com; connect-src 'self' https://api.stripe.com${rapidStream?.enabled ? ' https:' : ''}; " +
        // Live video (HLS) plays from the stream's own host.
        "media-src 'self' https: blob:; worker-src 'self' blob:; " +
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

  // Stripe webhook: the raw body is what the signature covers, so it comes before the JSON parser
  // (and the CSRF check: Stripe's server posts it, authenticated by the signature).
  app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '512kb' }), (req, res) => {
    if (!stripe) return res.status(404).json({ error: 'Stripe não configurada.' });
    let event;
    try {
      event = stripe.verify(req.body, req.get('stripe-signature'));
    } catch (err) {
      return res.status(400).json({ error: `Webhook: ${err.message}` });
    }
    try {
      stripe.handleEvent(event);
    } catch (err) {
      // 500 → Stripe retries later.
      console.warn(`stripe webhook ${event?.id}: ${err.message}`);
      return res.status(500).json({ error: 'Erro ao processar.' });
    }
    res.json({ received: true });
  });

  // A KYC document (image / PDF as base64): its own, larger body limit, before the general parser.
  const KYC_KINDS = { id_front: 'Documento (frente)', id_back: 'Documento (verso)', passport: 'Passaporte', address: 'Comprovativo de IBAN / morada' };
  const KYC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  app.post('/api/me/kyc', express.json({ limit: '8mb' }), (req, res, next) => {
    try {
      if (!req.is('application/json')) throw new HttpError(415, 'Pedido inválido.');
      const origin = req.get('origin');
      if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch { /* invalid */ }
        const own = [req.get('host'), ...String(req.get('x-forwarded-host') || '').split(',')].map((h) => h?.trim()).filter(Boolean);
        if (!own.includes(host)) throw new HttpError(403, 'Origem não permitida.');
      }
      const token = parseCookies(req.headers.cookie)[COOKIE];
      const user = token ? db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hashToken(token), nowIso()) : null;
      if (!user || user.banned_at) throw new HttpError(401, 'Inicie sessão para continuar.');
      const kind = String(req.body?.kind || '');
      if (!KYC_KINDS[kind]) throw new HttpError(400, 'Tipo de documento inválido.');
      const mime = String(req.body?.mimeType || '');
      if (!KYC_TYPES.has(mime)) throw new HttpError(400, 'Envie uma imagem (JPG, PNG, WEBP) ou um PDF.');
      const data = Buffer.from(String(req.body?.data || ''), 'base64');
      if (!data.length) throw new HttpError(400, 'Ficheiro vazio.');
      if (data.length > 5 * 1024 * 1024) throw new HttpError(400, 'Ficheiro demasiado grande (máximo 5 MB).');
      const fileName = String(req.body?.fileName || 'documento').replace(/[^\w .()-]/g, '_').slice(0, 120);
      tx(db, () => {
        db.prepare(`INSERT INTO kyc_documents (user_id, kind, file_name, mime_type, file_size, data, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
          .run(user.id, KYC_KINDS[kind], fileName, mime, data.length, data, nowIso());
        if (user.kyc_status !== 'approved') db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = ?").run(user.id);
      });
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  });

  app.use('/api', express.json({ limit: '32kb' }));
  // API answers are live data: never kept by the browser, a proxy or the installed app (PWA).
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' && !res.get('Cache-Control')) res.set('Cache-Control', 'no-store');
    next();
  });

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
    // A banned account is signed out everywhere (its sessions are deleted on the ban too).
    if (req.user?.banned_at) req.user = null;
    next();
  });

  const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Inicie sessão para continuar.')));
  const requireAdmin = (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Inicie sessão para continuar.'));
    if (req.user.role !== 'admin') return next(new HttpError(403, 'Acesso reservado a administradores.'));
    next();
  };

  function startSession(res, userId, req = null) {
    const token = newSessionToken();
    const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .run(hashToken(token), userId, expires.toISOString(), nowIso(), String(req?.get?.('user-agent') || '').slice(0, 200) || null, ipHash(req?.ip));
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.isProduction, expires, path: '/',
    });
  }

  const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  // The player as the pages see it, with the promotional balances (bonus, free bets) worked out here.
  const userOut = (u) => ({ ...publicUser(u), freebet: cents(freebetCents(db, u.id)), bonus: cents(bonusBalanceCents(db, u.id)) });

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
        // A watched WinHouse match: the tracker knows the period ("Intervalo", "45+2'"), the live list does not.
        clock: (e.status === 'live' && e.source === 'winhouse' && winhouseTracker?.clockOf?.(e.id)) || e.clock, result: e.result, featured: !!e.featured, source: e.source,
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
      liveOddsMaxAge: config.liveOddsMaxAgeSeconds, builderFactor: config.builderFactor,
      supportEmail: config.supportEmail || undefined, supportPhone: config.supportPhone || undefined,
      sports: SPORTS, version: APP_VERSION,
      // Trial video source for live football (RapidAPI): the match page asks /api/live2/:id.
      rapidStream: !!rapidStream?.enabled,
    });
  });

  // A live game the feed no longer lists (WinHouse ended it) leaves the site within a minute, while
  // it waits to be settled (automatically, or by the operator in Liquidação). Its own page stays.
  const NOT_GONE = "NOT (e.status = 'live' AND e.wh_missing_since IS NOT NULL AND e.wh_missing_since < ?)";
  const goneBefore = () => new Date(Date.now() - 60_000).toISOString();

  // How far ahead future games are imported and shown (admin setting; WINHOUSE_FUTURE_DAYS by default).
  const futureDays = () => Math.min(90, Math.max(0, Number(getSetting(db, 'winhouse.futureDays', config.winhouse.futureDays)) || 0));
  const horizonMs = (min) => Math.max(min, futureDays()) * 86_400_000;

  // Ready-made bets for the sports page: bet builders and four-leg multiples (featured.js).
  const featured = createFeatured(db, {
    // Fewer than six builder cards: the candidate games' pages are read now (their goal totals etc.).
    prefetch: winhouseFeed?.readPageNow ? (ids) => { for (const id of ids) winhouseFeed.readPageNow(id).catch(() => {}); } : null,
  });
  app.get('/api/featured', (_req, res) => res.json(featured.get()));

  // Countries and leagues of the sidebar, with how many games each has open (in play or within a month).
  const openFixtures = (sport) => db.prepare(`SELECT e.id, e.competition FROM events e WHERE e.sport = ?
    AND (e.status = 'live' OR (e.status = 'scheduled' AND e.start_time > ? AND e.start_time < ?))
    AND (e.status = 'live' OR e.source = 'manual' OR EXISTS (SELECT 1 FROM selections s WHERE s.event_id = e.id AND s.active = 1))
    AND ${NOT_GONE}`)
    .all(sport, nowIso(), new Date(Date.now() + horizonMs(31)).toISOString(), goneBefore());
  app.get('/api/leagues', (_req, res) => {
    const out = {};
    for (const [sport, tree] of Object.entries(LEAGUE_TREES)) {
      const counts = new Map();
      for (const e of openFixtures(sport)) counts.set(leagueKey(e.competition), (counts.get(leagueKey(e.competition)) || 0) + 1);
      out[sport] = tree.map(([country, leagues]) => ({ country, leagues: leagues.map((name) => ({ name, count: counts.get(leagueKey(name)) || 0 })) }));
    }
    res.json({ leagues: out });
  });

  app.get('/api/events', (req, res) => {
    const now = nowIso();
    // One league (sidebar): all its games of the next month, names compared loosely.
    const competition = str(req.query.competition, 120);
    if (competition) {
      const sport = str(req.query.sport, 30) || 'futebol';
      const ids = openFixtures(sport).filter((e) => leagueKey(e.competition) === leagueKey(competition)).map((e) => e.id).slice(0, 400);
      const events = ids.length ? loadEvents(`e.id IN (${ids.map(() => '?').join(',')})`, ids, 'e.start_time ASC', 400) : [];
      return res.json({ events, serverTime: now });
    }
    const until = new Date(Date.now() + horizonMs(14)).toISOString();
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
    clauses.push(NOT_GONE);
    params.push(goneBefore());
    res.json({ events: loadEvents(clauses.join(' AND '), params, 'e.start_time ASC', 1500), serverTime: now });
  });

  // One match with every market (the match page).
  app.get('/api/events/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(404, 'Evento não encontrado.');
      // A WinHouse game not read yet: its page now (every market), waiting at most 2.5 s; one read
      // before is refreshed in the background without holding the answer.
      if (winhouseFeed?.readPageNow) {
        await Promise.race([winhouseFeed.readPageNow(id).catch(() => false), new Promise((ok) => setTimeout(ok, 2_500).unref())]);
      }
      const [event] = loadEvents('e.id = ?', [id], 'e.id', 1, { allMarkets: true });
      if (!event) throw new HttpError(404, 'Evento não encontrado.');
      res.json({ event });
    } catch (err) { next(err); }
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

  // ---------- live video (HLS, see whlive.js) ----------
  // Only for WinHouse games in play here: the endpoint never mints a token for an arbitrary id.
  const liveVideoLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
  const liveGameRow = (param) => {
    const v = String(param || '');
    if (!/^\d{1,12}$/.test(v)) return null;
    // Our event id or the WinHouse game id.
    return db.prepare(`SELECT id, external_id, status FROM events WHERE source = 'winhouse' AND (id = ? OR external_id = ?)
      ORDER BY (id = ?) DESC LIMIT 1`).get(Number(v), v, Number(v));
  };
  // embed_url: WinHouse's own player page (what the book frames); hls_url: the raw stream.
  const videoOut = (row, s) => ({ event_id: Number(row.external_id), id: row.id, stream_id: Number(s.streamId), embed_url: s.embedUrl, hls_url: s.hlsUrl, expires_at: s.expiresAt });

  // Live TV is for signed-in players with money in the wallet.
  const videoGate = (req) => {
    if (!req.user) return { status: 401, reason: 'login', error: 'Inicie sessão para ver a transmissão.' };
    if (!(req.user.balance_cents > 0)) return { status: 403, reason: 'balance', error: 'Saldo insuficiente.' };
    return null;
  };

  app.get('/api/live/:eventId', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const gate = videoGate(req);
      if (gate) return res.status(gate.status).json({ success: false, reason: gate.reason, error: gate.error });
      if (!liveVideoLimiter(req.ip)) throw new HttpError(429, 'Demasiados pedidos. Tente daqui a pouco.');
      if (!winhouseLive?.enabled) return res.status(404).json({ success: false, error: 'Transmissões desligadas.' });
      const row = liveGameRow(req.params.eventId);
      if (!row || row.status !== 'live') return res.status(404).json({ success: false, error: 'Jogo não está ao vivo.' });
      const s = await winhouseLive.getLiveStream(row.external_id);
      if (s.error) return res.status(404).json({ success: false, event_id: Number(row.external_id), error: s.error });
      res.json({ success: true, ...videoOut(row, s) });
    } catch (err) { next(err); }
  });

  // Trial: live football video from the RapidAPI streaming API, matched to our game by team names.
  // The same gate as WinHouse's TV (signed in, money in the wallet); WinHouse's TV is not touched.
  app.get('/api/live2/:eventId', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const gate = videoGate(req);
      if (gate) return res.status(gate.status).json({ success: false, reason: gate.reason, error: gate.error });
      if (!liveVideoLimiter(req.ip)) throw new HttpError(429, 'Demasiados pedidos. Tente daqui a pouco.');
      if (!rapidStream?.enabled) return res.status(404).json({ success: false, error: 'Transmissões desligadas.' });
      const ev = eventRow(req.params.eventId);
      if (!ev || ev.status !== 'live' || ev.sport !== 'futebol') return res.status(404).json({ success: false, error: 'Jogo não está ao vivo.' });
      const r = await rapidStream.streamsFor(ev.home, ev.away);
      if (!r.servers.length) return res.status(404).json({ success: false, error: 'Sem transmissão para este jogo.' });
      // Played through our proxy: the stream hosts refuse other sites (CORS) and some want a referer.
      // The ones that answer fastest first; the dead ones are left out (the player starts sooner).
      const ranked = await rapidStream.rank(r.servers);
      res.json({ success: true, servers: ranked.map((s) => ({ name: s.name, url: videoProxy.sign(s.url, { referer: s.referer, ua: s.ua }) })) });
    } catch (err) { next(err); }
  });
  // The proxy itself: only addresses we signed, only for a player allowed to watch.
  const videoProxy = createVideoProxy();
  app.get('/api/tv/p', (req, res, next) => {
    if (!rapidStream?.enabled) return res.status(404).end();
    if (videoGate(req)) return res.status(403).end();
    videoProxy.handle(req, res).catch(next);
  });

  // Every game in play here with video right now (the /ajax/streams list), with its HLS address.
  app.get('/api/live', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const gate = videoGate(req);
      if (gate) return res.status(gate.status).json({ success: false, reason: gate.reason, error: gate.error });
      if (!liveVideoLimiter(req.ip)) throw new HttpError(429, 'Demasiados pedidos. Tente daqui a pouco.');
      if (!winhouseLive?.enabled || !winhouseFeed?.streamOf) return res.json({ success: true, streams: [] });
      const rows = db.prepare("SELECT id, external_id, status FROM events WHERE source = 'winhouse' AND status = 'live'").all()
        .filter((r) => winhouseFeed.streamOf(r.external_id).has).slice(0, 40);
      const streams = [];
      for (let i = 0; i < rows.length; i += 4) {
        const got = await Promise.all(rows.slice(i, i + 4).map((r) => winhouseLive.getLiveStream(r.external_id)));
        got.forEach((s, j) => { if (!s.error) streams.push(videoOut(rows[i + j], s)); });
      }
      res.json({ success: true, streams });
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
    // Signed up through a referral link (the code kept by the page, or the link's cookie): attributed
    // once, on the server; a bad or unknown code never stops the registration.
    const refCode = str(req.body.ref, 12) || parseCookies(req.headers.cookie)[REF_COOKIE] || '';
    if (refCode) {
      try { attribute(db, { referredUserId: Number(lastInsertRowid), code: refCode, ip: req.ip, source: req.body.ref ? 'link' : 'cookie' }); }
      catch (err) { console.warn(`[afiliados] atribuição: ${err.message}`); }
      res.clearCookie(REF_COOKIE, { path: '/' });
    }
    startSession(res, Number(lastInsertRowid), req);
    res.status(201).json({ user: userOut(userById(Number(lastInsertRowid))) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    if (!loginLimiter(`${req.ip}|${email}`)) throw new HttpError(429, 'Demasiadas tentativas. Tente mais tarde.');
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // The administrator's password is stored trimmed; a phone keyboard may add a trailing space.
    const ok = user && (verifyPassword(password, user.password_hash) || (password.trim() !== password && verifyPassword(password.trim(), user.password_hash)));
    if (!ok) throw new HttpError(401, 'Email ou palavra-passe incorretos.');
    if (user.banned_at) throw new HttpError(403, 'Esta conta está bloqueada. Contacte o apoio.');
    startSession(res, user.id, req);
    res.json({ user: userOut(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---------- account ----------

  app.get('/api/me', (req, res) => res.json({ user: req.user ? userOut(req.user) : null }));

  // Profile: only the fields sent are changed (personal data, bank details, preferences).
  app.patch('/api/me', requireUser, (req, res) => {
    const b = req.body || {};
    const set = {};
    if (b.name !== undefined) {
      const name = str(b.name, 80);
      if (name.length < 2) throw new HttpError(400, 'Indique o seu nome.');
      set.name = name;
    }
    if (b.phone !== undefined) set.phone = str(b.phone, 30) || null;
    if (b.nif !== undefined) {
      const nif = str(b.nif, 20).replace(/\D/g, '');
      if (nif && !/^\d{9}$/.test(nif)) throw new HttpError(400, 'NIF inválido: 9 dígitos.');
      set.nif = nif || null;
    }
    if (b.iban !== undefined) {
      const iban = str(b.iban, 60).replace(/\s+/g, '').toUpperCase();
      if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw new HttpError(400, 'IBAN inválido.');
      set.iban = iban || null;
    }
    if (b.ibanName !== undefined) set.iban_name = str(b.ibanName, 80) || null;
    if (b.prefs !== undefined) {
      const cur = parsePrefs(req.user.prefs);
      for (const k of Object.keys(PREF_DEFAULTS)) if (typeof b.prefs?.[k] === 'boolean') cur[k] = b.prefs[k];
      set.prefs = JSON.stringify(cur);
    }
    const keys = Object.keys(set);
    if (keys.length) db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), req.user.id);
    res.json({ user: userOut(userById(req.user.id)) });
  });

  // Active sessions (devices signed in), and signing the others out.
  app.get('/api/me/sessions', requireUser, (req, res) => {
    const mine = hashToken(parseCookies(req.headers.cookie)[COOKIE]);
    const rows = db.prepare('SELECT token_hash, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC').all(req.user.id, nowIso());
    res.json({ sessions: rows.map((r, i) => ({ id: i + 1, current: r.token_hash === mine, createdAt: r.created_at, expiresAt: r.expires_at, device: r.user_agent || null })) });
  });
  app.post('/api/me/sessions/end-others', requireUser, (req, res) => {
    const mine = hashToken(parseCookies(req.headers.cookie)[COOKIE]);
    const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(req.user.id, mine);
    res.json({ ended: changes });
  });

  // Activity summary for the profile.
  app.get('/api/me/stats', requireUser, (req, res) => {
    const one = (sql) => db.prepare(sql).get(req.user.id);
    const all = one('SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS s FROM bets WHERE user_id = ?');
    const won = one("SELECT COUNT(*) AS n, COALESCE(SUM(payout_cents), 0) AS p, COALESCE(MAX(payout_cents), 0) AS m FROM bets WHERE user_id = ? AND status = 'won'");
    const settled = one("SELECT COUNT(*) AS n FROM bets WHERE user_id = ? AND status IN ('won', 'lost')").n;
    const dep = one("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE user_id = ? AND type = 'deposit'").s;
    res.json({
      bets: all.n, staked: cents(all.s), won: cents(won.p), biggestWin: cents(won.m), deposits: cents(dep),
      winRate: settled ? Math.round((won.n / settled) * 100) : 0,
    });
  });

  // Everything we hold about the player, as a file (privacy: "descarregar os meus dados").
  app.get('/api/me/export', requireUser, (req, res) => {
    const u = req.user;
    const data = {
      exportedAt: nowIso(),
      account: { ...userOut(u), casinoActive: undefined, banned: undefined },
      bets: withLegs(db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id').all(u.id)),
      transactions: db.prepare('SELECT type, amount_cents, balance_after_cents, description, created_at FROM transactions WHERE user_id = ? ORDER BY id').all(u.id)
        .map((t) => ({ type: t.type, amount: cents(t.amount_cents), balanceAfter: cents(t.balance_after_cents), description: t.description, at: t.created_at })),
      withdrawals: db.prepare('SELECT amount_cents, iban, status, created_at, decided_at FROM withdrawals WHERE user_id = ? ORDER BY id').all(u.id)
        .map((w) => ({ amount: cents(w.amount_cents), iban: w.iban, status: w.status, at: w.created_at, decidedAt: w.decided_at })),
      documents: db.prepare('SELECT kind, file_name, status, created_at FROM kyc_documents WHERE user_id = ? ORDER BY id').all(u.id),
    };
    res.set({ 'Content-Disposition': `attachment; filename="bet62-dados-${u.id}.json"`, 'Cache-Control': 'no-store' });
    res.json(data);
  });

  // Identity documents sent by the player (KYC), reviewed in the admin.
  app.get('/api/me/kyc', requireUser, (req, res) => {
    res.json({
      status: req.user.kyc_status || 'not_submitted',
      documents: db.prepare('SELECT id, kind, file_name, file_size, status, created_at, reviewed_at FROM kyc_documents WHERE user_id = ? ORDER BY id DESC').all(req.user.id)
        .map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, size: d.file_size, status: d.status, createdAt: d.created_at, reviewedAt: d.reviewed_at })),
    });
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
    if (![1, 3, 7, 30, 90, 180, 365].includes(days)) throw new HttpError(400, 'Período inválido.');
    const current = req.user.excluded_until && req.user.excluded_until > nowIso() ? new Date(req.user.excluded_until) : new Date();
    const until = new Date(Math.max(current.getTime(), Date.now() + days * 86_400_000)).toISOString();
    tx(db, () => {
      db.prepare('UPDATE users SET excluded_until = ? WHERE id = ?').run(until, req.user.id);
      // Promotions end with a self-exclusion (only promotional money; the real balance stays).
      cancelUserPromos(db, req.user.id, 'autoexclusão');
    });
    res.json({ user: userOut(userById(req.user.id)) });
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
    res.json({ balance: cents(req.user.balance_cents), bonus: cents(bonusBalanceCents(db, req.user.id)), freebet: cents(freebetCents(db, req.user.id)), transactions, withdrawals });
  });

  app.post('/api/wallet/deposit', requireUser, async (req, res, next) => {
    try {
      const stripeMode = config.paymentsMode === 'stripe';
      if (config.paymentsMode !== 'demo' && !(stripeMode && stripe)) {
        throw new HttpError(503, 'Os depósitos ainda não estão disponíveis: nenhum fornecedor de pagamentos está configurado.');
      }
      if (req.user.excluded_until && req.user.excluded_until > nowIso()) throw new HttpError(403, 'Conta em autoexclusão: depósitos bloqueados.');
      const amount = parseEuros(req.body.amount, 'Valor do depósito');
      const { minDepositCents, maxDepositCents } = config.limits;
      if (amount < minDepositCents || amount > maxDepositCents) {
        throw new HttpError(400, `O depósito deve estar entre €${cents(minDepositCents)} e €${cents(maxDepositCents)}.`);
      }
      // The player's own deposit limits (responsible gaming).
      checkDeposit(db, req.user, amount);
      // The player picks one promotion for the deposit (sports bonus, casino free spins or none);
      // whether it is given, and how much, is decided here.
      const promo = ['sport', 'casino', 'none'].includes(req.body.promo) ? req.body.promo : req.body.bonus === false ? 'none' : 'sport';
      if (stripeMode) {
        // Inside the site: MB WAY / Multibanco confirmed here, the card through Stripe's form on our page.
        const method = String(req.body.method || '');
        if (method === 'cartao' && !stripe.hasPublishable) throw new HttpError(503, 'Pagamento por cartão indisponível: falta STRIPE_PUBLISHABLE_KEY.');
        let r;
        try {
          r = await stripe.createDeposit(req.user, amount, { method, phone: req.body.phone, promo });
        } catch (err) {
          throw err.ours ? new HttpError(400, err.message) : new HttpError(502, `Não foi possível iniciar o pagamento: ${err.message}`);
        }
        return res.status(201).json({ payment: depositOut(r), clientSecret: r.clientSecret, publishableKey: r.publishableKey, balance: cents(userById(req.user.id).balance_cents) });
      }
      demoDeposit(req, res, amount, promo);
    } catch (err) { next(err); }
  });

  // A deposit's state, for the player's page (asks Stripe if the webhook has not arrived yet).
  app.get('/api/wallet/deposit/:sessionId', requireUser, async (req, res, next) => {
    try {
      if (!stripe) throw new HttpError(404, 'Depósito não encontrado.');
      const r = await stripe.refresh(req.params.sessionId, req.user.id);
      if (!r) throw new HttpError(404, 'Depósito não encontrado.');
      res.json({ ...depositOut(r), balance: cents(userById(req.user.id).balance_cents) });
    } catch (err) { next(err.status && !(err instanceof HttpError) ? new HttpError(502, err.message) : err); }
  });

  const depositOut = (r) => ({
    id: r.id, method: r.method, status: r.status, amount: cents(r.amountCents),
    entity: r.entity, reference: r.reference, expiresAt: r.expiresAt, voucherUrl: r.voucherUrl,
  });

  function demoDeposit(req, res, amount, promo) {
    const method = ['mbway', 'multibanco', 'cartao'].includes(req.body.method) ? req.body.method : 'cartao';
    const label = { mbway: 'MB WAY', multibanco: 'Multibanco', cartao: 'Cartão' }[method];
    const granted = tx(db, () => {
      postTransaction(db, req.user.id, amount, 'deposit', `Depósito ${label} (modo demonstração)`);
      const txId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      const bonus = onDeposit(db, { userId: req.user.id, amountCents: amount, ref: `demo:${txId}`, method: 'demo', choice: promo });
      // Demonstration money never earns a commission unless the operator counts it (test servers).
      onReferredDeposit(db, { userId: req.user.id, amountCents: amount, txId, ref: `demo:${txId}`, demo: true });
      return bonus;
    });
    const u = userById(req.user.id);
    const bonus = !granted ? null : granted.kind === 'casinoFs' ? { name: CAMPAIGN_NAMES.casinoFs, amount: granted.value_cents / 100, spins: granted.spins } : bonusView(granted);
    res.status(201).json({ balance: cents(u.balance_cents), bonus, user: userOut(u) });
  }

  // ---------- affiliate programme ----------

  // The player's referral link, activation, summary and history (affiliates.js decides everything).
  const affLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
  const clickLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 5 });
  const countClick = (req, code) => {
    // One click per visitor and code per hour; never the affiliate's own link counted by bots in a loop.
    if (!clickLimiter(`${req.ip}|${code}`)) return false;
    return db.prepare('UPDATE affiliate_profiles SET clicks = clicks + 1 WHERE referral_code = ?').run(code).changes > 0;
  };
  const affGuard = (req, _res, next) => {
    if (!affLimiter(`${req.ip}|${req.user?.id || ''}`)) return next(new HttpError(429, 'Demasiados pedidos. Tente daqui a pouco.'));
    next();
  };
  app.get('/api/affiliates/me', requireUser, affGuard, (req, res) => res.json(affiliateView(db, req.user.id, { baseUrl: siteUrl(req) })));
  // Recomputes the activation now (after a deposit, the page asks again).
  app.post('/api/affiliates/me/activate', requireUser, affGuard, (req, res) => {
    refreshProfile(db, req.user.id, { actor: req.user.id });
    res.json(affiliateView(db, req.user.id, { baseUrl: siteUrl(req) }));
  });
  app.get('/api/affiliates/me/stats', requireUser, affGuard, (req, res) => res.json(affiliateStats(db, req.user.id)));
  app.get('/api/affiliates/me/referrals', requireUser, affGuard, (req, res) => {
    res.json(affiliateReferrals(db, req.user.id, { page: req.query.page, size: req.query.size }));
  });
  const COMMISSION_STATES = ['pending', 'approved', 'paid', 'reversed', 'rejected'];
  app.get('/api/affiliates/me/commissions', requireUser, affGuard, (req, res) => {
    const status = COMMISSION_STATES.includes(req.query.status) ? req.query.status : null;
    res.json({ items: affiliateCommissions(db, req.user.id, { status }) });
  });
  app.get('/api/affiliates/me/payouts', requireUser, affGuard, (req, res) => {
    res.json({ items: affiliateCommissions(db, req.user.id, { status: 'paid' }) });
  });
  // A visit through a link the page caught (?ref=CODE): counted, rate-limited, nothing attributed yet.
  app.post('/api/affiliates/track', (req, res) => {
    const code = normalizeCode(req.body?.code);
    if (!affLimiter(`track|${req.ip}`)) throw new HttpError(429, 'Demasiados pedidos.');
    if (!affiliateConfig(db).enabled || !CODE_RE.test(code) || !profileByCode(db, code)) return res.json({ ok: false });
    countClick(req, code);
    res.cookie(REF_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: REF_DAYS * 86_400_000, path: '/' });
    res.json({ ok: true });
  });

  // ---------- promotions ----------

  // The campaigns (public) and the player's own: bonuses with their rollover, free bets, ledger.
  const gameName = (id) => bigbang?.enabled ? bigbang.gameNameSync(id) : null;
  app.get('/api/promotions', (req, res) => {
    res.json({ campaigns: publicCampaigns(db), mine: req.user ? playerPromos(db, req.user.id, { gameName }) : null });
  });
  // What a deposit of this amount would earn now (the deposit form shows it; the server decides again on payment).
  app.get('/api/promotions/offer', requireUser, (req, res) => {
    const amount = Math.round(Number(String(req.query.amount || '0').replace(',', '.')) * 100);
    const value = Number.isFinite(amount) ? amount : 0;
    const method = str(req.query.method, 20) || null;
    if (req.query.promo === 'casino') {
      const o = casinoOffer(db, req.user.id, value, { method });
      return res.json({ campaign: o.campaign, name: o.name, spins: o.spins || 0, spinValue: o.spinValue, bonus: o.valueCents ? cents(o.valueCents) : 0, reason: o.reason || null, minDeposit: o.minDeposit ?? null });
    }
    const o = depositOffer(db, req.user.id, value, { method });
    res.json({ campaign: o.campaign, name: o.name, bonus: o.bonusCents ? cents(o.bonusCents) : 0, reason: o.reason || null, minDeposit: o.minDeposit ?? null });
  });
  // The player ends the free spins now: winnings above the value given are paid as real money.
  app.post('/api/me/free-spins/:id/claim', requireUser, (req, res) => {
    const paid = tx(db, () => claimSpins(db, req.user.id, req.params.id));
    res.json({ paid: cents(paid), user: userOut(userById(req.user.id)) });
  });

  // Responsible-gaming limits (stricter at once, looser after 24 h).
  app.get('/api/me/limits', requireUser, (req, res) => res.json({ limits: limitsView(currentLimits(db, req.user)) }));
  app.put('/api/me/limits', requireUser, (req, res) => {
    res.json({ limits: limitsView(setLimits(db, req.user, req.body || {})) });
  });

  app.post('/api/wallet/withdraw', requireUser, reclaimCasino, (req, res) => {
    const amount = parseEuros(req.body.amount, 'Valor do levantamento');
    if (amount < config.limits.minWithdrawCents) throw new HttpError(400, `Levantamento mínimo: €${cents(config.limits.minWithdrawCents)}.`);
    const iban = str(req.body.iban, 60).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw new HttpError(400, 'IBAN inválido.');
    // Withdrawing while a deposit bonus runs gives the bonus up (the player is asked first).
    const running = activeDepositBonus(db, req.user.id);
    if (running && req.body.forfeitBonus !== true) {
      throw new HttpError(409, `Tem o ${CAMPAIGN_NAMES[running.kind]} ativo (€${cents(running.balance_cents).toFixed(2)} de bónus). Ao levantar, o bónus é cancelado.`, { bonusActive: true });
    }
    const balance = tx(db, () => {
      if (running) cancelBonus(db, running.id, 'levantamento pedido com o bónus ativo');
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
    const freebetId = req.body.freebetId ? Number(req.body.freebetId) : null;
    const betIds = tx(db, () => placeBets(db, req.user, { mode: req.body.mode, stakeCents, picks, freebetId }));
    const u = userById(req.user.id);
    res.status(201).json({ betIds, balance: cents(u.balance_cents), user: userOut(u) });
  });

  // The player's tickets; open ones carry their cash-out offer (worked out here, on current prices).
  app.get('/api/bets', requireUser, (req, res) => {
    const rows = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
    const offers = new Map(rows.filter((b) => b.status === 'open').map((b) => [b.id, offerView(cashoutOffer(db, b))]));
    res.json({ bets: withLegs(rows).map((b) => (offers.has(b.id) ? { ...b, cashout: offers.get(b.id) } : b)) });
  });
  // Cash out: checked, then (in play) held for the acceptance delay and checked again before paying.
  app.post('/api/bets/:id/cashout', requireUser, reclaimCasino, async (req, res, next) => {
    const id = Number(req.params.id);
    if (cashoutPending.has(id)) return next(new HttpError(409, 'Já há um pedido de cash out em curso para esta aposta.'));
    cashoutPending.add(id);
    try {
      const seen = Math.round(Number(req.body?.value) * 100);
      const offer = precheck(db, req.user.id, id);
      const delay = offer.live ? cashoutConfig(db).liveDelaySeconds * 1000 : 0;
      if (delay) await new Promise((ok) => setTimeout(ok, delay));
      const r = tx(db, () => cashOut(db, req.user.id, id, seen));
      res.json({ value: cents(r.valueCents), balance: cents(r.balance), user: userOut(userById(req.user.id)) });
    } catch (err) { next(err); } finally { cashoutPending.delete(id); }
  });

  function withLegs(bets) {
    if (!bets.length) return [];
    const ids = bets.map((b) => b.id);
    const legs = db.prepare(
      `SELECT l.bet_id, l.event_id, l.market, l.code, l.odds_x100, l.status, e.sport, e.home, e.away, e.competition, e.home_score, e.away_score,
              e.status AS event_status, e.start_time, e.clock, e.source
         FROM bet_legs l JOIN events e ON e.id = l.event_id WHERE l.bet_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.id`
    ).all(...ids);
    return bets.map((b) => ({
      id: b.id, type: b.type, stake: cents(b.stake_cents), totalOdds: b.total_odds, potential: cents(b.potential_cents),
      status: b.status, payout: cents(b.payout_cents), createdAt: b.created_at, settledAt: b.settled_at,
      freebet: cents(b.freebet_stake_cents || 0), bonusStake: cents(b.bonus_stake_cents || 0), protected: !!b.protected,
      ref: `BT62-${String(b.id).padStart(6, '0')}`,
      legs: legs.filter((l) => l.bet_id === b.id).map((l) => ({
        match: `${l.home} vs ${l.away}`, competition: l.competition, market: l.market,
        marketName: l.market === 'x' ? splitSpecial(l.code)?.group || MARKETS.x.name : MARKETS[l.market] ? marketName(l.sport, l.market) + (PERIOD_MARKETS.has(l.market) && splitPeriod(l.code) ? ` — ${periodLabel(l.sport, splitPeriod(l.code).period)}` : '') : l.market,
        code: l.code, label: selectionLabel(l.market, l.code, l.home, l.away), odds: l.odds_x100 / 100,
        status: l.status, score: l.home_score === null ? null : `${l.home_score} - ${l.away_score}`, eventStatus: l.event_status,
        eventId: l.event_id, sport: l.sport, startTime: l.start_time,
        // In play: the clock as the match pages show it (the WinHouse tracker knows "Intervalo", "45+2'").
        clock: l.event_status === 'live' ? (l.source === 'winhouse' && winhouseTracker?.clockOf?.(l.event_id)) || l.clock || null : null,
      })),
    }));
  }

  // ---------- casino ----------

  // BigBang seamless wallet: the provider reads the balance and sends each bet / win (server to
  // server, signed with our API key; checked in bigbang.js). Configure both URLs on the key in
  // BigBang's dashboard: <site>/api/casino/bb/user and <site>/api/casino/bb/balance.
  app.get('/api/casino/bb/user', (req, res) => {
    if (!bigbang?.enabled) return res.status(503).json({ error: 'casino disabled' });
    const r = bigbang.walletUser(str(req.query.username, 80));
    res.status(r.status).json(r.body);
  });
  app.post('/api/casino/bb/balance', (req, res) => {
    if (!bigbang?.enabled) return res.status(503).json({ error: 'casino disabled' });
    const r = bigbang.walletChange(req.body);
    if (r.status !== 200) console.warn(`bigbang balance_change ${req.body?.transaction_id}: ${r.body.error}`);
    res.status(r.status).json(r.body);
  });

  // BigBang (seamless wallet) when its key is set; otherwise the older transfer-mode aggregator.
  const bb = bigbang?.enabled ? bigbang : null;
  const casinoOn = () => !!bb || (casino && casino.enabled);
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
    const data = await (bb || casino).gamesPage({ offset: q.offset, limit: q.limit, provider: str(q.provider, 20), category: str(q.category, 20), q: str(q.q, 60) });
    // Players get a generic message; the operator sees the provider's reason.
    if (data.error && req.user?.role !== 'admin') data.error = 'O casino está temporariamente indisponível.';
    res.json(data);
  }));

  // The lobby (BigBang): rows of games — Populares, Novos, Slots, Ao vivo, Crash — 10 each.
  app.get('/api/casino/lobby', wrap(async (req, res) => {
    if (!casinoOn() || !bb) return res.json({ enabled: casinoOn(), rows: [] });
    const data = await bb.lobby({ n: 10 });
    if (data.error && req.user?.role !== 'admin') data.error = 'O casino está temporariamente indisponível.';
    res.json(data);
  }));

  // One game: its card, games of the same provider and whether the player's free spins work in it.
  app.get('/api/casino/game/:id', wrap(async (req, res) => {
    if (!bb) throw new HttpError(404, 'Jogo não encontrado.');
    const g = await bb.game(req.params.id);
    if (!g) throw new HttpError(404, 'Jogo não encontrado.');
    const s = req.user ? db.prepare("SELECT * FROM casino_spins WHERE user_id = ? AND status = 'active' AND expires_at > ? ORDER BY id LIMIT 1").get(req.user.id, nowIso()) : null;
    const eligible = !!s && JSON.parse(s.games || '[]').includes(g.id);
    res.json({ game: g, related: await bb.related(g), freeSpins: s ? { id: s.id, eligible, balance: cents(s.balance_cents), spins: s.spins, spinValue: cents(s.spin_value_cents) } : null });
  }));

  // One wallet: the balance shown while playing is the casino balance (the ClassicBet part is 0).
  app.get('/api/casino/wallet', requireUser, wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    if (bb) {
      // Seamless: the money never leaves Bet62. A free-spins game shows the free-spins balance.
      const s = req.query.fs ? spinsRow(db, Number(req.query.fs), req.user.id) : null;
      return res.json({ balance: cents(userById(req.user.id).balance_cents), freeSpins: s ? cents(s.status === 'active' ? s.balance_cents : 0) : null, inCasino: false });
    }
    const u = userById(req.user.id);
    const casinoCents = u.casino_active ? await casino.casinoBalanceCents(u) : 0;
    res.json({ balance: cents(u.balance_cents + casinoCents), inCasino: !!u.casino_active });
  }));

  // Opens a game: "Testar" (demo, virtual money, no account needed), "Jogar" (the player's
  // balance) or the free spins (their own balance, only in the eligible games).
  app.post('/api/casino/launch', wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    const origin = `${req.protocol}://${req.get('host')}`;
    if (bb) {
      const g = await bb.game(req.body.gameId);
      if (!g) throw new HttpError(404, 'Jogo não encontrado.');
      const returnUrl = `${origin}/casino-return.html`;
      if (req.body.demo) return res.json({ url: await bb.launch({ gameId: g.id, demo: true, returnUrl }), demo: true });
      if (!req.user) throw new HttpError(401, 'Inicie sessão para jogar com dinheiro real.');
      const u = userById(req.user.id);
      if (u.excluded_until && u.excluded_until > nowIso()) throw new HttpError(403, 'A sua conta está em autoexclusão. O casino está bloqueado.');
      if (req.body.freeSpins) {
        const s = spinsRow(db, Number(req.body.freeSpins), u.id);
        if (!s || s.status !== 'active' || s.expires_at <= nowIso()) throw new HttpError(400, 'Estas Free Spins já não estão disponíveis.');
        if (!JSON.parse(s.games || '[]').includes(g.id)) throw new HttpError(400, 'As Free Spins não são válidas neste jogo.');
        const url = await bb.launch({ gameId: g.id, token: playerToken(u.id, s.id), returnUrl });
        return res.json({ url, freeSpins: { id: s.id, balance: cents(s.balance_cents) }, balance: cents(u.balance_cents) });
      }
      if (u.balance_cents <= 0) throw new HttpError(400, 'Saldo insuficiente. Faça um depósito para jogar.', { needsDeposit: true });
      const url = await bb.launch({ gameId: g.id, token: playerToken(u.id), returnUrl });
      return res.json({ url, balance: cents(u.balance_cents) });
    }
    if (!req.user) throw new HttpError(401, 'Inicie sessão para continuar.');
    const providerId = Number(req.body.providerId);
    const gameCode = str(req.body.gameCode, 80);
    if (!Number.isInteger(providerId) || !gameCode) throw new HttpError(400, 'Jogo inválido.');
    // The game runs in an iframe; its "home" button lands on a page that sends the tab back to the casino.
    const { url, casinoCents } = await casino.enterGame(req.user, { providerId, gameCode, returnUrl: `${origin}/casino-return.html` });
    res.json({ url, balance: cents(casinoCents) });
  }));

  // Leaving the game: the balance comes back to the ClassicBet wallet.
  app.post('/api/casino/close', requireUser, wrap(async (req, res) => {
    if (!casinoOn() || bb) return res.json({ amount: 0, balance: cents(userById(req.user.id).balance_cents) });
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
      // Where the data lives, and whether it survives a deploy.
      storage: { path: config.dbPath, persistent: config.dbPersistent },
    });
  });

  admin.get('/events', (_req, res) => {
    res.json({ events: loadEvents("e.status IN ('scheduled', 'live') OR e.updated_at > ?", [new Date(Date.now() - 3 * 86_400_000).toISOString()],
      "CASE e.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, e.start_time ASC", 500) });
  });

  // Market catalogue: what the provider really returns, sampled on real games of each sport.
  const catalog = createMarketCatalog(db, [
    // WinHouse: every sport it feeds (the sports with games of that source now).
    winhouse?.enabled && winhouseFeed && {
      source: WH_SOURCE, enabled: () => true,
      sports: () => db.prepare("SELECT sport, COUNT(*) AS n FROM events WHERE source = ? AND status IN ('scheduled', 'live') GROUP BY sport ORDER BY n DESC").all(WH_SOURCE).map((r) => r.sport),
      gameMarkets: (gameId, { live }) => winhouse.markets({ gameId, live }),
      wired: (sport) => new Set(WH_SPORT_MARKETS[sport] || []),
    },
    feed && { sport: 'futebol', source: 'bzzoiro', enabled: () => feed.status().enabled, rawOdds: feed.rawOdds, extra: feed.rawOddsExtra },
    tennis && { sport: 'tenis', source: TENNIS_SOURCE, enabled: () => tennis.status().enabled, rawOdds: tennis.rawOdds },
    ...Object.entries(sports).map(([sport, f]) => ({ sport, source: f.source, enabled: () => f.status().enabled, rawOdds: f.rawOdds })),
  ].filter((p) => p && (p.rawOdds || p.gameMarkets)));
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
    res.json({ users: rows.map((u) => ({ ...userOut(u), bets: u.bets })) });
  });

  // ---------- one player: wallet, free bets, ban, details and identity documents ----------
  const playerRow = (id) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
    if (!u) throw new HttpError(404, 'Utilizador não encontrado.');
    return u;
  };
  // "+10" / "10" adds, "-10" takes away (never below zero).
  const signedCents = (v) => {
    const raw = String(v ?? '').trim().replace(',', '.');
    const negative = raw.startsWith('-');
    return (negative ? -1 : 1) * parseEuros(raw.replace(/^[+-]/, ''), 'Valor');
  };

  admin.post('/users/:id/balance', (req, res) => {
    const u = playerRow(req.params.id);
    const amount = signedCents(req.body?.amount);
    const note = str(req.body?.note, 120);
    const balance = tx(db, () => postTransaction(db, u.id, amount, amount > 0 ? 'admin_credit' : 'admin_debit',
      `${amount > 0 ? 'Crédito' : 'Débito'} do administrador${note ? ` — ${note}` : ''}`, `admin:${req.user.id}`));
    res.json({ ok: true, balance: cents(balance) });
  });

  // A free bet for the player (one token of this amount, valid for `days`).
  admin.post('/users/:id/freebet', (req, res) => {
    const u = playerRow(req.params.id);
    const amount = parseEuros(req.body?.amount, 'Valor');
    const days = Math.min(365, Math.max(1, Number(req.body?.days) || 7));
    tx(db, () => grantFreebet(db, u.id, { amountCents: amount, source: 'admin', ref: `admin:${req.user.id}:${Date.now()}:${u.id}`, validityDays: days,
      description: `Free bet do administrador${req.body?.note ? ` — ${str(req.body.note, 120)}` : ''}` }));
    res.json({ ok: true, freebet: cents(freebetCents(db, u.id)) });
  });
  admin.post('/freebets/:id/cancel', (req, res) => {
    const f = db.prepare('SELECT * FROM freebets WHERE id = ?').get(Number(req.params.id));
    if (!f) throw new HttpError(404, 'Free bet não encontrada.');
    if (f.status !== 'active') throw new HttpError(409, 'Esta free bet já não está ativa.');
    db.prepare("UPDATE freebets SET status = 'cancelled' WHERE id = ?").run(f.id);
    res.json({ ok: true });
  });

  // ---------- cash out (rules and what was paid) ----------
  admin.get('/cashout', (_req, res) => {
    const t = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS stake, COALESCE(SUM(value_cents), 0) AS paid, COALESCE(SUM(fair_cents), 0) AS fair, COALESCE(SUM(live), 0) AS live FROM cashouts').get();
    const recent = db.prepare('SELECT c.*, u.name FROM cashouts c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 30').all()
      .map((c) => ({ betId: c.bet_id, user: c.name, stake: cents(c.stake_cents), value: cents(c.value_cents), fair: cents(c.fair_cents), live: !!c.live, createdAt: c.created_at }));
    res.json({ config: cashoutConfig(db), totals: { count: t.n, stake: cents(t.stake), paid: cents(t.paid), margin: cents(t.fair - t.paid), live: t.live }, recent });
  });
  admin.put('/cashout', (req, res) => res.json({ config: saveCashoutConfig(db, req.body || {}) }));

  // ---------- promotions (configuration, bonuses, decisions) ----------
  admin.get('/promotions', (_req, res) => {
    const who = (r) => ({ userId: r.user_id, user: r.name, email: r.email });
    res.json({
      config: promoConfig(db),
      bonuses: db.prepare('SELECT b.*, u.name, u.email FROM bonuses b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT 200').all()
        .map((b) => ({ ...bonusView(b), ...who(b) })),
      freebets: db.prepare('SELECT f.*, u.name, u.email FROM freebets f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 100').all()
        .map((f) => ({ ...freebetView(f), ...who(f) })),
      spins: db.prepare('SELECT s.*, u.name, u.email FROM casino_spins s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 100').all()
        .map((x) => ({ ...spinsView(x), ...who(x) })),
      log: db.prepare('SELECT l.*, u.name, u.email FROM promo_log l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 200').all()
        .map((l) => ({ campaign: l.campaign, ref: l.ref, outcome: l.outcome, reason: l.reason, createdAt: l.created_at, ...who(l) })),
      totals: db.prepare("SELECT kind, COUNT(*) AS n, SUM(amount_cents) AS granted, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed FROM bonuses GROUP BY kind").all()
        .map((t) => ({ kind: t.kind, count: t.n, granted: cents(t.granted || 0), completed: t.completed })),
    });
  });
  admin.put('/promotions/config', (req, res) => res.json({ config: savePromoConfig(db, req.body || {}) }));
  admin.post('/bonuses/:id/cancel', (req, res) => {
    const reason = str(req.body?.reason, 200);
    if (reason.length < 3) throw new HttpError(400, 'Indique o motivo do cancelamento.');
    tx(db, () => cancelBonus(db, Number(req.params.id), reason));
    res.json({ ok: true });
  });
  // Promotional abuse: no more promotions for this player (active ones cancelled).
  admin.post('/users/:id/promo-block', (req, res) => {
    const u = playerRow(req.params.id);
    const blocked = req.body?.blocked !== false;
    tx(db, () => {
      db.prepare('UPDATE users SET promo_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, u.id);
      if (blocked) cancelUserPromos(db, u.id, str(req.body?.reason, 200) || 'abuso promocional');
    });
    res.json({ ok: true, blocked });
  });

  admin.post('/users/:id/ban', (req, res) => {
    const u = playerRow(req.params.id);
    const banned = req.body?.banned !== false;
    if (banned && (u.role === 'admin' || u.id === req.user.id)) throw new HttpError(400, 'Não é possível banir um administrador.');
    tx(db, () => {
      db.prepare('UPDATE users SET banned_at = ? WHERE id = ?').run(banned ? nowIso() : null, u.id);
      if (banned) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      if (banned) cancelUserPromos(db, u.id, 'conta suspensa');
    });
    res.json({ ok: true, banned });
  });

  admin.get('/users/:id', (req, res) => {
    const u = playerRow(req.params.id);
    const bets = withLegs(db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id));
    const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id)
      .map((t) => ({ id: t.id, type: t.type, amount: cents(t.amount_cents), balanceAfter: cents(t.balance_after_cents), description: t.description, createdAt: t.created_at }));
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id)
      .map((w) => ({ id: w.id, amount: cents(w.amount_cents), iban: w.iban, status: w.status, createdAt: w.created_at, decidedAt: w.decided_at }));
    const documents = db.prepare('SELECT id, kind, file_name, mime_type, file_size, status, created_at, reviewed_at FROM kyc_documents WHERE user_id = ? ORDER BY id DESC').all(u.id)
      .map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, mimeType: d.mime_type, size: d.file_size, status: d.status, createdAt: d.created_at, reviewedAt: d.reviewed_at }));
    const sum = (type) => cents(db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE user_id = ? AND type = ?').get(u.id, type).s);
    res.json({
      user: { ...userOut(u), bets: bets.length, promoBlocked: !!u.promo_blocked }, bets, transactions: txs, withdrawals, documents,
      promotions: playerPromos(db, u.id), limits: limitsView(currentLimits(db, u)),
      totals: { deposits: sum('deposit'), withdrawals: -sum('withdrawal'), staked: -sum('bet'), payouts: sum('payout') },
    });
  });

  const KYC = ['not_submitted', 'pending', 'approved', 'rejected'];
  admin.post('/users/:id/kyc', (req, res) => {
    const u = playerRow(req.params.id);
    const status = str(req.body?.status, 20);
    if (!KYC.includes(status)) throw new HttpError(400, 'Estado de verificação inválido.');
    db.prepare('UPDATE users SET kyc_status = ? WHERE id = ?').run(status, u.id);
    res.json({ ok: true, kycStatus: status });
  });

  // One document: approve / reject it (the account follows: approved when one is approved).
  admin.post('/kyc/:docId', (req, res) => {
    const d = db.prepare('SELECT id, user_id FROM kyc_documents WHERE id = ?').get(Number(req.params.docId));
    if (!d) throw new HttpError(404, 'Documento não encontrado.');
    const status = str(req.body?.status, 20);
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Decisão inválida.');
    tx(db, () => {
      db.prepare('UPDATE kyc_documents SET status = ?, reviewed_at = ? WHERE id = ?').run(status, nowIso(), d.id);
      const left = db.prepare("SELECT status FROM kyc_documents WHERE user_id = ?").all(d.user_id).map((r) => r.status);
      const account = left.includes('approved') ? 'approved' : left.includes('pending') ? 'pending' : 'rejected';
      db.prepare('UPDATE users SET kyc_status = ? WHERE id = ?').run(account, d.user_id);
    });
    res.json({ ok: true });
  });

  // The file itself, for the administrator to look at (never cached).
  admin.get('/kyc/:docId/file', (req, res) => {
    const d = db.prepare('SELECT mime_type, file_name, data FROM kyc_documents WHERE id = ?').get(Number(req.params.docId));
    if (!d) throw new HttpError(404, 'Documento não encontrado.');
    // Only images and PDF are shown in the browser; anything else downloads (a sent file must never run as a page).
    const viewable = /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(d.mime_type);
    res.set({
      'Content-Type': viewable ? d.mime_type : 'application/octet-stream',
      'Content-Disposition': `${viewable ? 'inline' : 'attachment'}; filename="${String(d.file_name).replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
    });
    res.send(Buffer.from(d.data));
  });

  admin.get('/bets', (_req, res) => {
    const bets = db.prepare(
      'SELECT b.*, u.email FROM bets b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT 100'
    ).all();
    const emails = new Map(bets.map((b) => [b.id, b.email]));
    res.json({ bets: withLegs(bets).map((b) => ({ ...b, email: emails.get(b.id) })) });
  });

  admin.post('/casino/test', wrap(async (_req, res) => {
    if (bb) return res.json({ steps: (await bb.diagnose()).steps });
    if (!casino) return res.json({ steps: [{ name: 'Configuração', ok: false, detail: 'Casino não inicializado.' }] });
    res.json({ steps: await casino.diagnose() });
  }));

  admin.get('/casino', wrap(async (req, res) => {
    if (bb) {
      const all = await bb.games();
      const sum = (type) => cents(db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE type = ?').get(type).s);
      const origin = `${req.protocol}://${req.get('host')}`;
      return res.json({
        bigbang: true, enabled: true, sandbox: bb.sandbox, games: all.games.length, providers: all.providers.length, error: all.error,
        bets: -sum('casino_bet'), wins: sum('casino_win'), freeSpinWins: sum('free_spin_win'),
        callbacks: { userData: `${origin}/api/casino/bb/user`, balanceChange: `${origin}/api/casino/bb/balance` }, calls: bb.callLog(),
      });
    }
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
      rapidStream: !!rapidStream?.enabled,
    });
  });

  // Future games: how many days ahead to import (0–90), saved and read at once; "now" reads the lists straight away.
  admin.post('/winhouse/future', async (req, res, next) => {
    try {
      const days = Number(req.body?.days);
      if (!Number.isInteger(days) || days < 0 || days > 90) throw new HttpError(400, 'Dias inválidos (0 a 90).');
      setSetting(db, 'winhouse.futureDays', days);
      let result = null;
      if (req.body?.now && winhouseFeed?.enabled) result = await winhouseFeed.syncPrematch({ force: true });
      res.json({ futureDays: days, result, future: winhouseFeed?.status().last.future ?? null });
    } catch (err) { next(err); }
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
      const gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      if (gameId) return res.json(await winhouseTracker.inspect(gameId));
      // No game given: football games WinHouse has in play right now (a match already over answers
      // "This match is no longer live"), best first; up to five until one has a tracker.
      const r = await winhouse.live();
      const ids = liveGamesByRank(eventsOf(r.body).filter((e) => Number(e.sport_id) === 1 && e.id !== undefined)).map((e) => String(e.id)).slice(0, 5);
      if (!ids.length) throw new HttpError(404, 'Nenhum jogo de futebol ao vivo na WinHouse agora.');
      const tried = [];
      let out = null;
      for (const id of ids) {
        out = await winhouseTracker.inspect(id, { listenMs: 4_000 });
        tried.push({ gameId: id, found: out.widget.found });
        if (out.widget.found) break;
      }
      res.json({ ...out, tried });
    } catch (err) { next(err); }
  });

  // WinHouse: what /ajax/livestream answers for a game and the HLS address made from it (works with
  // WINHOUSE_HLS off, to check access first). Tokens are shortened: the result is meant to be shared.
  admin.post('/winhouse/video', async (req, res, next) => {
    try {
      if (!winhouse?.enabled || !winhouse.livestream) throw new HttpError(409, 'WinHouse desligado: defina WINHOUSE_BASE_URL.');
      let gameId = /^\d{1,15}$/.test(String(req.body?.gameId || '')) ? String(req.body.gameId) : null;
      if (!gameId) {
        const live = db.prepare("SELECT external_id FROM events WHERE source = 'winhouse' AND status = 'live' ORDER BY start_time").all();
        gameId = (live.find((r) => winhouseFeed?.streamOf?.(r.external_id).has) || live[0])?.external_id ?? null;
        if (!gameId) throw new HttpError(404, 'Nenhum jogo WinHouse ao vivo agora.');
      }
      // With the seamless-wallet session when configured (WINHOUSE_WALLET_KEY + WINHOUSE_STREAM_PLAYER).
      let token = winhouseLive ? await winhouseLive.sessionToken() : null;
      let r = await winhouse.livestream(gameId, token);
      // Session refused (expired…): a fresh one, as the player's request does.
      let renewed = false;
      if (token && sessionRefused(r.body)) {
        token = await winhouseLive.sessionToken({ fresh: true });
        if (token) { r = await winhouse.livestream(gameId, token); renewed = true; }
      }
      const parsed = r.body ? parseLivestream(r.body, { hlsPath: config.winhouse.hlsPath, tvBase: config.winhouse.tvUrl }) : { error: 'resposta não é JSON' };
      const mask = (v) => JSON.parse(JSON.stringify(v ?? null).replace(/([?&]t=)([A-Za-z0-9._~%-]{12})[A-Za-z0-9._~%-]+/g, '$1$2…'));
      res.json({
        gameId, hlsEnabled: !!winhouseLive?.enabled, withStream: !!winhouseFeed?.streamOf?.(gameId).has,
        tenant: !!config.winhouse.tenant, apiKey: !!config.winhouse.apiKey, walletKey: !!config.winhouse.walletKey, streamPlayer: config.winhouse.streamPlayer || null,
        session: winhouseLive ? winhouseLive.session() : { configured: false, error: 'WINHOUSE_HLS=1 desligado' }, sentSession: !!token, renewed,
        livestream: { status: r.status, ms: r.ms, contentType: r.contentType, body: mask(r.body), text: r.body ? undefined : String(r.text || '').slice(0, 1500) },
        result: mask(parsed.error ? parsed : { streamId: parsed.streamId, embedUrl: parsed.embedUrl, hlsUrl: parsed.hlsUrl, expiresAt: parsed.expiresAt, expiresIn: parsed.expiresAt - Math.floor(Date.now() / 1000) }),
      });
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

  // ---------- affiliates (admin) ----------

  const reasonOf = (req) => str(req.body?.reason, 300);
  admin.get('/affiliates', (req, res) => {
    res.json({ config: affiliateConfig(db), affiliates: adminAffiliates(db, { q: str(req.query.q, 80) }), reconciliation: reconcile(db) });
  });
  admin.put('/affiliates/config', (req, res) => {
    res.json({ config: saveAffiliateConfig(db, req.body?.config || {}, { actor: req.user.id, reason: reasonOf(req) }) });
  });
  admin.post('/affiliates/:userId/status', (req, res) => {
    const r = setAffiliateStatus(db, Number(req.params.userId), { actor: req.user.id, status: str(req.body?.status, 20), reason: reasonOf(req) });
    res.json({ profile: r.profile, eligibility: r.eligibility });
  });
  admin.get('/affiliates/commissions', (req, res) => {
    const status = COMMISSION_STATES.includes(req.query.status) ? req.query.status : '';
    res.json({ items: adminCommissions(db, { status }) });
  });
  admin.post('/affiliates/commissions/:id/review', (req, res) => {
    res.json({ commission: reviewCommission(db, req.params.id, { actor: req.user.id, decision: str(req.body?.decision, 10), reason: reasonOf(req) }) });
  });
  admin.post('/affiliates/commissions/:id/payout', (req, res) => {
    res.json({ commission: payCommission(db, req.params.id, { actor: req.user.id }) });
  });
  admin.post('/affiliates/commissions/:id/reverse', (req, res) => {
    res.json({ commission: reverseCommission(db, req.params.id, { actor: req.user.id, reason: reasonOf(req) }) });
  });
  admin.get('/affiliates/audit', (req, res) => res.json({ items: adminAudit(db, { limit: req.query.limit }) }));
  // Reconciliation, and recovery of commissions a failed hook left behind.
  admin.post('/affiliates/recover', (req, res) => {
    const r = recover(db);
    affiliateAudit(db, { actor: req.user.id, action: 'recover.run', entityType: 'system', result: 'ok', meta: r });
    res.json({ ...r, reconciliation: reconcile(db) });
  });

  // Trial video source: what the RapidAPI streaming API lists now and which of our live games it covers.
  admin.get('/rapidstream', async (req, res, next) => {
    try {
      if (!rapidStream?.enabled) return res.json({ enabled: false, hint: 'Defina RAPIDAPI_KEY nas Variables do Railway e faça redeploy.' });
      const c = await rapidStream.liveMatches({ fresh: req.query.fresh === '1' });
      const ours = db.prepare("SELECT id, home, away FROM events WHERE status = 'live' AND sport = 'futebol'").all();
      const covered = [];
      for (const e of ours) {
        const f = rapidStream.findMatch(c.matches, e.home, e.away);
        if (f) covered.push({ id: e.id, game: `${e.home} × ${e.away}`, api: `${f.match.home_team_name} × ${f.match.away_team_name}`, score: Math.round(f.score * 100) / 100, playable: playableServers(f.match.servers).length, servers: (f.match.servers || []).length });
      }
      res.json({
        status: rapidStream.status(), ourLive: ours.length, covered,
        sample: c.matches.slice(0, 15).map((m) => ({ game: `${m.home_team_name} × ${m.away_team_name}`, league: m.league_name, status: m.match_status,
          servers: (m.servers || []).map((v) => ({ name: v.name, type: v.type, https: /^https:/.test(String(v.url || '')), hls: /\.m3u8/i.test(String(v.url || '')), referer: !!v.header?.referer })) })),
      });
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
  // Referral links: bet62.plus/GAB052 → the site, with the code kept for the registration.
  app.get('/:code', (req, res, next) => {
    const code = normalizeCode(req.params.code);
    if (!CODE_RE.test(code)) return next();
    if (affiliateConfig(db).enabled && profileByCode(db, code)) {
      countClick(req, code);
      res.cookie(REF_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: REF_DAYS * 86_400_000, path: '/' });
    }
    res.redirect(302, `/?ref=${encodeURIComponent(code)}`);
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
