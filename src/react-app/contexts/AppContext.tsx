import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'; 
import { useAuth } from './AuthContext';
import { apiFetch } from '../utils/api';
import type { BetSlipItem } from '@/shared/types'; 

interface Notification { 
  id: string; 
  type: 'success' | 'error' | 'info' | 'warning'; 
  message: string; 
  timestamp: Date; 
} 



interface AppContextType {
  betSlip: BetSlipItem[];
  addToBetSlip: (bet: BetSlipItem) => void;
  removeFromBetSlip: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  clearBetSlip: () => void;
  defaultBet: number;
  darkMode: boolean;
  toggleDarkMode: () => void;
  autoTheme: boolean;
  setAutoTheme: (on: boolean) => void;
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  user: { 
    id: string; 
    username?: string; 
    kyc_status?: 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended' | 'closed';
    is_operator?: number;
    twofa_enabled?: boolean;
    country?: string;
  } | null;
  signIn: (username: string, password: string) => Promise<{ success: boolean; requires2fa?: boolean; userId?: string }>;
  loginWith2FA: (userId: string, token: string) => Promise<boolean>;
  signUp: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dob: string;
    country: string;
  }) => Promise<boolean>;
  signOut: () => Promise<void>;
  getTwoFactorStatus: () => Promise<boolean>;
  setupTwoFactor: () => Promise<{ qrCode: string; secret: string; otpauth: string } | null>;
  verifyTwoFactor: (token: string) => Promise<boolean>;
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selfExclude: boolean;
  selfExcludeUntil: string | null;
  setSelfExclude: (on: boolean, until?: string | null) => void;
  isOperator: boolean;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showAdminPanel: boolean;
  setShowAdminPanel: (show: boolean) => void;
  showMobileSidebar: boolean;
  setShowMobileSidebar: (show: boolean) => void;
  showDashboard: boolean;
  setShowDashboard: (show: boolean) => void;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register' | '2fa';
  authModalUserId: string | null;
  openAuthModal: (mode: 'login' | 'register' | '2fa', userId?: string) => void;
  closeAuthModal: () => void;
}

 const AppContext = createContext<AppContextType | undefined>(undefined); 

 export const useApp = () => { 
   const context = useContext(AppContext); 
   if (!context) throw new Error('useApp must be used within AppProvider'); 
   return context; 
 }; 

