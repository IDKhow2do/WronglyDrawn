/**
 * [INPUT]: 使用 Node 22 WebSocket、Chrome 和构建产物目录。
 * [OUTPUT]: 提供本地静态服务与隔离的 Chrome 测试会话。
 * [POS]: 性能脚本和发版首关检查共用同一浏览器驱动。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

export function serve(dir) {
  return new Promise((res) => {
    const s = createServer(async (req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(dir, normalize(p));
      if (!f.startsWith(dir)) return rsp.writeHead(403).end();
      try {
        const b = await readFile(f);
        rsp.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(b);
      } catch {
        rsp.writeHead(404).end();
      }
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, close: () => s.close() }));
  });
}

export async function launch({ width = 1600, height = 900, uncapped = true, headless = true } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'wdperf-chrome-'));
  const onMac = process.platform === 'darwin';
  const binary = process.env.CHROME_BIN ?? (onMac
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');
  const args = [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--enable-gpu', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars',
  ];
  if (onMac) args.push('--use-angle=metal');
  if (process.platform === 'linux' && headless) {
    args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }
  if (headless) args.push('--headless=new');
  if (uncapped) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  args.push('about:blank');
  const proc = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const timeout = setTimeout(() => {
      proc.kill();
      rej(new Error('chrome did not start: ' + buf.slice(-400)));
    }, 20000);
    proc.once('error', (error) => {
      clearTimeout(timeout);
      rej(error);
    });
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timeout);
        res(m[1]);
      }
    });
  });
  const httpBase = wsUrl.replace(/^ws/, 'http').replace(/\/devtools.*/, '');
  const targets = await (await fetch(httpBase + '/json')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    pending.set(++id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expression, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 120000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await ev(`!!(${expr})`).catch(() => false)) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('timeout waiting for ' + expr);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  return { send, ev, waitFor, errors, on: (l) => listeners.push(l), close: () => { try { ws.close(); } catch {} proc.kill(); } };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

/** Start the level and run the sim until the opening cutscene has handed the camera back. */
export const START = `(async () => { await T.start(); const app = __WD.app; let n = 0;
  const cine = () => app.camera.storyCine || app.session.story?.locked || app.camera.override || document.querySelector('.hud')?.classList.contains('hidden');
  while (cine() && n++ < 90) { __WD.advance(1); await new Promise((r) => setTimeout(r, 30)); }
  __WD.advance(1); return { state: __WD.state, cineSeconds: n, cine: !!cine() }; })()`;
