/**
 * [INPUT]: 场景材质、当前关卡和画风，以及 Quality 提供的 iOS 容器标记。
 * [OUTPUT]: ArtStyle 应用画风，并释放不再使用的派生贴图。
 * [POS]: 同一图像的派生贴图共享像素源。iOS 在换画风和离开会话时清空缓存。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { setInkColor } from './Materials';
import { installComicShading, isLit } from './ComicShading';
import { Look } from './Look';
import { IOS_APP } from './Quality';

installComicShading();

/**
 * Switchable art styles (pause → Art style). A style restyles the running level in place,
 * with no shader recompiles:
 *  · surfaces — materials get this style's own copies of their painted textures
 *    (kept as-is, softened, or tone-mapped onto a small palette ramp per surface family),
 *  · light — sun / sky / ambient colours and strength, exposure,
 *  · air — distance haze colour and depth (the fog chunk also drives aerial perspective),
 *  · sky — a painted gradient,
 *  · ink — outline colour,
 *  · grade + paper — a colour grade and a paper-grain layer (the renderer's final pass, Grade.ts).
 */
export type StyleId = 'graffiti' | 'desert' | 'storybook' | 'riso';

type Ramp = [string, string, string];
type Family = 'ground' | 'clay' | 'cool' | 'ochre' | 'wood' | 'roof' | 'metal' | 'mural' | 'green';

interface StyleDef {
  id: StyleId;
  name: string;
  desc: string;
  /** The style's colour grade as a CSS-filter-style chain (the renderer's final pass applies it, composed with the health grade). */
  css: string;
  exposure: number;
  sun: { color: string; k: number } | null;
  hemi: { sky: string; ground: string; k: number } | null;
  amb: number;
  fog: { color: string; near: number; far: number } | null;
  sky: [string, string, string] | null;
  /** 'keep' = the hand-painted textures; 'soft' = washed (blurred, lower contrast); 'ramp' = tone-mapped onto palette ramps */
  surface: 'keep' | 'soft' | 'ramp';
  /** how much of the texture's own light/dark detail survives (ramp/soft) */
  detail: number;
  ramps?: Partial<Record<Family, Ramp>>;
  ink: string;
  paper: number;
  paperTint: string;
  /** Mute Harbor at dusk: sky, haze and light overrides */
  dusk?: Pick<StyleDef, 'sky' | 'fog' | 'sun' | 'hemi' | 'exposure'>;
  /** clean screen-space ink lines instead of the outline hulls */
  lines: boolean;
  /** two-tone light + hatching in shadow, no paint relief */
  toon: boolean;
}

