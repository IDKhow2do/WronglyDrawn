import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import { isDamageable } from '../combat/Damage';
import { Effects } from '../render/Effects';
import { SprayFx } from '../render/SprayFx';
import { t } from '../i18n';
import { Difficulty } from '../meta/Difficulty';

/** PAINT SLAM damage per creature in the ring: base + metres dropped (≤ 3) × perMetre, × the difficulty's slam row. */
export const SLAM = { base: 12, perMetre: 4 };

export const SPRAY = {
  rate: 84, // droplets per second while held (a dense stream, not pellets)
  speed: 17,
  drag: 1.3,
  gravity: 6,
  life: 0.6, // ≈ 8 m reach
  repaint: 0.56, // corruption removed per droplet (~47/s, more on weak spots)
  spread: 0.07,
  aimSpread: 0.032,
  tank: 140,
  drain: 20, // per second
  regen: 34,
  regenDelay: 0.4,
  spitDamage: 45,
  spitRadius: 2.6,
  bombDamage: 90,
  bombRadius: 3.8,
  bombCooldown: 5,
  /** Splat / drop size multiplier (weapon caps). */
  size: 1,
  /** Crosshair "in reach" distance (m). */
  reach: 7.5,
};

interface Drop {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  color: THREE.Color;
  css: string;
  /** Splash-back droplet: no damage, smaller paint. */
  secondary: boolean;
  /** Visual-only fringe droplet (makes the stream read as a fan, never hits anything). */
  cosmetic: boolean;
  size: number;
}

/** Aerosol around the nozzle (mist) or the burst where a droplet lands (splat). */
interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  color: THREE.Color;
  size: number;
  splat: boolean;
  seed: number;
}

interface Spit {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  mesh: THREE.Mesh;
  /** Paint bomb (bigger, bouncier, KA-SPLASH). */
  bomb?: string;
}

const MAX_DROPS = 320;
const MAX_PUFFS = 120;
/** Per-colour shade variants (the stream is never one flat colour); built once per colour change. */
const SHADES = 8;

// scratch (fixed-step hot path: no per-frame allocations)
const _step = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rnd = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');

const newDrop = (): Drop => ({ pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, color: new THREE.Color(), css: '', secondary: false, cosmetic: false, size: 1 });
const newPuff = (): Puff => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, color: new THREE.Color(), size: 0.1, splat: false, seed: 0 });

/** Remove item i from a list in O(1) (order does not matter: everything is drawn in one batch). */
function swapOut<T>(list: T[], i: number, free: T[]): void {
  free.push(list[i]);
  list[i] = list[list.length - 1];
  list.pop();
}

/**
 * The Spray Can. Holding fire pushes a dense stream of liquid paint: inked,
 * motion-blurred streaks in flight, a soft cone of mist at the nozzle, a burst
 * where each droplet lands (all one SprayFx batch), and REAL paint where it
 * lands (wrapping the actual mesh, smearing on glancing hits, dripping down
 * walls). Paint that hits a creature coats its body, splashes back onto the
 * ground around it, and re-paints its corruption away — nobody is killed.
 * With a mouthful (Mouth worn) the click spits it instead.
 */
export class WeaponSystem {
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private freeDrops: Drop[] = Array.from({ length: MAX_DROPS }, newDrop);
  private freePuffs: Puff[] = Array.from({ length: MAX_PUFFS }, newPuff);
  private spits: Spit[] = [];
  tank = SPRAY.tank;
  private emitAcc = 0;
  private puffAcc = 0;
  private sinceSpray = 10;
  private colorIdx = 0;
  /** Spray colours unlocked so far (paint drops unlock more). */
  unlocked = 2;
  private css = Effects.splatColor(0);
  private spraying = false;
  private rangeTimer = 0;
  /** Is whatever is under the crosshair within the spray's reach? */
  inRange = true;
  private hitCd = 0;
  private hitSoundCd = 0;
  private patterCd = 0;
  shots = 0;
  hits = 0;
  bombCd = 0;
  /** The spray can was thrown (ThrowSystem) and lies somewhere. */
  canOut = false;
  onShot: ((heavy: boolean) => void) | null = null;
  muzzleProvider: (() => THREE.Vector3) | null = null;
  /** Streaks, mist and landing bursts: one draw call. Mist + bursts are written first, streaks over them. */
  private fx = new SprayFx(MAX_DROPS + MAX_PUFFS);
  private tmp = new THREE.Vector3();
  /** Shade variants of the current colour (drops pick one: same paint logic, no per-drop allocation). */
  private shades: { color: THREE.Color; css: string }[] = [];
  private shadeOf = '';
  private mistColor = new THREE.Color();
  /** Aim + muzzle are resolved once per step, not per droplet. */
  private stepAim = new THREE.Vector3();
  private stepMuzzle = new THREE.Vector3();

