/**
 * [INPUT]: depends on EnemyBase (stagger/TAG, hpFloor phase gates, resetFight) from ./EnemyBase; toon/addOutline from
 *          render/Materials; PAL from render/PaintTextures; RAPIER (the block collider) from core/PhysicsWorld
 * [OUTPUT]: exports EraserBoss (kind 'eraser'): awake/engage(), bombard, phase, exposed, counterHint, onSummon / onCrumbLanded
 * [POS]: the level-1 BOSS on the summit (GameSession owns it; its grub summons are the session's). Three phases gated at
 *        ⅔ and ⅓. restartFight(): a smudge on Hard puts it back to phase 1, still awake (no intro replay).
 *        Its block never passes a wall (PhysicsWorld.wallAhead): the RUB stops at the block's front, and pushOut() only
 *        offers exits with no wall on the way (WAI was once shoved out through the Gate Tower door).
 *        Paint on it before the fight reaches onIgnored (GameSession's NotYet says what is missing).
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo } from '../combat/Damage';
import { addOutline, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { t } from '../i18n';
import { RAPIER } from '../core/PhysicsWorld';

/**
 * THE ERASER — the villain. A giant pink rubber that rubbed the city's eyes out.
 * It waits on the summit taunting; while WAI climbs the road it lobs eraser
 * crumbs at him; on the summit it fights in three phases. Every attack has a
 * visual + audio tell, a counter and a punish window (see the table in
 * docs / the combat report):
 *   1  RUB          — flashing lane (locks 0.3 s before the dash) → side-step / dodge;
 *                     it smacks the parapet → DAZED, face ×2.5
 *   2  + CRUMB SHOWER — red landing rings → walk out of them; crumbs become throwable rocks
 *      + SPIN SWEEP  — a pink circle fills under it → run out or JET-HOVER over the spin;
 *                     afterwards it's DIZZY (face ×2.5, PAINT SLAM it)
 *   3  faster, + SHOCKWAVE SLAM (shadow marks the landing, jump the ring)
 *      + BOUNCE BOUNCE BOUNCE — three hops, three rings (jump each, or hover), the last
 *                     one flips it on its back → STUCK (face ×2.5)
 *      + RICOCHET RUB — sometimes it bounces off the wall and dashes again (shorter tell)
 * Repainted, it shrinks into a little pencil eraser.
 */
interface Crumb {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
}

const SIZE = 1.5;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
/** Spin-sweep radius (m). */
const SPIN_R = 5.5;
const TAUNTS = ['WRONG. REDRAW.', 'THAT LINE IS CROOKED.', 'NO EYES HERE.', 'COLOUR INSIDE THE LINES!', 'MESSY!'];

export class EraserBoss extends EnemyBase {
  readonly kind = 'eraser';
  readonly displayName = 'THE ERASER';
  readonly bigness = 1;
  private bodyG = new THREE.Group();
  /** A box shaped like the eraser block (the capsule alone let WAI walk into its long sides). */
  private blockCol: RAPIER.Collider | null = null;
  private blockHalf = new THREE.Vector3();
  private faceGroup = new THREE.Group();
  private pupils: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth: THREE.Mesh | null = null;
  private arms: THREE.Group[] = [];
  private pinkMat: THREE.MeshStandardMaterial;
  private attackCd = 2;
  private dashDir = new THREE.Vector3();
  private lane: THREE.Mesh;
  /** expanding shockwave rings (slam / bounce): pooled meshes */
  private rings: { mesh: THREE.Mesh; r: number; speed: number; active: boolean; hit: boolean; dmg: number }[] = [];
  /** landing shadow under a hop (slam / bounce): where it will come down */
  private shadow: THREE.Mesh;
  private shadowR = 3;
  /** spin sweep: full-radius rim + a fill that grows during the tell */
  private spinRim: THREE.Mesh;
  private spinFill: THREE.Mesh;
  private spinHit = false;
  private bounces = 0;
  private rebound = false;
  private last: string[] = [];
  private introduced = new Set<string>();
  private crumbs: Crumb[] = [];
  private hop = 0;
  private hopV = 0;
  private hitDone = false;
  /** Arena centre + radius (summit). */
  arena = new THREE.Vector3();
  arenaR = 9;
  /** Fight only starts when the session says so (story). */
  awake = false;
  /** phase gates (fractions of max HP): damage stops at each one, then it roars into the next phase */
  private gates = [0.66, 0.33];
  private armorT = 0;

  protected override hpFloor(): number {
    return (this.gates[0] ?? 0) * this.maxHp;
  }