export const STYLES: StyleDef[] = [
  {
    id: 'graffiti',
    name: 'Graffiti',
    desc: 'The original: loud hand-painted walls.',
    css: '',
    exposure: 1.15,
    sun: null,
    hemi: null,
    amb: 1,
    fog: null,
    sky: null,
    surface: 'keep',
    lines: false,
    toon: false,
    detail: 1,
    ink: '#141014',
    paper: 0,
    paperTint: 'transparent',
  },
  {
    // after the clean-line, sun-bleached look of Franco-Belgian sci-fi comics
    id: 'desert',
    dusk: {
      sky: ['#5c55a6', '#d99aa2', '#f4c8a6'],
      fog: { color: '#d9aeb4', near: 0.6, far: 1.3 },
      sun: { color: '#ffc08e', k: 1.1 },
      hemi: { sky: '#cbbfe6', ground: '#d99a8a', k: 1.05 },
      exposure: 1.18,
    },
    name: 'Sunbleached Comic',
    desc: 'Clean ink, sandy pastels, warm haze.',
    css: 'saturate(0.78) contrast(0.95) brightness(1.03)',
    exposure: 1.22,
    sun: { color: '#fff0d8', k: 1.15 },
    hemi: { sky: '#e9e4f2', ground: '#e0b394', k: 1.05 },
    amb: 1.1,
    fog: { color: '#ecd8cc', near: 0.6, far: 1.4 },
    sky: ['#6f98e0', '#a8c2ee', '#f2dccb'],
    surface: 'ramp',
    lines: true,
    toon: true,
    detail: 0.62,
    ramps: {
      ground: ['#b98c6c', '#e2c3a0', '#f5e7d0'],
      clay: ['#a8705a', '#d9a387', '#f2d2b6'],
      cool: ['#7a789f', '#aeaacb', '#e2dcec'],
      ochre: ['#a8824e', '#dcbc84', '#f5e6c4'],
      wood: ['#73503e', '#ab7f62', '#dcb995'],
      roof: ['#94584a', '#c98a72', '#efc3aa'],
      metal: ['#45404e', '#77707f', '#a9a1ad'],
      green: ['#7f8a5a', '#b4b98a', '#e4e0bc'],
      mural: ['#3a2a28', '#c9a68c', '#f8eedc'],
    },
    ink: '#3b2b2a',
    paper: 0.16,
    paperTint: '#f3e3cf',
  },
  {
    id: 'storybook',
    dusk: {
      sky: ['#8790d0', '#e6bccd', '#f7e0cf'],
      fog: { color: '#eed8d8', near: 0.95, far: 1.15 },
      sun: { color: '#ffd9b8', k: 1.0 },
      hemi: { sky: '#dcd6f4', ground: '#ecc2c4', k: 1.1 },
      exposure: 1.18,
    },
    name: 'Storybook',
    desc: 'Soft watercolour washes on warm paper.',
    css: 'saturate(0.82) contrast(0.9) brightness(1.06)',
    exposure: 1.2,
    sun: { color: '#fff4e2', k: 1.0 },
    hemi: { sky: '#e6eefc', ground: '#e8c4c8', k: 1.1 },
    amb: 1.15,
    fog: { color: '#f2e9dc', near: 0.95, far: 1.1 },
    sky: ['#a9c6ee', '#d2e2f4', '#fbf1e2'],
    surface: 'soft',
    lines: true,
    toon: false,
    detail: 0.55,
    ink: '#4a3e55',
    paper: 0.26,
    paperTint: '#f6ead6',
  },
  {
    id: 'riso',
    dusk: {
      sky: ['#3f4aa8', '#c88fbd', '#f2c9bb'],
      fog: { color: '#e2bfc8', near: 0.5, far: 0.85 },
      sun: { color: '#ffb8a0', k: 1.05 },
      hemi: { sky: '#b7b4ec', ground: '#ec9a94', k: 1.0 },
      exposure: 1.08,
    },
    name: 'Riso Print',
    desc: 'Two inks on paper: blue and coral.',
    css: 'contrast(1.05)',
    exposure: 1.1,
    sun: { color: '#ffd9c4', k: 1.1 },
    hemi: { sky: '#c9c8f2', ground: '#f2a49a', k: 1.0 },
    amb: 1,
    fog: { color: '#f1ddd2', near: 0.45, far: 0.75 },
    sky: ['#6f86d6', '#b9b8e8', '#f6dccf'],
    surface: 'ramp',
    lines: true,
    toon: true,
    detail: 0.85,
    ramps: {
      ground: ['#3d4c9e', '#f0b2a6', '#f8ece0'],
      clay: ['#3a4594', '#f2a69e', '#fae6da'],
      cool: ['#2e3b8c', '#7f8fdc', '#e6e0ee'],
      ochre: ['#4a4f98', '#f0a080', '#faebd6'],
      wood: ['#34407f', '#9aa2dc', '#f2e2d6'],
      roof: ['#3a3f8c', '#f0948e', '#f8d4ca'],
      metal: ['#262f6e', '#6f78b8', '#c9c6e0'],
      green: ['#33508e', '#8fb0b0', '#eae4d4'],
      mural: ['#26307a', '#eea19a', '#faeadb'],
    },
    ink: '#232a6a',
    paper: 0.3,
    paperTint: '#f7e9da',
  },
];

