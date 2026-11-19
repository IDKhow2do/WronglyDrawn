// No-HMR Vite for the round-3 difficulty checks (docs/difficulty/NOTES.md): port 5295, apart from 5188 and other bots.
export default { root: '<local-path>', server: { port: 5295, strictPort: true, hmr: false }, build: { target: 'es2022' } };
