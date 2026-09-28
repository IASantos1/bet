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
