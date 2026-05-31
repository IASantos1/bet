import { apiFetch } from './backendClient';

export interface OddsApiIoEvent {
  id: number;
  sport_id: number;
  league_id: number;
  home_team_id: number;
  away_team_id: number;
  start_at: string;
  home_team: {
    id: number;
    name: string;
    logo?: string;
  };
  away_team: {
    id: number;
    name: string;
    logo?: string;
  };
  league: {
    id: number;
    name: string;
  };
  odds?: {
    market_id: number;
    market_name: string;
    values: {
      value: string;
      odd: string;
    }[];
  }[];
}

/**
 * Fetch events with odds from the backend proxy (Odds-API.io)
 */
export async function fetchOddsEvents(sportKey: string = 'football'): Promise<OddsApiIoEvent[]> {
  try {
    // ✅ RESOLVER CAMINHO CORRETAMENTE
    // O backendClient.ts usa resolvePath, mas para rotas customizadas como /api/odds/events, 
    // precisamos garantir que ele não prefixe com /api duplicado se API_URL já tiver /api
    // Mas o backendClient já trata isso com resolvePath e API_URL.
    
    // Problema potencial: O backendClient.ts prefixa API_URL.
    // Se API_URL for '/api' e path for '/api/odds/events', vira '/api/api/odds/events'.
    
    // Vamos ajustar o path para ser relativo à raiz da API
    const data = await apiFetch(`/odds/events?sport=${sportKey}`); 
    
    if (Array.isArray(data)) {
      console.log(`[Odds-API.io] Recebidos ${data.length} eventos para ${sportKey}`);
      return data;
    } else if (data && Array.isArray(data.data)) {
        // Algumas respostas podem vir envelopadas
        return data.data;
    }
    
    console.warn('[Odds-API.io] Resposta inválida ou vazia:', data);
    return [];
  } catch (error) {
    console.error('Error fetching odds from Odds-API.io:', error);
    return [];
  }
}
