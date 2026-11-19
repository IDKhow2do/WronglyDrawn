import * as THREE from 'three';
import type { OrganType } from '../organs/Organ';

/**
 * Hand-painted organ art (Codex): die-cut sticker images + textures for the 3D
 * organs. Filled by AssetManager at load; everything falls back gracefully.
 */
export const ORGAN_ART: {
  iris?: THREE.Texture;
  lips?: THREE.Texture;
  sock?: THREE.Texture;
  stickers: Partial<Record<string, THREE.Texture>>;
} = { stickers: {} };

const FILE: Record<OrganType, string> = { EYE: 'eye', MOUTH: 'mouth', LEG: 'legs' };

export function stickerKey(type: OrganType, corrupted: boolean): string {
  return FILE[type] + (corrupted ? '_corrupted' : '');
}

/** URL of the sticker image (HUD cards). */
export function stickerUrl(type: OrganType, corrupted: boolean): string {
  return `${import.meta.env.BASE_URL}assets/stickers/${stickerKey(type, corrupted)}.webp`;
}

export async function loadOrganArt(): Promise<void> {
  const loader = new THREE.TextureLoader();
  const tex = async (url: string, srgb = true) => {
    try {
      const t = await loader.loadAsync(url);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    } catch {
      return undefined;
    }
  };
  const base = import.meta.env.BASE_URL;
  const [iris, lips, sock] = await Promise.all([tex(`${base}textures/organ_eye_iris.webp`), tex(`${base}textures/organ_lips.webp`), tex(`${base}textures/organ_sock.webp`)]);
  ORGAN_ART.iris = iris;
  ORGAN_ART.lips = lips;
  if (sock) {
    sock.wrapS = sock.wrapT = THREE.RepeatWrapping;
    ORGAN_ART.sock = sock;
  }
  const names = ['eye', 'mouth', 'legs', 'eye_corrupted', 'mouth_corrupted', 'legs_corrupted'];
  const loaded = await Promise.all(names.map((n) => tex(`${base}assets/stickers/${n}.webp`)));
  names.forEach((n, i) => (ORGAN_ART.stickers[n] = loaded[i]));
}

const urlCache = new Map<string, string>();
/** HUD/DOM version of the crisp die-cut sticker (thin white border, no soft painted shadow). */
export function crispStickerUrl(type: OrganType, corrupted: boolean): string {
  const key = stickerKey(type, corrupted);
  const hit = urlCache.get(key);
  if (hit) return hit;
  const c = crispSticker(key)?.art.image as HTMLCanvasElement | undefined;
  if (!c || !c.toDataURL) return stickerUrl(type, corrupted);
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

const crispCache = new Map<string, { art: THREE.Texture; sil: THREE.Texture }>();
/**
 * A crisp die-cut version of a sticker image: the painted soft drop shadow
 * around the white border is removed and the edge is cut hard, so a sticker
 * is just the art + a thin white border (no grey/white haze). `sil` is the
 * plain white silhouette (vinyl back / edge). Null if the art isn't loaded.
 */
export function crispSticker(key: string): { art: THREE.Texture; sil: THREE.Texture } | null {
  const hit = crispCache.get(key);
  if (hit) return hit;
  const src = ORGAN_ART.stickers[key]?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!src || !src.width) return null;
  const w = src.width;
  const h = src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const s = document.createElement('canvas');
  s.width = w;
  s.height = h;
  const sg = s.getContext('2d')!;
  const sil = sg.createImageData(w, h);
  const sd = sil.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    // the soft shadow is dark and translucent; the vinyl border is bright
    const keep = a >= 245 || (a >= 120 && lum > 150);
    d[i + 3] = keep ? 255 : 0;
    sd[i] = sd[i + 1] = sd[i + 2] = 255;
    sd[i + 3] = keep ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  sg.putImageData(sil, 0, 0);
  const art = new THREE.CanvasTexture(c);
  art.colorSpace = THREE.SRGBColorSpace;
  art.anisotropy = 8;
  const silT = new THREE.CanvasTexture(s);
  silT.anisotropy = 8;
  const out = { art, sil: silT };
  crispCache.set(key, out);
  return out;
}
