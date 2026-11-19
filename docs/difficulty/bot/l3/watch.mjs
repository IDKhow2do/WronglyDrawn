import { connect, sleep } from './lib.mjs';
const c = await connect();
for (let i = 0; i < +(process.argv[2] ?? 60); i++) {
  console.log(JSON.stringify(await c.ev(`const s=__WD.app.session; return [s.player.pos.toArray().map(v=>+v.toFixed(1)), s.player.grounded, s.guide.target?.toArray().map(v=>+v.toFixed(1)), s.player.hp]`)));
  await sleep(100);
}
process.exit(0);
