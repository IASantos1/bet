import { apiFetch } from '@/react-app/utils/api';

export type Transaction = {
  type: string;
  status: string;
  amount: number;
  created_at: string;
};

export type Bet = {
  stake: number;
  status: string;
  created_at: string;
};

export async function fetchPromotionData() {
  const [transactions, bets] = await Promise.all([
    apiFetch<Transaction[]>('/api/wallet/transactions'),
    apiFetch<Bet[]>('/api/bets'),
  ]);

  return {
    transactions: transactions ?? [],
    bets: bets ?? [],
  };
}
