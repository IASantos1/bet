/**
 * 🚫 Serviço para Dados Críticos (SEM CACHE)
 * 
 * Dados que NUNCA devem ser cacheados:
 * - Saldo do utilizador
 * - Confirmação de apostas
 * - Histórico financeiro
 * - Transações
 * - Dados de perfil sensíveis
 */

import { CacheStrategy } from './cacheManager';

/**
 * ⚠️ Este serviço garante que dados críticos NUNCA sejam cacheados
 * Todas as operações retornam null para forçar busca em tempo real
 */
class CriticalDataService {
  private readonly strategy = CacheStrategy.NO_CACHE;

  /**
   * 🚫 Saldo - NUNCA em cache
   */
  async getBalance(_userId: string): Promise<null> {
    // Sempre retorna null para forçar busca no servidor
    return null;
  }

  /**
   * 🚫 Apostas - NUNCA em cache
   */
  async getBets(_userId: string): Promise<null> {
    return null;
  }

  /**
   * 🚫 Transações - NUNCA em cache
   */
  async getTransactions(_userId: string): Promise<null> {
    return null;
  }

  /**
   * 🚫 Confirmação de aposta - NUNCA em cache
   */
  async getBetConfirmation(_betId: string): Promise<null> {
    return null;
  }

  /**
   * 🚫 Histórico financeiro - NUNCA em cache
   */
  async getFinancialHistory(_userId: string): Promise<null> {
    return null;
  }

  /**
   * 📊 Obter métricas (sempre 0 para dados críticos)
   */
  getMetrics() {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * ⚠️ Validar se um tipo de dado é crítico
   */
  isCriticalData(dataType: string): boolean {
    const criticalTypes = [
      'balance',
      'wallet',
      'bet_confirmation',
      'transaction',
      'financial_history',
      'payment',
      'withdrawal',
      'deposit',
      'user_sensitive_data'
    ];

    return criticalTypes.some(type => 
      dataType.toLowerCase().includes(type)
    );
  }
}

export const criticalDataService = new CriticalDataService();
