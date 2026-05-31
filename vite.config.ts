import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    define: {
      __BASE_PATH__: JSON.stringify('/'),
      __IS_PREVIEW__: JSON.stringify(false),
      __READDY_PROJECT_ID__: JSON.stringify(''),
      __READDY_VERSION_ID__: JSON.stringify(''),
      __READDY_AI_DOMAIN__: JSON.stringify(''),
    },
    envPrefix: ['VITE_'],
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api/live/ws': {
          target: 'ws://127.0.0.1:3000',
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