  /** The fight starts: a beat of grace after its intro roar before the first (telegraphed) attack. */
  engage(): void {
    this.awake = true;
    this.alerted = true;
    this.attackCd = 3;
  }
  /** Lob crumbs at WAI while he climbs the road. */
  bombard = false;
  onSummon: ((p: THREE.Vector3) => void) | null = null;
  onCrumbLanded: ((p: THREE.Vector3) => void) | null = null;
  tauntT = 3;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 2100, 1.5, 0.7);
    this.arena.copy(start);
    const model = ctx.assets.instantiateModel('eraserBoss');
    this.pinkMat = new THREE.MeshStandardMaterial({ color: '#ff9ec4', roughness: 0.85, emissive: '#000000' });
    if (model) {
      this.bodyG.add(model);
    } else {
      // procedural Eraser: a fat rounded rubber block with a paper sleeve and an angry face
      const block = new THREE.Mesh(new RoundedBoxGeometry(2.6 * SIZE, 1.9 * SIZE, 1.9 * SIZE, 5, 0.42 * SIZE), this.pinkMat);
      block.position.y = 0.95 * SIZE;
      block.castShadow = true;
      addOutline(block, 0.06);
      this.bodyG.add(block);
      // worn top edge (a rubbed bevel)
      const worn = new THREE.Mesh(new RoundedBoxGeometry(2.0 * SIZE, 0.35 * SIZE, 1.6 * SIZE, 3, 0.15 * SIZE), new THREE.MeshStandardMaterial({ color: '#ffc6dc', roughness: 1 }));
      worn.position.set(0, 1.9 * SIZE, 0);
      this.bodyG.add(worn);
      // paper sleeve with scribbles
      const sleeveTex = sleeveTexture();
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(1.25 * SIZE, 1.98 * SIZE, 1.98 * SIZE), toon({ map: sleeveTex }));
      sleeve.position.set(-0.55 * SIZE, 0.95 * SIZE, 0);
      addOutline(sleeve, 0.05);
      this.bodyG.add(sleeve);
    }
    if (model) {
      // sculpted Eraser (Tripo): its face is on the +Z end; the weak point sits there
      this.faceGroup.position.set(0, 2.3, 2.7);
      this.bodyG.add(this.faceGroup);
    } else {
      // angry face on the front (+Z)
      this.faceGroup.position.set(0.55 * SIZE, 1.1 * SIZE, 0.97 * SIZE);
      for (const sx of [-1, 1]) {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.34 * SIZE, 16, 12), toon({ color: PAL.white }));
        white.scale.set(1, 1.1, 0.5);
        white.position.set(sx * 0.42 * SIZE, 0.18 * SIZE, 0);
        addOutline(white, 0.04);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.14 * SIZE, 12, 8), new THREE.MeshBasicMaterial({ color: '#141014' }));
        pupil.position.set(sx * 0.42 * SIZE, 0.14 * SIZE, 0.15 * SIZE);
        this.pupils.push(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.62 * SIZE, 0.13 * SIZE, 0.12 * SIZE), new THREE.MeshBasicMaterial({ color: '#141014' }));
        brow.position.set(sx * 0.42 * SIZE, 0.55 * SIZE, 0.12 * SIZE);
        brow.rotation.z = sx * -0.42;
        this.brows.push(brow);
        this.faceGroup.add(white, pupil, brow);
      }
      // a wide toothy sneer
      const mouthGeo = new THREE.CircleGeometry(0.62 * SIZE, 24, Math.PI * 1.08, Math.PI * 0.84);
      this.mouth = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: '#3a0a1e' }));
      this.mouth.position.set(0, -0.08 * SIZE, 0.06 * SIZE);
      this.mouth.scale.set(1.2, 0.8, 1);
      this.faceGroup.add(this.mouth);
      for (let i = 0; i < 6; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07 * SIZE, 0.18 * SIZE, 3), toon({ color: PAL.cream }));
        tooth.position.set((-0.5 + i * 0.2) * SIZE, -0.2 * SIZE, 0.09 * SIZE);
        tooth.rotation.z = Math.PI;
        this.faceGroup.add(tooth);
      }
      this.bodyG.add(this.faceGroup);
      // stubby rubber arms
      for (const sx of [-1, 1]) {
        const arm = new THREE.Group();
        const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * SIZE, 0.7 * SIZE, 4, 8), this.pinkMat);
        a.position.y = -0.45 * SIZE;
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.3 * SIZE, 10, 8), this.pinkMat);
        fist.position.y = -0.95 * SIZE;
        arm.add(a, fist);
        arm.position.set(0.3 * SIZE, 1.1 * SIZE, sx * 1.05 * SIZE);
        arm.rotation.x = sx * 0.4;
        this.bodyG.add(arm);
        this.arms.push(arm);
      }
    }
    // the body's long axis runs along X; face +Z… turn it so the face looks forward
    this.bodyG.rotation.y = 0;
    this.root.add(this.bodyG);
    // block collider from the visual's own bounds (arms excluded: they swing), on the same body
    {
      const box = new THREE.Box3();
      this.bodyG.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
      this.bodyG.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.isOutline || m.parent?.userData.arm || m.userData.arm) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
      });
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        this.blockHalf.set(size.x * 0.46, Math.min(size.y, 4) * 0.46, size.z * 0.46);
        const cOff = this.cOff;
        this.blockCol = ctx.physics.world.createCollider(
          RAPIER.ColliderDesc.cuboid(this.blockHalf.x, this.blockHalf.y, this.blockHalf.z).setTranslation(c.x, c.y - cOff, c.z),
          this.body,
        );
        ctx.physics.tag(this.blockCol, 'enemy', this);
      }
    }
    this.paintAnchor = this.bodyG;

    // telegraph lane + shockwave ring (world space)
    const laneGeo = new THREE.PlaneGeometry(3.6, 1);
    laneGeo.translate(0, 0.5, 0);
    this.lane = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: '#ff2448', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.lane.visible = false;
    ctx.root.add(this.lane);
    const ringGeo = new THREE.RingGeometry(0.88, 1, 72);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff4fa3', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      ctx.root.add(mesh);
      this.rings.push({ mesh, r: 0, speed: 13, active: false, hit: false, dmg: 2 });
    }
    const flat = (geo: THREE.BufferGeometry, color: string) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 2;
      ctx.root.add(m);
      return m;
    };
    this.shadow = flat(new THREE.CircleGeometry(1, 40), '#3a0a1e');
    this.spinRim = flat(new THREE.RingGeometry(0.93, 1, 72), '#ff2448');
    this.spinFill = flat(new THREE.CircleGeometry(1, 48), '#ff4fa3');
  }

  get phase(): number {
    const f = this.hp / this.maxHp;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  }

  /** Face open for big damage (DAZED after a wall crash, DIZZY after a spin, STUCK after the bounces). */
  get exposed(): boolean {
    return this.state === 'DAZED' || this.state === 'DIZZY' || this.state === 'STUCK';
  }

  /** What the objective panel should tell the player about the current attack (readable counters). */
  get counterHint(): string {
    switch (this.state) {
      case 'RUB_TELL':
      case 'RUB':
        return 'Step out of the red lane (or dodge with C) — it crashes into the wall';
      case 'SPIN_TELL':
      case 'SPIN':
        return 'Run out of the pink circle — or jump and HOLD Space to jet-hover over the spin';
      case 'SLAM':
      case 'BOUNCE':
        return 'Watch the shadow, then JUMP the shockwave rings (hold Space to hover)';
      case 'SHOWER':
        return 'Walk out of the red rings! Landed crumbs are rocks you can throw (G)';
      case 'DAZED':
      case 'DIZZY':
      case 'STUCK':
        return 'It’s open! Spray its FACE, or PAINT SLAM it (C in mid-air)';
    }
    return this.armorT > 0 ? 'It’s roaring — paint slides off for a moment' : 'Paint its face! Bait its attacks, then punish the opening';
  }

  /** Pinned at a phase gate (paint can't push it lower): the roar must win — no TAG, no ENCORE. */
  private get atGate(): boolean {
    return this.gates.length > 0 && this.hp <= this.gates[0] * this.maxHp + 0.5;
  }

  override get canBeTagged(): boolean {
    return super.canBeTagged && !this.atGate && this.armorT <= 0;
  }

  override get allowsEncore(): boolean {
    return !this.atGate;
  }

  protected override weakPoints(): WeakPoint[] {
    const face = this.faceGroup.getWorldPosition(new THREE.Vector3());
    return [{ pos: face, radius: 1.1 * SIZE, mul: this.exposed ? 2.5 : 1.2 }];
  }

  protected override preDamage(info: DamageInfo): import('../combat/Damage').DamageResult | null {
    // asleep / taunting on the summit before the fight: paint slides off, and the session says why (NotYet)
    if (!this.awake) {
      this.onIgnored?.(info.point, 'paint', info.color);
      return { weak: false, absorbed: true };
    }
    // roaring into its next phase: paint slides off for a moment
    if (this.armorT > 0) return { weak: false, absorbed: true };
    // a PAINT SLAM next to an opened-up Eraser lands right on its face
    if (info.kind === 'stomp' && this.exposed && info.point.distanceTo(this.pos) < 5.5) info.point.copy(this.faceGroup.getWorldPosition(new THREE.Vector3()));
    return null;
  }

  protected override interrupt(): void {
    this.hideTells();
    if (this.state !== 'IDLE') this.setState('IDLE');
    this.attackCd = 1.2;
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    if (weak && this.exposed && Math.random() < 0.1) this.ctx.audio.play('squeak', { pos: this.pos, pitch: 0.4 });
  }

  private hideTells(): void {
    this.lane.visible = false;
    this.shadow.visible = false;
    this.spinRim.visible = false;
    this.spinFill.visible = false;
  }

  /** Tells, shockwave rings and crumbs in flight: all gone (repainted, or the fight restarts). */
  private clearHazards(): void {
    this.hideTells();
    for (const r of this.rings) r.active = r.mesh.visible = false;
    for (const c of this.crumbs) this.ctx.root.remove(c.mesh, c.ring);
    this.crumbs = [];
  }

  protected override finish(): void {
    this.clearHazards();
    super.finish();
  }

  /** WAI was smudged (Hard): phase 1 again, still awake on the summit (no intro), a beat before the first rub. */
  protected override restartFight(): void {
    this.clearHazards();
    this.gates = [0.66, 0.33];
    this.armorT = 0;
    this.rebound = false;
    this.bounces = 0;
    this.hop = this.hopV = 0;
    this.last = [];
    this.setState('IDLE');
    this.attackCd = 3;
    if (this.awake) this.alerted = true;
  }

  private crumbAt(target: THREE.Vector3, from: THREE.Vector3, dur: number): void {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.4, 0.45, 2, 0.1), new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? '#ff9ec4' : '#ffc6dc', roughness: 0.9 }));
    mesh.userData.noPaint = true;
    addOutline(mesh, 0.03);
    this.ctx.root.add(mesh);
    // the ring IS the hit area (outer radius 1.5 = damage radius)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: '#ff2448', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(target).add(new THREE.Vector3(0, 0.06, 0));
    this.ctx.root.add(ring);
    this.crumbs.push({ mesh, ring, from: from.clone(), to: target.clone(), t: 0, dur });
  }

  private stepCrumbs(dt: number, player: PlayerController): void {
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const c = this.crumbs[i];
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      const p = c.from.clone().lerp(c.to, k);
      p.y += Math.sin(k * Math.PI) * (4 + c.from.distanceTo(c.to) * 0.25);
      c.mesh.position.copy(p);
      c.mesh.rotation.x += dt * 8;
      c.mesh.rotation.z += dt * 5;
      // ring: fades in, the last 0.3 s it flashes (it's about to land)
      const flashing = c.dur - c.t < 0.3 && Math.sin(c.t * 50) > 0;
      (c.ring.material as THREE.MeshBasicMaterial).opacity = flashing ? 0.9 : 0.25 + k * 0.45;
      c.ring.scale.setScalar(0.85 + k * 0.15);
      if (k >= 1) {
        // impact: erases paint, hurts if WAI stands in the ring
        this.ctx.effects.eraseNear(c.to, 1.5);
        this.ctx.effects.burst(c.to.clone().add(new THREE.Vector3(0, 0.3, 0)), '#ffc6dc', 10, 4, 0.08);
        this.ctx.audio.play('crumble', { pos: c.to, vol: 0.6 });
        const flat = Math.hypot(player.pos.x - c.to.x, player.pos.z - c.to.z);
        if (flat < 1.5 && Math.abs(player.pos.y - c.to.y) < 1.4) player.takeHit(c.to, 1, 7);
        this.ctx.root.remove(c.mesh, c.ring);
        this.crumbs.splice(i, 1);
        if (Math.random() < 0.6) this.onCrumbLanded?.(c.to.clone());
      }
    }
  }

  /** Fire a shockwave ring from where it stands. */
  private shockwave(speed: number, dmg: number): void {
    const r = this.rings.find((x) => !x.active) ?? this.rings[0];
    r.active = true;
    r.hit = false;
    r.r = 1;
    r.speed = speed;
    r.dmg = dmg;
    r.mesh.position.set(this.pos.x, this.pos.y + 0.08, this.pos.z);
  }

  private stepRings(dt: number, player: PlayerController): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.r += dt * r.speed;
      const flat = Math.hypot(player.pos.x - r.mesh.position.x, player.pos.z - r.mesh.position.z);
      // the ring band is ±0.5 m around its radius; jumping (not grounded) clears it
      if (!r.hit && player.grounded && Math.abs(flat - r.r) < 0.5 && Math.abs(player.pos.y - r.mesh.position.y) < 1.5) r.hit = player.takeHit(r.mesh.position, r.dmg, 10);
      if (r.r > this.arenaR + 2) r.active = false;
    }
  }

  /** Choose the next attack: weighted per phase, never the same one three times in a row, new moves introduced first. */
  private pickAttack(): string {
    const ph = this.phase;
    if (ph >= 2 && !this.introduced.has('SPIN')) return 'SPIN';
    if (ph >= 3 && !this.introduced.has('BOUNCE')) return 'BOUNCE';
    const w: [string, number][] =
      ph === 1 ? [['RUB', 1]] : ph === 2 ? [['RUB', 0.35], ['SHOWER', 0.35], ['SPIN', 0.3]] : [['RUB', 0.25], ['SHOWER', 0.18], ['SLAM', 0.27], ['BOUNCE', 0.3]];
    const banned = this.last.length >= 2 && this.last[0] === this.last[1] ? this.last[0] : null;
    const filtered = w.filter(([k]) => k !== banned);
    const pool = filtered.length ? filtered : w;
    let sum = 0;
    for (const [, v] of pool) sum += v;
    let roll = Math.random() * sum;
    for (const [k, v] of pool) {
      roll -= v;
      if (roll <= 0) return k;
    }
    return pool[0][0];
  }

  protected ai(dt: number, player: PlayerController): void {
    if (this.harmless) return;
    this.stepCrumbs(dt, player);
    this.stepRings(dt, player);
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const onArena = player.pos.distanceTo(this.arena) < this.arenaR + 1 && player.pos.y > this.arena.y - 1;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.armorT = Math.max(0, this.armorT - dt);
    if (this.awake && this.gates.length && this.hp <= this.gates[0] * this.maxHp + 0.5) {
      // phase change: a roar, a shockwave of pink dust, and it comes back faster (no damage)
      this.gates.shift();
      this.armorT = 1.6;
      this.hideTells();
      if (this.state !== 'IDLE') this.setState('IDLE');
      this.rebound = false;
      this.attackCd = 1.9;
      this.ctx.audio.play('roar', { pos: this.pos, pitch: 0.75, vol: 1 });
      this.ctx.audio.play('phaseSting', { pos: this.pos });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.8);
      this.ctx.effects.ring(this.pos.clone().setY(this.pos.y + 0.1), '#ff9ec4', 7);
      this.ctx.effects.burst(this.pos.clone().setY(this.pos.y + 2), '#ffc6dc', 30, 6, 0.12);
      this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 4.2), t(this.gates.length ? 'IT’S FURIOUS!' : 'IT’S BOUNCING MAD!'), '#ff4fa3', 1.1);
    }

    if (!this.awake) {
      // taunting on the summit; lobbing crumbs at the climbing doodle
      this.faceToward(player.pos, dt, 2);
      this.tauntT -= dt;
      if (this.tauntT <= 0) {
        this.tauntT = 4 + Math.random() * 4;
        this.hopV = 6;
        this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.5, vol: 0.5 });
      }
      if (this.bombard && this.attackCd <= 0 && d < 45) {
        this.attackCd = 2.2;
        const lead = player.vel.clone().setY(0).multiplyScalar(1.1);
        const tgt = player.pos.clone().add(lead);
        tgt.y = player.pos.y;
        this.crumbAt(tgt, this.pos.clone().add(new THREE.Vector3(0, 3.5, 0)), 1.6);
        this.hopV = 4;
      }
      this.move(0, 0, dt);
      return;
    }
    const ph = this.phase;
    const fast = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1;
    switch (this.state) {
      case 'IDLE':
      case 'CHASE': {
        this.faceToward(player.pos, dt, 3 * fast);
        // drift toward the arena centre so it never leaves the summit
        const back = this.arena.clone().sub(this.pos).setY(0);
        let vx = 0,
          vz = 0;
        if (back.length() > 3) {
          back.normalize();
          vx = back.x * 2;
          vz = back.z * 2;
        } else if (d > 4 && onArena) {
          vx = (toP.x / d) * 1.6 * fast;
          vz = (toP.z / d) * 1.6 * fast;
        }
        this.move(vx, vz, dt);
        if (this.attackCd <= 0 && onArena && this.armorT <= 0) {
          const atk = this.pickAttack();
          this.introduced.add(atk);
          this.last.unshift(atk);
          this.last.length = Math.min(this.last.length, 2);
          this.hitDone = false;
          this.rebound = false;
          if (atk === 'RUB') this.setState('RUB_TELL');
          else if (atk === 'SPIN') this.setState('SPIN_TELL');
          else if (atk === 'BOUNCE') {
            this.bounces = 0;
            this.setState('BOUNCE');
          } else this.setState(atk);
          // it isn't evil — it's *correct*: teacher lines while it attacks
          if (Math.random() < 0.45) this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 4.4), t(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]), '#ff9ec4', 0.8);
        }
        return;
      }
      case 'RUB_TELL': {
        // the lane tracks WAI, then LOCKS for the last 0.3 s (flashing) — that's your cue to step aside
        const tell = this.rebound ? 0.8 : 0.95 / Math.min(fast, 1.2);
        const locked = this.stateT > tell - 0.3;
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.1 });
          this.ctx.audio.play('erase', { pos: this.pos, vol: 0.7 });
          if (this.rebound) this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 4.2), t('AGAIN!'), '#ff2448', 0.9);
        }
        if (!locked) this.faceToward(player.pos, dt, 6);
        else if (this.stateT - dt <= tell - 0.3) this.ctx.audio.play('lockOn', { pos: this.pos });
        const k = Math.min(1, this.stateT / (tell - 0.3));
        this.lane.visible = true;
        this.lane.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
        this.lane.rotation.set(-Math.PI / 2, 0, 0);
        this.lane.rotateZ(this.facing + Math.PI);
        this.lane.scale.set(1, 2 + k * 18, 1);
        (this.lane.material as THREE.MeshBasicMaterial).opacity = locked ? (Math.sin(this.stateT * 40) > 0 ? 0.75 : 0.3) : 0.45 * k;
        this.hop = Math.max(this.hop, 0.15 * Math.sin(this.stateT * 30));
        if (this.stateT > tell) {
          this.lane.visible = false;
          this.dashDir.copy(this.forward());
          this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.2 });
          this.setState('RUB');
        }
        this.move(0, 0, dt);
        return;
      }
      case 'RUB': {
        const speed = 15 * fast;
        const moved = this.move(this.dashDir.x * speed, this.dashDir.z * speed, dt);
        // rubs out paint along the way
        this.ctx.effects.eraseNear(this.pos, 2.2);
        if (Math.random() < 0.5) this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), '#ffc6dc', 2, 3, 0.07);
        // hit box = the lane: within its half-width sideways, and on the body lengthwise
        if (!this.hitDone && player.pos.y < this.pos.y + 3) {
          const along = toP.dot(this.dashDir);
          const side = Math.abs(toP.x * this.dashDir.z - toP.z * this.dashDir.x);
          if (side < 1.8 + 0.25 && along > -1.6 && along < 2.4) this.hitDone = player.takeHit(this.pos, 2, 16);
        }
        const rel = this.pos.clone().sub(this.arena).setY(0);
        const out = rel.length() > this.arenaR - 2 && rel.dot(this.dashDir) > 0;
        // its capsule is narrower than the block: stop when the block's front meets a wall (the tower door, the
        // rim), or the block slid through it and shoved WAI out behind it (playtest: out through the tower door)
        const atWall = this.blockFrontRoom(this.dashDir, speed * dt) <= 0;
        if ((moved < speed * dt * 0.3 && this.stateT > 0.1) || (out && this.stateT > 0.3) || atWall) {
          // smack into the parapet
          this.ctx.audio.play('crash', { pos: this.pos });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.9);
          this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), t('BONK!'), '#ffd23a', 1.1);
          if (ph === 3 && !this.rebound && Math.random() < 0.5) {
            // RICOCHET: bounces off the wall and lines up a second (shorter-tell) dash
            this.rebound = true;
            this.hitDone = false;
            this.hopV = 5;
            this.setState('RUB_TELL');
            return;
          }
          this.setState('DAZED');
          this.ctx.audio.play('dizzy', { pos: this.pos });
          return;
        }
        if (this.stateT > 1.5) this.endAttack(1.2);
        return;
      }
      case 'DAZED': {
        this.move(0, 0, dt);
        if (this.stateT > (this.rebound ? 3.1 : 2.6)) this.endAttack(0.8);
        return;
      }
      case 'SHOWER': {
        this.move(0, 0, dt);
        if (this.stateT < dt * 1.5) {
          this.hopV = 7;
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 0.8 });
        }
        if (!this.hitDone && this.stateT > 0.6) {
          this.hitDone = true;
          const n = ph === 3 ? 8 : 6;
          for (let i = 0; i < n; i++) {
            // half aimed at WAI, half scattered over the arena
            const tgt =
              i % 2 === 0
                ? player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3))
                : this.arena.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * (this.arenaR - 1), 0, (Math.random() - 0.5) * 2 * (this.arenaR - 1)));
            tgt.y = this.arena.y;
            this.crumbAt(tgt, this.pos.clone().add(new THREE.Vector3(0, 4, 0)), 1.1 + Math.random() * 0.5);
          }
          if (ph >= 2) this.onSummon?.(this.pos.clone().add(this.forward().multiplyScalar(3)));
          this.ctx.audio.play('spit', { pos: this.pos, pitch: 0.6 });
        }
        if (this.stateT > 1.8) this.endAttack(1.4);
        return;
      }
      case 'SPIN_TELL': {
        // arms up, a pink circle fills in under it: get out, or get airborne
        this.move(0, 0, dt);
        const tell = 1.25;
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('spinWind', { pos: this.pos });
          if (!this.introduced.has('SPIN_SEEN')) {
            this.introduced.add('SPIN_SEEN');
            this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), t('GET OUT!'), '#22c4c0', 0.8);
            this.ctx.events.emit('toast', { text: t('New move: SPIN SWEEP — run out of the pink circle, or jump and HOLD Space to jet-hover over it'), kind: 'warn' });
          }
        }
        this.facing += dt * (2 + this.stateT * 6);
        const k = Math.min(1, this.stateT / tell);
        this.spinRim.visible = this.spinFill.visible = true;
        this.spinRim.position.set(this.pos.x, this.pos.y + 0.07, this.pos.z);
        this.spinFill.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
        this.spinRim.scale.setScalar(SPIN_R);
        this.spinFill.scale.setScalar(Math.max(0.01, SPIN_R * k));
        (this.spinRim.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(this.stateT * 18);
        (this.spinFill.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.2 * k;
        if (this.stateT > tell) {
          this.spinHit = false;
          this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.35, vol: 0.8 });
          this.setState('SPIN');
        }
        return;
      }
      case 'SPIN': {
        // 0.7 s of spinning rubber: grounded inside the circle = hit
        this.move(0, 0, dt);
        this.facing += dt * 26;
        this.ctx.effects.eraseNear(this.pos, SPIN_R * 0.8);
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(Math.cos(a) * SPIN_R * 0.7, 0.3, Math.sin(a) * SPIN_R * 0.7)), '#ffc6dc', 3, 4, 0.07);
        }
        (this.spinFill.material as THREE.MeshBasicMaterial).opacity = Math.sin(this.stateT * 40) > 0 ? 0.55 : 0.3;
        if (!this.spinHit && player.grounded && d < SPIN_R + 0.2 && Math.abs(player.pos.y - this.pos.y) < 1.5) this.spinHit = player.takeHit(this.pos, 2, 14);
        if (this.stateT > 0.7) {
          this.spinRim.visible = this.spinFill.visible = false;
          this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), t('DIZZY!'), '#ffd23a', 1.1);
          this.ctx.audio.play('dizzy', { pos: this.pos });
          this.setState('DIZZY');
        }
        return;
      }
      case 'DIZZY': {
        this.move(0, 0, dt);
        this.facing += dt * 1.5 * Math.max(0, 1 - this.stateT / 2);
        if (this.stateT > 2.1) this.endAttack(0.9);
        return;
      }
      case 'SLAM': {
        if (this.stateT < dt * 1.5) {
          this.hopV = 13;
          this.shadowR = 3;
          this.ctx.audio.play('bigJump', { pos: this.pos, pitch: 0.6 });
        }
        // hang in the air, drift over WAI (shadow follows), then come down
        if (this.stateT < 0.9) {
          const k = Math.min(1, dt * 2.5);
          const want = player.pos.clone().sub(this.pos).setY(0).multiplyScalar(k);
          this.move((want.x / dt) * 0.5, (want.z / dt) * 0.5, dt);
        } else this.move(0, 0, dt);
        if (this.hopV < 0 && this.hop > 0.5 && this.stateT - dt < 0.6 && this.stateT >= 0.6) this.ctx.audio.play('fallWhistle', { pos: this.pos });
        if (!this.hitDone && this.stateT > 0.5 && this.hop <= 0.01) {
          this.hitDone = true;
          this.shockwave(13, 2);
          this.landFx(1.3, 4);
          if (d < this.shadowR && player.grounded) player.takeHit(this.pos, 2, 14);
        }
        if (this.stateT > 2.0) this.endAttack(1.3);
        return;
      }
      case 'BOUNCE': {
        // three hops toward WAI: each landing sends a (slower) ring; the last flips it over
        const big = this.bounces === 2;
        if (this.stateT < dt * 1.5 && this.bounces === 0 && !this.introduced.has('BOUNCE_SEEN')) {
          this.introduced.add('BOUNCE_SEEN');
          this.ctx.events.emit('toast', { text: t('New move: BOUNCE ×3 — jump each shockwave ring; the last bounce flips it over!'), kind: 'warn' });
        }
        if (this.stateT < dt * 1.5) {
          this.hopV = big ? 12 : 10;
          this.shadowR = big ? 3 : 2.4;
          this.hitDone = false;
          this.ctx.audio.play(big ? 'bigJump' : 'jump', { pos: this.pos, pitch: big ? 0.55 : 0.5 });
        }
        if (this.hop > 0.05) {
          const want = player.pos.clone().sub(this.pos).setY(0);
          const dist = want.length();
          if (dist > 0.5) want.multiplyScalar(Math.min(4.2, dist * 2) / dist);
          this.move(want.x, want.z, dt);
        } else this.move(0, 0, dt);
        if (!this.hitDone && this.stateT > 0.3 && this.hop <= 0.01) {
          this.hitDone = true;
          this.shockwave(big ? 11 : 9, 1);
          this.landFx(big ? 1.1 : 0.6, big ? 3.5 : 2.5);
          if (d < this.shadowR && player.grounded) player.takeHit(this.pos, big ? 2 : 1, 12);
        }
        if (this.hitDone && this.stateT > (big ? 0.95 : 0.95)) {
          if (big) {
            this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 3.6, 0)), t('STUCK!'), '#ffd23a', 1.1);
            this.ctx.audio.play('dizzy', { pos: this.pos });
            this.setState('STUCK');
          } else {
            this.bounces++;
            this.setState('BOUNCE');
          }
        }
        return;
      }
      case 'STUCK': {
        // flipped on its back, little arms flailing: face up and open
        this.move(0, 0, dt);
        if (this.stateT > 2.5) {
          this.hopV = 6;
          this.endAttack(0.9);
        }
        return;
      }
    }
    this.move(0, 0, dt);
  }

  private landFx(shake: number, erase: number): void {
    this.ctx.audio.play('stomp', { pos: this.pos, pitch: 0.6, vol: 1 });
    this.ctx.audio.play('crash', { pos: this.pos });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, shake);
    this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), '#ffc6dc', 24, 8, 0.12);
    this.ctx.effects.eraseNear(this.pos, erase);
    this.ctx.combat.impact(0.5 + shake * 0.15);
  }

  private endAttack(cd: number): void {
    this.hideTells();
    this.rebound = false;
    this.attackCd = (cd + Math.random() * 0.6) / (this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1);
    this.setState('IDLE');
  }

  /**
   * Room (m) between the block's front face and the first wall along `dir`, less `ahead`. Three rays at knee height
   * (centre and both front corners): the block is 4 m wide and meets door frames off-centre.
   */
  private blockFrontRoom(dir: THREE.Vector3, ahead: number): number {
    if (!this.blockCol || this.bodyless) return Infinity;
    const k = Math.max(0.05, this.bodyG.scale.x * this.sizeMul);
    const front = this.blockHalf.z * k, side = this.blockHalf.x * k - 0.2;
    let room = Infinity;
    for (const o of [0, -side, side]) {
      _o.set(this.pos.x + dir.z * o, this.pos.y + 0.6, this.pos.z - dir.x * o);
      const d = this.ctx.physics.wallAhead(_o, dir, front + ahead + 0.5);
      if (d !== null) room = Math.min(room, d - front - ahead);
    }
    return room;
  }

  private flip = 0;
  /**
   * Out of the block, along the shallowest side whose way out is free of walls: a WAI pinned between the block and the
   * tower door goes out sideways, never through the door (the session's nudge is a plain move, not a sweep).
   */
  override pushOut(p: THREE.Vector3, r: number): THREE.Vector3 | null {
    if (!this.blockCol || this.bodyless || this.harmless) return null;
    const k = Math.max(0.05, this.bodyG.scale.x * this.sizeMul);
    const t = this.blockCol.translation();
    if (p.y > t.y + this.blockHalf.y * k + 0.15) return null; // on top of it
    // into the block's frame (it turns with `facing`)
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const dx = p.x - t.x, dz = p.z - t.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const hx = this.blockHalf.x * k + r, hz = this.blockHalf.z * k + r;
    const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
    if (ox <= 0 || oz <= 0) return null;
    // the four exits, shallowest first
    const sx = Math.sign(lx || 1), sz = Math.sign(lz || 1);
    const exits: [number, number, number][] = [
      [ox, sx * hx, lz],
      [oz, lx, sz * hz],
      [hx + Math.abs(lx), -sx * hx, lz],
      [hz + Math.abs(lz), lx, -sz * hz],
    ];
    exits.sort((a, b) => a[0] - b[0]);
    for (const [, nx, nz] of exits) {
      const to = new THREE.Vector3(t.x + nx * c + nz * s, p.y, t.z - nx * s + nz * c);
      _o.set(p.x, p.y + 0.5, p.z);
      _d.set(to.x - p.x, 0, to.z - p.z);
      const len = _d.length();
      if (len < 1e-4 || this.ctx.physics.wallAhead(_o, _d.divideScalar(len), len + r) === null) return to;
    }
    return null; // walled in on every side (never seen): stay put rather than pass through a wall
  }

  protected animate(dt: number): void {
    // the block collider turns and shrinks with the body
    if (this.blockCol && !this.bodyless) {
      const a = this.facing;
      this.blockCol.setRotationWrtParent({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
      const k = Math.max(0.05, this.bodyG.scale.x * this.sizeMul);
      this.blockCol.setHalfExtents({ x: this.blockHalf.x * k, y: this.blockHalf.y * k, z: this.blockHalf.z * k });
    }
    // hop physics (visual): springs back to the ground
    this.hopV -= 30 * dt;
    this.hop = Math.max(0, this.hop + this.hopV * dt);
    if (this.hop === 0 && this.hopV < 0) {
      if (this.hopV < -8) {
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
        this.ctx.audio.play('bigStep', { pos: this.pos, vol: 0.8 });
      }
      this.hopV = 0;
    }
    const tt = performance.now() / 1000;
    const rub = this.state === 'RUB' ? Math.sin(tt * 40) * 0.08 : 0;
    const dizzy = this.state === 'DAZED' || this.state === 'DIZZY';
    const squash = this.state === 'RUB_TELL' || this.state === 'SPIN_TELL' ? 0.12 : dizzy ? 0.08 * Math.sin(tt * 12) : this.hopV > 0 ? -0.08 : 0;
    // STUCK: tipped onto its back (face to the sky), rocking
    this.flip += ((this.state === 'STUCK' ? 1 : 0) - this.flip) * Math.min(1, dt * 8);
    this.bodyG.position.y = this.hop + this.flip * 0.5;
    this.bodyG.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    this.bodyG.rotation.x = -this.flip * (1.0 + Math.sin(tt * 7) * 0.08);
    this.bodyG.rotation.z = rub + (dizzy ? Math.sin(tt * 6) * 0.12 : 0);
    // face: pupils track WAI-ish, dazed = spinning eyes, sneer opens when attacking
    for (const [i, p] of this.pupils.entries()) {
      const sx = i ? 1 : -1;
      if (this.exposed) p.position.set(sx * 0.42 * SIZE + Math.cos(tt * 9) * 0.1, 0.14 * SIZE + Math.sin(tt * 9) * 0.1, 0.15 * SIZE);
      else p.position.set(sx * 0.42 * SIZE + Math.sin(tt * 0.7) * 0.05, 0.12 * SIZE, 0.15 * SIZE);
    }
    const angry = this.awake ? 1 : 0.6;
    for (const [i, b] of this.brows.entries()) b.rotation.z = (i ? -1 : 1) * 0.42 * angry;
    if (this.mouth) this.mouth.scale.y = this.state === 'RUB_TELL' || this.state === 'SHOWER' || this.state === 'SPIN_TELL' ? 1.1 : 0.8;
    const flail = this.state === 'IDLE' ? 3 : this.state === 'STUCK' ? 22 : 12;
    for (const [i, a] of this.arms.entries()) a.rotation.z = (this.state === 'SPIN_TELL' ? (i ? -1.4 : 1.4) : 0) + Math.sin(tt * flail + i * Math.PI) * 0.4;
    // shockwave visuals
    for (const r of this.rings) {
      r.mesh.visible = r.active;
      if (!r.active) continue;
      r.mesh.scale.setScalar(r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.95 - r.r / (this.arenaR + 4));
    }
    // landing shadow: darker + tighter the closer it is to coming down
    const airborne = (this.state === 'SLAM' || this.state === 'BOUNCE') && this.hop > 0.05;
    this.shadow.visible = airborne;
    if (airborne) {
      const k = 1 - Math.min(1, this.hop / 4.5);
      this.shadow.position.set(this.renderPos.x, this.pos.y + 0.05, this.renderPos.z);
      this.shadow.scale.setScalar(this.shadowR * (0.8 + 0.2 * k));
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * k + (this.hopV < 0 && k > 0.7 && Math.sin(tt * 40) > 0 ? 0.15 : 0);
    }
    if (this.state === 'STUNNED' || this.state === 'CALM') {
      // repainted: shrinks into a little pencil eraser
      const s = Math.max(0.15, this.bodyG.scale.x - dt * 0.5);
      this.bodyG.scale.setScalar(s);
    }
  }

  override dispose(): void {
    this.ctx.root.remove(this.lane, this.shadow, this.spinRim, this.spinFill);
    for (const r of this.rings) this.ctx.root.remove(r.mesh);
    for (const c of this.crumbs) this.ctx.root.remove(c.mesh, c.ring);
    super.dispose();
  }
}

function sleeveTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a4be0';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 96, 256, 64);
  g.fillStyle = '#141014';
  g.font = '900 44px "Marker Felt", "Comic Sans MS", sans-serif';
  g.textAlign = 'center';
  g.fillText('RUBB-ER', 128, 142);
  g.strokeStyle = '#ffd23a';
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(10 + i * 40, 20 + (i % 2) * 20);
    g.bezierCurveTo(30 + i * 40, 70, 0 + i * 40, 60, 40 + i * 40, 86);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
