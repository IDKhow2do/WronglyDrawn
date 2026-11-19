// No-HMR Vite for the arena / early-hit checks (docs/regression/ARENAS.md): port 5301, apart from the author's 5188.
export default { root: '<local-path>', server: { port: 5301, strictPort: true, hmr: false }, build: { target: 'es2022' } };
