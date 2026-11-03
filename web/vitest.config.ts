import { defineConfig } from 'vitest/config';

// The island's logic lives in src/lib as plain functions, tested here without a browser.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
