/**
 * ✅ SERVIÇO UNIFICADO DE LOGOS - ESPN + API-FOOTBALL
 * - ESPN API para logos oficiais (NCAA, NBA, NFL, MLB, NHL, Futebol Europeu)
 * - API-Football como fallback
 * - Cache agressivo em memória e IndexedDB
 */

import { apiFootballRequest } from '../lib/api';
import { getESPNTeamLogo, preloadESPNLogos } from './espnLogosService';

// ============================================
// CACHE DE LOGOS EM MEMÓRIA
// ============================================

interface LogoCache {
  url: string;
  timestamp: number;
}

const memoryLogoCache = new Map<string, LogoCache>();
const LOGO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// ============================================
// INDEXEDDB PARA PERSISTÊNCIA
// ============================================

const DB_NAME = 'TeamLogosDB';
const STORE_NAME = 'logos';
const DB_VERSION = 3;

let dbInstance: IDBDatabase | null = null;

async function initLogoDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function getLogoFromDB(key: string): Promise<string | null> {
  try {
    const db = await initLogoDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && Date.now() - result.timestamp < LOGO_CACHE_TTL) {
          resolve(result.url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveLogoToDB(key: string, url: string): Promise<void> {
  try {
    const db = await initLogoDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      key,
      url,
      timestamp: Date.now()
    });
  } catch {
    // Ignorar erros
  }
}

// ============================================
// NORMALIZAÇÃO DE NOMES
// ============================================

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*(fc|cf|sc|ac|bc|hc|ssc|ss|se|cr|ec|fbpa|united|city|town|athletic|club|wanderers|hotspur|albion)\s*/gi, ' ')
    .replace(/[.,\-_()'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// DETECÇÃO DE TIPO DE LIGA
// ============================================

function isUSLeague(league: string): boolean {
  const usKeywords = [
    'ncaa', 'nba', 'wnba', 'nfl', 'mlb', 'nhl', 'mls',
    'college', 'basketball_ncaab', 'americanfootball_ncaaf',
    'baseball_ncaa', 'basketball_nba', 'americanfootball_nfl',
    'baseball_mlb', 'icehockey_nhl'
  ];
  const normalizedLeague = league.toLowerCase();
  return usKeywords.some(kw => normalizedLeague.includes(kw));
}

function isEuropeanFootball(league: string): boolean {
  const euroKeywords = [
    'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
    'primeira liga', 'liga portugal', 'eredivisie', 'champions league',
    'europa league', 'conference league', 'championship', 'copa del rey',
    'dfb pokal', 'coppa italia', 'coupe de france', 'super lig',
    'scottish', 'jupiler', 'belgian'
  ];
  const normalizedLeague = league.toLowerCase();
  return euroKeywords.some(kw => normalizedLeague.includes(kw));
}

/**
 * ✅ SANITIZAR NOME DA EQUIPA PARA API-FOOTBALL
 * Remove caracteres especiais que a API não aceita
 */
function sanitizeTeamNameForAPI(teamName: string): string {
  return teamName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove tudo exceto letras, números e espaços
    .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
    .trim();
}

/**
 * ✅ VALIDAR SE O NOME É VÁLIDO PARA API-FOOTBALL
 */
function isValidAPIFootballSearch(teamName: string): boolean {
  // API-Football só aceita alpha-numeric e espaços
  const sanitized = sanitizeTeamNameForAPI(teamName);
  return sanitized.length >= 3; // Mínimo 3 caracteres
}

// ============================================
// FUNÇÃO PRINCIPAL DE BUSCA DE LOGO
// ============================================

/**
 * ✅ Buscar logo de uma equipa
 * Prioridade: Cache → ESPN API → API-Football
 */
export async function getTeamLogo(
  teamName: string,
  league?: string,
  _sport: string = 'football'
): Promise<string | null> {
  if (!teamName) return null;
  
  const normalizedName = normalizeTeamName(teamName);
  const originalName = teamName;
  
  // 1. Verificar cache em memória
  const memoryCached = memoryLogoCache.get(normalizedName) || memoryLogoCache.get(originalName);
  if (memoryCached && Date.now() - memoryCached.timestamp < LOGO_CACHE_TTL) {
    return memoryCached.url;
  }
  
  // 2. Verificar IndexedDB
  const dbCached = await getLogoFromDB(normalizedName) || await getLogoFromDB(originalName);
  if (dbCached) {
    memoryLogoCache.set(normalizedName, { url: dbCached, timestamp: Date.now() });
    return dbCached;
  }
  
  // 3. ✅ PRIORIDADE ESPN para ligas US e futebol europeu
  if (league && (isUSLeague(league) || isEuropeanFootball(league))) {
    try {
      const espnLogo = await getESPNTeamLogo(teamName, league);
      if (espnLogo) {
        memoryLogoCache.set(normalizedName, { url: espnLogo, timestamp: Date.now() });
        memoryLogoCache.set(originalName, { url: espnLogo, timestamp: Date.now() });
        saveLogoToDB(normalizedName, espnLogo);
        saveLogoToDB(originalName, espnLogo);
        console.log(`✅ ESPN Logo: ${teamName}`);
        return espnLogo;
      }
    } catch (error) {
      console.warn(`⚠️ ESPN logo falhou para ${teamName}:`, error);
    }
  }
  
  // 4. Tentar ESPN sem liga específica
  try {
    const espnLogo = await getESPNTeamLogo(teamName, league);
    if (espnLogo) {
      memoryLogoCache.set(normalizedName, { url: espnLogo, timestamp: Date.now() });
      memoryLogoCache.set(originalName, { url: espnLogo, timestamp: Date.now() });
      saveLogoToDB(normalizedName, espnLogo);
      saveLogoToDB(originalName, espnLogo);
      return espnLogo;
    }
  } catch {
    // Continuar para fallback
  }
  
  // 5. Fallback: API-Football (apenas se o nome for válido)
  if (isValidAPIFootballSearch(teamName)) {
    try {
      const sanitizedName = sanitizeTeamNameForAPI(teamName);
      const data = await apiFootballRequest(`/teams?search=${encodeURIComponent(sanitizedName)}`, 'football');
      
      if (data?.response && data.response.length > 0) {
        const team = data.response[0];
        const logo = team.team?.logo;
        
        if (logo) {
          memoryLogoCache.set(normalizedName, { url: logo, timestamp: Date.now() });
          memoryLogoCache.set(originalName, { url: logo, timestamp: Date.now() });
          saveLogoToDB(normalizedName, logo);
          saveLogoToDB(originalName, logo);
          return logo;
        }
      }
    } catch (error) {
      console.warn(`⚠️ API-Football falhou para "${teamName}":`, error);
      // Continuar para fallback genérico
    }
  } else {
    console.log(`⏭️ Pulando API-Football para "${teamName}" (caracteres inválidos)`);
  }
  
  return null;
}

/**
 * ✅ Buscar logos de múltiplas equipas em batch
 */
export async function getTeamLogosBatch(
  teams: Array<{ name: string; league?: string; sport?: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Processar em paralelo com limite e tratamento de erros individual
  const batchSize = 5;
  for (let i = 0; i < teams.length; i += batchSize) {
    const batch = teams.slice(i, i + batchSize);
    const promises = batch.map(async (team) => {
      try {
        const logo = await getTeamLogo(team.name, team.league, team.sport);
        if (logo) {
          results.set(team.name, logo);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar logo de "${team.name}":`, error);
        // Continuar com as outras equipas
      }
    });
    await Promise.all(promises);
  }
  
  return results;
}

/**
 * ✅ PRÉ-CARREGAR LOGOS DE TODAS AS LIGAS
 */
export async function preloadPopularLeagueLogos(): Promise<void> {
  console.log('🔄 Pré-carregando logos de todas as ligas...');
  
  // Pré-carregar ESPN (NCAA, NBA, NFL, MLB, NHL, Futebol Europeu)
  await preloadESPNLogos();
  
  console.log('✅ Logos pré-carregados com sucesso!');
}

/**
 * ✅ Estatísticas do cache de logos
 */
export function getLogosCacheStats() {
  return {
    memoryCacheSize: memoryLogoCache.size,
  };
}

/**
 * ✅ Limpar cache de logos
 */
export function clearLogosCache(): void {
  memoryLogoCache.clear();
  console.log('🗑️ Cache de logos limpo');
}

export default {
  getTeamLogo,
  getTeamLogosBatch,
  preloadPopularLeagueLogos,
  getLogosCacheStats,
  clearLogosCache
};
