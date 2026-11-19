/**
 * [INPUT]: depends on StaticBatch/worldUV/wonk/INK from ./HarborKit; toon/paintedMesh from render/Materials;
 *          GameContext (physics colliders, assets) from core/Context
 * [OUTPUT]: exports Rect, Opening, pierTextures(), deck(), stilts(), railing(), fence(), sideBarrier(), lampPost(),
 *           barricadeBoards(), redCrossTexture(), and the encounter locks turnstile() / cordon() (PierLock)
 * [POS]: the level-2 district's modelling kit (whitewashed sea-green boards, cream iron, candy stripes), in the harbor
 *        kit's language (wobble, world-scale UVs, batched per zone). BandstandPier.ts lays the district out with it.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import { addOutline, paintedMesh, toon } from '../../render/Materials';
import { StaticBatch, worldUV, wonk } from './HarborKit';

/** An axis-aligned deck footprint (world x/z). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** An opening in a deck's railing: side n (z0) / s (z1) / w (x0) / e (x1), from → to along that side. */
export interface Opening {
  side: 'n' | 's' | 'w' | 'e';
  from: number;
  to: number;
}

// ───────────── painted textures (made once, cached in the asset manager) ─────────────
function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Whitewashed sea-green boards with inked gaps, nail pairs and salt streaks. */
function boardCanvas(): HTMLCanvasElement {
  const [c, g] = canvas(256);
  let s = 31;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tones = ['#cfeee2', '#bfe4d6', '#d8f3ea', '#b6dccd', '#c8eadc', '#e2f6ee'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * 32, 256, 32);
    g.strokeStyle = 'rgba(40,90,90,0.14)';
    g.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const y = i * 32 + 7 + k * 8 + r() * 3;
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 1.6);
      g.stroke();
    }
    g.fillStyle = '#2f4a5a';
    g.fillRect(0, i * 32 + 30, 256, 2);
    const jx = (i * 89) % 256;
    g.fillRect(jx, i * 32, 2, 30);
    g.fillStyle = '#3a4a58';
    for (const nx of [jx - 7, jx + 9]) {
      g.beginPath();
      g.arc(nx, i * 32 + 15, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // salt streaks and a few paint flecks (the town's colours)
  for (let i = 0; i < 18; i++) {
    g.fillStyle = i % 3 ? 'rgba(255,255,255,0.35)' : ['#ff7a6b', '#1fb5b0', '#ffe08a', '#ff3fa4'][i % 4];
    g.globalAlpha = i % 3 ? 1 : 0.5;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 2 + r() * 8, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

/** Candy stripes (kiosk awnings, the carousel canopy, deck fascias). */
function stripeCanvas(a: string, b: string, n: number): HTMLCanvasElement {
  const [c, g] = canvas(256, 64);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / n, 0, 256 / n + 1, 64);
  }
  g.fillStyle = 'rgba(30,20,40,0.25)';
  g.fillRect(0, 60, 256, 4);
  return c;
}

/** Soft fog-bank alpha (the sea of fog under the pier). */
function fogCanvas(): HTMLCanvasElement {
  const [c, g] = canvas(512);
  const grd = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  grd.addColorStop(0, 'rgba(236,228,250,0.95)');
  grd.addColorStop(0.7, 'rgba(220,210,245,0.7)');
  grd.addColorStop(1, 'rgba(220,210,245,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = 60 + r() * 392, y = 60 + r() * 392;
    const rad = 20 + r() * 60;
    const p = g.createRadialGradient(x, y, 0, x, y, rad);
    p.addColorStop(0, `rgba(255,250,255,${0.25 + r() * 0.3})`);
    p.addColorStop(1, 'rgba(255,250,255,0)');
    g.fillStyle = p;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

let crossTex: THREE.CanvasTexture | null = null;
/** The Red Pen's brushed X (two strokes with drips) on a transparent canvas. */
export function redCrossTexture(): THREE.CanvasTexture {
  if (crossTex) return crossTex;
  const [c, g] = canvas(256);
  g.lineCap = 'round';
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    for (const [w, col, a] of [[40, '#7a0d1a', 0.5], [30, '#e8323c', 1], [8, '#ff8a8f', 0.6]] as [number, string, number][]) {
      g.globalAlpha = a;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + 10, (y0 + y1) / 2 - 8, x1, y1);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#e8323c';
    for (let i = 0; i < 3; i++) {
      const k = 0.25 + i * 0.25;
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      g.fillRect(x - 3, y, 6, 18 + i * 9);
      g.beginPath();
      g.arc(x, y + 20 + i * 9, 5, 0, Math.PI * 2);
      g.fill();
    }
  };
  stroke(34, 40, 222, 214);
  stroke(222, 36, 38, 218);
  crossTex = new THREE.CanvasTexture(c);
  crossTex.colorSpace = THREE.SRGBColorSpace;
  return crossTex;
}

/** Crossed-out boards: whitewashed planks with the Red Pen's X over them. */
function barricadeCanvas(): HTMLCanvasElement {
  const [c, g] = canvas(512, 256);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = ['#e2f6ee', '#cfeee2', '#f3fbf7', '#bfe4d6', '#d8f3ea'][i];
    g.fillRect(0, (i * 256) / 5, 512, 256 / 5 - 4);
    g.fillStyle = '#2f4a5a';
    g.fillRect(0, ((i + 1) * 256) / 5 - 4, 512, 4);
  }
  g.drawImage(redCrossTexture().image as HTMLCanvasElement, 256 - 138, -6, 276, 268);
  return c;
}

/** Make the pier's textures once (they live in the asset manager like the harbor's own). */
export function pierTextures(ctx: GameContext): void {
  const A = ctx.assets;
  if (A.textures.has('pier_boards')) return;
  const put = (name: string, c: HTMLCanvasElement, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.name = name;
    A.textures.set(name, t);
  };
  put('pier_boards', boardCanvas());
  put('pier_stripe_mint', stripeCanvas('#fff1dc', '#5fd3b4', 8));
  put('pier_stripe_red', stripeCanvas('#fff1dc', '#ff5a6e', 8));
  put('pier_fog', fogCanvas(), false);
  put('pier_barricade', barricadeCanvas(), false);
}

// ───────────── pieces ─────────────
/** A boarded deck (top surface at y) with a striped fascia round its edge, plus its collider. */
export function deck(ctx: GameContext, B: StaticBatch, r: Rect, y: number, mats: { boards: THREE.Material; fascia: THREE.Material }, seed = 1): RAPIER.Collider {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const top = worldUV(wonk(new THREE.BoxGeometry(w, 0.3, d, Math.max(1, Math.round(w / 3)), 1, Math.max(1, Math.round(d / 3))), 0.015, seed), 4).translate(cx, y - 0.15, cz);
  B.add(top, mats.boards, 0.03);
  // the fascia: a striped board under the deck's lip, all round
  const fasc = new THREE.BoxGeometry(w + 0.12, 0.34, d + 0.12);
  B.add(worldUV(fasc, 2, 0, 0, true).translate(cx, y - 0.42, cz), mats.fascia, 0.02);
  return ctx.physics.addStaticBox(new THREE.Vector3(cx, y - 0.15, cz), new THREE.Vector3(w / 2, 0.15, d / 2));
}

/** Iron stilts under a deck: posts along the edges every ~4 m, X-braced, sinking into the fog. */
export function stilts(B: StaticBatch, r: Rect, y: number, iron: THREE.Material, foot = -5): void {
  const post = (x: number, z: number) => B.add(new THREE.CylinderGeometry(0.16, 0.2, y - 0.6 - foot, 8).translate(x, (y - 0.6 + foot) / 2, z), iron, 0.03);
  const brace = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const h = Math.min(4, y - 0.6 - foot);
    const ang = Math.atan2(h, len);
    const yaw = Math.atan2(bz - az, bx - ax);
    for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(Math.hypot(len, h), 0.09, 0.09).rotateZ(s * ang).rotateY(-yaw).translate((ax + bx) / 2, y - 0.6 - h / 2, (az + bz) / 2);
      B.add(g, iron, 0.015);
    }
  };
  const along = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      post(ax + (bx - ax) * k, az + (bz - az) * k);
      if (i < n) brace(ax + (bx - ax) * k, az + (bz - az) * k, ax + (bx - ax) * (k + 1 / n), az + (bz - az) * (k + 1 / n));
    }
  };
  const i = 0.35;
  along(r.x0 + i, r.z0 + i, r.x1 - i, r.z0 + i);
  along(r.x0 + i, r.z1 - i, r.x1 - i, r.z1 - i);
  if (r.x1 - r.x0 > 3) {
    along(r.x0 + i, r.z0 + i, r.x0 + i, r.z1 - i);
    along(r.x1 - i, r.z0 + i, r.x1 - i, r.z1 - i);
  }
}

