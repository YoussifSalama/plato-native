/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // unit tests only: e2e/ is the Playwright smoke test (npm run test:e2e)
  test: { exclude: ['e2e/**', 'node_modules/**'] },
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly admin cookies just work. SPA routes never start with /admin.
    proxy: { '/admin': process.env.API_PROXY ?? 'http://localhost:3000' },
  },
});
