// Purpose: configure React compilation and same-origin API proxying for local development.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Configure Vite for React and forward local API requests to the ईMAIL backend. */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.ईMAIL_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
