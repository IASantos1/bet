import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { serviceWorkerManager } from './services/serviceWorkerManager';
import { initializePreloader } from './services/assetPreloader';
import { initializeLazyLoading } from './services/lazyLoadManager';
import { performanceMonitor } from './services/performanceMonitor';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const schedule = (cb: () => void) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(cb);
  } else {
    setTimeout(cb, 0);
  }
};

if (import.meta.env.PROD) {
  schedule(() => {
    serviceWorkerManager.register().catch((error) => {
      console.error('❌ Erro ao registrar Service Worker:', error);
    });
  });
}

schedule(() => {
  initializePreloader();
  initializeLazyLoading();
  performanceMonitor.initialize();

  setTimeout(() => {
    const score = performanceMonitor.getPerformanceScore();
    if (score < 80 && import.meta.env.PROD) {
      const recommendations = performanceMonitor.getRecommendations();
      console.warn('⚠️ Recomendações de otimização:', recommendations);
    }
  }, 5000);
});
