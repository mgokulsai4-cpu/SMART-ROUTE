import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
const backendTarget = 'http://localhost:8000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    https: true,
    proxy: {
      '/auth': { target: backendTarget, changeOrigin: true },
      '/users': { target: backendTarget, changeOrigin: true },
      '/food-items': { target: backendTarget, changeOrigin: true },
      '/orders': { target: backendTarget, changeOrigin: true },
      '/delivery': { target: backendTarget, changeOrigin: true },
      '/routing': { target: backendTarget, changeOrigin: true },
      '/qr': { target: backendTarget, changeOrigin: true },
      '/safety': { target: backendTarget, changeOrigin: true },
      '/admin': { target: backendTarget, changeOrigin: true },
      '/restaurants': { target: backendTarget, changeOrigin: true },
      '/socket.io': { target: backendTarget, changeOrigin: true, ws: true },
    },
  },
});
