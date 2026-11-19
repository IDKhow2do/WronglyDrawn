/**
 * [INPUT]: depends on EnemyBase (KCC body, stagger/TAG via holdStagger) from ./EnemyBase; SoundWaves (blares) from ./SoundWave;
 *          toon/paintedMesh from render/Materials; ShoutSystem calls onShout() (ShoutReactive) from level/harbor/Shout
 * [OUTPUT]: exports the MegaphoneCrab enemy (kind 'megacrab'), its `open` read-out and the onCaught hook
 * [POS]: level-2 expansion creature (Bandstand Pier). Built around ONE player action: SHOUT when its shell is
 *        open. A shout at the closed shell is caught and fired back. Sibling: FogJelly (see through it with
 *        the Eye); the mid-boss RedGramophone reuses the same timing on a bigger scale.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { SoundWaves, type WaveOpts } from './SoundWave';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { paintedMesh, toon } from '../render/Materials';

// ───────────── tuning ─────────────
const OPEN_T = 1.15; // the tell: lid up, pink throat, horn on WAI
const CATCH_T = 0.75; // a caught shout rattles inside before it comes back
const FLIP_T = 3.2; // on its back: the TAG window
const CLOSED_MUL = 0.3; // paint mostly clangs off the brass
const BLARE: WaveOpts = { color: '#ff6fae', half: 0.42, speed: 11, range: 12, damage: 1, muffle: 0, height: 2.2 };
const RETURN: WaveOpts = { color: '#5ff4e6', half: 0.34, speed: 13, range: 13, damage: 1, muffle: 2.5, height: 2.2, ink: 'ours' };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Megaphone Crab: a dusty crab wearing a brass megaphone for a shell. Its shell's lid stays shut while
 * it scuttles sideways round WAI. It OPENS (lid up, pink throat, horn swings onto WAI) and BLARES a wall
 * of noise — SHOUT into the open horn and the blast goes down its own throat: it flips onto its back,
 * legs kicking (TAG IT). Shout at it while the lid is shut and it CATCHES the shout and fires it back
 * (that one muffles WAI).
 */
export class MegaphoneCrab extends EnemyBase {
  readonly kind = 'megacrab';
  readonly displayName = 'Megaphone Crab';
  readonly bigness: number;
  /** First time it catches a shout (the director's tip). */
  onCaught: (() => void) | null = null;
  readonly waves: SoundWaves;
  private model = new THREE.Group();
  private horn = new THREE.Group();
  private lid = new THREE.Group();
  private throatMat!: THREE.MeshBasicMaterial;
  private shellMat!: THREE.MeshToonMaterial;
  private claws: { arm: THREE.Group; jaw: THREE.Object3D }[] = [];
  private legs: { hip: THREE.Group; knee: THREE.Group; side: number; i: number }[] = [];
  private eyes: THREE.Group[] = [];
  private attackCd = 2;
  private strafe = 1;
  private strafeT = 0;
  private phase = 0;
  private wander = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private flipK = 0;
  private lidK = 0;
  private flipped = false;
  private caughtBig = false;
  private readonly s: number;

  /** `size` 1 = the common crab; the Barker on the promenade is bigger and tougher. */
  constructor(ctx: GameContext, id: string, start: THREE.Vector3, size = 1) {
    super(ctx, id, start, Math.round(320 * size * size), 0.6 * size, 0.18 * size);
    this.s = size;
    this.bigness = 0.4 * Math.min(1.5, size);
    this.waves = new SoundWaves(ctx);
    this.buildLook(ctx);
    this.model.scale.setScalar(size);
    this.root.add(this.model);
    this.paintAnchor = this.model;
    this.wander.copy(start);
  }

