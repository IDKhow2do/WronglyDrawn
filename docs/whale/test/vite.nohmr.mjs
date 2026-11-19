// A private dev server for tests: no HMR (other sessions' edits must not reload the page mid-test), own port,
// with the AI-partner proxy (/api/coop). usage: WD_PORT=5193 npx vite --config docs/whale/test/vite.nohmr.mjs
// The proxy's settings come from the environment / .env.local exactly like the normal dev server (loadEnv);
// to aim it at the local mock instead: COOP_BASE_URL=http://127.0.0.1:9345 COOP_API_KEY=sk-MOCK-not-a-real-key
import { loadEnv } from 'vite';
import { coopApiPlugin } from '../../../server/coopApi.ts';
const root = new URL('../../..', import.meta.url).pathname;
const port = Number(process.env.WD_PORT) || 5193;
export default ({ mode }) => ({
  root,
  cacheDir: `/tmp/whale-t/vite-cache-${port}`,
  plugins: [coopApiPlugin(loadEnv(mode, root, ''))],
  server: { port, strictPort: true, hmr: false, watch: { ignored: ['**/reference/**', '**/docs/**'] } },
  build: { target: 'es2022' },
});
