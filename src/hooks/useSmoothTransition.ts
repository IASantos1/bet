import { useState, useEffect, useRef } from 'react';

interface SmoothTransitionOptions<T> {
  data: T | null;
  transitionDuration?: number;
  compareKey?: (data: T) => string | number;
}

/**
 * Hook para transições suaves sem flickering
 * Evita loading spinners visíveis durante atualizações
 */
export function useSmoothTransition<T>({
  data,
  transitionDuration = 300,
  compareKey,
}: SmoothTransitionOptions<T>) {
  const [displayData, setDisplayData] = useState<T | null>(data);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousKeyRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (data === null) return;

    // Verificar se os dados realmente mudaram
    const currentKey = compareKey ? compareKey(data) : JSON.stringify(data);
    const hasChanged = previousKeyRef.current !== currentKey;

    if (!hasChanged && displayData !== null) return;

    previousKeyRef.current = currentKey;

    // Limpar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Iniciar transição suave
    setIsTransitioning(true);

    // Atualizar dados após pequeno delay para transição CSS
    timeoutRef.current = setTimeout(() => {
      setDisplayData(data);
      setIsTransitioning(false);
    }, transitionDuration);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, transitionDuration, compareKey, displayData]);

  return {
    displayData: displayData || data,
    isTransitioning,
  };
}
