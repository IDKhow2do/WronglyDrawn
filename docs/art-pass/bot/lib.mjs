// CDP helpers for the art-pass bots (headless Chrome on :9517, Vite on :5241; WD_CDP / WD_VITE / WD_SHOTS override).
import fs from 'node:fs';
export const VITE = `http://localhost:${process.env.WD_VITE ?? 5241}`;
export async function connect() {
  const url = `http://127.0.0.1:${process.env.WD_CDP ?? 9517}/json`;
  let list = await fetch(url).then((r) => r.json()).catch(() => null);
  if (!list) {
    // someone else's cleanup killed our headless Chrome: start it again (the page has to be prepped again)
    const { spawn } = await import('node:child_process');
    spawn('/tmp/wd-art/chrome.sh', [], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !list; i++) { await new Promise((r) => setTimeout(r, 250)); list = await fetch(url).then((r) => r.json()).catch(() => null); }
    console.error('[art] Chrome restarted'); globalThis.__artRestarted = true;
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method) for (const l of listeners) l(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (code) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); const dir = process.env.WD_SHOTS ?? '/tmp/wd-art/shots'; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/${name}.jpg`, Buffer.from(r.result.data, 'base64')); return name; };
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return { ws, send, ev, shot, listeners };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
