import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { transformSync } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Apply esbuild's CJS-to-ESM transform to our project-level CJS file
// (i18n.cjs) in the dev server. build.commonjsOptions below handles the
// production build; this plugin covers the dev path where the Rollup
// CJS plugin doesn't run.
const cjsToEsm = {
  name: 'cjs-to-esm',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('.cjs')) {
      const r = transformSync(code, { format: 'esm', target: 'es2020', sourcefile: id });
      return { code: r.code, map: r.map };
    }
  },
};

export default defineConfig({
  plugins: [react(), cjsToEsm],
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true,
    commonjsOptions: {
      // i18n.cjs is shared with the Node backend as CommonJS, but the
      // frontend imports it from src/i18n/index.js. Tell Rollup's CJS
      // plugin to also process our source-level CJS file, not just deps.
      include: [/i18n\.cjs$/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:2121',
      '/resources': 'http://localhost:2121',
      '/ws': {
        target: 'ws://localhost:2121',
        ws: true,
      },
    },
  },
});