/**
 * A cream iron railing from a to b at deck height y: posts, a top rail and a mid rail, with colliders in
 * short pieces (the camera passes thin short panels; long ones would shove it into WAI's head).
 */
export function railing(ctx: GameContext, B: StaticBatch, ax: number, az: number, bx: number, bz: number, y: number, iron: THREE.Material, firstPost = true): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.2) return;
  const yaw = Math.atan2(bz - az, bx - ax);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = firstPost ? 0 : 1; i <= n; i++) {
    const k = i / n;
    const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
    B.add(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(x, y + 0.55, z), iron, 0.02);
    if (i % 2 === 0) B.add(new THREE.SphereGeometry(0.08, 8, 6).translate(x, y + 1.14, z), iron, 0.015);
  }
  for (const h of [1.05, 0.55]) B.add(new THREE.BoxGeometry(len, 0.07, 0.07).rotateY(-yaw).translate((ax + bx) / 2, y + h, (az + bz) / 2), iron, 0.015);
  const pieces = Math.ceil(len / 2.2);
  for (let i = 0; i < pieces; i++) {
    const k = (i + 0.5) / pieces;
    ctx.physics.addStaticBox(new THREE.Vector3(ax + (bx - ax) * k, y + 0.55, az + (bz - az) * k), new THREE.Vector3(len / pieces / 2 + 0.02, 0.55, 0.06), -yaw);
  }
}

