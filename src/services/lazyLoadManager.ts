/**
 * Lazy Loading Manager
 * Gerencia carregamento preguiçoso de componentes e recursos pesados
 */

import { lazy, ComponentType } from 'react';

interface LazyLoadConfig {
  delay?: number;
  fallback?: ComponentType;
  preload?: boolean;
}

class LazyLoadManager {
  private loadedComponents: Map<string, ComponentType<any>> = new Map();
  private preloadQueue: Set<string> = new Set();

  /**
   * Carregar componente de forma preguiçosa com retry
   */
  lazyLoad<T extends ComponentType<any>>(
    importFn: () => Promise<{ default: T }>,
    config: LazyLoadConfig = {}
  ): ComponentType<any> {
    const { delay = 0, preload = false } = config;

    const LazyComponent = lazy(async () => {
      // Delay opcional para evitar flash de loading
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        return await importFn();
      } catch (error) {
        console.error('❌ Erro ao carregar componente:', error);
        
        // Retry após 1 segundo
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return await importFn();
      }
    });

    // Pré-carregar se configurado
    if (preload) {
      this.preloadComponent(importFn);
    }

    return LazyComponent;
  }

  /**
   * Pré-carregar componente em background
   */
  async preloadComponent(
    importFn: () => Promise<{ default: ComponentType<any> }>
  ): Promise<void> {
    try {
      await importFn();
      console.log('✅ Componente pré-carregado');
    } catch (error) {
      console.warn('⚠️ Falha ao pré-carregar componente:', error);
    }
  }

  /**
   * Pré-carregar múltiplos componentes
   */
  async preloadMultiple(
    importFns: Array<() => Promise<{ default: ComponentType<any> }>>
  ): Promise<void> {
    const promises = importFns.map((fn) => this.preloadComponent(fn));
    await Promise.allSettled(promises);
  }

  /**
   * Lazy load de imagem com Intersection Observer
   */
  lazyLoadImage(img: HTMLImageElement, src: string): void {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              img.src = src;
              img.classList.add('loaded');
              observer.unobserve(img);
            }
          });
        },
        {
          rootMargin: '50px', // Carregar 50px antes de entrar na viewport
        }
      );

      observer.observe(img);
    } else {
      // Fallback para navegadores sem suporte
      img.src = src;
    }
  }

  /**
   * Lazy load de múltiplas imagens
   */
  lazyLoadImages(selector: string = 'img[data-src]'): void {
    const images = document.querySelectorAll<HTMLImageElement>(selector);
    
    images.forEach((img) => {
      const src = img.dataset.src;
      if (src) {
        this.lazyLoadImage(img, src);
      }
    });
  }

  /**
   * Carregar script externo de forma preguiçosa
   */
  async lazyLoadScript(src: string, async: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      // Verificar se já foi carregado
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = async;
      
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar script: ${src}`));
      
      document.body.appendChild(script);
    });
  }

  /**
   * Carregar CSS de forma preguiçosa
   */
  async lazyLoadCSS(href: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Verificar se já foi carregado
      const existing = document.querySelector(`link[href="${href}"]`);
      if (existing) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Falha ao carregar CSS: ${href}`));
      
      document.head.appendChild(link);
    });
  }

  /**
   * Limpar cache de componentes
   */
  clear(): void {
    this.loadedComponents.clear();
    this.preloadQueue.clear();
  }

  /**
   * Obter estatísticas
   */
  getStats(): {
    loaded: number;
    queued: number;
  } {
    return {
      loaded: this.loadedComponents.size,
      queued: this.preloadQueue.size,
    };
  }
}

export const lazyLoadManager = new LazyLoadManager();

// Hook para lazy loading de imagens
export function useLazyImage(src: string): {
  imgRef: (node: HTMLImageElement | null) => void;
  isLoaded: boolean;
} {
  const [isLoaded, setIsLoaded] = React.useState(false);

  const imgRef = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node) {
        lazyLoadManager.lazyLoadImage(node, src);
        node.addEventListener('load', () => setIsLoaded(true));
      }
    },
    [src]
  );

  return { imgRef, isLoaded };
}

// Inicializar lazy loading de imagens ao carregar página
export function initializeLazyLoading(): void {
  // Lazy load de imagens existentes
  lazyLoadManager.lazyLoadImages();

  // Observer para novas imagens adicionadas dinamicamente
  const observer = new MutationObserver(() => {
    lazyLoadManager.lazyLoadImages();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

import React from 'react';
