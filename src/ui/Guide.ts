/**
 * [INPUT]: depends on PlaySession (goal sources, player, mood) from ../level/Session; gorgeX from ../level/Terrain
 * [OUTPUT]: exports Guide (target, stuck, update) — HarborGuide and WorksGuide extend it
 * [POS]: level 1's guide arrow and THE ONE STUCK RULE for all three levels: `stuck` turns true after
 *        STUCK_AFTER seconds without progress toward the goal, and the sessions hang every delayed hint on it.
 *        `target` is computed every frame whether or not the arrow is drawn (the test bots read it).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { PlaySession as GameSession } from '../level/Session';
import { gorgeX } from '../level/Terrain';
import { t } from '../i18n';

/**
 * "Where do I go?" — a bobbing paint arrow over the current objective, plus an arrow on
 * the screen edge (with distance) when it's off-screen. Routes through waypoints where a
 * straight line would fail (the canal bridge, the switchback road).
 *
 * The player explores first: the arrow stays hidden while they are getting closer to the goal,
 * fighting, or watching a story beat, and comes back only once they are stuck.
 */
/** Seconds without progress toward the goal before the game offers help. */
export const STUCK_AFTER = 25;
/** Getting this much closer than ever before counts as progress. */
const PROGRESS_STEP = 2;
/** Centre line of the switchback road, hub → summit (x, y, z). */
const ROAD = [
  [12, 1.5, -18.5],
  [12, 5, -35.5],
  [18, 5, -35.5],
  [18, 8.5, -19.5],
  [24, 8.5, -19.5],
  [24, 12, -37.5],
  // the road's top drops onto the lower hairpin to the west: go round behind it (north),
  // through the gap beside the summit, then to the summit stairs on its south side
  [24, 12, -40],
  [10.5, 12, -40],
  [9.3, 12, -36.5],
  [6.5, 12, -33],
  [2.5, 12, -29.5],
  [0, 12, -29.5],
  [0, 14, -36],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

/**
 * The way into the Crossed-Out Quarter: the road to its second hairpin, the sunken lane, the Gate Yard,
 * the planks over the tear, the East Walk, the spring over the red barricade, Inkwell Square.
 */
const QUARTER_ROUTE = [
  ...ROAD.slice(0, 5).map((v) => [v.x, v.y, v.z]),
  [28.6, 8.5, -19.8],
  [29.3, 8.8, -22],
  [29.3, 13, -31],
  [34, 13, -33],
  [37.6, 13, -36.6],
  [45, 13, -36.6],
  [48, 13, -35.2],
  [51.2, 13, -31.5],
  [52.2, 13, -27.4],
  [51.6, 13, -20.4],
  [47, 13, -18.5],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const inQuarterSide = (v: THREE.Vector3) => v.x > 26.2 && v.z < -10 && v.y > 11.3;
/** Inkwell Square proper: south of the East Walk's barricade and on the square's side of the Gate Yard's one. */
const inSquare = (v: THREE.Vector3) => inQuarterSide(v) && v.x > 34 && v.z > -24.6 && (41.2 - 35.8) * (v.z + 18.4) - (-24.7 + 18.4) * (v.x - 35.8) > 0;

/** Distance from p to segment ab (height counts triple: the legs are stacked). */
function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  const c = a.clone().addScaledVector(ab, t);
  return Math.hypot(p.x - c.x, (p.y - c.y) * 3, p.z - c.z);
}

export class Guide {
  private arrow = new THREE.Group();
  private el: HTMLDivElement;
  private label: HTMLSpanElement;
  /** Where the objective is, every frame, arrow or no arrow (the test bots read this). */
  target: THREE.Vector3 | null = null;
  private t = 0;
  private v = new THREE.Vector3();
  enabled = true;
  /** Seconds the player has made no progress toward the goal (fights and cutscenes do not count). */
  idle = 0;
  private best = Infinity;
  /** The goal the clock is running against (a different one starts the clock over). */
  private was: THREE.Vector3 | null = null;
  /** The player needs help: the arrow shows, and the sessions' delayed hints speak. */
  get stuck(): boolean {
    return this.idle >= STUCK_AFTER;
  }

  constructor(
    protected s: GameSession,
    root: THREE.Object3D,
    private camera: THREE.PerspectiveCamera,
  ) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd23a', depthTest: false, transparent: true, opacity: 0.95, fog: false });
    const ink = new THREE.MeshBasicMaterial({ color: '#141014', depthTest: false, transparent: true, opacity: 0.9, side: THREE.BackSide, fog: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 4), mat);
    cone.rotation.x = Math.PI; // pointing down
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.26), mat);
    shaft.position.y = 0.62;
    const coneInk = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 4), ink);
    coneInk.rotation.x = Math.PI;
    const shaftInk = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.36), ink);
    shaftInk.position.y = 0.62;
    for (const m of [cone, shaft, coneInk, shaftInk]) {
      m.renderOrder = m === coneInk || m === shaftInk ? 19 : 20; // ink outline first, yellow on top
      m.userData.noPaint = true;
      m.frustumCulled = false;
      this.arrow.add(m);
    }
    this.arrow.visible = false;
    root.add(this.arrow);

    this.el = document.createElement('div');
    this.el.className = 'guide-edge hidden';
    this.el.innerHTML = '<div class="guide-chevron">➤</div><span class="guide-dist"></span>';
    this.label = this.el.querySelector('.guide-dist')!;
    document.getElementById('ui-root')!.appendChild(this.el);
  }

  dispose(): void {
    this.arrow.removeFromParent();
    this.el.remove();
  }

  /** The objective's world point (null = nothing to point at). */
  protected goal(): THREE.Vector3 | null {
    const s = this.s;
    const inv = s.inventory;
    const has = (k: 'EYE' | 'MOUTH' | 'LEG') => inv.get(k);
    const enemy = (id: string) => s.enemies.find((e) => e.id === id && !e.disposed && !e.harmless);
    const dropped = (k: string) => s.organs.worldOrgans.find((w) => !w.disposed && w.organ.type === k);
    const socket = (id: string, k: 'EYE' | 'MOUTH') => s.organs.hostById(id)?.socketWorld(k).clone() ?? null;

    if (s.completed) return null;
    if (s.bossDone) return new THREE.Vector3(0, 15, -50.5);
    if (s.woken.size === 3) return s.boss.awake ? null : new THREE.Vector3(0, 15, -40);
    // the eye: from the starter lamp
    const eye = has('EYE');
    if (!eye) {
      const d = dropped('EYE');
      if (d) return d.at.clone().setY(d.at.y + 0.8);
      const lamp = enemy('starter-lamp');
      return lamp ? lamp.pos.clone().setY(lamp.pos.y + 4.2) : null;
    }
    if (eye.corrupted) return null; // the hint says: hold Q
    if (!s.woken.has('sleepyWall')) return socket('sleepyWall', 'EYE');
    if (!s.woken.has('gatehouse')) {
      const mouth = has('MOUTH');
      if (!mouth) {
        const d = dropped('MOUTH');
        if (d) return d.at.clone().setY(d.at.y + 0.8);
        const c = enemy('chomper');
        return c ? c.pos.clone().setY(c.pos.y + 2.4) : null;
      }
      if (mouth.corrupted) return null;
      return socket('gatehouse', 'MOUTH');
    }
    if (!s.woken.has('statue')) {
      // the second district comes first: the Red Inkwell's cross is over the statue's eye
      const q = (s as { quarterGoal?: () => THREE.Vector3 | null }).quarterGoal?.();
      return q ?? socket('statue', 'EYE');
    }
    return null;
  }

  /** Next corner along a polyline route from WAI toward its end (null = WAI is far from it). */
  private along(P: THREE.Vector3[], p: THREE.Vector3): THREE.Vector3 | null {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const d = segDist(p, P[i], P[i + 1]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    if (bd > 6) return null;
    let k = bi + 1;
    while (k < P.length - 1 && Math.hypot(P[k].x - p.x, P[k].z - p.z) < 2.2) k++;
    return P[k];
  }

  /** Next point on the way to `g` from WAI (switchback road, then the bridge over the canal if needed). */
  protected route(g: THREE.Vector3): THREE.Vector3 {
    const p = this.s.player.pos;
    let w = g;
    // the Crossed-Out Quarter: along its own route (road → lane → tear → East Walk → square)
    // (far from it — the hub, the west bank — head for the road's start; the canal/terrace rules below still apply)
    let routed = false;
    if (inQuarterSide(g) && !inSquare(p)) {
      w = this.along(QUARTER_ROUTE, p) ?? (p.y < 4 ? QUARTER_ROUTE[0] : g);
      routed = true;
    }
    // leaving the quarter (its marks washed off): drop off Inkwell Square onto the workyard rooftop
    if (inQuarterSide(p) && !inQuarterSide(g)) {
      if (inSquare(p)) return new THREE.Vector3(46, 13, -10.2);
      const k = this.along([...QUARTER_ROUTE].reverse(), p);
      if (k) return k;
    }
    // the hill: along the switchback road's centre line, corner by corner
    if (g.y > 11 && !routed) {
      const P = ROAD;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < P.length - 1; i++) {
        const d = segDist(p, P[i], P[i + 1]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      // far from the road (hub, harbor…): head for its start
      if (bd > 6 && p.y < 4) w = P[0];
      else {
        let k = bi + 1;
        while (k < P.length - 1 && Math.hypot(P[k].x - p.x, P[k].z - p.z) < 2.2) k++;
        w = P[k];
      }
      if (p.y >= 13 && Math.hypot(p.x, p.z + 43) < 10) w = g;
    }
    // up on the workyard terrace / its rooftop: the only way off is the ramp down to the hub (x≈21, z 8→22)
    const onTerraceSide = (v: THREE.Vector3) => v.x > 19 && v.z > -12 && v.y > 3.4;
    if (onTerraceSide(p) && !onTerraceSide(w)) {
      if (p.y > 7.5) return new THREE.Vector3(38.5, 5, -2.5); // off the roof onto the terrace
      const onRamp = p.x > 18.5 && p.x < 23.5 && p.z > 8 && p.z < 22.5;
      return onRamp || Math.hypot(p.x - 21, p.z - 9.5) < 2.2 ? new THREE.Vector3(21, 1.8, 23.5) : new THREE.Vector3(21, 4.8, 9.5);
    }
    // down on the canal towpath: out by the nearest stairs (they climb the east gorge wall)
    const inGorge = p.y < 0.6 && p.z > -18 && p.z < 44 && Math.abs(p.x - gorgeX(p.z)) < 8 && p.x > gorgeX(p.z);
    if (inGorge && w.y > -1) {
      const stairs = [
        { bottom: new THREE.Vector3(gorgeX(26.2) + 6.55, -2.2, 26.2), top: new THREE.Vector3(gorgeX(16.6) + 6.55, 1.8, 16.6) },
        { bottom: new THREE.Vector3(gorgeX(-5.2) + 5.6, -2.2, -5.2), top: new THREE.Vector3(gorgeX(-15.2) + 5.6, 1.8, -15.4) },
      ];
      const best = stairs.reduce((a, b) => (Math.hypot(a.bottom.x - p.x, a.bottom.z - p.z) < Math.hypot(b.bottom.x - p.x, b.bottom.z - p.z) ? a : b));
      // once you're on the steps (off the towpath floor), keep pointing up
      return p.y < -2.15 && Math.hypot(best.bottom.x - p.x, best.bottom.z - p.z) > 1.8 ? best.bottom : best.top;
    }
    // the canal: the west bank only connects to everything else over the painted bridge (z ≈ 12)
    const westBank = (v: THREE.Vector3) => v.z > -18 && v.z < 44 && v.x < gorgeX(v.z) - 2;
    if (westBank(p) !== westBank(w) && this.s.woken.has('sleepyWall')) {
      const eastEnd = new THREE.Vector3(-27.5, 1.6, 12);
      const westEnd = new THREE.Vector3(-41, 0.4, 12);
      const [near, far] = westBank(p) ? [westEnd, eastEnd] : [eastEnd, westEnd];
      return Math.hypot(p.x - near.x, p.z - near.z) > 2.5 && Math.abs(p.z - 12) > 1.6 ? near : far;
    }
    return w;
  }

  /**
   * The one stuck rule. Every new best distance to the goal resets the clock, so a player who is walking
   * the right way is left alone; a fight, a story beat and a frozen session pause it.
   */
  private watchProgress(dt: number, g: THREE.Vector3 | null, hidden: boolean): void {
    const s = this.s;
    if (!g || hidden || s.frozen || s.completed) return;
    const d = g.distanceTo(s.player.pos);
    // a new objective, or one WAI was carried away from (a smudge, a fall): start again from here
    if (!this.was || this.was.distanceTo(g) > 6 || d > this.best + 10) {
      this.was = g.clone();
      this.best = d;
      this.idle = 0;
      return;
    }
    this.was.copy(g);
    if (d < this.best - PROGRESS_STEP) {
      this.best = d;
      this.idle = 0;
      return;
    }
    this.best = Math.min(this.best, d);
    // a live fight is progress of its own kind, and so is anything the story is playing
    if (s.mood === 'combat' || s.mood === 'boss' || s.mood === 'victory' || s.story.locked) return;
    this.idle += dt;
  }

  update(dt: number, hidden: boolean): void {
    this.t += dt;
    // the goal and its route are computed even while the arrow is hidden: the test bots read `target`
    const g = this.enabled ? this.goal() : null;
    this.target = g ? this.route(g) : null;
    this.watchProgress(dt, g, hidden);
    const p = this.s.player.pos;
    const show = !hidden && this.stuck && !!this.target && this.target.distanceTo(p) > 3.2;
    this.arrow.visible = show;
    if (!show || !this.target) {
      this.el.classList.add('hidden');
      return;
    }
    const tg = this.target;
    const dist = tg.distanceTo(p);
    // stays readable far away, never huge up close
    const sc = THREE.MathUtils.clamp(dist * 0.07, 1.2, 3.6);
    this.arrow.scale.setScalar(sc);
    this.arrow.position.copy(tg).add(new THREE.Vector3(0, 0.6 * sc + Math.sin(this.t * 4) * 0.18 * sc, 0));
    this.arrow.rotation.y = this.t * 1.6;
    // screen-edge pointer when it's off-screen
    this.v.copy(tg).project(this.camera);
    const behind = this.v.z > 1;
    const on = !behind && Math.abs(this.v.x) < 0.92 && Math.abs(this.v.y) < 0.88;
    const label = t('{n} m', { n: Math.round(dist) });
    if (this.label.textContent !== label) this.label.textContent = label;
    if (on) {
      this.el.classList.remove('hidden', 'edge');
      const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
      const [ax, ay] = this.dodgeHud(x, y - 46 - 30);
      this.el.style.transform = `translate(${ax}px, ${ay + 30}px) translate(-50%, -100%)`;
      (this.el.firstElementChild as HTMLElement).style.transform = 'rotate(90deg)';
      return;
    }
    let x = this.v.x, y = this.v.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const a = Math.atan2(y, x);
    const m = 0.86 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)) * 1.1);
    const ex = (Math.cos(a) * m * 0.5 + 0.5) * window.innerWidth;
    const ey = (-Math.sin(a) * m * 0.5 + 0.5) * window.innerHeight;
    this.el.classList.remove('hidden');
    this.el.classList.add('edge');
    const [dx, dy] = this.dodgeHud(ex, ey);
    this.el.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;
    (this.el.firstElementChild as HTMLElement).style.transform = `rotate(${-a}rad)`;
  }

  /** Keep the marker (≈70×60 px around x,y) off the corner HUD panels — help sheet, sticker cards. */
  private dodgeHud(x: number, y: number): [number, number] {
    const pad = 38;
    const obstacles = ['.hud .help:not(.hidden)', '.hud .cards', '.touch:not(.hidden) .t-organs'];
    if (document.body.classList.contains('touch-mode')) {
      obstacles.push('.hud .hud-tr', '.touch:not(.hidden) .t-actions', '.touch:not(.hidden) .t-tools');
    }
    for (const sel of obstacles) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) {
        // slide out the cheaper way: above the panel, or sideways past it
        const up = y - (r.top - pad);
        const side = r.left < window.innerWidth / 2 ? r.right + pad - x : x - (r.left - pad);
        if (up <= side) y = r.top - pad;
        else x = r.left < window.innerWidth / 2 ? r.right + pad : r.left - pad;
      }
    }
    return [x, y];
  }
}
