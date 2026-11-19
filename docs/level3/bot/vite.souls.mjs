// No-HMR Vite for the souls-fight bots (port 5251: apart from the author's 5188 and the other bots' ports).
export default { root: '<local-path>', server: { port: 5251, strictPort: true, hmr: false }, build: { target: 'es2022' } };
