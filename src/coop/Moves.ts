/**
 * [INPUT]: depends on CoopPartner (pip, session, dealt, swagger.ledger) from ./Coop; Damageable from combat/Damage;
 *          toon / addOutline from render/Materials; PIP from ./CompanionModel; paintDone from ./FightLedger; t() from i18n
 * [OUTPUT]: exports CoopMoves (slam, rice-ball throw, rice-bomb, hover, whistle), MOVES (their numbers), MoveName
 * [POS]: her player moves, beside CoopSpray (her stream). Every hit reports the paint it took off to the fight
 *        ledger (her damage share) and never finishes a creature (cap / mayHurt).
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { CoopPartner } from './Coop';
import type { EnemyBase } from '../enemy/EnemyBase';
import { isDamageable, type Damageable } from '../combat/Damage';
import { addOutline, toon } from '../render/Materials';
import { PIP } from './CompanionModel';
import { t } from '../i18n';
import { paintDone } from './FightLedger';

/**
 * Her "fat functions": the player's moves she can do herself, on her own instances (WAI's systems keep a single
 * held prop / rock count / gadget cooldown / HUD hit marker, so they are not shared):
 *
 *   slam     PAINT SLAM — hop, hang, dive; paint splash + a stomp hit around her feet (Companion.requestSlam)
 *   throw    a rice ball lobbed from her apron pocket (WAI throws eraser crumbs); a crash hit
 *   bomb     her gadget: a big rice ball that bursts into paint (WAI's KA-SPLASH, smaller), 14 s cooldown
 *   hover    a hop that floats on her paint jet (Companion.requestHover; also used by the route's gap jumps)
 *   whistle  her SHOUT: rings a veiled Hush moth (never the boss, never a bell or a puzzle)
 *
 * Damage goes through the same EnemyBase.applyDamage as WAI's, at a fraction of his numbers, and NEVER finishes a
 * creature: past 90 % repaint she leaves the last stroke (and the TAG / ENCORE) to WAI, so she can't steal a kill a
 * puzzle or a sticker drop depends on.
 */
export const MOVES = {
  slamCd: 5,
  slamDamage: 12,
  slamRadius: 2.2,
  throwCd: 2.2,
  throwDamage: 16,
  bombCd: 14,
  bombDamage: 34,
  bombRadius: 2.6,
  whistleCd: 3.2,
  /** she never pushes a creature past this (WAI finishes it) */
  maxRepaint: 0.9,
};

interface Ball {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  big: boolean;
  /** the creature it was thrown at: the lob bends a little toward where it went (her aim is generous, not perfect) */
  at?: { pos: THREE.Vector3; topY?: number };
}

export type MoveName = 'slam' | 'throw' | 'bomb' | 'hover' | 'whistle';

export class CoopMoves {
  private cd: Record<MoveName, number> = { slam: 0, throw: 0, bomb: 0, hover: 0, whistle: 0 };
  private balls: Ball[] = [];
  private tmp = new THREE.Vector3();
  /** how many of each she did (tests / status) */
  readonly used: Record<MoveName, number> = { slam: 0, throw: 0, bomb: 0, hover: 0, whistle: 0 };
  hits = 0;

  constructor(private p: CoopPartner) {
    p.pip.onSlamLand = (at, drop) => this.slamLand(at, drop);
  }

  ready(m: MoveName): boolean {
    return this.cd[m] <= 0;
  }

  /** May her paint still touch this one? (never the last stroke; never a friend) */
  static mayHurt(o: unknown): o is Damageable {
    if (!isDamageable(o) || (o as { coopBuddy?: boolean }).coopBuddy) return false;
    const e = o as unknown as Partial<EnemyBase>;
    if (e.kind === undefined) return true; // props / hosts that take paint
    return !e.harmless && (e.repaint ?? 0) < MOVES.maxRepaint;
  }

