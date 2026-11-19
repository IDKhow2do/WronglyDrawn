// walk WAI along a stairway (x from x0 to x1 at z), sampling grounded and feet height; sprint optional
const p = __WD.session.player, V = p.pos.constructor, cam = __WD.app.camera;
p.teleport(ARGS.ax === "z" ? new V(ARGS.z, ARGS.y0, ARGS.x0) : new V(ARGS.x0, ARGS.y0, ARGS.z), 0); __WD.advance(0.4);
const dir = Math.sign(ARGS.x1 - ARGS.x0); cam.yaw = ARGS.ax === "z" ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
let n = 0, g = 0, minY = 1e9, maxY = -1e9; const t0 = p.pos.clone();
if (ARGS.sprint) T.down('ShiftLeft');
T.down('KeyW');
for (let i = 0; i < 200 && (p.pos[ARGS.ax || "x"] - ARGS.x1) * dir < 0; i++) { __WD.advance(0.05); n++; if (p.grounded) g++; }
T.up('KeyW'); if (ARGS.sprint) T.up('ShiftLeft');
return { steps: n, groundedPct: Math.round(100 * g / n), from: t0.toArray().map(v => +v.toFixed(2)), to: p.pos.toArray().map(v => +v.toFixed(2)) };
