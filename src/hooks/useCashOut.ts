import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

interface CashOutResult {
  success: boolean;
  amount?: number;
  error?: string;
}

const HOUSE_MARGIN = 0.08;

type CashOutSport = 'football' | 'basketball' | 'tennis' | 'other';

const SPORT_CURVES: Record<CashOutSport, { winExponent: number; lossExponent: number; minLossFactor: number }> = {
  football: { winExponent: 1.4, lossExponent: 2.2, minLossFactor: 0.1 },
  basketball: { winExponent: 1.1, lossExponent: 1.8, minLossFactor: 0.2 },
  tennis: { winExponent: 1.6, lossExponent: 2.5, minLossFactor: 0.05 },
  other: { winExponent: 1.3, lossExponent: 2.0, minLossFactor: 0.1 },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const easeIn = (t: number, exponent: number) => Math.pow(t, exponent);
const easeOut = (t: number, exponent: number) => 1 - Math.pow(1 - t, exponent);

export const calculateCashOutValue = (
  stake: number,
  totalOdds: number,
  potentialWin: number,
  currentProgress: number = 0.5,
  isWinning: boolean = true,
  sport: CashOutSport = 'football'
): number => {
  const safeProgress = clamp(currentProgress, 0, 1);
  const curves = SPORT_CURVES[sport] || SPORT_CURVES.other;

  const maxPayout = potentialWin * 0.95;

  let rawValue: number;

  if (isWinning) {
    const winCurve = easeOut(safeProgress, curves.winExponent);
    rawValue = stake + winCurve * (maxPayout - stake);
  } else {
    const lossCurve = easeIn(safeProgress, curves.lossExponent);
    const minValue = stake * curves.minLossFactor;
    rawValue = stake - lossCurve * (stake - minValue);
  }

  const withMargin = rawValue * (1 - HOUSE_MARGIN);

  if (totalOdds > 5 && isWinning) {
    const volatilityBoost = clamp((totalOdds - 5) / 10, 0, 0.5);
    const extra = (maxPayout - stake) * volatilityBoost * safeProgress;
    return clamp(withMargin + extra, 0, maxPayout);
  }

  return clamp(withMargin, 0, maxPayout);
};

export const simulateEventProgress = (createdAt: string): number => {
  const created = new Date(createdAt).getTime();
  const now = Date.now();

  if (Number.isNaN(created) || created <= 0) {
    return 0.5;
  }

  const elapsed = now - created;
  const eventDuration = 7200000;
  const progress = elapsed / eventDuration;

  return Math.min(Math.max(progress, 0), 1);
};

export const simulateWinningStatus = (_betId: string): boolean => {
  return true;
};

interface CashOutContext {
  sport?: CashOutSport;
  liveMinute?: number;
  totalMinutes?: number;
  winProbability?: number;
  isWinningOverride?: boolean;
}

export const useCashOut = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCashOutValue = useCallback(
    (
      stake: number,
      totalOdds: number,
      potentialWin: number,
      createdAt: string,
      betId: string,
      context?: CashOutContext
    ): number => {
      let progress: number;

      if (context?.liveMinute != null && context?.totalMinutes && context.totalMinutes > 0) {
        progress = context.liveMinute / context.totalMinutes;
      } else {
        progress = simulateEventProgress(createdAt);
      }

      let isWinning: boolean;

      if (typeof context?.isWinningOverride === 'boolean') {
        isWinning = context.isWinningOverride;
      } else if (typeof context?.winProbability === 'number') {
        isWinning = context.winProbability >= 0.5;
      } else {
        isWinning = simulateWinningStatus(betId);
      }

      return calculateCashOutValue(
        stake,
        totalOdds,
        potentialWin,
        progress,
        isWinning,
        context?.sport
      );
    },
    []
  );

  const executeCashOut = async (
    betId: string,
    cashOutValue: number
  ): Promise<CashOutResult> => {
    if (!user) {
      return { success: false, error: 'Utilizador não autenticado' };
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch('/wallet/cashout', {
        method: 'POST',
        body: JSON.stringify({
          betId,
          amount: cashOutValue,
        }),
      });

      if (!data || !data.ok) {
        return { success: false, error: 'Erro ao processar cash out' };
      }

      const amount = typeof data.bet?.winnings === 'number' ? data.bet.winnings : cashOutValue;

      return { success: true, amount };

    } catch (err: any) {
      console.error('Erro ao executar cash out:', err);
      const errorMessage = err.message || 'Erro ao processar cash out';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const executePartialCashOut = async (
    betId: string,
    percentage: number,
    fullCashOutValue: number
  ): Promise<CashOutResult> => {
    if (percentage < 0.1 || percentage > 0.9) {
      return { success: false, error: 'Percentagem deve estar entre 10% e 90%' };
    }

    const partialValue = fullCashOutValue * percentage;
    
    return executeCashOut(betId, partialValue);
  };

  return {
    getCashOutValue,
    executeCashOut,
    executePartialCashOut,
    loading,
    error
  };
};
