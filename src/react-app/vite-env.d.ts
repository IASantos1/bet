/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_LIVE_BACKEND_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
