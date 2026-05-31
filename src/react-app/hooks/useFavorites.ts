import { useState, useEffect, useCallback } from 'react'; 
import { useApp } from '@/react-app/contexts/AppContext'; 
import { apiFetch } from '@/react-app/utils/api';

export function useFavorites() { 
  const { user } = useApp(); 
  const [favorites, setFavorites] = useState<number[]>([]); 

  const fetchFavorites = useCallback(async (signal?: AbortSignal) => { 
    const token = localStorage.getItem('auth_token');
    if (!user || !token) {
        setFavorites([]);
        return;
    }

    try { 
      const data = await apiFetch<Array<{ event_id: number }>>('/api/favorites', { 
          signal, 
          cache: 'no-store' 
      }); 
      if (Array.isArray(data)) { 
        setFavorites(data.map((f) => f.event_id)); 
      } 
    } catch (error: any) { 
      const msg = String(error?.message || ''); 
      const isAbort = error?.name === 'AbortError' || /Abort|ERR_ABORTED|ERR_CANCELED|Failed to fetch/i.test(msg); 
      if (!isAbort) { 
        if (msg.includes('401')) {
            // console.warn('Unauthorized → skipping favorites');
        } else {
            // console.error('Error fetching favorites:', error); 
        }
      } 
    } 
  }, [user]); 
 
  useEffect(() => { 
    const controller = new AbortController(); 
    fetchFavorites(controller.signal); 
    return () => { controller.abort(); }; 
  }, [fetchFavorites]); 

  const toggleFavorite = async (eventId: number) => { 
    const token = localStorage.getItem('auth_token');
    if (!user || !token) return; 

     const isFavorite = favorites.includes(eventId); 

     try { 
       if (isFavorite) { 
         await apiFetch(`/api/favorites/${eventId}`, { 
           method: 'DELETE', 
           cache: 'no-store', 
         }); 
         setFavorites(prev => prev.filter(id => id !== eventId)); 
       } else { 
         await apiFetch('/api/favorites', { 
           method: 'POST', 
           body: JSON.stringify({ event_id: eventId }), 
           cache: 'no-store', 
         }); 
         setFavorites(prev => [...prev, eventId]); 
       } 
     } catch (error) { 
       try { 
        // const msg = String((error as any)?.message || ''); 
        // const isAbort = (error as any)?.name === 'AbortError' || /Abort|ERR_ABORTED|ERR_CANCELED|Failed to fetch/i.test(msg); 
         // if (!isAbort) console.error('Error toggling favorite:', error); 
       } catch { /* no-op */ } 
     } 
   }; 

   return { favorites, toggleFavorite }; 
}
