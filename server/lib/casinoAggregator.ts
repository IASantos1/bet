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

/** Calls POST /v4/agent/info. Throws on any failure — callers decide how to surface that. */
export async function getCasinoAgentInfo(): Promise<CasinoAgentInfo> {
  const key = casinoApiKey();
  if (!key) throw new Error('CASINO_API_KEY not configured');

  const res = await fetch(`${casinoBaseUrl()}/v4/agent/info`, {
    method: 'POST',
    headers: { accept: 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: CasinoAgentInfo } | null;
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(`Casino aggregator error: ${body?.message || res.statusText || res.status}`);
  }
  return body.data as CasinoAgentInfo;
}
