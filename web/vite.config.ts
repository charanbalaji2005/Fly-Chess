import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Python simulation service runs separately (uvicorn on :8000). Proxying
// /api through Vite keeps the frontend origin-agnostic in development and
// avoids CORS preflights on every poll.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