/** Which palette family each painted surface belongs to. */
const FAMILY: Record<string, Family> = {
  ground: 'ground',
  terrace: 'ground',
  stone_cream: 'ground',
  stone_pink: 'clay',
  stone_orange: 'clay',
  facade_plain_b: 'clay',
  stone_blue: 'cool',
  stone_purple: 'cool',
  stone_yellow: 'ochre',
  facade_plain_a: 'ochre',
  wood: 'wood',
  roof: 'roof',
  metal_dark: 'metal',
  hill: 'green',
};
const isMural = (name: string) => name.startsWith('facade_') && !FAMILY[name];

const KEY = 'wd.style';

/** A material's own colour before any style touched it (stored as numbers so clones keep it). */
function origColor(m: THREE.MeshStandardMaterial): THREE.Color {
  const u = m.userData as { wdColor?: unknown };
  if (!Array.isArray(u.wdColor)) u.wdColor = m.color.toArray();
  return new THREE.Color().fromArray(u.wdColor as number[]);
}

/** Palette family of a colour by hue (0..1 sRGB). */
function classify(r: number, g: number, b: number): Family {
  const c = new THREE.Color(r, g, b);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.s < 0.16) return hsl.l < 0.35 ? 'metal' : 'ground';
  const h = hsl.h;
  if (h < 0.035 || h >= 0.93) return 'roof';
  if (h < 0.11) return 'clay';
  if (h < 0.19) return 'ochre';
  if (h < 0.45) return 'green';
  if (h < 0.84) return 'cool';
  return 'clay';
}

