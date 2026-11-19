const s = __WD.session; const p = s.player; const V = p.pos.constructor;
for (let k = 0; k < 6; k++) {
  p.teleport(new V(ARGS.x, ARGS.y, ARGS.z), ARGS.yaw ?? 0); p.vel?.set?.(0, 0, 0); __WD.advance(ARGS.settle ?? 0.45);
  if (p.grounded && Math.abs(p.pos.x - ARGS.x) < 0.1 && Math.abs(p.pos.z - ARGS.z) < 0.1) break;
}
const f = p.pos.clone();
const cam = __WD.app.camera;
cam.override = { pos: new V(f.x + ARGS.cx, f.y + ARGS.cy, f.z + ARGS.cz), look: new V(f.x, f.y + (ARGS.ly ?? 0.25), f.z), fov: ARGS.fov ?? 40 };
__WD.advance(0.02);
return { feet: p.pos.toArray().map((v) => +v.toFixed(3)), grounded: p.grounded };
