import { defineConfig } from 'vitest/config';

// Fast tests that need no database: pure logic and screens (npm run test:unit).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx', 'tests/web/**/*.test.ts', 'tests/web/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
