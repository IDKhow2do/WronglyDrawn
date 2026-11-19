/**
 * [INPUT]: depends on Guide (the arrow + edge marker) from ui/Guide; WORKS/FY/stairStep from ./WorksLayout; PhysicsWorld (line of sight)
 * [OUTPUT]: exports WorksGuide (the objective arrow for Limp Works) and WorksRoute (the waypoint graph it routes over)
 * [POS]: level 3's "where do I go?" arrow. The tower is four stacked floors joined by the lift, two caged stairs, the
 *        pit platforms and the gangway; a straight line to a goal on another floor is useless. WorksRoute is a small
 *        waypoint graph (doors open as the story goes: the lift, the stairs, the catalogue gate, the gangway); the
 *        guide walks it from the node WAI can see that is cheapest to the goal, toward the node that sees the goal
 *        (so a goal by a wall is reached round it, through the door). The session gives the goal.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { Guide } from '../../ui/Guide';
import type { PlaySession } from '../Session';
import type { PhysicsWorld } from '../../core/PhysicsWorld';
import { FY, WORKS, floorOf, stairStep } from './WorksLayout';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DOWN = new THREE.Vector3(0, -1, 0);

interface Node {
  id: string;
  p: THREE.Vector3;
  floor: number;
}

/** Edge gates the session answers (doors that open as the level goes on). */
export interface RouteGates {
  liftUp(): boolean;
  stair2(): boolean;
  catalogue(): boolean;
  grille(): boolean;
}

export class WorksRoute {
  readonly nodes: Node[] = [];
  private edges: [number, number, (() => boolean) | null][] = [];
  private dist: number[] = [];
  private next: number[] = [];
  private lastGoal = -1;
  private lastT = -10;
  private clock = 0;
  private tmp = new THREE.Vector3();
  private probe = new THREE.Vector3();
  private goalAt = new THREE.Vector3();
  private goalN = -1;

  constructor(
    private phys: PhysicsWorld,
    gates: RouteGates,
  ) {
    const y1 = FY[0], y2 = FY[1], y3 = FY[2];
    const n = (id: string, p: THREE.Vector3) => this.nodes.push({ id, p, floor: floorOf(p.y + 0.3) }) - 1;
    // F1
    const e0 = n('e0', V(0, y1, 17)), e1 = n('e1', V(0, y1, 13.2)), d0 = n('d0', V(0, y1 + WORKS.dockY, 10)), b0 = n('b0', V(0, y1, 6.6));
    const bA = n('bA', V(0, y1 + 1, WORKS.belts[0].z)), m0 = n('m0', V(0, y1, -1.2)), m1 = n('m1', V(12, y1, -1.2)), bB = n('bB', V(2, y1 + 1, WORKS.belts[1].z));
    const n0 = n('n0', V(2, y1, -10.6)), n1 = n('n1', V(11, y1, -10.6)), n2 = n('n2', V(12.5, y1, -16.5)), L1 = n('L1', V(WORKS.cage.x - 0.5, y1 + 0.3, WORKS.cage.z + 1));
    // F2
    const L2 = n('L2', V(WORKS.cage.x - 0.5, y2 + 0.3, WORKS.cage.z + 1)), s0 = n('s0', V(13, y2, -11.5)), s1 = n('s1', V(9.4, y2, -1));
    const pA = n('pA', WORKS.platforms[0].c.clone()), pB = n('pB', WORKS.platforms[1].c.clone());
    const w0 = n('w0', V(-9.4, y2, 0.2)), w1 = n('w1', V(-12, y2, 6.5)), q0 = n('q0', V(-19.9, y2, 10.2)), i0 = n('i0', V(-10.5, y2, -10));
    const gW = n('gW', V(-9.2, y2, WORKS.gangwayZ)), gE = n('gE', V(9.2, y2, WORKS.gangwayZ)), sr = n('sr', WORKS.stampRunStart.clone());
    const q1 = n('q1', stairStep(WORKS.stair2, 6)), q2 = n('q2', stairStep(WORKS.stair2, 13));
    // F3
    const t3 = n('t3', WORKS.arrive3.clone()), a0 = n('a0', V(-12, y3, -12.2)), a1 = n('a1', V(-1.5, y3, -12.2)), a2 = n('a2', V(-1.5, y3, 0));
    const r0 = n('r0', V(0, y3, 8)), g0 = n('g0', V(8.6, y3, 9.5)), g1 = n('g1', V(12.6, y3, 9.5)), x0 = n('x0', V(12.6, y3, -6.5));
    const f0 = n('f0', V(-8.5, y3, 16.5)), f1 = n('f1', V(-8, y3, 19.9));
    const f2 = n('f2', stairStep(WORKS.stair3, 6)), f3 = n('f3', stairStep(WORKS.stair3, 13));
    // roof
    const rf = n('rf', WORKS.roofArrive.clone()), rc = n('rc', WORKS.gate.clone());
    const e = (a: number, b: number, g: (() => boolean) | null = null) => this.edges.push([a, b, g]);
    e(e0, e1); e(e1, d0); e(d0, b0); e(b0, bA); e(bA, m0); e(m0, m1); e(m0, bB); e(m1, bB); e(bB, n0); e(n0, n1); e(n1, n2); e(n2, L1);
    e(L1, L2, gates.liftUp);
    e(L2, s0); e(s0, s1); e(s0, sr); e(s1, pA); e(pA, pB); e(pB, w0); e(w0, w1); e(w1, q0); e(w0, i0); e(w1, i0);
    e(i0, gW, gates.stair2); e(gW, gE, gates.stair2); e(gE, s0, gates.stair2);
    e(q0, q1, gates.stair2); e(q1, q2, gates.stair2); e(q2, t3, gates.stair2);
    e(t3, a0); e(a0, a1); e(a1, a2); e(a2, r0); e(r0, g0); e(g0, g1, gates.catalogue); e(g1, x0); e(r0, f0); e(f0, f1);
    e(f1, f2, gates.grille); e(f2, f3, gates.grille); e(f3, rf, gates.grille); e(rf, rc);
  }

