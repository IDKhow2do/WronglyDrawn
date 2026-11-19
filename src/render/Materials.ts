import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from './PaintTextures';

/*
 * Depth grading, done inside three's own fog chunk (so every fogged material gets it, the paint
 * injection keeps working, and it costs a handful of ALU ops — fine on the Low tier).
 *
 *  - World (everything without WD_ACTOR): aerial perspective that starts a few metres out —
 *    colours desaturate and drift towards the cool haze colour with distance, so background
 *    buildings read as further away instead of getting *more* saturated (as they did: far
 *    walls measured C* 55–65 vs 30–45 near).
 *  - Actors (WD_ACTOR, set by markActor on monsters): no aerial fade, a crisp cool rim on lit
 *    parts that grows with distance, a touch of extra saturation far away, and the classic far
 *    fog kicks in later. Keeps creatures separated from the busy, equally saturated walls.
 */
const AER = { start: 10.0, density: 0.0115, desat: 0.6, haze: 0.55 };
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#if defined( WD_RIM )
  {
    float wdNV = clamp( dot( normalize( nonPerturbedNormal ), normalize( vViewPosition ) ), 0.0, 1.0 );
    float wdFar = smoothstep( 8.0, 40.0, length( vViewPosition ) );
    gl_FragColor.rgb += vec3( 0.78, 0.9, 1.0 ) * smoothstep( 0.5, 0.82, 1.0 - wdNV ) * mix( 0.16, 0.42, wdFar );
  }
#endif
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  #ifdef WD_ACTOR
  {
    float wdL = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    gl_FragColor.rgb = max( mix( vec3( wdL ), gl_FragColor.rgb, 1.0 + 0.2 * smoothstep( 15.0, 45.0, vFogDepth ) ), 0.0 );
    fogFactor *= 0.55;
  }
  #else
  {
    float wdAer = 1.0 - exp( - max( vFogDepth - ${AER.start.toFixed(1)}, 0.0 ) * ${AER.density.toFixed(4)} );
    float wdL = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( wdL ), wdAer * ${AER.desat.toFixed(2)} );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, wdAer * ${AER.haze.toFixed(2)} );
  }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

let gradientMap: THREE.DataTexture | null = null;

/** 3-band toon ramp: readable shading without realism. */
export function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

/** Normal maps derived from paint textures (impasto relief), cached per image. */
const normalCache = new Map<string, THREE.Texture>();

function heightSource(tex: THREE.Texture): CanvasImageSource | null {
  const img = (tex.source?.data ?? tex.image) as CanvasImageSource | undefined;
  return img ?? null;
}

/**
 * Build a tangent-space normal map from a colour (or dedicated height) texture:
 * luminance → height → Sobel. Paint strokes and cobble grout become real relief
 * under the sun, which is most of what makes the painting look "thick".
 */
export function normalFromTexture(tex: THREE.Texture, strength = 2.2): THREE.Texture | null {
  const key = tex.source?.uuid ?? tex.uuid;
  let base = normalCache.get(key);
  if (!base) {
    const src = (tex.userData.heightMap as THREE.Texture | undefined) ?? tex;
    const img = heightSource(src);
    if (!img) return null;
    const w0 = (img as { width: number }).width;
    const h0 = (img as { height: number }).height;
    if (!w0 || !h0) return null;
    const w = Math.min(512, w0);
    const h = Math.min(512, h0);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h);
    const H = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) H[i] = (d.data[i * 4] * 0.3 + d.data[i * 4 + 1] * 0.55 + d.data[i * 4 + 2] * 0.15) / 255;
    const out = g.createImageData(w, h);
    const at = (x: number, y: number) => H[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const o = (y * w + x) * 4;
        out.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
        out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        out.data[o + 2] = (1 / len) * 0.5 * 255 + 127;
        out.data[o + 3] = 255;
      }
    g.putImageData(out, 0, 0);
    base = new THREE.CanvasTexture(c);
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.colorSpace = THREE.NoColorSpace;
    normalCache.set(key, base);
  }
  const n = base.clone();
  n.repeat.copy(tex.repeat);
  n.offset.copy(tex.offset);
  n.needsUpdate = true;
  return n;
}

/**
 * Painted-surface material. Lit physically (soft sun + sky) with impasto
 * relief from a normal map, instead of flat toon bands — closer to the
 * thick-paint look of the concept art. (Type kept as MeshToonMaterial for the
 * shared colour/emissive/map API.)
 */