/** Railings round a rect, leaving its openings. */
export function fence(ctx: GameContext, B: StaticBatch, r: Rect, y: number, iron: THREE.Material, open: Opening[]): void {
  const side = (s: Opening['side'], a0: number, a1: number, at: (v: number) => [number, number]) => {
    const gaps = open.filter((o) => o.side === s).sort((p, q) => p.from - q.from);
    let cur = a0;
    for (const g of gaps) {
      if (g.from > cur + 0.1) railing(ctx, B, ...at(cur), ...at(g.from), y, iron);
      cur = Math.max(cur, g.to);
    }
    if (a1 > cur + 0.1) railing(ctx, B, ...at(cur), ...at(a1), y, iron);
  };
  side('n', r.x0, r.x1, (v) => [v, r.z0 + 0.06]);
  side('s', r.x0, r.x1, (v) => [v, r.z1 - 0.06]);
  side('w', r.z0, r.z1, (v) => [r.x0 + 0.06, v]);
  side('e', r.z0, r.z1, (v) => [r.x1 - 0.06, v]);
}

/** An invisible wall (no slipping off a stair or ramp's side, no walking in under it). */
export function sideBarrier(ctx: GameContext, a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const yaw = Math.atan2(b.z - a.z, b.x - a.x);
  ctx.physics.addStaticBox(new THREE.Vector3((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2), new THREE.Vector3(len / 2, (y1 - y0) / 2, 0.08), -yaw, 'barrier');
}

/** A Victorian double lamp (lathe post, scroll arms, two warm globes). */
export function lampPost(B: StaticBatch, x: number, y: number, z: number, iron: THREE.Material, glass: THREE.Material): void {
  const prof = [[0.001, 0], [0.26, 0], [0.26, 0.12], [0.17, 0.2], [0.13, 0.5], [0.08, 0.62], [0.07, 2.9], [0.11, 3.0], [0.11, 3.08], [0.001, 3.1]].map(([px, py]) => new THREE.Vector2(px, py));
  B.add(new THREE.LatheGeometry(prof, 10).translate(x, y, z), iron, 0.025);
  for (const s of [-1, 1]) {
    const arm = new THREE.TorusGeometry(0.3, 0.035, 5, 10, Math.PI).rotateZ(s > 0 ? 0 : Math.PI / 2).translate(x + s * 0.3, y + 3.05, z);
    B.add(arm, iron, 0.012);
    B.add(new THREE.CylinderGeometry(0.06, 0.12, 0.12, 8).translate(x + s * 0.6, y + 3.0, z), iron, 0.012);
    B.add(new THREE.SphereGeometry(0.19, 12, 10).translate(x + s * 0.6, y + 2.8, z), glass, 0.02);
  }
  B.add(new THREE.ConeGeometry(0.12, 0.3, 8).translate(x, y + 3.3, z), iron, 0.015);
}

/** A crossed-out board wall a → b (a group, so it can fold away), with its collider(s). */
export function barricadeBoards(ctx: GameContext, a: THREE.Vector3, b: THREE.Vector3, h: number, wood: THREE.Material): { g: THREE.Group; cols: RAPIER.Collider[] } {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  const mid = a.clone().lerp(b, 0.5);
  const g = new THREE.Group();
  const front = toon({ map: ctx.assets.tex('pier_barricade') });
  const board = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.32), [wood, wood, wood, wood, front, front]);
  addOutline(board, 0.04);
  board.position.y = h / 2;
  board.castShadow = true;
  g.add(board);
  for (const s of [-0.5, 0.5]) {
    const post = paintedMesh(new THREE.BoxGeometry(0.3, h + 0.5, 0.45), wood, 0.03);
    post.position.set(s * (len - 0.2), (h + 0.5) / 2, 0);
    g.add(post);
  }
  g.position.copy(mid);
  g.rotation.y = yaw;
  ctx.root.add(g);
  // a little above the boards: no hopping over (the spring's arc clears it)
  const ch = h + 0.5;
  const col = ctx.physics.addStaticBox(mid.clone().setY(mid.y + ch / 2), new THREE.Vector3(len / 2, ch / 2, 0.25), yaw);
  return { g, cols: [col] };
}

