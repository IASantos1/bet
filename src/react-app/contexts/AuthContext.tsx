import { 
   createContext, 
   useContext, 
   useEffect, 
   useState, 
   ReactNode, 
 } from 'react'; 
import { apiFetch } from '../utils/api';
 
 type User = { 
  userId: string; 
  username: string; 
  is_operator?: number;
  kyc_status?: 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended' | 'closed';
}; 
 
 type AuthContextType = { 
   user: User | null; 
   loading: boolean; 
 
   signIn: ( 
     username: string, 
     password: string, 
     twoFactorCode?: string 
   ) => Promise<{ success: boolean; requires2fa?: boolean; userId?: string }>; 
 
   signUp: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dob: string;
    country: string;
  }) => Promise<boolean>;

  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* ================================
     REFRESH USER
  ================================= */
  const refreshUser = async () => {
    try {
      const data = await apiFetch<any>('/api/auth/me', {
        cache: 'no-store',
      });

      setUser(data.user || data);
    } catch {
      setUser(null);
    }
  };

 useEffect(() => {
    let alive = true;

    apiFetch<any>('/api/auth/me', { timeout: 8000 })
      .then((u) => {
        if (!alive) return;
        if (u && typeof u === 'object' && 'user' in u) {
          setUser(u.user);
        } else {
          setUser(u);
        }
      })
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, []);

  /* ================================
     SIGN IN (SUPPORTS 2FA)
  ================================= */
  const signIn = async (
    username: string,
    password: string,
    twoFactorCode?: string
  ) => {
    try {
      // STEP 1 — NORMAL LOGIN
      const data = await apiFetch<any>('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      // Save Token if present
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      if (data.refreshToken) {
        localStorage.setItem('refresh_token', data.refreshToken);
      }

      // Requires 2FA
      if (data.requires2fa) {
        if (!twoFactorCode) {
          return {
            success: false,
            requires2fa: true,
            userId: data.userId,
          };
        }

        // STEP 2 — 2FA VALIDATION
        const two = await apiFetch<any>('/api/auth/2fa/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.userId,
            token: twoFactorCode,
          }),
        });
        if (two?.token) localStorage.setItem('auth_token', two.token);
        if (two?.refreshToken) localStorage.setItem('refresh_token', two.refreshToken);
      }

      await refreshUser();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  /* ================================
     SIGN UP
  ================================= */
  const signUp = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dob: string;
    country: string;
  }) => {
    try {
      const res = await apiFetch<any>('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.token) {
        localStorage.setItem('auth_token', res.token);
      }
      if (res.refreshToken) {
        localStorage.setItem('refresh_token', res.refreshToken);
      }

      await refreshUser();
      return true;
    } catch {
      return false;
    }
  }; 
 
   /* ================================
     LOCAL LOGOUT HELPER
  ================================= */
  const localLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  /* ================================ 
     SIGN OUT 
  ================================= */ 
  const signOut = async () => { 
    try { 
      await apiFetch('/api/auth/logout', { 
        method: 'POST', 
      }); 
    } finally { 
      localLogout();
    } 
  };

  /* ================================
     AUTO LOGOUT LISTENER
  ================================= */
  useEffect(() => {
    const handleUnauthorized = () => {
      localLogout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []); 

  /* ================================
     IDLE TIMER & SILENT REFRESH
  ================================= */
  useEffect(() => {
    if (!user) return;

    // --- IDLE TIMER (24 Hours) ---
    let idleTimeout: NodeJS.Timeout;

    const resetIdleTimer = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        console.log('[Auth] Inatividade detectada (24h). Encerrando sessão...');
        signOut().catch(() => localLogout());
      }, 24 * 60 * 60 * 1000); // 24 hours
    };

    // Events to detect activity
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));

    // Initialize timer
    resetIdleTimer();

    // --- SILENT REFRESH (Every 5 Minutes) ---
    const refreshInterval = setInterval(async () => {
       const refreshToken = localStorage.getItem('refresh_token');
       if (!refreshToken) return;

       try {
         const res = await apiFetch<any>('/api/auth/refresh', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ refreshToken })
         });

         if (res.token) localStorage.setItem('auth_token', res.token);
         if (res.refreshToken) localStorage.setItem('refresh_token', res.refreshToken);
         
         console.log('[Auth] Token renovado com sucesso.');
       } catch (err) {
         // Do NOT logout on generic refresh error. 
         // Only 401 triggers 'auth:unauthorized' which handles logout.
         console.error('[Auth] Falha ao renovar token (tentativa):', err);
       }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearTimeout(idleTimeout);
      clearInterval(refreshInterval);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, [user]); // Re-run when user state changes
 
   return ( 
     <AuthContext.Provider 
       value={{ 
         user, 
         loading, 
         signIn, 
         signUp, 
         signOut, 
         refreshUser, 
       }} 
     > 
       {children} 
     </AuthContext.Provider> 
   ); 
 } 
 
 /* ================================ 
    HOOK 
 ================================= */ 
 export function useAuth() { 
   const ctx = useContext(AuthContext); 
  if (!ctx) { 
    return { 
      user: null, 
      loading: false, 
      signIn: async () => ({ success: false }), 
      signUp: async () => false, 
      signOut: async () => {}, 
      refreshUser: async () => {} 
    }; 
  } 
  return ctx; 
 }
