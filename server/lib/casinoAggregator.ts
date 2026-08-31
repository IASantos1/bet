/**
 * Casino game aggregator client (GoldSlotPalace or compatible v4 agent API). Deliberately thin —
 * only agent/info exists here for now; game-list/launch-URL/callback endpoints get added once
 * the provider's full API documentation is available. Never hardcode the bearer token: it's read
 * from CASINO_API_KEY at call time, exactly like SPORTS_API_KEY in server/index.ts.
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