export function toon(opts: { color?: string | number; map?: THREE.Texture | null; emissive?: string | number; transparent?: boolean; relief?: number }): THREE.MeshToonMaterial {
  const map = opts.map ?? null;
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map,
    emissive: opts.emissive ?? 0x000000,
    transparent: opts.transparent ?? false,
    roughness: 0.88,
    metalness: 0,
  });
  if (map) {
    const n = normalFromTexture(map);
    if (n) {
      m.normalMap = n;
      const r = opts.relief ?? 1;
      m.normalScale.set(r, r);
    }
  }
  return m as unknown as THREE.MeshToonMaterial;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: PAL.black, side: THREE.BackSide });
/** Art styles recolour the ink lines (one shared hull material). */
export function setInkColor(c: string): void {
  outlineMat.color.set(c);
}
/** Monsters' ink: exempt from the aerial fade, so their silhouette stays dark at any distance. */
const actorInk = new THREE.MeshBasicMaterial({ color: '#0c0612', side: THREE.BackSide });
actorInk.defines = { WD_ACTOR: '' };

/**
 * Inverted-hull outline: a black back-face copy scaled so the border has a
 * roughly constant world thickness. Works well for the convex primitives used here.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.035): THREE.Mesh {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  const center = new THREE.Vector3();
  geo.boundingBox!.getCenter(center);
  const hull = new THREE.Mesh(geo, outlineMat);
  hull.name = 'outline';
  // flat, zero-thickness pieces (banners, awnings, decals): a scaled copy lies in their own plane
  // and z-fights with them. Return the hull unattached — callers may still tag it (`.userData…`),
  // but it is never drawn and mergeStaticInk never finds it.
  if (Math.min(size.x, size.y, size.z) < 0.005) {
    hull.userData.isOutline = true;
    hull.visible = false;
    return hull;
  }
  hull.scale.set(
    1 + (2 * thickness) / Math.max(size.x, 0.01),
    1 + (2 * thickness) / Math.max(size.y, 0.01),
    1 + (2 * thickness) / Math.max(size.z, 0.01),
  );
  // keep the hull centred on the geometry's own centre
  hull.position.copy(center).multiplyScalar(1).sub(center.clone().multiply(hull.scale));
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData.isOutline = true;
  hull.userData.ink = { size, center, base: thickness, t: thickness };
  mesh.add(hull);
  return hull;
}

/**
 * Merge every outline hull flagged `userData.staticInk` under `root` (buildings' ink: never moves,
 * never painted, one shared material) into a single mesh — hundreds of draw calls → one.
 */
export function mergeStaticInk(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const hulls: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.staticInk) hulls.push(o as THREE.Mesh);
  });
  if (hulls.length < 2) return 0;
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (const h of hulls) {
    const g = new THREE.BufferGeometry();
    const src = h.geometry.index ? h.geometry.toNonIndexed() : h.geometry;
    g.setAttribute('position', src.getAttribute('position').clone());
    g.applyMatrix4(m.multiplyMatrices(inv, h.matrixWorld));
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  if (!merged) return 0;
  for (const g of geos) g.dispose();
  for (const h of hulls) {
    // the building lost its own hull: the occlusion fader must leave it alone
    if (h.parent) h.parent.userData.inkMerged = true;
    h.removeFromParent();
  }
  const ink = new THREE.Mesh(merged, outlineMat);
  ink.name = 'static-ink';
  ink.userData.isOutline = true;
  ink.userData.noPaint = true;
  ink.castShadow = ink.receiveShadow = false;
  ink.matrixAutoUpdate = false;
  root.add(ink);
  return hulls.length;
}

/** Re-fit an outline hull to a new world thickness (no allocations). */
export function fitOutline(hull: THREE.Mesh, thickness: number): void {
  const ink = hull.userData.ink as { size: THREE.Vector3; center: THREE.Vector3; base: number; t: number } | undefined;
  if (!ink || Math.abs(ink.t - thickness) < 0.002) return;
  ink.t = thickness;
  const { size, center } = ink;
  hull.scale.set(1 + (2 * thickness) / Math.max(size.x, 0.01), 1 + (2 * thickness) / Math.max(size.y, 0.01), 1 + (2 * thickness) / Math.max(size.z, 0.01));
  hull.position.set(center.x * (1 - hull.scale.x), center.y * (1 - hull.scale.y), center.z * (1 - hull.scale.z));
}

