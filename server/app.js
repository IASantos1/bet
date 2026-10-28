import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { loopDelay } from './loopdelay.js';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { parseLivestream, sessionRefused } from './whlive.js';
import { divisionOf } from './footballdivisions.js';
import { COUNTRY_SPORTS, leagueCountry } from './countryleagues.js';
import { TOUR_GROUPS, tourOf, tourLabel } from './tennistours.js';
import { LEAGUE_TREES, leagueKey, skippedLeagues, SOURCE as WH_SOURCE, SPORT_MARKETS as WH_SPORT_MARKETS, namedWinnerMarket, eventsOf, liveGamesByRank } from './winhouse.js';
import { summary as providerSummary } from './providerlimit.js';
import { nowIso, tx, getSetting, setSetting } from './db.js';
import { createSkins, SkinError } from './skins.js';
import { createBanners, BannerError } from './banners.js';
import { createCollections, CollectionError } from './collections.js';
import { createSeasonal } from './seasonal.js';
import { createSpotlights, SpotlightError, AFTER as SPOT_AFTER } from './spotlights.js';
import { createFeatured, isBigTeam } from './featured.js';
import {
  HttpError, createRateLimiter, hashPassword, hashToken, newSessionToken, parseEuros, verifyPassword, isLegacyHash,
} from './security.js';
import { placeBets, resultCode, settleEvent, settleBet } from './betting.js';
import {
  promoConfig, campaignOpen, savePromoConfig, publicCampaigns, playerPromos, depositOffer, onDeposit, cancelBonus, cancelUserPromos,
  activeDepositBonus, bonusView, freebetView, grantFreebet, freebetCents, bonusBalanceCents, CAMPAIGN_NAMES,
  casinoOffer, claimSpins, spinsRow, spinsView, spinsBalance, spinBet, playableGames, chooseSpinsGame, palaceSpinsBalance, grantAdminSpins,
} from './promotions.js';
import { screen as screenSanctions, decideHit, sanctionsView } from './sanctions.js';
import { checkKycDeposit, riskConfig, saveRiskConfig, setRiskProfile, riskAlerts, riskOverview, exposure, logRefusal, PROFILES as RISK_PROFILES } from './risk.js';
import { createPromo, updatePromo, setPromoStatus, grantPromo, promoList, promoHistory, spinsAudit, walletBreakdown, fromRow as fromPromoRow } from './fspromos.js';
import { playerToken } from './bigbang.js';
import { cashoutOffer, cashOut, offerView, precheck, pending as cashoutPending, cashoutConfig, saveCashoutConfig } from './cashout.js';
import { currentLimits, setLimits, limitsView, checkDeposit } from './limits.js';
import { postTransaction } from './wallet.js';
import { compression, staticText } from './compress.js';
import { createAssets } from './assets.js';
import { importNovo, connectNovo } from './importnovo.js';
import { withdrawEligibility, instantWithdrawal } from './withdrawrules.js';
import { payoutState } from './revolut.js';
import { MARKETS, MARKET_ORDER, selectionLabel, codeRank, PERIOD_MARKETS, splitPeriod, splitSpecial, TENNIS_AUTO } from './markets.js';
import { createSettlementEngine } from './settlement.js';
import { createCampaigns, unsubscribe, SEGMENTS } from './campaigns.js';
import { TENNIS_SOURCE } from './tennis.js';
import { SPORT_SPECS, sportTeamImage } from './sports.js';
import { leagueTier } from './leagues.js';
import { createMarketCatalog } from './catalog.js';
import { createMatchPicks } from './picks.js';
import { newSecret, verifyCode, otpauthUrl } from './totp.js';
import { playableServers, createVideoProxy, createStreamRelay } from './rapidstream.js';
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
export const APP_VERSION = ['app.js', 'styles.css', 'splash.js', 'trkclips.js', 'trk3dmath.js', 'sporticons.js', 'trk3d.js', 'admin/admin.js', 'admin/admin.css']
  .reduce((h, f) => h.update(readPublic(f)), createHash('sha256')).digest('hex').slice(0, 8);
