import * as THREE from 'three';
import type RAPIER_T from '@dimforge/rapier3d-compat';
import { RAPIER } from '../core/PhysicsWorld';
import type { PlaySession as GameSession } from '../level/Session';

/**
 * Her map of where a player can go — a lazily baked, multi-layer nav grid built from the level's real
 * colliders (the same ones WAI walks on), so it works on every level without hand-placed waypoints.
 *
 *   column   one 0.5 m square of the map: every upward-facing surface in it with ≥ 1.05 m of head room
 *            (street, bridge deck above the towpath, a roof…). Found with a few downward rays (solid = false,
 *            so a ray started inside a box comes out of its underside and carries on).
 *   node     one surface of one column.
 *   edge     to one of the 8 neighbours: WALK (|dy| ≤ 0.55, autostep handles stairs), JUMP up a ledge
 *            (≤ 1.15 m), DROP off one (≤ 4.5 m), or a running JUMP over a gap (≤ 3 m, the hover catches a
 *            short one). A knee-height ray rejects walls; water never counts as ground.
 *
 * Everything is computed on demand and cached for a few seconds (gates open, bridges get drawn, the
 * road's erased stretches come back), and the A* search is a generator that the partner runs a couple of
 * milliseconds per step, so a long route never stalls a frame.
 */
export const NAV = {
  cell: 0.5,
  top: 32,
  headroom: 1.2,
  step: 0.55,
  jumpUp: 1.25,
  drop: 3.2,
  gapMax: 6, // cells (3 m)
  ttl: 14, // s
  maxExpand: 26000,
};

export const Edge = { Walk: 0, Jump: 1, Drop: 2, Gap: 3 } as const;
export type Edge = (typeof Edge)[keyof typeof Edge];

export interface NavPath {
  pts: THREE.Vector3[];
  /** kind of the edge that ENDS at pts[i] (kinds[0] unused) */
  kinds: Edge[];
  /** remaining length from pts[i] to the end */
  rest: number[];
  expanded: number;
  ms: number;
}

interface Col {
  t: number;
  ys: number[];
}

interface Edges {
  t: number;
  to: number[];
  cost: number[];
  kind: Edge[];
  /** next to a wall (a little extra cost keeps paths off them) */
  wall: boolean;
}

// (crates and props too: she cannot push them, so they are obstacles — and something to stand on)
const SOLID = new Set(['static', 'host', 'gate', 'undrawn', 'barrier', 'box', 'prop']);
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const MAXL = 8;

/** Binary min-heap on f (parallel arrays). */
class Heap {
  k: number[] = [];
  f: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(k: number, f: number): void {
    const K = this.k, F = this.f;
    let i = K.length;
    K.push(k);
    F.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      K[i] = K[p];
      F[i] = F[p];
      i = p;
    }
    K[i] = k;
    F[i] = f;
  }
  pop(): number {
    const K = this.k, F = this.f;
    const top = K[0];
    const lk = K.pop()!, lf = F.pop()!;
    if (K.length) {
      let i = 0;
      const n = K.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        K[i] = K[c];
        F[i] = F[c];
        i = c;
      }
      K[i] = lk;
      F[i] = lf;
    }
    return top;
  }
}

export class NavGrid {
  private cols = new Map<number, Col>();
  private edges = new Map<number, Edges>();
  private x0: number;
  private z0: number;
  private nx: number;
  private nz: number;
  private now = 0;
  private ray: RAPIER_T.Ray;
  private pred: (c: RAPIER_T.Collider) => boolean;
  private v = new THREE.Vector3();
  /** stats (tests / status) */
  rays = 0;
  searches = 0;
  failures = 0;
  lastExpanded = 0;

  constructor(private s: GameSession) {
    const b = s.devInfo?.bounds ?? [-62, 62, -64, 54];
    this.x0 = b[0] - 2;
    this.z0 = b[2] - 2;
    this.nx = Math.ceil((b[1] - b[0] + 4) / NAV.cell);
    this.nz = Math.ceil((b[3] - b[2] + 4) / NAV.cell);
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const ph = s.physics;
    this.pred = (c) => SOLID.has(ph.tagOf(c) ?? '');
  }

  tick(dt: number): void {
    this.now += dt;
  }

  // ───────── keys ─────────
  private ck(ix: number, iz: number): number {
    return ix * 4096 + iz;
  }
  nodeKey(ix: number, iz: number, l: number): number {
    return (ix * 4096 + iz) * MAXL + l;
  }
  private ixOf(x: number): number {
    return Math.floor((x - this.x0) / NAV.cell);
  }
  private izOf(z: number): number {
    return Math.floor((z - this.z0) / NAV.cell);
  }
  cx(ix: number): number {
    return this.x0 + (ix + 0.5) * NAV.cell;
  }
  cz(iz: number): number {
    return this.z0 + (iz + 0.5) * NAV.cell;
  }

