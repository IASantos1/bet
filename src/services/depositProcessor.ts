
import { apiFetch } from '../services/backendClient';

interface DepositResult {
  success: boolean;
  message: string;
  newBalance?: number;
  error?: string;
}

export async function processDeposit(
  amount: number,
  paymentMethod: string,
  externalId?: string,
): Promise<DepositResult> {
  try {
    const result = await apiFetch('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_method: paymentMethod,
        description: `Depósito via ${paymentMethod.toUpperCase()}`,
        external_id: externalId,
      }),
    });

    return {
      success: true,
      message: `Depósito de €${amount.toFixed(2)} confirmado!`,
      newBalance: result.balance ?? 0,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Erro ao processar depósito',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function checkDepositStatus(
  orderId: string,
): Promise<{ status: 'pending' | 'completed' | 'failed'; amount?: number }> {
  try {
    const data = await apiFetch('/transactions', { method: 'GET' });
    const transactions = (data.transactions || []) as any[];
    const tx = transactions.find((t) => t.external_id === orderId && t.type === 'deposit');
    if (!tx) return { status: 'pending' };
    return { status: tx.status, amount: tx.amount };
  } catch {
    return { status: 'pending' };
  }
}
