import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __FLAVOR__: '"production"', __ENGINE__: '"v3"', __AUTO_SUBMIT__: 'true', __API_ORIGIN__: '"https://api.plato.test"', __WEB_ORIGIN__: '"https://app.plato.test"', __BUILD__: '"test"' },
  test: { include: ['test/**/*.spec.ts'], exclude: ['test/runtime/**'], setupFiles: ['test/setup.ts'] },
});
