/**
 * Performance Monitor
 * Monitoriza métricas de performance e otimizações
 */

interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
  
  // Métricas customizadas
  cacheHitRate?: number;
  apiResponseTime?: number;
  componentLoadTime?: number;
  
  // Recursos
  totalResources?: number;
  cachedResources?: number;
  resourceSize?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private observers: PerformanceObserver[] = [];

  /**
   * Inicializar monitorização
   */
  initialize(): void {
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeFCP();
    this.observeTTFB();
    this.observeResources();
  }

  /**
   * Observar Largest Contentful Paint
   */
  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        this.metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
        console.log('📊 LCP:', this.metrics.lcp, 'ms');
      });
      
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ LCP não suportado');
    }
  }

  /**
   * Observar First Input Delay
   */
  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          this.metrics.fid = entry.processingStart - entry.startTime;
          console.log('📊 FID:', this.metrics.fid, 'ms');
        });
      });
      
      observer.observe({ entryTypes: ['first-input'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ FID não suportado');
    }
  }

  /**
   * Observar Cumulative Layout Shift
   */
  private observeCLS(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            this.metrics.cls = clsValue;
          }
        });
        console.log('📊 CLS:', this.metrics.cls);
      });
      
      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ CLS não suportado');
    }
  }

  /**
   * Observar First Contentful Paint
   */
  private observeFCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = entry.startTime;
            console.log('📊 FCP:', this.metrics.fcp, 'ms');
          }
        });
      });
      
      observer.observe({ entryTypes: ['paint'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ FCP não suportado');
    }
  }

  /**
   * Observar Time to First Byte
   */
  private observeTTFB(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          this.metrics.ttfb = entry.responseStart - entry.requestStart;
          console.log('📊 TTFB:', this.metrics.ttfb, 'ms');
        });
      });
      
      observer.observe({ entryTypes: ['navigation'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ TTFB não suportado');
    }
  }

  /**
   * Observar recursos carregados
   */
  private observeResources(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        let totalSize = 0;
        let cachedCount = 0;
        
        entries.forEach((entry: any) => {
          totalSize += entry.transferSize || 0;
          
          // Verificar se veio do cache
          if (entry.transferSize === 0 && entry.decodedBodySize > 0) {
            cachedCount++;
          }
        });
        
        this.metrics.totalResources = entries.length;
        this.metrics.cachedResources = cachedCount;
        this.metrics.resourceSize = totalSize;
        
        console.log('📊 Recursos:', {
          total: entries.length,
          cached: cachedCount,
          size: `${(totalSize / 1024).toFixed(2)} KB`,
        });
      });
      
      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch {
      console.warn('⚠️ Resource Timing não suportado');
    }
  }

  /**
   * Medir tempo de carregamento de componente
   */
  measureComponentLoad(componentName: string, startTime: number): void {
    const loadTime = performance.now() - startTime;
    console.log(`📊 ${componentName} carregado em ${loadTime.toFixed(2)}ms`);
  }

  /**
   * Medir tempo de resposta de API
   */
  measureApiResponse(endpoint: string, startTime: number): void {
    const responseTime = performance.now() - startTime;
    console.log(`📊 API ${endpoint} respondeu em ${responseTime.toFixed(2)}ms`);
  }

  /**
   * Obter todas as métricas
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Obter score de performance (0-100)
   */
  getPerformanceScore(): number {
    let score = 100;
    
    // Penalizar LCP > 2.5s
    if (this.metrics.lcp && this.metrics.lcp > 2500) {
      score -= 20;
    }
    
    // Penalizar FID > 100ms
    if (this.metrics.fid && this.metrics.fid > 100) {
      score -= 20;
    }
    
    // Penalizar CLS > 0.1
    if (this.metrics.cls && this.metrics.cls > 0.1) {
      score -= 20;
    }
    
    // Penalizar FCP > 1.8s
    if (this.metrics.fcp && this.metrics.fcp > 1800) {
      score -= 20;
    }
    
    // Penalizar TTFB > 600ms
    if (this.metrics.ttfb && this.metrics.ttfb > 600) {
      score -= 20;
    }
    
    return Math.max(0, score);
  }

  /**
   * Obter recomendações de otimização
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.metrics.lcp && this.metrics.lcp > 2500) {
      recommendations.push('Otimizar imagens e recursos críticos (LCP alto)');
    }
    
    if (this.metrics.fid && this.metrics.fid > 100) {
      recommendations.push('Reduzir JavaScript bloqueante (FID alto)');
    }
    
    if (this.metrics.cls && this.metrics.cls > 0.1) {
      recommendations.push('Definir dimensões de imagens e evitar shifts (CLS alto)');
    }
    
    if (this.metrics.fcp && this.metrics.fcp > 1800) {
      recommendations.push('Otimizar CSS crítico e fontes (FCP alto)');
    }
    
    if (this.metrics.ttfb && this.metrics.ttfb > 600) {
      recommendations.push('Otimizar servidor e usar CDN (TTFB alto)');
    }
    
    if (this.metrics.cachedResources && this.metrics.totalResources) {
      const cacheRate = (this.metrics.cachedResources / this.metrics.totalResources) * 100;
      if (cacheRate < 50) {
        recommendations.push('Melhorar estratégia de cache (taxa de cache baixa)');
      }
    }
    
    return recommendations;
  }

  /**
   * Limpar observers
   */
  disconnect(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  /**
   * Exportar relatório de performance
   */
  exportReport(): string {
    const score = this.getPerformanceScore();
    const recommendations = this.getRecommendations();
    
    return `
=== RELATÓRIO DE PERFORMANCE ===

Score: ${score}/100

Core Web Vitals:
- LCP: ${this.metrics.lcp?.toFixed(2) || 'N/A'} ms
- FID: ${this.metrics.fid?.toFixed(2) || 'N/A'} ms
- CLS: ${this.metrics.cls?.toFixed(4) || 'N/A'}
- FCP: ${this.metrics.fcp?.toFixed(2) || 'N/A'} ms
- TTFB: ${this.metrics.ttfb?.toFixed(2) || 'N/A'} ms

Recursos:
- Total: ${this.metrics.totalResources || 0}
- Em cache: ${this.metrics.cachedResources || 0}
- Tamanho: ${((this.metrics.resourceSize || 0) / 1024).toFixed(2)} KB

Recomendações:
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
    `.trim();
  }
}

export const performanceMonitor = new PerformanceMonitor();
