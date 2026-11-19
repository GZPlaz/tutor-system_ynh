/**
 * VITE_BASE_PATH must match the URL path the app is installed at (the YunoHost installer sets it):
 *   installed at https://app.mindaccel.org/        → VITE_BASE_PATH=/
 *   installed at https://mindaccel.org/tutoring/   → VITE_BASE_PATH=/tutoring/
 * In dev, /api is proxied to the local API on :3105.
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { [`${base.replace(/\/$/, '')}/api`]: { target: 'http://127.0.0.1:3105', rewrite: (p) => p.replace(base.replace(/\/$/, ''), '') } },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