  /** Forget everything around a point (something changed there / she got stuck on it). */
  invalidate(at: THREE.Vector3, r = 2): void {
    const i0 = this.ixOf(at.x - r), i1 = this.ixOf(at.x + r), j0 = this.izOf(at.z - r), j1 = this.izOf(at.z + r);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = this.ck(i, j);
        this.cols.delete(k);
        for (let l = 0; l < MAXL; l++) {
          this.edges.delete(k * MAXL + l);
          this.clear.delete(k * MAXL + l);
        }
      }
  }

  // ───────── columns ─────────
  private castDown(x: number, y: number, z: number, max: number): { y: number; ny: number } | null {
    const r = this.ray;
    r.origin.x = x;
    r.origin.y = y;
    r.origin.z = z;
    r.dir.x = 0;
    r.dir.y = -1;
    r.dir.z = 0;
    this.rays++;
    const h = this.s.physics.world.castRayAndGetNormal(r, max, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, this.pred);
    if (!h) return null;
    return { y: y - h.timeOfImpact, ny: h.normal.y };
  }

  private clear = new Map<number, { t: number; v: 0 | 1 | 2 }>();
  /**
   * Room for her body (radius 0.28) at a node: 0 free, 1 a wall within 0.32 m (costs extra: paths keep off
   * walls), 2 walls on two opposite sides within 0.32 m (she does not fit).
   */
  clearance(n: number): 0 | 1 | 2 {
    const c = this.clear.get(n);
    if (c && this.now - c.t < NAV.ttl) return c.v;
    const l = n % MAXL;
    const k = (n - l) / MAXL;
    const iz = k % 4096;
    const ix = (k - iz) / 4096;
    const y = this.col(ix, iz)[l];
    let v: 0 | 1 | 2 = 0;
    if (y !== undefined) {
      const x = this.cx(ix), z = this.cz(iz);
      const h = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => this.wallBetween(x, z, y + 0.4, x + dx * 0.32, z + dz * 0.32, 0));
      v = (h[0] && h[1]) || (h[2] && h[3]) ? 2 : h.some(Boolean) ? 1 : 0;
      // a ledge / the water's edge next to it counts as a wall for the cost (paths keep to the middle of piers)
      if (v === 0) for (const [dx, dz] of DIRS) if (!this.col(ix + dx, iz + dz).some((by) => Math.abs(by - y) < 0.6)) v = 1;
    }
    this.clear.set(n, { t: this.now, v });
    return v;
  }

  /** A landing spot with room around it (≥ 6 of its 8 neighbours at about the same height). */
  private wide(ix: number, iz: number, y: number): boolean {
    let n = 0;
    for (const [dx, dz] of DIRS) if (this.col(ix + dx, iz + dz).some((by) => Math.abs(by - y) < 0.35)) n++;
    return n >= 6;
  }

  /** Something solid within head height above (or around) a surface point? */
  private headHit(x: number, y: number, z: number): boolean {
    const r = this.ray;
    r.origin.x = x;
    r.origin.y = y + 0.06;
    r.origin.z = z;
    r.dir.x = 0;
    r.dir.y = 1;
    r.dir.z = 0;
    this.rays++;
    return !!this.s.physics.world.castRay(r, NAV.headroom - 0.06, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, this.pred);
  }

  /** Walkable surface heights in a column (top first). */
  col(ix: number, iz: number): number[] {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return [];
    const k = this.ck(ix, iz);
    const c = this.cols.get(k);
    if (c && this.now - c.t < NAV.ttl) return c.ys;
    const x = this.cx(ix), z = this.cz(iz);
    const ys: number[] = [];
    let cur = NAV.top;
    let ceil = Infinity;
    const floor = this.s.killY;
    for (let i = 0; i < 10 && cur > floor && ys.length < MAXL; i++) {
      const h = this.castDown(x, cur, z, cur - floor);
      if (!h) break;
      // (a ray started inside a box skips it, so the head room is checked with a solid ray straight up)
      if (h.ny > 0.7 && ceil - h.y >= NAV.headroom && !this.headHit(x, h.y, z) && !this.s.inWater(this.v.set(x, h.y - 0.05, z))) ys.push(h.y);
      ceil = h.y;
      cur = h.y - 0.04;
    }
    this.cols.set(k, { t: this.now, ys });
    if (c) for (let l = 0; l < MAXL; l++) this.edges.delete(k * MAXL + l);
    return ys;
  }

  /** The node she / WAI is standing on (nearest surface within a step below / a little above). */
  nodeAt(p: THREE.Vector3, search = 2): number | null {
    const ix = this.ixOf(p.x), iz = this.izOf(p.z);
    let best: number | null = null;
    let bd = Infinity;
    for (let r = 0; r <= search; r++) {
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ys = this.col(ix + di, iz + dj);
          for (let l = 0; l < ys.length; l++) {
            const dy = p.y - ys[l];
            if (dy < -0.9 || dy > 2.2) continue;
            const d = Math.abs(dy) * 1.5 + Math.hypot(di, dj) * NAV.cell;
            if (d < bd) {
              bd = d;
              best = this.nodeKey(ix + di, iz + dj, l);
            }
          }
        }
      if (best !== null) return best;
    }
    return best;
  }

  pos(n: number, out = new THREE.Vector3()): THREE.Vector3 {
    const l = n % MAXL;
    const c = (n - l) / MAXL;
    const iz = c % 4096;
    const ix = (c - iz) / 4096;
    const ys = this.col(ix, iz);
    return out.set(this.cx(ix), ys[l] ?? ys[0] ?? 0, this.cz(iz));
  }

  // ───────── edges ─────────
  private wallBetween(ax: number, az: number, y: number, bx: number, bz: number, extra = 0.22): boolean {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const r = this.ray;
    r.origin.x = ax;
    r.origin.y = y;
    r.origin.z = az;
    r.dir.x = dx / len;
    r.dir.y = 0;
    r.dir.z = dz / len;
    this.rays++;
    return !!this.s.physics.world.castRay(r, len + extra, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, this.pred);
  }

  private edgesOf(n: number): Edges {
    const e = this.edges.get(n);
    if (e && this.now - e.t < NAV.ttl) return e;
    const l = n % MAXL;
    const c = (n - l) / MAXL;
    const iz = c % 4096;
    const ix = (c - iz) / 4096;
    const out: Edges = { t: this.now, to: [], cost: [], kind: [], wall: false };
    const ys = this.col(ix, iz);
    const y = ys[l];
    if (y === undefined) {
      this.edges.set(n, out);
      return out;
    }
    const ax = this.cx(ix), az = this.cz(iz);
    for (let d = 0; d < 8; d++) {
      const [dx, dz] = DIRS[d];
      const bi = ix + dx, bj = iz + dz;
      const bys = this.col(bi, bj);
      const bx = this.cx(bi), bz = this.cz(bj);
      const dist = d < 4 ? NAV.cell : NAV.cell * Math.SQRT2;
      let linked = false;
      let dropTo = -1;
      let dropDy = 0;
      for (let m = 0; m < bys.length; m++) {
        const dy = bys[m] - y;
        if (Math.abs(dy) <= NAV.step) {
          const top = Math.max(y, bys[m]);
          if (this.wallBetween(ax, az, top + 0.35, bx, bz) || this.wallBetween(ax, az, top + 0.95, bx, bz)) {
            if (d < 4) out.wall = true;
            continue;
          }
          out.to.push(this.nodeKey(bi, bj, m));
          out.cost.push(dist * (1 + Math.abs(dy) * 0.6));
          out.kind.push(Edge.Walk);
          linked = true;
        } else if (dy > NAV.step && dy <= NAV.jumpUp) {
          if (this.wallBetween(ax, az, bys[m] + 0.3, bx, bz) || this.wallBetween(ax, az, y + 0.35, bx, bz, -0.05)) {
            // (the second ray stops short of the ledge itself: only something in the way counts)
            continue;
          }
          out.to.push(this.nodeKey(bi, bj, m));
          out.cost.push(dist + 1.6);
          out.kind.push(Edge.Jump);
          linked = true;
        } else if (dy < -NAV.step && dy >= -NAV.drop && (dropTo < 0 || dy > dropDy)) {
          dropTo = m;
          dropDy = dy;
        }
      }
      // dropping off a ledge: only onto somewhere wide enough to land (not the narrow stair below a gallery)
      if (!linked && dropTo >= 0 && !this.wallBetween(ax, az, y + 0.35, bx, bz) && this.wide(bi, bj, bys[dropTo])) {
        out.to.push(this.nodeKey(bi, bj, dropTo));
        out.cost.push(dist + 2 + -dropDy * 1.5);
        out.kind.push(Edge.Drop);
        linked = true;
      }
      // a gap (void / water / a deep drop): a running jump to ground at the same height a few cells on
      if (!linked && !bys.some((by) => by > y - 1.6 && by < y + 0.6)) {
        for (let k = 2; k <= NAV.gapMax; k++) {
          const gi = ix + dx * k, gj = iz + dz * k;
          const gys = this.col(gi, gj);
          // something to bump into on the way: no gap jump
          if (gys.some((gy) => gy > y + 0.6 && gy < y + 2)) break;
          // level, or a step up that a running jump still clears (the sky stairs: +1.1 m every 2.3 m)
          const m = gys.findIndex((gy) => gy - y <= (k <= 5 ? 1.15 : 0.6) && gy - y >= -0.6);
          if (m < 0) continue;
          const gx = this.cx(gi), gz = this.cz(gj);
          if (this.wallBetween(ax, az, Math.max(y, gys[m]) + 0.45, gx, gz)) break;
          const len = Math.hypot(gx - ax, gz - az);
          if (len > 3.1) break;
          out.to.push(this.nodeKey(gi, gj, m));
          // one missing cell (a seam, a 0.5 m slot) is narrower than she is: she just walks over it
          const seam = k === 2 && Math.abs(gys[m] - y) < 0.3;
          out.cost.push(seam ? len + 0.5 : len + 3);
          out.kind.push(seam ? Edge.Walk : Edge.Gap);
          break;
        }
      }
    }
    this.edges.set(n, out);
    return out;
  }

  // ───────── search ─────────
  /**
   * A* from `from` to `to` as a generator: yields every few hundred expansions (the caller decides how
   * long to keep pulling), returns the path or null.
   */
  *search(from: THREE.Vector3, to: THREE.Vector3): Generator<void, NavPath | null, void> {
    const t0 = performance.now();
    let spent = 0;
    this.searches++;
    const a = this.nodeAt(from, 2);
    const b = this.nodeAt(to, 3);
    if (a === null || b === null) {
      this.failures++;
      return null;
    }
    const goal = this.pos(b, new THREE.Vector3());
    const tmp = new THREE.Vector3();
    const h = (n: number) => {
      this.pos(n, tmp);
      return Math.hypot(tmp.x - goal.x, tmp.z - goal.z) + Math.abs(tmp.y - goal.y) * 0.5;
    };
    const g = new Map<number, number>([[a, 0]]);
    const came = new Map<number, number>();
    const kindTo = new Map<number, Edge>();
    const closed = new Set<number>();
    const open = new Heap();
    open.push(a, h(a));
    let expanded = 0;
    let best = a, bestH = h(a);
    while (open.size) {
      const n = open.pop();
      if (closed.has(n)) continue;
      if (n === b) {
        best = n;
        bestH = 0;
        break;
      }
      closed.add(n);
      expanded++;
      if (expanded > NAV.maxExpand) break;
      if (expanded % 300 === 0) {
        spent += performance.now() - t0;
        yield;
      }
      const e = this.edgesOf(n);
      const gn = g.get(n)!;
      for (let i = 0; i < e.to.length; i++) {
        const m = e.to[i];
        if (closed.has(m)) continue;
        const cl = this.clearance(m);
        if (cl === 2) continue;
        const gm = gn + e.cost[i] + (cl === 1 ? 1.2 : 0);
        if (gm < (g.get(m) ?? Infinity)) {
          g.set(m, gm);
          came.set(m, n);
          kindTo.set(m, e.kind[i]);
          const hm = h(m);
          if (hm < bestH) {
            bestH = hm;
            best = m;
          }
          open.push(m, gm + hm * 1.15);
        }
      }
    }
    this.lastExpanded = expanded;
    // no full route: only a partial one that really gets closer is worth walking
    if (best !== b && bestH > 4) {
      this.failures++;
      return null;
    }
    const nodes: number[] = [best];
    while (came.has(nodes[nodes.length - 1])) nodes.push(came.get(nodes[nodes.length - 1])!);
    nodes.reverse();
    const pts = nodes.map((n) => this.pos(n, new THREE.Vector3()));
    const kinds = nodes.map((n) => kindTo.get(n) ?? Edge.Walk);
    const rest = new Array<number>(pts.length).fill(0);
    for (let i = pts.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + pts[i].distanceTo(pts[i + 1]);
    void spent;
    return { pts, kinds, rest, expanded, ms: performance.now() - t0 };
  }

  /** Run a whole search now (tests / docs). */
  findPath(from: THREE.Vector3, to: THREE.Vector3): NavPath | null {
    const it = this.search(from, to);
    for (;;) {
      const r = it.next();
      if (r.done) return r.value;
    }
  }

  info(): Record<string, unknown> {
    return { cols: this.cols.size, nodesWithEdges: this.edges.size, rays: this.rays, searches: this.searches, failures: this.failures, lastExpanded: this.lastExpanded };
  }
}
