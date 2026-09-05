import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-only: serve any .imscc/.zip sitting in the project root at /__dev/<filename>
 * so the app can be tested with a real export via ?load=/__dev/<filename>.
 * Never part of the production build.
 */
function devSamplePlugin(): Plugin {
  return {
    name: 'dev-sample-cartridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url === '/__dev/list') {
          const files = readdirSync(process.cwd()).filter((f) => /\.(imscc|zip)$/i.test(f));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }
        if (!url.startsWith('/__dev/')) return next();
        const name = decodeURIComponent(url.slice('/__dev/'.length).split('?')[0]);
        if (name.includes('/') || name.includes('..')) return next();
        const path = join(process.cwd(), name);
        if (!existsSync(path)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(statSync(path).size));
        createReadStream(path).pipe(res);
      });
    },
  };
}

/**
 * One build, one artifact. docs/index.html is fully self-contained — code,
 * styles, fonts and icons are inlined — so the same file works hosted on any
 * static server AND opened from disk via file:// (DESIGN.md §2). base './'
 * keeps every remaining reference relative.
 */
export default defineConfig({
  base: './',
  plugins: [react(), devSamplePlugin(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'docs', // committed and served by GitHub Pages (Settings → Pages → main, /docs)
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 100 * 1024 * 1024, // inline every asset (fonts, icons, images) as data: URIs
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
