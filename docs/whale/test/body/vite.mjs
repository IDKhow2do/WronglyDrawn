// No-HMR Vite for the partner-body checks (docs/whale/BODY.md): port 5298, no /api/coop proxy (no key, no real LLM).
export default { root: '<local-path>', cacheDir: '/tmp/wd-body/vite-cache', server: { port: 5298, strictPort: true, hmr: false, watch: { ignored: ['**/docs/**', '**/reference/**'] } }, build: { target: 'es2022' } };