// The scripts' own imports are versioned too (assets.js), and the app's modules are announced in the
// page (modulepreload) so they download alongside app.js instead of after it.
const assets = createAssets(PUBLIC_DIR);
const INDEX_HTML = readPublic('index.html')
  .replace('src="app.js"', `src="app.js?v=${APP_VERSION}"`)
  .replace('src="splash.js"', `src="splash.js?v=${APP_VERSION}"`)
  .replace('href="styles.css"', `href="styles.css?v=${APP_VERSION}"`)
  .replace(/(\s*)(<script type="module" src="app\.js)/, (m, sp, tag) => `${assets.preloads('app.js').map((l) => `${sp}${l}`).join('')}${sp}${tag}`);
// The administration is a separate page at /admin, with its own login.
const ADMIN_HTML = readPublic('admin/index.html').replace(/(\/(?:admin\/admin|styles)\.(?:js|css))"/g, `$1?v=${APP_VERSION}"`);
const COOKIE = 'cb_session';
const REF_COOKIE = 'b62_ref'; // the referral code a visitor arrived with (affiliates)
const REF_DAYS = 30;
const SPORTS = ['futebol', 'basquetebol', 'tenis', 'hoquei', 'dardos', 'voleibol', 'andebol', 'futsal', 'tenismesa', 'badminton',
  'futamericano', 'basebol', 'raguebi', 'criquete', 'boxe', 'mma'];
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
// WinHouse sends the badge URL itself (checked when stored: https only).
const winhouseLogo = (source, v) => (source === 'winhouse' && typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : null);
const teamLogo = (source, id) => winhouseLogo(source, id) || footballLogo(source, id) || sportTeamImage(source, id) || playerPhoto(source, id);
// League badge; for national-team competitions this is the flag/emblem the provider publishes.
const leagueLogo = providerImg('league');

/** The profile emblems a player gets one of at random on sign-up (public/media/avatar-<name>.webp). */
const AVATARS = ['robo', 'hood'];

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, phone: u.phone, birthdate: u.birthdate, role: u.role,
    balance: cents(u.balance_cents), excludedUntil: u.excluded_until, createdAt: u.created_at,
    casinoActive: !!u.casino_active,
    freebet: cents(u.freebet_cents || 0), kycStatus: u.kyc_status || 'not_submitted', banned: !!u.banned_at,
    nif: u.nif || null, iban: u.iban || null, ibanName: u.iban_name || null, prefs: parsePrefs(u.prefs),
    promoAskedAt: u.promo_asked_at || null,
    // Accounts from before emblems keep one of the two by their number.
    avatar: AVATARS.includes(u.avatar) ? u.avatar : AVATARS[u.id % AVATARS.length],
  };
}

// Account preferences the player can change in the profile (unknown keys are dropped).
// promoAsked: the player already answered the one-time "receive promotions?" question (sign-up or site).
const PREF_DEFAULTS = { notifyResults: true, notifyPromos: false, notifySms: false, notifyPush: true, cookiesAnalytics: true, cookiesMarketing: false, shareData: false, promoAsked: false };
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
  loginAttempts = 10, registrations = 10, feed = null, tennis = null, sports = {}, tennisLive = null, casino = null, liveSocket = null, propline = null, winhouse = null, winhouseFeed = null, winhouseTracker = null, winhouseLive = null, rapidStream = null, stripe = null, eupago = null, bigbang = null, telegram = null, revolut = null, brevo = null, teamLogos = null, goalApi = null, backups = null, sanctions = null, boardCacheMs = 0, settlement = createSettlementEngine(db),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Every whole answer (API, pages) compressed for the browsers that take it.
  app.use(compression());

  const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: loginAttempts });
  const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: registrations });

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        // Stripe.js (card form) must load from js.stripe.com and talk to api.stripe.com.
        `default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self' https://js.stripe.com; connect-src 'self' https://api.stripe.com${rapidStream?.enabled ? ' https:' : ''}; ` +
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

  // Eupago calls this URL only after a payment has been paid. The handler validates the channel API key,
  // our unique identifier, the exact amount and the expected payment method before crediting once.
  const eupagoWebhook = (req, res) => {
    if (!eupago) return res.status(404).json({ error: 'Eupago não está ativa.' });
    const params = { ...(req.body && typeof req.body === 'object' ? req.body : {}), ...req.query };
    const result = eupago.handleWebhook(params);
    if (!result.accepted) {
      if (result.reason === 'authentication') return res.status(401).json({ error: 'Notificação não autenticada.' });
      console.warn(`Eupago webhook rejeitado: ${result.reason || 'invalid'}`);
      return res.status(400).json({ error: 'Notificação inválida.' });
    }
    res.status(200).json({ received: true });
  };
  app.get('/api/eupago/webhook', eupagoWebhook);
  app.post('/api/eupago/webhook', express.json({ limit: '32kb' }), eupagoWebhook);

  // Revolut: how each withdrawal payout ended (signed, raw body). Also at Bet62Novo's path, so the
  // webhook configured there works here as it is.
  const revolutWebhook = (req, res) => {
    if (!revolut) return res.status(404).json({ error: 'Revolut não configurada.' });
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!revolut.verifyWebhook(raw, req.get('revolut-signature'), req.get('revolut-request-timestamp'))) {
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }
    let ev;
    try { ev = JSON.parse(raw); } catch { return res.status(400).json({ error: 'JSON inválido.' }); }
    if (ev?.event === 'TransactionStateChanged' && ev.data?.id) {
      const w = db.prepare('SELECT * FROM withdrawals WHERE payout_ref = ?').get(String(ev.data.id));
      if (w) payoutUpdate(w, payoutState(ev.data.new_state ?? ev.data.state), `Revolut: ${ev.data.new_state ?? ev.data.state}`);
    }
    res.json({ received: true });
  };
  app.post('/api/revolut/webhook', express.raw({ type: '*/*', limit: '256kb' }), revolutWebhook);
  app.post('/api/withdrawals/webhook/revolut', express.raw({ type: '*/*', limit: '256kb' }), revolutWebhook);

  // Revolut's one-time authorisation (Revolut Business → APIs → "Enable access" redirects here): the
  // code becomes the refresh token, shown once to put in REVOLUT_REFRESH_TOKEN.
  app.get('/api/revolut/callback', async (req, res) => {
    const page = (title, body, status = 200) => res.status(status).type('html').send(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${title}</title></head>
      <body style="font-family:monospace;max-width:720px;margin:0 auto;padding:24px;background:#0b0d10;color:#e5e7eb"><h2>${title}</h2>${body}</body></html>`);
    const html = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    if (!revolut) return page('Revolut não configurada', '<p>Defina primeiro REVOLUT_CLIENT_ID, REVOLUT_JWT_ISSUER e REVOLUT_PRIVATE_KEY.</p>', 503);
    if (req.query.error) return page('Revolut — erro', `<p>${html(req.query.error)}</p>`, 400);
    if (!req.query.code) return page('Revolut — falta o código', '<p>Falta o parâmetro "code".</p>', 400);
    try {
      const refresh = await revolut.exchangeCode(String(req.query.code));
      console.warn(`Revolut: novo refresh_token obtido (…${refresh.slice(-6)}) — coloque-o em REVOLUT_REFRESH_TOKEN`);
      page('Revolut — autorização concluída', `<p><strong>Copie agora o refresh_token (esta página não o volta a mostrar):</strong></p>
        <pre style="background:#111;color:#4ade80;padding:16px;border-radius:8px;overflow-wrap:anywhere;white-space:pre-wrap">${html(refresh)}</pre>
        <ol><li>No Railway → Variables, defina <code>REVOLUT_REFRESH_TOKEN</code> com este valor.</li><li>O serviço reinicia e os levantamentos passam a ser pagos pela Revolut.</li></ol>`);
    } catch (err) {
      page('Revolut — falhou', `<p>${html(err.message)}</p>`, 502);
    }
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
      try { screenSanctions(db, user.id); } catch (err) { console.warn(`[sanções] KYC: ${err.message}`); }
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  });

  // The link at the foot of every promotional email: stops them (one click, no login). Before the
  // JSON/CSRF guard: mail apps send the one-click POST (List-Unsubscribe-Post) as a plain form.
  // A GET only asks (mail scanners open links); the button, or the mail app's one-click, POSTs.
  const unsubPage = (title, text, form = '') => `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BET62</title></head>
<body style="margin:0;background:#1a1f24;color:#e8eaed;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:20px">
<div><h1 style="font-size:22px">${title}</h1><p style="color:#b0b7bf">${text}</p>${form}
<p><a href="/" style="color:#ffffff;font-weight:700">Voltar à BET62</a></p></div></body></html>`;
  const sendUnsub = (res, status, html) => res.status(status).set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'").type('html').send(html);
  app.get('/api/unsubscribe', (req, res) => {
    const u = encodeURIComponent(String(req.query.u || ''));
    const t = encodeURIComponent(String(req.query.t || ''));
    sendUnsub(res, 200, unsubPage('Deixar de receber promoções?', 'Deixa de receber as nossas promoções por email.',
      `<form method="post" action="/api/unsubscribe?u=${u}&amp;t=${t}"><button style="background:#42946b;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-weight:700;font-size:15px">Confirmar</button></form>`));
  });
  app.post('/api/unsubscribe', (req, res) => {
    const ok = unsubscribe(db, req.query.u, String(req.query.t || ''));
    sendUnsub(res, ok ? 200 : 400, ok ? unsubPage('Deixou de receber promoções por email', 'Pode voltar a ativá-las em Perfil → Preferências.')
      : unsubPage('Link inválido', 'Pode desligar as promoções em Perfil → Preferências.'));
  });

  // Admin → Películas sends pictures (the cover, the screenshots): a larger body there only.
  app.use('/api/admin/skins', express.json({ limit: '16mb' }));
  app.use('/api/admin/banners', express.json({ limit: '36mb' }));
  app.use('/api/admin/spotlights', express.json({ limit: '36mb' }));
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

  // ---------- withdrawals paid through Revolut ----------
  // A failed payout goes back to the team (status pending): they pay it by hand or reject it (refund).
  function payoutUpdate(w, state, note = null) {
    if (!state || w.payout_status === state || w.payout_status === 'paid') return;
    if (state === 'paid') {
      db.prepare("UPDATE withdrawals SET payout_status = 'paid', payout_error = NULL, paid_at = ? WHERE id = ?").run(nowIso(), w.id);
    } else if (state === 'failed') {
      db.prepare("UPDATE withdrawals SET payout_status = 'failed', payout_error = ?, status = 'pending', decided_at = NULL WHERE id = ?").run(note, w.id);
    } else {
      db.prepare('UPDATE withdrawals SET payout_status = ? WHERE id = ?').run(state, w.id);
    }
  }
  /** Sends an approved withdrawal to the player's IBAN through Revolut. Returns the row after. */
  async function payWithdrawal(id) {
    const w = db.prepare('SELECT w.*, u.name, u.iban_name FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.id = ?').get(id);
    db.prepare("UPDATE withdrawals SET payout_status = 'processing', payout_error = NULL WHERE id = ?").run(w.id);
    try {
      const p = await revolut.payOut({ iban: w.iban, holderName: w.iban_name || w.name, amountCents: w.amount_cents, reference: `BET62 levantamento #${w.id}`, requestId: `withdrawal-${w.id}` });
      db.prepare('UPDATE withdrawals SET payout_ref = ? WHERE id = ?').run(String(p?.id || ''), w.id);
      payoutUpdate({ ...w, payout_status: 'processing' }, payoutState(p?.state) || 'processing');
    } catch (err) {
      console.warn(`revolut levantamento #${w.id}: ${err.message}`);
      payoutUpdate({ ...w, payout_status: 'processing' }, 'failed', err.message);
    }
    return db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(w.id);
  }

  // ---------- free spins on the Palace casino ----------
  // Their money sits on the player's free-spins account there; this reads it back into the grant,
  // and ends the grant (taking that money back first) when asked, when it is played out or expired.
  const PALACE_SETTLE_MS = 4_000;
  const activeSpinsOf = (userId) => db.prepare("SELECT * FROM casino_spins WHERE user_id = ? AND status = 'active' ORDER BY id LIMIT 1").get(userId);
  async function settlePalaceSpins(s, { end = false, status = 'closed', reason = null } = {}) {
    if (!s || s.status !== 'active' || s.palace_cents === null || s.palace_cents === undefined || !casino?.enabled) return 0;
    const u = userById(s.user_id);
    const expired = s.expires_at <= nowIso();
    if (!end && !expired) {
      const cents = await casino.fsBalanceCents(u);
      tx(db, () => palaceSpinsBalance(db, s, cents));
      const now = spinsRow(db, s.id, s.user_id);
      // Every spin played: they end once the last one has paid (the balance still for a moment),
      // at once if the game goes on being played with what they won.
      const still = Date.now() - Date.parse(now.palace_at) >= PALACE_SETTLE_MS;
      const overplayed = s.spins_left < 1 && now.palace_cents < s.palace_cents;
      if (now.spins_left >= 1 || !(still || overplayed)) return 0;
    }
    const back = await casino.fsWithdrawAll(u);
    const why = expired ? ['expired', 'prazo terminado'] : end ? [status, reason] : ['closed', 'Free Spins utilizadas'];
    return tx(db, () => palaceSpinsBalance(db, spinsRow(db, s.id, s.user_id), back, { final: true, status: why[0], reason: why[1] }));
  }
  /** Ends the Palace free spins whose time ran out (the casino money taken back first). */
  async function expirePalaceSpins() {
    if (!casino?.enabled) return 0;
    let n = 0;
    for (const s of db.prepare("SELECT * FROM casino_spins WHERE status = 'active' AND palace_cents IS NOT NULL AND expires_at <= ?").all(nowIso())) {
      try { await settlePalaceSpins(s); n += 1; } catch (err) { console.error(`free spins palace #${s.id}: ${err.message}`); }
    }
    return n;
  }
  app.locals.expirePalaceSpins = expirePalaceSpins;

  // Covers over parts of casino games (Admin → Películas).
  const skins = createSkins(db, { seedDir: path.join(PUBLIC_DIR, 'casino', 'skins') });
  const sendImage = (res, img, req = null) => {
    if (!img) throw new HttpError(404, 'Imagem não encontrada.');
    res.set('Content-Type', img.mime).set('Cache-Control', 'public, max-age=31536000, immutable').set('Accept-Ranges', 'bytes');
    // Videos: Safari (iPhone) asks for them in pieces and plays nothing without a 206 answer.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req?.headers.range || '');
    const size = img.data.length;
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : size - 1;
      start = Math.max(0, start); end = Math.min(size - 1, end);
      if (start > end) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      return res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`).send(img.data.subarray(start, end + 1));
    }
    res.send(img.data);
  };
  app.get('/api/casino/skin/:id', (req, res) => sendImage(res, skins.image(req.params.id)));

  // "Os meus jogos": the games each player opened (with real money or free spins), newest first, and
  // the ones they marked with the heart.
  db.exec(`CREATE TABLE IF NOT EXISTS casino_recent (user_id INTEGER NOT NULL, game_id INTEGER NOT NULL, played_at TEXT NOT NULL,
    PRIMARY KEY (user_id, game_id))`);
  db.exec(`CREATE TABLE IF NOT EXISTS casino_plays (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, game_id INTEGER NOT NULL, played_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS casino_favorites (user_id INTEGER NOT NULL, game_id INTEGER NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, game_id))`);
  const RECENT_KEEP = 20;
  function notePlayed(userId, gameId) {
    db.prepare(`INSERT INTO casino_recent (user_id, game_id, played_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET played_at = excluded.played_at`).run(userId, Number(gameId), nowIso());
    // Every opening, for the "Top 10 da semana" (players per game in 7 days); kept 30 days.
    db.prepare('INSERT INTO casino_plays (user_id, game_id, played_at) VALUES (?, ?, ?)').run(userId, Number(gameId), nowIso());
    if (Math.random() < 0.02) db.prepare('DELETE FROM casino_plays WHERE played_at < ?').run(new Date(Date.now() - 30 * 86_400_000).toISOString());
    db.prepare(`DELETE FROM casino_recent WHERE user_id = ? AND game_id NOT IN
      (SELECT game_id FROM casino_recent WHERE user_id = ? ORDER BY played_at DESC LIMIT ?)`).run(userId, userId, RECENT_KEEP);
  }
  app.get('/api/casino/mine', wrap(async (req, res) => {
    if (!req.user || !bb) return res.json({ recent: [], favorites: [], forYou: [], because: [] });
    const recentRows = db.prepare('SELECT game_id, played_at FROM casino_recent WHERE user_id = ? ORDER BY played_at DESC LIMIT ?').all(req.user.id, RECENT_KEEP);
    const recent = (await Promise.all(recentRows.map(async (r) => { const g = await bb.game(r.game_id); return g && { ...g, playedAt: r.played_at }; }))).filter(Boolean);
    const favorites = (await Promise.all(db.prepare('SELECT game_id FROM casino_favorites WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
      .map((r) => bb.game(r.game_id)))).filter(Boolean);
    // "Sabemos que vais gostar" and "Porque jogaste …" (like the last game played, like the first favourite):
    // none already played, and no game twice across these rows.
    const seen = new Set([...recent, ...favorites].map((g) => g.id));
    // (up to 40 each: the row shows 12, its "Ver todos" all of them)
    const take = (list, n = 40) => { const out = list.filter((x) => !seen.has(x.id)).slice(0, n); out.forEach((x) => seen.add(x.id)); return out; };
    const forYou = take(await (bb.forYou?.([...recent, ...favorites].map((g) => g.id), 60) ?? []));
    const seeds = [recent[0], favorites.find((g) => g.id !== recent[0]?.id) || recent[1]].filter(Boolean);
    const because = [];
    for (const g of seeds) {
      const games = take(await (bb.related?.(g, 60) ?? []));
      if (games.length >= 3) because.push({ game: { id: g.id, name: g.name }, games });
    }
    res.json({ recent, favorites, forYou, because });
  }));
  app.post('/api/casino/favorite', requireUser, wrap(async (req, res) => {
    const id = Number(req.body?.gameId);
    if (!Number.isInteger(id) || !bb || !(await bb.game(id))) throw new HttpError(404, 'Jogo não encontrado.');
    if (req.body?.on === false) db.prepare('DELETE FROM casino_favorites WHERE user_id = ? AND game_id = ?').run(req.user.id, id);
    else db.prepare('INSERT OR IGNORE INTO casino_favorites (user_id, game_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, nowIso());
    res.json({ favorite: req.body?.on !== false });
  }));

  // Banners at the top of the casino (Admin → Banners): the ones running now for this visitor.
  const banners = createBanners(db);
  const collections = createCollections(db);
  app.get('/api/casino/banners', (req, res) => res.json({ banners: banners.live({ signedIn: !!req.user }) }));
  app.get('/api/casino/banner/:id/:which', (req, res) => sendImage(res, banners.image(req.params.id, req.params.which), req));
  // Destaques: one game shown big between the lobby rows (Admin → Destaques do casino), with the game's card.
  const spotlights = createSpotlights(db);
  app.get('/api/casino/spotlights', wrap(async (req, res) => {
    if (!bb) return res.json({ spotlights: [] });
    const list = await Promise.all(spotlights.live({ signedIn: !!req.user }).map(async (s) => ({ ...s, game: await bb.game(s.gameId) })));
    res.json({ spotlights: list.filter((s) => s.game).map(({ id, tagline, cta, after, img, video, bare, game }) => ({ id, tagline, cta, after, img, video, bare, game })) });
  }));
  app.get('/api/casino/spotlight/:id/:which', (req, res) => sendImage(res, spotlights.image(req.params.id, req.params.which), req));
  // Seasonal banners that come with the site (Halloween…), with the collection of games they open.
  const seasonal = createSeasonal(db, { banners, collections, spotlights, dir: path.join(PUBLIC_DIR, 'casino', 'banners') });
  // A collection's own page (#/casino/colecao/ID): its games, while it runs.
  app.get('/api/casino/collection/:id', wrap(async (req, res) => {
    const c = collections.open(req.params.id);
    if (!c || !bb) throw new HttpError(404, 'Esta seleção de jogos já terminou.');
    res.json({ id: c.id, title: c.title, endsAt: c.endsAt, games: (await Promise.all(c.games.map((id) => bb.game(id)))).filter(Boolean) });
  }));

  // A Palace game open holds the player's balance in the casino. The game page asks for the balance
  // every 2 s (every 30 s in a background tab): when nothing asks for 3 minutes, the game was closed
  // without "leaving" (tab closed, phone locked), and the money comes back to the wallet by itself.
  const casinoSeen = new Map(); // user id → last time the open game asked for the balance
  const bootAt = Date.now();
  const CASINO_IDLE_MS = 3 * 60_000;
  async function returnIdleCasino(now = Date.now()) {
    if (!casino?.enabled) return 0;
    let n = 0;
    for (const u of db.prepare('SELECT * FROM users WHERE casino_active = 1').all()) {
      if (now - (casinoSeen.get(u.id) ?? bootAt) < CASINO_IDLE_MS) continue;
      try {
        const back = await casino.leaveGame(u);
        casinoSeen.delete(u.id);
        n += 1;
        console.log(`casino: jogo fechado sem sair — ${(back / 100).toFixed(2)} € devolvidos à carteira do utilizador ${u.id}`);
      } catch (err) { console.error(`casino: devolver saldo do utilizador ${u.id}: ${err.message}`); }
    }
    return n;
  }
  app.locals.returnIdleCasino = returnIdleCasino;

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

  // Markets the operator hid, per sport (admin → Catálogo de mercados): 'x:<provider id>' or ours ('ml', '1x2'…).
  const hiddenMarkets = () => getSetting(db, 'markets.hidden', {}) || {};
  const marketKeyOf = (s) => (s.market === 'x' ? `x:${splitSpecial(s.code)?.id}` : s.market);
  const isHidden = (hidden, sport, s) => !!hidden[sport]?.includes(marketKeyOf(s));

  // No winner of ours (a sport whose market names we do not know): the cards show the provider's own
  // match winner instead — home / away ("2 vias"), or 1 / X / 2 — so the game is not shown without odds.
  const WINNER_GROUP = /(vencedor|resultado|winner|result|1x2|2 vias|moneyline)/i;
  const NOT_WHOLE_MATCH = /(parte|tempo|\bset\b|quarto|per[ií]odo|entrada|inning|half|quarter|period|\btotal\b|handicap|\bmais\b|\bmenos\b|\bover\b|\bunder\b|\bpar\b|[ií]mpar|exato|correct|dupla|double|empate anula|draw no bet|\d\s*[.ºª])/i;
  const WHOLE_NOTE = /\s*\((incl[^)]*|including[^)]*|prolongamento|overtime|ot|entradas? extras?|extra innings|super over)\)/gi;
  const teamKey = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  function providerWinner(rows, e = {}) {
    const groups = new Map();
    for (const s of rows) {
      const sp = s.market === 'x' ? splitSpecial(s.code) : null;
      if (!sp) continue;
      // "1" / "2" / "X", or the team's own name.
      const label = teamKey(sp.label);
      const short = { 1: '1', 2: '2', x: 'X' }[sp.label.trim().toLowerCase()] || (label && label === teamKey(e.home) ? '1' : label && label === teamKey(e.away) ? '2' : null);
      const group = sp.group.replace(WHOLE_NOTE, '');
      if (!short || !WINNER_GROUP.test(group) || NOT_WHOLE_MATCH.test(group)) continue;
      if (!groups.has(sp.id)) groups.set(sp.id, []);
      groups.get(sp.id).push({ ...s, short });
    }
    const full = [...groups.values()].filter((g) => g.some((s) => s.short === '1') && g.some((s) => s.short === '2'));
    // Home / away first (most of these sports have no draw), then a 1 / X / 2.
    const pick = full.find((g) => !g.some((s) => s.short === 'X')) || full[0] || [];
    return pick.sort((a, b) => '1X2'.indexOf(a.short) - '1X2'.indexOf(b.short));
  }

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
    const hidden = hiddenMarkets();
    const plFresh = (e) => e.pl_live_at && Date.now() - new Date(e.pl_live_at).getTime() <= config.liveOddsMaxAgeSeconds * 1000;
    return events.map((e) => {
      // In play a PropLine price shows only while its live confirmation is recent.
      const rows = byEvent.get(e.id).filter((s) => !isHidden(hidden, e.sport, s)).map((s) => (s.src === 'pl' && e.status === 'live' && !plFresh(e) ? { ...s, active: 0 } : s));
      // Main market on the cards: 1X2, or the match winner in sports without a draw.
      const main = rows.some((s) => s.market === '1x2') || !rows.some((s) => s.market === 'ml') ? '1x2' : 'ml';
      const pub = (s) => ({ id: s.id, market: s.market, code: s.code, label: selectionLabel(s.market, s.code, e.home, e.away), odds: s.odds_x100 / 100, active: !!s.active });
      const out = {
        id: e.id, sport: e.sport, competition: e.competition, home: e.home, away: e.away,
        startTime: e.start_time, status: e.status, homeScore: e.home_score, awayScore: e.away_score,
        // A watched WinHouse match: the tracker knows the period ("Intervalo", "45+2'"), the live list does not.
        clock: (e.status === 'live' && e.source === 'winhouse' && winhouseTracker?.clockOf?.(e.id)) || e.clock, result: e.result, featured: !!e.featured, source: e.source,
        selections: rows.some((s) => s.market === main)
          ? rows.filter((s) => s.market === main).sort((a, b) => codeRank(main, a.code) - codeRank(main, b.code)).map(pub)
          : providerWinner(rows, e).map((s) => ({ ...pub(s), code: s.short })),
        marketCount: new Set(rows.filter((s) => s.active && s.market !== main).map((s) => (s.market === 'x' ? `x${splitSpecial(s.code)?.id}` : s.market))).size,
        // The feed's badge; else one found by name (teamlogos.js), with the kit colours for the shirt drawn without one.
        homeLogo: teamLogo(e.source, e.home_team_ext) || teamLogos?.get(e.sport, e.home)?.logo || null,
        awayLogo: teamLogo(e.source, e.away_team_ext) || teamLogos?.get(e.sport, e.away)?.logo || null,
        // The badge found here, to show should the feed's not load.
        homeLogoAlt: teamLogo(e.source, e.home_team_ext) ? teamLogos?.get(e.sport, e.home)?.logo || null : null,
        awayLogoAlt: teamLogo(e.source, e.away_team_ext) ? teamLogos?.get(e.sport, e.away)?.logo || null : null,
        homeKit: teamLogos?.get(e.sport, e.home)?.colors || null, awayKit: teamLogos?.get(e.sport, e.away)?.colors || null,
        homeKitImg: teamLogos?.get(e.sport, e.home)?.kit || null, awayKitImg: teamLogos?.get(e.sport, e.away)?.kit || null,
        leagueLogo: leagueLogo(e.source, e.league_ext),
        homeCountry: e.home_country || null, awayCountry: e.away_country || null,
        tier: leagueTier(e.sport, e.competition),
        // A big club plays (Real Madrid, Manchester City, Benfica…): first on the live page.
        bigTeam: isBigTeam(e.home) || isBigTeam(e.away),
        tennis: e.sport === 'tenis' && e.status === 'live' ? parseJson(e.live_detail) : null,
        // Red cards of each side in play (none: null).
        redCards: e.status === 'live' && (e.red_home || e.red_away) ? { home: e.red_home || 0, away: e.red_away || 0 } : null,
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

  // Maintenance screen, switched in the admin (e.g. while WinHouse is down): the whole site, or only
  // sports (the casino stays open). Meanwhile bets and cash-out are refused, and casino games too
  // for the whole site. Admins are never held back.
  const maintenance = () => {
    const m = getSetting(db, 'maintenance', null) || {};
    return { on: !!m.on, scope: m.scope === 'all' ? 'all' : 'sports', message: String(m.message || '').slice(0, 300), since: m.since || null };
  };
  const maintenanceGuard = (casino = false) => (req, _res, next) => {
    const m = maintenance();
    if (m.on && req.user?.role !== 'admin' && (!casino || m.scope === 'all')) return next(new HttpError(503, 'Estamos em manutenção. Brevemente disponível.'));
    next();
  };

  app.get('/api/config', (_req, res) => {
    const { limits } = config;
    const m = maintenance();
    res.json({
      paymentsMode: config.paymentsMode,
      minStake: cents(limits.minStakeCents), maxStake: cents(limits.maxStakeCents),
      maxPayout: cents(limits.maxPayoutCents), minDeposit: cents(limits.minDepositCents),
      maxDeposit: cents(limits.maxDepositCents), minWithdraw: cents(limits.minWithdrawCents), instantWithdraw: cents(limits.instantWithdrawCents),
      liveOddsMaxAge: config.liveOddsMaxAgeSeconds, builderFactor: config.builderFactor,
      // The multiple boost the slip shows (null while the campaign is off).
      accaBoost: (() => { const c = promoConfig(db).accaBoost; return campaignOpen(c) ? { tiers: c.tiers, minOdds: c.minOdds, maxBoost: c.maxBoost } : null; })(),
      supportEmail: config.supportEmail || undefined, supportPhone: config.supportPhone || undefined,
      sports: SPORTS, version: APP_VERSION,
      // Trial video source for live football (RapidAPI): the match page asks /api/live2/:id.
      rapidStream: !!rapidStream?.enabled,
      rapidKey: !!rapidStream,
      maintenance: m.on ? { scope: m.scope, message: m.message, since: m.since } : null,
      // WinHouse is down: the live page says why it has no games.
      liveDown: !!winhouseFeed?.liveDown?.(),
      // Covers over some Pragmatic games (the "buy free spins" panel): off, admins only (trial) or everyone.
      casinoSkins: getSetting(db, 'casino.skins', 'off'),
      skins: getSetting(db, 'casino.skins', 'off') === 'off' ? [] : skins.live(),
    });
  });

  // A live game the feed no longer lists (WinHouse ended it) leaves the site within a minute, while
  // it waits to be settled (automatically, or by the operator in Liquidação). Its own page stays.
  // A WinHouse game in play that no live read has confirmed for a while (WinHouse down) is not shown
  // either: its clock and score would be frozen. It comes back with the next good read.
  const NOT_GONE = `NOT (e.status = 'live' AND ((e.wh_missing_since IS NOT NULL AND e.wh_missing_since < ?)
    OR (e.source = 'winhouse' AND e.wh_seen_at IS NOT NULL AND e.wh_seen_at < ?)))`;
  // A live match gone from the book's list leaves the board 20 s later (one missed read is tolerated).
  const goneBefore = () => new Date(Date.now() - 20_000).toISOString();
  const unseenBefore = () => new Date(Date.now() - 150_000).toISOString();

  // How far ahead future games are imported and shown (admin setting; WINHOUSE_FUTURE_DAYS by default).
  const futureDays = () => Math.min(90, Math.max(0, Number(getSetting(db, 'winhouse.futureDays', config.winhouse.futureDays)) || 0));
  const horizonMs = (min) => Math.max(min, futureDays()) * 86_400_000;

  // Ready-made bets for the sports page: bet builders and four-leg multiples (featured.js).
  const featured = createFeatured(db, {
    // Fewer than six builder cards: the candidate games' pages are read now (their goal totals etc.).
    prefetch: winhouseFeed?.readPageNow ? (ids) => { for (const id of ids) winhouseFeed.readPageNow(id).catch(() => {}); } : null,
  });
  app.get('/api/featured', (_req, res) => res.json(featured.get()));
  // "Melhores escolhas" of a football match (picks.js): boosted ready-made builders.
  const matchPicks = createMatchPicks(db);
  app.get('/api/events/:id/picks', (req, res) => res.json({ picks: matchPicks.forEvent(req.params.id) }));

  // A shared ticket (the Telegram button #/bilhete/1-2-3): its picks with current prices, for the
  // slip; a closed pick or a game already started is left out.
  app.get('/api/slip-legs', (req, res) => {
    const ids = String(req.query.ids || '').split(/[-,]/).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
    const rows = ids.length ? db.prepare(`SELECT s.id, s.market, s.code, s.odds_x100, s.active, e.id AS event_id, e.competition, e.home, e.away, e.start_time, e.status
      FROM selections s JOIN events e ON e.id = s.event_id WHERE s.id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    const open = rows.filter((r) => r.active && r.status === 'scheduled' && new Date(r.start_time).getTime() > Date.now());
    res.json({ legs: open.map((r) => ({
      selectionId: r.id, eventId: r.event_id, market: r.market, code: r.code, odds: r.odds_x100 / 100, marketName: MARKETS[r.market]?.name || r.market,
      label: selectionLabel(r.market, r.code, r.home, r.away), home: r.home, away: r.away, competition: r.competition,
    })), missing: ids.length - open.length });
  });

  // Countries and leagues of the sidebar, with how many games each has open (in play or within a month).
  const openFixtures = (sport) => db.prepare(`SELECT e.id, e.competition FROM events e WHERE e.sport = ?
    AND (e.status = 'live' OR (e.status = 'scheduled' AND e.start_time > ? AND e.start_time < ?))
    AND (e.status = 'live' OR e.source = 'manual' OR EXISTS (SELECT 1 FROM selections s WHERE s.event_id = e.id AND s.active = 1))
    AND ${NOT_GONE}`)
    .all(sport, nowIso(), new Date(Date.now() + horizonMs(31)).toISOString(), goneBefore(), unseenBefore());
  // Team badges kept here (teamlogos.js: API-Football asks for its logos not to be fetched each time).
  app.get('/team-logo/:id', (req, res) => {
    const f = teamLogos?.file?.(req.params.id);
    if (!f) return res.status(404).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'public, max-age=2592000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.end(Buffer.from(f.body));
  });
  // Official league logos (API-Football), kept here too; the page shows the country's flag when there is none.
  app.get('/league-logo/:id', async (req, res) => {
    const sport = String(req.query.s || '');
    const f = await (sport ? teamLogos?.sportLeagueLogo?.(sport, String(req.query.n || ''), String(req.query.c || ''))
      : teamLogos?.leagueLogo?.(req.params.id))?.catch(() => null);
    if (!f) return res.status(404).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'public, max-age=2592000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.end(Buffer.from(f.body));
  });
  app.get('/api/leagues', (_req, res) => {
    const out = {};
    for (const [sport, tree] of Object.entries(LEAGUE_TREES)) {
      const counts = new Map();
      const named = new Map(); // key → the name as the games carry it
      for (const e of openFixtures(sport)) {
        const k = leagueKey(e.competition);
        counts.set(k, (counts.get(k) || 0) + 1);
        if (!named.has(k)) named.set(k, e.competition);
      }
      const list = tree.map(([country, leagues]) => ({ country, leagues: leagues.map((name) => ({ name, count: counts.get(leagueKey(name)) || 0 })) }));
      if (sport === 'futebol' || COUNTRY_SPORTS.includes(sport)) {
        // Football: each covered country's first and second division with games open, under its
        // country (first division first), whatever WinHouse calls the league. Basketball and ice
        // hockey: every league of the covered countries with games open.
        const listed = new Set(tree.flatMap(([, leagues]) => leagues.map(leagueKey)));
        const classify = sport === 'futebol' ? divisionOf : (name) => { const country = leagueCountry(sport, name); return country && { country, division: 1 }; };
        const extra = new Map();
        for (const [k, name] of named) {
          const d = listed.has(k) ? null : classify(name);
          if (!d) continue;
          if (!extra.has(d.country)) extra.set(d.country, []);
          extra.get(d.country).push({ name, count: counts.get(k), division: d.division });
        }
        for (const [country, leagues] of extra) {
          leagues.sort((a, b) => a.division - b.division || a.name.localeCompare(b.name));
          const clean = leagues.map(({ name, count }) => ({ name, count }));
          const have = list.find((c) => c.country === country);
          if (have) have.leagues.push(...clean);
          else list.push({ country, leagues: clean });
        }
        list.sort((a, b) => a.country.localeCompare(b.country));
      }
      if (sport === 'tenis') {
        // The tours first (ATP, WTA, Challengers, in that order), each tournament with games open
        // as "Pequim WTA - Pares" and its host country's flag; then the listed ones by country.
        const listed = new Set(tree.flatMap(([, leagues]) => leagues.map(leagueKey)));
        const groups = new Map(TOUR_GROUPS.map((g) => [g, []]));
        for (const [k, name] of named) {
          const t = listed.has(k) ? null : tourOf(name);
          if (t) groups.get(t.group).push({ name, count: counts.get(k), label: tourLabel(name), flag: t.country });
        }
        const tours = [...groups].filter(([, leagues]) => leagues.length)
          .map(([country, leagues]) => ({ country, tour: true, leagues: leagues.sort((a, b) => a.label.localeCompare(b.label, 'pt')) }));
        list.unshift(...tours);
      }
      out[sport] = list;
    }
    res.json({ leagues: out });
  });

  // The board is the same for everyone and every open page asks for it every 5 s: built once per
  // `boardCacheMs` and shared, so many visitors never keep the server busy (the casino's wallet
  // calls wait on it). Off unless asked (index.js).
  const boardCache = new Map(); // url → { at, body }
  if (boardCacheMs > 0) {
    app.get('/api/events', (req, res, next) => {
      const hit = boardCache.get(req.originalUrl);
      if (hit && Date.now() - hit.at < boardCacheMs) return res.type('json').send(hit.body);
      res.json = (data) => {
        if (boardCache.size > 200) boardCache.clear();
        const body = JSON.stringify(data);
        boardCache.set(req.originalUrl, { at: Date.now(), body });
        return res.type('json').send(body);
      };
      next();
    });
  }
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
    params.push(goneBefore(), unseenBefore());
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
      // Football from big and medium leagues: GOAL API (head-to-head, table, last five games).
      if (goalApi?.covers(ev)) return res.json(await goalApi.insights(ev));
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
      res.json({ success: true, servers: ranked.map((s) => ({ name: s.name, kind: s.kind, url: videoProxy.sign(s.url, { referer: s.referer, ua: s.ua }) })) });
    } catch (err) { next(err); }
  });
  // The proxy itself: only addresses we signed, only for a player allowed to watch.
  // Our server keeps each watched stream a few seconds ahead (the host's slow moments do not reach
  // the player, and many viewers of one game cost one fetch per segment).
  const streamRelay = rapidStream?.enabled ? createStreamRelay() : null;
  const videoProxy = createVideoProxy({ relay: streamRelay });
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
    // WinHouse: its tracker for football (ball, situation, stats) and tennis (sets, games, points).
    const tracker = ev?.source === 'winhouse' && (ev.sport === 'futebol' || ev.sport === 'tenis') && winhouseTracker?.enabled ? winhouseTracker : null;
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

    // Promotions by email only when the box was ticked at sign-up (off by default); asked either way.
    // The same box covers SMS when a phone number was given.
    const prefs = JSON.stringify({ notifyPromos: req.body.promos === true, notifySms: req.body.promos === true && !!phone, promoAsked: true });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (email, name, birthdate, phone, password_hash, prefs, created_at, promo_asked_at, avatar, pep_declared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(email, name, birthdate, phone, hashPassword(password), prefs, nowIso(), nowIso(), AVATARS[Math.floor(Math.random() * AVATARS.length)], req.body.pep === true ? 1 : 0);
    // Compared with the sanctions lists at once (a failure never stops the registration).
    try { screenSanctions(db, Number(lastInsertRowid)); } catch (err) { console.warn(`[sanções] registo: ${err.message}`); }
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
    const used = user && (verifyPassword(password, user.password_hash) ? password
      : password.trim() !== password && verifyPassword(password.trim(), user.password_hash) ? password.trim() : null);
    if (used === null || !user) throw new HttpError(401, 'Email ou palavra-passe incorretos.');
    // A player brought from the previous platform: the old hash (bcrypt) is replaced by ours now.
    if (isLegacyHash(user.password_hash)) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(used), user.id);
    if (user.banned_at) throw new HttpError(403, 'Esta conta está bloqueada. Contacte o apoio.');
    // An administrator with two-step sign-in: the authenticator app's code too.
    if (user.role === 'admin' && user.totp_on && !verifyCode(user.totp_secret, req.body.code)) {
      throw new HttpError(401, req.body.code ? 'Código de verificação incorreto.' : 'Introduza o código de 6 dígitos da sua app de autenticação.', { need2fa: true });
    }
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
      // Promotions by SMS need a phone number to send them to.
      if (cur.notifySms && !(b.phone !== undefined ? set.phone : req.user.phone)) cur.notifySms = false;
      set.prefs = JSON.stringify(cur);
      if (b.prefs?.promoAsked === true) set.promo_asked_at = nowIso();
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
      const eupagoMode = config.paymentsMode === 'eupago';
      const method = String(req.body.method || '');
      if (config.paymentsMode !== 'demo' && !(stripeMode && stripe) && !(eupagoMode && eupago)) {
        throw new HttpError(503, 'Os depósitos ainda não estão disponíveis: o fornecedor de pagamentos selecionado não está configurado.');
      }
      if (req.user.excluded_until && req.user.excluded_until > nowIso()) throw new HttpError(403, 'Conta em autoexclusão: depósitos bloqueados.');
      const amount = parseEuros(req.body.amount, 'Valor do depósito');
      const { minDepositCents, maxDepositCents } = config.limits;
      if (amount < minDepositCents || amount > maxDepositCents) {
        throw new HttpError(400, `O depósito deve estar entre €${cents(minDepositCents)} e €${cents(maxDepositCents)}.`);
      }
      // The player's own deposit limits (responsible gaming).
      checkDeposit(db, req.user, amount);
      // Anti money laundering: over a total deposited, the identity verified first.
      checkKycDeposit(db, req.user, amount);
      // The player picks one promotion for the deposit (sports bonus, casino free spins or none);
      // whether it is given, and how much, is decided here.
      const promo = ['sport', 'casino', 'none'].includes(req.body.promo) ? req.body.promo : req.body.bonus === false ? 'none' : 'sport';

      // Stripe is used only when explicitly selected. In Eupago mode, card, MB WAY and
      // Multibanco all go through Eupago; its credit-card API returns Eupago's own secure form URL.
      if (stripeMode) {
        if (!stripe) throw new HttpError(503, 'O formulário de cartão dentro da BET62 necessita de configurar o Stripe (chave secreta).');
        if (method === 'cartao' && !stripe.hasPublishable) throw new HttpError(503, 'O formulário de cartão dentro da BET62 necessita de configurar STRIPE_PUBLISHABLE_KEY.');
        let r;
        try {
          r = await stripe.createDeposit(req.user, amount, { method, phone: req.body.phone, promo });
        } catch (err) {
          throw err.ours ? new HttpError(400, err.message) : new HttpError(502, `Não foi possível iniciar o pagamento por cartão: ${err.message}`);
        }
        return res.status(201).json({ payment: depositOut(r), clientSecret: r.clientSecret, publishableKey: r.publishableKey, balance: cents(userById(req.user.id).balance_cents) });
      }
      if (eupagoMode) {
        let r;
        try {
          r = await eupago.createDeposit(req.user, amount, { method, phone: req.body.phone, promo });
        } catch (err) {
          throw err.ours ? new HttpError(400, err.message) : new HttpError(502, `Não foi possível iniciar o pagamento Eupago: ${err.message}`);
        }
        return res.status(201).json({ payment: depositOut(r), balance: cents(userById(req.user.id).balance_cents) });
      }
      demoDeposit(req, res, amount, promo);
    } catch (err) { next(err); }
  });

  // A deposit's state, for the player's page (asks Stripe if the webhook has not arrived yet).
  app.get('/api/wallet/deposit/:sessionId', requireUser, async (req, res, next) => {
    try {
      // Stripe PaymentIntent IDs begin with pi_; Eupago's internal identifiers begin with B62-.
      // The provider is chosen per transaction so inline card payments remain refreshable in hybrid mode.
      const sessionId = String(req.params.sessionId || '');
      const r = sessionId.startsWith('pi_')
        ? stripe?.refresh(sessionId, req.user.id)
        : config.paymentsMode === 'eupago'
          ? eupago?.refresh(sessionId, req.user.id)
          : stripe?.refresh(sessionId, req.user.id);
      const refreshed = r instanceof Promise ? await r : r;
      if (!refreshed) throw new HttpError(404, 'Depósito não encontrado.');
      res.json({ ...depositOut(refreshed), balance: cents(userById(req.user.id).balance_cents) });
    } catch (err) { next(err.status && !(err instanceof HttpError) ? new HttpError(502, err.message) : err); }
  });

  const depositOut = (r) => ({
    id: r.id, method: r.method, status: r.status, amount: cents(r.amountCents),
    entity: r.entity, reference: r.reference, expiresAt: r.expiresAt, voucherUrl: r.voucherUrl,
    redirectUrl: r.redirectUrl,
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
    res.json({ campaigns: publicCampaigns(db), mine: req.user ? { ...playerPromos(db, req.user.id, { gameName }), wallets: walletBreakdown(db, req.user.id) } : null });
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
  app.post('/api/me/free-spins/:id/claim', requireUser, wrap(async (req, res) => {
    const s = spinsRow(db, Number(req.params.id), req.user.id);
    const paid = s?.status === 'active' && s.palace_cents !== null && casino?.enabled
      ? await settlePalaceSpins(s, { end: true, status: 'closed', reason: 'terminadas pelo jogador' })
      : tx(db, () => claimSpins(db, req.user.id, req.params.id));
    res.json({ paid: cents(paid), user: userOut(userById(req.user.id)) });
  }));
  // The free spins the player has now and the games to pick from (just the picked one once chosen).
  app.get('/api/me/free-spins/active', requireUser, wrap(async (req, res) => {
    const s = activeSpinsOf(req.user.id);
    if (!s || s.expires_at <= nowIso()) return res.json({ freeSpins: null, games: [] });
    const games = [];
    for (const id of playableGames(s)) {
      const g = bb ? await bb.game(id) : null;
      if (g) games.push({ id: g.id, name: g.name, provider: g.provider, image: g.image, bet: cents(spinBet(s, g.id)) });
    }
    res.json({ freeSpins: { ...spinsView(s), chosenGame: s.chosen_game || null }, games });
  }));
  // The player picks the game of the free spins (only that one afterwards).
  app.post('/api/me/free-spins/:id/choose', requireUser, (req, res) => {
    const s = chooseSpinsGame(db, req.user.id, req.params.id, req.body?.gameId);
    res.json({ chosenGame: s.chosen_game });
  });

  // Responsible-gaming limits (stricter at once, looser after 24 h).
  app.get('/api/me/limits', requireUser, (req, res) => res.json({ limits: limitsView(currentLimits(db, req.user)) }));
  app.put('/api/me/limits', requireUser, (req, res) => {
    res.json({ limits: limitsView(setLimits(db, req.user, req.body || {})) });
  });

  // Whether the player may withdraw now (the form shows why not before they try).
  app.get('/api/wallet/withdraw/eligibility', requireUser, (req, res) => res.json(withdrawEligibility(db, req.user)));

  app.post('/api/wallet/withdraw', requireUser, reclaimCasino, wrap(async (req, res) => {
    const amount = parseEuros(req.body.amount, 'Valor do levantamento');
    if (amount < config.limits.minWithdrawCents) throw new HttpError(400, `Levantamento mínimo: €${cents(config.limits.minWithdrawCents)}.`);
    const can = withdrawEligibility(db, req.user);
    if (!can.eligible) throw new HttpError(403, can.message, { code: can.code });
    const iban = str(req.body.iban, 60).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw new HttpError(400, 'IBAN inválido.');
    // Withdrawing while a deposit bonus runs gives the bonus up (the player is asked first).
    const running = activeDepositBonus(db, req.user.id);
    if (running && req.body.forfeitBonus !== true) {
      throw new HttpError(409, `Tem o ${CAMPAIGN_NAMES[running.kind]} ativo (€${cents(running.balance_cents).toFixed(2)} de bónus). Ao levantar, o bónus é cancelado.`, { bonusActive: true });
    }
    // Up to the instant limit it is approved at once; above it the team decides within 24–72 h.
    // With Revolut, from REVOLUT_AUTO_PAYOUT_MIN to _MAX it is also paid at once to the IBAN.
    const autoPay = !!revolut?.autoPays(amount);
    const instant = autoPay || instantWithdrawal(amount, config.limits.instantWithdrawCents);
    let id;
    const balance = tx(db, () => {
      if (running) cancelBonus(db, running.id, 'levantamento pedido com o bónus ativo');
      const now = nowIso();
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO withdrawals (user_id, amount_cents, iban, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, amount, iban, instant ? 'approved' : 'pending', now, instant ? now : null);
      id = Number(lastInsertRowid);
      return postTransaction(db, req.user.id, -amount, 'withdrawal', instant ? 'Levantamento instantâneo' : 'Pedido de levantamento', `withdrawal:${lastInsertRowid}`);
    });
    const w = autoPay ? await payWithdrawal(id) : null;
    res.status(201).json({ balance: cents(balance), status: w ? w.status : instant ? 'approved' : 'pending', instant: w ? w.status === 'approved' : instant, payout: w?.payout_status || null });
  }));

  // ---------- bets ----------

  app.post('/api/bets', requireUser, maintenanceGuard(), reclaimCasino, (req, res) => {
    const stakeCents = parseEuros(req.body.stake, 'Valor da aposta');
    const picks = Array.isArray(req.body.selections)
      ? req.body.selections.map((s) => ({ selectionId: s?.selectionId, odds: s?.odds }))
      : [];
    const freebetId = req.body.freebetId ? Number(req.body.freebetId) : null;
    // A card of "Melhores escolhas": its boost, while the card is still offered with these picks.
    let pick = null;
    if (req.body.mode === 'builder' && req.body.pickKey) {
      pick = matchPicks.boostOf(String(req.body.pickKey).slice(0, 80), picks.map((p) => p.selectionId));
      if (!pick) throw new HttpError(409, 'Esta escolha já não está disponível com boost. Atualize a página do jogo.');
    }
    const selOf = db.prepare('SELECT s.market, s.code, e.sport FROM selections s JOIN events e ON e.id = s.event_id WHERE s.id = ?');
    const hidden = hiddenMarkets();
    if (picks.some((p) => { const r = selOf.get(Number(p.selectionId)); return r && isHidden(hidden, r.sport, r); })) {
      throw new HttpError(409, 'Este mercado já não está disponível. Retire-o do boletim.');
    }
    let betIds;
    try {
      betIds = tx(db, () => placeBets(db, req.user, { mode: req.body.mode, stakeCents, picks, freebetId, pick }));
    } catch (err) {
      logRefusal(db, req.user.id, err); // a bet refused by a risk limit is kept for the alerts
      throw err;
    }
    // A ready-made bet keeps where it came from (its ticket shows it): a winning accumulator or a featured builder.
    const origin = { multiple: 'acca', builder: 'combo' }[req.body.mode] === req.body.origin ? req.body.origin : null;
    if (origin && !pick) for (const id of betIds) db.prepare('UPDATE bets SET origin = ? WHERE id = ?').run(origin, id);
    const u = userById(req.user.id);
    res.status(201).json({ betIds, balance: cents(u.balance_cents), user: userOut(u) });
  });

  // The player's tickets; open ones carry their cash-out offer (worked out here, on current prices).
  app.get('/api/bets', requireUser, (req, res) => {
    const rows = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
    const offers = new Map(rows.filter((b) => b.status === 'open').map((b) => [b.id, offerView(cashoutOffer(db, b))]));
    res.json({ bets: withLegs(rows).map((b) => (offers.has(b.id) ? { ...b, cashout: offers.get(b.id) } : b)) });
  });
  // Sharing a ticket: a link anyone can open (#/b/<token>) with its picks, odds and result.
  app.post('/api/bets/:id/share', requireUser, (req, res) => {
    const b = db.prepare('SELECT id, share_token FROM bets WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!b) throw new HttpError(404, 'Aposta não encontrada.');
    let token = b.share_token;
    if (!token) {
      token = randomBytes(6).toString('base64url');
      db.prepare('UPDATE bets SET share_token = ? WHERE id = ? AND share_token IS NULL').run(token, b.id);
      token = db.prepare('SELECT share_token FROM bets WHERE id = ?').get(b.id).share_token;
    }
    res.json({ token, url: `${req.protocol}://${req.get('host')}/#/b/${token}` });
  });
  // A shared ticket, as its owner sees it (no account details): the picks still open carry their
  // selection, so the visitor can copy them into the slip.
  app.get('/api/shared-bets/:token', (req, res) => {
    const b = db.prepare('SELECT * FROM bets WHERE share_token = ?').get(String(req.params.token).slice(0, 40));
    if (!b) throw new HttpError(404, 'Este bilhete já não está disponível.');
    const [t] = withLegs([b]);
    const sel = db.prepare(`SELECT s.id FROM selections s JOIN events e ON e.id = s.event_id
      WHERE s.event_id = ? AND s.market = ? AND s.code = ? AND s.active = 1 AND e.status = 'scheduled' AND e.start_time > ?`);
    const legs = t.legs.map((l) => ({ ...l, selectionId: sel.get(l.eventId, l.market, l.code, nowIso())?.id || null }));
    const { manual, id, ...ticket } = t;
    res.json({ ticket: { ...ticket, legs } });
  });
  // Cash out: checked, then (in play) held for the acceptance delay and checked again before paying.
  app.post('/api/bets/:id/cashout', requireUser, maintenanceGuard(), reclaimCasino, async (req, res, next) => {
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
      `SELECT l.id, l.bet_id, l.event_id, l.market, l.code, l.odds_x100, l.status, e.sport, e.home, e.away, e.competition, e.home_score, e.away_score,
              e.status AS event_status, e.start_time, e.clock, e.source
         FROM bet_legs l JOIN events e ON e.id = l.event_id WHERE l.bet_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.id`
    ).all(...ids);
    return bets.map((b) => ({
      id: b.id, type: b.type, stake: cents(b.stake_cents), totalOdds: b.total_odds, potential: cents(b.potential_cents),
      status: b.status, payout: cents(b.payout_cents), createdAt: b.created_at, settledAt: b.settled_at,
      freebet: cents(b.freebet_stake_cents || 0), bonusStake: cents(b.bonus_stake_cents || 0), protected: !!b.protected,
      ref: `BT62-${String(b.id).padStart(6, '0')}`, manual: b.manual_at ? { at: b.manual_at, note: b.manual_note } : null,
      boostPct: b.boost_pct || 0, boost: cents(b.boost_cents || 0),
      // 'pick' (Melhores escolhas), 'acca' (Apostas vencedoras), 'combo' (Construa o seu ganho) or null.
      origin: b.pick_key ? 'pick' : b.origin || null,
      pickPct: b.pick_pct || 0,
      legs: legs.filter((l) => l.bet_id === b.id).map((l) => ({
        id: l.id, match: `${l.home} vs ${l.away}`, competition: l.competition, market: l.market,
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
  // BigBang's dashboard: <site>/api/casino/bb/user and <site>/api/casino/bb/balance. The previous
  // platform's paths (/api/casino/bigbang/user-data, /balance-change) answer too: a key whose URLs
  // still name them keeps working once its domain points here.
  app.get(['/api/casino/bb/user', '/api/casino/bigbang/user-data'], (req, res) => {
    if (!bigbang?.enabled) return res.status(503).json({ error: 'casino disabled' });
    const r = bigbang.walletUser(str(req.query.username, 80));
    res.status(r.status).json(r.body);
  });
  app.post(['/api/casino/bb/balance', '/api/casino/bigbang/balance-change'], (req, res) => {
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
  // (A function declaration: routes registered further up use it too.)
  function wrap(fn) {
    return async (req, res, next) => {
      try { await fn(req, res); } catch (err) { next(casinoError(err)); }
    };
  }

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
    await seasonal.ensure(() => bb.games());
    const data = await collections.intoLobby(await bb.lobby({ n: 10 }), (id) => bb.game(id));
    if (data.error && req.user?.role !== 'admin') data.error = 'O casino está temporariamente indisponível.';
    res.json(data);
  }));

  if (bb) setTimeout(() => seasonal.ensure(() => bb.games()), 5_000).unref?.();

  // One game: its card, games of the same provider and whether the player's free spins work in it.
  app.get('/api/casino/game/:id', wrap(async (req, res) => {
    if (!bb) throw new HttpError(404, 'Jogo não encontrado.');
    const g = await bb.game(req.params.id);
    if (!g) throw new HttpError(404, 'Jogo não encontrado.');
    const s = req.user ? db.prepare("SELECT * FROM casino_spins WHERE user_id = ? AND status = 'active' AND expires_at > ? ORDER BY id LIMIT 1").get(req.user.id, nowIso()) : null;
    const eligible = !!s && playableGames(s).includes(g.id);
    // The spins left, the bet each is played at in this game (€0.20, €0.10…) and what they have won.
    res.json({ game: g, related: await bb.related(g), freeSpins: s ? { id: s.id, eligible, balance: cents(spinsBalance(s)), spinsLeft: s.spins_left ?? s.spins, won: cents(s.won_cents || 0), spins: s.spins, spinValue: cents(eligible ? spinBet(s, g.id) : s.spin_value_cents) } : null });
  }));

  // One wallet: the balance shown while playing is the casino balance (the ClassicBet part is 0).
  app.get('/api/casino/wallet', requireUser, wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    if (bb) {
      // Seamless: the money never leaves Bet62. A free-spins game shows the free-spins balance.
      // A Palace slot open (Transfer mode): the balance is in that casino meanwhile.
      const s = req.query.fs ? spinsRow(db, Number(req.query.fs), req.user.id) : null;
      const u = userById(req.user.id);
      if (u.casino_active) casinoSeen.set(u.id, Date.now());
      const away = u.casino_active && casino?.enabled ? await casino.casinoBalanceCents(u) : 0;
      // Free spins: the rounds left (what the player sees), what they won, and whether they ended.
      if (s && s.status === 'active' && s.palace_cents !== null && casino?.enabled) await settlePalaceSpins(s);
      const f = s && spinsRow(db, s.id, req.user.id);
      // betTooHigh: the player bet above the fixed bet a moment ago (refused at BigBang, counted as several spins at Palace).
      const warned = f?.bet_warn_at && Date.now() - Date.parse(f.bet_warn_at) < 15_000;
      const fs = f ? { spinsLeft: f.status === 'active' ? Math.max(0, f.spins_left ?? 0) : 0, spins: f.spins, won: cents(f.status === 'active' ? f.won_cents || 0 : f.paid_cents || 0),
        bet: cents(spinBet(f, f.chosen_game)), betTooHigh: !!warned, palace: f.palace_cents !== null && f.palace_cents !== undefined,
        ended: f.status !== 'active' } : null;
      return res.json({ balance: cents(userById(req.user.id).balance_cents + away), freeSpins: fs, inCasino: !!u.casino_active });
    }
    const u = userById(req.user.id);
    if (u.casino_active) casinoSeen.set(u.id, Date.now());
    const casinoCents = u.casino_active ? await casino.casinoBalanceCents(u) : 0;
    res.json({ balance: cents(u.balance_cents + casinoCents), inCasino: !!u.casino_active });
  }));

  // The game page asks this ahead: the player exists at BigBang before "Jogar", so the game opens
  // with one call to BigBang (only the launch).
  app.post('/api/casino/prepare', requireUser, wrap(async (req, res) => {
    if (bb) await bb.ensurePlayer(playerToken(req.user.id)).catch(() => {});
    res.json({ ok: true });
  }));

  // Opens a game: "Testar" (demo, virtual money, no account needed), "Jogar" (the player's
  // balance) or the free spins (their own balance, only in the eligible games).
  app.post('/api/casino/launch', maintenanceGuard(true), wrap(async (req, res) => {
    if (!casinoOn()) throw new HttpError(503, 'Casino não configurado.');
    const origin = `${req.protocol}://${req.get('host')}`;
    if (bb) {
      const g = await bb.game(req.body.gameId);
      if (!g) throw new HttpError(404, 'Jogo não encontrado.');
      const returnUrl = `${origin}/casino-return.html`;
      // A Palace slot (split mode): Transfer mode — the balance goes into that casino while it plays.
      if (g.source === 'palace') {
        if (req.body.demo) throw new HttpError(400, 'Este jogo não tem modo demonstração.');
        if (!req.user) throw new HttpError(401, 'Inicie sessão para jogar com dinheiro real.');
        if (!casino?.enabled) throw new HttpError(503, 'Casino Palace não configurado.');
        if (req.body.freeSpins) {
          // Free spins: their value goes to the player's free-spins account there (the first time),
          // the player's own balance stays here; only the picked game opens.
          let fs = spinsRow(db, Number(req.body.freeSpins), req.user.id);
          if (!fs || fs.status !== 'active' || fs.expires_at <= nowIso()) throw new HttpError(400, 'Estas Free Spins já não estão disponíveis.');
          // Not yet on this casino: it cannot refuse a bet, so they are played on BigBang's copy of
          // the game, where only the fixed bet is accepted (and the game sees one spin's bet at a time).
          if (fs.palace_cents === null) {
            const copy = await bb.twin(g);
            if (!copy) throw new HttpError(400, 'Este jogo não permite fixar a aposta das Free Spins. Escolha outro jogo.');
            fs = chooseSpinsGame(db, req.user.id, fs.id, g.id);
            db.prepare('UPDATE casino_spins SET play_game = ? WHERE id = ?').run(copy.id, fs.id);
            const url = await bb.launch({ gameId: copy.id, token: playerToken(req.user.id, fs.id), returnUrl });
            notePlayed(req.user.id, g.id);
            return res.json({ url, freeSpins: { id: fs.id, spinsLeft: fs.spins_left ?? fs.spins, spins: fs.spins }, balance: cents(userById(req.user.id).balance_cents) });
          }
          fs = chooseSpinsGame(db, req.user.id, fs.id, g.id);
          const fund = fs.palace_cents === null ? fs.value_cents : 0;
          if (fund) db.prepare('UPDATE casino_spins SET palace_cents = ?, palace_pending = 0, palace_at = ? WHERE id = ? AND palace_cents IS NULL').run(fund, nowIso(), fs.id);
          let out;
          try {
            out = await casino.fsEnterGame(userById(req.user.id), { providerId: g.palace.providerId, gameCode: g.palace.code, returnUrl, fundCents: fund,
              spinBetCents: spinBet(fs, g.id) });
          } catch (err) {
            if (fund) db.prepare('UPDATE casino_spins SET palace_cents = NULL WHERE id = ?').run(fs.id);
            throw err;
          }
          notePlayed(req.user.id, g.id);
          return res.json({ url: out.url, freeSpins: { id: fs.id, spinsLeft: fs.spins_left, spins: fs.spins }, balance: cents(userById(req.user.id).balance_cents), transfer: true });
        }
        const pu = userById(req.user.id);
        if (pu.balance_cents <= 0 && !pu.casino_active) throw new HttpError(400, 'Saldo insuficiente. Faça um depósito para jogar.', { needsDeposit: true });
        casinoSeen.set(pu.id, Date.now());
        const { url, casinoCents } = await casino.enterGame(pu, { providerId: g.palace.providerId, gameCode: g.palace.code, returnUrl });
        notePlayed(pu.id, g.id);
        return res.json({ url, balance: cents(casinoCents), transfer: true });
      }
      if (req.body.demo) {
        if (g.demo === false) throw new HttpError(400, 'Este jogo é só com dinheiro real (ao vivo / Premium): não tem modo demonstração.');
        return res.json({ url: await bb.launch({ gameId: g.id, demo: true, returnUrl }), demo: true });
      }
      if (!req.user) throw new HttpError(401, 'Inicie sessão para jogar com dinheiro real.');
      const u = userById(req.user.id);
      if (u.excluded_until && u.excluded_until > nowIso()) throw new HttpError(403, 'A sua conta está em autoexclusão. O casino está bloqueado.');
      if (req.body.freeSpins) {
        const s = spinsRow(db, Number(req.body.freeSpins), u.id);
        if (!s || s.status !== 'active' || s.expires_at <= nowIso()) throw new HttpError(400, 'Estas Free Spins já não estão disponíveis.');
        chooseSpinsGame(db, u.id, s.id, g.id); // the picked game is the only one from now on
        const url = await bb.launch({ gameId: g.id, token: playerToken(u.id, s.id), returnUrl });
        notePlayed(u.id, g.id);
        return res.json({ url, freeSpins: { id: s.id, spinsLeft: s.spins_left ?? s.spins, spins: s.spins }, balance: cents(u.balance_cents) });
      }
      if (u.balance_cents <= 0) throw new HttpError(400, 'Saldo insuficiente. Faça um depósito para jogar.', { needsDeposit: true });
      const url = await bb.launch({ gameId: g.id, token: playerToken(u.id), returnUrl });
      notePlayed(u.id, g.id);
      return res.json({ url, balance: cents(u.balance_cents) });
    }
    if (!req.user) throw new HttpError(401, 'Inicie sessão para continuar.');
    const providerId = Number(req.body.providerId);
    const gameCode = str(req.body.gameCode, 80);
    if (!Number.isInteger(providerId) || !gameCode) throw new HttpError(400, 'Jogo inválido.');
    // The game runs in an iframe; its "home" button lands on a page that sends the tab back to the casino.
    casinoSeen.set(req.user.id, Date.now());
    const { url, casinoCents } = await casino.enterGame(req.user, { providerId, gameCode, returnUrl: `${origin}/casino-return.html` });
    res.json({ url, balance: cents(casinoCents) });
  }));

  // Leaving the game: the balance comes back to the ClassicBet wallet.
  app.post('/api/casino/close', requireUser, wrap(async (req, res) => {
    // Free spins on the Palace casino: what is left there is read back (ended when played out).
    await settlePalaceSpins(activeSpinsOf(req.user.id)).catch((err) => console.error(`free spins palace: ${err.message}`));
    // BigBang never holds the balance; a Palace game (alone, or in split mode) does while open.
    if (!casino?.enabled || !userById(req.user.id).casino_active) return res.json({ amount: 0, balance: cents(userById(req.user.id).balance_cents) });
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

  // Events: those open, and the ones that ended in the last 12 hours (to correct a result); older
  // ones are in Liquidação when they still need a decision.
  const RECENT_ENDED_MS = 12 * 3_600_000;
  admin.get('/events', (_req, res) => {
    const since = new Date(Date.now() - RECENT_ENDED_MS).toISOString();
    const events = loadEvents("e.status IN ('scheduled', 'live') OR e.updated_at > ?", [since],
      "CASE e.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, e.start_time ASC", 500);
    // The provider's own game number (WinHouse's gameId for its diagnostics).
    const ext = new Map(db.prepare('SELECT id, external_id FROM events WHERE external_id IS NOT NULL AND (status IN (\'scheduled\', \'live\') OR updated_at > ?)')
      .all(since).map((r) => [r.id, r.external_id]));
    res.json({ events: events.map((e) => ({ ...e, externalId: ext.get(e.id) ?? null })) });
  });

  // Diagnostics: everything WinHouse sends for one game — its entry in the live list (score, clock
  // and whatever other fields it has, e.g. tennis points), its live page and its tracker.
  admin.get('/events/:id/winhouse-raw', async (req, res, next) => {
    try {
      const ev = eventRow(req.params.id);
      if (!ev) throw new HttpError(404, 'Evento não encontrado.');
      if (ev.source !== WH_SOURCE || !winhouse?.enabled) throw new HttpError(409, 'Evento sem dados da WinHouse.');
      const gameId = String(ev.external_id);
      const settle = async (fn) => { try { return await fn(); } catch (err) { return { erro: err.message }; } };
      const [page, tracker] = await Promise.all([
        settle(() => winhouse.markets({ gameId, live: ev.status === 'live' })),
        winhouseTracker?.enabled ? settle(() => winhouseTracker.inspect(gameId)) : { erro: 'Tracker WinHouse desligado.' },
      ]);
      const text = JSON.stringify({
        gameId, status: ev.status,
        listaAoVivo: winhouseFeed?.rawLive?.(gameId) || (!winhouseFeed?.liveListAt?.() ? 'a lista ao vivo ainda não foi lida (espere 15 s)'
          : ev.wh_missing_since ? `o jogo saiu da lista ao vivo da WinHouse em ${ev.wh_missing_since} (terminou ou parou)` : 'o jogo não está na lista ao vivo da WinHouse'),
        // When this game is not in play there, another of the same sport that is (its whole entry).
        outroJogoAoVivo: winhouseFeed?.rawLive?.(gameId) ? undefined : winhouseFeed?.rawLiveOfSport?.(ev.sport) || `nenhum jogo de ${ev.sport} na lista ao vivo da WinHouse agora`,
        listaLidaEm: winhouseFeed?.liveListAt?.() || null,
        paginaAoVivo: page?.liveAttempt ? { keys: page.liveAttempt.keys, sample: page.liveAttempt.sample } : page?.erro ? page : { keys: page?.keys, sample: page?.sample },
        tracker,
      }, null, 2);
      res.json({ raw: text.length > 40_000 ? `${text.slice(0, 40_000)}\n…` : text });
    } catch (err) { next(err); }
  });

  // Two-step sign-in of the administrator signed in (totp.js): set up, turned on (a right code), off.
  admin.get('/2fa', (req, res) => res.json({ on: !!req.user.totp_on }));
  admin.post('/2fa/setup', (req, res) => {
    if (req.user.totp_on) throw new HttpError(409, 'A verificação em dois passos já está ativa. Desative-a primeiro.');
    const secret = newSecret();
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, req.user.id);
    res.json({ secret, url: otpauthUrl(secret, req.user.email) });
  });
  admin.post('/2fa/enable', (req, res) => {
    const u = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(req.user.id);
    if (!u?.totp_secret) throw new HttpError(400, 'Comece por gerar a chave.');
    if (!verifyCode(u.totp_secret, req.body.code)) throw new HttpError(400, 'Código incorreto. Confirme a hora do telemóvel e tente de novo.');
    db.prepare('UPDATE users SET totp_on = 1 WHERE id = ?').run(req.user.id);
    res.json({ on: true });
  });
  admin.post('/2fa/disable', (req, res) => {
    if (!req.user.totp_on) return res.json({ on: false });
    if (!verifyCode(req.user.totp_secret, req.body.code)) throw new HttpError(400, 'Código incorreto.');
    db.prepare('UPDATE users SET totp_on = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
    res.json({ on: false });
  });

  // Copies of the database (backups.js): the list, one now, and a download.
  admin.get('/backups', (_req, res) => res.json(backups?.status() || { enabled: false, list: [] }));
  admin.post('/backups', (_req, res) => {
    if (!backups) throw new HttpError(503, 'Cópias indisponíveis.');
    res.json({ copy: backups.run({ manual: true }), ...backups.status() });
  });
  admin.get('/backups/:name', (req, res) => {
    const file = backups?.fileOf(req.params.name);
    if (!file) throw new HttpError(404, 'Cópia não encontrada.');
    res.set('Cache-Control', 'no-store');
    res.download(file, req.params.name);
  });

  // Market catalogue: what the provider really returns, sampled on real games of each sport.
  const catalog = createMarketCatalog(db, [
    // WinHouse: every sport it feeds (the sports with games of that source now).
    winhouse?.enabled && winhouseFeed && {
      source: WH_SOURCE, enabled: () => true,
      sports: () => db.prepare("SELECT sport, COUNT(*) AS n FROM events WHERE source = ? AND status IN ('scheduled', 'live') GROUP BY sport ORDER BY n DESC").all(WH_SOURCE).map((r) => r.sport),
      gameMarkets: (gameId, { live }) => winhouse.markets({ gameId, live }),
      wired: (sport) => new Set([...(WH_SPORT_MARKETS[sport] || []), ...(sport === 'tenis' ? Object.keys(TENNIS_AUTO).map(Number) : [])]),
      wiredByName: (sport, m) => namedWinnerMarket(sport, { name: m.kind, code: m.code }),
    },
    feed && { sport: 'futebol', source: 'bzzoiro', enabled: () => feed.status().enabled, rawOdds: feed.rawOdds, extra: feed.rawOddsExtra },
    tennis && { sport: 'tenis', source: TENNIS_SOURCE, enabled: () => tennis.status().enabled, rawOdds: tennis.rawOdds },
    ...Object.entries(sports).map(([sport, f]) => ({ sport, source: f.source, enabled: () => f.status().enabled, rawOdds: f.rawOdds })),
  ].filter((p) => p && (p.rawOdds || p.gameMarkets)));
  // Which markets show on the site, per sport: every market of the games open now, with how many
  // games carry it; the operator hides the ones not wanted (a duplicate result, a market of no interest).
  admin.get('/market-visibility', (_req, res) => {
    const rows = db.prepare(`SELECT e.sport, s.market, CASE WHEN s.market = 'x' THEN substr(s.code, 1, instr(s.code, '~') - 1) ELSE '' END AS mid,
        MIN(s.code) AS sample, COUNT(DISTINCT s.event_id) AS n
      FROM selections s JOIN events e ON e.id = s.event_id
      WHERE e.status IN ('scheduled', 'live') GROUP BY e.sport, s.market, mid`).all();
    const hidden = hiddenMarkets();
    const out = {};
    for (const r of rows) {
      const key = r.market === 'x' ? `x:${r.mid}` : r.market;
      const name = r.market === 'x' ? splitSpecial(r.sample)?.group || `Mercado ${r.mid}` : marketName(r.sport, r.market);
      (out[r.sport] ||= []).push({ key, name, own: r.market !== 'x', games: r.n, hidden: !!hidden[r.sport]?.includes(key) });
    }
    // Hidden ones with no game now stay listed, so they can be shown again.
    for (const [sport, keys] of Object.entries(hidden)) {
      for (const key of keys) if (!(out[sport] || []).some((m) => m.key === key)) (out[sport] ||= []).push({ key, name: key, own: !key.startsWith('x:'), games: 0, hidden: true });
    }
    for (const list of Object.values(out)) list.sort((a, b) => Number(b.own) - Number(a.own) || b.games - a.games || a.name.localeCompare(b.name));
    res.json({ sports: out });
  });
  admin.post('/market-visibility', (req, res) => {
    const sport = SPORTS.includes(req.body.sport) ? req.body.sport : null;
    const key = typeof req.body.key === 'string' && /^(x:\d{1,12}|[a-z0-9]{1,8})$/.test(req.body.key) ? req.body.key : null;
    if (!sport || !key) throw new HttpError(400, 'Mercado inválido.');
    const all = { ...hiddenMarkets() };
    const set = new Set(all[sport] || []);
    if (req.body.hidden) set.add(key); else set.delete(key);
    all[sport] = [...set];
    if (!all[sport].length) delete all[sport];
    setSetting(db, 'markets.hidden', all);
    res.json({ ok: true });
  });
  admin.get('/market-catalog', (_req, res) => res.json({ catalog: catalog.last(), running: catalog.running() }));
  admin.post('/market-catalog/run', async (req, res, next) => {
    try {
      const sample = Math.min(30, Math.max(3, Number(req.body.sample) || 12));
      const sport = typeof req.body.sport === 'string' && /^[a-z]{2,20}$/.test(req.body.sport) ? req.body.sport : null;
      res.json({ catalog: await catalog.run({ sample, sport }) });
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
        payout: w.payout_status || null, payoutRef: w.payout_ref || null, payoutError: w.payout_error || null, paidAt: w.paid_at || null,
      })),
      revolut: revolut ? { configured: revolut.configured, environment: revolut.environment, autoMin: cents(revolut.autoMinCents), autoMax: cents(revolut.autoMaxCents), webhook: revolut.webhookSet } : null,
    });
  });

  // approve: approved (and, with Revolut on, paid to the IBAN; body.manual → paid by hand);
  // reject: the money goes back to the player; pay: an approved one sent through Revolut now.
  admin.post('/withdrawals/:id/:decision', wrap(async (req, res) => {
    const { decision } = req.params;
    if (!['approve', 'reject', 'pay'].includes(decision)) throw new HttpError(404, 'Ação desconhecida.');
    const id = Number(req.params.id);
    const viaRevolut = !!revolut?.configured && req.body?.manual !== true && decision !== 'reject';
    tx(db, () => {
      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      if (!w) throw new HttpError(404, 'Levantamento não encontrado.');
      if (decision === 'pay') {
        if (!revolut?.configured) throw new HttpError(503, 'Revolut não configurada.');
        if (w.status !== 'approved') throw new HttpError(409, 'Só um levantamento aprovado pode ser pago.');
        if (['processing', 'paid'].includes(w.payout_status)) throw new HttpError(409, 'Este levantamento já foi enviado para a Revolut.');
        return;
      }
      if (w.status !== 'pending') throw new HttpError(409, 'Levantamento já decidido.');
      if (w.payout_status === 'processing') throw new HttpError(409, 'O pagamento deste levantamento está em curso na Revolut.');
      db.prepare('UPDATE withdrawals SET status = ?, decided_at = ? WHERE id = ?')
        .run(decision === 'approve' ? 'approved' : 'rejected', nowIso(), w.id);
      if (decision === 'reject') {
        postTransaction(db, w.user_id, w.amount_cents, 'withdrawal_refund', 'Levantamento rejeitado — valor devolvido', `withdrawal:${w.id}`);
      }
    });
    if (!viaRevolut) return res.json({ ok: true });
    const w = await payWithdrawal(id);
    if (w.payout_status === 'failed') throw new HttpError(502, `Pagamento Revolut falhou: ${w.payout_error}. O levantamento voltou a pendente.`);
    res.json({ ok: true, payout: w.payout_status });
  }));

  admin.get('/users', (_req, res) => {
    const rows = db.prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bets
         FROM users u ORDER BY u.id DESC LIMIT 200`
    ).all();
    // Identity documents waiting for the administrator: shown first, whenever they were sent.
    const kycPending = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bets,
        (SELECT MAX(created_at) FROM kyc_documents d WHERE d.user_id = u.id AND d.status = 'pending') AS sent_at
      FROM users u WHERE EXISTS (SELECT 1 FROM kyc_documents d WHERE d.user_id = u.id AND d.status = 'pending') ORDER BY sent_at`).all();
    res.json({
      users: rows.map((u) => ({ ...userOut(u), bets: u.bets })),
      kycPending: kycPending.map((u) => ({ ...userOut(u), bets: u.bets, kycSentAt: u.sent_at })),
    });
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
    // op: add / subtract (the value given) or set (the balance becomes the value given).
    const op = req.body?.op;
    let amount;
    if (op === 'set') {
      const raw = String(req.body?.amount ?? '').trim().replace(',', '.');
      const target = raw === '0' || raw === '0.00' || Number(raw) === 0 ? 0 : parseEuros(raw, 'Valor');
      amount = target - userById(u.id).balance_cents;
      if (!amount) throw new HttpError(400, 'O saldo já tem esse valor.');
    } else {
      amount = signedCents(req.body?.amount);
      if (op === 'subtract') amount = -Math.abs(amount);
      else if (op === 'add') amount = Math.abs(amount);
    }
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
  // Free spins for the player (tests, support): in the games of the Free Spins campaign.
  admin.post('/users/:id/free-spins', (req, res) => {
    const u = playerRow(req.params.id);
    const s = tx(db, () => grantAdminSpins(db, u.id, {
      spins: req.body?.spins, spinValueCents: parseEuros(req.body?.spinValue ?? 0.2, 'Valor por rodada'), days: req.body?.days,
      ref: `admin:${req.user.id}:${Date.now()}:${u.id}:fs`, note: req.body?.note ? str(req.body.note, 120) : null, games: req.body?.games,
    }));
    res.json({ ok: true, freeSpins: spinsView(s) });
  });
  admin.post('/freebets/:id/cancel', (req, res) => {
    const f = db.prepare('SELECT * FROM freebets WHERE id = ?').get(Number(req.params.id));
    if (!f) throw new HttpError(404, 'Free bet não encontrada.');
    if (f.status !== 'active') throw new HttpError(409, 'Esta free bet já não está ativa.');
    db.prepare("UPDATE freebets SET status = 'cancelled' WHERE id = ?").run(f.id);
    res.json({ ok: true });
  });

  // ---------- Free Spins promotions (fspromos.js) ----------
  // Only games where a bet other than the fixed one is refused before it is taken (the seamless
  // casino): Palace slots (Transfer mode) cannot refuse it, so they are not offered.
  const fsCompatible = async (ids) => {
    const out = [];
    for (const id of [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]) {
      const g = bb ? await bb.game(id).catch(() => null) : null;
      if (bb && !g) throw new HttpError(400, `Jogo ${id} não encontrado no catálogo.`);
      // A Palace slot only through BigBang's copy of it (that casino cannot refuse a bet before taking it).
      if (g?.source === 'palace' && !(await bb.twin(g))) throw new HttpError(400, `${g.name}: incompatível com Free Spins de aposta fixa (o fornecedor não permite recusar a aposta antes de a debitar).`);
      out.push(id);
    }
    return out;
  };
  const promoView = async (p) => ({ ...p, gameList: await Promise.all(p.games.map(async (id) => {
    const g = bb ? await bb.game(id).catch(() => null) : null;
    return { id, name: g?.name || `Jogo ${id}`, provider: g?.provider || '', compatible: !!g && (g.source !== 'palace' || !!(await bb.twin(g))) };
  })) });
  admin.get('/fs-promotions', wrap(async (_req, res) => {
    res.json({ promotions: await Promise.all(promoList(db).map(promoView)) });
  }));
  admin.post('/fs-promotions', wrap(async (req, res) => {
    const games = await fsCompatible(req.body?.games);
    res.status(201).json({ promotion: fromPromoRow(tx(db, () => createPromo(db, { ...req.body, games }, req.user.id))) });
  }));
  admin.put('/fs-promotions/:id', wrap(async (req, res) => {
    const input = { ...req.body };
    if (input.games !== undefined) input.games = await fsCompatible(input.games);
    res.json({ promotion: fromPromoRow(tx(db, () => updatePromo(db, req.params.id, input, req.user.id))) });
  }));
  admin.post('/fs-promotions/:id/status', (req, res) => {
    res.json({ promotion: fromPromoRow(tx(db, () => setPromoStatus(db, req.params.id, str(req.body?.status, 20), req.user.id, req.body?.reason ? str(req.body.reason, 200) : null))) });
  });
  // ---------- risk (profiles per player, liability ceilings, alerts) ----------
  admin.get('/risk', (_req, res) => {
    const cfg = riskConfig(db);
    res.json({
      config: { ...cfg, selectionLiability: cfg.selectionLiabilityCents / 100, eventLiability: cfg.eventLiabilityCents / 100, alertProfit: cfg.alertProfitCents / 100,
        kycDeposit: cfg.kycDepositCents / 100, alertBigDeposit: cfg.alertBigDepositCents / 100 },
      profiles: Object.entries(RISK_PROFILES).map(([id, p]) => ({ id, ...p })),
      maxStake: config.limits.maxStakeCents / 100,
      alerts: riskAlerts(db), exposure: exposure(db), ...riskOverview(db), sanctions: sanctionsView(db),
    });
  });
  // The sanctions lists downloaded again now (and every player compared), and a match decided.
  admin.post('/risk/sanctions/refresh', wrap(async (_req, res) => {
    if (!sanctions) throw new HttpError(503, 'Verificação de sanções desligada.');
    res.json({ found: await sanctions.refresh(), sanctions: sanctionsView(db) });
  }));
  admin.post('/risk/sanctions/:id', (req, res) => {
    try { res.json(tx(db, () => decideHit(db, req.params.id, str(req.body?.decision, 20), req.user.id))); }
    catch (err) { throw err.status ? new HttpError(err.status, err.message) : err; }
  });
  admin.put('/risk/config', (req, res) => res.json({ config: saveRiskConfig(db, req.body || {}) }));
  // A player's profile, by id or e-mail.
  admin.post('/risk/users', (req, res) => {
    const who = String(req.body?.user || '').trim();
    const u = /^\d+$/.test(who) ? db.prepare('SELECT id FROM users WHERE id = ?').get(Number(who)) : db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(who);
    if (!u) throw new HttpError(404, 'Jogador não encontrado (id ou e-mail).');
    res.json(tx(db, () => setRiskProfile(db, u.id, str(req.body?.profile, 20), { note: req.body?.note ? str(req.body.note, 300) : null, adminId: req.user.id })));
  });

  admin.get('/fs-promotions/:id/history', (req, res) => res.json({ history: promoHistory(db, req.params.id) }));
  // Gives the promotion to players (ids or e-mails): each one checked on its own.
  admin.post('/fs-promotions/:id/grant', (req, res) => {
    const who = (Array.isArray(req.body?.players) ? req.body.players : String(req.body?.players || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 500);
    if (!who.length) throw new HttpError(400, 'Indique os jogadores (id ou e-mail).');
    const results = who.map((w) => {
      const u = /^\d+$/.test(w) ? db.prepare('SELECT id FROM users WHERE id = ?').get(Number(w)) : db.prepare('SELECT id FROM users WHERE email = ?').get(w.toLowerCase());
      if (!u) return { player: w, ok: false, reason: 'jogador não encontrado' };
      try {
        const s = tx(db, () => grantPromo(db, req.params.id, u.id, { adminId: req.user.id, ref: `fsp:${req.params.id}:${u.id}:${req.user.id}:${Date.now()}` }));
        return { player: w, ok: true, spinsId: s.id };
      } catch (err) { return { player: w, ok: false, reason: err.message }; }
    });
    res.json({ results });
  });
  // A grant's technical history (spins, refusals, wins, rollbacks, conversion).
  admin.get('/free-spins/:id/audit', (req, res) => res.json({ audit: spinsAudit(db, req.params.id) }));

  // ---------- cash out (rules and what was paid) ----------
  admin.get('/cashout', (_req, res) => {
    const t = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS stake, COALESCE(SUM(value_cents), 0) AS paid, COALESCE(SUM(fair_cents), 0) AS fair, COALESCE(SUM(live), 0) AS live FROM cashouts').get();
    const recent = db.prepare('SELECT c.*, u.name FROM cashouts c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 30').all()
      .map((c) => ({ betId: c.bet_id, user: c.name, stake: cents(c.stake_cents), value: cents(c.value_cents), fair: cents(c.fair_cents), live: !!c.live, createdAt: c.created_at }));
    res.json({ config: cashoutConfig(db), totals: { count: t.n, stake: cents(t.stake), paid: cents(t.paid), margin: cents(t.fair - t.paid), live: t.live }, recent });
  });
  admin.put('/cashout', (req, res) => res.json({ config: saveCashoutConfig(db, req.body || {}) }));

  // ---------- promotions (configuration, bonuses, decisions) ----------
  admin.get('/promotions', wrap(async (_req, res) => {
    const who = (r) => ({ userId: r.user_id, user: r.name, email: r.email });
    const config = promoConfig(db);
    // The free-spins games by name (the admin picks them by name).
    const fsGames = [];
    for (const id of config.casinoFs.games) {
      const g = bb ? await bb.game(id).catch(() => null) : null;
      fsGames.push({ id, name: g?.name || `Jogo ${id}`, provider: g?.provider || '', found: !!g });
    }
    res.json({
      config, fsGames,
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
  }));
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

  admin.get('/users/:id', wrap(async (req, res) => {
    const u = playerRow(req.params.id);
    // A game open: the balance is in the casino meanwhile (not lost), shown live.
    let inCasino = null;
    if (u.casino_active && casino?.enabled) {
      try { inCasino = cents(await casino.casinoBalanceCents(u)); } catch { inCasino = 'indisponível'; }
    }
    const bets = withLegs(db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id));
    const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id)
      .map((t) => ({ id: t.id, type: t.type, amount: cents(t.amount_cents), balanceAfter: cents(t.balance_after_cents), description: t.description, createdAt: t.created_at }));
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id)
      .map((w) => ({ id: w.id, amount: cents(w.amount_cents), iban: w.iban, status: w.status, createdAt: w.created_at, decidedAt: w.decided_at }));
    const documents = db.prepare('SELECT id, kind, file_name, mime_type, file_size, status, created_at, reviewed_at FROM kyc_documents WHERE user_id = ? ORDER BY id DESC').all(u.id)
      .map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, mimeType: d.mime_type, size: d.file_size, status: d.status, createdAt: d.created_at, reviewedAt: d.reviewed_at }));
    const sum = (type) => cents(db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE user_id = ? AND type = ?').get(u.id, type).s);
    res.json({
      user: { ...userOut(u), bets: bets.length, promoBlocked: !!u.promo_blocked, inCasino }, bets, transactions: txs, withdrawals, documents,
      withdraw: withdrawEligibility(db, u),
      promotions: playerPromos(db, u.id), limits: limitsView(currentLimits(db, u)),
      totals: { deposits: sum('deposit'), withdrawals: -sum('withdrawal'), staked: -sum('bet'), payouts: sum('payout'),
        casinoOut: -sum('casino_out'), casinoIn: sum('casino_in') },
    });
  }));

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

  admin.get('/bets', (req, res) => {
    // ?status=open: the tickets still waiting (oldest first: the ones the settlement may have missed).
    const open = req.query.status === 'open';
    const bets = db.prepare(
      `SELECT b.*, u.email FROM bets b JOIN users u ON u.id = b.user_id ${open ? "WHERE b.status = 'open'" : ''} ORDER BY b.id ${open ? 'ASC' : 'DESC'} LIMIT ${open ? 300 : 100}`
    ).all();
    const emails = new Map(bets.map((b) => [b.id, b.email]));
    res.json({ bets: withLegs(bets).map((b) => ({ ...b, email: emails.get(b.id) })) });
  });

  /**
   * A ticket settled by hand, when the automatic settlement fails: each open leg decided (won /
   * lost / void), then the ticket is paid as it would have been (settleBet: real money, bonus or
   * free bet back where they came from). Legs left open keep the ticket open.
   */
  admin.post('/bets/:id/settle', (req, res) => {
    const decisions = req.body?.legs && typeof req.body.legs === 'object' ? req.body.legs : {};
    const note = str(req.body?.note, 200) || null;
    const out = tx(db, () => {
      const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(Number(req.params.id));
      if (!bet) throw new HttpError(404, 'Bilhete não encontrado.');
      if (bet.status !== 'open') throw new HttpError(409, 'Este bilhete já está liquidado.');
      const legs = db.prepare("SELECT id FROM bet_legs WHERE bet_id = ? AND status = 'open'").all(bet.id);
      let decided = 0;
      for (const l of legs) {
        const v = decisions[l.id];
        if (v === undefined || v === null || v === '') continue;
        if (!['won', 'lost', 'void'].includes(v)) throw new HttpError(400, 'Resultado inválido (ganha, perdida ou anulada).');
        db.prepare('UPDATE bet_legs SET status = ? WHERE id = ?').run(v, l.id);
        decided += 1;
      }
      if (!decided) throw new HttpError(400, 'Escolha o resultado de pelo menos uma seleção.');
      db.prepare('UPDATE bets SET manual_by = ?, manual_at = ?, manual_note = ? WHERE id = ?').run(req.user.id, nowIso(), note, bet.id);
      const paid = settleBet(db, bet.id);
      const after = db.prepare('SELECT status FROM bets WHERE id = ?').get(bet.id);
      return { status: after.status, paid: cents(paid), decided };
    });
    res.json(out);
  });

  /**
   * Players of the previous platform (Bet62Novo), from its database (BET62NOVO_DATABASE_URL, its
   * public URL): { dryRun: true } only reports what would be brought; false brings them.
   */
  let importing = false;
  admin.post('/import-novo', wrap(async (req, res) => {
    const url = String(process.env.BET62NOVO_DATABASE_URL || '').trim();
    if (!url) throw new HttpError(409, 'Falta a variável BET62NOVO_DATABASE_URL no Railway (o endereço público da base de dados do Bet62Novo).');
    if (importing) throw new HttpError(409, 'Já está uma importação a decorrer.');
    importing = true;
    let pg;
    try {
      try { pg = await connectNovo(url); } catch (err) { throw new HttpError(502, `Não foi possível ligar à base de dados do Bet62Novo: ${err.message}`); }
      const report = await importNovo(db, pg, { dryRun: req.body?.dryRun !== false });
      if (!report.dryRun) console.warn(`[import-novo] ${report.imported} jogadores importados por ${req.user.email}`);
      res.json({ report });
    } finally {
      importing = false;
      await pg?.end().catch(() => {});
    }
  }));

  // ---------- Promotional campaigns (email / SMS through Brevo) ----------

  const campaigns = createCampaigns(db, { brevo, log: (m) => console.warn(`[campanhas] ${m}`) });
  const campaignError = (err) => (err instanceof HttpError ? err : new HttpError([400, 409].includes(err.status) ? err.status : 502, err.message));
  const campaignOut = (c) => ({
    id: c.id, channel: c.channel, segment: c.segment, days: c.days, subject: c.subject, body: c.body, ctaText: c.cta_text, ctaUrl: c.cta_url,
    status: c.status, total: c.total, sent: c.sent, failed: c.failed, error: c.error, createdBy: c.created_by, createdAt: c.created_at, finishedAt: c.finished_at,
  });

  // Team badges: what is set, the API-Football account and what is kept; "search now" runs a round.
  admin.post('/team-logos/check', async (_req, res, next) => {
    try { res.json({ steps: teamLogos ? await teamLogos.diagnose() : [{ name: 'Emblemas', ok: false, detail: 'não iniciado' }] }); }
    catch (err) { next(err); }
  });
  admin.post('/team-logos/run', async (_req, res, next) => {
    try { res.json(teamLogos ? await teamLogos.run() : { asked: 0, found: 0 }); }
    catch (err) { next(err); }
  });

  // GOAL API (match statistics): the key, today's requests, a real call.
  admin.post('/goal-api/refresh', (_req, res) => res.json({ cleared: goalApi?.refresh() || 0 }));
  admin.post('/goal-api/check', async (_req, res, next) => {
    try { res.json({ steps: goalApi ? await goalApi.diagnose() : [{ name: 'GOAL API', ok: false, detail: 'não iniciada' }] }); }
    catch (err) { next(err); }
  });

  admin.get('/campaigns', (_req, res) => {
    const optedIn = (channel) => campaigns.audience({ channel, segment: 'all' }).length;
    const registered = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'user' AND banned_at IS NULL").get().n;
    res.json({ status: campaigns.status(), segments: SEGMENTS, optedIn: { email: optedIn('email'), sms: optedIn('sms'), registered }, campaigns: campaigns.list().map(campaignOut) });
  });
  admin.post('/campaigns/check', async (_req, res, next) => {
    try { res.json({ steps: brevo ? await brevo.diagnose() : [{ name: 'Brevo', ok: false, detail: 'não configurado' }] }); }
    catch (err) { next(campaignError(err)); }
  });
  admin.post('/campaigns/count', (req, res) => {
    try { res.json({ count: campaigns.audience({ channel: req.body?.channel, segment: req.body?.segment, days: req.body?.days }).length }); }
    catch (err) { throw campaignError(err); }
  });
  admin.post('/campaigns/test', async (req, res, next) => {
    try {
      await campaigns.test(req.body || {}, { email: req.user.email, phone: str(req.body?.testPhone, 30) || req.user.phone, name: req.user.name }, siteUrl(req));
      res.json({ ok: true });
    } catch (err) { next(campaignError(err)); }
  });
  admin.post('/campaigns', (req, res) => {
    try {
      const r = campaigns.start(req.body || {}, { by: req.user.email, baseUrl: siteUrl(req) });
      r.done.catch((err) => console.warn(`[campanhas] #${r.id}: ${err.message}`));
      res.status(201).json({ id: r.id, total: r.total });
    } catch (err) { throw campaignError(err); }
  });

  // ---------- Telegram channel ----------

  /** The bot's state, the admin's posts and the games posted automatically (newest first). */
  admin.get('/telegram', (_req, res) => {
    const promos = db.prepare(`SELECT p.*, e.home, e.away, e.competition, e.start_time FROM telegram_promos p LEFT JOIN events e ON e.id = p.event_id
      ORDER BY p.id DESC LIMIT 50`).all();
    res.json({
      status: telegram ? telegram.status() : { enabled: false },
      posts: db.prepare('SELECT * FROM telegram_posts ORDER BY id DESC LIMIT 50').all(),
      tickets: db.prepare("SELECT * FROM telegram_tickets WHERE legs != '[]' OR error IS NOT NULL ORDER BY id DESC LIMIT 30").all()
        .map((t) => ({ id: t.id, slot: t.slot, legs: JSON.parse(t.legs), odds: t.odds_x100 / 100, stake: t.stake_cents / 100, status: t.status, error: t.error, createdAt: t.created_at })),
      promos: promos.map((p) => ({ id: p.id, eventId: p.event_id, game: p.home ? `${p.home} - ${p.away}` : `#${p.event_id}`, competition: p.competition, startTime: p.start_time,
        tier: p.tier, status: p.status, error: p.error, createdAt: p.created_at })),
    });
  });

  /** Publishes a post now: { type: custom | promotion | bet_ticket, title, body, ctaText?, ctaUrl? }. */
  admin.post('/telegram/posts', wrap(async (req, res) => {
    if (!telegram?.enabled) throw new HttpError(409, 'Telegram não está configurado: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID no Railway.');
    const b = req.body || {};
    const type = ['custom', 'promotion', 'bet_ticket'].includes(b.type) ? b.type : null;
    const title = str(b.title, 200);
    const body = str(b.body, 3500);
    const ctaText = str(b.ctaText, 60);
    const ctaUrl = str(b.ctaUrl, 500);
    if (!type) throw new HttpError(400, 'Tipo inválido.');
    if (!title || !body) throw new HttpError(400, 'Título e texto são obrigatórios.');
    if (ctaText && !/^https:\/\//.test(ctaUrl)) throw new HttpError(400, 'O botão precisa de um link https://.');
    const r = await telegram.publish({ type, title, body, ctaText, ctaUrl, by: req.user.email });
    if (!r.ok) throw new HttpError(502, `Telegram: ${r.error}`);
    res.status(201).json({ id: r.id, messageId: r.messageId });
  }));

  /** Automatic posts on / off, or the next game posted now (whatever the gap). */
  admin.post('/telegram/auto', (req, res) => {
    setSetting(db, 'telegram.auto', req.body?.on !== false);
    res.json({ status: telegram ? telegram.status() : { enabled: false } });
  });
  /** Suggested tickets: { on, times: ['12:00', …], legs, minOdds, maxOdds, stake, hours }. */
  admin.post('/telegram/tickets/config', (req, res) => {
    const b = req.body || {};
    const num = (v, min, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
    const times = String(Array.isArray(b.times) ? b.times.join(',') : b.times || '').split(/[,;\s]+/).filter(Boolean);
    if (times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new HttpError(400, 'Horários no formato HH:MM, separados por vírgulas (ex.: 12:00, 18:00).');
    const c = { on: b.on === true, times: [...new Set(times)].sort().slice(0, 12), legs: num(b.legs, 2, 8), minOdds: num(b.minOdds, 1.01, 20), maxOdds: num(b.maxOdds, 1.01, 50), stake: num(b.stake, 1, 10_000), hours: num(b.hours, 1, 48) };
    if ([c.legs, c.minOdds, c.maxOdds, c.stake, c.hours].includes(null)) throw new HttpError(400, 'Valores inválidos: jogos 2–8, odds entre 1.01 e 50, aposta 1–10000 €, janela 1–48 h.');
    if (c.minOdds > c.maxOdds) throw new HttpError(400, 'A odd mínima não pode ser maior que a máxima.');
    c.legs = Math.round(c.legs);
    setSetting(db, 'telegram.tickets', c);
    res.json({ tickets: c });
  });
  admin.post('/telegram/tickets/post', wrap(async (_req, res) => {
    if (!telegram?.enabled) throw new HttpError(409, 'Telegram não está configurado: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID no Railway.');
    res.json(await telegram.postTicket());
  }));
  admin.post('/telegram/promote', wrap(async (_req, res) => {
    if (!telegram?.enabled) throw new HttpError(409, 'Telegram não está configurado: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID no Railway.');
    res.json(await telegram.promoteNext({ force: true }));
  }));

  // ---------- banners (top of the casino) ----------
  const bannerErr = (fn) => (req, res) => {
    try { fn(req, res); } catch (err) { throw err instanceof BannerError ? new HttpError(400, err.message) : err; }
  };
  admin.get('/banners', (_req, res) => res.json({ banners: banners.all() }));
  admin.post('/banners', bannerErr((req, res) => res.json({ banner: banners.save(req.body || {}) })));
  admin.post('/banners/order', (req, res) => res.json({ banners: banners.reorder(Array.isArray(req.body?.ids) ? req.body.ids : []) }));
  admin.post('/banners/:id/enabled', (req, res) => {
    if (!banners.setEnabled(req.params.id, req.body?.on === true)) throw new HttpError(404, 'Banner não encontrado.');
    res.json({ ok: true });
  });
  admin.post('/banners/:id/delete', (req, res) => {
    if (!banners.remove(req.params.id)) throw new HttpError(404, 'Banner não encontrado.');
    res.json({ ok: true });
  });

  // ---------- destaques (one game shown big between the casino rows) ----------
  const spotErr = (fn) => (req, res) => {
    try { fn(req, res); } catch (err) { throw err instanceof SpotlightError ? new HttpError(400, err.message) : err; }
  };
  admin.get('/spotlights', wrap(async (_req, res) => {
    const list = await Promise.all(spotlights.all().map(async (s) => {
      const g = bb ? await bb.game(s.gameId) : null;
      return { ...s, game: g ? { id: g.id, name: g.name, provider: g.provider, image: g.image } : { id: s.gameId, name: `Jogo ${s.gameId} (fora do catálogo)`, missing: true } };
    }));
    res.json({ spotlights: list, after: SPOT_AFTER });
  }));
  admin.post('/spotlights', spotErr((req, res) => res.json({ spotlight: spotlights.save(req.body || {}) })));
  admin.post('/spotlights/order', (req, res) => res.json({ spotlights: spotlights.reorder(Array.isArray(req.body?.ids) ? req.body.ids : []) }));
  admin.post('/spotlights/:id/enabled', (req, res) => {
    if (!spotlights.setEnabled(req.params.id, req.body?.on === true)) throw new HttpError(404, 'Destaque não encontrado.');
    res.json({ ok: true });
  });
  admin.post('/spotlights/:id/delete', (req, res) => {
    if (!spotlights.remove(req.params.id)) throw new HttpError(404, 'Destaque não encontrado.');
    res.json({ ok: true });
  });

  // ---------- coleções (rows of games chosen by the operator) ----------
  const collectionErr = (fn) => (req, res) => {
    try { fn(req, res); } catch (err) { throw err instanceof CollectionError ? new HttpError(400, err.message) : err; }
  };
  admin.get('/collections', wrap(async (_req, res) => {
    const list = collections.all();
    // Each collection with its games' names and pictures (the editor shows them).
    const games = async (ids) => (await Promise.all(ids.map(async (id) => {
      const g = bb ? await bb.game(id) : null;
      return g ? { id: g.id, name: g.name, provider: g.provider, image: g.image } : { id, name: `Jogo ${id} (fora do catálogo)`, provider: '', image: null, missing: true };
    })));
    res.json({ collections: await Promise.all(list.map(async (c) => ({ ...c, games: await games(c.games) }))) });
  }));
  admin.post('/collections', collectionErr((req, res) => res.json({ collection: collections.save(req.body || {}) })));
  admin.post('/collections/order', (req, res) => res.json({ collections: collections.reorder(Array.isArray(req.body?.ids) ? req.body.ids : []) }));
  admin.post('/collections/:id/enabled', (req, res) => {
    if (!collections.setEnabled(req.params.id, req.body?.on === true)) throw new HttpError(404, 'Coleção não encontrada.');
    res.json({ ok: true });
  });
  admin.post('/collections/:id/delete', (req, res) => {
    if (!collections.remove(req.params.id)) throw new HttpError(404, 'Coleção não encontrada.');
    res.json({ ok: true });
  });

  // ---------- películas (covers over parts of casino games) ----------
  const skinErr = (fn) => (req, res) => {
    try { fn(req, res); } catch (err) { throw err instanceof SkinError ? new HttpError(400, err.message) : err; }
  };
  admin.get('/skins', (_req, res) => res.json({ mode: getSetting(db, 'casino.skins', 'off'), skins: skins.all() }));
  // Opens a game for the admin inside the editor (no money moves: the cover is made with the game idle).
  admin.post('/skins/launch', wrap(async (req, res) => {
    const code = String(req.body?.code || '');
    if (!casino?.enabled) throw new HttpError(409, 'A Palace não está configurada: não é possível abrir o jogo aqui.');
    const game = (await casino.games()).games.find((g) => g.code === code);
    if (!game) throw new HttpError(404, 'Jogo não encontrado no catálogo da Palace.');
    res.json({ url: await casino.launch(req.user, { providerId: game.providerId, gameCode: game.code, returnUrl: '' }) });
  }));
  admin.get('/skins/:id/ref', (req, res) => sendImage(res, skins.image(req.params.id, 'ref')));
  admin.get('/skins/:id/clean', (req, res) => sendImage(res, skins.image(req.params.id, 'clean')));
  admin.post('/skins', skinErr((req, res) => res.json({ skin: skins.save(req.body || {}) })));
  admin.post('/skins/:id/enabled', (req, res) => {
    if (!skins.setEnabled(req.params.id, req.body?.on === true)) throw new HttpError(404, 'Película não encontrada.');
    res.json({ ok: true });
  });
  admin.post('/skins/:id/delete', (req, res) => {
    if (!skins.remove(req.params.id)) throw new HttpError(404, 'Película não encontrada.');
    res.json({ ok: true });
  });

  /** Covers over the "buy free spins" panel of some Pragmatic games: off | admin (trial) | all. */
  admin.post('/casino/skins', (req, res) => {
    const mode = ['off', 'admin', 'all'].includes(req.body?.mode) ? req.body.mode : 'off';
    setSetting(db, 'casino.skins', mode);
    res.json({ mode });
  });

  /** Who serves the slots: BigBang (everything) or Palace (slots) + BigBang (live tables). */
  admin.post('/casino/mode', wrap(async (req, res) => {
    const on = req.body?.split === true;
    if (on && !casino?.enabled) throw new HttpError(409, 'A Palace não está configurada: defina CASINO_API_URL e CASINO_API_TOKEN no Railway.');
    setSetting(db, 'casino.split', on);
    bb?.reload();
    const all = bb ? await bb.games() : null;
    res.json({ split: on, games: all?.games.length ?? 0, error: all?.error || null });
  }));
  /** Standard (BigBang's own engines) or Premium (the providers' original games) when both exist. */
  admin.post('/casino/premium', wrap(async (req, res) => {
    setSetting(db, 'casino.premium', req.body?.on === true);
    bb?.reload();
    const all = bb ? await bb.games() : null;
    res.json({ premium: req.body?.on === true, games: all?.games.length ?? 0, premiumGames: all?.games.filter((g) => g.premium).length ?? 0 });
  }));
  // Opens one game for the admin and shows its address (secrets masked): does it carry a jurisdiction?
  admin.post('/casino/launch-inspect', wrap(async (req, res) => {
    if (!casino?.enabled) throw new HttpError(503, 'Defina CASINO_API_URL e CASINO_API_TOKEN no Railway.');
    res.json(await casino.inspectLaunch(req.user, {
      name: String(req.body?.name || 'Gates of Olympus').slice(0, 80),
      jurisdiction: String(req.body?.jurisdiction || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12),
      open: req.body?.open === true,
    }));
  }));
  admin.post('/casino/palace-test', wrap(async (_req, res) => {
    if (!casino?.enabled) return res.json({ steps: [{ name: 'Configuração', ok: false, detail: 'Defina CASINO_API_URL e CASINO_API_TOKEN no Railway.' }] });
    res.json({ steps: await casino.diagnose() });
  }));

  /** Games hidden from the casino: names or ids, one per line (or comma-separated). */
  admin.post('/casino/hidden', (req, res) => {
    const list = [...new Set(String(req.body?.hidden || '').split(/[\n,;]+/).map((x) => x.trim().slice(0, 120)).filter(Boolean))].slice(0, 500);
    setSetting(db, 'casino.hidden', list);
    res.json({ hidden: list });
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
        callbacks: { userData: `${origin}/api/casino/bb/user`, balanceChange: `${origin}/api/casino/bb/balance` }, calls: bb.callLog(), hidden: bb.hiddenList(),
        serverDelay: loopDelay(),
        // Split: Palace for the slots, BigBang only for the live tables (setting casino.split).
        premium: getSetting(db, 'casino.premium', false) === true,
        split: !!getSetting(db, 'casino.split', false), skins: getSetting(db, 'casino.skins', 'off'), palace: { configured: !!casino?.enabled, urlSet: !!config.casino.baseUrl, tokenSet: !!config.casino.token },
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
      maintenance: maintenance(),
      tennis: tennis ? { ...tennis.status(), liveSocket: tennisLive ? tennisLive.status() : { enabled: false } } : { enabled: false },
      sports: Object.values(sports).map((f) => f.status()),
      propline: propline ? propline.status() : { enabled: false, keySet: false },
      requestBudget: providerSummary()[0] || null,
      winhouse: { enabled: !!winhouse?.enabled, feed: winhouseFeed ? winhouseFeed.status() : null, varSeen: getSetting(db, 'winhouse.varSeen', []) || [] },
      rapidStream: !!rapidStream?.enabled,
      rapidKey: !!rapidStream,
    });
  });

  // Maintenance screen on the site: on/off, whole site or sports only, and an optional message.
  admin.get('/maintenance', (_req, res) => res.json(maintenance()));
  admin.put('/maintenance', (req, res) => {
    const b = req.body || {};
    const before = maintenance();
    const on = !!b.on;
    setSetting(db, 'maintenance', {
      on, scope: b.scope === 'all' ? 'all' : 'sports', message: String(b.message || '').trim().slice(0, 300),
      since: on ? (before.on ? before.since : nowIso()) : null,
    });
    res.json(maintenance());
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
  // The competitions WinHouse sent that were left out, and why (the name to add when one is missing).
  admin.get('/winhouse/skipped', (req, res) => res.json({ leagues: skippedLeagues(str(req.query.q, 60)) }));

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
  // Any route of the configured streaming API, as it answers (to learn a new API's shape).
  admin.get('/rapidstream/raw', async (req, res, next) => {
    try {
      if (!rapidStream) return res.json({ enabled: false, hint: 'Defina RAPIDAPI_KEY nas Variables do Railway e faça redeploy.' });
      res.json(await rapidStream.raw(String(req.query.path || '/')));
    } catch (err) { if (/caminho/.test(err.message)) return next(new HttpError(400, err.message)); res.json({ error: err.message }); }
  });

  admin.get('/rapidstream', async (req, res, next) => {
    try {
      if (!rapidStream?.enabled) return res.json({ enabled: false, hint: 'Defina RAPIDAPI_KEY nas Variables do Railway e faça redeploy.' });
      const c = await rapidStream.liveMatches({ fresh: req.query.fresh === '1' });
      // Live on the site: not the ones that already left WinHouse's live list (waiting to be settled).
      const ours = db.prepare("SELECT id, home, away FROM events WHERE status = 'live' AND sport = 'futebol' AND wh_missing_since IS NULL").all();
      const covered = [];
      for (const e of ours) {
        const f = rapidStream.findMatch(c.matches, e.home, e.away);
        if (!f) continue;
        const item = { id: e.id, game: `${e.home} × ${e.away}`, api: `${f.match.home_team_name} × ${f.match.away_team_name}`, apiId: f.match.id, score: Math.round(f.score * 100) / 100 };
        // "Ler agora": the game's own route is asked too (as when a player opens it), a few games at most.
        if (req.query.fresh === '1' && covered.length < 5) {
          const r = await rapidStream.streamsFor(e.home, e.away);
          Object.assign(item, { playable: r.servers.length, linkAnswer: r.answer });
          // The first stream fetched from our server, as the proxy would (status and first bytes).
          if (r.servers[0] && covered.filter((x) => x.probe).length < 2) item.probe = await rapidStream.probe(r.servers[0]);
        } else Object.assign(item, { playable: playableServers(f.match.servers).length });
        covered.push(item);
      }
      res.json({
        status: { ...rapidStream.status(), relay: streamRelay?.status() ?? null }, ourLive: ours.length, covered,
        // Our live games by name, to compare with the API's list when nothing is covered.
        ourGames: ours.slice(0, 40).map((e) => `${e.home} × ${e.away}`),
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
  // Scripts, styles and SVG: from memory, compressed once, kept a year when versioned (?v=).
  app.use(staticText(PUBLIC_DIR, { transform: (rel, raw) => (rel.endsWith('.js') && !rel.includes('/') ? assets.file(rel)?.body : raw) }));
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
