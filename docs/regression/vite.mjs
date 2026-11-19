// No-HMR Vite for the regression runs (docs/REGRESSION.md): port 5271, apart from the author's 5188 and the other bots' ports.
export default { root: '<local-path>', server: { port: 5271, strictPort: true, hmr: false }, build: { target: 'es2022' } };
