import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPromotionData } from '../services/promotions.service';

type Progress = {
  deposit: number;
  staked: number;
  wins: number;
  depositDate: string | null;
};

export function usePromotionProgress(userId?: string) {
  const query = useQuery({
    queryKey: ['promotion-progress', userId],
    queryFn: fetchPromotionData,
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 min
    gcTime: 1000 * 60 * 5, // 5 min (renamed from cacheTime in v5)
    retry: 1,
  });

  const progress: Progress = useMemo(() => {
    const { transactions = [], bets = [] } = query.data || {};

    if (!transactions.length) {
      return { deposit: 0, staked: 0, wins: 0, depositDate: null };
    }

    const deposits = transactions.filter(
      (t) => t.type === 'DEPOSIT' && String(t.status || '').toUpperCase() === 'COMPLETED'
    );

    if (!deposits.length) {
      return { deposit: 0, staked: 0, wins: 0, depositDate: null };
    }

    const first = deposits.reduce((a, b) =>
      a.created_at <= b.created_at ? a : b
    );

    const depTs = Date.parse(first.created_at);

    let staked = 0;
    let wins = 0;

    for (const b of bets) {
      if (Date.parse(b.created_at) >= depTs) {
        staked += b.stake;
        if (b.status === 'won') wins++;
      }
    }

    return {
      deposit: first.amount,
      staked,
      wins,
      depositDate: first.created_at,
    };
  }, [query.data]);

  return {
    progress,
    loading: query.isLoading,
    error: query.isError,
    refetch: query.refetch,
  };
}
