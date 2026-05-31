import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, FrontendBet as Bet } from '../lib/api';

interface BetSelection {
  id: string;
  matchName: string;
  marketName: string;
  selection: string;
  odds: number;
  matchId?: string;
  sportKey?: string;
}

export const useBets = () => {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBets = useCallback(async () => {
    if (!user) {
      setBets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.bets.getAll(user.id);
      setBets(data);
    } catch (err: any) {
      console.error('Erro ao carregar apostas:', err);
      setError(err.message || 'Erro ao carregar apostas');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBets();
  }, [fetchBets]);

  const addSelection = (selection: BetSelection) => {
    setSelections(prev => {
      const exists = prev.find(s => s.id === selection.id);
      if (exists) return prev;
      return [...prev, selection];
    });
  };

  const removeSelection = (id: string) => {
    setSelections(prev => prev.filter(s => s.id !== id));
  };

  const clearSelections = () => {
    setSelections([]);
  };

  const placeBet = async (stakes: Record<string, string>) => {
    if (!user || selections.length === 0) return;

    try {
      const totalStake = Object.values(stakes).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
      const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);
      const potentialWin = totalStake * totalOdds;

      const bet: Omit<Bet, 'id' | 'created_at' | 'updated_at'> = {
        user_id: user.id,
        type: selections.length > 1 ? 'multiple' : 'single',
        stake: totalStake,
        total_odds: totalOdds,
        potential_win: potentialWin,
        status: 'pending',
        selections: selections.map(sel => ({
          ...sel,
          stake: parseFloat(stakes[sel.id] || '0')
        }))
      };

      await createBet(bet);
      clearSelections();
    } catch (err) {
      console.error('Erro ao fazer aposta:', err);
      throw err;
    }
  };

  const createBet = async (bet: Omit<Bet, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      setLoading(true);
      setError(null);
      const newBet = await api.bets.create(bet);
      setBets(prev => [newBet, ...prev]);
      return newBet;
    } catch (err: any) {
      console.error('Erro ao criar aposta:', err);
      setError(err.message || 'Erro ao criar aposta');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateBet = async (id: string, updates: Partial<Bet>) => {
    try {
      setLoading(true);
      setError(null);
      const updated = await api.bets.update(id, updates);
      setBets(prev => prev.map(b => b.id === id ? updated : b));
      return updated;
    } catch (err: any) {
      console.error('Erro ao atualizar aposta:', err);
      setError(err.message || 'Erro ao atualizar aposta');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteBet = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.bets.delete(id);
      setBets(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      console.error('Erro ao eliminar aposta:', err);
      setError(err.message || 'Erro ao eliminar aposta');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    bets,
    selections,
    loading,
    error,
    addSelection,
    removeSelection,
    clearSelections,
    placeBet,
    createBet,
    updateBet,
    deleteBet,
    refetch: fetchBets
  };
};
