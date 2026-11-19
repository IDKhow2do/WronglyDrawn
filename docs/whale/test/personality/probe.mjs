import { connect } from './lib.mjs';
const c = await connect();
const v = await c.ev(process.argv[2]);
console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
if (process.argv[3]) await c.shot(process.argv[3]);
process.exit(0);
