
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';
type ThemeMode = 'manual' | 'auto';

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Função para determinar o tema baseado no horário
const getThemeByTime = (): Theme => {
  const now = new Date();
  const hour = now.getHours();
  // Claro das 08:00 às 18:59, escuro das 19:00 às 07:59
  return hour >= 8 && hour < 19 ? 'light' : 'dark';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('betpt-theme-mode');
      return (saved as ThemeMode) || 'auto';
    } catch (e) {
      console.error('Failed to read theme mode from localStorage:', e);
      return 'auto';
    }
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const savedMode = localStorage.getItem('betpt-theme-mode') || 'auto';
      if (savedMode === 'auto') {
        return getThemeByTime();
      }
      const saved = localStorage.getItem('betpt-theme');
      return (saved as Theme) || 'light';
    } catch (e) {
      console.error('Failed to read theme from localStorage:', e);
      return 'light';
    }
  });

  // Atualizar tema automaticamente quando o modo é 'auto'
  useEffect(() => {
    if (themeMode !== 'auto') return;

    // Atualizar tema imediatamente
    setThemeState(getThemeByTime());

    // Verificar a cada minuto para mudança de horário
    const interval = setInterval(() => {
      const newTheme = getThemeByTime();
      setThemeState(prevTheme => {
        if (prevTheme !== newTheme) {
          return newTheme;
        }
        return prevTheme;
      });
    }, 60000); // Verificar a cada minuto

    return () => clearInterval(interval);
  }, [themeMode]);

  // Salvar preferências e aplicar classe
  useEffect(() => {
    try {
      localStorage.setItem('betpt-theme', theme);
      localStorage.setItem('betpt-theme-mode', themeMode);
    } catch (e) {
      console.error('Failed to write theme to localStorage:', e);
    }

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, themeMode]);

  const toggleTheme = () => {
    // Ao alternar manualmente, muda para modo manual
    setThemeModeState('manual');
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeModeState('manual');
    setThemeState(newTheme);
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    if (mode === 'auto') {
      setThemeState(getThemeByTime());
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMode, toggleTheme, setTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useThemeInternal() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export const useTheme = useThemeInternal;
