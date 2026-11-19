/**
 * [INPUT]: depends on the PlaySession (physics, enemies, boss, beltCarry, springPads) from level/Session; OrganHost
 *          (carryFor, isOverTop, top, deltaYaw) from hosts/OrganHost; SpringSpot from level/Ambient; Companion from ./Companion
 * [OUTPUT]: exports PipWorld (carry, pushOut, route)
 * [POS]: the world's mechanisms on her body, through WAI's own rules: a walking host carries her with its carryFor()
 *        (the sessions' riding rule), a moving kinematic floor (the freight lift's cage) carries her by its own step,
 *        a belt by the session's beltCarry(), a big creature pushes her out with its pushOut(). Springs throw her in
 *        level/Ambient (PlayBody); route() is the brain's half of that: walk onto a spring that lands next to WAI
 *        when the way to him is lost. Companion.step calls carry(); CoopPartner calls pushOut() and route().
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PlaySession } from '../level/Session';
import type { OrganHost } from '../hosts/OrganHost';
import type { SpringSpot } from '../level/Ambient';
import type { Companion } from './Companion';

const DOWN = new THREE.Vector3(0, -1, 0);
/** a spring lands "next to WAI" within this flat distance / height of him */
const LANDS_NEAR = 7;
const LANDS_DY = 3;
/** springs farther from her than this are not worth the walk */
const SPRING_REACH = 30;
/** the WAI-and-the-partner push-out radius (Companion's capsule) */
const ROLL = 0.28;

export class PipWorld {
  private probe = new THREE.Vector3();
  private belt = new THREE.Vector3();
  /** the spring she is walking to, and until when she keeps trying */
  private via: SpringSpot | null = null;
  private viaUntil = 0;
  /** the last carry kind (tests / observe) */
  on: 'ground' | 'host' | 'lift' | 'belt' = 'ground';

  constructor(
    private s: PlaySession,
    private b: Companion,
  ) {}

  /** The collider under her feet (five short rays, like PlayerController.probeGround). */
  private ground(): RAPIER.Collider | null {
    const b = this.b;
    const c = b.body.translation();
    const ph = this.s.physics;
    const me = b.collider.handle;
    let best: { col: RAPIER.Collider; d: number } | null = null;
    for (const [ox, oz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      const hit = ph.raycast(this.probe.set(c.x + ox, c.y, c.z + oz), DOWN, b.centerOffset + 0.2, (col) => col.handle !== me);
      if (hit && (!best || hit.dist < best.d)) best = { col: hit.collider, d: hit.dist };
    }
    return best?.col ?? null;
  }

  /**
   * Her displacement this step from what she stands on (`out`, metres). True = a moving floor (WAI's
   * onMovingPlatform: no downward push into it).
   */
  carry(dt: number, out: THREE.Vector3): boolean {
    out.set(0, 0, 0);
    this.on = 'ground';
    const b = this.b;
    if (!b.grounded) return false;
    const ph = this.s.physics;
    const col = this.ground();
    if (col && ph.tagOf(col) === 'host') {
      const h = ph.ownerOf<OrganHost>(col);
      if (h && h.isOverTop(b.pos) && b.pos.y > h.top - 0.3) {
        out.copy(h.carryFor(b.pos));
        b.facing += h.deltaYaw;
        b.enforceAbove(h.top);
        this.on = 'host';
        return true;
      }
    }
    const body = col?.parent();
    if (col && body && body.isKinematic() && ph.tagOf(col) === 'static') {
      // a level's moving floor (the freight lift's cage): it moves by its own next step
      const a = body.translation(), n = body.nextTranslation();
      out.set(n.x - a.x, n.y - a.y, n.z - a.z);
      if (out.lengthSq() > 1e-10) {
        this.on = 'lift';
        return true;
      }
    }
    const v = this.s.beltCarry?.(b.pos, this.belt);
    if (v) {
      out.copy(v).multiplyScalar(dt);
      this.on = 'belt';
      return true;
    }
    return false;
  }

  /** Creatures that turned or lunged into her push her out (the sessions' rule for WAI; the Red Pen is exempt there too). */
  pushOut(): void {
    const s = this.s;
    const b = this.b;
    if (b.smudged) return;
    for (const e of s.enemies) {
      if (e.disposed || e.bigness < 0.55 || (s.levelId === 'works' && e === s.boss)) continue;
      const out = e.pushOut(b.pos, ROLL);
      if (out) b.nudgeTo(out);
    }
  }

  /**
   * Where to walk to reach `goal` (beside WAI): `goal` itself, or a painted spring that lands next to it when her
   * own way is lost (no route, or WAI is up where she cannot walk). She keeps to one spring for a while.
   */
  route(goal: THREE.Vector3, clock: number): THREE.Vector3 {
    const pads = this.s.springPads?.();
    const b = this.b;
    if (!pads || !pads.length) return goal;
    const flat = (a: THREE.Vector3, c: THREE.Vector3) => Math.hypot(a.x - c.x, a.z - c.z);
    // thrown (or there): done with it
    if (this.via && (clock > this.viaUntil || b.leaping || flat(b.pos, this.via.target) < 4 || flat(this.via.target, goal) > LANDS_NEAR + 3)) this.via = null;
    if (!this.via) {
      const far = flat(b.pos, goal) > 6 || Math.abs(goal.y - b.pos.y) > 1.6;
      const lost = b.navStuck() || Math.abs(goal.y - b.pos.y) > 1.6;
      if (!far || !lost || !b.grounded) return goal;
      let bd = Infinity;
      for (const sp of pads) {
        if (flat(sp.target, goal) > LANDS_NEAR || Math.abs(sp.target.y - goal.y) > LANDS_DY) continue;
        const d = sp.pos.distanceTo(b.pos);
        if (d > SPRING_REACH || Math.abs(sp.pos.y - b.pos.y) > 1.5 || d < 0.5) continue;
        if (d < bd) {
          bd = d;
          this.via = sp;
        }
      }
      if (this.via) this.viaUntil = clock + 14;
    }
    return this.via ? this.via.pos : goal;
  }

  /** The spring she is heading for (tests / observe). */
  get heading(): SpringSpot | null {
    return this.via;
  }
}
