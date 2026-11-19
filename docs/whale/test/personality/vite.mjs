// No-HMR Vite for the partner-personality checks: port 5296, no /api/coop proxy (no server key, no real LLM).
export default { root: '<local-path>', cacheDir: '/tmp/wd-brag/vite-cache', server: { port: 5296, strictPort: true, hmr: false, watch: { ignored: ['**/docs/**', '**/reference/**'] } }, build: { target: 'es2022' } };
