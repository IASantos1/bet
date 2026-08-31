/**
 * Casino game aggregator client (GoldSlotPalace or compatible v4 agent API). Built up endpoint by
 * endpoint against the real API as each one gets confirmed live; user/wallet endpoints aren't
 * wrapped here yet. Never hardcode the bearer token: it's read from CASINO_API_KEY at call time,
 * exactly like SPORTS_API_KEY in server/index.ts.
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

/** Calls POST /v4/game/game-url — the real launch URL for a game session, for a specific agent
 *  user_code. Confirmed live: fails with code 2002 / USER_NOT_FOUND when user_code doesn't exist
 *  on the aggregator's side yet — the aggregator's own user/create endpoint has to be called for
 *  that user_code first (not yet wrapped here: no client function exists for it in this file).
 *  The success response shape isn't confirmed yet (no successful call observed) — treated as
 *  unknown here rather than guessed; callers should log the raw envelope until a real success
 *  payload is seen and this can be typed precisely. */
export async function getCasinoGameUrl(params: CasinoGameUrlParams): Promise<unknown> {
  return callAgent<unknown>('/v4/game/game-url', {
    lang: 1,
    return_url: '',
    rtp: 0,
    is_finish_jackpot: true,
    ...params,
  });
}

/** Calls POST /v4/game/online-games — confirmed live, returns `data: []` with no body needed on
 *  this agent account (no players currently in a session). Element shape isn't confirmed yet
 *  (empty result observed), so it's left as `unknown[]` rather than guessed. */
export async function getCasinoOnlineGames(): Promise<unknown[]> {
  return callAgent<unknown[]>('/v4/game/online-games');
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

/** Calls POST /v4/game/call_start — confirmed live to fail with code 1010 / PERMISSION_ERROR
 *  using placeholder zero values, so this agent account isn't authorized for whatever the "call"
 *  feature does. Both the feature's purpose and its success response shape are unconfirmed —
 *  treat this as exploratory until real docs or a successful call are seen. */
export async function startCasinoCall(params: CasinoCallStartParams): Promise<unknown> {
  return callAgent<unknown>('/v4/game/call_start', params);
}

/** Calls POST /v4/game/call_cancel — confirmed live to fail with code 1005 / RESOURCE_NOT_FOUND
 *  for a call_id that doesn't exist, matching the exact request shape the API expects. Success
 *  response shape is unconfirmed. */
export async function cancelCasinoCall(callId: number): Promise<unknown> {
  return callAgent<unknown>('/v4/game/call_cancel', { call_id: callId });
}
