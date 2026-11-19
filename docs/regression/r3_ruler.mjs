// Spot check (docs/REGRESSION.md, round 3): the Red Pen's ruler sweep (RedPenHazards RULER_KNOCK) hitting a WAI who stands still.
// Run `node ../level3/bot/prep.mjs works` first (WD_CDP / WD_VITE set). Usage: node r3_ruler.mjs [tag] [dx dz] [phase]
//   dx dz = WAI's spot relative to the arena centre (default 0 6); phase 1 (speed 9) or 3 (speed 12).
// The game's own loop is frozen; the script steps 1/60 s itself. Prints one frame every 0.1 s around the hit
// (WAI pos, vy, ruler offset, WAI's offset along the sweep, hp) and the flight; shots every 0.1 s from 0.2 s before the hit.
import { connect, sleep } from '../level3/bot/lib.mjs';
const c = await connect();
const [tag = 'a', dxS = '0', dzS = '6', phS = '1'] = process.argv.slice(2);
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, app=__WD.app; ${code}`);
await ev(`s.debugWarp('roof'); return 1`);
await sleep(1500);
await ev(`s.souls.warpIn(); pen.debugPhase(${phS}); s.ctx.camera.stopCine(); return 1`);
await sleep(1500);
// freeze the real-time loop; own stepper
await ev(`app.__step ??= app.step.bind(app); app.step = () => {};
  window.__adv = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { app.__step(1 / 60); } };
  app.agent.enabled = false;
  const T3 = p.pos.constructor; p.teleport(pen.arena.clone().add(new T3(${dxS}, 0.3, ${dzS})), Math.PI);
  p.hp = 6; p.invuln = 0; __adv(1.0);
  pen.hz.stopRuler(); pen.idle(99); __adv(0.2); p.invuln = 0;
  pen.ground.start('rule', p);
  window.__rl = { frames: [], hitAt: null, start: p.pos.clone(), hp0: p.hp };
  return 1`);
const frame = `const r = pen.hz.ruler, n = r.n; const d = (p.pos.x - pen.arena.x) * n.x + (p.pos.z - pen.arena.z) * n.z;
  return { t: +(__rl.frames.length * 0.1).toFixed(1), st: pen.state, pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(2)), vy: +(p.vy ?? 0).toFixed(2),
    off: +r.off.toFixed(2), d: +d.toFixed(2), active: r.active, hp: p.hp, ground: !!p.grounded, distArena: +Math.hypot(p.pos.x - pen.arena.x, p.pos.z - pen.arena.z).toFixed(2), R: pen.arenaR }`;
const frames = [];
let hitT = null, shots = [];
for (let i = 0; i < 90; i++) {
  const f = await ev(`__adv(0.1); const o = (() => { ${frame} })(); __rl.frames.push(o); return o;`);
  frames.push(f);
  if (hitT === null && f.hp < 6) hitT = f.t;
  // shots: once the ruler is live and within ~2 m of WAI, then 1.2 s after
  const near = f.active && f.d - f.off < 2.2 && f.d - f.off > -1;
  if ((near || (hitT !== null && f.t - hitT <= 1.2)) && shots.length < 16) {
    // side view: a fixed camera down the ruler's long axis, past its end (22 m off, knee height): the ruler is seen end-on
    // as a 0.7 m block moving left → right, so whether it passes under WAI or through him reads at a glance
    await ev(`const n = pen.hz.ruler.n, o = __rl.start, V = o.constructor;
      app.camera.override = { pos: new V(o.x - n.z * 22 + n.x * 1.5, o.y + 0.8, o.z + n.x * 22 + n.z * 1.5), look: new V(o.x + n.x * 1.5, o.y + 0.8, o.z + n.z * 1.5), fov: 22 };
      app.render(1, 1/60); return 1`);
    await sleep(80);
    const nm = `r3_ruler_${tag}_${String(Math.round(f.t * 10)).padStart(3, '0')}`;
    await c.shot(nm); shots.push(nm);
  }
  if (hitT !== null && f.t - hitT > 2.5 && f.ground) break;
  if (hitT === null && f.t > 6 && !f.active && f.st !== 'RULE_TELL') break;
}
for (const f of frames) console.log(JSON.stringify(f));
const start = frames[0].pos, end = frames.at(-1).pos;
const peak = Math.max(...frames.map((f) => f.pos[1]));
const minY = Math.min(...frames.map((f) => f.pos[1]));
const hitF = frames.find((f) => f.t === hitT);
console.log('SUMMARY', JSON.stringify({ tag, hitAt: hitT, hpAfter: frames.at(-1).hp, flownXZ: hitF ? +Math.hypot(end[0] - hitF.pos[0], end[2] - hitF.pos[2]).toFixed(2) : null,
  peakAboveStart: +(peak - start[1]).toFixed(2), dropBelowStart: +(start[1] - minY).toFixed(2), endDistArena: frames.at(-1).distArena, arenaR: frames[0].R,
  endAheadOfRuler: +(frames.at(-1).d - frames.at(-1).off).toFixed(2), shots }));
await ev(`app.camera.override = null; app.step = app.__step; app.agent.enabled = true; return 1`);
process.exit(0);
