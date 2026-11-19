/**
 * [INPUT]: depends on PhysicsWorld (static boxes, convex hulls) from ../core; toon/addOutline from ../render/Materials;
 *          dressWithKit from ./ArchKit; batchStatic from ../render/SceneOptimizer
 * [OUTPUT]: exports wonkyBuilding(), WonkyOpts, WonkyBuilt
 * [POS]: the hand-drawn house builder of src/level. BlindPlaza and MuteHarbor call it.
 *        Every walkable top has a collider whose top equals the drawn top: a flat roof's slab
 *        has its own box collider, and roofTop = ground + h is where feet rest.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import { addOutline, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { dressWithKit } from './ArchKit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { batchStatic } from '../render/SceneOptimizer';

/**
 * Hand-drawn buildings: never a plain box. Walls lean, bulge and taper, the
 * roof is a steep crooked gable with an overhang (too steep to stand on — no
 * rooftop escapes), the base sinks into the ground (nothing floats).
 * Front (+Z local) carries the facade painting (faces), plus a door, a chimney
 * and shutters.
 */
export interface WonkyOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw?: number;
  /** Ground height under the building (lowest point of the footprint). */
  ground: number;
  facade: string;
  side?: string;
  roofColor?: string;
  lean?: number;
  seed?: number;
  /** Flat walkable roof (designed rooftop routes only). */
  flatRoof?: boolean;
  door?: boolean;
  /** Watching eyes on the facade (ambient life). */
  eyes?: boolean;
}

export interface WonkyBuilt {
  group: THREE.Group;
  front: THREE.Mesh;
  /** World points for watching eyes (if requested). */
  eyeSpots: { pos: THREE.Vector3; normal: THREE.Vector3; size: number }[];
  roofTop: number;
}

/** Thickness of a flat roof's terrace slab (m). */
const ROOF_SLAB = 0.35;

function rng(seed: number) {
  let s = seed % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The painted roof-tile brushwork with its colour taken out (each roof tints it its own colour). */
let neutralRoof: THREE.Texture | null = null;
function roofBrush(src: THREE.Texture): THREE.Texture {
  if (neutralRoof) return neutralRoof;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 256, 256);
  const d = g.getImageData(0, 0, 256, 256);
  let sum = 0;
  for (let i = 0; i < d.data.length; i += 4) sum += d.data[i] * 0.3 + d.data[i + 1] * 0.55 + d.data[i + 2] * 0.15;
  const mean = sum / (d.data.length / 4);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = d.data[i] * 0.3 + d.data[i + 1] * 0.55 + d.data[i + 2] * 0.15;
    const v = Math.max(0, Math.min(255, 218 + (l - mean) * 0.9));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.name = 'roof_brush';
  neutralRoof = t;
  return t;
}

