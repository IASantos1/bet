
/**
 * Service Worker Manager
 * Gerencia registro, atualização e comunicação com o Service Worker
 */

class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateCheckInterval: number | null = null;

  /**
   * Registrar Service Worker
   */
  async register(): Promise<void> {
    // Verificar se Service Worker é suportado
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Worker não suportado neste navegador');
      return;
    }

    const sw = navigator.serviceWorker;
    if (!sw) return;

    // Verificar se está em produção
    if (import.meta.env.DEV) {
      console.log('ℹ️ Service Worker desativado em modo de desenvolvimento');
      return;
    }

    // Verificar se está em HTTPS ou localhost
    const isSecureContext = window.isSecureContext || 
                           location.hostname === 'localhost' || 
                           location.hostname === '127.0.0.1';

    if (!isSecureContext) {
      console.warn('⚠️ Service Worker requer HTTPS');
      return;
    }

    try {
      // Verificar se o arquivo sw.js existe
      const swResponse = await fetch('/sw.js', { method: 'HEAD' });
      if (!swResponse.ok) {
        console.warn('⚠️ Arquivo sw.js não encontrado');
        return;
      }

      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // Sempre verificar atualizações
      });

      console.log('✅ Service Worker registrado:', this.registration.scope);

      // Verificar atualizações a cada 1 hora
      this.startUpdateCheck();

      // Listener para atualizações
      this.registration.addEventListener('updatefound', () => {
        this.handleUpdate();
      });

      // Verificar se há atualização pendente
      if (this.registration.waiting) {
        this.handleUpdate();
      }

      // Listener para erros
      sw.addEventListener('error', (error) => {
        console.error('❌ Erro no Service Worker:', error);
      });

    } catch (error) {
      // Erro silencioso - não bloquear a aplicação
      if (error instanceof Error) {
        console.warn('⚠️ Service Worker não pôde ser registrado:', error.message);
      }
    }
  }

  /**
   * Desregistrar Service Worker
   */
  async unregister(): Promise<void> {
    try {
      if (this.registration) {
        await this.registration.unregister();
        console.log('🗑️ Service Worker desregistrado');
        this.stopUpdateCheck();
      }
    } catch (error) {
      console.error('❌ Erro ao desregistrar Service Worker:', error);
    }
  }

  /**
   * Verificar atualizações manualmente
   */
  async checkForUpdates(): Promise<void> {
    try {
      if (this.registration) {
        await this.registration.update();
      }
    } catch (error) {
      console.warn('⚠️ Erro ao verificar atualizações:', error);
    }
  }

  /**
   * Limpar todos os caches
   */
  async clearCache(): Promise<void> {
    try {
      if (this.registration?.active) {
        this.registration.active.postMessage('CLEAR_CACHE');
        console.log('🗑️ Cache limpo');
      }
    } catch (error) {
      console.error('❌ Erro ao limpar cache:', error);
    }
  }

  /**
   * Ativar Service Worker atualizado imediatamente
   */
  async skipWaiting(): Promise<void> {
    try {
      if (this.registration?.waiting) {
        this.registration.waiting.postMessage('SKIP_WAITING');
      }
    } catch (error) {
      console.error('❌ Erro ao ativar Service Worker:', error);
    }
  }

  /**
   * Verificar atualizações periodicamente
   */
  private startUpdateCheck(): void {
    // Verificar a cada 1 hora
    this.updateCheckInterval = window.setInterval(() => {
      this.checkForUpdates();
    }, 60 * 60 * 1000);
  }

  /**
   * Parar verificação de atualizações
   */
  private stopUpdateCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }

  /**
   * Handler para atualizações do Service Worker
   */
  private handleUpdate(): void {
    const newWorker = this.registration?.installing;

    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      const sw = navigator.serviceWorker;
      if (newWorker.state === 'installed' && sw?.controller) {
        // Nova versão disponível
        console.log('🔄 Nova versão disponível');
        
        // Notificar utilizador (opcional)
        this.notifyUpdate();
      }
    });
  }

  /**
   * Notificar utilizador sobre atualização
   */
  private notifyUpdate(): void {
    // Pode ser integrado com sistema de notificações
    console.log('💡 Atualização disponível. Recarregue a página para atualizar.');
  }

  /**
   * Obter estatísticas de cache
   */
  async getCacheStats(): Promise<{
    caches: string[];
    totalSize: number;
  }> {
    try {
      const cacheNames = await caches.keys();
      let totalSize = 0;

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }

      return {
        caches: cacheNames,
        totalSize,
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de cache:', error);
      return {
        caches: [],
        totalSize: 0,
      };
    }
  }

  /**
   * Verificar se Service Worker está ativo
   */
  isActive(): boolean {
    return this.registration?.active !== null && this.registration?.active !== undefined;
  }

  /**
   * Obter estado do Service Worker
   */
  getState(): string {
    if (!this.registration) return 'not_registered';
    if (this.registration.installing) return 'installing';
    if (this.registration.waiting) return 'waiting';
    if (this.registration.active) return 'active';
    return 'unknown';
  }
}

export const serviceWorkerManager = new ServiceWorkerManager();
