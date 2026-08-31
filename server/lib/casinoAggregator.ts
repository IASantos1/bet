/**
 * Casino game aggregator client (GoldSlotPalace v4 agent API). Types here follow the aggregator's
 * official OpenAPI spec (Agent API Documentation, v4) — response shapes are authoritative, not
 * guessed, even for endpoints this sandbox has only ever seen fail with a 403 from the IP
 * whitelist. Never hardcode the bearer token: it's read from CASINO_API_KEY at call time, exactly
 * like SPORTS_API_KEY in server/index.ts.
 *
 * User/wallet endpoints (user/create, user/info, wallet/deposit, wallet/withdraw,
 * wallet/withdraw-all) are wrapped below but not wired into any route yet — deposit/withdraw only
 * apply in "Transfer" wallet mode per the spec's tag on those endpoints ("Only Transfer Mode"),
 * and this agent account's wallet mode (Transfer vs. Seamless, where the aggregator debits/credits
 * BET62's own wallet directly through /callback) hasn't been confirmed yet. Building the real
 * "Jogar" flow needs that decided first.
 */

const DEFAULT_BASE_URL = 'https://agent.goldslotpalase.com';

function casinoApiKey(): string {
  return String(process.env.CASINO_API_KEY || '').trim();
}

function casinoBaseUrl(): string {
  return String(process.env.CASINO_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

export function isCasinoConfigured(): boolean {
  return casinoApiKey().length > 0;
}

export interface CasinoAgentInfo {
  name: string;
  currency: number;
  balance: number;
  rtp: number;
  whitelist: string[];
  client_ip: string;
}

type AggregatorEnvelope<T> = { code?: number; message?: string; data?: T };

/** POSTs to a v4/agent/* endpoint and unwraps the {code, message, data} envelope. Throws on any
 *  non-zero code or network failure — callers decide how to surface that. */
async function callAgent<T = undefined>(path: string, body?: unknown): Promise<T> {
  const key = casinoApiKey();
  if (!key) throw new Error('CASINO_API_KEY not configured');

  const res = await fetch(`${casinoBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const parsed = (await res.json().catch(() => null)) as AggregatorEnvelope<T> | null;
  if (!res.ok || !parsed || parsed.code !== 0) {
    throw new Error(`Casino aggregator error: ${parsed?.message || res.statusText || res.status}`);
  }
  return parsed.data as T;
}

/** Calls POST /v4/agent/info. */
export async function getCasinoAgentInfo(): Promise<CasinoAgentInfo> {
  return callAgent<CasinoAgentInfo>('/v4/agent/info');
}

/** Calls POST /v4/agent/rtp — sets the agent-wide RTP target. */
export async function setCasinoAgentRtp(rtp: number): Promise<void> {
  await callAgent('/v4/agent/rtp', { rtp });
}

export interface CasinoCallbackTestResult {
  callback_url: string;
  time: string;
}

/** Calls POST /v4/agent/callback-test — asks the aggregator to ping the callback URL configured
 *  on their side for this agent, and reports how long it took. Useful to confirm our server is
 *  reachable from them before relying on real result callbacks. */
export async function testCasinoCallback(): Promise<CasinoCallbackTestResult> {
  return callAgent<CasinoCallbackTestResult>('/v4/agent/callback-test');
}

export interface CasinoProvider {
  provider_id: number;
  provider_name: string;
  locale_name: string;
  /** 1 = active, 2 = inactive, per the real provider list (BGaming came back status 2). */
  status: number;
}

/** Calls POST /v4/game/providers — the real, licensed provider catalog for this agent account
 *  (confirmed live: Pragmatic Play, CQ9, Habanero, Hacksaw, Spribe, EGT, and others). This is the
 *  actual authorized list — never substitute a hand-picked one. `lang` defaults to 1 (matching
 *  the working example); its other accepted values aren't documented yet. */
export async function getCasinoProviders(lang = 1): Promise<CasinoProvider[]> {
  return callAgent<CasinoProvider[]>('/v4/game/providers', { lang });
}

export interface CasinoGame {
  provider_id: number;
  game_code: string;
  game_name: string;
  locale_name: string;
  game_image: string;
  game_image_narrow: string;
  launch_enable: boolean;
  category: string;
  reg_date: string;
}

/** Calls POST /v4/game/games — the real, licensed game catalog for one provider (confirmed live
 *  for provider_id 1 / Pragmatic Play: hundreds of real titles with launch_enable + image URLs).
 *  `lang` defaults to 1, matching the working example. */
export async function getCasinoGames(providerId: number, lang = 1): Promise<CasinoGame[]> {
  return callAgent<CasinoGame[]>('/v4/game/games', { provider_id: providerId, lang });
}

/** Calls POST /v4/game/all — the full, real game catalog across every licensed provider on this
 *  agent account in one call (confirmed live: thousands of titles spanning Pragmatic Play, CQ9,
 *  Habanero, Hacksaw, Spribe, EGT, Amusnet, and the rest of the provider list). Takes no body,
 *  matching the working example. */
export async function getCasinoAllGames(): Promise<CasinoGame[]> {
  return callAgent<CasinoGame[]>('/v4/game/all');
}

export interface CasinoGameUrlParams {
  user_code: number;
  provider_id: number;
  game_symbol: string;
  lang?: number;
  return_url?: string;
  rtp?: number;
  is_finish_jackpot?: boolean;
}

export interface CasinoGameUrl {
  /** Valid for 10 minutes from creation, single-use per the spec. Nullable per the schema. */
  game_url: string | null;
}

/** Calls POST /v4/game/game-url — the real launch URL for a game session, for a specific agent
 *  user_code (created via createCasinoUser() first). Confirmed live: fails with code 2002 /
 *  USER_NOT_FOUND when user_code doesn't exist on the aggregator's side yet, matching the exact
 *  request shape the API expects. `rtp` lets a per-user RTP override the agent's RTP (0 = use the
 *  agent's). */
export async function getCasinoGameUrl(params: CasinoGameUrlParams): Promise<CasinoGameUrl> {
  return callAgent<CasinoGameUrl>('/v4/game/game-url', {
    lang: 1,
    return_url: '',
    rtp: 0,
    is_finish_jackpot: true,
    ...params,
  });
}

export interface CasinoOnlineGame {
  /** Use this to start/cancel a bonus-call via startCasinoCall()/cancelCasinoCall(). */
  gplay_id: number;
  user_code: number;
  user_name: string | null;
  provider_id: number;
  provider_name: string | null;
  game_code: string | null;
  game_name: string | null;
  /** Per the spec: 1/2/3 — distinct from the string `category` on CasinoGame/CasinoTransaction. */
  category: number;
  last_round_bet: number;
  spend: number;
  win: number;
  call_win: number;
  call_id: number;
  call_enable: boolean;
  callend_flag: boolean;
  /** 0 = Init, 1 = Running, 2 = Complete, 3 = Cancel. */
  call_status: number;
  start_time: string;
  last_update: string;
}

/** Calls POST /v4/game/online-games — games connected up to 30 minutes ago. Confirmed live:
 *  returns `data: []` with no body needed on this agent account (no players currently in a
 *  session). */
export async function getCasinoOnlineGames(): Promise<CasinoOnlineGame[]> {
  return callAgent<CasinoOnlineGame[]>('/v4/game/online-games');
}

export interface CasinoCallConfig {
  call_min: number;
}

/** Calls POST /v4/game/call_config — confirmed live: `{ call_min: 10 }`. Purpose of the "call"
 *  feature (call_start/call_cancel below) isn't documented yet; this just reports its config. */
export async function getCasinoCallConfig(): Promise<CasinoCallConfig> {
  return callAgent<CasinoCallConfig>('/v4/game/call_config');
}

export interface CasinoCallStartParams {
  gplay_id: number;
  set_point: number;
  type: number;
  memo?: string;
}

/**
 * "Bonus call" (per the official spec): applies a bonus win to a game currently in progress
 * (using `gplay_id` from getCasinoOnlineGames()). The call amount is deducted from the agent's
 * points and the win is credited to the user, netting out to zero for the agent — it's purely a
 * mechanism to hand a specific user a specific win on a live game, not a support/call-center
 * feature as earlier guessed. call_min from getCasinoCallConfig() is the minimum call amount.
 */
export interface CasinoCallStart {
  /** Use this to cancel via cancelCasinoCall(). */
  call_id: number;
}

/** Calls POST /v4/game/call_start. Confirmed live to fail with code 1010 / PERMISSION_ERROR using
 *  placeholder zero values — this agent account isn't authorized for bonus calls. */
export async function startCasinoCall(params: CasinoCallStartParams): Promise<CasinoCallStart> {
  return callAgent<CasinoCallStart>('/v4/game/call_start', params);
}

/** Calls POST /v4/game/call_cancel — cancels a bonus call in progress. Confirmed live to fail
 *  with code 1005 / RESOURCE_NOT_FOUND for a call_id that doesn't exist. Response is a bare
 *  ResultBase (no data payload). */
export async function cancelCasinoCall(callId: number): Promise<void> {
  await callAgent('/v4/game/call_cancel', { call_id: callId });
}

export interface CasinoFreeroundCreateParams {
  user_code: number;
  provider_id: number;
  game_symbol: string;
  bet: number;
  win: number;
  rounds: number;
  /** Unix timestamp in milliseconds. Confirmed live: must be at least 30 minutes from now, or
   *  the call fails with code 1002 — the aggregator's error message echoes back the minimum
   *  accepted value (a ms timestamp), which is how the unit was confirmed. */
  expirationDate: number;
}

/** Calls POST /v4/game/freeround/create — grants a player free spins on a game. Confirmed live
 *  to reject an expirationDate that isn't at least 30 minutes in the future (code 1002). Response
 *  is a bare ResultBase per the spec (no data payload). */
export async function createCasinoFreeround(params: CasinoFreeroundCreateParams): Promise<void> {
  await callAgent('/v4/game/freeround/create', params);
}

/** Calls POST /v4/game/freeround/cancel — confirmed live to fail with code 2020 /
 *  FREEROUND_NO_EXIST for an fr_id that doesn't exist, matching the exact request shape the API
 *  expects. Response is a bare ResultBase (no data payload). */
export async function cancelCasinoFreeround(frId: string): Promise<void> {
  await callAgent('/v4/game/freeround/cancel', { fr_id: frId });
}

export interface CasinoTransaction {
  trans_id: number;
  user_code: number;
  round_id: string;
  /** Bit flags per the spec: 1 = Bet, 2 = Win, 4 = Deposit, 8 = Withdraw, 16 = BetCancel,
   *  32 = BonusCall (64 upward aren't named in the docs). Confirmed live: 1/2 pairs share a
   *  round_id, with trans_amount 0 on the Win row meaning a loss (no payout). */
  trans_type: number;
  provider_id: number;
  provider_name: string;
  game_code: string;
  game_name: string;
  category: string;
  prebalance: number;
  trans_amount: number;
  balance: number;
  regdate: string;
  time_stamp: number;
}

export interface CasinoTransactionQuery {
  /** "YYYY-MM-DD HH:mm:ss", matching the working example. */
  start_time: string;
  end_time: string;
  offset?: number;
  limit?: number;
}

export interface CasinoTransactionListResult {
  total: number;
  offset: number;
  count: number;
  list: CasinoTransaction[];
}

/** Calls POST /v4/game/transaction — paginated transaction history for a time range. Confirmed
 *  live: returns `{ total: 0, offset: 0, count: 0, list: [] }` for a range with no activity. */
export async function getCasinoTransactions(query: CasinoTransactionQuery): Promise<CasinoTransactionListResult> {
  return callAgent<CasinoTransactionListResult>('/v4/game/transaction', { offset: 0, limit: 10, ...query });
}

/** Calls POST /v4/game/transaction-id — transaction history as a cursor over trans_id, walking
 *  forward from last_id. Confirmed live with real gameplay data: bet (trans_type 1) followed by
 *  settle (trans_type 2) pairs sharing a round_id, real balances and provider/game names. */
export async function getCasinoTransactionsById(lastId: number, limit = 10): Promise<CasinoTransaction[]> {
  return callAgent<CasinoTransaction[]>('/v4/game/transaction-id', { last_id: lastId, limit });
}

export interface CasinoRoundDetailsParams {
  user_code: number;
  round_id: string;
  provider_id: number;
  game_code: string;
}

export interface CasinoRoundDetailsUrl {
  /** A page URL showing the round's detail breakdown — not raw round data. Round info is only
   *  queryable up to 30 days back; older or unsupported rounds return ROUND_NOT_FOUND (2013). */
  url: string | null;
}

/** Calls POST /v4/game/round-details — per the spec, "Get Round Detail URL": returns a link to a
 *  page with the round's bet/win breakdown, not the breakdown itself. Confirmed live to fail with
 *  code 2002 / USER_NOT_FOUND for a user_code that doesn't exist, matching the exact request
 *  shape the API expects. */
export async function getCasinoRoundDetails(params: CasinoRoundDetailsParams): Promise<CasinoRoundDetailsUrl> {
  return callAgent<CasinoRoundDetailsUrl>('/v4/game/round-details', params);
}

export interface CasinoUserStatistic {
  user_code: number;
  user_name: string | null;
  slot_bet: number;
  slot_win: number;
  live_bet: number;
  live_win: number;
  mini_bet: number;
  mini_win: number;
}

export interface CasinoUserStatisticsQuery {
  /** ISO 8601, unlike the "YYYY-MM-DD HH:mm:ss" format used by /v4/game/transaction. Per the
   *  spec, all four fields are required; limit must be 10-2000, offset 0 to int32 max. */
  start_time: string;
  end_time: string;
  offset?: number;
  limit?: number;
}

export interface CasinoUserStatisticsResult {
  total: number;
  offset: number;
  count: number;
  list: CasinoUserStatistic[];
}

/** Calls POST /v4/statistics/user — paginated per-user bet/win totals for a time range, split by
 *  game type (slot/live/mini). Confirmed live: `{ total: 0, offset, count: 0, list: [] }` for a
 *  range with no activity. Note this endpoint lives outside the /v4/game/* namespace unlike every
 *  other endpoint wrapped so far. */
export async function getCasinoUserStatistics(query: CasinoUserStatisticsQuery): Promise<CasinoUserStatisticsResult> {
  return callAgent<CasinoUserStatisticsResult>('/v4/statistics/user', { offset: 0, limit: 2000, ...query });
}

export interface CasinoUserCreate {
  user_code: number;
  is_new_user: boolean;
}

/** Calls POST /v4/user/create — per the spec: creates a user, or returns the existing one if
 *  `name` is already taken (idempotent — safe to call on every login rather than caching the
 *  result). `name` must be 2-50 chars matching `^[_a-zA-Z0-9]+$` (letters, digits, underscore).
 *  <b>The spec warns:</b> a user_code from before a Transfer↔Seamless mode switch on this agent
 *  account can't be reused — always re-create rather than reusing a stored user_code long-term. */
export async function createCasinoUser(name: string): Promise<CasinoUserCreate> {
  return callAgent<CasinoUserCreate>('/v4/user/create', { name });
}

export interface CasinoUserInfo {
  name: string | null;
  balance: number;
}

/** Calls POST /v4/user/info. Per the spec: USER_NOT_FOUND (2002) if the user_code doesn't exist;
 *  PERMISSION_ERROR (1010) if it belongs to a different agent. */
export async function getCasinoUserInfo(userCode: number): Promise<CasinoUserInfo> {
  return callAgent<CasinoUserInfo>('/v4/user/info', { user_code: userCode });
}

export interface CasinoWalletResult {
  /** The user's balance after this operation. */
  balance: number;
  /** The amount processed (deposited/withdrawn). */
  amount: number;
}

/** Calls POST /v4/wallet/deposit — Transfer-mode only per the spec: adds to the user's aggregator
 *  balance, deducted from the agent's points. Not applicable if this agent account runs Seamless
 *  mode (bets/wins settle directly against BET62's own wallet via /callback instead). */
export async function depositCasinoWallet(userCode: number, amount: number): Promise<CasinoWalletResult> {
  return callAgent<CasinoWalletResult>('/v4/wallet/deposit', { user_code: userCode, amount });
}

/** Calls POST /v4/wallet/withdraw — Transfer-mode only per the spec: removes from the user's
 *  aggregator balance, credited back to the agent's points. */
export async function withdrawCasinoWallet(userCode: number, amount: number): Promise<CasinoWalletResult> {
  return callAgent<CasinoWalletResult>('/v4/wallet/withdraw', { user_code: userCode, amount });
}

/** Calls POST /v4/wallet/withdraw-all — Transfer-mode only per the spec: removes the user's
 *  entire aggregator balance, credited back to the agent's points. */
export async function withdrawAllCasinoWallet(userCode: number): Promise<CasinoWalletResult> {
  return callAgent<CasinoWalletResult>('/v4/wallet/withdraw-all', { user_code: userCode });
}
