import { defineConfig, loadEnv, type Plugin } from 'vite';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { coopApiPlugin } from './server/coopApi.ts';

/** Dev-only: POST /__shot?name=x with a PNG data URL → reference/shots/x.png (automated visual checks). */
function shotPlugin(): Plugin {
  return {
    name: 'dev-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '');
          mkdirSync('reference/shots', { recursive: true });
          writeFileSync(`reference/shots/${name}.png`, Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
          res.end('ok');
        });
      });
    },
  };
}


/** Dev-only: asset-review.html backend. GET /__review → {files, state}; POST /__review → docs/asset-review.json. */
function reviewPlugin(): Plugin {
  const walk = (dir: string, out: { path: string; size: number }[] = []) => {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('.')) continue;
      const full = `${dir}/${f}`;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else out.push({ path: full.replace(/^public\//, ''), size: st.size });
    }
    return out;
  };
  return {
    name: 'dev-asset-review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__review', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            mkdirSync('docs', { recursive: true });
            writeFileSync('docs/asset-review.json', body);
            res.end('ok');
          });
          return;
        }
        const state = existsSync('docs/asset-review.json') ? JSON.parse(readFileSync('docs/asset-review.json', 'utf8')) : {};
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ files: walk('public'), state }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // AI co-op partner's LLM (POST /api/coop, see docs/AI_AGENT.md): DEEPSEEK_API_KEY / COOP_* come from
  // the shell or .env.local and stay on the server (no VITE_ prefix → never in the client bundle).
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [shotPlugin(), reviewPlugin(), coopApiPlugin(env)],
    server: { port: 5188, strictPort: false, watch: { ignored: ['**/reference/**'] } },
    build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  };
});
