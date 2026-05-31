import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from './useProfile';
import { apiFetch } from '../services/backendClient';

interface WithdrawalResult {
  success: boolean;
  message?: string;
  error?: string;
  transactionId?: string;
}

export const useWithdrawals = () => {
  const { user } = useAuth();
  const { profile, refetch: refetchProfile, updateProfile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createWithdrawal = async (
    amount: number,
    method: string,
    accountDetails: Record<string, any>
  ): Promise<WithdrawalResult> => {
    if (!user) {
      return { success: false, error: 'Utilizador não autenticado' };
    }

    setLoading(true);
    setError(null);

    try {
      const currentBalance = profile?.balance || 0;

      if (currentBalance < amount) {
        return { success: false, error: 'Saldo insuficiente' };
      }

      const data = await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          payment_method: method,
          description: `Levantamento via ${method === 'bank_transfer' ? 'Transferência Bancária' : method}`,
          account_details: accountDetails,
        }),
      });
      const transactionData = data.transaction;

      // Guardar IBAN se for transferência bancária e não estiver guardado
      if (method === 'bank_transfer' && accountDetails.iban) {
        const cleanIban = accountDetails.iban.replace(/\s/g, '');
        if (!profile?.saved_iban || profile.saved_iban !== cleanIban) {
          await updateProfile({
            saved_iban: cleanIban,
            saved_account_holder: accountDetails.accountHolder,
          });
        }
      }

      // Atualizar perfil local
      await refetchProfile();

      return {
        success: true,
        message: `Levantamento de €${amount.toFixed(2)} solicitado com sucesso! Será processado em breve.`,
        transactionId: transactionData?.id,
      };
    } catch (err: any) {
      console.error('Erro ao solicitar levantamento:', err);
      const errorMessage = err.message || 'Erro ao processar levantamento';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const getWithdrawals = async (_userId: string) => {
    try {
      const data = await apiFetch('/transactions', { method: 'GET' });
      const list = (data.transactions || []) as any[];
      return list.filter((t) => t.type === 'withdrawal');
    } catch (err: any) {
      console.error('Erro ao carregar levantamentos:', err);
      return [];
    }
  };

  const cancelWithdrawal = async (transactionId: string): Promise<WithdrawalResult> => {
    if (!user) {
      return { success: false, error: 'Utilizador não autenticado' };
    }

    setLoading(true);
    setError(null);

    try {
      await apiFetch('/wallet/withdraw/cancel', {
        method: 'POST',
        body: JSON.stringify({ transactionId }),
      });

      await refetchProfile();

      return {
        success: true,
        message: 'Levantamento cancelado com sucesso',
      };
    } catch (err: any) {
      console.error('Erro ao cancelar levantamento:', err);
      const errorMessage = err.message || 'Erro ao cancelar levantamento';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return {
    createWithdrawal,
    cancelWithdrawal,
    getWithdrawals,
    loading,
    error,
  };
};
