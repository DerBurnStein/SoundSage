// SoundSage — Vitest configuration
// Lightweight unit-test setup for pure-function modules (lib/mood,
// lib/history-window, etc.). E2E lives under tests/e2e and runs through
// Playwright separately.

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // Keep e2e out of the unit run — Playwright runs that suite.
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    globals: false,
  },
});
