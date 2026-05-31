import { apiFetch } from '../services/backendClient';

// ✅ CONTROLE GLOBAL DE RATE LIMIT - 1200 req/min (72.000/hora)
let lastApiCallTimestamp = 0;
let rateLimitBackoffMs = 0;
let consecutiveRateLimits = 0;

const MIN_REQUEST_INTERVAL = 50; // ✅ 50ms = 1200 req/min = 72.000 req/hora
const MAX_BACKOFF = 30000; // ✅ Máximo 30 segundos de backoff

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function controlledApiFetch(path: string, options: RequestInit = {}) {
  const attempt = async () => {
    const { throttle, waitMs } = shouldThrottleRequest();
    if (throttle && waitMs > 0) {
      await sleep(waitMs);
    }
    lastApiCallTimestamp = Date.now();
    return apiFetch(path, options);
  };

  try {
    const data = await attempt();
    handleSuccessfulRequest();
    return data;
  } catch (error: any) {
    if (isRateLimitError(error)) {
      handleRateLimitError();
      if (rateLimitBackoffMs > 0) {
        await sleep(rateLimitBackoffMs);
      }
      const data = await attempt();
      handleSuccessfulRequest();
      return data;
    }
    throw error;
  }
}

/**
 * ✅ THROTTLE GLOBAL - Garante intervalo mínimo entre chamadas
 */
function shouldThrottleRequest(): { throttle: boolean; waitMs: number } {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTimestamp;
  const effectiveInterval = MIN_REQUEST_INTERVAL + rateLimitBackoffMs;
  
  if (timeSinceLastCall < effectiveInterval) {
    const waitMs = effectiveInterval - timeSinceLastCall;
    return { throttle: true, waitMs };
  }
  
  return { throttle: false, waitMs: 0 };
}

/**
 * ✅ FALLBACK AUTOMÁTICO - Aumenta backoff quando rate limit
 */
function handleRateLimitError(): void {
  consecutiveRateLimits++;
  
  rateLimitBackoffMs = Math.min(
    5000 * Math.pow(2, consecutiveRateLimits - 1),
    MAX_BACKOFF
  );
  
  console.warn(`🚨 RATE LIMIT #${consecutiveRateLimits} - Backoff: ${rateLimitBackoffMs / 1000}s`);
}

/**
 * ✅ RECUPERAÇÃO GRADUAL - Reduz backoff quando API volta ao normal
 */
function handleSuccessfulRequest(): void {
  if (consecutiveRateLimits > 0) {
    consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1);
    rateLimitBackoffMs = consecutiveRateLimits > 0 
      ? 5000 * Math.pow(2, consecutiveRateLimits - 1)
      : 0;
    
    if (rateLimitBackoffMs === 0) {
      console.log('✅ Rate limit recuperado - Voltando ao normal');
    }
  }
}

/**
 * ✅ DETECÇÃO DE RATE LIMIT
 */
function isRateLimitError(error: any, status?: number, responseText?: string): boolean {
  if (status === 429) return true;
  
  const errorStr = String(error?.message || error || responseText || '').toLowerCase();
  
  return (
    errorStr.includes('rate limit') ||
    errorStr.includes('ratelimit') ||
    errorStr.includes('too many') ||
    errorStr.includes('quota') ||
    errorStr.includes('exceeded')
  );
}

/**
 * ✅ CACHE LOCAL AGRESSIVO NO FRONTEND
 */
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const localCache = new Map<string, CacheEntry>();

function getCacheKey(url: string): string {
  return url;
}

function getFromLocalCache(key: string): any | null {
  const entry = localCache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    localCache.delete(key);
    return null;
  }
  
  return entry.data;
}

function saveToLocalCache(key: string, data: any, ttl: number): void {
  localCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
  
  // Limpar cache expirado (máximo 100 entradas)
  if (localCache.size > 100) {
    const now = Date.now();
    for (const [k, entry] of localCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        localCache.delete(k);
      }
    }
  }
}


export async function saveOddsSnapshot(payload: {
  fixtureId: string;
  bookmaker: string;
  market: string;
  marketType: string;
  line?: string | number | null;
  value?: number;
  odds: number;
  source?: string;
}): Promise<void> {
  try {
    await controlledApiFetch('/sports/odds-history', {
      method: 'POST',
      body: JSON.stringify({
        fixture_id: payload.fixtureId,
        bookmaker: payload.bookmaker,
        market: payload.market,
        market_type: payload.marketType,
        line: payload.line ?? null,
        value: payload.value ?? 0,
        odds: payload.odds,
        source: payload.source ?? 'engine',
      }),
    });
  } catch (error) {
    console.error('Erro ao salvar snapshot de odds:', error);
  }
}

export async function getOddsHistory(fixtureId: string, limit: number = 200): Promise<
  Array<{
    id: string;
    fixture_id: string;
    bookmaker: string;
    market: string;
    market_type: string;
    line: string | null;
    value: number;
    odds: number;
    created_at: string;
    source: string;
  }>
> {
  const params = new URLSearchParams({
    fixture_id: fixtureId,
    limit: String(limit),
  });

  try {
    const data = await controlledApiFetch(`/sports/odds-history?${params.toString()}`, {
      method: 'GET',
    });
    const history = Array.isArray(data?.history) ? data.history : [];
    return history;
  } catch (error) {
    console.error('Erro ao carregar histórico de odds:', error);
    return [];
  }
}

