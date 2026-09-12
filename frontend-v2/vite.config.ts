import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(() => {
  // Leave VITE_API_URL empty in dev to proxy through Vite (avoids CORS setup),
  // or set it to your `wrangler dev` URL (default http://localhost:8787) to hit the Worker directly.
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        // Same-origin /api in the browser → Worker in dev.
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
  };
});
