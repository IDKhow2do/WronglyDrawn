// Run page code, then (optionally) a screenshot. Usage: node sx.mjs "<js returning a value>" [shotName] [waitMs]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const r = await c.ev(process.argv[2] || 'return 1');
if (process.argv[4]) await sleep(+process.argv[4]);
if (process.argv[3]) await c.shot(process.argv[3]);
console.log(JSON.stringify(r));
process.exit(0);