  /**
   * How much of `amount` she may deal: never enough to take a creature past 90 % (weak points can double a hit,
   * so the cap assumes they do). 0 = leave it to WAI.
   */
  static cap(o: unknown, amount: number): number {
    const e = o as { hp?: number; maxHp?: number; kind?: string };
    if (e.kind === undefined || typeof e.hp !== 'number' || typeof e.maxHp !== 'number') return amount;
    const room = (e.hp - e.maxHp * (1 - MOVES.maxRepaint)) / 2;
    return Math.max(0, Math.min(amount, room, CoopMoves.shareRoom?.() ?? Infinity));
  }

  /** Paint she may still land in the fight in progress (FightLedger.room: her share stays under its cap). Set by Coop. */
  static shareRoom: (() => number) | null = null;

  /** Do a move. `at` = where (an enemy's body, a point); returns a short result for the brain / the LLM. */
  do(m: MoveName, at?: THREE.Vector3 | null, foe?: { pos: THREE.Vector3 } | null): string {
    const pip = this.p.pip;
    if (pip.down > 0) return 'I am smudged';
    if (this.cd[m] > 0) return `${m} not ready (${this.cd[m].toFixed(1)} s)`;
    switch (m) {
      case 'slam':
        if (at && Math.hypot(at.x - pip.pos.x, at.z - pip.pos.z) > 3.6) return 'too far for a slam (get within 3.5 m)';
        if (at) pip.lookAt = at.clone();
        if (!pip.requestSlam(at)) return 'cannot slam now';
        break;
      case 'throw':
      case 'bomb': {
        if (!at) return 'throw at what?';
        const d = at.distanceTo(pip.pos);
        if (d > 18) return 'too far to throw';
        this.lob(at, m === 'bomb', foe ?? undefined);
        break;
      }
      case 'hover':
        if (!pip.requestHover()) return 'cannot hover now';
        break;
      case 'whistle':
        this.whistle();
        break;
    }
    this.cd[m] = m === 'slam' ? MOVES.slamCd : m === 'throw' ? MOVES.throwCd : m === 'bomb' ? MOVES.bombCd : m === 'whistle' ? MOVES.whistleCd : 2;
    this.used[m]++;
    this.p.event(`I did a ${m.toUpperCase()}`, false);
    return m;
  }

