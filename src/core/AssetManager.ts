/**
 * [INPUT]: 程序贴图、手绘贴图与模型清单。iOS 打包时缩小图片。
 * [OUTPUT]: 载入 Three.js 贴图与可实例化的 GLB 模型。
 * [POS]: 关卡从这里共享贴图和模型。iOS 通过图片元素解码模型贴图。网页端并行拉取文件（FETCHES），iOS 逐个读取以压低解码内存峰值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  PAL,
  arrowDecalCanvas,
  cloudCanvas,
  cobbleCanvas,
  facadeCanvas,
  floorEyeCanvas,
  paintCanvas,
  skyCanvas,
  splatCanvas,
  toTexture,
  waiBodyCanvas,
  woodCanvas,
  type FacadeKind,
} from '../render/PaintTextures';
import { MODEL_MANIFEST, type ModelSlot } from '../assets/manifest';
import { IOS_APP } from '../render/Quality';

export type ProgressFn = (label: string, done: number, total: number) => void;

/** Yield to the browser: next animation frame, or 60 ms if rAF is throttled (background tab). */
const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(fin);
    setTimeout(fin, 60);
  });

/**
 * Central asset cache.
 * - Title artwork (static file in /public/assets).
 * - Procedural paint textures (generated in small batches so the UI never freezes).
 * - Optional GLB models from src/assets/manifest.ts (Tripo replacements).
 */
/**
 * Files fetched at once while loading. One after another, 33 models and ~30 textures cost one network round trip
 * each, which is most of a first load on a slow link. The iOS app reads local files and its limit is the memory
 * peak of decoding, so it keeps one at a time.
 */
const FETCHES = IOS_APP ? 1 : 6;

