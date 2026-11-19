// Art-pass driver. Usage:
//   node art.mjs prep <plaza|harbor|works>          load a level fresh (gentle, medium quality)
//   node art.mjs warp <stage>                        session.debugWarp(stage)
//   node art.mjs cam <name> px,py,pz lx,ly,lz [fov]   hold a cine camera there and screenshot (HUD hidden)
//   node art.mjs view <name> x,y,z yaw [pitch]        teleport WAI, gameplay camera, screenshot
//   node art.mjs js "<code>"                         evaluate, print the result
//   node art.mjs shot <name>                         plain screenshot
import { connect, sleep, VITE } from './lib.mjs';
const c = await connect();
const [cmd, a, b, d, e, f] = process.argv.slice(2);
const T3 = "const T3 = await import('/node_modules/.vite/deps/three.js');";
const hud = (on) => c.ev(`for (const el of document.querySelectorAll('.hud, .toast, .toasts, .objective')) el.style.opacity='${on ? '' : '0'}'; return 1`);
const prep = async (level) => {
  const st = () => c.ev('return window.__WD?.state').catch(() => null);
  await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 120 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  console.log('ready', await st());
};
// our Chrome was restarted under us: load the level again first (WD_LEVEL, and WD_WARP if any)
if (globalThis.__artRestarted && cmd !== 'prep' && process.env.WD_LEVEL) {
  await prep(process.env.WD_LEVEL);
  if (process.env.WD_WARP) { await c.ev(`__WD.app.session.debugWarp('${process.env.WD_WARP}'); return 1`); await sleep(2500); }
}
if (cmd === 'prep') {
  await prep(a);
} else if (cmd === 'warp') {
  await c.ev(`__WD.app.session.debugWarp('${a}'); return 1`); await sleep(+(b ?? 2500)); console.log('warped', a);
} else if (cmd === 'cam') {
  await hud(false);
  await c.ev(`${T3} __WD.app.session.ctx.camera.playCine([{pos:new T3.Vector3(${b}), look:new T3.Vector3(${d}), dur:600, fov:${e ?? 55}}]); return 1`);
  await sleep(+(f ?? 1800)); console.log(await c.shot(a)); await hud(true);
} else if (cmd === 'view') {
  await hud(false);
  await c.ev(`${T3} const s=__WD.app.session; s.ctx.camera.stopCine(); s.player.teleport(new T3.Vector3(${b}), ${d}); s.ctx.camera.yaw=${d}; s.ctx.camera.pitch=${e ?? 0.25}; return 1`);
  await sleep(1800); console.log(await c.shot(a)); await hud(true);
} else if (cmd === 'atk') {
  // atk <shot> <enemyId> <STATE> [waitMs] [dist]: WAI faces the creature from `dist` m, it is forced into STATE in slow motion
  const dist = +(e ?? 7);
  const r = await c.ev(`${T3} const s=__WD.app.session; const en=s.enemies.find(x=>x.id==='${b}'); if(!en) return null;
    const f=new T3.Vector3(Math.sin(en.root.rotation.y),0,Math.cos(en.root.rotation.y)); const p=en.pos.clone().addScaledVector(f, ${dist}).setY(en.pos.y+0.3);
    s.player.teleport(p, Math.atan2(en.pos.x-p.x, en.pos.z-p.z)); en.alerted=true; s.ctx.time.slowmo(0.25, 30);
    const side=new T3.Vector3(f.z,0,-f.x); const cam=p.clone().addScaledVector(f, 4).addScaledVector(side, 3).setY(p.y+3+en.bigness*4);
    s.ctx.camera.playCine([{pos:cam, look:en.pos.clone().setY(en.pos.y+0.8+en.bigness*2).lerp(p,0.35), dur:600, fov:58}]);
    en.setState('${d}'); return [en.kind, en.state]`);
  await hud(false);
  await sleep(+(f ?? 1200)); console.log(JSON.stringify(r), await c.shot(a)); await hud(true);
  await c.ev(`__WD.app.session.ctx.camera.stopCine(); return 1`);
} else if (cmd === 'js') {
  console.log(JSON.stringify(await c.ev(a)));
} else if (cmd === 'shot') {
  console.log(await c.shot(a));
}
process.exit(0);