  // ───────── slam ─────────
  private slamLand(feet: THREE.Vector3, drop: number): void {
    const s = this.p.s;
    const fx = s.ctx.effects;
    const down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const r = i === 0 ? 0 : 0.6 + Math.random() * 1.1;
      const from = this.tmp.set(feet.x + Math.cos(a) * r, feet.y + 1, feet.z + Math.sin(a) * r);
      const sh = fx.paint?.surfaceHit(from, down, 2.5);
      if (sh) fx.splat(sh.point, sh.normal, PIP.paint, i === 0 ? 0.9 : 0.35 + Math.random() * 0.3, down, { drip: 0.2 });
    }
    fx.burst(feet.clone().setY(feet.y + 0.2), PIP.paint, 18, 5.5, 0.08, 14, new THREE.Vector3(0, 1, 0));
    fx.ring(feet.clone().setY(feet.y + 0.06), PIP.paint, MOVES.slamRadius * 2);
    fx.comic(feet.clone().setY(feet.y + 1.4), t('SPLOSH!'), PIP.body, 0.7);
    s.ctx.audio.play('slamLand', { pos: feet, vol: 0.6, pitch: 1.3 });
    this.hitAround(feet.clone().setY(feet.y + 0.5), MOVES.slamRadius, MOVES.slamDamage + Math.min(3, drop) * 3, 'stomp', 5);
  }

  /** Real hits on everything paintable around a point (her colour, her numbers). */
  private hitAround(c: THREE.Vector3, R: number, dmg: number, kind: 'stomp' | 'spit', knock: number): number {
    const s = this.p.s;
    let n = 0;
    for (const { target, point } of s.ctx.damageablesNear(c, R)) {
      if (!CoopMoves.mayHurt(target)) continue;
      const push = point.clone().sub(c).setY(0);
      if (push.lengthSq() < 1e-4) push.set(0, 0, 1);
      push.normalize();
      const fall = 1 - Math.min(1, point.distanceTo(c) / (R + 1)) * 0.5;
      const amount = CoopMoves.cap(target, dmg * fall);
      if (amount <= 0) continue;
      const before = paintDone(target);
      const r = target.applyDamage({ amount, point: point.clone(), dir: push, collider: null, kind, color: PIP.paint });
      if (r.absorbed) continue;
      const k = target as unknown as { knock?: (d: THREE.Vector3, s: number) => void; bigness?: number };
      if ((k.bigness ?? 0) < 0.6) k.knock?.(push, knock);
      this.noteHit(target, paintDone(target) - before);
      n++;
    }
    return n;
  }

  /** One of her hits landed: `paint` = what it took off (her damage share). */
  private noteHit(target: unknown, paint: number): void {
    this.hits++;
    this.p.swagger.ledger.mine(paint);
    const e = target as { id?: string; kind?: string };
    if (e.kind && e.id) this.p.dealt.set(e.id, (this.p.dealt.get(e.id) ?? 0) + 3);
  }

  // ───────── rice balls ─────────
  private ballMesh(big: boolean): THREE.Object3D {
    const g = new THREE.Group();
    const rice = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.2 : 0.12, 10, 8), toon({ color: '#fffaf2' }));
    rice.scale.set(1, 0.9, 0.8);
    addOutline(rice, 0.02);
    const nori = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.22 : 0.13, big ? 0.16 : 0.1, big ? 0.34 : 0.21), toon({ color: '#1d2a2a' }));
    nori.position.y = -0.05;
    g.add(rice, nori);
    if (big) {
      const dab = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon({ color: PIP.paint }));
      dab.position.y = 0.15;
      g.add(dab);
    }
    g.traverse((o) => (o.userData.noPaint = true));
    return g;
  }

  private lob(at: THREE.Vector3, big: boolean, foe?: { pos: THREE.Vector3 }): void {
    const pip = this.p.pip;
    const s = this.p.s;
    const start = pip.muzzle().clone().setY(pip.pos.y + 0.75);
    const to = at.clone().sub(start);
    const flat = Math.hypot(to.x, to.z);
    const speed = big ? 11 : 14;
    const tf = Math.max(0.2, flat / speed);
    const vel = new THREE.Vector3(to.x / tf, to.y / tf + 0.5 * 20 * tf, to.z / tf);
    const mesh = this.ballMesh(big);
    mesh.position.copy(start);
    s.ctx.root.add(mesh);
    this.balls.push({ mesh, pos: start, vel, life: 3, big, at: foe });
    pip.lookAt = at.clone();
    pip.cheerT = Math.max(pip.cheerT, 0.25);
    s.ctx.audio.play('whoosh', { pos: start, pitch: 1.7, vol: 0.4 });
  }

  private ballLand(b: Ball, point: THREE.Vector3, normal: THREE.Vector3, owner: unknown): void {
    const s = this.p.s;
    const fx = s.ctx.effects;
    const dir = b.vel.clone().normalize();
    if (b.big) {
      // a small KA-SPLASH in her colour
      const sh = fx.paint?.surfaceHit(point.clone().addScaledVector(dir, -0.6), dir, 1.6);
      if (sh) fx.splat(sh.point, sh.normal, PIP.paint, 1.3, dir, { drip: 0.6 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const q = this.tmp.set(point.x + Math.cos(a) * 1.6, point.y + 1.2, point.z + Math.sin(a) * 1.6);
        const g = fx.paint?.surfaceHit(q, new THREE.Vector3(0, -1, 0), 3);
        if (g) fx.splat(g.point, g.normal, i % 3 ? PIP.paint : '#ffffff', 0.4 + Math.random() * 0.4, new THREE.Vector3(0, -1, 0), { drip: 0.3 });
      }
      fx.burst(point.clone().addScaledVector(normal, 0.3), PIP.paint, 26, 7, 0.1, 10, normal);
      fx.burst(point.clone().addScaledVector(normal, 0.3), '#ffffff', 14, 5, 0.07, 10, normal);
      fx.ring(point.clone().addScaledVector(normal, 0.05), PIP.paint, MOVES.bombRadius * 2, normal);
      fx.comic(point.clone().setY(point.y + 1.3), t('RICE-SPLASH!'), PIP.body, 0.9);
      s.ctx.audio.play('crash', { pos: point, vol: 0.7, pitch: 1.2 });
      s.ctx.audio.play('splat', { pos: point, vol: 0.8, pitch: 0.7 });
      this.hitAround(point, MOVES.bombRadius, MOVES.bombDamage, 'spit', 6);
      return;
    }
    if (CoopMoves.mayHurt(owner) && (owner as { kind?: string }).kind !== undefined) {
      const amount = CoopMoves.cap(owner, MOVES.throwDamage);
      const before = paintDone(owner);
      const r = amount > 0 ? owner.applyDamage({ amount, point, dir, collider: null, kind: 'crash', color: '#fffaf2' }) : { absorbed: true, weak: false };
      if (!r.absorbed) {
        const k = owner as unknown as { knock?: (d: THREE.Vector3, s: number) => void; bigness?: number; interruptBy?: (weak: boolean) => void };
        k.knock?.(dir, 2.5 * (1 - (k.bigness ?? 0) * 0.6));
        this.noteHit(owner, paintDone(owner) - before);
        fx.comic(point.clone().setY(point.y + 0.6), t(r.weak ? 'BONK!' : 'THUNK!'), '#fffaf2', 0.55);
        s.ctx.audio.play('crash', { pos: point, vol: 0.4, pitch: 1.6 });
      }
    }
    fx.burst(point, '#fffaf2', 10, 3, 0.05);
    const sh = fx.paint?.surfaceHit(point.clone().addScaledVector(dir, -0.5), dir, 1.2);
    if (sh) fx.splat(sh.point, sh.normal, '#fffaf2', 0.22, dir, { drip: 0.2 });
  }

  // ───────── whistle ─────────
  private whistle(): void {
    const pip = this.p.pip;
    const s = this.p.s;
    s.ctx.effects.comic(pip.pos.clone().setY(pip.pos.y + 1.4), t('TWEEET!'), PIP.body, 0.55);
    s.ctx.audio.play('squeak', { pos: pip.pos, pitch: 2.2, vol: 0.7 });
    for (const e of s.enemies) {
      const m = e as unknown as { kind?: string; veiled?: boolean; onShout?: (big: boolean, from: THREE.Vector3) => void };
      if (m.kind === 'hushmoth' && m.veiled && typeof m.onShout === 'function' && e.pos.distanceTo(pip.pos) < 9) m.onShout(false, pip.pos);
    }
  }

  // ───────── per step ─────────
  step(dt: number): void {
    for (const k of Object.keys(this.cd) as MoveName[]) this.cd[k] = Math.max(0, this.cd[k] - dt);
    const s = this.p.s;
    const ph = s.physics;
    const own = this.p.pip.collider.handle, wai = s.player.collider.handle;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.life -= dt;
      b.vel.y -= 20 * dt;
      if (b.at && !b.big) {
        const dx = b.at.pos.x - b.pos.x, dz = b.at.pos.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (d > 0.3 && sp > 0.1) {
          const k = Math.min(1, dt * 4);
          b.vel.x += ((dx / d) * sp - b.vel.x) * k;
          b.vel.z += ((dz / d) * sp - b.vel.z) * k;
        }
      }
      const step = this.tmp.copy(b.vel).multiplyScalar(dt);
      const len = step.length();
      const hit = len > 1e-5 ? ph.raycast(b.pos, step.clone().divideScalar(len), len + 0.12, (c) => c.handle !== own && c.handle !== wai && ph.tagOf(c) !== 'water') : null;
      if (hit || b.life <= 0) {
        if (hit) this.ballLand(b, hit.point, hit.normal, ph.ownerOf(hit.collider));
        b.mesh.removeFromParent();
        this.balls.splice(i, 1);
        continue;
      }
      b.pos.add(step);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 9;
    }
  }

  dispose(): void {
    for (const b of this.balls) b.mesh.removeFromParent();
    this.balls.length = 0;
  }
}
