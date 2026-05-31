import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function useEventSearch() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize from URL
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const q = sp.get('q') || '';
      setQuery(q);
    } catch { /* no-op */ }
  }, [location.search]);

  // Sync to URL
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const curr = sp.get('q') || '';
      const next = query || '';
      if (curr === next) return;
      if (next.trim()) {
        sp.set('q', next);
      } else {
        sp.delete('q');
      }
      navigate({ pathname: location.pathname, search: sp.toString() }, { replace: true });
    } catch { /* no-op */ }
  }, [query, navigate, location.pathname, location.search]);

  return { query, setQuery };
}
