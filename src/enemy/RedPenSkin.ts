/**
 * [INPUT]: depends on three (MeshMatcapMaterial, CanvasTexture)
 * [OUTPUT]: exports penSkin() → PenSkin (the Red Pen's surface materials: lacquer, knurl, chrome, engraved steel band,
 *           eye white, iris, ink drop) and sculptSkin() (the Tripo body's material: its painted maps under a matcap)
 * [POS]: the Red Pen's surfaces, used by RedPenLook (the face, the drawn fallback body) and RedPenModel (the sculpted body). The Pen is the outside world's standard of judgement: the one
 *        thing in the game NOT drawn wrong. So its surfaces are manufactured and immaculate where everything else is
 *        crayon: deep red lacquer with one sharp clean highlight, polished chrome, a precisely knurled steel grip, an
 *        engraved steel band (CORRECT, ruler ticks, a serial number, a standards mark). No wear, no scratches: WAI's
 *        paint is the first imperfect thing to touch it. All matcaps painted on canvases (cheap, view-dependent sheen).
 *        Every material is transparent (the Pen fades as one: sketch, near camera) and fog-free (the roof haze washed it
 *        pink); the paint system skips transparent materials, so these stay the live ones RedPenBoss keeps red.
 */
import * as THREE from 'three';

export interface PenSkin {
  lacquer: THREE.MeshMatcapMaterial;
  knurl: THREE.MeshMatcapMaterial;
  chrome: THREE.MeshMatcapMaterial;
  band: THREE.MeshMatcapMaterial;
  eyeWhite: THREE.MeshMatcapMaterial;
  iris: THREE.MeshMatcapMaterial;
  inkDrop: THREE.MeshMatcapMaterial;
}

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};

const tex = (c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/**
 * A lacquer matcap: lit from the upper left, a dark rim, one long clean highlight streak and a hard white glint,
 * plus a faint warm bounce from below.
 */
function glossCap(base: string, shade: string, rim: string, glint: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = g.createRadialGradient(100, 90, 10, 128, 128, 128);
  r.addColorStop(0, base);
  r.addColorStop(0.75, shade);
  r.addColorStop(1, rim);
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  // warm bounce low right
  const b = g.createRadialGradient(170, 215, 4, 170, 215, 70);
  b.addColorStop(0, 'rgba(255,170,140,0.35)');
  b.addColorStop(1, 'rgba(255,170,140,0)');
  g.fillStyle = b;
  g.fillRect(0, 0, 256, 256);
  // the long streak (a cylinder seen from the side shows it as a vertical stripe)
  g.save();
  g.translate(88, 92);
  g.rotate(-0.5);
  const s = g.createLinearGradient(-30, 0, 30, 0);
  s.addColorStop(0, 'rgba(255,255,255,0)');
  s.addColorStop(0.5, `rgba(255,255,255,${0.55 * glint})`);
  s.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s;
  g.beginPath();
  g.ellipse(0, 0, 16, 74, 0, 0, Math.PI * 2);
  g.fill();
  // the glint
  g.fillStyle = `rgba(255,255,255,${0.95 * glint})`;
  g.beginPath();
  g.ellipse(-4, -18, 9, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return tex(c);
}

/** Chrome: sky above, a hard dark horizon, the warm roof below, a bright rim, one sharp sun glint. */
function chromeCap(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, '#ffffff');
  v.addColorStop(0.32, '#cfe2f2');
  v.addColorStop(0.47, '#8a9bb0');
  v.addColorStop(0.5, '#2c2f3a');
  v.addColorStop(0.56, '#6b6470');
  v.addColorStop(0.8, '#d9b8a8');
  v.addColorStop(1, '#f4e6dc');
  g.fillStyle = v;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  // dark edge, bright rim just inside it
  g.lineWidth = 14;
  g.strokeStyle = '#3a3c46';
  g.beginPath();
  g.arc(128, 128, 121, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.arc(128, 128, 110, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(86, 70, 14, 7, -0.6, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** The engraved steel band: CORRECT, ruler ticks, a serial number and a standards mark, cut in, with clean edges. */
function bandMap(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 96);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1024, 96);
  g.fillStyle = '#3a3c46';
  g.fillRect(0, 0, 1024, 3);
  g.fillRect(0, 93, 1024, 3);
  // ruler ticks along the top edge: every 8 px, longer every 5th and 10th
  for (let i = 0; i * 8 < 1024; i++) g.fillRect(i * 8, 3, 2, i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 9);
  g.textBaseline = 'middle';
  const cut = (text: string, x: number, y: number, size: number) => {
    g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = '#ffffff';
    g.fillText(text, x + 1, y + 1);
    g.fillStyle = '#23252c';
    g.fillText(text, x, y);
  };
  for (let k = 0; k < 2; k++) {
    const o = k * 512;
    cut('CORRECT', o + 20, 58, 34);
    cut('No. 000 000 001', o + 200, 50, 16);
    cut('STD 1:1 · ±0.00', o + 200, 72, 16);
    // a standards mark: a ring with a tick
    g.strokeStyle = '#23252c';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(o + 440, 58, 18, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(o + 430, 58);
    g.lineTo(o + 438, 66);
    g.lineTo(o + 452, 48);
    g.stroke();
  }
  return tex(c);
}

/** Precise diamond knurling (cylinder UV, repeated round the grip). */
function knurlMap(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  for (let x = -64; x < 128; x += 8) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 64, 0);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const mk = (matcap: THREE.Texture, map: THREE.Texture | null = null, color = '#ffffff') =>
  new THREE.MeshMatcapMaterial({ matcap, map, color, transparent: true, fog: false });

/**
 * The sculpted body's surface: the GLB's painted colour and normal map under a neutral gloss matcap. Unlit like the
 * rest of the skin, so the crimson and the steel keep their painted values in the roof's dusk light.
 */
export function sculptSkin(src: THREE.MeshStandardMaterial): THREE.MeshMatcapMaterial {
  sculptCap ??= glossCap('#ffffff', '#e2dde6', '#6f6878', 0.55);
  const m = mk(sculptCap, src.map);
  m.normalMap = src.normalMap;
  m.name = 'red-pen-sculpt';
  return m;
}
let sculptCap: THREE.CanvasTexture | null = null;

export function penSkin(): PenSkin {
  const chrome = chromeCap();
  return {
    lacquer: mk(glossCap('#ff4a50', '#d01a2c', '#4a040c', 1)),
    knurl: mk(chrome, knurlMap(), '#8c8f9c'),
    chrome: mk(chrome),
    band: mk(chrome, bandMap(), '#e9ecf2'),
    eyeWhite: mk(glossCap('#ffffff', '#ecebf4', '#9a98ad', 0.6)),
    iris: mk(glossCap('#7a2a1a', '#3a0c08', '#140303', 0.8)),
    inkDrop: mk(glossCap('#ff4a50', '#c0101e', '#4a0008', 1)),
  };
}