/** A lock that opens once an encounter is cleared (a turnstile, a rope cordon). */
export interface PierLock {
  readonly open: boolean;
  unlock(): void;
  update(dt: number): void;
}

/**
 * An iron turnstile across a gangway (centre `c`, the gangway runs along x, `w` wide): three arms, a
 * "CLOSED" board with the crabs' doodle. Unlocked, the arms swing up and its collider goes.
 */
export function turnstile(ctx: GameContext, c: THREE.Vector3, w: number, iron: THREE.Material, brass: THREE.Material): PierLock {
  const g = new THREE.Group();
  g.position.copy(c);
  ctx.root.add(g);
  const arms = new THREE.Group();
  arms.position.y = 1.0;
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w - 0.3, 8).rotateX(Math.PI / 2).translate(0, 0, 0), brass);
    a.position.y = -0.3 + i * 0.3;
    arms.add(a);
  }
  for (const s of [-1, 1]) {
    const post = paintedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 10), iron, 0.025);
    post.position.set(0, 0.75, (s * w) / 2);
    const cap = paintedMesh(new THREE.SphereGeometry(0.16, 10, 8), brass, 0.02);
    cap.position.set(0, 1.55, (s * w) / 2);
    g.add(post, cap);
  }
  g.add(arms);
  for (const m of arms.children as THREE.Mesh[]) addOutline(m, 0.015);
  const col = ctx.physics.addStaticBox(new THREE.Vector3(c.x, c.y + 1.2, c.z), new THREE.Vector3(0.15, 1.2, w / 2), 0, 'gate');
  let t = -1;
  return {
    get open() {
      return t >= 0;
    },
    unlock() {
      if (t >= 0) return;
      t = 0;
      ctx.physics.untag(col);
      ctx.physics.world.removeCollider(col, false);
      ctx.audio.play('gateOpen', { pos: c, vol: 0.7, pitch: 1.3 });
      ctx.effects.burst(c.clone().setY(c.y + 1.2), '#ffd23a', 14, 4);
    },
    update(dt) {
      if (t < 0 || t >= 1) return;
      t = Math.min(1, t + dt * 1.6);
      arms.rotation.x = (1 - Math.pow(1 - t, 3)) * (Math.PI / 2);
    },
  };
}

/**
 * A velvet-rope cordon (four brass posts round `c`, radius r). Unlocked, the ropes drop. It has no colliders
 * (spray must reach the sketch inside): the director keeps WAI out while it is up.
 */
export function cordon(ctx: GameContext, c: THREE.Vector3, r: number, brass: THREE.Material): PierLock {
  const g = new THREE.Group();
  g.position.copy(c);
  ctx.root.add(g);
  const ropeMat = toon({ color: '#c8203c' });
  const ropes: THREE.Mesh[] = [];
  const corners = [0, 1, 2, 3].map((i) => new THREE.Vector3(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * r, 0, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * r));
  corners.forEach((p, i) => {
    const prof = [[0.001, 0], [0.18, 0], [0.18, 0.06], [0.06, 0.12], [0.05, 0.95], [0.1, 1.0], [0.001, 1.08]].map(([x, y]) => new THREE.Vector2(x, y));
    const post = paintedMesh(new THREE.LatheGeometry(prof, 10), brass, 0.02);
    post.position.copy(p);
    g.add(post);
    const q = corners[(i + 1) % 4];
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      pts.push(p.clone().lerp(q, u).setY(0.9 - Math.sin(u * Math.PI) * 0.28));
    }
    const rope = paintedMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.045, 5), ropeMat, 0.012, false);
    ropes.push(rope);
    g.add(rope);
  });
  let t = -1;
  return {
    get open() {
      return t >= 0;
    },
    unlock() {
      if (t >= 0) return;
      t = 0;
      ctx.audio.play('pop', { pos: c, pitch: 0.8 });
    },
    update(dt) {
      if (t < 0 || t >= 1) return;
      t = Math.min(1, t + dt * 1.4);
      for (const rp of ropes) {
        rp.position.y = -t * 0.85;
        rp.scale.y = 1 - t * 0.6;
      }
      if (t >= 1) for (const rp of ropes) rp.visible = false;
    },
  };
}
