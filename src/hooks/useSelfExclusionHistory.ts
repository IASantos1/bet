import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

interface SelfExclusionRecord {
  id: string;
  user_id: string;
  type: 'temporary' | 'permanent';
  duration_days?: number;
  start_date: string;
  end_date?: string;
  reason?: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export const useSelfExclusionHistory = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<SelfExclusionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/self-exclusion', { method: 'GET' });
      setHistory(data.records || []);
    } catch (err: any) {
      console.error('Erro ao carregar histórico de auto-exclusão:', err);
      setError(err.message || 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const addRecord = async (record: Omit<SelfExclusionRecord, 'id' | 'created_at'>) => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/self-exclusion', {
        method: 'POST',
        body: JSON.stringify(record),
      });
      setHistory(prev => [data.record, ...prev]);
      console.log('✅ Registo de auto-exclusão adicionado');
      
      return data.record;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar registo:', err);
      setError(err.message || 'Erro ao adicionar registo');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getActiveExclusion = (): SelfExclusionRecord | null => {
    const now = new Date();
    return history.find(record => {
      if (record.status !== 'active') return false;
      if (record.type === 'permanent') return true;
      if (record.end_date && new Date(record.end_date) > now) return true;
      return false;
    }) || null;
  };

  return {
    history,
    loading,
    error,
    addRecord,
    getActiveExclusion,
    refetch: fetchHistory
  };
};
