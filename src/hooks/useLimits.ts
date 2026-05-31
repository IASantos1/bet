import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from './useProfile';

interface Limits {
  maxDailyDeposit?: number;
  maxWeeklyDeposit?: number;
  maxMonthlyDeposit?: number;
  maxDailyBet?: number;
  maxWeeklyBet?: number;
  maxMonthlyBet?: number;
  maxDailyWithdrawal?: number;
  maxPendingWithdrawals?: number;
}

interface Usage {
  depositDaily: number;
  depositWeekly: number;
  depositMonthly: number;
  betDaily: number;
  betWeekly: number;
  betMonthly: number;
  withdrawalDaily: number;
  pendingWithdrawals: number;
}

interface RemainingLimits {
  deposit: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  bet: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  withdrawal: {
    daily: number;
    pendingSlots: number;
  };
}

export const useLimits = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [limits, setLimits] = useState<Limits>({});
  const [usage, setUsage] = useState<Usage>({
    depositDaily: 0,
    depositWeekly: 0,
    depositMonthly: 0,
    betDaily: 0,
    betWeekly: 0,
    betMonthly: 0,
    withdrawalDaily: 0,
    pendingWithdrawals: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateUsage = useCallback(async () => {
    if (!user) return;

    try {
      // ✅ NOTA: Aqui deveria buscar transações do backend local
      // Por enquanto, mantém o uso zerado até ligar ao backend
      const transactions: any[] = [];
      
      const now = new Date();

      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const newUsage: Usage = {
        depositDaily: 0,
        depositWeekly: 0,
        depositMonthly: 0,
        betDaily: 0,
        betWeekly: 0,
        betMonthly: 0,
        withdrawalDaily: 0,
        pendingWithdrawals: 0,
      };

      transactions.forEach(t => {
        const createdAt = new Date(t.created_at);

        if (t.type === 'deposit' && t.status === 'completed') {
          if (createdAt >= startOfDay) newUsage.depositDaily += t.amount;
          if (createdAt >= startOfWeek) newUsage.depositWeekly += t.amount;
          if (createdAt >= startOfMonth) newUsage.depositMonthly += t.amount;
        }

        if (t.type === 'bet' && t.status === 'completed') {
          if (createdAt >= startOfDay) newUsage.betDaily += t.amount;
          if (createdAt >= startOfWeek) newUsage.betWeekly += t.amount;
          if (createdAt >= startOfMonth) newUsage.betMonthly += t.amount;
        }
      });

      setUsage(newUsage);
    } catch (err: any) {
      console.error('Erro ao calcular uso:', err);
    }
  }, [user]);

  const fetchLimits = useCallback(async () => {
    if (!user) {
      setLimits({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (profile && (profile as any).limits) {
        setLimits((profile as any).limits);
      }

      await calculateUsage();
    } catch (err: any) {
      console.error('Erro ao carregar limites:', err);
      setError(err.message || 'Erro ao carregar limites');
    } finally {
      setLoading(false);
    }
  }, [user, profile, calculateUsage]);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  const updateLimits = async (newLimits: Limits) => {
    if (!user || !profile) return;

    try {
      setLoading(true);
      setError(null);

      // ✅ NOTA: Aqui deveria atualizar no Supabase
      // Por enquanto, apenas atualiza localmente
      setLimits(newLimits);
    } catch (err: any) {
      console.error('Erro ao atualizar limites:', err);
      setError(err.message || 'Erro ao atualizar limites');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const checkLimit = (type: keyof Limits, amount: number): boolean => {
    const limit = limits[type];
    if (!limit) return true;

    if (type === 'maxDailyDeposit') {
      return usage.depositDaily + amount <= limit;
    }
    if (type === 'maxWeeklyDeposit') {
      return usage.depositWeekly + amount <= limit;
    }
    if (type === 'maxMonthlyDeposit') {
      return usage.depositMonthly + amount <= limit;
    }
    if (type === 'maxDailyBet') {
      return usage.betDaily + amount <= limit;
    }
    if (type === 'maxWeeklyBet') {
      return usage.betWeekly + amount <= limit;
    }
    if (type === 'maxMonthlyBet') {
      return usage.betMonthly + amount <= limit;
    }
    if (type === 'maxDailyWithdrawal') {
      return usage.withdrawalDaily + amount <= limit;
    }

    return true;
  };

  const getRemainingLimits = (): RemainingLimits => {
    return {
      deposit: {
        daily: limits.maxDailyDeposit ? limits.maxDailyDeposit - usage.depositDaily : Infinity,
        weekly: limits.maxWeeklyDeposit ? limits.maxWeeklyDeposit - usage.depositWeekly : Infinity,
        monthly: limits.maxMonthlyDeposit ? limits.maxMonthlyDeposit - usage.depositMonthly : Infinity,
      },
      bet: {
        daily: limits.maxDailyBet ? limits.maxDailyBet - usage.betDaily : Infinity,
        weekly: limits.maxWeeklyBet ? limits.maxWeeklyBet - usage.betWeekly : Infinity,
        monthly: limits.maxMonthlyBet ? limits.maxMonthlyBet - usage.betMonthly : Infinity,
      },
      withdrawal: {
        daily: limits.maxDailyWithdrawal ? limits.maxDailyWithdrawal - usage.withdrawalDaily : Infinity,
        pendingSlots: limits.maxPendingWithdrawals
          ? Math.max(0, limits.maxPendingWithdrawals - usage.pendingWithdrawals)
          : Infinity,
      },
    };
  };

  const validateBet = (amount: number): { valid: boolean; error?: string } => {
    if (!amount || amount <= 0) {
      return { valid: false, error: 'Valor inválido' };
    }

    // Verificar limite diário
    if (limits.maxDailyBet && !checkLimit('maxDailyBet', amount)) {
      const remaining = limits.maxDailyBet - usage.betDaily;
      return { 
        valid: false, 
        error: `Limite diário excedido. Disponível: €${remaining.toFixed(2)}` 
      };
    }

    // Verificar limite semanal
    if (limits.maxWeeklyBet && !checkLimit('maxWeeklyBet', amount)) {
      const remaining = limits.maxWeeklyBet - usage.betWeekly;
      return { 
        valid: false, 
        error: `Limite semanal excedido. Disponível: €${remaining.toFixed(2)}` 
      };
    }

    // Verificar limite mensal
    if (limits.maxMonthlyBet && !checkLimit('maxMonthlyBet', amount)) {
      const remaining = limits.maxMonthlyBet - usage.betMonthly;
      return { 
        valid: false, 
        error: `Limite mensal excedido. Disponível: €${remaining.toFixed(2)}` 
      };
    }

    return { valid: true };
  };

  return {
    limits,
    usage,
    loading,
    error,
    updateLimits,
    checkLimit,
    getRemainingLimits,
    validateBet,
    refetch: fetchLimits,
  };
};
