
// Cache local para logos das equipas usando IndexedDB
const DB_NAME = 'TeamLogosCache';
const STORE_NAME = 'logos';
const DB_VERSION = 1;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 dias

interface CachedLogo {
  url: string;
  blob: string; // base64
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });
};

const urlToBase64 = async (url: string): Promise<string> => {
  let target = url;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'media.api-sports.io' || host.endsWith('.api-sports.io')) {
      target = `/api/media-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch { target = url; }
  const response = await fetch(target);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Obter logo do cache
export const getCachedLogo = async (url: string): Promise<string | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedLogo | undefined;
        if (result && Date.now() - result.timestamp < CACHE_EXPIRY) {
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// Guardar logo no cache
export const cacheLogo = async (url: string): Promise<string | null> => {
  try {
    // Primeiro verificar se já está em cache
    const cached = await getCachedLogo(url);
    if (cached) return cached;

    // Converter para base64 e guardar
    const base64 = await urlToBase64(url);
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data: CachedLogo = {
        url,
        blob: base64,
        timestamp: Date.now(),
      };

      const request = store.put(data);
      request.onsuccess = () => resolve(base64);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// Limpar cache expirado
export const cleanExpiredCache = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const data = cursor.value as CachedLogo;
        if (Date.now() - data.timestamp > CACHE_EXPIRY) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {
    // Ignorar erros de limpeza
  }
};

// Hook para usar logo com cache
export const useLogoWithCache = () => {
  const getLogoUrl = async (originalUrl: string): Promise<string> => {
    if (!originalUrl) return '';
    
    try {
      // Tentar obter do cache primeiro
      const cached = await getCachedLogo(originalUrl);
      if (cached) return cached;

      // Se não estiver em cache, fazer download e guardar
      const base64 = await cacheLogo(originalUrl);
      return base64 || originalUrl;
    } catch {
      return originalUrl;
    }
  };

  return { getLogoUrl };
};
