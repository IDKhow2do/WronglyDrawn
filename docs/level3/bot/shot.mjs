// Screenshot. Usage: node shot.mjs name [js-to-run-first] [waitMs]
import { connect, sleep } from './lib.mjs';
const c = await connect();
if (process.argv[3]) await c.ev(process.argv[3]);
await sleep(+(process.argv[4] ?? 600));
console.log(await c.shot(process.argv[2] ?? 'shot'));
process.exit(0);
