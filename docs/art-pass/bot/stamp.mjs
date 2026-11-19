// TAG stamp shots (docs/art-pass/STAMP.md). Own headless Chrome (CDP 9577) and Vite (5277 after, 5278 before).
// Usage:
//   node stamp.mjs prep <plaza|harbor|works> [vitePort]   load a level fresh (gentle, medium quality), stop the rAF loop
//   node stamp.mjs list                                    TAG-able creatures: id kind bigness
//   node stamp.mjs tag <name> <enemyId> [tag|gold|encore|perfect|frenzy] [times]   stage a TAG (+ one ENCORE stamp),
//        advance deterministically (__WD.advance) and screenshot at each time (s after the press); WD_SHOTS = folder
//   node stamp.mjs js "<code>"
import fs from 'node:fs';
const CDP = process.env.WD_CDP ?? 9577;
const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (code) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
const dir = process.env.WD_SHOTS ?? '/tmp/wd-stamp/shots';
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/${name}.jpg`, Buffer.from(r.result.data, 'base64')); return name; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const T3 = "const T3 = await import('/node_modules/.vite/deps/three.js');";
const [cmd, a, b, c, d] = process.argv.slice(2);

// the mark left: a close camera in front of the print (along the die's axis, a little off to the side)
async function markShot(name, back = 2.2) {
  await ev(`${T3} const s=__WD.session; const fx=s.combat.stampFx; const m=fx.ink.marks.at(-1); if(!m) return 0;
    const c=m.local.clone(); if (m.anchor!==fx.ink.mesh) c.applyMatrix4(m.anchor.matrixWorld);
    const n=fx.normal.clone(); const cam=c.clone().addScaledVector(n, ${back}+fx.size*0.8).add(new T3.Vector3(0.5,0.3,0));
    s.ctx.camera.playCine([{pos:cam, look:c, dur:30, fov:50}]); __WD.advance(0.05); for (const k of s.ctx.effects.comics) k.sprite.visible=false; __WD.advance(1/60); return 1`);
  console.log(await shot(name));
  await ev('__WD.session.ctx.camera.stopCine(); return 1');
}


if (cmd === 'prep') {
  const st = () => ev('return window.__WD?.state').catch(() => null);
  await send('Page.navigate', { url: `http://localhost:${b ?? 5277}/?test&difficulty=gentle&level=${a}` });
  for (let i = 0; i < 160 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 160 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 160 && await ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await sleep(1500);
  await ev('__WD.app.loop.stop(); return 1');
  console.log('ready', await st());
} else if (cmd === 'list') {
  console.log(await ev(`const s=__WD.session; return s.enemies.filter(e=>!e.disposed&&!e.harmless).map(e=>[e.id,e.kind,+e.bigness.toFixed(2),e.baseHp, e.pos.toArray().map(v=>+v.toFixed(1)).join(',')].join(' ')).join('\\n')`));
} else if (cmd === 'tag') {
  const mode = c ?? 'tag';
  const times = (d ?? '0.25,0.45,0.56,0.62,0.75,1.0').split(',').map(Number);
  const enc = mode === 'encore' || mode === 'perfect' || mode === 'frenzy';
  await ev(`${T3} const s=__WD.session; const e=s.enemies.find(x=>x.id==='${b}'); if(!e) throw new Error('no enemy ${b}');
    const R=(await import('/src/meta/Progression.ts')).REWARDS; R.encore=${mode !== 'tag'};
    for (const el of document.querySelectorAll('.toast, .toasts, .objective')) el.style.opacity='0';
    // WAI stands in front of the creature (its facing), a little off-axis
    const f=new T3.Vector3(Math.sin(e.root.rotation.y),0,Math.cos(e.root.rotation.y));
    const p=e.pos.clone().addScaledVector(f, 2.2+e.bigness*1.6); p.y=e.pos.y+0.2;
    s.player.teleport(p, Math.atan2(e.pos.x-p.x, e.pos.z-p.z)); s.ctx.camera.yaw=Math.atan2(p.x-e.pos.x, p.z-e.pos.z); s.ctx.camera.pitch=0.25;
    e.alerted=false; __WD.advance(0.3); s.combat.frenzyReady=${mode === 'frenzy'};
    e.hp=e.maxHp; window.__tagE=e; s.combat.tag(e); return 1`);
  let at = 0;
  const step = async (to) => { if (to > at) await ev(`__WD.advance(${(to - at).toFixed(4)}); return 1`); at = to; };
  if (!enc) {
    for (const t of times) { await step(t); console.log(await shot(`${a}-${t.toFixed(2)}`)); }
  } else {
    // the TAG lands; then one ENCORE stamp (forced to stick), PERFECT = pressed in the gold zone
    await step(1.25);
    await ev(`const s=__WD.session; const C=(await import('/src/combat/CombatDirector.ts')).ENCORE; if(!s.combat.encore){ const e=window.__tagE; e.hp=e.maxHp; e.holdStagger(3); s.combat.openEncore(e, e.hp); } const en=s.combat.encore; if(!en) throw new Error('no encore');
      en.window = C.window * ${mode === 'perfect' ? '(C.sweet[0]+C.sweet[1])/2' : '0.95'}; window.__rnd=Math.random; Math.random=()=>0.01; s.combat.beginStamp(); return 1`);
    const base = at;
    for (const t of times) {
      await step(base + t);
      if (t >= 0.4) await ev('Math.random=window.__rnd; return 1');
      console.log(await shot(`${a}-${t.toFixed(2)}`));
    }
  }
  if (process.env.MARK !== '0') await markShot(`${a}-mark`);
} else if (cmd === 'pen') {
  // the Red Pen's TAG on the Limp Works roof (prep works first): SoulsCamera frames its own two shots
  const times = (b ?? '0.3,0.5,0.56,0.62,0.75,1.0').split(',').map(Number);
  await ev(`${T3} const s=__WD.session; s.debugWarp('boss'); __WD.advance(3); const pen=s.enemies.find(e=>e.kind==='redpen'); if(!pen) throw new Error('no pen');
    pen.awake=true; __WD.advance(2); const pv=(pen.penBody?.pose?.pivot ?? pen.pos).clone();
    s.player.teleport(pv.clone().add(new T3.Vector3(1.6, 0, 1.6)).setY((pen.floorY ?? pen.pos.y) + 0.05)); __WD.advance(0.2);
    pen.hp=pen.maxHp; window.__tagE=pen; s.combat.tag(pen); return 1`);
  let at = 0;
  for (const t of times) { await ev(`__WD.advance(${(t - at).toFixed(4)}); return 1`); at = t; console.log(await shot(`${a}-${t.toFixed(2)}`)); }
} else if (cmd === 'mark') {
  await markShot(a, +(b ?? 2.2));
} else if (cmd === 'shot') {
  await ev('__WD.advance(1/60); return 1');
  console.log(await shot(a));
} else if (cmd === 'js') {
  console.log(JSON.stringify(await ev(a)));
}
process.exit(0);
