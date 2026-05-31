import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  getCurrentUser,
  signIn as backendSignIn,
  signUp as backendSignUp,
  signOut as backendSignOut,
  signInWithProvider as backendSignInWithProvider,
  type AuthUser as User,
} from '../services/backendClient';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, extraData?: Record<string, any>) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithProvider: (provider: 'google' | 'facebook') => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled && currentUser) {
          setUser(currentUser);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const profile = await backendSignIn(email, password);
    setUser(profile);
  };

  const signUp = async (email: string, password: string, extraData?: Record<string, any>) => {
    const profile = await backendSignUp(email, password, extraData);
    if (profile) {
      setUser(profile);
    }
  };

  const signInWithProvider = async (provider: 'google' | 'facebook') => {
    await backendSignInWithProvider(provider);
  };

  const signOut = async () => {
    await backendSignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithProvider,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuthInternal() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const useAuth = useAuthInternal;