  /** Dijkstra from the goal node (re-run when the goal changes or every second as doors open). */
  private solve(goal: number): void {
    const N = this.nodes.length;
    this.dist = new Array(N).fill(Infinity);
    this.next = new Array(N).fill(-1);
    this.dist[goal] = 0;
    const done = new Array(N).fill(false);
    for (let it = 0; it < N; it++) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && (u < 0 || this.dist[i] < this.dist[u])) u = i;
      if (u < 0 || this.dist[u] === Infinity) break;
      done[u] = true;
      for (const [a, b, g] of this.edges) {
        if (g && !g()) continue;
        const v = a === u ? b : b === u ? a : -1;
        if (v < 0 || done[v]) continue;
        const w = this.nodes[a].p.distanceTo(this.nodes[b].p);
        if (this.dist[u] + w < this.dist[v]) {
          this.dist[v] = this.dist[u] + w;
          this.next[v] = u;
        }
      }
    }
  }

  private nearest(p: THREE.Vector3, needSight: boolean): number {
    const f = floorOf(p.y + 0.3);
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      if (nd.floor !== f) continue;
      const d = nd.p.distanceTo(p);
      if (needSight && d > 0.5 && !this.sees(p, nd.p)) continue;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private sees(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const from = this.tmp.copy(a).setY(a.y + 1.0);
    const dir = b.clone().setY(b.y + 1.0).sub(from);
    const d = dir.length();
    if (d < 0.01) return true;
    dir.divideScalar(d);
    if (this.phys.raycast(from, dir, d, (c) => this.phys.tagOf(c) === 'static' || this.phys.tagOf(c) === 'gate')) return false;
    // a straight line over a gap (the shredder pit) is not a way: ground under three points along it
    for (const k of [0.25, 0.5, 0.75]) {
      this.probe.copy(a).lerp(b, k).setY(Math.max(a.y, b.y) + 0.8);
      if (!this.phys.raycast(this.probe, DOWN, 2.6, (c) => this.phys.tagOf(c) === 'static' || this.phys.tagOf(c) === 'undrawn')) return false;
    }
    return true;
  }

  /**
   * The goal's node: the nearest one that sees the goal, else the nearest. A creature by the card catalogue belongs to
   * its own side of the wall, not to the closer node behind it. Re-picked when the goal moves 0.5 m.
   */
  private goalNode(goal: THREE.Vector3): number {
    if (this.goalN < 0 || this.goalAt.distanceToSquared(goal) > 0.25) {
      this.goalAt.copy(goal);
      const seen = this.nearest(goal, true);
      this.goalN = seen >= 0 ? seen : this.nearest(goal, false);
    }
    return this.goalN;
  }

  /** The next point to walk to from `p` toward `goal`. */
  step(p: THREE.Vector3, goal: THREE.Vector3, dt: number): THREE.Vector3 {
    this.clock += dt;
    // on a stair: straight up (or down) it — steps hide the next node from the line-of-sight check
    for (const [st, top] of [[WORKS.stair2, WORKS.arrive3], [WORKS.stair3, WORKS.roofArrive]] as const) {
      const end = st.foot.clone().addScaledVector(st.dir, st.n);
      const along = (p.x - st.foot.x) * st.dir.x + (p.z - st.foot.z) * st.dir.z;
      const side = Math.abs((p.x - st.foot.x) * st.dir.z - (p.z - st.foot.z) * st.dir.x);
      if (along > 0.2 && along < st.n + 0.5 && side < st.hw + 0.3 && p.y > st.foot.y + 0.3) return goal.y > p.y + 1 ? (along > st.n - 1 ? top : end.setY(top.y)) : st.foot;
    }
    const sameFloor = floorOf(p.y + 0.3) === floorOf(goal.y + 0.3);
    if (sameFloor && p.distanceTo(goal) < 7 && this.sees(p, goal)) return goal;
    const gn = this.goalNode(goal);
    if (gn < 0) return goal;
    if (gn !== this.lastGoal || this.clock - this.lastT > 1) {
      this.solve(gn);
      this.lastGoal = gn;
      this.lastT = this.clock;
    }
    // the visible node cheapest to the goal (counting the walk to it)
    const f = floorOf(p.y + 0.3);
    let best = -1, bc = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      if (nd.floor !== f || this.dist[i] === Infinity) continue;
      const d = nd.p.distanceTo(p);
      if (d > 0.5 && !this.sees(p, nd.p)) continue;
      const c = d + this.dist[i];
      if (c < bc) {
        bc = c;
        best = i;
      }
    }
    if (best < 0) best = this.nearest(p, false);
    if (best < 0) return goal;
    // the goal's own node reached (or next): point at the goal only once WAI is at that node or sees the goal,
    // else at the node (the goal stands behind a wall, the node is on its side of it)
    const atGoal = () => sameFloor && (this.nodes[gn].p.distanceTo(p) < 2.6 || this.sees(p, goal));
    if (best === gn) return atGoal() ? goal : this.nodes[best].p;
    const nd = this.nodes[best];
    if (nd.p.distanceTo(p) < 2.6 && this.next[best] >= 0) {
      const nx = this.next[best];
      return nx === gn && atGoal() ? goal : this.nodes[nx].p;
    }
    return nd.p;
  }

  id(i: number): string {
    return this.nodes[i]?.id ?? '';
  }
}

export class WorksGuide extends Guide {
  readonly graph: WorksRoute;
  private dt = 0;
  private last = performance.now();

  constructor(
    s: PlaySession & { guideGoal(): THREE.Vector3 | null },
    root: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    gates: RouteGates,
  ) {
    super(s, root, camera);
    this.graph = new WorksRoute(s.physics, gates);
  }

  protected override goal(): THREE.Vector3 | null {
    return (this.s as PlaySession & { guideGoal(): THREE.Vector3 | null }).guideGoal();
  }

  protected override route(g: THREE.Vector3): THREE.Vector3 {
    const now = performance.now();
    this.dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    return this.graph.step(this.s.player.pos, g, this.dt).clone();
  }
}
