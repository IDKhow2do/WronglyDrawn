// Run each dev-panel cutscene of level 3 and shoot it at a few moments. Usage: node cineshots.mjs id [times...]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [id, ...times] = process.argv.slice(2);
await c.ev(`const s=__WD.app.session; s.devInfo.cines.find(x=>x.id==='${id}').run(); return 1`);
let t = 0;
for (const at of times.map(Number)) { await sleep((at - t) * 1000); t = at; console.log(await c.shot(`cine_${id}_${at}`)); }
process.exit(0);
