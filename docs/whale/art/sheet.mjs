// usage: node sheet.mjs out.png '#bg' img...   (contact sheet, 3 per row)
import sharp from 'sharp';
const [, , out, bg, ...files] = process.argv;
const S = 400;
const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(S, S, { fit: 'contain', background: bg }).flatten({ background: bg }).png().toBuffer(), left: (i % 3) * S, top: Math.floor(i / 3) * S })));
await sharp({ create: { width: S * 3, height: S * Math.ceil(files.length / 3), channels: 4, background: bg } }).composite(tiles).png().toFile(out);
