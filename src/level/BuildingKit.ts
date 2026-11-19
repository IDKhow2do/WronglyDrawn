import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { PAL, rng } from '../render/PaintTextures';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';

export type Face = '+x' | '-x' | '+z' | '-z';

const FRAME_COLS = [PAL.turq, PAL.yellow, PAL.orange, PAL.cobalt, PAL.cream];
let grassTex: THREE.CanvasTexture | null = null;

function grassTexture(): THREE.CanvasTexture {
  if (grassTex) return grassTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 22; i++) {
    const x = 20 + r() * 88;
    const h = 50 + r() * 70;
    g.strokeStyle = ['#c9b340', '#e0c45a', '#a8a03a', '#d8b84c'][i % 4];
    g.lineWidth = 3 + r() * 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, 128 - h * 0.6, x + (r() - 0.5) * 40, 128 - h);
    g.stroke();
  }
  grassTex = new THREE.CanvasTexture(c);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  return grassTex;
}

/** A tuft of painted grass (two crossed alpha planes). Visual only. */
export function grassTuft(root: THREE.Object3D, x: number, z: number, s = 0.6): void {
  const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
    p.position.set(x, s / 2, z);
    p.rotation.y = i * (Math.PI / 2) + x * 0.37;
    root.add(p);
  }
}

/**
 * Dress a building box like the concept art: framed windows with sills and
 * shutters, a door, drainpipes, a crenellated parapet, a stone kerb (with a
 * collider, so it's a real step) and grass tufts at the base.
 * Protrusions stay ≤ 0.14 m from the wall (above head height) so nothing pokes
 * into the walkable space without a collider.
 */
