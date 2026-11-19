// args via window.__args = {spots:[[x,y,z]], yaws:n, frames, sweep}
const A = window.__args;
__cam.freeze();
const out = [];
for (const sp of A.spots) {
  for (let k = 0; k < (A.yaws ?? 8); k++) {
    const yaw = (k / (A.yaws ?? 8)) * Math.PI * 2;
    const at = __cam.place(sp[0], sp[1], sp[2], yaw, A.pitch ?? 0.22);
    // settle 1 s, then measure
    __cam.run(60, { keepHp: true });
    const r = __cam.run(A.frames ?? 120, { keepHp: true, sweep: A.sweep, keep: A.keep });
    const moved = Math.hypot(r.end[0] - at[0], r.end[2] - at[2]);
    out.push({ sp: sp.map((v) => +v.toFixed(2)), yaw: +yaw.toFixed(2), moved: +moved.toFixed(2), ...r.m, fr: r.fr });
  }
}
return out;
