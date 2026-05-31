function normalizeOrigin(value: string | undefined, fallback: string): string {
  const raw = String(value || '').trim();
  const base = raw ? raw : fallback;
  return base.replace(/\/+$/, '');
}

const env =
  (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const origin = normalizeOrigin(
  env.RAILWAY_ORIGIN || env.BACKEND_ORIGIN || env.API_ORIGIN,
  'https://bet62aposta-production.up.railway.app',
);

export const config = {
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/events/by-sport', destination: `${origin}/api/events/by-sport` },
    { source: '/api/events/(.*)', destination: `${origin}/api/events/$1` },
    { source: '/api/events', destination: `${origin}/api/events` },
    { source: '/api/(.*)', destination: `${origin}/api/$1` },
    { source: '/(.*)', destination: '/index.html' },
  ],
};
