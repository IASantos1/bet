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
  // The database must live on persistent storage, or every deploy starts from an empty one (balances,
  // bets, users gone). On Railway, attach a Volume: its mount path is used automatically.
  dbPath: env.DB_PATH || (env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(env.RAILWAY_VOLUME_MOUNT_PATH, 'classicbet.db') : 'data/classicbet.db'),
  // Whether that storage survives a deploy: a Railway volume, or a DB_PATH chosen by the operator.
  dbPersistent: !!env.DB_PATH || !!env.RAILWAY_VOLUME_MOUNT_PATH || !env.RAILWAY_ENVIRONMENT,

  // Initial administrator. In production both must be set explicitly.
  adminEmail: unquote(env.ADMIN_EMAIL).toLowerCase(),
  // Surrounding spaces and line breaks (common when pasting into a hosting panel) are dropped.
  adminPassword: unquote(env.ADMIN_PASSWORD),

  // "demo": deposits are credited instantly (no real money moves).
  // "disabled": deposits are refused until a real payment provider is integrated.
  // "stripe": MB WAY, Multibanco and card through Stripe, inside the site (default once STRIPE_SECRET_KEY is set).
  paymentsMode: env.PAYMENTS_MODE || ((env.STRIPE_SECRET_KEY || '').trim() ? 'stripe' : 'demo'),
  stripe: {
    secretKey: unquote(env.STRIPE_SECRET_KEY),
    webhookSecret: unquote(env.STRIPE_WEBHOOK_SECRET),
    // The card form (Stripe Payment Element) runs in the browser with the publishable key.
    publishableKey: unquote(env.STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLISHABLE_KEY),
    apiVersion: (env.STRIPE_API_VERSION || '2026-06-24.dahlia').trim(),
    currency: (env.STRIPE_CURRENCY || 'eur').trim().toLowerCase(),
  },

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

  // Casino through BigBang (seamless wallet). Live key or sandbox key (ek_test_…); when set it
  // replaces the older aggregator below.
  bigbang: {
    apiKey: (env.BIGBANG_API_KEY || '').trim(),
    baseUrl: (env.BIGBANG_API_URL || 'https://api.bigbangcasino.bet/api/v1').trim(),
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
    // The operator's embed key (ifr_…): which games have live video (/ajax/streams).
    tenant: unquote(env.WINHOUSE_TENANT),
    // Server-to-server credential WinHouse gives for the live video, if any (never sent to browsers).
    apiKey: unquote(env.WINHOUSE_API_KEY),
    // Seamless wallet: the wallet API key (Bearer on /tenant/session; never leaves the server) and the
    // player whose book session asks for the live video (an account of the wallet's site, with a deposit).
    walletKey: unquote(env.WINHOUSE_WALLET_KEY || env.WINHOUSE_WALLET_API_KEY),
    streamPlayer: unquote(env.WINHOUSE_STREAM_PLAYER),
    // Live video as HLS for our own player (/api/live). Off until the WinHouse agreement allows it.
    hls: env.WINHOUSE_HLS === '1',
    hlsPath: unquote(env.WINHOUSE_HLS_PATH) || '/tv/p/{stream_id}.m3u8?t={token}',
    tvUrl: unquote(env.WINHOUSE_TV_URL).replace(/\/+$/, ''),
    routes: {
      live: unquote(env.WINHOUSE_LIVE), prematchMain: unquote(env.WINHOUSE_PREMATCH_MAIN), prematchTop: unquote(env.WINHOUSE_PREMATCH_TOP),
      prematch24h: unquote(env.WINHOUSE_PREMATCH_24H), prematchEvent: unquote(env.WINHOUSE_PREMATCH_EVENT),
      // The live book is livegame/{id} (the sportsbook's own api.js). An older setting pointing
      // this at prematchgame (which answers [] once a game starts) is ignored.
      liveEvent: /prematchgame/i.test(unquote(env.WINHOUSE_LIVE_EVENT) || '') ? '' : unquote(env.WINHOUSE_LIVE_EVENT),
      widget: unquote(env.WINHOUSE_WIDGET), widgetData: unquote(env.WINHOUSE_WIDGET_DATA), wsWidget: unquote(env.WINHOUSE_WS_WIDGET), tracker: unquote(env.WINHOUSE_TRACKER_ROUTE),
      streams: unquote(env.WINHOUSE_STREAMS), livestream: unquote(env.WINHOUSE_LIVESTREAM), prematchBySport: unquote(env.WINHOUSE_PREMATCH_BY_SPORT),
    },
    // Collector: on unless WINHOUSE_FEED=0. Intervals, WinHouse's clock zone (minutes from UTC;
    // unset = estimated from the live list) and how long a match must stay out of the live list
    // before it is settled from its last score.
    feed: env.WINHOUSE_FEED !== '0',
    // Match tracker for live football (stats, ball, timeline): on unless WINHOUSE_TRACKER=0.
    tracker: env.WINHOUSE_TRACKER !== '0',
    trackerPollMs: Math.max(1_000, int(env.WINHOUSE_TRACKER_POLL_MS, 2_000)),
    // Ball position and situation over the tracker's WebSocket (ws-widget); 0 = widget-data only.
    trackerWs: env.WINHOUSE_TRACKER_WS !== '0',
    // Real-time odds of the games in play over the sportsbook's socket.io (`new-coefs`); 0 = page reads only.
    oddsPush: env.WINHOUSE_ODDS_PUSH !== '0',
    oddsPushPath: unquote(env.WINHOUSE_ODDS_PUSH_PATH) || '/sio',
    liveMs: Math.max(5_000, int(env.WINHOUSE_LIVE_INTERVAL_MS, 15_000)),
    prematchMs: Math.max(20_000, int(env.WINHOUSE_PREMATCH_INTERVAL_MS, 60_000)),
    // Future games: every sport's full fixture list (prematchgamesbysport), games up to this many
    // days ahead, read every WINHOUSE_FUTURE_MINUTES. Changed in the admin; 0 = only the short lists.
    futureDays: Math.min(90, Math.max(0, int(env.WINHOUSE_FUTURE_DAYS, 30))),
    futureMinutes: Math.max(5, int(env.WINHOUSE_FUTURE_MINUTES, 10)),
    tzOffsetMinutes: env.WINHOUSE_TZ_OFFSET_MINUTES !== undefined && env.WINHOUSE_TZ_OFFSET_MINUTES !== '' ? Number(env.WINHOUSE_TZ_OFFSET_MINUTES) : null,
    finishConfirmSeconds: int(env.WINHOUSE_FINISH_CONFIRM_SECONDS, 600),
    // Women's and youth (U19, Sub-20, Junior…) games are left out unless set to 0.
    blockWomen: env.WINHOUSE_BLOCK_WOMEN !== '0',
    blockYouth: env.WINHOUSE_BLOCK_YOUTH !== '0',
    // Virtual football (FIFA 4x4/5x5, subsoccer, cyber…), small table tennis circuits (ATT, Setka
    // Cup…) and UTR tennis are left out unless set to 0; WINHOUSE_BLOCK_LEAGUES adds more terms.
    blockMinor: env.WINHOUSE_BLOCK_MINOR !== '0',
    blockLeagues: env.WINHOUSE_BLOCK_LEAGUES || '',
    // Football competitions shown (names separated by ; or new lines); empty = the built-in list, * = all.
    footballLeagues: env.WINHOUSE_FOOTBALL_LEAGUES || '',
    // The same for basketball and tennis (the sidebar's leagues); * = all.
    basketballLeagues: env.WINHOUSE_BASKETBALL_LEAGUES || '',
    tennisLeagues: env.WINHOUSE_TENNIS_LEAGUES || '',
    // Every market of a game is read from its own page: games starting in the next
    // WINHOUSE_DETAIL_HOURS, up to WINHOUSE_DETAIL_PER_CYCLE pages a minute, each again after
    // WINHOUSE_DETAIL_REFRESH_MINUTES. WINHOUSE_DETAIL_PER_CYCLE=0 turns it off.
    detailHours: Math.max(1, int(env.WINHOUSE_DETAIL_HOURS, 12)),
    detailPerCycle: Math.max(0, int(env.WINHOUSE_DETAIL_PER_CYCLE, 20)),
    detailRefreshMinutes: Math.max(5, int(env.WINHOUSE_DETAIL_REFRESH_MINUTES, 30)),
    // In play the same from each live game's page: up to WINHOUSE_LIVE_DETAIL_PER_CYCLE pages every
    // 10 s, each game every WINHOUSE_LIVE_DETAIL_SECONDS. WINHOUSE_LIVE_DETAIL_PER_CYCLE=0 turns it off.
    liveDetailPerCycle: Math.max(0, int(env.WINHOUSE_LIVE_DETAIL_PER_CYCLE, 10)),
    liveDetailSeconds: Math.max(15, int(env.WINHOUSE_LIVE_DETAIL_SECONDS, 30)),
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

  // Bet builder (several picks on one match): the legs' odds multiplied by this, for their correlation.
  builderFactor: Math.min(1, Math.max(0.5, Number(env.BUILDER_FACTOR) || 0.9)),
  // Cash out: the bet's fair value now (its stake × odds taken / current odds of the legs still open)
  // times this factor (the house margin). CASHOUT=0 turns cash out off.
  // Defaults; the admin changes them in Admin → Apostas (saved in the settings table).
  cashout: { enabled: env.CASHOUT !== '0', factor: Math.min(1, Math.max(0.5, Number(env.CASHOUT_FACTOR) || 0.95)) },
  // Contacts shown in the profile's support section (empty: not shown).
  supportEmail: String(env.SUPPORT_EMAIL || '').trim(),
  supportPhone: String(env.SUPPORT_PHONE || '').trim(),

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
