// The other gated bosses: paint them before their fight is due and read what answers (toasts, their paint, a screenshot).
//   eraser   level 1 start (0/3 Guardians), WAI warped onto the summit's south edge, sprays the Eraser
//   inkwell  level 1 quarter, WAI west of the diagonal barricade (outside Inkwell Square), sprays the Inkwell over it
//   (each: when the spray cannot reach, one direct paint hit, as a long throw would land; the row says `direct`)
//   pen      level 3 'index' stage (2/3 machines), WAI outside the ink gate sprays the Pen; then warped to 'roof' (3/3), again
// Real spray through WD_AGENT, real time. Usage: ONLY=eraser,inkwell,pen LANG_=en|zh WD_VITE=5301 node early.mjs
import { connect, sleep } from './lib.mjs';
const c = await connect();
const LANG = process.env.LANG_ || 'en';
const TAG = process.env.TAG || 'after';
const ONLY = (process.env.ONLY || 'eraser,inkwell,pen').split(',');
await c.send('Page.navigate', { url: `http://localhost:${process.env.WD_VITE || 5301}/?test` });
await sleep(1500);
await c.ev(`localStorage.setItem('wd.lang','${LANG}'); return 1`);
const act = (cmd) => c.ev(`return WD_AGENT.act(${JSON.stringify(cmd)})`);
const skip = () => c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
// stand WAI on the ground at (x, z) (ray down from 30 m above), facing `at`
const standAt = (x, z, yTop = 40) => c.ev(`const s=__WD.session, V=s.player.pos.constructor;
  const h=s.ctx.physics.raycast(new V(${x},${yTop},${z}), new V(0,-1,0), 60, (c)=>["static","gate","barrier","undrawn"].includes(s.ctx.physics.tagOf(c)));
  s.player.teleport(new V(${x}, h? h.point.y+0.05 : 0, ${z}), 0); return h? +h.point.y.toFixed(2) : null`);
const sprayAt = async (boss, name, secs = 2.5) => {
  await c.ev(`window.__r.toasts=[]; return 1`);
  const before = await c.ev(`const e=${boss}; return +(e.hp/e.maxHp).toFixed(4)`);
  const at = await c.ev(`const e=${boss}; return [e.pos.x, e.pos.y+1.6, e.pos.z]`);
  await act({ type: 'spray', seconds: secs, at });
  await sleep(900);
  const shot = await c.shot(`${name}_${LANG}_${TAG}`);
  await sleep(secs * 1000);
  const r = await c.ev(`const s=__WD.session, e=${boss}, p=s.player; return {paint:+(e.hp/e.maxHp).toFixed(4), dist:+e.pos.distanceTo(p.pos).toFixed(1), toasts:window.__r.toasts.slice()}`);
  // again at once: the line must not repeat inside 20 s
  await c.ev(`window.__r.toasts=[]; return 1`);
  await act({ type: 'spray', seconds: 1.2, at });
  await sleep(1500);
  const again = await c.ev(`return window.__r.toasts.slice()`);
  // out of spray reach (the arc carries ~10 m): one paint hit straight on it, as a long throw / arc would land
  let direct = null;
  if (!r.toasts.length) {
    await sleep(500);
    await c.ev(`window.__r.toasts=[]; const e=${boss}, V=e.pos.constructor; e.applyDamage({amount:5, point:e.pos.clone().setY(e.pos.y+1.6), dir:new V(0,0,-1), collider:null, kind:'paint', color:'#2a4be0'}); return 1`);
    await sleep(300);
    const s2 = await c.shot(`${name}_direct_${LANG}_${TAG}`);
    direct = { ...(await c.ev(`const e=${boss}; return {paint:+(e.hp/e.maxHp).toFixed(4), toasts:window.__r.toasts.slice()}`)), shot: s2 };
  }
  console.log(name, JSON.stringify({ paintBefore: before, ...r, againToasts: again, shot, direct }));
};

if (ONLY.includes('eraser')) {
  await c.load('plaza', 'normal');
  await skip();
  await c.ev(`const s=__WD.session, V=s.player.pos.constructor; s.player.teleport(new V(0, 14.1, -37.2), Math.PI); return 1`);
  await sleep(1500);
  console.log('eraser state', JSON.stringify(await c.ev(`const s=__WD.session; return {woken:[...s.woken], awake:s.eraser.awake, epos:s.eraser.pos.toArray().map(v=>+v.toFixed(1))}`)));
  await sprayAt('__WD.session.eraser', 'eraser_early_0of3');
}
if (ONLY.includes('inkwell')) {
  await c.load('plaza', 'normal');
  await c.ev(`__WD.session.debugWarp('quarter'); return 1`);
  await c.adv(1); await skip();
  const ip = await c.ev(`return __WD.session.quarter.inkwell.pos.toArray()`);
  // west of the diagonal barricade (35.8,−18.4)–(41.2,−24.7): outside the square, the barricade between WAI and the Inkwell
  const y = await standAt(38.4, -23.4, ip[1] + 6);
  await sleep(1200);
  console.log('inkwell state', JSON.stringify(await c.ev(`const s=__WD.session, e=s.quarter.inkwell; return {y:${y}, inSquare:s.level.quarter.inSquare(s.player.pos), alerted:e.alerted, ipos:e.pos.toArray().map(v=>+v.toFixed(1)), wai:s.player.pos.toArray().map(v=>+v.toFixed(1))}`)));
  await sprayAt('__WD.session.quarter.inkwell', 'inkwell_early_barricade');
}
if (ONLY.includes('pen')) {
  await c.load('works', 'normal');
  await c.ev(`__WD.session.debugWarp('index'); return 1`);
  await c.adv(1); await skip();
  // outside the ink gate, 3 m out, facing in
  const put = `const s=__WD.session, r=s.souls.host.ring, V=s.player.pos.constructor; const out=new V(r.gatePos.x-r.center.x,0,r.gatePos.z-r.center.z).normalize();
    const at=r.gatePos.clone().addScaledVector(out, 2.5); at.y=r.center.y+0.1; s.player.teleport(at, Math.atan2(-out.x,-out.z)); return {woken:[...s.woken], mode:s.souls.mode, awake:s.pen.awake}`;
  console.log('pen state', JSON.stringify(await c.ev(put)));
  await sleep(1500);
  await sprayAt('__WD.session.pen', 'pen_early_2of3');
  await sleep(21000);
  await c.ev(`__WD.session.debugWarp('roof'); return 1`);
  await c.adv(1); await skip();
  console.log('pen state 3/3', JSON.stringify(await c.ev(put)));
  await sleep(1000);
  await sprayAt('__WD.session.pen', 'pen_early_3of3_outsideGate');
}
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
