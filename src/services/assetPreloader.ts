/**
 * Asset Preloader
 * Pré-carrega recursos críticos em background para melhorar performance
 */

interface PreloadConfig {
  priority: 'high' | 'low';
  type: 'script' | 'style' | 'image' | 'font' | 'fetch';
  crossOrigin?: 'anonymous' | 'use-credentials';
}

class AssetPreloader {
  private preloadedAssets: Set<string> = new Set();
  private preloadQueue: Array<{ url: string; config: PreloadConfig }> = [];
  private isProcessing = false;

  /**
   * Pré-carregar asset crítico
   */
  preload(url: string, config: PreloadConfig): void {
    if (this.preloadedAssets.has(url)) {
      return;
    }

    this.preloadQueue.push({ url, config });
    this.processQueue();
  }

  /**
   * Pré-carregar múltiplos assets
   */
  preloadMultiple(assets: Array<{ url: string; config: PreloadConfig }>): void {
    assets.forEach(({ url, config }) => this.preload(url, config));
  }

  /**
   * Pré-carregar dados populares em background
   */
  async preloadPopularData(): Promise<void> {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl || !apiUrl.startsWith('http')) {
      return;
    }

    const popularEndpoints = ['/odds/sports', '/transactions', '/auth/session'].map(
      (path) => `${apiUrl}${path}`,
    );

    const promises = popularEndpoints.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, {
          priority: 'low',
        } as any);
        
        if (response.ok) {
          // Dados já estão em cache HTTP
          console.log(`✅ Dados pré-carregados: ${endpoint}`);
        }
      } catch {
        console.warn(`⚠️ Falha ao pré-carregar: ${endpoint}`);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Pré-carregar imagens críticas
   */
  preloadImages(urls: string[]): void {
    urls.forEach((url) => {
      this.preload(url, {
        priority: 'high',
        type: 'image',
      });
    });
  }

  /**
   * Pré-carregar fontes
   */
  preloadFonts(urls: string[]): void {
    urls.forEach((url) => {
      this.preload(url, {
        priority: 'high',
        type: 'font',
        crossOrigin: 'anonymous',
      });
    });
  }

  /**
   * Processar fila de pré-carregamento
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.preloadQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Processar assets de alta prioridade primeiro
    const highPriority = this.preloadQueue.filter((item) => item.config.priority === 'high');
    const lowPriority = this.preloadQueue.filter((item) => item.config.priority === 'low');

    for (const item of [...highPriority, ...lowPriority]) {
      await this.preloadAsset(item.url, item.config);
      this.preloadQueue.shift();
    }

    this.isProcessing = false;
  }

  /**
   * Pré-carregar asset individual
   */
  private async preloadAsset(url: string, config: PreloadConfig): Promise<void> {
    if (this.preloadedAssets.has(url)) {
      return;
    }

    try {
      // Usar Resource Hints API
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = config.type;

      if (config.crossOrigin) {
        link.crossOrigin = config.crossOrigin;
      }

      // Adicionar ao head
      document.head.appendChild(link);

      this.preloadedAssets.add(url);
      console.log(`✅ Asset pré-carregado: ${url}`);
    } catch {
      console.warn(`⚠️ Falha ao pré-carregar: ${url}`);
    }
  }

  /**
   * Prefetch de páginas prováveis
   */
  prefetchPages(paths: string[]): void {
    paths.forEach((path) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = path;
      document.head.appendChild(link);
    });
  }

  /**
   * Preconnect para domínios externos
   */
  preconnect(domains: string[]): void {
    domains.forEach((domain) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  /**
   * DNS Prefetch para domínios externos
   */
  dnsPrefetch(domains: string[]): void {
    domains.forEach((domain) => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = domain;
      document.head.appendChild(link);
    });
  }

  /**
   * Limpar assets pré-carregados
   */
  clear(): void {
    this.preloadedAssets.clear();
    this.preloadQueue = [];
  }

  /**
   * Obter estatísticas
   */
  getStats(): {
    preloaded: number;
    queued: number;
  } {
    return {
      preloaded: this.preloadedAssets.size,
      queued: this.preloadQueue.length,
    };
  }
}

export const assetPreloader = new AssetPreloader();

// Pré-carregar recursos críticos ao iniciar
export function initializePreloader(): void {
  // Preconnect para domínios externos
  assetPreloader.preconnect([
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ]);

  // DNS Prefetch
  assetPreloader.dnsPrefetch([
    'https://api-football-v1.p.rapidapi.com',
    'https://cdn.jsdelivr.net',
  ]);

  // Prefetch de páginas populares
  assetPreloader.prefetchPages([
    '/live-sports',
    '/promotions',
    '/my-bets',
  ]);

  // Pré-carregar dados populares em background
  setTimeout(() => {
    assetPreloader.preloadPopularData();
  }, 2000);
}
