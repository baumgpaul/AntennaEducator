import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Same origin as the mocked projects API (test/mocks/handlers.ts): msw 3 enforces
    // CORS on intercepted requests. In production the API is same-origin too (CloudFront).
    environmentOptions: { jsdom: { url: 'http://localhost:8010' } },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    pool: 'forks',
    // Limit concurrency to avoid OOM on CI containers (2 vCPUs / 4 GB).
    // (Vitest 4+ replaced poolOptions.forks.maxForks with maxWorkers.)
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
