// Central configuration. Every value can be overridden with an environment variable
// (see .env.example). Money is always handled in integer cents.
const env = process.env;

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
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',

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
    // Live WebSocket (paid addon): in-play scores and odds. Set BZZOIRO_LIVE_WS=0 to turn off.
    liveWs: env.BZZOIRO_LIVE_WS !== '0',
    liveWsUrl: env.BZZOIRO_LIVE_WS_URL || 'wss://sports.bzzoiro.com/live/football/',
    liveMaxSockets: int(env.BZZOIRO_LIVE_MAX_SOCKETS, 5), // 10 matches per socket
  },

  // Casino games (aggregator Agent API v4, Transfer mode). Disabled until both are set.
  casino: {
    baseUrl: (env.CASINO_API_URL || '').trim(),
    token: (env.CASINO_API_TOKEN || '').trim(),
    lang: int(env.CASINO_LANG, 6), // 6 = Português
    minTransferCents: int(env.CASINO_MIN_TRANSFER_CENTS, 100),
  },

  // In-play bets on feed matches are refused when the last live price is older than this.
  liveOddsMaxAgeSeconds: int(env.LIVE_ODDS_MAX_AGE_SECONDS, 180),

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
