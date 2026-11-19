/**
 * [INPUT]: vite (the game's own dev dependency), three from the repository's node_modules, ./src/buddy.js
 * [OUTPUT]: `npx vite build --config landing/vite.buddy.config.mjs` writes landing/buddy.js: the page companion and
 *           the parts of three it uses, one minified ES module. The built file is committed, so the site itself
 *           still has no build step.
 * [POS]: landing/. Run it after changing src/buddy.js.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { defineConfig } from 'vite';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here, publicDir: false, logLevel: 'warn',
  build: { outDir: here, emptyOutDir: false, target: 'es2020', minify: true, copyPublicDir: false,
    lib: { entry: path.join(here, 'src/buddy.js'), formats: ['es'], fileName: () => 'buddy.js' } },
});
