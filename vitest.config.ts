/**
 * Test config. Vitest reads `vitest.config.*` before `vite.config.*`, so this
 * file extends the shared Vite config (plugins, jsdom, timeout) with the one
 * thing it is missing: the `.tsx` UI suites (test/ui/app, arrange, choose,
 * download, hook, upload). The base `test.include` is `.ts`-only, which made
 * `npm test` skip those six files. mergeConfig concatenates arrays, so both
 * lists apply. Fold these globs into vite.config.ts and delete this file
 * whenever that config is next edited.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['test/**/*.test.tsx', 'src/**/*.test.tsx'],
    },
  }),
);
