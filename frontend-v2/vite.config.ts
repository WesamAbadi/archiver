import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * SPA deep-link fallback.
 *
 * Cloudflare Pages serves `200.html` for any request that doesn't match a
 * static asset, which is exactly SPA catch-all behaviour.
 *
 * The classic alternative — a `_redirects` rule of `/* /index.html 200` — is now
 * REJECTED by Pages: it strips `.html` from URLs, so `/index.html` becomes
 * `/index`, matches `/*` again, and Pages rejects the rule as an infinite loop
 * (code 100324). Worse, the rejection failed the whole deploy, so a hard refresh
 * on any route would have 404'd. Using 200.html avoids the loop entirely.
 */
function spaFallback(): Plugin {
  return {
    name: 'archivedrop-spa-fallback',
    apply: 'build',
    // closeBundle runs after Vite has written dist/, so index.html is final.
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const index = join(dist, 'index.html');
      if (existsSync(index)) copyFileSync(index, join(dist, '200.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Same-origin /api in dev → the Worker, so local dev needs no CORS setup.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
