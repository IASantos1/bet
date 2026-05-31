import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/backendClient';

interface Profile {
  id: string;
  user_id?: string;
  email?: string;
  full_name: string;
  name?: string;
  phone: string;
  balance: number;
  free_bet_balance?: number;
   bonus_balance?: number;
   freebet_balance?: number;
   daily_limit?: number;
   weekly_limit?: number;
   monthly_limit?: number;
   session_limit?: number;
  is_admin?: boolean;
  status?: string;
  role?: string;
  kyc_verified?: boolean;
  email_verified?: boolean;
  birth_date?: string;
  created_at: string;
  updated_at?: string;
  self_exclusion_until?: string;
  cooling_off_until?: string;
  limits?: Record<string, number>;
  saved_iban?: string;
  saved_account_holder?: string;
}

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/profile', { method: 'GET' });
      const p = data.profile;

      if (p) {
        setProfile({
          id: p.id,
          user_id: p.user_id,
          email: p.email,
          full_name: p.full_name || p.name || '',
          name: p.name,
          balance: p.balance || 0,
          free_bet_balance: p.free_bet_balance || 0,
          phone: p.phone || '',
          is_admin: p.is_admin || false,
          status: p.status,
          kyc_verified: p.kyc_verified || false,
          email_verified: p.email_verified || false,
          birth_date: p.birth_date,
          created_at: p.created_at || new Date().toISOString(),
          updated_at: p.updated_at,
          self_exclusion_until: p.self_exclusion_until,
          cooling_off_until: p.cooling_off_until,
          limits: p.limits,
          saved_iban: p.saved_iban,
          saved_account_holder: p.saved_account_holder,
        } as Profile);
      } else {
        setProfile(null);
      }
    } catch (err: any) {
      const message = (err?.message || '').toString().toLowerCase();
      const status = typeof err?.status === 'number' ? err.status : undefined;
      const isUnauthenticated =
        status === 401 ||
        message.includes('não autenticado') ||
        message.includes('unauth');

      if (isUnauthenticated) {
        setProfile(null);
        setError(null);
      } else {
        console.error('Erro ao carregar perfil:', err);
        setError(err.message || 'Erro ao carregar perfil');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (updates: Partial<Profile> | Record<string, any>) => {
    if (!profile) return;

    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...updates,
        }),
      });

      if (data.profile) {
        const p = data.profile;
        const updatedProfile = {
          id: p.id,
          user_id: p.user_id,
          email: p.email,
          full_name: p.full_name || p.name || '',
          name: p.name,
          balance: p.balance || 0,
          free_bet_balance: p.free_bet_balance || 0,
          phone: p.phone || '',
          is_admin: p.is_admin || false,
          status: p.status,
          kyc_verified: p.kyc_verified || false,
          email_verified: p.email_verified || false,
          birth_date: p.birth_date,
          created_at: p.created_at || new Date().toISOString(),
          updated_at: p.updated_at,
          self_exclusion_until: p.self_exclusion_until,
          cooling_off_until: p.cooling_off_until,
          limits: p.limits,
          saved_iban: p.saved_iban,
          saved_account_holder: p.saved_account_holder,
        } as Profile;
        setProfile(updatedProfile);
        return updatedProfile;
      }
    } catch (err: any) {
      console.error('Erro ao atualizar perfil:', err);
      setError(err.message || 'Erro ao atualizar perfil');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async (amount: number, operation: 'add' | 'subtract' = 'add') => {
    if (!profile) return;

    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch('/profile/balance', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          operation,
        }),
      });

      if (data.profile) {
        const p = data.profile;
        const updatedProfile = {
          id: p.id,
          user_id: p.user_id,
          email: p.email,
          full_name: p.full_name || p.name || '',
          name: p.name,
          balance: p.balance || 0,
          free_bet_balance: p.free_bet_balance || 0,
          phone: p.phone || '',
          is_admin: p.is_admin || false,
          status: p.status,
          kyc_verified: p.kyc_verified || false,
          email_verified: p.email_verified || false,
          birth_date: p.birth_date,
          created_at: p.created_at || new Date().toISOString(),
          updated_at: p.updated_at,
          self_exclusion_until: p.self_exclusion_until,
          cooling_off_until: p.cooling_off_until,
          limits: p.limits,
          saved_iban: p.saved_iban,
          saved_account_holder: p.saved_account_holder,
        } as Profile;
        setProfile(updatedProfile);
        return updatedProfile;
      }
    } catch (err: any) {
      console.error('Erro ao atualizar saldo:', err);
      setError(err.message || 'Erro ao atualizar saldo');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const setSelfExclusion = async (days: number, reason?: string) => {
    if (!profile) return;

    try {
      const exclusionDate = new Date();
      exclusionDate.setDate(exclusionDate.getDate() + days);

      await updateProfile({
        self_exclusion_until: exclusionDate.toISOString(),
        self_exclusion_reason: reason || '',
        status: 'self_excluded',
      });
    } catch (err: any) {
      console.error('Erro ao definir auto-exclusão:', err);
      throw err;
    }
  };

  const setCoolingOff = async (hours: number) => {
    if (!profile) return;

    try {
      const coolingDate = new Date();
      coolingDate.setHours(coolingDate.getHours() + hours);

      await updateProfile({
        cooling_off_until: coolingDate.toISOString(),
      });
    } catch (err: any) {
      console.error('Erro ao definir período de reflexão:', err);
      throw err;
    }
  };

  const isSelfExcluded = () => {
    if (!profile?.self_exclusion_until) return false;
    return new Date(profile.self_exclusion_until) > new Date();
  };

  const isCoolingOff = () => {
    if (!profile?.cooling_off_until) return false;
    return new Date(profile.cooling_off_until) > new Date();
  };

  const getExclusionTimeRemaining = () => {
    if (!profile?.self_exclusion_until) return null;

    const now = new Date();
    const exclusionDate = new Date(profile.self_exclusion_until);
    const diff = exclusionDate.getTime() - now.getTime();

    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes };
  };

  const getCoolingOffTimeRemaining = () => {
    if (!profile?.cooling_off_until) return null;

    const now = new Date();
    const coolingDate = new Date(profile.cooling_off_until);
    const diff = coolingDate.getTime() - now.getTime();

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  return {
    profile,
    loading,
    error,
    updateProfile,
    updateBalance,
    setSelfExclusion,
    setCoolingOff,
    refetch: fetchProfile,
    isSelfExcluded,
    isCoolingOff,
    getExclusionTimeRemaining,
    getCoolingOffTimeRemaining,
  };
};