export function wonkyBuilding(ctx: GameContext, o: WonkyOpts): WonkyBuilt {
  const { root, physics, assets } = ctx;
  const r = rng((o.seed ?? Math.floor(o.x * 13 + o.z * 7)) + 99);
  const yaw = o.yaw ?? 0;
  const lean = o.lean ?? (r() - 0.5) * 0.06;
  const base = o.ground - 1.2; // foundation sinks into the ground
  // a flat roof's slab sits ON the walls: the walls stop one slab short, so the walkable top is ground + h
  const H = o.h + 1.2 - (o.flatRoof ? ROOF_SLAB : 0);
  const group = new THREE.Group();
  group.position.set(o.x, base, o.z);
  group.rotation.y = yaw;
  root.add(group);

  // ── walls: subdivided box, bent by hand ──
  const geo = new THREE.BoxGeometry(o.w, H, o.d, 4, 8, 4);
  geo.translate(0, H / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const bulge = 0.04 + r() * 0.06;
  const taper = 0.04 + r() * 0.08;
  const twist = (r() - 0.5) * 0.06;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / H;
    const s = 1 + Math.sin(t * Math.PI) * bulge - t * taper;
    x *= s;
    z *= s;
    const a = twist * t;
    [x, z] = [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
    x += lean * y;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const tex = (n: string, rx: number, ry: number) => {
    const t = assets.tex(n).clone();
    t.needsUpdate = true;
    if (t.wrapS !== THREE.ClampToEdgeWrapping) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
    }
    return t;
  };
  const sideName = o.side ?? 'stone_pink';
  const sideX = toon({ map: tex(sideName, Math.max(1, Math.round(o.d / 5)), Math.max(1, Math.round(H / 5))) });
  const sideZ = toon({ map: tex(sideName, Math.max(1, Math.round(o.w / 5)), Math.max(1, Math.round(H / 5))) });
  const frontMat = toon({ map: tex(o.facade, Math.max(1, Math.round(o.w / 8)), 1) });
  const mats = [sideX, sideX, toon({ color: '#5b3b6b' }), sideX, frontMat, sideZ];
  const walls = new THREE.Mesh(geo, mats);
  walls.castShadow = walls.receiveShadow = true;
  addOutline(walls, 0.07).userData.staticInk = true;
  group.add(walls);

  // top of the walls after the hand-bending (for the roof)
  const topS = 1 - taper;
  const tw = (o.w / 2) * topS, td = (o.d / 2) * topS;
  const topX = lean * H;

  // ── roof ──
  let roofTop = base + H;
  let ridgeY: number | null = null;
  let ridgeAlongX = true;
  let cupola = false;
  /** the crooked ridge: local point on it at `a` metres along its length */
  let ridgeAt: ((a: number) => THREE.Vector3) | null = null;
  if (o.flatRoof) {
    // the slab IS the walkable surface: its collider is the drawn box, so feet rest on the drawn top
    const sw = tw + 0.25, sd = td + 0.25;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sw * 2, ROOF_SLAB, sd * 2), toon({ map: tex('terrace', 2, 2) }));
    slab.position.set(topX, H + ROOF_SLAB / 2, 0);
    addOutline(slab, 0.05).userData.staticInk = true;
    group.add(slab);
    group.updateMatrixWorld(true);
    const slabQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    physics.addStaticBox(slab.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(sw, ROOF_SLAB / 2, sd), slabQ);
    roofTop = base + H + ROOF_SLAB;
  } else {
    // steep gable along the longer side; ridge slightly off-centre and crooked
    const along = o.w >= o.d ? 'x' : 'z';
    const span = along === 'x' ? td + 0.45 : tw + 0.45;
    const len = (along === 'x' ? tw : td) + 0.5;
    const rh = span * (1.45 + r() * 0.5); // ≥ 55° pitch
    const off = (r() - 0.5) * span * 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-span, 0);
    shape.lineTo(off, rh);
    shape.lineTo(span, 0);
    shape.lineTo(-span, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: len * 2, bevelEnabled: false });
    rg.translate(0, 0, -len);
    if (along === 'x') rg.rotateY(Math.PI / 2);
    // crooked ridge: shear the far end down a bit
    const rp = rg.attributes.position as THREE.BufferAttribute;
    const sag = (r() - 0.5) * 0.6;
    for (let i = 0; i < rp.count; i++) {
      const k = along === 'x' ? rp.getX(i) / len : rp.getZ(i) / len;
      rp.setY(i, rp.getY(i) * (1 + sag * k * 0.25));
    }
    rg.computeVertexNormals();
    // the prism is now the roof's core: its gable ends show the wall plaster, its slopes sit under the tiles
    const roofCol = o.roofColor ?? ['#e8553f', '#ff6fa8', '#3f7fe8', '#ffb02e', '#2fb8a8', '#8a5ad1'][Math.floor(r() * 6)];
    const gableMat = toon({ map: tex(sideName, 0.2, 0.2) });
    const underMat = toon({ color: new THREE.Color(roofCol).multiplyScalar(0.45).getStyle() });
    const roof = new THREE.Mesh(rg, [gableMat, underMat]);
    roof.position.set(topX, H, 0);
    roof.castShadow = true;
    addOutline(roof, 0.22).userData.staticInk = true;
    group.add(roof);
    // ── tiles, ridge, gable trim, dormer: built in the gable's own frame (x across, y up, z along the ridge) ──
    {
      const rr = rng((o.seed ?? Math.floor(o.x * 13 + o.z * 7)) + 777);
      const frame = new THREE.Group();
      frame.position.set(topX, H, 0);
      if (along === 'x') frame.rotation.y = Math.PI / 2;
      group.add(frame);
      const sagY = (y: number, z: number) => y * (1 + sag * (z / len) * 0.25);
      const P: number[] = [], UV: number[] = [], C: number[] = [];
      // tiles ride well clear of the core prism (closer, and the prism's shadow speckles them in bands)
      const zMax = len + 0.14, COURSE = 0.55, TW = 0.52, LIFT = 0.08, T = 0.15, DROP = 0.09;
      const slope = (side: number) => {
        const ex = side * span, dx = off - ex, L = Math.hypot(dx, rh);
        const ux = dx / L, uy = rh / L;
        let nx = -uy, ny = ux;
        if (nx * side < 0) { nx = -nx; ny = -ny; }
        const pt = (sv: number, z: number, h: number) => {
          P.push(ex + ux * sv + nx * h, sagY(uy * sv + ny * h, z), z);
          UV.push(z * 0.35, sv * 0.35);
        };
        for (let i = 0; ; i++) {
          const sb = -0.32 + i * COURSE;
          if (sb >= L - 0.05) break;
          const st = Math.min(L, sb + COURSE + 0.14);
          const stag = (i % 2) * TW * 0.5;
          for (let z0 = -zMax - stag; z0 < zMax; z0 += TW) {
            const a = Math.max(-zMax, z0), b = Math.min(zMax, z0 + TW);
            if (b - a < 0.08) continue;
            const m = (a + b) / 2;
            // top face (3 tris) + the front lip that makes each course a real step (4 tris)
            const tri = (q: [number, number, number][]) => q.forEach(([sv, z, h]) => pt(sv, z, h));
            tri([[st, a, LIFT], [sb, a, T], [sb - DROP, m, T]]);
            tri([[st, a, LIFT], [sb - DROP, m, T], [st, b, LIFT]]);
            tri([[st, b, LIFT], [sb - DROP, m, T], [sb, b, T]]);
            tri([[sb, a, T], [sb, a, 0.04], [sb - DROP, m, 0.04]]);
            tri([[sb, a, T], [sb - DROP, m, 0.04], [sb - DROP, m, T]]);
            tri([[sb - DROP, m, T], [sb - DROP, m, 0.04], [sb, b, 0.04]]);
            tri([[sb - DROP, m, T], [sb, b, 0.04], [sb, b, T]]);
            // hand-laid: every tile its own shade, now and then a sun-bleached or a mossy one
            const k = rr();
            const sh = 0.8 + rr() * 0.3;
            const col = k < 0.07 ? [1.15, 1.1, 1.0] : k < 0.12 ? [0.72, 0.85, 0.78] : [sh, sh, sh];
            for (let v = 0; v < 21; v++) C.push(col[0], col[1], col[2] * (v >= 9 ? 0.82 : 1));
          }
        }
        return L;
      };
      const Lmax = Math.max(slope(-1), slope(1));
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      tg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      tg.computeVertexNormals();
      const brush = roofBrush(assets.tex('roof'));
      const tileMat = toon({ map: brush, color: roofCol }) as unknown as THREE.MeshStandardMaterial;
      tileMat.vertexColors = true;
      tileMat.side = THREE.DoubleSide;
      const tiles = new THREE.Mesh(tg, tileMat);
      // the core prism under them casts the roof's shadow (two-sided tiles casting onto themselves made dark bands)
      tiles.castShadow = false;
      tiles.receiveShadow = true;
      tiles.userData.noPaint = true;
      frame.add(tiles);
      // ridge cap: a run of fat half-round tiles, a little irregular
      const capMat = toon({ map: brush, color: new THREE.Color(roofCol).multiplyScalar(0.8).getStyle() });
      const caps: THREE.BufferGeometry[] = [];
      for (let z = -zMax - 0.05; z < zMax + 0.05; z += 0.5) {
        const c = new THREE.CylinderGeometry(0.17 + rr() * 0.03, 0.2 + rr() * 0.03, 0.54, 7);
        c.rotateX(Math.PI / 2);
        const zc = z + 0.25;
        c.translate(off, sagY(rh + 0.1, zc) + (rr() - 0.5) * 0.03, zc);
        caps.push(c);
      }
      const ridge = new THREE.Mesh(mergeGeometries(caps)!, capMat);
      ridge.castShadow = true;
      ridge.userData.noPaint = true;
      addOutline(ridge, 0.03).userData.staticInk = true;
      frame.add(ridge);
      // timber gable trim: an A-frame board on each end
      const trimMat = toon({ map: brush, color: '#f6e2c4' });
      const outer = new THREE.Shape();
      outer.moveTo(-span - 0.1, -0.12);
      outer.lineTo(off, rh + 0.16);
      outer.lineTo(span + 0.1, -0.12);
      outer.lineTo(-span - 0.1, -0.12);
      const hole = new THREE.Path();
      const inset = Math.min(0.32, span * 0.3);
      hole.moveTo(-span + inset * 1.6, inset * 0.6);
      hole.lineTo(span - inset * 1.6, inset * 0.6);
      hole.lineTo(off, rh - inset * 1.7);
      hole.lineTo(-span + inset * 1.6, inset * 0.6);
      outer.holes.push(hole);
      for (const e of [-1, 1]) {
        const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false }), trimMat);
        trim.position.z = e > 0 ? len + 0.02 : -len - 0.14;
        trim.scale.y = 1 + sag * e * 0.25;
        trim.castShadow = true;
        trim.userData.noPaint = true;
        addOutline(trim, 0.03).userData.staticInk = true;
        frame.add(trim);
      }
      // a dormer on the bigger roofs
      if (Lmax > 3.4 && rr() < 0.6) {
        const side = rr() < 0.5 ? -1 : 1;
        const ex = side * span, dx = off - ex, L = Math.hypot(dx, rh);
        const sv = L * 0.4;
        const dz = (rr() - 0.5) * len * 0.9;
        const dorm = new THREE.Group();
        dorm.position.set(ex + (dx / L) * sv + side * 0.3, sagY((rh / L) * sv, dz) + 0.25, dz);
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.95), toon({ map: tex(sideName, 1, 1) }));
        addOutline(box, 0.035).userData.staticInk = true;
        const hat = new THREE.Shape();
        hat.moveTo(-0.68, 0);
        hat.lineTo(0, 0.6);
        hat.lineTo(0.68, 0);
        hat.lineTo(-0.68, 0);
        const hg = new THREE.ExtrudeGeometry(hat, { depth: 1.25, bevelEnabled: false });
        hg.translate(0, 0, -0.625);
        hg.rotateY(Math.PI / 2);
        const cap = new THREE.Mesh(hg, capMat);
        cap.position.set(side * 0.05, 0.45, 0);
        addOutline(cap, 0.035).userData.staticInk = true;
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.66), toon({ color: PAL.cream }));
        fr.position.x = side * 0.5;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.5), toon({ color: '#2a2440', emissive: '#3a2a10' }));
        glass.position.x = side * 0.51;
        dorm.add(box, cap, fr, glass);
        dorm.traverse((m) => {
          m.userData.noPaint = true;
          if ((m as THREE.Mesh).isMesh && !m.userData.isOutline) (m as THREE.Mesh).castShadow = true;
        });
        frame.add(dorm);
      }
      // static, unpainted roof dressing: merged per material with the kit at the end (batchStatic)
      frame.traverse((m) => {
        if ((m as THREE.Mesh).isMesh && !m.userData.isOutline) m.userData.batch = true;
      });
    }
    roofTop = base + H + rh;
    ridgeY = H + rh;
    ridgeAlongX = along === 'x';
    // ExtrudeGeometry: shape x → local x (along 'z') or → −z after rotateY(π/2) (along 'x'); the far end sags
    ridgeAt = (a: number) => {
      const y = H + rh * (1 + sag * (a / len) * 0.25);
      return along === 'x' ? new THREE.Vector3(topX + a, y, -off) : new THREE.Vector3(topX + off, y, a);
    };
    // roof collider: convex hull of the prism (too steep to stand on)
    roof.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    const hullPts: number[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      v.fromBufferAttribute(rp, i).applyMatrix4(roof.matrixWorld);
      hullPts.push(v.x, v.y, v.z);
    }
    const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(hullPts));
    if (hull) physics.tag(physics.world.createCollider(hull), 'static');
    // chimney (some houses get a cupola on the ridge instead — art kit)
    cupola = r() < 0.35;
    if (!cupola && r() < 0.8) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, rh * 0.8, 0.6), toon({ map: tex('stone_cream', 1, 1) }));
      ch.position.set(topX + (along === 'x' ? (r() - 0.5) * tw : span * 0.45), H + rh * 0.55, along === 'x' ? span * 0.45 : (r() - 0.5) * td);
      ch.rotation.z = (r() - 0.5) * 0.2;
      addOutline(ch, 0.04).userData.staticInk = true;
      group.add(ch);
    }
  }

  // ── walls collider (rotated box) ──
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  physics.addStaticBox(new THREE.Vector3(o.x, base + H / 2, o.z), new THREE.Vector3(o.w / 2 * (1 + bulge * 0.6), H / 2, o.d / 2 * (1 + bulge * 0.6)), q);

  // ── door + steps (front) ──
  let doorAt: { x: number; y: number } | null = null;
  if (o.door !== false) {
    const dw = 1.4, dh = 2.3;
    const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.2), toon({ map: tex('wood', 1, 1), color: ['#ffb36b', '#7ad0ff', '#ff7aa8'][Math.floor(r() * 3)] }));
    const dx = (r() - 0.5) * (o.w - 3);
    doorAt = { x: dx + lean * 2, y: 1.2 };
    door.position.set(dx + lean * 2, 1.2 + dh / 2, o.d / 2 * (1 + bulge * 0.3) + 0.06);
    addOutline(door, 0.04).userData.staticInk = true;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.35, dh + 0.3, 0.12), toon({ color: PAL.cream }));
    frame.position.set(0, 0.05, -0.08);
    door.add(frame);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon({ color: PAL.yellow }));
    knob.position.set(dw * 0.32, 0, 0.12);
    door.add(knob);
    group.add(door);
  }

  // ── architecture kit: arched windows, balcony, cupola, awning, banner (own seeded random) ──
  // the exact bend the walls got (so pieces sit on the wall, never sunk into it or floating off it)
  const bendAt = (x: number, y: number, z: number) => {
    const t = y / H;
    const sc = 1 + Math.sin(t * Math.PI) * bulge - t * taper;
    x *= sc;
    z *= sc;
    const a = twist * t;
    return new THREE.Vector3(x * Math.cos(a) - z * Math.sin(a) + lean * y, y, x * Math.sin(a) + z * Math.cos(a));
  };
  const kitRnd = rng((o.seed ?? Math.floor(o.x * 13 + o.z * 7)) + 4242);
  dressWithKit(assets, group, { at: bendAt, twist: (y) => -twist * (y / H), H, w: o.w, d: o.d }, kitRnd, {
    roofRidgeY: ridgeY,
    ridgeAlongX,
    door: doorAt,
    replacedChimney: cupola,
    ridgeAt,
  });

  // eye spots on the facade (two "window eyes" high on the front)
  const eyeSpots: WonkyBuilt['eyeSpots'] = [];
  if (o.eyes) {
    group.updateMatrixWorld(true);
    const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const ey = Math.min(H - 2, 1.2 + o.h * 0.68);
    const sep = Math.min(o.w * 0.22, 2.2);
    for (const sx of [-1, 1]) {
      const local = new THREE.Vector3(sx * sep + lean * ey, ey, o.d / 2 * (1 + Math.sin((ey / H) * Math.PI) * bulge - (ey / H) * taper) + 0.05);
      eyeSpots.push({ pos: local.applyMatrix4(group.matrixWorld), normal: nrm.clone(), size: Math.min(1.2, o.w * 0.1) });
    }
  }
  // the kit + roof pieces (dozens of small meshes) → one mesh per material: far fewer draw calls
  batchStatic(group);
  return { group, front: walls, eyeSpots, roofTop };
}
