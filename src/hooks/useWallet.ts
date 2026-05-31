import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  payment_method?: string;
  description?: string;
  created_at: string;
  completed_at?: string;
}

export interface WalletData {
  balance: number;
  bonusBalance: number;
  freeBetBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalBets: number;
  totalWins: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  recentTransactions: WalletTransaction[];
}

export const useWallet = () => {
  const { user, signOut } = useAuth();

  const [wallet, setWallet] = useState<WalletData>({
    balance: 0,
    bonusBalance: 0,
    freeBetBalance: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalBets: 0,
    totalWins: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    recentTransactions: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 
   * Fetch wallet data (profile + transactions). 
   * Errors are caught and stored in state for UI handling.
   */
  const fetchWalletData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const data = await apiFetch('/wallet', { method: 'GET' });
      const transactions: WalletTransaction[] = data.recentTransactions || [];

      setWallet({
        balance: data.balance ?? 0,
        bonusBalance: data.bonusBalance ?? 0,
        freeBetBalance: data.freeBetBalance ?? 0,
        totalDeposited: data.totalDeposited ?? 0,
        totalWithdrawn: data.totalWithdrawn ?? 0,
        totalBets: data.totalBets ?? 0,
        totalWins: data.totalWins ?? 0,
        pendingDeposits: data.pendingDeposits ?? 0,
        pendingWithdrawals: data.pendingWithdrawals ?? 0,
        recentTransactions: transactions,
      });

      console.log('✅ Carteira carregada:', {
        saldo: data.balance ?? 0,
        transacoes: transactions.length,
      });

    } catch (err: any) {
      const msg = String(err?.message || '');
      const isAuthError =
        msg.toLowerCase().includes('não autenticado') ||
        msg.toLowerCase().includes('sessão') ||
        msg.toLowerCase().includes('auth');

      if (isAuthError) {
        try {
          await signOut();
        } catch {
          // ignore
        }
        setError('Sessão expirada. Faça login novamente.');
      } else if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
        setError('Sem conexão com o servidor. Verifique sua internet.');
      } else {
        setError(msg || 'Erro ao carregar dados da carteira');
      }

      setWallet({
        balance: 0,
        bonusBalance: 0,
        freeBetBalance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalBets: 0,
        totalWins: 0,
        pendingDeposits: 0,
        pendingWithdrawals: 0,
        recentTransactions: [],
      });
    } finally {
      setLoading(false);
    }
  }, [user, signOut]);

  // ✅ NOVA FUNÇÃO: Deduzir valor da aposta do saldo
  const placeBet = useCallback(async (amount: number, betId?: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const newBalance = wallet.balance - amount;
      
      if (newBalance < 0) {
        setError('Saldo insuficiente');
        return false;
      }

      await apiFetch('/wallet/bet', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          betId,
        }),
      });

      // Atualizar estado local imediatamente
      setWallet(prev => ({
        ...prev,
        balance: newBalance,
        totalBets: prev.totalBets + amount
      }));

      console.log(`✅ Aposta deduzida: €${amount} | Novo saldo: €${newBalance.toFixed(2)}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao processar aposta:', err);
      setError('Erro ao processar aposta');
      return false;
    }
  }, [user, wallet.balance]);

  // ✅ NOVA FUNÇÃO: Adicionar ganhos ao saldo
  const addWinnings = useCallback(async (amount: number, betId?: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const newBalance = wallet.balance + amount;

      await apiFetch('/wallet/win', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          betId,
        }),
      });

      // Atualizar estado local imediatamente
      setWallet(prev => ({
        ...prev,
        balance: newBalance,
        totalWins: prev.totalWins + amount
      }));

      console.log(`🎉 Ganhos adicionados: €${amount} | Novo saldo: €${newBalance.toFixed(2)}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar ganhos:', err);
      setError('Erro ao adicionar ganhos');
      return false;
    }
  }, [user, wallet.balance]);

  // ✅ NOVA FUNÇÃO: Processar levantamento (deduzir do saldo)
  const processWithdrawal = useCallback(async (amount: number): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const newBalance = wallet.balance - amount;
      
      if (newBalance < 0) {
        setError('Saldo insuficiente para levantamento');
        return false;
      }

      await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount,
        }),
      });

      setWallet(prev => ({
        ...prev,
        balance: newBalance,
        totalWithdrawn: prev.totalWithdrawn + amount
      }));

      console.log(`💸 Levantamento processado: €${amount} | Novo saldo: €${newBalance.toFixed(2)}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao processar levantamento:', err);
      setError('Erro ao processar levantamento');
      return false;
    }
  }, [user, wallet.balance]);

  // ✅ NOVA FUNÇÃO: Adicionar depósito ao saldo
  const addDeposit = useCallback(async (amount: number): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const newBalance = wallet.balance + amount;

      await apiFetch('/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount,
        }),
      });

      setWallet(prev => ({
        ...prev,
        balance: newBalance,
        totalDeposited: prev.totalDeposited + amount
      }));

      console.log(`💰 Depósito adicionado: €${amount} | Novo saldo: €${newBalance.toFixed(2)}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar depósito:', err);
      setError('Erro ao adicionar depósito');
      return false;
    }
  }, [user, wallet.balance]);

  // Initial fetch
  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Poll every 10 seconds to keep balances up‑to‑date (captures webhook updates)
  useEffect(() => {
    if (!user) return;

    pollingRef.current = setInterval(() => {
      fetchWalletData();
    }, 10_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [user, fetchWalletData]);

  return {
    wallet,
    loading,
    error,
    refetch: fetchWalletData,
    // ✅ Novas funções exportadas
    placeBet,
    addWinnings,
    processWithdrawal,
    addDeposit,
  };
};