  // ───────────── look ─────────────
  private buildLook(ctx: GameContext): void {
    const T = (n: string) => ctx.assets.tex(n);
    const coral = toon({ map: T('stone_pink'), color: '#e98f86' });
    const dark = toon({ color: '#3a2147' });
    const white = toon({ color: '#ffffff' });
    const black = new THREE.MeshBasicMaterial({ color: '#141014' });
    this.shellMat = coral;
    // carapace: a lathed dome, squashed into an oval, with a knobbly rim
    const prof = [[0, -0.15], [0.45, -0.14], [0.82, -0.08], [0.96, 0.04], [0.92, 0.16], [0.74, 0.32], [0.42, 0.42], [0, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
    const shellG = new THREE.LatheGeometry(prof, 22).scale(1, 1, 0.74);
    const shell = paintedMesh(shellG, coral, 0.035);
    shell.position.y = 0.62;
    this.model.add(shell);
    // a knobbly rim (one merged mesh: twelve little knobs, one draw call)
    const knobs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      knobs.push(new THREE.SphereGeometry(0.07, 8, 6).translate(Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.68));
    }
    this.model.add(paintedMesh(mergeGeometries(knobs)!, coral, 0.015, false));
    // a mouth plate under the front rim, a little grumpy
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 5, 12, Math.PI), dark);
    mouth.position.set(0, 0.56, 0.69);
    mouth.rotation.set(0.2, 0, Math.PI);
    this.model.add(mouth);
    // eye stalks
    for (const x of [-0.24, 0.24]) {
      const eg = new THREE.Group();
      const stalk = paintedMesh(new THREE.CylinderGeometry(0.035, 0.05, 0.32, 6).translate(0, 0.16, 0), coral, 0.015);
      const ball = paintedMesh(new THREE.SphereGeometry(0.12, 12, 10), white, 0.02);
      ball.position.y = 0.36;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black);
      pupil.position.set(0, 0.37, 0.095);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.04), black);
      brow.position.set(0, 0.5, 0.08);
      brow.rotation.z = x > 0 ? 0.45 : -0.45;
      eg.add(stalk, ball, pupil, brow);
      eg.position.set(x, 0.86, 0.5);
      eg.rotation.z = x > 0 ? -0.15 : 0.15;
      this.eyes.push(eg);
      this.model.add(eg);
    }
    // claws: upper arm, forearm, a fat pincer with a hinged finger
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.72, 0.58, 0.42);
      const upper = paintedMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 7).rotateZ(Math.PI / 2).translate(side * 0.2, 0, 0), coral, 0.02);
      const fore = new THREE.Group();
      fore.position.set(side * 0.4, 0, 0);
      fore.rotation.y = -side * 1.0;
      const foreArm = paintedMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.36, 7).rotateX(Math.PI / 2).translate(0, 0, 0.18), coral, 0.02);
      const palm = paintedMesh(new THREE.SphereGeometry(0.2, 12, 10).scale(0.9, 0.75, 1.25), coral, 0.025);
      palm.position.set(0, 0, 0.48);
      const tip = paintedMesh(new THREE.ConeGeometry(0.1, 0.32, 8).rotateX(Math.PI / 2).translate(0, -0.04, 0.78), coral, 0.02);
      const jaw = new THREE.Group();
      jaw.position.set(0, 0.08, 0.55);
      const finger = paintedMesh(new THREE.ConeGeometry(0.075, 0.38, 7).rotateX(Math.PI / 2).translate(0, 0, 0.19), coral, 0.02);
      jaw.add(finger);
      fore.add(foreArm, palm, tip, jaw);
      arm.add(upper, fore);
      this.claws.push({ arm, jaw });
      this.model.add(arm);
    }
    // six walking legs (two segments each, pointed tips)
    const legG1 = new THREE.CylinderGeometry(0.04, 0.055, 0.42, 6).rotateZ(Math.PI / 2).translate(0.21, 0, 0);
    const legG2 = new THREE.ConeGeometry(0.045, 0.7, 6).rotateX(Math.PI).translate(0, -0.35, 0);
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.62, 0.5, 0.18 - i * 0.28);
        hip.rotation.y = side < 0 ? Math.PI : 0;
        const upper = paintedMesh(legG1, coral, 0, false);
        const knee = new THREE.Group();
        knee.position.x = 0.42;
        const lower = paintedMesh(legG2, coral, 0, false);
        knee.add(lower);
        hip.add(upper, knee);
        this.legs.push({ hip, knee, side, i });
        this.model.add(hip);
      }
    // the megaphone shell: a lathed brass horn on its back, bell forward over the head
    const brass = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
    const hornProf = [[0.12, -0.55], [0.13, -0.3], [0.17, -0.05], [0.25, 0.18], [0.38, 0.36], [0.52, 0.48], [0.56, 0.52]].map(([x, y]) => new THREE.Vector2(x, y));
    const hornG = new THREE.LatheGeometry(hornProf, 20);
    const hornM = paintedMesh(hornG, brass, 0); // open shell: no hull (its inside would turn black); the rim carries the ink
    (hornM.material as THREE.Material).side = THREE.DoubleSide;
    hornM.rotation.x = Math.PI / 2; // bell → +Z
    const rim = paintedMesh(new THREE.TorusGeometry(0.56, 0.045, 6, 22), brass, 0.02);
    rim.position.z = 0.52;
    const tail = paintedMesh(new THREE.SphereGeometry(0.16, 10, 8), brass, 0.02);
    tail.position.z = -0.56;
    // the throat: dark inside the bell, glowing pink while it is open
    this.throatMat = new THREE.MeshBasicMaterial({ color: '#3a2147' });
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), this.throatMat);
    throat.position.z = 0.22;
    // the lid: a brass cap hinged at the bell's top edge
    const cap = paintedMesh(new THREE.CylinderGeometry(0.5, 0.54, 0.08, 22).rotateX(Math.PI / 2).translate(0, -0.56, 0), toon({ color: '#ffd45e' }), 0.025);
    const boss = paintedMesh(new THREE.SphereGeometry(0.1, 10, 8).scale(1, 1, 0.6).translate(0, -0.56, 0.06), toon({ color: '#c46a3a' }), 0.015);
    // the Red Pen crossed its voice out: a red X sealed over the lid
    const xMat = toon({ color: '#e8323c' });
    const bars = [0.75, -0.75].map((r) => new THREE.BoxGeometry(0.72, 0.09, 0.04).rotateZ(r).translate(0, -0.56, 0.05));
    this.lid.add(paintedMesh(mergeGeometries(bars)!, xMat, 0.012, false));
    const rivets: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rivets.push(new THREE.SphereGeometry(0.035, 6, 5).translate(Math.cos(a) * 0.43, -0.56 + Math.sin(a) * 0.43, 0.045));
    }
    this.lid.add(new THREE.Mesh(mergeGeometries(rivets)!, toon({ color: '#8a5a2a' })));
    this.lid.add(cap, boss);
    this.lid.position.set(0, 0.58, 0.57);
    this.horn.add(hornM, rim, tail, throat, this.lid);
    this.horn.position.set(0, 1.18, -0.42);
    this.horn.rotation.x = -0.5;
    this.model.add(this.horn);
  }

  // ───────────── read-outs ─────────────
  /** Lid up (the shout window). */
  get open(): boolean {
    return this.state === 'OPEN';
  }

  get counterHint(): string {
    if (this.state === 'OPEN') return 'Its shell is OPEN — SHOUT into it now!';
    if (this.flipped) return 'It’s on its back — spray it, then TAG IT!';
    return 'Wait for the lid to open, then SHOUT';
  }

  // ───────────── voice ─────────────
  onShout(big: boolean, from: THREE.Vector3): void {
    if (this.harmless || this.disposed || this.flipped) return;
    if (!this.alerted) this.alert();
    if (this.state === 'OPEN' || (this.state === 'BLARE' && this.stateT < 0.2)) return this.flip(from);
    if (this.state === 'CATCH' || this.state === 'RETURN') return;
    // lid shut: it swallows the shout and keeps it
    this.caughtBig = big;
    this.setState('CATCH');
    this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 2.2 * this.s), t('CAUGHT IT!'), '#5ff4e6', 0.75);
    this.ctx.audio.play('gulp', { pos: this.pos, pitch: 0.8 });
    this.onCaught?.();
  }

  private flip(from: THREE.Vector3): void {
    this.flipped = true;
    this.setState('FLIPPED');
    this.holdStagger(FLIP_T);
    this.tagSpent = false;
    this.waves.clear();
    this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 2.2 * this.s), t('BACKFIRE!'), '#ffd23a', 0.9);
    this.ctx.effects.burst(this.pos.clone().setY(this.pos.y + 1.2), '#ff6fae', 14, 4, 0.08);
    this.ctx.audio.play('shout', { pos: this.pos, pitch: 1.6, vol: 0.7 });
    this.ctx.audio.play('crash', { pos: this.pos, pitch: 1.5, vol: 0.5 });
    _v.copy(this.pos).sub(from).setY(0);
    if (_v.lengthSq() > 1e-4) this.knock(_v.normalize(), 4);
  }

  // ───────────── damage rules ─────────────
  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (this.flipped || this.state === 'OPEN' || this.state === 'BLARE') return null;
    if (info.kind === 'paint') {
      info.amount *= CLOSED_MUL;
      if (Math.random() < 0.05) this.ctx.effects.comic(info.point.clone().setY(info.point.y + 0.5), t('CLANG!'), '#ffd98a', 0.5);
    }
    return null;
  }

  protected override weakPoints(): WeakPoint[] {
    if (this.flipped && this.staggerT > 0) return [{ pos: this.pos.clone().setY(this.pos.y + 0.6), radius: 1.8 * this.s, mul: 2.5 }];
    return [];
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: weak ? 1.1 : 1.6, vol: 0.45 });
  }

  protected override interrupt(): void {
    if (this.state === 'OPEN') {
      this.attackCd = 1.6;
      this.setState('SCUTTLE');
    }
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('SCUTTLE');
  }

  protected override finish(): void {
    this.waves.clear();
    this.flipped = false;
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    this.waves.update(dt, player);
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') {
      this.move(0, 0, dt);
      return;
    }
    if (this.flipped) {
      // the stagger (TAG window) ran out: it rolls back onto its legs
      this.flipped = false;
      this.attackCd = 1.8;
      this.setState('SCUTTLE');
      this.ctx.audio.play('pop', { pos: this.pos, pitch: 0.7 });
    }
    _v.copy(player.pos).sub(this.pos).setY(0);
    const d = _v.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2.4;
    this.attackCd = Math.max(0, this.attackCd - dt);
    let vx = 0;
    let vz = 0;
    switch (this.state) {
      case 'IDLE': {
        _w.copy(this.wander).sub(this.pos).setY(0);
        if (_w.length() < 0.5) this.wander.set(this.home.x + (Math.random() - 0.5) * 6, this.home.y, this.home.z + (Math.random() - 0.5) * 6);
        else {
          _w.normalize();
          vx = _w.x * 1.2;
          vz = _w.z * 1.2;
          this.faceToward(this.wander, dt, 3);
        }
        if (valid && d < 11 && this.canSee(player.pos, 1)) this.alert();
        break;
      }
      case 'SCUTTLE': {
        if (!valid || this.pos.distanceTo(this.home) > 16) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.faceToward(player.pos, dt, 6);
        // crabs walk sideways: circle WAI at blaring distance, flipping direction now and then
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = 1.4 + Math.random() * 1.6;
          this.strafe = Math.random() < 0.5 ? -1 : 1;
        }
        const n = d > 0.01 ? 1 / d : 0;
        const ax = _v.x * n, az = _v.z * n;
        const radial = d > 7 ? 1 : d < 4.5 ? -1 : 0;
        vx = (-az * this.strafe * 1.8 + ax * radial * 2.2) * Math.min(1.2, this.s);
        vz = (ax * this.strafe * 1.8 + az * radial * 2.2) * Math.min(1.2, this.s);
        if (this.attackCd <= 0 && d < 10 && this.canSee(player.pos, 1)) {
          this.setState('OPEN');
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.2 });
          this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 1.3, vol: 0.5 });
        }
        break;
      }
      case 'OPEN': {
        // the tell: lid up, horn tracks WAI (locks for the last 0.3 s)
        if (this.stateT < OPEN_T - 0.3) {
          this.faceToward(player.pos, dt, 8);
          this.aim.copy(_v).normalize();
        }
        _w.copy(this.pos).setY(this.pos.y + 0.1).addScaledVector(this.aim, 0.9 * this.s);
        this.waves.tell(_w, this.aim, BLARE, this.stateT / OPEN_T);
        if (this.stateT > OPEN_T) {
          this.setState('BLARE');
          this.blare(BLARE, this.aim);
        }
        break;
      }
      case 'BLARE': {
        if (this.stateT > 0.5) {
          this.attackCd = (2.6 + Math.random() * 1.4) / Math.min(1.3, this.s);
          this.setState('SCUTTLE');
        }
        break;
      }
      case 'CATCH': {
        this.faceToward(player.pos, dt, 10);
        if (this.stateT > CATCH_T) {
          this.setState('RETURN');
          this.aim.copy(_v).normalize();
          this.blare(this.caughtBig ? { ...RETURN, range: 16, half: 0.42 } : RETURN, this.aim);
          this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 2.2 * this.s), t('RIGHT BACK AT YOU!'), '#5ff4e6', 0.7);
        }
        break;
      }
      case 'RETURN': {
        if (this.stateT > 0.5) {
          this.attackCd = Math.max(this.attackCd, 1.2);
          this.setState('SCUTTLE');
        }
        break;
      }
    }
    this.move(vx, vz, dt);
  }

  private blare(o: WaveOpts, dir: THREE.Vector3): void {
    _w.copy(this.pos).setY(this.pos.y + 0.1).addScaledVector(dir, 0.9 * this.s);
    this.waves.blare(_w, dir, o);
    this.ctx.audio.play('shout', { pos: this.pos, pitch: o === BLARE ? 0.55 : 1.25, vol: 0.8 });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.15);
  }

  // ───────────── animation ─────────────
  protected animate(dt: number): void {
    const speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    this.phase += dt * (5 + speed * 5);
    const lidWant = this.state === 'OPEN' || this.state === 'BLARE' ? 1 : 0;
    this.lidK += (lidWant - this.lidK) * Math.min(1, dt * (lidWant ? 9 : 14));
    this.lid.rotation.x = -this.lidK * 1.9;
    const glow = this.state === 'OPEN' ? 0.6 + Math.sin(this.stateT * 26) * 0.4 : this.state === 'BLARE' ? 1 : 0;
    this.throatMat.color.setRGB(0.23 + glow * 0.77, 0.13 + glow * 0.3, 0.28 + glow * 0.4);
    // the horn tilts up when it opens, rattles when it holds a stolen shout
    const rattle = this.state === 'CATCH' ? Math.sin(this.stateT * 60) * 0.06 : 0;
    this.horn.rotation.x = -0.5 + this.lidK * 0.3 + (this.state === 'BLARE' ? 0.15 : 0);
    this.horn.rotation.z = rattle;
    this.horn.scale.setScalar(this.state === 'CATCH' ? 1 + Math.sin(this.stateT * 30) * 0.05 : 1);
    // on its back: the whole body rolls over, legs kick
    const flipWant = this.flipped || this.state === 'STUNNED' ? 1 : 0;
    this.flipK += (flipWant - this.flipK) * Math.min(1, dt * 8);
    this.model.rotation.z = this.flipK * Math.PI * 0.92;
    this.model.position.y = this.flipK * 1.25 * this.s;
    const walking = Math.min(1, speed / 1.5);
    for (const l of this.legs) {
      const ph = this.phase + l.i * 2.1 + (l.side > 0 ? Math.PI : 0);
      const kick = this.flipK > 0.5 ? Math.sin(this.phase * 3 + l.i) * 0.6 : 0;
      l.hip.rotation.z = 0.5 + Math.max(0, Math.sin(ph)) * 0.35 * walking + kick;
      l.knee.rotation.z = -0.1 - Math.max(0, Math.sin(ph)) * 0.2 * walking - kick * 0.5;
    }
    const clack = this.state === 'CALM' ? Math.abs(Math.sin(this.phase * 1.5)) : this.state === 'OPEN' ? 0.7 : 0.15 + Math.max(0, Math.sin(this.phase * 0.7)) * 0.3;
    this.claws.forEach((c, i) => {
      c.jaw.rotation.x = -clack * 0.6;
      c.arm.rotation.x = this.state === 'OPEN' ? -0.5 : Math.sin(this.phase * 0.5 + i) * 0.1;
    });
    for (const e of this.eyes) e.scale.y = this.state === 'OPEN' ? 1.15 : 1;
    this.shellMat.emissive.setRGB(this.flash > 0 ? 0.7 : 0, this.flash > 0 ? 0.7 : 0, this.flash > 0 ? 0.7 : 0);
  }

  override dispose(): void {
    this.waves.dispose();
    super.dispose();
  }
}
