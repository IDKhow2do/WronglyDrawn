// "Do not break" checks on level 1 (real-time loop running): TAG stamp close-up on the Inkwell, first-person aim,
// the level intro push-in is shot by load. Usage: node checks.mjs <tag>   (page: plaza freshly loaded, inkwell warp)
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
process.env.WD_SHOTS ??= '/tmp/wd-cam/shots/checks';
const { connect, sleep } = await import('<local-path>');
const c = await connect();
const tag = process.argv[2] ?? 'x';
const ev = (code) => c.ev(`const s=__WD.session, p=s.player, app=__WD.app, cam=app.camera, T3=p.pos.constructor; ${code}`);
await ev(`document.querySelectorAll('.toast,.toasts > *').forEach(e=>e.remove()); return 1`);
// TAG on the Inkwell: WAI 3 m from it, it reels, TAG
console.log('tag', await ev(`const e=s.enemies.find(q=>q.id==='inkwell'); const at=e.pos.clone().add(new T3(0,0,-3.2)); p.teleport(at, 0); cam.yaw=0; p.hp=6; p.invuln=9;
  await new Promise(r=>setTimeout(r,600)); e.holdStagger(3); await new Promise(r=>setTimeout(r,200)); const ok=e.canBeTagged; if(ok) s.combat.tag(e); return [ok, cam.inCine]`));
await sleep(350);
await c.shot(`tag_${tag}_1`);
await sleep(500);
await c.shot(`tag_${tag}_2`);
await sleep(1500);
// first-person aim: hold aim, crosshair ray vs the camera's look
await ev(`app.input.virtualDown?.('Mouse2'); cam.aiming = true; return 1`);
await sleep(500);
console.log('aim', await ev(`cam.aiming = true; const r=cam.aimRay(); const d=cam.lookDir(); return { aimT: +cam.aimT.toFixed(2), dot: +r.dir.dot(d).toFixed(5), eye: +r.origin.distanceTo(p.renderPos.clone().setY(p.renderPos.y + cam.eyeHeight)).toFixed(2) }`));
await c.shot(`aim_${tag}`);
await ev(`app.input.virtualUp?.('Mouse2'); cam.aiming = false; return 1`);
process.exit(0);
