import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production nginx proxies /api to the backend (design §7.2); this mirrors that
// for `vite dev` so the same relative URLs work in both environments.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
