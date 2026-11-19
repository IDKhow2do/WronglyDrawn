// node sheet.mjs out.jpg a.jpg b.jpg ... → 2-column contact sheet, 640 px tiles with the file name
import sharp from 'sharp';
const [out, ...ins] = process.argv.slice(2);
const W = 640, H = 360;
const tiles = await Promise.all(ins.map(async (f, i) => ({ input: await sharp(f).resize(W, H, { fit: 'cover' }).toBuffer(), left: (i % 2) * W, top: Math.floor(i / 2) * (H + 24) + 24 })));
const labels = ins.map((f, i) => ({ input: Buffer.from(`<svg width="${W}" height="24"><rect width="${W}" height="24" fill="#222"/><text x="6" y="17" font-size="15" fill="#fff" font-family="sans-serif">${f.split('/').pop()}</text></svg>`), left: (i % 2) * W, top: Math.floor(i / 2) * (H + 24) }));
const rows = Math.ceil(ins.length / 2);
await sharp({ create: { width: W * 2, height: rows * (H + 24), channels: 3, background: '#000' } }).composite([...tiles, ...labels]).jpeg({ quality: 80 }).toFile(out);
console.log(out);
