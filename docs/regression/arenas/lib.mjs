// CDP helpers for the arena / early-hit checks: Chrome :9401 (chrome.sh), Vite :5301 (vite.mjs). docs/regression/ARENAS.md
import fs from 'node:fs';
export const PORT = process.env.WD_VITE || 5301;
export async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${process.env.WD_CDP ?? 9401}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (code) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); const dir = process.env.WD_SHOTS ?? '/tmp/wd-arena/shots'; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/${name}.jpg`, Buffer.from(r.result.data, 'base64')); return `${dir}/${name}.jpg`; };
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const st = () => ev('return window.__WD?.state').catch(() => null);
  /** Load a level on a difficulty and wait for PLAYING with the HUD up. */
  const load = async (level, diff = 'normal', lang = '') => {
    await send('Page.navigate', { url: `http://localhost:${PORT}/?test&difficulty=${diff}&level=${level}&style=graffiti${lang ? `&lang=${lang}` : ''}` });
    for (let i = 0; i < 160 && (await st()) !== 'TITLE'; i++) await sleep(500);
    await ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
    for (let i = 0; i < 100 && (await st()) !== 'PLAYING'; i++) await sleep(500);
    for (let i = 0; i < 160 && (await ev("return document.querySelector('.hud')?.classList.contains('hidden')")); i++) await sleep(500);
    await ev(`window.__r={toasts:[]}; __WD.session.events.on('toast', (e)=>window.__r.toasts.push(e.text)); return 1`);
  };
  const adv = (sec) => ev(`__WD.advance(${sec}); return 1`);
  return { ws, send, ev, shot, load, adv };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