function rampAt(ramp: [number, number, number][], v: number): [number, number, number] {
  const [a, b] = v < 0.5 ? [ramp[0], ramp[1]] : [ramp[1], ramp[2]];
  const k = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function hex(c: string): [number, number, number] {
  const v = new THREE.Color(c);
  return [v.r * 255, v.g * 255, v.b * 255];
}

class ArtStyleManager {
  id: StyleId = 'graffiti';
  private cache = new Map<string, THREE.TextureSource<HTMLCanvasElement>>();
  private fogOrig = new WeakMap<THREE.Fog, { color: THREE.Color; near: number; far: number }>();
  onChange: (() => void) | null = null;

  constructor() {
    const want = new URLSearchParams(location.search).get('style') ?? localStorage.getItem(KEY);
    if (STYLES.some((s) => s.id === want)) this.id = want as StyleId;
  }

  /** The level being styled (Mute Harbor takes each style's dusk variant). */
  level = 'plaza';
  get def(): StyleDef {
    const d = STYLES.find((s) => s.id === this.id)!;
    return this.level === 'harbor' && d.dusk ? { ...d, ...d.dusk } : d;
  }

  /** CSS grade for the canvas (main composes it with the health grade). */
  get css(): string {
    // the art style's own grade, then the player's LOOK on top
    return `${this.def.css} ${Look.css}`.trim();
  }

  /** (kept for the app's boot call; textures are restyled per material) */
  bindTextures(_t: Map<string, THREE.Texture>): void {}

  set(id: StyleId, scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    if (!STYLES.some((s) => s.id === id)) return;
    if (IOS_APP && id !== this.id) this.releaseTextures();
    this.id = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
    this.apply(scene, renderer);
    this.onChange?.();
  }

  releaseTextures(): void {
    for (const texture of this.styledByKey.values()) texture.dispose();
    this.styledByKey.clear();
    this.cache.clear();
  }

  /** Apply the current style to everything in `scene` (call after a level is built, and on change). */
  apply(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const d = this.def;
    renderer.toneMappingExposure = d.exposure;
    setInkColor(d.ink);
    this.applySurfaces(scene);
    this.applyLights(scene);
    this.applyFog(scene);
    this.applyPaper();
    this.applyShading(scene);
    this.setInk(d.lines, d.ink);
  }

  /** The renderer's ink pass (set by the app). */
  setInk: (on: boolean, color: string) => void = () => {};

  /** Did the last apply change shader variants (a recompile is due)? */
  needsCompile = false;

  // ───────────── shading: comic define, paint relief, outline hulls ─────────────
  private applyShading(scene: THREE.Scene): void {
    const d = this.def;
    this.needsCompile = false;
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.Sprite).isSprite) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        // the scribbled graffiti cloud sprites give way to the painted sky's own clouds
        const mapName = ((m as THREE.SpriteMaterial).map?.name ?? '').split('|')[0];
        if (mapName.startsWith('cloud_')) {
          m.visible = !d.sky;
          continue;
        }
        // outline hulls: the ink pass draws the lines instead
        if (o.userData.isOutline) {
          m.visible = !d.lines;
          continue;
        }
        if (!isLit(m)) continue;
        const defs = (m.defines ??= {}) as Record<string, unknown>;
        const has = 'WD_TOON' in defs;
        if (d.toon !== has) {
          if (d.toon) defs.WD_TOON = '';
          else delete defs.WD_TOON;
          m.needsUpdate = true;
          this.needsCompile = true;
        }
        // flat planes: no impasto relief in comic shading
        const sm = m as THREE.MeshStandardMaterial;
        if (sm.normalMap && sm.normalScale) {
          const u = sm.userData as { wdNs?: number[] };
          if (!Array.isArray(u.wdNs)) u.wdNs = sm.normalScale.toArray();
          if (d.toon) sm.normalScale.set(u.wdNs[0] * 0.15, u.wdNs[1] * 0.15);
          else sm.normalScale.fromArray(u.wdNs);
        }
      }
    });
  }

  // ───────────── surfaces ─────────────
  /** WAI and other things that keep their own colours (creatures are excluded via WD_ACTOR). */
  exclude: () => THREE.Object3D[] = () => [];

  private applySurfaces(scene: THREE.Scene): void {
    const d = this.def;
    const skip = new Set<THREE.Object3D>();
    for (const r of this.exclude()) r.traverse((o) => skip.add(o));
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || skip.has(o) || o.userData.isOutline) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        if ((m.defines as Record<string, unknown> | undefined)?.WD_ACTOR !== undefined || m.transparent || m.alphaTest > 0) continue;
        const sm = m as THREE.MeshStandardMaterial;
        try {
          if (sm.map) {
            sm.map = this.styledTex(this.origTex(sm, 'map', sm.map));
            // a strong tint multiplied over the texture (roofs, trims) would bring the loud colour back
            if (sm.color && (sm.isMeshStandardMaterial || (m as THREE.MeshToonMaterial).isMeshToonMaterial)) this.restyleTint(sm, d);
          } else if ((sm.isMeshStandardMaterial || (m as THREE.MeshToonMaterial).isMeshToonMaterial) && sm.color) this.restyleColor(sm, d);
        } catch (e) {
          // one odd material must never stop the rest of the level from restyling
          console.warn('[style] skipped a material', e);
        }
      }
    });
    // textures held in custom shader uniforms (terrain / water blends) restyle too
    scene.traverse((o) => {
      const mt = (o as THREE.Mesh).material;
      for (const m of mt ? (Array.isArray(mt) ? mt : [mt]) : []) {
        const u = (m as THREE.ShaderMaterial).uniforms;
        if (!u) continue;
        for (const [k, x] of Object.entries(u)) if ((x?.value as THREE.Texture)?.isTexture) x.value = this.styledTex(this.origTex(m, `u:${k}`, x.value as THREE.Texture));
      }
    });
  }

  /**
   * A material slot's original texture (remembered the first time a style touches it).
   * Styles never edit a texture in place: three caches the GPU copy per sampling settings, so a
   * swapped image would never reach the screen — each style gets its own texture objects instead.
   */
  private origTexOf = new WeakMap<THREE.Material, Map<string, THREE.Texture>>();
  private styledSet = new WeakSet<THREE.Texture>();
  private origTex(m: THREE.Material, slot: string, cur: THREE.Texture): THREE.Texture {
    let per = this.origTexOf.get(m);
    if (!per) this.origTexOf.set(m, (per = new Map()));
    // the material's texture was replaced by someone else since (not one of ours): that's the new original
    if (!per.has(slot) || !this.styledSet.has(cur)) per.set(slot, cur);
    return per.get(slot)!;
  }

  /** This style's version of `t` (the original itself for untouched kinds / the Graffiti style). */
  private styledByKey = new Map<string, THREE.Texture>();
  private styledTex(t: THREE.Texture): THREE.Texture {
    const name = (t.name || '').split('|')[0];
    if (!t.image || name === 'wai_body' || name === 'floor_eye' || name === 'arrow' || name.startsWith('splat_') || name.startsWith('cloud_')) return t;
    const orig = t.image as CanvasImageSource & { width: number; height: number };
    if (!(orig.width > 0)) return t;
    const d = this.def;
    const isSky = name === 'sky' || name.endsWith('_sky');
    if (isSky ? !d.sky : d.surface === 'keep') return t;
    const key = `${d.id}|${t.uuid}`;
    let out = this.styledByKey.get(key);
    if (!out) {
      out = t.clone();
      // 采样参数仍由各 Texture 保存。Three.js 可复用同源同采样的 GPU 纹理。
      out.source = isSky ? this.skySource(d.sky!) : this.processedSource(name, orig, t.source.uuid);
      out.needsUpdate = true;
      this.styledSet.add(out);
      this.styledByKey.set(key, out);
    }
    return out;
  }

  /** Tint over a restyled texture: pulled towards the light end of its palette family. */
  private restyleTint(m: THREE.MeshStandardMaterial, d: StyleDef): void {
    const o = origColor(m);
    m.color.copy(o);
    const lin = o.clone().convertLinearToSRGB();
    if (d.surface === 'keep' || Math.min(lin.r, lin.g, lin.b) > 0.85) return;
    if (d.surface === 'soft') {
      m.color.lerp(new THREE.Color('#ffffff'), 0.35);
      return;
    }
    const ramp = (d.ramps?.[classify(lin.r, lin.g, lin.b)] ?? d.ramps?.ground)!;
    const [r, g, b] = hex(ramp[2]);
    // near-white with a hint of the family: the restyled texture carries the colour (warm × warm = red)
    const tint = new THREE.Color('#fffaf4').lerp(new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace), 0.3);
    m.color.copy(o).lerp(tint, 0.88);
  }

  /** Untextured paint (bollards, benches, trims): pulled towards the style's palette. */
  private restyleColor(m: THREE.MeshStandardMaterial, d: StyleDef): void {
    const o = origColor(m);
    m.color.copy(o);
    if (d.surface === 'keep') return;
    if (d.surface === 'soft') {
      m.color.lerp(new THREE.Color('#fbf3e6'), 0.16);
      return;
    }
    const lin = o.clone().convertLinearToSRGB();
    const fam = classify(lin.r, lin.g, lin.b);
    const ramp = (d.ramps?.[fam] ?? d.ramps?.ground)!;
    const l = lin.r * 0.299 + lin.g * 0.587 + lin.b * 0.114;
    const t = THREE.MathUtils.clamp(0.25 + l * 0.75, 0, 1);
    const target = rampAt(ramp.map(hex), t);
    m.color.copy(o).lerp(new THREE.Color().setRGB(target[0] / 255, target[1] / 255, target[2] / 255, THREE.SRGBColorSpace), 0.72);
  }

  private processedSource(name: string, img: CanvasImageSource & { width: number; height: number }, uid: string): THREE.TextureSource<HTMLCanvasElement> {
    const d = this.def;
    const key = `${d.id}|${uid}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    // multi-colour painted pictures (murals, facades, models) keep their drawing: tone-map by brightness
    const mural = isMural(name) || name.startsWith('Color') || (!FAMILY[name] && (img as ImageBitmap) instanceof ImageBitmap) || (!FAMILY[name] && img.width >= 512);
    // work size: murals keep their line drawing; tileable surfaces get washed broader
    const W = mural ? 512 : d.surface === 'soft' ? 128 : 256;
    const H = Math.max(8, Math.round((W * img.height) / Math.max(1, img.width)));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    const id = g.getImageData(0, 0, W, H);
    const px = id.data;
    // mean luminance → keep only `detail` of the deviation from it (flattens the busy impasto)
    let sum = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let i = 0; i < px.length; i += 4) {
      sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      sr += px[i];
      sg += px[i + 1];
      sb += px[i + 2];
    }
    const n = px.length / 4;
    const mean = sum / n;
    const keep = mural ? Math.max(0.75, d.detail) : d.detail;
    if (d.surface === 'ramp') {
      const fam: Family = mural ? 'mural' : (FAMILY[name] ?? classify(sr / n / 255, sg / n / 255, sb / n / 255));
      const ramp = (d.ramps?.[fam] ?? d.ramps?.ground ?? ['#806060', '#c0a090', '#f0e0d0']).map(hex);
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        // murals: stretch around the middle (line art stays dark); surfaces: centred on a light mid-tone
        let v = mural ? l / 255 : 0.62 + ((l - mean) / 255) * keep * 1.6;
        v = THREE.MathUtils.clamp(v, 0, 1);
        const [a, b] = v < 0.5 ? [ramp[0], ramp[1]] : [ramp[1], ramp[2]];
        const k = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
        px[i] = a[0] + (b[0] - a[0]) * k;
        px[i + 1] = a[1] + (b[1] - a[1]) * k;
        px[i + 2] = a[2] + (b[2] - a[2]) * k;
      }
    } else {
      // soft: keep hue, wash the value contrast and lift towards paper white
      for (let i = 0; i < px.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) {
          const v = px[i + ch];
          const washed = mean + (v - mean) * keep;
          px[i + ch] = washed * 0.86 + 255 * 0.14;
        }
      }
    }
    g.putImageData(id, 0, 0);
    // upscale smoothly (tileables) so the wash reads as soft brushwork, not pixels
    const out = document.createElement('canvas');
    out.width = mural ? W : 256;
    out.height = mural ? H : Math.round((256 * H) / W);
    const og = out.getContext('2d')!;
    og.imageSmoothingEnabled = true;
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, 0, 0, out.width, out.height);
    const source = new THREE.TextureSource(out);
    this.cache.set(key, source);
    return source;
  }

  /**
   * Painted panorama for the sky sphere (u = around, v = up; canvas row 256 = horizon):
   * gradient, a warm glow where the sun sits, a haze band on the horizon and rows of
   * flat-bottomed cumulus (the ink pass outlines them like a pen drawing).
   */
  private skySource([top, mid, low]: [string, string, string]): THREE.TextureSource<HTMLCanvasElement> {
    const key = `${this.id}|${this.level}|sky`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const W = 2048;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, top);
    gr.addColorStop(0.36, mid);
    gr.addColorStop(0.49, low);
    gr.addColorStop(1, low);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // sun glow (wraps across the seam)
    const sun = (x: number) => {
      const r = g.createRadialGradient(x, 150, 0, x, 150, 260);
      r.addColorStop(0, 'rgba(255, 248, 228, 0.85)');
      r.addColorStop(0.18, 'rgba(255, 238, 210, 0.45)');
      r.addColorStop(1, 'rgba(255, 238, 210, 0)');
      g.fillStyle = r;
      g.fillRect(x - 260, 0, 520, H);
    };
    sun(W * 0.3);
    sun(W * 0.3 + W);
    // horizon haze band
    const hz = g.createLinearGradient(0, 200, 0, 270);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(0.7, low);
    hz.addColorStop(1, low);
    g.fillStyle = hz;
    g.fillRect(0, 200, W, 70);
    // cumulus: rounded tops, flat bottoms, a cooler shaded underside
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cloud = (cx: number, base: number, w: number, hgt: number) => {
      const off = document.createElement('canvas');
      off.width = Math.ceil(w + 40);
      off.height = Math.ceil(hgt + 20);
      const o = off.getContext('2d')!;
      const n = 5 + Math.floor(rnd() * 4);
      o.fillStyle = '#fbf4e8';
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const r = hgt * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + rnd() * 0.35);
        o.beginPath();
        o.arc(20 + t * w, off.height - 10, r, 0, Math.PI * 2);
        o.fill();
      }
      // underside shade, then a flat cut at the base
      const sh = o.createLinearGradient(0, off.height - 10 - hgt * 0.45, 0, off.height - 10);
      sh.addColorStop(0, 'rgba(200, 196, 228, 0)');
      sh.addColorStop(1, 'rgba(200, 196, 228, 0.75)');
      o.globalCompositeOperation = 'source-atop';
      o.fillStyle = sh;
      o.fillRect(0, 0, off.width, off.height);
      o.globalCompositeOperation = 'destination-out';
      o.fillRect(0, off.height - 10, off.width, 10);
      for (const dx of [0, W, -W]) g.drawImage(off, cx - off.width / 2 + dx, base - off.height + 10);
    };
    for (let i = 0; i < 22; i++) {
      const row = i % 3;
      const base = [238, 214, 178][row];
      const w = [90, 150, 220][row] * (0.7 + rnd() * 0.6);
      cloud(rnd() * W, base + rnd() * 10, w, w * (0.28 + rnd() * 0.12));
    }
    const source = new THREE.TextureSource(c);
    this.cache.set(key, source);
    return source;
  }

  // ───────────── light ─────────────
  private applyLights(scene: THREE.Scene): void {
    const d = this.def;
    scene.traverse((o) => {
      const l = o as THREE.Light;
      if (!l.isLight) return;
      // originals as plain numbers: they survive clone()/JSON (a Color object would not)
      const u = l.userData as {
        wdOrig?: { c: number[]; g?: number[]; k: number };
      };
      if (!u.wdOrig)
        u.wdOrig = {
          c: l.color.toArray(),
          g: (l as THREE.HemisphereLight).groundColor?.toArray(),
          k: l.intensity,
        };
      const o0 = {
        color: new THREE.Color().fromArray(u.wdOrig.c),
        ground: u.wdOrig.g ? new THREE.Color().fromArray(u.wdOrig.g) : undefined,
        k: u.wdOrig.k,
      };
      l.color.copy(o0.color);
      l.intensity = o0.k;
      if ((l as THREE.HemisphereLight).isHemisphereLight) {
        const h = l as THREE.HemisphereLight;
        if (o0.ground) h.groundColor.copy(o0.ground);
        if (d.hemi) {
          h.color.set(d.hemi.sky);
          h.groundColor.set(d.hemi.ground);
          h.intensity = o0.k * d.hemi.k;
        }
      } else if ((l as THREE.DirectionalLight).isDirectionalLight) {
        if (d.sun) {
          l.color.set(d.sun.color);
          l.intensity = o0.k * d.sun.k;
        }
      } else if ((l as THREE.AmbientLight).isAmbientLight) l.intensity = o0.k * d.amb;
    });
  }

  private applyFog(scene: THREE.Scene): void {
    const f = scene.fog as THREE.Fog | null;
    if (!f || !(f as THREE.Fog).isFog) return;
    if (!this.fogOrig.has(f)) this.fogOrig.set(f, { color: f.color.clone(), near: f.near, far: f.far });
    const o = this.fogOrig.get(f)!;
    const d = this.def.fog;
    f.color.copy(o.color);
    f.near = o.near;
    f.far = o.far;
    if (d) {
      f.color.set(d.color);
      f.near = o.near * d.near;
      f.far = o.far * d.far;
    }
  }

  // ───────────── paper ─────────────
  /** Re-apply the paper layer (the LOOK's grain changed). */
  refreshPaper(): void {
    this.applyPaper();
  }

  private applyPaper(): void {
    const d = this.def;
    // the paper grain is part of the renderer's final pass now (Grade.ts), not a blend-mode layer
    Look.target?.setPaper({ amount: Math.min(0.75, d.paper + Look.grain * 0.5), tint: d.paperTint });
    Look.apply();
    document.body.dataset.style = d.id;
  }
}

export const ArtStyle = new ArtStyleManager();