/** Run `task` over `items`, at most `n` at a time. A task handles its own errors. */
async function pooled<T>(items: readonly T[], n: number, task: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export class AssetManager {
  titleImage: HTMLImageElement | null = null;
  cleanPlateUrl: string | null = null;
  titleImageFound = false;
  readonly textures = new Map<string, THREE.Texture>();
  readonly models = new Map<ModelSlot, THREE.Group>();
  readonly clips = new Map<ModelSlot, THREE.AnimationClip[]>();
  private texturesBuilt = false;

  async loadTitleImage(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.titleImage = img;
        this.titleImageFound = true;
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /** Optional UI-free version of the title art (HUD stickers are real DOM on top). */
  async loadCleanPlate(url: string): Promise<void> {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.cleanPlateUrl = url;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  tex(name: string): THREE.Texture {
    const t = this.textures.get(name);
    if (!t) throw new Error(`texture "${name}" not built`);
    return t;
  }

  /** Generate all procedural textures. Reports real per-texture progress. */
  async buildTextures(onProgress: (label: string, frac: number) => void): Promise<void> {
    if (this.texturesBuilt) {
      onProgress('Paint already mixed', 1);
      return;
    }
    const facades: [string, number, FacadeKind, string, string[]][] = [
      ['facade_sleepy', 3, 'sleepy', PAL.orange, [PAL.pink, PAL.hotpink, PAL.red, PAL.yellow]],
      ['facade_awake', 3, 'awake', PAL.orange, [PAL.pink, PAL.hotpink, PAL.red, PAL.yellow]],
      ['facade_cyclops', 5, 'cyclops', PAL.pink, [PAL.orange, PAL.cobalt, PAL.yellow, PAL.turq]],
      ['facade_teeth', 8, 'teeth', PAL.cobalt, [PAL.pink, PAL.turq, PAL.orange]],
      ['facade_crowns', 13, 'crowns', PAL.turq, [PAL.cobalt, PAL.pink, PAL.yellow]],
      ['facade_plain_a', 21, 'plain', PAL.hotpink, [PAL.orange, PAL.purple, PAL.yellow]],
      ['facade_plain_b', 34, 'plain', PAL.purple, [PAL.cobalt, PAL.pink, PAL.turq]],
      ['facade_nose', 55, 'nose', PAL.yellow, [PAL.orange, PAL.pink, PAL.red]],
    ];
    const jobs: [string, () => THREE.Texture][] = [
      ['ground', () => toTexture(cobbleCanvas(9), 26)],
      ['terrace', () => toTexture(cobbleCanvas(23), 9)],
      ['wood', () => toTexture(woodCanvas(4))],
      ['wai_body', () => toTexture(waiBodyCanvas())],
      ['stone_pink', () => toTexture(paintCanvas({ seed: 31, base: '#e9a3c4', colors: [PAL.pink, PAL.cream, PAL.blue, PAL.orange] }))],
      ['stone_blue', () => toTexture(paintCanvas({ seed: 32, base: PAL.cobalt, colors: [PAL.blue, PAL.turq, PAL.pink, PAL.yellow] }))],
      ['stone_orange', () => toTexture(paintCanvas({ seed: 33, base: PAL.orange, colors: [PAL.yellow, PAL.red, PAL.pink] }))],
      ['stone_purple', () => toTexture(paintCanvas({ seed: 34, base: PAL.violet, colors: [PAL.purple, PAL.pink, PAL.cobalt, PAL.turq] }))],
      ['stone_cream', () => toTexture(paintCanvas({ seed: 35, base: '#e8d6bf', colors: [PAL.cream, PAL.pink, PAL.turq, '#c9b49a'] }))],
      ['metal_dark', () => toTexture(paintCanvas({ seed: 36, base: '#2c2433', colors: [PAL.orange, PAL.red, '#4a3b55', PAL.yellow], strokes: 25 }))],
      ['hill', () => toTexture(paintCanvas({ seed: 41, base: '#8fc25a', colors: ['#c8e07a', PAL.yellow, '#5aa86a', PAL.pink, PAL.turq], strokes: 60 }))],
      ['mutant', () => toTexture(paintCanvas({ seed: 37, base: '#4b2a68', colors: [PAL.purple, '#ff3cf0', PAL.black, PAL.turq], scribbles: 8, splats: 8 }))],
      ['mutant_calm', () => toTexture(paintCanvas({ seed: 38, base: '#9fd8e6', colors: [PAL.turq, PAL.cream, PAL.pink, PAL.yellow], scribbles: 2 }))],
      ['sky', () => {
        const t = toTexture(skyCanvas());
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
      }],
      ['cloud_a', () => toTexture(cloudCanvas(5))],
      ['cloud_b', () => toTexture(cloudCanvas(9))],
      ['floor_eye', () => toTexture(floorEyeCanvas())],
      ['arrow', () => toTexture(arrowDecalCanvas())],
      ...([PAL.cobalt, PAL.pink, PAL.yellow, PAL.turq, PAL.orange].map(
        (c, i) => [`splat_${i}`, () => toTexture(splatCanvas(100 + i, c))] as [string, () => THREE.Texture],
      )),
      ...facades.map(
        ([name, seed, kind, base, acc]) => [name, () => toTexture(facadeCanvas(seed, kind, base, acc))] as [string, () => THREE.Texture],
      ),
    ];
    for (let i = 0; i < jobs.length; i++) {
      const [name, make] = jobs[i];
      const t = make();
      t.name = name;
      this.textures.set(name, t);
      onProgress(`Mixing paint: ${name}`, (i + 1) / jobs.length);
      // yield every couple of textures so the loading screen keeps animating
      if (i % 2 === 1) await nextFrame();
    }
    this.texturesBuilt = true;
  }

  /**
   * Returns a fitted clone of a loaded GLB (feet at y=0, scaled to the
   * manifest height, facing +Z) or null when no override is available.
   */
  instantiateModel(slot: ModelSlot, opts: { pivot?: 'bottom' | 'top' | 'center' | 'raw' } = {}): THREE.Object3D | null {
    const src = this.models.get(slot);
    const entry = MODEL_MANIFEST[slot];
    if (!src || !entry) return null;
    const inner = SkeletonUtils.clone(src) as THREE.Object3D;
    inner.rotation.set(0, entry.yaw ?? 0, 0, 'XYZ');
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const ref = entry.fit === 'length' ? size.z : entry.fit === 'width' ? size.x : size.y;
    const s = entry.height / Math.max(ref, 1e-3);
    inner.scale.setScalar(s);
    inner.updateMatrixWorld(true);
    box.setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    const pivot = opts.pivot ?? 'bottom';
    if (pivot === 'bottom') inner.position.set(-c.x, -box.min.y, -c.z);
    else if (pivot === 'top') inner.position.set(-c.x, -box.max.y, -c.z);
    else if (pivot === 'center') inner.position.set(-c.x, -c.y, -c.z);
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.userData.uniqueUv = true; // Tripo atlases: safe to paint by UV
      }
    });
    const wrap = new THREE.Group();
    wrap.add(inner);
    wrap.userData.inner = inner;
    wrap.userData.clips = this.clips.get(slot) ?? [];
    return wrap;
  }

  /**
   * Hand-painted (Codex) textures from /public/textures. They replace the
   * procedural ones under the same names, so level code doesn't change.
   * Height maps drive the impasto normal maps.
   */
  async loadPaintedTextures(onProgress: (label: string, frac: number) => void): Promise<void> {
    const MAP: [string, string, boolean][] = [
      // [game texture name, file, tileable]
      ['ground', 'cobble_patchwork', true],
      ['terrace', 'cobble_edge', true],
      ['stone_pink', 'plaster_pink', true],
      ['stone_orange', 'plaster_orange', true],
      ['stone_blue', 'plaster_blue', true],
      ['stone_purple', 'plaster_turq', true],
      ['stone_yellow', 'plaster_yellow', true],
      ['stone_cream', 'stone_patchwork', true],
      ['wood', 'wood_planks', true],
      ['roof', 'roof_tiles', true],
      ['metal_dark', 'metal_rust', true],
      ['facade_sleepy', 'mural_sleepy', false],
      ['facade_awake', 'mural_awake', false],
      ['facade_cyclops', 'mural_cyclops', false],
      ['facade_teeth', 'mural_teeth', false],
      ['facade_crowns', 'mural_crowns', false],
      ['facade_nose', 'mural_nose', false],
      ['facade_gatehouse', 'mural_gatehouse', false],
      ['facade_plain_a', 'plaster_yellow', true],
      ['facade_plain_b', 'plaster_pink', true],
    ];
    const loader = new THREE.TextureLoader();
    const base = `${import.meta.env.BASE_URL}textures/`;
    const cache = new Map<string, Promise<THREE.Texture>>();
    const load = (file: string): Promise<THREE.Texture> => {
      let p = cache.get(file);
      if (!p) cache.set(file, (p = loader.loadAsync(`${base}${file}.webp`)));
      return p;
    };
    // fetch every file up front, a few at a time; the loop below then reads them in its own order
    const files = new Set<string>();
    for (const [, file, tile] of MAP) {
      files.add(file);
      if (tile) files.add(`${file}_h`);
    }
    await pooled([...files], FETCHES, (file) => load(file).catch(() => null));
    let done = 0;
    for (const [name, file, tile] of MAP) {
      try {
        const t = (await load(file)).clone();
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        t.anisotropy = IOS_APP ? 4 : 8;
        t.name = name;
        t.needsUpdate = true;
        if (tile) {
          try {
            const hgt = await load(`${file}_h`);
            t.userData.heightMap = hgt;
          } catch {
            /* height map optional */
          }
        }
        // ground: the painted cobble tile covers ~2 m
        if (name === 'ground') t.repeat.set(1, 1);
        this.textures.set(name, t);
      } catch (e) {
        console.warn(`[assets] painted texture ${file} missing — keeping procedural ${name}`, e);
      }
      onProgress(`Hand-painted texture: ${file}`, ++done / MAP.length);
    }
  }

  /**
   * Try to load optional GLB replacements. Missing/failed files are fine:
   * gameplay keeps the procedural placeholder.
   */
  async loadOptionalModels(onProgress: (label: string, frac: number) => void): Promise<void> {
    const entries = Object.entries(MODEL_MANIFEST).filter(([, e]) => !!e?.url) as [ModelSlot, { url: string }][];
    if (entries.length === 0) {
      onProgress('No GLB overrides configured (using procedural models)', 1);
      return;
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (IOS_APP) {
      loader.register((parser) => {
        // 让 WebKit 从图像元素上传贴图，避免额外保留 ImageBitmap。
        parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
        return { name: 'WD_iOS_TextureLoader' };
      });
    }
    let done = 0;
    await pooled(entries, FETCHES, async ([slot, entry]) => {
      if (this.models.has(slot)) {
        done++;
        return;
      }
      try {
        // the manifest writes site-root paths; a TapTap package runs from a subfolder (vite --base ./)
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${entry.url.replace(/^\//, '')}`);
        this.models.set(slot, gltf.scene);
        this.clips.set(slot, gltf.animations);
        onProgress(`Loaded model: ${slot}`, ++done / entries.length);
      } catch (e) {
        console.warn(`[assets] optional model "${slot}" failed (${entry.url}); keeping placeholder`, e);
        onProgress(`Model ${slot} missing, using placeholder`, ++done / entries.length);
      }
    });
  }
}
