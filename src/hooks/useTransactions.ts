import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

interface Transaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'win' | 'cashout' | 'bonus';
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  payment_method?: string;
  description?: string;
  external_id?: string;
  stripe_session_id?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export const useTransactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchTransactions = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const data = await apiFetch('/transactions', { method: 'GET' });
      setTransactions(data.transactions || []);
    } catch (err: any) {
      console.error('Erro ao carregar transações:', err);
      setError(err.message || 'Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const createTransaction = async (
    transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>,
  ) => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(transaction),
      });

      const created = data.transaction as Transaction;
      setTransactions((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      console.error('Erro ao criar transação:', err);
      setError(err.message || 'Erro ao criar transação');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      const updated = data.transaction as Transaction;
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err: any) {
      console.error('Erro ao atualizar transação:', err);
      setError(err.message || 'Erro ao atualizar transação');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    transactions,
    loading,
    error,
    createTransaction,
    updateTransaction,
    refetch: fetchTransactions
  };
};