// -----------------------------------------------
// ✅ API OBJECT - Funções para Supabase/Backend
// -----------------------------------------------

type BackendBet = {
  id: string;
  user_id: string;
  bet_type: 'single' | 'multiple' | 'system';
  stake: number;
  potential_win: number;
  total_odds: number;
  status: 'pending' | 'won' | 'lost' | 'cashout' | 'void';
  is_free_bet: boolean;
  winnings?: number | null;
  created_at: string;
  selections?: any[];
  total_stake?: number;
  potential_return?: number;
  cashout_value?: number;
  cashout_at?: string;
  settled_at?: string;
};

export type FrontendBet = {
  id: string;
  user_id: string;
  type: 'single' | 'multiple' | 'system';
  stake: number;
  total_odds: number;
  potential_win: number;
  status: 'pending' | 'won' | 'lost' | 'cashed_out' | 'cancelled';
  selections: any[];
  cashout_value?: number;
  cashout_at?: string;
  settled_at?: string;
  winnings?: number | null;
  created_at: string;
  updated_at: string;
  total_stake?: number;
  potential_return?: number;
};

function mapBetFromBackend(bet: BackendBet): FrontendBet {
  return {
    id: bet.id,
    user_id: bet.user_id,
    type: bet.bet_type,
    stake: bet.stake,
    total_odds: bet.total_odds,
    potential_win: bet.potential_win,
    status:
      bet.status === 'cashout'
        ? 'cashed_out'
        : bet.status === 'void'
        ? 'cancelled'
        : bet.status,
    selections: bet.selections || [],
    cashout_value: bet.cashout_value,
    cashout_at: bet.cashout_at,
    settled_at: bet.settled_at,
    winnings: bet.winnings ?? null,
    created_at: bet.created_at,
    updated_at: bet.settled_at || bet.created_at,
    total_stake: bet.total_stake ?? bet.stake,
    potential_return: bet.potential_return ?? bet.potential_win,
  };
}

export const api = {
  bets: {
    async getAll(userId: string): Promise<FrontendBet[]> {
      console.log('📊 Buscando apostas do utilizador:', userId);
      const data = await controlledApiFetch('/bets', { method: 'GET' });
      const list: BackendBet[] = Array.isArray(data?.bets) ? data.bets : [];
      return list.map(mapBetFromBackend);
    },

    async create(bet: any): Promise<FrontendBet> {
      console.log('✅ Criando aposta:', bet);

      const payload: any = {
        amount: Number(bet.stake),
        betId: bet.id,
        betType:
          bet.type ||
          bet.bet_type ||
          (Array.isArray(bet.selections) && bet.selections.length > 1 ? 'multiple' : 'single'),
        totalOdds: Number(bet.total_odds),
        potentialWin: Number(bet.potential_win),
        isFreeBet: Boolean(bet.is_free_bet),
        selections: Array.isArray(bet.selections) ? bet.selections : [],
      };

      const data = await controlledApiFetch('/wallet/bet', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!data || !data.bet) {
        throw new Error('Erro ao criar aposta no servidor');
      }

      return mapBetFromBackend(data.bet as BackendBet);
    },

    async update(_betId: string, _updates: any): Promise<never> {
      throw new Error('Atualização de apostas ainda não está disponível');
    },

    async delete(_betId: string): Promise<never> {
      throw new Error('Eliminação de apostas ainda não está disponível');
    },
  },

  profiles: {
    async getByUserId(_userId: string) {
      const data = await controlledApiFetch('/profile', { method: 'GET' });
      return data?.profile || null;
    },

    async updateBalance(_profileId: string, amount: number, operation: 'add' | 'subtract') {
      await controlledApiFetch('/profile/balance', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          operation,
        }),
      });
      return true;
    },
  },

  transactions: {
    async create(transaction: any) {
      const payload = {
        amount: Number(transaction.amount),
        type: transaction.type,
        status: transaction.status || 'completed',
        payment_method: transaction.payment_method,
        description: transaction.description,
        external_id: transaction.external_id,
        stripe_session_id: transaction.stripe_session_id,
        completed_at: transaction.completed_at,
      };

      const data = await controlledApiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return data?.transaction;
    },
  },
};

// ✅ ESTATÍSTICAS DE RATE LIMIT E CACHE
export function getRateLimitStats() {
  return {
    consecutiveRateLimits,
    rateLimitBackoffMs,
    backoffSeconds: Math.ceil(rateLimitBackoffMs / 1000),
    cacheSize: localCache.size,
    lastApiCall: lastApiCallTimestamp ? new Date(lastApiCallTimestamp).toISOString() : null,
    requestsPerMinute: 1200,
    requestsPerHour: 72000
  };
}

// ✅ LIMPAR CACHE LOCAL
export function clearLocalCache(): void {
  localCache.clear();
  console.log('🗑️ Cache local limpo');
}

// ✅ OBTER ESTATÍSTICAS DO CACHE
export function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  for (const [, entry] of localCache.entries()) {
    if (now - entry.timestamp <= entry.ttl) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }
  
  return {
    totalEntries: localCache.size,
    validEntries,
    expiredEntries
  };
}