/**
 * Ink shell for sculpted (GLB) creatures, which had no outline at all: a back-face copy pushed out
 * along the normals in the vertex shader by a width proportional to view depth, i.e. a roughly
 * constant ≈1.7 px line at any distance (min 1.2 cm up close). Smooth sculpt normals → no cracks.
 */
const inkShell = new THREE.MeshBasicMaterial({ color: '#0c0612', side: THREE.BackSide });
inkShell.defines = { WD_ACTOR: '' };
inkShell.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
  {
    vec3 wdN = normalize( normalMatrix * normal );
    float wdW = max( 0.012, -mvPosition.z * 0.0019 );
    mvPosition.xyz += wdN * wdW;
    gl_Position = projectionMatrix * mvPosition;
  }`,
  );
};
inkShell.customProgramCacheKey = () => 'wdinkshell';

function addInkShell(mesh: THREE.Mesh): THREE.Mesh {
  const shell = new THREE.Mesh(mesh.geometry, inkShell);
  shell.name = 'ink-shell';
  shell.castShadow = shell.receiveShadow = false;
  shell.userData.isOutline = true;
  shell.userData.shell = true;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

/**
 * Tag a creature so the depth grading treats it as an actor (no aerial fade, rim light, dark ink).
 * Call after the paint system has cloned its materials (clones reset `defines`). Returns its outline hulls.
 */
export function markActor(root: THREE.Object3D): THREE.Mesh[] {
  const hulls: THREE.Mesh[] = [];
  const needShell: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
    if (m.userData?.isOutline) {
      if (m.material === outlineMat) m.material = actorInk;
      if (!m.userData.shell) hulls.push(m);
      return;
    }
    // big sculpted meshes without an ink hull get a shell
    if (m.isMesh && (m.geometry?.attributes.position?.count ?? 0) >= 1000 && m.geometry.attributes.normal && !m.children.some((c) => c.userData.isOutline))
      needShell.push(m);
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[];
    for (const mat of mats) {
      if (!mat || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.defines?.WD_ACTOR !== undefined) continue;
      mat.defines = { ...(mat.defines ?? {}), WD_ACTOR: '' };
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) mat.defines.WD_RIM = '';
      mat.needsUpdate = true;
    }
  });
  for (const m of needShell) addInkShell(m);
  return hulls;
}

let blobTex: THREE.Texture | null = null;
/** Soft dark disc for contact shadows (shared). */
export function contactShadowTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

/** Mesh + outline + shadows in one call. */
export function paintedMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  outline = 0.035,
  cast = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline > 0) addOutline(m, outline);
  return m;
}

/**
 * Hand-made wonkiness: jitter the vertices of a box so silhouettes are
 * asymmetrical (shared positions keep the same offset so no cracks appear).
 */
export function wonkyBox(w: number, h: number, d: number, amount = 0.06, seed = 1, topSkew = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cache = new Map<string, THREE.Vector3>();
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let off = cache.get(key);
    if (!off) {
      off = new THREE.Vector3(rand() * amount * w, rand() * amount * h, rand() * amount * d);
      if (pos.getY(i) > 0) off.x += topSkew * w;
      cache.set(key, off);
    }
    pos.setXYZ(i, pos.getX(i) + off.x, pos.getY(i) + off.y, pos.getZ(i) + off.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** Flat decal plane (for graffiti on floors/walls). */
export function decal(tex: THREE.Texture, w: number, h: number, opacity = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  m.renderOrder = 1;
  return m;
}

/** Dispose every geometry/material under an object (textures are shared and cached). */
export function disposeTree(obj: THREE.Object3D): void {
  const shared = new Set<THREE.Material>([outlineMat, actorInk, inkShell]);
  const freeMat = (x: THREE.Material) => {
    if (shared.has(x)) return;
    for (const v of Object.values(x)) if ((v as THREE.Texture | null)?.isTexture && !(v as THREE.Texture).userData?.keep && !(v as THREE.Texture).isRenderTargetTexture) (v as THREE.Texture).dispose(); // pooled paint RTs carry over
    x.dispose();
  };
  obj.traverse((o) => {
    // meshes, lines and points all own GPU buffers (lines/points were skipped → leaked per restart)
    const m = o as THREE.Mesh;
    if (m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
      if (!m.userData.isOutline) m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach(freeMat);
      else if (mat) freeMat(mat);
    }
  });
}
