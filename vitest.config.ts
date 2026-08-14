import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// The `@/` alias mirrors tsconfig paths, so tests the factory writes can import
// the same way the app does.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
