// CDP helpers for the level-2 expansion bots (headless Chrome on :9353, Vite on :5199; WD_CDP / WD_VITE / WD_SHOTS override).
import fs from 'node:fs';
export const VITE = `http://localhost:${process.env.WD_VITE ?? 5199}`;
export async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${process.env.WD_CDP ?? 9353}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method) for (const l of listeners) l(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (code) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); const dir = process.env.WD_SHOTS ?? '/tmp/wd-l2x/shots'; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/${name}.jpg`, Buffer.from(r.result.data, 'base64')); return name; };
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return { ws, send, ev, shot, listeners };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
