// Central configuration. Every value can be overridden with an environment variable
// (see .env.example). Money is always handled in integer cents.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load a .env file (project folder, then the current directory) when there is one. Variables
// already set in the environment win over the file.
const presetPassword = process.env.ADMIN_PASSWORD;
for (const file of [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'), path.resolve('.env')]) {
  if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(file); } catch (err) { console.warn(`[config] não foi possível ler ${file}: ${err.message}`); }
    // In a .env file everything after "#" is a comment, so a password such as "Senha#2024" would
    // be cut to "Senha". The admin password is read whole from its line instead.
    if (presetPassword === undefined) {
      const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?ADMIN_PASSWORD\s*=/.test(l));
      const raw = line?.replace(/^\s*(export\s+)?ADMIN_PASSWORD\s*=\s*/, '').trim();
      if (raw && !/^["'`]/.test(raw)) process.env.ADMIN_PASSWORD = raw;
    }
    break;
  }
}

const env = process.env;
// Hosting dashboards (Railway, Render…) keep quotes typed in a variable's value: ADMIN_PASSWORD="x"
// would otherwise need the quotes typed at login too.
const unquote = (v) => String(v || '').trim().replace(/^(["'`])(.*)\1$/s, '$2').trim();

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  env: env.NODE_ENV || 'development',
  isProduction: env.NODE_ENV === 'production',
  port: int(env.PORT, 8080),
  dbPath: env.DB_PATH || 'data/classicbet.db',

  // Initial administrator. In production both must be set explicitly.
  adminEmail: unquote(env.ADMIN_EMAIL).toLowerCase(),
  // Surrounding spaces and line breaks (common when pasting into a hosting panel) are dropped.
  adminPassword: unquote(env.ADMIN_PASSWORD),

  // "demo": deposits are credited instantly (no real money moves).
  // "disabled": deposits are refused until a real payment provider is integrated.
  paymentsMode: env.PAYMENTS_MODE || 'demo',

  // Football data feed (sports.bzzoiro.com). Disabled while no token is set.
  feed: {
    token: (env.BZZOIRO_API_TOKEN || '').trim(),
    baseUrl: (env.BZZOIRO_BASE_URL || 'https://sports.bzzoiro.com/api/v2').replace(/\/+$/, ''),
    days: int(env.BZZOIRO_DAYS, 3), // how many days of fixtures to import
    maxOddsCalls: int(env.BZZOIRO_MAX_ODDS_CALLS, 60), // odds requests per fixtures sync
    maxResultCalls: int(env.BZZOIRO_MAX_RESULT_CALLS, 40), // detail requests per results sync
    // Requests per minute the whole account may send (every sport together); 429s mean it is too high.
    maxRequestsPerMinute: int(env.BZZOIRO_MAX_RPM, 60),
    // In-play odds over REST for tennis and the Sports Addon (the provider rarely has any; PropLine
    // covers them). Off by default to save requests; BZZOIRO_REST_LIVE_ODDS=1 turns it on.
    restLiveOdds: env.BZZOIRO_REST_LIVE_ODDS === '1',
    // How often the live lists of tennis / the Sports Addon are asked (the scores of followed
    // tennis matches also come by WebSocket).
    sportsLivePollSeconds: Math.max(5, int(env.SPORTS_LIVE_POLL_SECONDS, 15)),
    // Live WebSocket (paid addon): in-play scores and odds. Set BZZOIRO_LIVE_WS=0 to turn off.
    liveWs: env.BZZOIRO_LIVE_WS !== '0',
    liveWsUrl: env.BZZOIRO_LIVE_WS_URL || 'wss://sports.bzzoiro.com/live/football/',
    liveMaxSockets: int(env.BZZOIRO_LIVE_MAX_SOCKETS, 5), // 10 matches per socket
    // In-play prices of one bookmaker (odds_book frames) on top of the consensus; empty = consensus only.
    liveOddsBookmaker: (env.BZZOIRO_LIVE_BOOKMAKER ?? 'bet365').trim().toLowerCase() || null,
    // An in-play price that has not changed for this long is treated as stale and the market closes.
    liveOddsStaleSeconds: int(env.LIVE_ODDS_STALE_SECONDS, 600),
  },

  // Casino games (aggregator Agent API v4, Transfer mode). Disabled until both are set.
  casino: {
    baseUrl: (env.CASINO_API_URL || '').trim(),
    token: (env.CASINO_API_TOKEN || '').trim(),
    lang: int(env.CASINO_LANG, 6), // 6 = Português
    minTransferCents: int(env.CASINO_MIN_TRANSFER_CENTS, 100),
  },

  // Settlement engine: postponed matches without a new date are voided after this many hours.
  // Tennis (ATP/WTA) with the same token; needs the Sports Addon. TENNIS=0 turns it off.
  tennis: {
    enabled: env.TENNIS !== '0',
    baseUrl: (env.BZZOIRO_TENNIS_URL || 'https://sports.bzzoiro.com/tennis/api/v2').replace(/\/+$/, ''),
    days: int(env.TENNIS_DAYS, 3),
    liveWsUrl: env.BZZOIRO_MULTI_WS_URL || 'wss://sports.bzzoiro.com/ws/live/',
  },
  // Sports Addon: basketball, ice hockey, darts and CS2 (same token). SPORTS_ADDON lists the ones
  // to import; empty string turns them all off.
  sportsAddon: {
    sports: (env.SPORTS_ADDON ?? 'basquetebol,hoquei,dardos,esports').split(',').map((s) => s.trim()).filter(Boolean),
    days: int(env.SPORTS_DAYS, 3),
  },
  // PropLine (api.prop-line.com): second odds source, only for markets the main provider does not
  // price. Off until PROPLINE_API_KEY is set (in the server's environment, never in the code).
  propline: {
    apiKey: unquote(env.PROPLINE_API_KEY),
    baseUrl: (env.PROPLINE_BASE_URL || 'https://api.prop-line.com/v1').replace(/\/+$/, ''),
    sportKeys: (env.PROPLINE_SPORTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    dailyRequests: int(env.PROPLINE_DAILY_REQUESTS, 900), // free plan: 1,000/day
    prematchSeconds: int(env.PROPLINE_PREMATCH_SECONDS, 0), // 0 = from the daily budget
    liveSeconds: int(env.PROPLINE_LIVE_SECONDS, 60), // 0 = no in-play prices from PropLine
    liveMaxAge: int(env.PROPLINE_LIVE_MAX_AGE, 90),
    maxLiveEvents: int(env.PROPLINE_MAX_LIVE_EVENTS, 20),
  },
  // WinHouse (evaluation): base URL and routes only from the environment. Off until
  // WINHOUSE_BASE_URL is set. Admin → Feed → "Testar WinHouse" calls every route from the server.
  winhouse: {
    baseUrl: unquote(env.WINHOUSE_BASE_URL),
    lang: unquote(env.WINHOUSE_LANG) || 'pt',
    routes: {
      live: unquote(env.WINHOUSE_LIVE), prematchMain: unquote(env.WINHOUSE_PREMATCH_MAIN), prematchTop: unquote(env.WINHOUSE_PREMATCH_TOP),
      prematch24h: unquote(env.WINHOUSE_PREMATCH_24H), prematchEvent: unquote(env.WINHOUSE_PREMATCH_EVENT),
    },
    // Collector: on unless WINHOUSE_FEED=0. Intervals, WinHouse's clock zone (minutes from UTC;
    // unset = estimated from the live list) and how long a match must stay out of the live list
    // before it is settled from its last score.
    feed: env.WINHOUSE_FEED !== '0',
    liveMs: Math.max(5_000, int(env.WINHOUSE_LIVE_INTERVAL_MS, 15_000)),
    prematchMs: Math.max(20_000, int(env.WINHOUSE_PREMATCH_INTERVAL_MS, 60_000)),
    tzOffsetMinutes: env.WINHOUSE_TZ_OFFSET_MINUTES !== undefined && env.WINHOUSE_TZ_OFFSET_MINUTES !== '' ? Number(env.WINHOUSE_TZ_OFFSET_MINUTES) : null,
    finishConfirmSeconds: int(env.WINHOUSE_FINISH_CONFIRM_SECONDS, 600),
    // Women's and youth (U19, Sub-20, Junior…) games are left out unless set to 0.
    blockWomen: env.WINHOUSE_BLOCK_WOMEN !== '0',
    blockYouth: env.WINHOUSE_BLOCK_YOUTH !== '0',
  },
  settlement: {
    postponedVoidHours: int(env.POSTPONED_VOID_HOURS, 48),
  },

  // In-play bets on feed matches are refused when the last live price is older than this.
  liveOddsMaxAgeSeconds: int(env.LIVE_ODDS_MAX_AGE_SECONDS, 180),
  // How often the server asks the data provider for scores and in-play odds (seconds), and how
  // often each upcoming game's pre-match odds are re-read (half of it in the last hour).
  livePollSeconds: Math.max(2, int(env.LIVE_POLL_SECONDS, 5)),
  prematchOddsSeconds: Math.max(20, int(env.PREMATCH_ODDS_SECONDS, 60)),

  sessionDays: int(env.SESSION_DAYS, 30),
  minAge: 18,

  limits: {
    minStakeCents: int(env.MIN_STAKE_CENTS, 100), // €1
    maxStakeCents: int(env.MAX_STAKE_CENTS, 100_000), // €1.000
    maxPayoutCents: int(env.MAX_PAYOUT_CENTS, 5_000_000), // €50.000
    maxSelections: 20,
    minDepositCents: int(env.MIN_DEPOSIT_CENTS, 500), // €5
    maxDepositCents: int(env.MAX_DEPOSIT_CENTS, 500_000), // €5.000
    minWithdrawCents: int(env.MIN_WITHDRAW_CENTS, 1_000), // €10
  },
};
