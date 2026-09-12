/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API ORIGIN only — no trailing slash, no `/api` suffix ("" = same-origin). */
  readonly VITE_API_URL: string
  /** Legacy socket.io dev flag (Socket.IO is removed in Phase 4). */
  readonly VITE_IS_DEV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 