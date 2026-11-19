// Level-3 barrier sweep (SOULS.md "Playtest fixes", item 5): every drawn barrier must stop WAI while it is shut — walking
// into it and a Long-Legs sprint jump at it. Run prep.mjs works first. Prints PASS / FAIL per barrier and side.
import { connect, sleep } from './lib.mjs';
const c = await connect();
const ev = (code) => c.ev(`const s=__WD.app.session, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor, I=__WD.app.input; ${code}`);
// try to cross: stand at `from`, face `yaw`, hold forward (+ sprint + jump when `jump`) for 2 s; returns the end point
const tryCross = async (from, yaw, jump) => {
  await ev(`s.ctx.camera.stopCine(); p.hp = 6; p.invuln = 99; p.teleport(new T3(${from}), ${yaw}); cam.yaw = ${yaw}; cam.pitch = 0.1; return 1`);
  await sleep(500);
  await ev(`I.virtualMove.y = 1; I.virtualMove.x = 0; ${jump ? "I.virtualDown('ShiftLeft');" : ''} return 1`);
  if (jump) {
    await sleep(350);
    await ev(`I.virtualDown('Space'); await new Promise(r => setTimeout(r, 250)); I.virtualUp('Space'); return 1`);
  }
  await sleep(jump ? 1500 : 1800);
  return ev(`I.virtualMove.y = 0; I.virtualUp('ShiftLeft'); return p.pos.toArray().map(v => +v.toFixed(2))`);
};
const report = (name, ok, end) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(end)}`);
const L = await ev(`const m = await import('/src/level/works/WorksLayout.ts'); return { st2: m.WORKS.stair2.foot.toArray(), st3: m.WORKS.stair3.foot.toArray(), hw3: m.WORKS.stair3.hw, FY: m.FY }`);
console.log('layout', JSON.stringify(L));

// F1: the CORRECT tape before the lift (z -13.6), from the belt floor side; then the lift cage's lattice gate
await ev(`s.debugWarp('legs'); return 1`);
await sleep(2500);
for (const jump of [false, true]) {
  const e = await tryCross(`17, ${L.FY[0] + 0.1}, -9.5`, Math.PI, jump);
  report(`F1 lift tape (${jump ? 'sprint jump' : 'walk'})`, e[2] > -13.6, e);
}
for (const jump of [false, true]) {
  const e = await tryCross(`17.8, ${L.FY[0] + 0.1}, -14.4`, Math.PI, jump);
  report(`F1 lift cage gate (${jump ? 'sprint jump' : 'walk'})`, e[2] > -15.4, e);
}
// F2: the QC barrier arm (x -21.6 .. -18.05, z = stair2 foot + 0.6), from both sides
await ev(`s.debugWarp('stamp'); return 1`);
await sleep(2500);
const qz = L.st2[2] + 0.6;
for (const [side, yaw] of [[1, Math.PI], [-1, 0]]) for (const jump of [false, true]) {
  const e = await tryCross(`-19.8, ${L.FY[1] + 0.1}, ${qz + side * 2.5}`, yaw, jump);
  report(`F2 QC barrier from ${side > 0 ? '+z' : '-z'} (${jump ? 'sprint jump' : 'walk'})`, side > 0 ? e[2] > qz : e[2] < qz, e);
}
// F3: the card-catalogue door (x 10) from the Reading Room; the roof-stair grille (x stair3.foot.x - 0.15) from the archive
await ev(`s.debugWarp('archive'); return 1`);
await sleep(2500);
for (const jump of [false, true]) {
  const e = await tryCross(`7.5, ${L.FY[2] + 0.1}, 9.5`, Math.PI / 2, jump);
  report(`F3 catalogue door (${jump ? 'sprint jump' : 'walk'})`, e[0] < 9.6, e);
}
const gx = L.st3[0] - 0.15;
for (const jump of [false, true]) {
  const e = await tryCross(`${gx - 2.5}, ${L.FY[2] + 0.1}, ${L.st3[2]}`, Math.PI / 2, jump);
  report(`F3 roof-stair grille (${jump ? 'sprint jump' : 'walk'})`, e[0] < gx, e);
}
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-5)`)));
process.exit(0);