  constructor(private ctx: GameContext) {
    ctx.root.add(this.fx.mesh);
  }

  /** Rebuild the shade table when the colour changes (T, or a new unlock). */
  private ensureShades(): void {
    if (this.shadeOf === this.css) return;
    this.shadeOf = this.css;
    this.shades = [];
    for (let i = 0; i < SHADES; i++) {
      const c = new THREE.Color(this.css);
      c.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.1);
      this.shades.push({ color: c, css: '#' + c.getHexString() });
    }
    this.mistColor.set(this.css).lerp(WHITE, 0.35);
  }

  /** `recycle`: pool full → reuse a drop in flight (never while the drop list is being walked). */
  private takeDrop(): Drop;
  private takeDrop(recycle: false): Drop | null;
  private takeDrop(recycle = true): Drop | null {
    if (!this.freeDrops.length) {
      if (!recycle) return null;
      swapOut(this.drops, 0, this.freeDrops);
    }
    const d = this.freeDrops.pop()!;
    this.drops.push(d);
    return d;
  }

  private takePuff(): Puff {
    if (!this.freePuffs.length) swapOut(this.puffs, 0, this.freePuffs);
    const p = this.freePuffs.pop()!;
    this.puffs.push(p);
    return p;
  }

  get tankFrac(): number {
    return this.tank / SPRAY.tank;
  }
  get spreadNow(): number {
    return this.spraying ? SPRAY.spread * 0.5 : 0.01;
  }
  get color(): string {
    return this.css;
  }

  step(dt: number, player: PlayerController, canFire: boolean): void {
    const input = this.ctx.input;
    if (this.ctx.camera.inCine) canFire = false; // never spray while a close-up is playing
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.hitSoundCd = Math.max(0, this.hitSoundCd - dt);
    this.patterCd = Math.max(0, this.patterCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    // the can is out of WAI's hand (thrown): no spraying until he picks it up
    if (this.canOut) canFire = false;
    const pressed = input.consumePressed('Mouse0');
    const held = input.isDown('Mouse0');
    // colour stays locked; T (or the COLOR touch button) cycles it
    if (input.consumePressed('KeyT')) {
      this.colorIdx = (this.colorIdx + 1) % this.unlocked;
      this.css = Effects.splatColor(this.colorIdx);
      this.ctx.audio.play('select', { pitch: 1 + this.colorIdx * 0.08 });
    }
    // reach hint for the crosshair
    this.rangeTimer -= dt;
    if (this.rangeTimer <= 0) {
      this.rangeTimer = 0.1;
      const aim = this.ctx.camera.aimRay();
      const hit = this.ctx.physics.raycast(aim.origin, aim.dir, 40, (c) => c.handle !== player.collider.handle);
      const fromPlayer = hit ? hit.point.distanceTo(player.pos) : 99;
      this.inRange = fromPlayer < SPRAY.reach;
    }
    let spraying = false;
    if (canFire && player.mouthful && pressed) this.spit(player);
    else if (canFire && (held || pressed) && !player.mouthful) {
      if (this.tank > 0.5) {
        spraying = true;
        this.ensureShades();
        this.stepMuzzle.copy(this.muzzle(player));
        this.stepAim.copy(this.aimDir(player, this.stepMuzzle));
        this.emitAcc += dt * SPRAY.rate;
        while (this.emitAcc >= 1) {
          this.emitAcc -= 1;
          this.emit();
        }
        this.puffAcc += dt * 48;
        while (this.puffAcc >= 1) {
          this.puffAcc -= 1;
          this.emitPuff();
        }
        // nozzle pressure: a constant tiny shiver + slow climb, like a real can
        this.ctx.camera.recoil(0.0009 * dt * 60);
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.12);
        this.tank = Math.max(0, this.tank - SPRAY.drain * dt);
        this.sinceSpray = 0;
      } else if (pressed) this.ctx.audio.play('shootEmpty');
    }
    if (!spraying) this.sinceSpray += dt;
    if (this.sinceSpray > SPRAY.regenDelay) this.tank = Math.min(SPRAY.tank, this.tank + SPRAY.regen * dt);
    if (spraying !== this.spraying) {
      this.spraying = spraying;
      this.ctx.audio.loop('spray', spraying, 'spray', 0.55);
      if (spraying) {
        this.onShot?.(false);
        this.ctx.audio.play('shoot', { vol: 0.35, pitch: 1.5 }); // valve "tsk" on press
      }
    }
    if (spraying) {
      const aim = this.ctx.camera.aimRay().dir;
      player.faceDir(new THREE.Vector3(aim.x, 0, aim.z));
      if (player.action !== 'attack') player.playAction('attack', 0.25);
      else player.actionT = Math.min(player.actionT, 0.1);
    }
    this.simulate(dt, player);
  }

  private aimDir(player: PlayerController, muzzle: THREE.Vector3): THREE.Vector3 {
    const aim = this.ctx.camera.aimRay();
    const hit = this.ctx.physics.raycast(aim.origin, aim.dir, 60, (c) => c.handle !== player.collider.handle);
    let target = hit ? hit.point : aim.origin.clone().addScaledVector(aim.dir, 60);
    if (target.clone().sub(muzzle).dot(aim.dir) < 0.3) target = muzzle.clone().addScaledVector(aim.dir, 10);
    return target.sub(muzzle).normalize();
  }

  private muzzle(player: PlayerController): THREE.Vector3 {
    return this.muzzleProvider ? this.muzzleProvider() : player.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
  }

  private emit(): void {
    const m = this.stepMuzzle;
    const spread = this.ctx.camera.aimT > 0.5 ? SPRAY.aimSpread : SPRAY.spread;
    // gaussian-ish cone: dense core, thin fringe
    const g = (Math.random() + Math.random() + Math.random()) / 3;
    _rnd.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.abs(g - 0.5) * 2 * spread * 1.4);
    _dir.copy(this.stepAim).add(_rnd).normalize();
    const shade = this.shades[(Math.random() * SHADES) | 0];
    const d = this.takeDrop();
    d.pos.copy(m);
    d.prev.copy(m);
    d.vel.copy(_dir).multiplyScalar(SPRAY.speed * (0.88 + Math.random() * 0.24));
    d.vel.y += 1.1; // slight lift so the arc lands where you aim at mid range
    d.age = 0;
    d.life = SPRAY.life;
    d.color.copy(shade.color);
    d.css = shade.css;
    d.secondary = false;
    d.cosmetic = false;
    d.size = SPRAY.size;
    const speed = d.vel.length();
    // fringe: a wider, short-lived fan around the real stream
    for (let k = 0; k < 2; k++) {
      _rnd.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 5);
      const f = this.takeDrop();
      f.pos.copy(m);
      f.prev.copy(m);
      f.vel.copy(d.vel).divideScalar(speed).add(_rnd).normalize().multiplyScalar(SPRAY.speed * (0.5 + Math.random() * 0.5));
      f.age = 0;
      f.life = 0.12 + Math.random() * 0.16;
      f.color.copy(shade.color).offsetHSL(0, 0, (Math.random() - 0.3) * 0.15);
      f.css = this.css;
      f.secondary = true;
      f.cosmetic = true;
      f.size = 0.7;
    }
    this.shots++;
  }

  /** The mist cone: soft puffs pushed forward along the aim, opening up as they slow. */
  private emitPuff(): void {
    const dir = this.stepAim;
    // in first person the nozzle sits under the camera: start the cloud further out so it never fogs the view
    const fp = this.ctx.camera.aimT;
    const p = this.takePuff();
    p.pos.copy(this.stepMuzzle).addScaledVector(dir, 0.12 + fp * 1.1);
    p.vel.copy(dir).multiplyScalar(3 + Math.random() * 4.5);
    p.vel.x += (Math.random() - 0.5) * 0.9;
    p.vel.y += Math.random() * 0.4;
    p.vel.z += (Math.random() - 0.5) * 0.9;
    p.age = 0;
    p.life = 0.3 + Math.random() * 0.3;
    p.color.copy(this.mistColor);
    p.size = (0.06 + Math.random() * 0.06) * (1 - fp * 0.4);
    p.splat = false;
  }

  /** The burst where a droplet lands: a ragged star of paint that pops and fades (the decal stays). */
  private burstAt(point: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, size: number): void {
    const p = this.takePuff();
    p.pos.copy(point).addScaledVector(normal, 0.04);
    p.vel.copy(normal).multiplyScalar(0.4);
    p.age = 0;
    p.life = 0.14 + Math.random() * 0.08;
    p.color.copy(color);
    p.size = size;
    p.splat = true;
    p.seed = Math.random();
  }

  private simulate(dt: number, player: PlayerController): void {
    const skip = (c: RAPIER.Collider) => c.handle !== player.collider.handle && this.ctx.physics.tagOf(c) !== 'water';
    // reverse + swap-remove: anything spawned while landing is appended and waits for the next step
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.prev.copy(d.pos);
      d.age += dt;
      d.vel.multiplyScalar(Math.exp(-SPRAY.drag * dt));
      d.vel.y -= SPRAY.gravity * dt * (d.secondary ? 2.2 : 1);
      _step.copy(d.vel).multiplyScalar(dt);
      const len = _step.length();
      const hit = len > 1e-5 && !d.cosmetic ? this.ctx.physics.raycast(d.pos, _dir.copy(_step).divideScalar(len), len, skip) : null;
      if (hit) {
        this.land(d, hit.point, hit.normal, hit.collider);
        swapOut(this.drops, i, this.freeDrops);
        continue;
      }
      d.pos.add(_step);
      if (d.age > d.life) swapOut(this.drops, i, this.freeDrops);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (!p.splat) {
        p.vel.multiplyScalar(Math.exp(-4 * dt));
        p.vel.y += 0.6 * dt;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.age > p.life) swapOut(this.puffs, i, this.freePuffs);
    }
    // spit (heavy mouth shot)
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.prev.copy(s.pos);
      s.vel.y -= 6 * dt;
      const step = s.vel.clone().multiplyScalar(dt);
      const hit = this.ctx.physics.raycast(s.pos, step.clone().normalize(), step.length(), (c) => c.handle !== player.collider.handle);
      s.life -= dt;
      if (hit) {
        if (s.bomb) this.bombImpact(hit.point, hit.normal, s.vel.clone().normalize(), s.bomb);
        else this.spitImpact(hit.point, hit.normal, s.vel.clone().normalize());
        this.ctx.root.remove(s.mesh);
        this.spits.splice(i, 1);
        continue;
      }
      s.pos.add(step);
      if (s.life <= 0) {
        this.ctx.root.remove(s.mesh);
        this.spits.splice(i, 1);
      }
    }
  }

  /** Paint on the REAL visual surface near a collider hit (colliders are simplified). */
  private paintSurface(point: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, css: string, radius: number, drip: number): void {
    const paint = this.ctx.effects.paint;
    const back = point.clone().addScaledVector(dir, -0.7);
    const s = paint?.surfaceHit(back, dir, 1.6);
    if (s) this.ctx.effects.splat(s.point, s.normal, css, radius, dir, { drip });
    else this.ctx.effects.splat(point, normal, css, radius, dir, { drip });
  }

  private land(d: Drop, point: THREE.Vector3, normal: THREE.Vector3, collider: RAPIER.Collider): void {
    const dir = d.vel.clone().normalize();
    const owner = this.ctx.physics.ownerOf<unknown>(collider);
    if (!d.secondary && isDamageable(owner)) {
      const r = owner.applyDamage({ amount: SPRAY.repaint * this.ctx.combat.paintMul, point, dir, collider, kind: 'paint', color: d.css });
      if (r.absorbed) return;
      this.hits++;
      this.burstAt(point, normal, d.color, 0.16 + Math.random() * 0.08);
      // the paint coats the creature's actual body…
      if (this.hits % 3 === 0) this.paintSurface(point, normal, dir, d.css, 0.2 + Math.random() * 0.1, 0.9);
      // …and splashes back onto whatever is around it
      if (Math.random() < 0.35) this.splashBack(point, normal, dir, d);
      if (this.hitCd <= 0 || r.finished) {
        this.hitCd = 0.1;
        this.ctx.events.emit('hit:marker', { weak: r.weak, finished: !!r.finished });
        this.ctx.effects.burst(point, d.css, r.weak ? 5 : 3, 2.6, 0.045, 12, normal.clone().sub(dir).normalize());
      }
      if (this.hitSoundCd <= 0) {
        this.hitSoundCd = r.weak ? 0.07 : 0.085;
        this.ctx.audio.play(r.weak ? 'hitWeak' : 'paintHit', { pos: point, vol: r.weak ? 0.45 : 0.4, pitch: 0.9 + Math.random() * 0.25 });
      }
      return;
    }
    // paint stays on the world: bigger the further it flew (the cone opens up)
    const radius = d.secondary ? 0.07 + Math.random() * 0.06 : (0.16 + d.age * 0.42) * d.size;
    this.paintSurface(point, normal, dir, d.css, radius, d.secondary ? 0.3 : 0.75);
    if (!d.secondary) {
      // the hit reads: a burst the size of the splat, and now and then a droplet kicked back off the surface
      this.burstAt(point, normal, d.color, Math.max(0.22, radius * (1.3 + Math.random() * 0.5)));
      if (Math.random() < 0.3) this.kick(point, normal, dir, d.color, d.css);
    }
    if (this.patterCd <= 0) {
      this.patterCd = 0.045;
      this.ctx.audio.play('patter', { pos: point, vol: d.secondary ? 0.12 : 0.22 });
    }
  }

  /** A few droplets bounce off a creature and land around it as real paint. */
  private splashBack(point: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, d: Drop): void {
    for (let k = 0; k < 2; k++) {
      const s = this.takeDrop(false);
      if (!s) return;
      s.vel.copy(dir).reflect(normal).multiplyScalar(2 + Math.random() * 2.5);
      s.vel.x += (Math.random() - 0.5) * 3;
      s.vel.y += Math.random() * 2;
      s.vel.z += (Math.random() - 0.5) * 3;
      s.pos.copy(point).addScaledVector(normal, 0.08);
      s.prev.copy(s.pos);
      s.age = 0;
      s.life = 1.2;
      s.color.copy(d.color);
      s.css = d.css;
      s.secondary = true;
      s.cosmetic = false;
      s.size = 0.6;
    }
  }

  /** Visual-only droplet kicked back off a wall or the ground where the stream lands. */
  private kick(point: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, css: string): void {
    const s = this.takeDrop(false);
    if (!s) return;
    s.vel.copy(dir).reflect(normal).multiplyScalar(1.5 + Math.random() * 2).addScaledVector(normal, 1.5);
    s.vel.x += (Math.random() - 0.5) * 2;
    s.vel.z += (Math.random() - 0.5) * 2;
    s.pos.copy(point).addScaledVector(normal, 0.05);
    s.prev.copy(s.pos);
    s.age = 0;
    s.life = 0.18 + Math.random() * 0.12;
    s.color.copy(color);
    s.css = css;
    s.secondary = true;
    s.cosmetic = true;
    s.size = 0.6;
  }

  private spit(player: PlayerController): void {
    player.mouthful = false;
    const m = this.muzzle(player);
    const dir = this.aimDir(player, m);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: '#b23cff', roughness: 0.2 }));
    mesh.userData.noPaint = true;
    mesh.position.copy(m);
    this.ctx.root.add(mesh);
    this.spits.push({ pos: m.clone(), prev: m.clone(), vel: dir.multiplyScalar(28).add(new THREE.Vector3(0, 1.5, 0)), life: 2, mesh });
    this.ctx.camera.recoil(0.05);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
    this.ctx.audio.play('spit');
    this.onShot?.(true);
    this.ctx.inventory.changed();
  }

  /** Gadget: lob a Paint Bomb along the aim (KA-SPLASH on impact). */
  lobBomb(player: PlayerController): void {
    const m = this.muzzle(player);
    const dir = this.aimDir(player, m);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: this.css, roughness: 0.25, emissive: this.css, emissiveIntensity: 0.25 }));
    mesh.userData.noPaint = true;
    mesh.position.copy(m);
    this.ctx.root.add(mesh);
    this.spits.push({ pos: m.clone(), prev: m.clone(), vel: dir.multiplyScalar(17).add(new THREE.Vector3(0, 5.5, 0)), life: 3, mesh, bomb: this.css });
    this.ctx.camera.recoil(0.04);
    this.ctx.audio.play('spit', { pitch: 0.7 });
  }

  /** Gadget: one paint droplet from a world point (the Sprinkler Can). */
  emitFrom(origin: THREE.Vector3, dir: THREE.Vector3, css = this.css): void {
    const d = this.takeDrop();
    _rnd.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.12);
    d.vel.copy(dir).add(_rnd).normalize().multiplyScalar(15 * (0.9 + Math.random() * 0.2));
    d.vel.y += 1.2;
    d.pos.copy(origin);
    d.prev.copy(origin);
    d.age = 0;
    d.life = 0.65;
    d.color.set(css);
    d.css = css;
    d.secondary = false;
    d.cosmetic = false;
    d.size = 0.9;
  }

  get bombFrac(): number {
    return 1 - this.bombCd / SPRAY.bombCooldown;
  }

  /** JET HOVER fuel: the jet sprays from the same can (1.6× the spray drain). Returns the colour, or null if empty / can thrown. */
  drainForJet(dt: number): string | null {
    if (this.canOut || this.tank <= 1) return null;
    this.tank = Math.max(0, this.tank - SPRAY.drain * 1.6 * dt);
    this.sinceSpray = 0;
    return this.css;
  }

  /**
   * PAINT SLAM landing: a ring of paint on the ground (surfable) and a
   * splash that repaints everything close by. Higher dives hit harder.
   * Big creatures that are open (dazed…) take it on their weak spot (kind 'stomp').
   */
  paintSlam(feet: THREE.Vector3, drop: number): void {
    const R = 2.9;
    const color = this.css;
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    this.paintSurface(feet.clone().add(new THREE.Vector3(0, 0.05, 0)), up, down, color, 1.5, 0.3);
    const pal = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
      const r = 1.2 + Math.random() * 1.4;
      const hit = this.ctx.physics.raycast(feet.clone().add(new THREE.Vector3(Math.cos(a) * r, 1.2, Math.sin(a) * r)), down, 3, (c) => this.ctx.physics.tagOf(c) === 'static');
      if (hit) this.paintSurface(hit.point, hit.normal, down, i % 3 === 0 ? pal[i % 5] : color, 0.45 + Math.random() * 0.4, 0.2);
    }
    this.ctx.effects.burst(feet.clone().add(new THREE.Vector3(0, 0.2, 0)), color, 26, 7, 0.1, 14, up);
    this.ctx.effects.burst(feet.clone().add(new THREE.Vector3(0, 0.2, 0)), '#ffffff', 10, 5, 0.07, 14, up);
    this.ctx.effects.ring(feet.clone().add(new THREE.Vector3(0, 0.06, 0)), color, R * 2);
    this.ctx.effects.comic(feet.clone().add(new THREE.Vector3(0, 1.5, 0)), t('PAINT SLAM!'), color, 0.85);
    // a good opener and crowd tool, not the best damage in the game (difficulty pass, docs/difficulty/NOTES.md)
    const dmg = (SLAM.base + Math.min(3, drop) * SLAM.perMetre) * Difficulty.s.slam;
    let any = false;
    for (const { target, point: tp } of this.ctx.damageablesNear(feet.clone().add(new THREE.Vector3(0, 0.6, 0)), R)) {
      const push = tp.clone().sub(feet).setY(0);
      if (push.lengthSq() < 1e-4) push.set(0, 0, 1);
      push.normalize();
      const r = target.applyDamage({ amount: dmg * this.ctx.combat.paintMul, point: tp.clone(), dir: push, collider: null, kind: 'stomp', color, fixed: true });
      if (r.absorbed) continue;
      const k = target as unknown as { knock?: (d: THREE.Vector3, s: number) => void; bigness?: number };
      if ((k.bigness ?? 0) < 0.6) k.knock?.(push, 7);
      any = true;
      this.ctx.events.emit('hit:marker', { weak: r.weak, finished: !!r.finished });
    }
    if (any) {
      this.ctx.time.hitstop(0.08);
      this.ctx.combat.impact(0.5);
    }
  }

  /** KA-SPLASH: a fully charged can bursts on impact (also used by ThrowSystem). */
  bombImpact(point: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, color: string): void {
    const R = SPRAY.bombRadius;
    // paint everything around: a big core + a ring of splats thrown onto nearby surfaces
    this.paintSurface(point, normal, dir, color, 2.6, 0.8);
    const pal = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0.15 + Math.random() * 0.5, Math.sin(a)).normalize();
      const from = point.clone().addScaledVector(normal, 0.3);
      const hit = this.ctx.physics.raycast(from, out, R * 1.3, (c) => {
        const tag = this.ctx.physics.tagOf(c);
        return tag !== 'player' && tag !== 'water';
      });
      const p2 = hit ? hit.point : null;
      if (p2) this.paintSurface(p2, hit!.normal, out, i % 3 === 0 ? pal[i % 5] : color, 0.6 + Math.random() * 0.6, 1);
      else {
        const down = this.ctx.physics.raycast(point.clone().addScaledVector(out, R * (0.5 + Math.random() * 0.6)).add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0), 4);
        if (down) this.paintSurface(down.point, down.normal, new THREE.Vector3(0, -1, 0), color, 0.5 + Math.random() * 0.6, 0.3);
      }
    }
    for (const c of [color, '#ffffff', pal[Math.floor(Math.random() * 5)]]) this.ctx.effects.burst(point.clone().addScaledVector(normal, 0.3), c, 22, 9, 0.11, 10, normal);
    this.ctx.effects.ring(point.clone().addScaledVector(normal, 0.05), color, R * 2.2, normal);
    this.ctx.effects.ring(point.clone().addScaledVector(normal, 0.08), '#ffffff', R * 1.4, normal);
    this.ctx.effects.comic(point.clone().add(new THREE.Vector3(0, 1.4, 0)), t('KA-SPLASH!'), color, 1.1);
    this.ctx.audio.play('crash', { pos: point, vol: 1 });
    this.ctx.audio.play('splat', { pos: point, vol: 1, pitch: 0.5 });
    const near = this.ctx.camera.aimRay().origin.distanceTo(point);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, Math.max(0.35, 1.3 - near / 18));
    this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 4);
    let any = false;
    for (const { target, point: tp } of this.ctx.damageablesNear(point, R)) {
      const fall = 1 - Math.min(1, tp.distanceTo(point) / (R + 1.5)) * 0.5;
      const push = tp.clone().sub(point).setY(0);
      if (push.lengthSq() < 1e-4) push.copy(dir);
      push.normalize();
      const r = target.applyDamage({ amount: SPRAY.bombDamage * fall * this.ctx.combat.paintMul, point: tp, dir: push, collider: null, kind: 'spit', color });
      const k = target as unknown as { knock?: (d: THREE.Vector3, s: number) => void; bigness?: number };
      k.knock?.(push, 9 - (k.bigness ?? 0) * 5);
      any = true;
      this.ctx.events.emit('hit:marker', { weak: true, finished: !!r.finished });
    }
    this.ctx.time.hitstop(any ? 0.14 : 0.06);
    if (any) this.ctx.combat.impact(0.8);
  }

  private spitImpact(point: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3): void {
    const color = '#b23cff';
    this.ctx.effects.burst(point, color, 26, 6, 0.1, 12, normal);
    this.ctx.effects.ring(point.clone().addScaledVector(normal, 0.05), color, SPRAY.spitRadius * 1.6, normal);
    this.paintSurface(point, normal, dir, color, 1.1, 1);
    for (let i = 0; i < 10; i++) {
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.4).projectOnPlane(normal);
      this.paintSurface(point.clone().add(off), normal, dir, color, 0.25 + Math.random() * 0.35, 1);
    }
    this.ctx.audio.play('crash', { pos: point, vol: 0.8 });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5);
    let any = false;
    for (const { target, point: tp } of this.ctx.damageablesNear(point, SPRAY.spitRadius)) {
      const r = target.applyDamage({ amount: SPRAY.spitDamage, point: tp, dir, collider: null, kind: 'spit', color });
      any = true;
      this.ctx.events.emit('hit:marker', { weak: true, finished: !!r.finished });
    }
    if (any) this.ctx.time.hitstop(0.09);
  }

  render(alpha: number): void {
    const fx = this.fx;
    const fp = this.ctx.camera.aimT;
    fx.begin();
    // mist + landing bursts first (behind), streaks on top
    for (const p of this.puffs) {
      const t = p.age / p.life;
      if (p.splat) {
        // pops out fast, then shrinks away
        const grow = Math.min(1, t * 4);
        // first person: the burst sits on the crosshair, keep it see-through
        fx.splat(p.pos, p.color, p.size * (0.55 + 0.45 * grow) * (1 - 0.35 * fp), 0.95 * (1 - 0.45 * fp) * (1 - t * t), p.seed);
      } else {
        // the cone: puffs stretched along their motion, swelling as they slow
        const a = 0.5 * (1 - 0.55 * fp) * (1 - t) * Math.min(1, t * 10);
        fx.mist(p.pos, p.vel, Math.min(0.6, p.vel.length() * 0.08), p.color, p.size + t * (0.7 - 0.35 * fp), a);
      }
    }
    for (const d of this.drops) {
      const head = this.tmp.lerpVectors(d.prev, d.pos, alpha);
      const t = d.age / d.life;
      // motion blur ≈ 5 frames of travel (a streak, not a drop); streaks thicken as the stream opens up
      const len = Math.min(1.4, d.vel.length() * 0.08);
      // third person reads from ~6 m away: fatter; first person starts thin under the camera so the jet breaks into strands
      const w = (0.016 + Math.min(1, t * 1.5) * 0.05) * d.size * (1.35 - 0.5 * fp);
      fx.streak(head, d.vel, len, d.color, w, d.cosmetic ? 0.8 : 0.97);
    }
    fx.end();
    for (const s of this.spits) s.mesh.position.lerpVectors(s.prev, s.pos, alpha);
  }

  clear(): void {
    for (const d of this.drops) this.freeDrops.push(d);
    for (const p of this.puffs) this.freePuffs.push(p);
    this.drops.length = 0;
    this.puffs.length = 0;
    for (const s of this.spits) this.ctx.root.remove(s.mesh);
    this.spits = [];
    this.ctx.audio.loop('spray', false, 'spray');
    this.fx.dispose();
  }
}