export function decorateBuilding(
  ctx: GameContext,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  h: number,
  face: Face,
  y0 = 0,
  opts: { muralBand?: boolean; door?: boolean; kerb?: boolean; windows?: boolean } = {},
): void {
  const { root, physics } = ctx;
  const r = rng(Math.floor(Math.abs(x0 * 13.7 + z0 * 7.3 + h * 3)) + 1);
  const along = face === '+x' || face === '-x' ? 'z' : 'x';
  const len = along === 'z' ? z1 - z0 : x1 - x0;
  const outward = new THREE.Vector3(face === '+x' ? 1 : face === '-x' ? -1 : 0, 0, face === '+z' ? 1 : face === '-z' ? -1 : 0);
  const facePos = face === '+x' ? x1 : face === '-x' ? x0 : face === '+z' ? z1 : z0;
  const yaw = Math.atan2(outward.x, outward.z);
  const place = (obj: THREE.Object3D, t: number, y: number, out: number) => {
    const a = along === 'z' ? z0 + t : x0 + t;
    if (along === 'z') obj.position.set(facePos + outward.x * out, y0 + y, a);
    else obj.position.set(a, y0 + y, facePos + outward.z * out);
    obj.rotation.y = yaw;
    root.add(obj);
  };
  // flat details on walls get a real gap + polygon offset so they never z-fight at a distance
  const flat = <T extends THREE.Material>(m: T): T => {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  };
  const dark = flat(toon({ color: '#2b1c3a' }));
  const glass = flat(toon({ color: '#3b3a6e', emissive: '#120a22' }));

  // ── windows: top band (keeps murals free), plus a middle row on plain walls ──
  const rows: number[] = [];
  if (opts.windows !== false && h > 6) rows.push(h - 2.2);
  if (opts.windows !== false && !opts.muralBand && h > 8) rows.push(h - 4.6);
  const spacing = 3.2 + r() * 0.8;
  const count = Math.max(1, Math.floor((len - 1.5) / spacing));
  const startT = (len - (count - 1) * spacing) / 2;
  for (const wy of rows) {
    for (let i = 0; i < count; i++) {
      if (r() < 0.18) continue; // irregular, hand-made rhythm
      const t = startT + i * spacing + (r() - 0.5) * 0.4;
      const w = 0.95 + r() * 0.35;
      const hh = 1.25 + r() * 0.35;
      const frameCol = FRAME_COLS[Math.floor(r() * FRAME_COLS.length)];
      const g = new THREE.Group();
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), r() < 0.25 ? dark : glass);
      pane.position.z = 0.03;
      g.add(pane);
      // cross bars
      const barM = toon({ color: frameCol });
      const vb = new THREE.Mesh(new THREE.BoxGeometry(0.06, hh, 0.04), barM);
      const hb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.04), barM);
      vb.position.z = hb.position.z = 0.06;
      g.add(vb, hb);
      // frame
      const fr = paintedMesh(new THREE.BoxGeometry(w + 0.22, hh + 0.22, 0.08), barM, 0.02, false);
      fr.position.z = -0.03; // front face stays 2 cm behind the pane (no coplanar fight)
      fr.scale.set(1, 1, 1);
      g.add(fr);
      // sill
      const sill = paintedMesh(wonkyBox(w + 0.4, 0.12, 0.14, 0.06, Math.floor(r() * 99)), toon({ color: PAL.cream }), 0.015, false);
      sill.position.set(0, -hh / 2 - 0.12, 0.06);
      g.add(sill);
      // shutters on some
      if (r() < 0.35) {
        const shM = toon({ color: FRAME_COLS[Math.floor(r() * FRAME_COLS.length)] });
        for (const sx of [-1, 1]) {
          const sh = paintedMesh(new THREE.BoxGeometry(w * 0.45, hh, 0.05), shM, 0.015, false);
          sh.position.set(sx * (w * 0.5 + w * 0.26), 0, 0.04);
          g.add(sh);
        }
      }
      g.rotation.z = (r() - 0.5) * 0.06;
      place(g, t, wy, 0.02);
    }
  }

  // ── door at street level ──
  if (opts.door && y0 === 0 && len > 4) {
    const t = len * (0.25 + r() * 0.5);
    const g = new THREE.Group();
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), flat(toon({ map: ctx.assets.tex('wood'), color: '#c98a5a' })));
    door.position.set(0, 1.1, 0.045);
    const frame = paintedMesh(new THREE.BoxGeometry(1.6, 2.45, 0.06), toon({ color: PAL.cream }), 0.02, false);
    frame.position.set(0, 1.2, -0.01);
    g.add(frame, door);
    place(g, t, 0, 0.0);
  }

  // ── drainpipes ──
  if (h > 5 && r() < 0.8) {
    const t = r() < 0.5 ? 0.6 : len - 0.6;
    const pipe = paintedMesh(new THREE.CylinderGeometry(0.08, 0.08, h - 0.6, 8), toon({ map: ctx.assets.tex('metal_dark') }), 0.015, false);
    place(pipe, t, (h - 0.6) / 2 + 0.3, 0.12);
    const elbow = paintedMesh(new THREE.BoxGeometry(0.3, 0.14, 0.24), toon({ map: ctx.assets.tex('metal_dark') }), 0.015, false);
    place(elbow, t, 0.35, 0.12);
  }

  // ── crenellated parapet on top ──
  if (h > 4) {
    const n = Math.max(2, Math.floor(len / 1.6));
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const t = (i + 0.5) * (len / n);
      const m = paintedMesh(wonkyBox(len / n, 0.55, 0.5, 0.08, i * 7 + Math.floor(h)), toon({ map: ctx.assets.tex('stone_cream') }), 0.03);
      place(m, t, h + 0.55, -0.25);
    }
  }

  // ── kerb along the base (real collider → a little step) + grass ──
  if (opts.kerb !== false && y0 === 0) {
    const kh = 0.22;
    const kd = 0.55;
    // repeat the stone along the kerb's length (one shared texture stretched into streaks otherwise)
    const kt = ctx.assets.tex('stone_purple').clone();
    kt.needsUpdate = true;
    kt.wrapS = kt.wrapT = THREE.RepeatWrapping;
    kt.repeat.set(Math.max(1, Math.round(len / 1.2)), 1);
    const kerbGeo = new THREE.BoxGeometry(along === 'z' ? kd : len, kh, along === 'z' ? len : kd);
    if (along === 'z') {
      // BoxGeometry runs u along x on ±y faces: rotate those UVs so u follows the kerb's length (z)
      const uv = kerbGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 8; i < 16; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
    const kerb = paintedMesh(kerbGeo, toon({ map: kt, color: '#c8b8d8' }), 0.02);
    const c = along === 'z' ? new THREE.Vector3(facePos + outward.x * (kd / 2), kh / 2, (z0 + z1) / 2) : new THREE.Vector3((x0 + x1) / 2, kh / 2, facePos + outward.z * (kd / 2));
    kerb.position.copy(c);
    root.add(kerb);
    physics.addStaticBox(c, new THREE.Vector3(along === 'z' ? kd / 2 : len / 2, kh / 2, along === 'z' ? len / 2 : kd / 2));
    const tufts = Math.floor(len / 3);
    for (let i = 0; i < tufts; i++) {
      if (r() < 0.4) continue;
      const t = r() * len;
      const a = along === 'z' ? z0 + t : x0 + t;
      const off = kd + 0.15;
      if (along === 'z') grassTuft(root, facePos + outward.x * off, a, 0.45 + r() * 0.35);
      else grassTuft(root, a, facePos + outward.z * off, 0.45 + r() * 0.35);
    }
  }
}
