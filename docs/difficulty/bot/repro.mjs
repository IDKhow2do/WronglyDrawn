// Scripted repro of the two mid-boss bugs (author's screenshots 11 and 12). Usage: PORT=5194 node repro.mjs
// Inkwell: wake it, leave and come back three times, then stand on its top for 8 s → counts its wake cut-ins,
//          cines, resets, WAI's bounces and how far the camera looks down.
// Gramophone: wake it, step off the bandstand and back three times (wake cut-ins), then BIG SHOUT during an
//          inhale from three spots on the stage: in front, at the edge 8 m out, behind it.
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const PORT = process.env.PORT || 5194;
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const load = async (level) => {
  await c.send('Page.navigate', { url: `http://localhost:${PORT}/?test&difficulty=normal&level=${level}&style=graffiti` });
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await c.ev(`const s=__WD.session; window.__r={wakes:0,cines:0}; const cam=__WD.app.camera; const pc=cam.playCine.bind(cam);
    cam.playCine=(...a)=>{window.__r.cines++; return pc(...a)}; return 1`);
};
const adv = (sec) => c.ev(`__WD.advance(${sec}); return 1`);

// ── Red Inkwell ──
await load('plaza');
await c.ev(`const s=__WD.session; s.debugWarp('inkwell'); return 1`);
await sleep(1500);
await c.ev(`const ink=__WD.session.quarter.inkwell; const w=ink.onWake; ink.onWake=()=>{window.__r.wakes++; w&&w()}; return 1`);
await adv(4);
const inkFar = await c.ev(`const ink=__WD.session.quarter.inkwell; return [ink.pos.x+30, ink.pos.y, ink.pos.z]`);
for (let i = 0; i < 3; i++) {
  await c.ev(`const p=__WD.session.player; p.teleport(new p.pos.constructor(${inkFar[0]}, ${inkFar[1]}, ${inkFar[2]})); return 1`);
  await adv(2);
  await c.ev(`const s=__WD.session, ink=s.quarter.inkwell, p=s.player; p.teleport(ink.pos.clone().add(new p.pos.constructor(0,0,6))); return 1`);
  await adv(3);
}
const inkA = await c.ev(`const ink=__WD.session.quarter.inkwell; return {wakes: window.__r.wakes, cines: window.__r.cines, state: ink.state, alerted: ink.alerted}`);
console.log('INKWELL leave/return x3:', JSON.stringify(inkA));
await c.ev(`window.__r.wakes=0; window.__r.cines=0; const s=__WD.session, ink=s.quarter.inkwell, p=s.player;
  p.teleport(ink.pos.clone().setY(ink.topY + 0.15)); window.__ys=[]; window.__states=new Set(); window.__down=0; return 1`);
for (let i = 0; i < 16; i++) {
  await adv(0.5);
  await c.ev(`const s=__WD.session, ink=s.quarter.inkwell, p=s.player; window.__ys.push(+(p.pos.y-ink.topY).toFixed(2)); window.__states.add(ink.state);
    const d=__WD.app.camera.camera.getWorldDirection(new p.pos.constructor()); window.__down=Math.min(window.__down, d.y); return 1`);
}
const inkB = await c.ev(`const s=__WD.session, ink=s.quarter.inkwell, p=s.player;
  return {wakes: window.__r.wakes, cines: window.__r.cines, states:[...window.__states], heightAboveTop: window.__ys, offTopNow: Math.hypot(p.pos.x-ink.pos.x,p.pos.z-ink.pos.z).toFixed(1), cameraMinDirY: window.__down.toFixed(2), inkMoved: ink.pos.distanceTo(ink.home).toFixed(2)}`);
console.log('INKWELL on top 8 s:', JSON.stringify(inkB));

// ── Red Gramophone ──
await load('harbor');
await c.ev(`__WD.session.debugWarp('gramophone'); return 1`);
await sleep(1500);
await c.ev(`const g=__WD.session.pier.gramophone; const w=g.onWake; g.onWake=()=>{window.__r.wakes++; w&&w()}; return 1`);
await adv(4);
for (let i = 0; i < 3; i++) {
  await c.ev(`const s=__WD.session, g=s.pier.gramophone, p=s.player; p.teleport(g.pos.clone().add(new p.pos.constructor(0,-4,14))); return 1`);
  await adv(2);
  await c.ev(`const s=__WD.session, g=s.pier.gramophone, p=s.player; p.teleport(g.pos.clone().add(new p.pos.constructor(0,0.1,5))); return 1`);
  await adv(3);
}
console.log('GRAMOPHONE off/on stage x3:', JSON.stringify(await c.ev(`const g=__WD.session.pier.gramophone; return {wakes: window.__r.wakes, cines: window.__r.cines, state: g.state}`)));
const tryShout = async (label, off) => {
  const r = await c.ev(`const s=__WD.session, g=s.pier.gramophone, p=s.player;
    p.teleport(g.pos.clone().add(new p.pos.constructor(${off.join(',')})));
    s.shout.muteT = 0; g.attackCd = 0; g.inhaleT = 0; if (g.state !== 'FIGHT') { g.state='FIGHT'; g.stateT=0; }
    for (let i=0;i<120 && g.state!=='INHALE';i++) __WD.advance(1/30);
    const before=g.state; __WD.advance(0.4);
    // face the horn and shout big along the line to it
    const to=g.pos.clone().setY(g.pos.y+1.6).sub(p.pos); __WD.app.camera.yaw=Math.atan2(-to.x,-to.z);
    const cam=__WD.app.camera; const ar=cam.aimRay.bind(cam); cam.aimRay=()=>({origin:p.pos.clone().setY(p.pos.y+0.95), dir:to.clone().normalize()});
    const n=s.shout.fire(p,true); cam.aimRay=ar;
    __WD.advance(0.1);
    return {before, reacted:n, after:g.state, dazed:g.dazed, dy:+(p.pos.y-g.pos.y).toFixed(2), hint: s.pier.hint ? String(s.pier.hint()).slice(0,90) : ''};`);
  console.log(`GRAMOPHONE shout ${label}:`, JSON.stringify(r));
};
await tryShout('front, on the stage', [0, 0.1, 5]);
await adv(6);
await tryShout('at the stage edge, 8 m out', [0, 0.1, 8]);
await adv(6);
await tryShout('behind it', [0, 0.1, -3]);
process.exit(0);
