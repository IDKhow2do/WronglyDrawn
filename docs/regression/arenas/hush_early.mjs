// Level 2: every way to get at the Hush before its fight is due, and what happens (toasts, its paint, a screenshot).
//   A  at sea (lighthouse not sung yet): WAI on the lighthouse gallery sprays and BIG-SHOUTS at it
//   B  the lighthouse sang, the Hush hangs over the headland: WAI still on the gallery sprays + BIG-SHOUTS
//   D  forced state for the 2/3 line: WAI on the plaza's north edge, the ferry taken out of `woken` (not reachable in play)
//   C  WAI on the plaza's north edge (8.4 m from the centre: the walk-in start circle is 7.3 m) sprays + shouts
// Real input through WD_AGENT (spray / shout at the Hush), real time. Usage: LANG_=en|zh WD_VITE=5301 node hush_early.mjs
import { connect, sleep } from './lib.mjs';
const c = await connect();
const LANG = process.env.LANG_ || 'en';
const TAG = process.env.TAG || 'after';
// language: set it on the origin, then load
await c.send('Page.navigate', { url: `http://localhost:${process.env.WD_VITE || 5301}/?test` });
await sleep(1500);
await c.ev(`localStorage.setItem('wd.lang','${LANG}'); return 1`);
await c.load('harbor', 'normal');
const act = (cmd) => c.ev(`return WD_AGENT.act(${JSON.stringify(cmd)})`);
await c.ev(`const s=__WD.session; s.debugWarp('gramophone'); s.pier.debugClear(); s.level.burstCocoon(); return 1`);
await c.adv(2);
await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
const read = (tag) => c.ev(`const s=__WD.session, h=s.hush, p=s.player; return {tag:'${tag}', woken:[...s.woken], risen:s.hushRisen, awake:h.awake, paint:+(h.hp/h.maxHp).toFixed(4),
  dist:+h.pos.distanceTo(p.pos).toFixed(1), hush:h.pos.toArray().map(v=>+v.toFixed(1)), wai:p.pos.toArray().map(v=>+v.toFixed(1)), toasts:window.__r.toasts.slice()}`);
const attack = async (name) => {
  await c.ev(`window.__r.toasts=[]; return 1`);
  const at = await c.ev(`const h=__WD.session.hush; return [h.pos.x, h.pos.y-0.6, h.pos.z]`);
  await act({ type: 'spray', seconds: 2.5, at });
  await sleep(700);
  const mid = await c.shot(`hush_${name}_spray_${LANG}_${TAG}`);
  await sleep(2200);
  const afterSpray = await read(name + ' spray');
  await act({ type: 'shout', big: true, at });
  await sleep(1300);
  const shot = await c.shot(`hush_${name}_shout_${LANG}_${TAG}`);
  const afterShout = await read(name + ' shout');
  await sleep(2200);
  await c.shot(`hush_${name}_shout_later_${LANG}_${TAG}`);
  // a second spray at once: the line must not repeat (20 s)
  await c.ev(`window.__r.toasts=[]; return 1`);
  await act({ type: 'spray', seconds: 1.5, at });
  await sleep(1800);
  const again = await read(name + ' again');
  console.log(JSON.stringify({ afterSpray, afterShout, againToasts: again.toasts, shots: [mid, shot] }));
};
// A: at sea, from the gallery
await c.ev(`const s=__WD.session; const g=s.level.spiralAt(1); s.player.teleport(g.clone().setY(g.y+0.1), 0); return 1`);
await sleep(800);
await attack('A_atSea');
// B: the lighthouse sings, the Hush comes over the headland; WAI stays on the gallery
await c.ev(`const s=__WD.session; s.wakeLighthouse(); return 1`);
for (let i = 0; i < 14; i++) { await c.adv(0.5); await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); return 1`); }
await c.ev(`__WD.app.camera.stopCine(); const s=__WD.session; s.hush.pos.copy(s.hush.idleSpot);
  // the gallery side facing the Hush (the lighthouse stands at x 13, z −51; the gallery ring ≈ 2.6 m out)
  const V=s.player.pos.constructor, d=new V(s.hush.pos.x-13,0,s.hush.pos.z+51).normalize();
  s.player.teleport(new V(13+d.x*2.6, s.player.pos.y, -51+d.z*2.6), Math.atan2(d.x,d.z)); return 1`);
await sleep(1500);
await attack('B_gallery');
// D: the 2/3 line (forced)
await sleep(21000); // past the 20 s line cooldown
await c.ev(`const s=__WD.session, A=s.hush.arena; s.player.teleport(A.clone().add(new s.player.pos.constructor(0, 0.1, -8.4)), Math.PI); return 1`);
await c.ev(`const s=__WD.session; s.woken.delete('ferry'); return 1`);
await attack('D_forced_2of3');
await c.ev(`__WD.session.woken.add('ferry'); return 1`);
// C: the plaza's north edge, outside the 7.3 m start circle
await c.ev(`const s=__WD.session, A=s.hush.arena; s.player.teleport(A.clone().add(new s.player.pos.constructor(0, 0.1, -8.4)), Math.PI); return 1`);
await sleep(800);
await attack('C_plazaEdge');
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