export function AppProvider({ children }: { children: ReactNode }) {
  const { user: authUser, signIn: authSignIn, signUp: authSignUp, signOut: authSignOut, refreshUser } = useAuth();
  
  // Adapter for backward compatibility
  const user = React.useMemo(() => (authUser ? { ...authUser, id: authUser.userId } : null), [authUser]);

  const [betSlip, setBetSlip] = useState<BetSlipItem[]>([]);
  const [defaultBet, setDefaultBet] = useState<number>(10);
  const [darkMode, setDarkMode] = useState(false);
  const [autoTheme, setAutoThemeState] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // User state is now derived from AuthContext
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selfExclude, setSelfExcludeState] = useState<boolean>(false);
  const [selfExcludeUntil, setSelfExcludeUntilState] = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false);
  const [showDashboard, setShowDashboard] = useState<boolean>(false);

  // Auth Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | '2fa'>('login');
  const [authModalUserId, setAuthModalUserId] = useState<string | null>(null);

  const openAuthModal = (mode: 'login' | 'register' | '2fa', userId?: string) => {
    setAuthModalMode(mode);
    if (userId) setAuthModalUserId(userId);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setAuthModalUserId(null);
  };

  const hbInflightRef = useRef<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved) setDarkMode(JSON.parse(saved));
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('selected_category');
      localStorage.removeItem('selected_category_migrated_v2');
    } catch { void 0 }
    setSelectedCategory(null);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('autoTheme');
    if (saved !== null) setAutoThemeState(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const savedBetSlip = localStorage.getItem('betSlip');
    if (savedBetSlip) setBetSlip(JSON.parse(savedBetSlip));
  }, []);

  useEffect(() => {
    localStorage.setItem('betSlip', JSON.stringify(betSlip));
  }, [betSlip]);

  useEffect(() => {
    const loadCfg = async () => {
      try {
        const j = await apiFetch<any>('/api/pricing/config', { cache: 'no-store', keepalive: true });
        const v = Number((j && (j as any).betDefault) || 10);
        if (Number.isFinite(v) && v > 0) setDefaultBet(v);
      } catch { /* no-op */ }
    };
    loadCfg();
    return () => { /* no-op */ };
  }, []);

  useEffect(() => {
    try {
      if (selectedCategory) {
        localStorage.setItem('selected_category', selectedCategory);
      } else {
        localStorage.removeItem('selected_category');
      }
    } catch { void 0 }
  }, [selectedCategory]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('self_exclude');
      if (saved !== null) setSelfExcludeState(JSON.parse(saved));
    } catch { void 0 }
    try {
      const until = localStorage.getItem('self_exclude_until');
      setSelfExcludeUntilState(until ? String(until) : null);
    } catch { void 0 }
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        const j = await apiFetch<any>('/api/users/profile', { signal: controller.signal });
        const v = Number((j && (j as any).self_exclude) || 0) === 1;
        const untilStr = String((j && (j as any).self_exclude_until) || '') || null;
        const until = untilStr ? new Date(untilStr).getTime() : 0;
        const now = Date.now();
        const active = v || (until > now);
        setSelfExcludeState(active);
        setSelfExcludeUntilState(untilStr);
        try { localStorage.setItem('self_exclude', JSON.stringify(active)); } catch { void 0 }
        try { localStorage.setItem('self_exclude_until', untilStr || ''); } catch { void 0 }
      } catch { void 0 }
    };
    run();
    return () => { controller.abort(); };
  }, [user]);

  useEffect(() => {
    let aborted = false;
    const run = async () => {
      if (!user) { setIsOperator(false); return; }
      try {
        const j = await apiFetch<{ operator: boolean }>('/api/users/is-operator', { cache: 'no-store' });
        if (!aborted) setIsOperator(!!j.operator);
      } catch { void 0 }
    };
    run();
    return () => { aborted = true; };
  }, [user]);

  useEffect(() => {
    let id: any;
    let stopped = false;
    const tick = async () => {
      if (!user || stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && (navigator as any).onLine === false) return;
      try {
        if (hbInflightRef.current) return;
        hbInflightRef.current = true;
        const isDev = import.meta.env.DEV;
        const method = isDev ? 'GET' : 'POST';
        const opts: RequestInit = {
          method,
          cache: 'no-store',
        };
        if (method === 'POST') {
          (opts.headers as any) = { 'Content-Type': 'application/json' };
          opts.body = '{}';
        }
        try {
          await apiFetch('/api/users/heartbeat', opts);
        } catch (err: any) {
           const msg = String(err?.message || '');
           if (msg.includes('503')) {
             await new Promise((res) => setTimeout(res, 300));
             await apiFetch('/api/users/heartbeat', opts);
           }
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg)) { hbInflightRef.current = false; return; }
        // Wait and retry once
        await new Promise((res) => setTimeout(res, 300));
        try {
          const isDev = import.meta.env.DEV;
          const method = isDev ? 'GET' : 'POST';
          const opts: RequestInit = {
            method,
            cache: 'no-store',
          };
          if (method === 'POST') {
            (opts.headers as any) = { 'Content-Type': 'application/json' };
            opts.body = '{}';
          }
          await apiFetch('/api/users/heartbeat', opts);
        } catch { void 0 }
      } finally {
        hbInflightRef.current = false;
      }
    };
    if (user) {
      const schedule = () => {
        if (id) clearInterval(id);
        const ms = (typeof document !== 'undefined' && document.visibilityState === 'hidden') ? 60000 : 30000;
        id = setInterval(tick, ms);
      };
      tick();
      schedule();
      const onVis = () => { schedule(); };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
      return () => { stopped = true; if (id) clearInterval(id); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
    }
    return () => { stopped = true; if (id) clearInterval(id); };
  }, [user]);

  useEffect(() => {
    // AuthContext handles user loading
  }, []);
 
  const addToBetSlip = (bet: BetSlipItem) => {
    // 6. BET SLIP – BLOQUEIO FINAL (OBRIGATÓRIO)
    // Check if market or selection is suspended
    if (bet.suspended || bet.market_suspended) {
        addNotification({ type: 'error', message: 'Mercado suspenso: aposta não permitida' });
        // throw new Error('MARKET_SUSPENDED'); // Optionally throw if caller expects it
        return; 
    }

    if (selfExclude) {
      addNotification({ type: 'error', message: 'Autoexcluído: não pode adicionar apostas' });
      return;
    }
    setBetSlip(prev => {
      // Allow multiple selections from same event (for Single bets)
      // The BetSlip component handles switching to 'Single' mode if duplicates exist.
      const exists = prev.find(b => b.id === bet.id);
      if (exists) return prev;
      const stake = Number(bet.stake || 0);
      const withStake = stake > 0 ? bet : { ...bet, stake: defaultBet };
      return [...prev, withStake];
    });
    try { setTimeout(() => { window.dispatchEvent(new CustomEvent('betSlip:focus', { detail: { betId: bet.id } })); }, 0); } catch { /* no-op */ }
  };
 
   const removeFromBetSlip = (id: string) => { 
     setBetSlip(prev => prev.filter(b => b.id !== id)); 
   }; 
 
   const updateStake = (id: string, stake: number) => { 
     setBetSlip(prev => prev.map(b => b.id === id ? { ...b, stake } : b)); 
   }; 
 
  const clearBetSlip = () => { 
    setBetSlip([]); 
  }; 

  const toggleDarkMode = () => {  
    setDarkMode(prev => { 
      const newValue = !prev; 
      localStorage.setItem('darkMode', JSON.stringify(newValue)); 
      return newValue; 
    }); 
  }; 

  const applyAutoTheme = () => {
    const hour = new Date().getHours();
    const isNight = hour < 7 || hour >= 19;
    setDarkMode(isNight);
    localStorage.setItem('darkMode', JSON.stringify(isNight));
  };

  useEffect(() => {
    let id: any;
    const onVis = () => applyAutoTheme();
    if (autoTheme) {
      applyAutoTheme();
      id = setInterval(applyAutoTheme, 60000);
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [autoTheme]);

  const setAutoTheme = (on: boolean) => {
    setAutoThemeState(on);
    localStorage.setItem('autoTheme', JSON.stringify(on));
    if (on) applyAutoTheme();
  };

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp'>) => { 
    const newNotification: Notification = { 
      ...notification, 
      id: Date.now().toString(), 
      timestamp: new Date(), 
    }; 
    setNotifications(prev => [...prev, newNotification]); 
  }; 

  const setSelfExclude = (on: boolean, until?: string | null) => {
    setSelfExcludeState(on);
    setSelfExcludeUntilState(on ? (until || null) : null);
    try { localStorage.setItem('self_exclude', JSON.stringify(on)); } catch { void 0 }
    try { localStorage.setItem('self_exclude_until', on ? (until || '') : ''); } catch { void 0 }
    addNotification({ type: on ? 'warning' : 'info', message: on ? 'Autoexclusão ativa' : 'Autoexclusão desativada' });
    (async () => {
      try {
        await apiFetch('/api/users/self-exclude', {
          method: 'POST',
          body: JSON.stringify({ self_exclude: on, until }),
        });
      } catch { void 0 }
    })();
  };

  const removeNotification = (id: string) => { 
    setNotifications(prev => prev.filter(n => n.id !== id)); 
  }; 

  const signIn = async (username: string, password: string) => {
    return authSignIn(username, password);
  };

  const loginWith2FA = async (userId: string, token: string) => {
    try {
      const data = await apiFetch<{ success: boolean }>('/api/auth/2fa/login', {
        method: 'POST',
        body: JSON.stringify({ userId, token })
      });
      if (data.success) {
        await refreshUser();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const signUp = authSignUp;

  const signOut = authSignOut;

  const getTwoFactorStatus = async () => {
    try {
      const data = await apiFetch<{ enabled: boolean }>('/api/auth/2fa/status');
      return !!data.enabled;
    } catch {
      return false;
    }
  };

  const setupTwoFactor = async () => {
    try {
      const data = await apiFetch<{ qrCode: string; secret: string; otpauth: string }>('/api/auth/2fa/setup', { method: 'POST' });
      return data;
    } catch {
      return null;
    }
  };

  const verifyTwoFactor = async (token: string) => {
    try {
      const data = await apiFetch<{ success: boolean }>('/api/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ token })
      });
      return !!data.success;
    } catch {
      return false;
    }
  };

  return (
    <AppContext.Provider 
      value={{ 
        betSlip, 
        addToBetSlip, 
        removeFromBetSlip, 
        updateStake, 
        clearBetSlip, 
        defaultBet,
        darkMode, 
        toggleDarkMode, 
        autoTheme,
        setAutoTheme,
        notifications, 
        addNotification, 
        removeNotification,
        user,
        signIn,
        signUp,
        signOut,
        loginWith2FA,
        getTwoFactorStatus,
        setupTwoFactor,
        verifyTwoFactor,
        selectedCategory,
        setSelectedCategory,
        selfExclude,
        selfExcludeUntil,
        setSelfExclude,
        isOperator,
        showSettings,
        setShowSettings,
        showAdminPanel,
        setShowAdminPanel,
        showMobileSidebar,
        setShowMobileSidebar,
        showDashboard,
        setShowDashboard,
        authModalOpen,
        authModalMode,
        authModalUserId,
        openAuthModal,
        closeAuthModal,
      }} 
    > 
      {children} 
    </AppContext.Provider> 
  ); 
}
