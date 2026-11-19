/**
 * [INPUT]: depends on EnemyBase (stagger/TAG, hpFloor phase gates, resetFight) from ./EnemyBase; toon/addOutline from
 *          render/Materials; the bell / tentacle look from ./HushLook
 * [OUTPUT]: exports HushBoss (kind 'hush'): awake/engage(), phase, veiled, opened, counterHint, onShout(), onSummon /
 *           onBombLanded / onMuffle, mothCount
 * [POS]: the level-2 BOSS over the headland (HarborSession owns it; its brood moths are the session's). Three phases
 *        gated at ⅔ and ⅓. restartFight(): a smudge on Hard puts it back to phase 1, veiled, still awake.
 *        Before engage(), paint and shouts reach onIgnored (the session's NotYet says what is missing).
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import * as THREE from 'three';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline, toon } from '../render/Materials';
import { t } from '../i18n';
import { bellDecor, colourBell, coreSpikes, shroudPuffs, tentacleSegment } from './HushLook';

/**
 * THE HUSH — the Eraser's leftover crumbs, drifted out to sea and grown into a huge jellyfish of
 * eraser dust. It eats sound (and paint). Every attack has a visual + audio tell and a counter:
 *
 *   VEIL           grey dust shroud: paint soaks in. SHOUT at it (or hit it with a thrown dust ball)
 *                  → the veil shatters → EXPOSED (paint works, the core ×1.6) for ~5 s
 *   1  STING       three pink lanes flash on the floor (lock 0.3 s before) → stand between them or
 *                  dodge; afterwards its tentacles are TANGLED in the floor (a safe moment to shout)
 *   1  DUST RAIN   red rings on the floor → walk out; the dust balls that land are throwable (G):
 *                  a hit cracks its veil like a shout
 *   2  SILENCE DOME a lilac circle fills under it while it inhales → run out of it, or SHOUT into
 *                  it before it closes: the dome pops and it's DAZED (exposed)
 *   2  BROOD       its bell opens: Hush Moths flutter out (shout + paint them; they drop paint)
 *   3  DIVE        it rises, its shadow hunts WAI, locks, it crashes down: a shockwave ring (jump /
 *                  jet-hover over it) — then it's STRANDED on the floor: core ×2.5, PAINT SLAM it
 * Phase gates at ⅔ and ⅓ (it swells and shrieks: paint slides off for a moment).
 * Repainted, it shrinks into a little jelly lantern and floats up to the lighthouse.
 */

const TAUNTS = ['SHHHH.', 'QUIET, PLEASE.', 'NO MORE NOISE.', 'HUSH NOW.', 'TOO LOUD!'];

interface Bomb {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
}

export class HushBoss extends EnemyBase {
  readonly kind = 'hush';
  readonly displayName = 'THE HUSH';
  readonly bigness = 1;
  /** Arena (floor centre) + radius. */
  arena = new THREE.Vector3();
  arenaR = 9.5;
  /** The fight starts when the session says so. */
  awake = false;
  /** Before the fight: where it drifts (out at sea, then over the headland). */
  readonly idleSpot = new THREE.Vector3();
  private model = new THREE.Group();
  private bell: THREE.Object3D;
  private bellMat: THREE.MeshToonMaterial;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private veil: THREE.Group;
  private veilMat: THREE.MeshStandardMaterial;
  private tentacles: { root: THREE.Group; segs: THREE.Object3D[]; phase: number; lane: number }[] = [];
  private eyes: THREE.Group;
  private lids: THREE.Mesh[] = [];
  private veiledF = true;
  private exposedT = 0;
  private attackCd = 3;
  private armorT = 0;
  private gates = [0.66, 0.33];
  private introduced = new Set<string>();
  private last: string[] = [];
  private tauntT = 4;
  private hoverAlt = 2.2;
  private bob = 0;
  private lanes: THREE.Mesh[] = [];
  private laneDirs: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private laneHit = false;
  private domeFill: THREE.Mesh;
  private domeRim: THREE.Mesh;
  private domeShell: THREE.Mesh;
  private domeT = -1;
  private shadow: THREE.Mesh;
  private diveAt = new THREE.Vector3();
  private rings: { mesh: THREE.Mesh; r: number; speed: number; active: boolean; hit: boolean }[] = [];
  private bombs: Bomb[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private absorbCd = 0;
  private shriekT = 0;
  /** Session hooks. */
  onSummon: ((p: THREE.Vector3) => void) | null = null;
  onBombLanded: ((p: THREE.Vector3) => void) | null = null;
  onMuffle: ((sec: number) => void) | null = null;
  /** How many moths are alive (the session tells it, so it never floods the arena). */
  mothCount: () => number = () => 0;
  /** Final repaint: shrinks (set by the session). */

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 2000, 1.9, 1.0);
    this.idleSpot.copy(start);
    // ── the bell: a painted lilac→pink dome with ribs, eraser-crumb spots and a ruffled coral rim ──
    this.bellMat = toon({ color: '#ffffff' });
    (this.bellMat as unknown as THREE.MeshStandardMaterial).vertexColors = true;
    this.bellMat.transparent = true;
    this.bellMat.opacity = 0.93;
    const bellG = new THREE.SphereGeometry(2.4, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
    colourBell(bellG, 2.4);
    const glbBell = ctx.assets.instantiateModel('hushBell', { pivot: 'bottom' });
    if (glbBell) {
      // Tripo bell: the dome + its face + ruffled rim in one; its rim sits ≈ 24 % above its lowest point
      this.bell = new THREE.Group();
      // (animate() squashes the bell to y 0.85: pre-stretch so it nets to 1)
      glbBell.position.y = -1.0 / 0.85;
      glbBell.scale.y /= 0.85;
      this.bell.add(glbBell);
    } else {
      const bm = new THREE.Mesh(bellG, this.bellMat);
      bm.scale.set(1, 0.85, 1);
      bm.castShadow = true;
      addOutline(bm, 0.07);
      this.bell = bm;
    }
    const yRimLocal = Math.cos(Math.PI * 0.55) * 2.4; // unscaled bell space
    const decor = bellDecor(2.4, yRimLocal);
    if (!glbBell) this.bell.add(decor.spots);
    // the underside: a dark ring round the mouth, where the glowing core hangs
    const under = new THREE.Mesh(new THREE.RingGeometry(1.15, 2.38, 28).rotateX(Math.PI / 2), toon({ color: '#4d3f8f' }));
    (under.material as THREE.Material).side = THREE.DoubleSide;
    under.position.y = yRimLocal * 0.85;
    const frill = decor.ruffle;
    frill.position.y = under.position.y - yRimLocal; // ruffle is built at the unscaled rim height
    // the core: a glowing pink heart of crumbs (the weak point)
    this.coreMat = new THREE.MeshBasicMaterial({ color: '#ff3fa4' });
    // it hangs in the bell's mouth: the part WAI sees from below
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), this.coreMat);
    this.core.position.y = -0.2;
    this.core.add(coreSpikes(this.coreMat));
    // crumbs floating inside
    const crumbs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      crumbs.push(new THREE.BoxGeometry(0.22, 0.15, 0.18).rotateX(i).rotateY(i * 2).translate(Math.cos(a) * (1 + (i % 3) * 0.35), 0.2 + (i % 4) * 0.3, Math.sin(a) * (1 + (i % 3) * 0.35)));
    }
    this.model.add(new THREE.Mesh(mergeGeometries(crumbs)!, toon({ color: '#ffc6dc' })));
    // a sleepy-angry face on the bell's front (+Z): big eyes, heavy lids, slanted brows, blush, a "shh"
    this.eyes = new THREE.Group();
    const whiteM = toon({ color: '#fff8ee' });
    const inkM = new THREE.MeshBasicMaterial({ color: '#141014' });
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), whiteM);
      w.scale.set(1, 0.85, 0.45);
      w.position.set(sx * 0.82, 1.1, 2.0);
      addOutline(w, 0.035);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), inkM);
      pu.position.set(sx * 0.82, 1.04, 2.2);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      glint.position.set(sx * 0.82 - 0.06, 1.12, 2.38);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.53, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#6d6390' }));
      lid.scale.set(1, 0.85, 0.5);
      lid.position.set(sx * 0.82, 1.1, 2.02);
      lid.rotation.x = 0.5;
      this.lids.push(lid);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 0.14), inkM);
      brow.position.set(sx * 0.82, 1.78, 2.05);
      brow.rotation.z = -sx * 0.32;
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: '#ff8fb0' }));
      blush.position.set(sx * 1.2, 0.55, 2.05);
      blush.lookAt(sx * 2.4, 0.4, 4.6);
      this.eyes.add(w, pu, glint, lid, brow, blush);
    }
    // the "shh": a finger held up over pursed lips
    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.085, 6, 14), toon({ color: '#ff7a6b' }));
    lips.position.set(0, 0.42, 2.2);
    lips.scale.set(1, 0.6, 1);
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.8, 4, 10), toon({ color: '#e6def4' }));
    finger.position.set(0, 0.65, 2.34);
    addOutline(finger, 0.025);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), toon({ color: '#ffb3d1' }));
    nail.position.set(0, 1.1, 2.4);
    nail.scale.set(1, 0.7, 0.5);
    this.eyes.add(lips, finger, nail);
    if (glbBell) this.model.add(this.bell, this.core);
    else this.model.add(this.bell, under, frill, this.core, this.eyes);
    // ── tentacles: chains of banded segments that sway (and slam down the lanes) ──
    const tMat = toon({ color: '#9b92c4' });
    const tipM = toon({ color: '#ff3fa4' });
    const bandM = toon({ color: '#fff1dc' });
    for (let i = 0; i < 6; i++) {
      const root = new THREE.Group();
      const a = (i / 6) * Math.PI * 2 + 0.3;
      root.position.set(Math.cos(a) * 1.5, under.position.y, Math.sin(a) * 1.5);
      const segs: THREE.Object3D[] = [];
      let parent: THREE.Object3D = root;
      for (let k = 0; k < 6; k++) {
        const seg = tentacleSegment(k, tMat, tipM, bandM);
        seg.position.y = k === 0 ? 0 : -0.72;
        parent.add(seg);
        segs.push(seg);
        parent = seg;
      }
      this.model.add(root);
      this.tentacles.push({ root, segs, phase: i * 1.1, lane: i % 3 });
    }
    // ── the veil: a see-through shroud of dust puffs around everything ──
    this.veil = new THREE.Group();
    this.veilMat = new THREE.MeshStandardMaterial({ color: '#cfc8e2', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
    const shroud = shroudPuffs(3.0, this.veilMat);
    shroud.position.y = 0.6;
    this.veil.add(shroud);
    const dust: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 1.4 - 0.4;
      dust.push(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.14, 0).translate(Math.cos(a) * 3.1 * Math.cos(b * 0.6), 0.6 + Math.sin(b) * 2.4, Math.sin(a) * 3.1 * Math.cos(b * 0.6)));
    }
    this.veil.add(new THREE.Mesh(mergeGeometries(dust.map((g) => (g.index ? g.toNonIndexed() : g)))!, new THREE.MeshStandardMaterial({ color: '#efeaf6', roughness: 1 })));
    this.veil.traverse((o) => (o.userData.noPaint = true));
    this.model.add(this.veil);
    this.model.position.y = this.cOff;
    this.root.add(this.model);
    this.paintAnchor = this.model;

    // ── telegraphs on the floor (pooled) ──
    const flat = (geo: THREE.BufferGeometry, color: string) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData.noPaint = true;
      m.renderOrder = 3;
      ctx.root.add(m);
      return m;
    };
    for (let i = 0; i < 3; i++) this.lanes.push(flat(new THREE.PlaneGeometry(1.5, 13).translate(0, 6.5, 0), '#ff3fa4'));
    this.domeFill = flat(new THREE.CircleGeometry(1, 48), '#b49cff');
    this.domeRim = flat(new THREE.RingGeometry(0.94, 1, 64), '#7d6fb8');
    this.domeShell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b49cff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.domeShell.visible = false;
    this.domeShell.userData.noPaint = true;
    ctx.root.add(this.domeShell);
    this.shadow = flat(new THREE.CircleGeometry(3, 40), '#231b52');
    for (let i = 0; i < 3; i++) {
      const m = flat(new THREE.RingGeometry(0.85, 1, 64), '#ff3fa4');
      this.rings.push({ mesh: m, r: 0, speed: 0, active: false, hit: false });
    }
    this.pos.copy(start);
    this.prevPos.copy(start);
    this.place();
  }

  // ───────────── state readouts ─────────────
  get phase(): number {
    const f = this.hp / this.maxHp;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  }

  get veiled(): boolean {
    return this.veiledF;
  }

  /** Big damage window (dazed / stranded). */
  get opened(): boolean {
    return this.state === 'DAZED' || this.state === 'STRANDED';
  }

  get counterHint(): string {
    switch (this.state) {
      case 'STING_TELL':
      case 'STING':
        return 'Stand BETWEEN the pink lanes (or dodge with C) — its tentacles get tangled';
      case 'TANGLED':
        return this.veiledF ? 'Its tentacles are stuck — SHOUT (X) to blow its veil off, then paint it' : 'Tangled and unveiled — paint its pink core!';
      case 'RAIN':
        return 'Walk out of the red rings! Landed dust balls can be thrown (G) — they crack its veil';
      case 'DOME_TELL':
        return 'SILENCE DOME: run out of the lilac circle — or SHOUT into it before it closes!';
      case 'BROOD':
        return 'Moths! SHOUT to ring them, then paint them — they drop paint';
      case 'DIVE_UP':
      case 'DIVE_TELL':
      case 'DIVE':
        return 'It’s diving at your shadow — move, then JUMP the shockwave ring (hold Space to hover)';
      case 'STRANDED':
      case 'DAZED':
        return 'It’s down! Paint the pink core — or PAINT SLAM it (C in mid-air)';
    }
    if (this.armorT > 0) return 'It swells and shrieks — paint slides off for a moment';
    return this.veiledF ? 'Its dust veil soaks up paint — SHOUT at it (X), then paint it!' : 'The veil is off — paint THE HUSH before it grows back!';
  }

  /** The fight starts: a beat of grace before the first (telegraphed) attack. */
  engage(): void {
    this.awake = true;
    this.alerted = true;
    this.attackCd = 3;
  }

  private get atGate(): boolean {
    return this.gates.length > 0 && this.hp <= this.gates[0] * this.maxHp + 0.5;
  }

  override get canBeTagged(): boolean {
    return super.canBeTagged && !this.atGate && this.armorT <= 0 && !this.veiledF;
  }

  override get allowsEncore(): boolean {
    return !this.atGate;
  }

  protected override hpFloor(): number {
    return (this.gates[0] ?? 0) * this.maxHp;
  }

  protected override weakPoints(): WeakPoint[] {
    const c = this.core.getWorldPosition(this.tmp2);
    return [{ pos: c.clone(), radius: 1.6, mul: this.opened ? 2.5 : 1.6 }];
  }

  /** Veil off (shout, thrown dust ball, popped dome). */
  private unveil(sec: number, word: string): void {
    const was = this.veiledF;
    this.veiledF = false;
    this.exposedT = Math.max(this.exposedT, sec);
    this.veil.visible = false;
    if (was) {
      const c = this.model.getWorldPosition(this.tmp).add(this.tmp2.set(0, 0.8, 0));
      this.ctx.effects.burst(c, '#e6def4', 40, 7, 0.12);
      this.ctx.effects.comic(c.clone().add(this.tmp2.set(0, 2.6, 0)), t(word), '#5ff4e6', 1.1);
      this.ctx.audio.play('smallBell', { pos: c, pitch: 0.7 });
      this.ctx.audio.play('crumble', { pos: c, vol: 0.8 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
      this.ctx.events.emit('hush:unveiled', { id: this.id });
    }
  }

  private reveil(): void {
    if (this.veiledF) return;
    this.veiledF = true;
    this.veil.visible = true;
    this.ctx.audio.play('hush', { pos: this.pos, vol: 0.7 });
    this.ctx.effects.burst(this.model.getWorldPosition(this.tmp), '#cfc8e2', 18, 3, 0.1);
  }

  /** WAI shouted at it. */
  onShout(big: boolean, _from: THREE.Vector3): void {
    if (this.harmless) return;
    // not fighting yet (drifting at sea, or over the headland before WAI steps onto the plaza): the session says why
    if (!this.awake) return this.onIgnored?.(this.core.getWorldPosition(this.tmp2).clone(), 'shout');
    // a shout into the silence dome pops it (the best counter in the fight)
    if (this.state === 'DOME_TELL') {
      this.hideTells();
      this.setState('DAZED');
      this.unveil(6, 'POP!!');
      this.ctx.effects.ring(this.arenaFloor(this.pos), '#b49cff', 7);
      this.ctx.events.emit('hush:domePopped', { id: this.id });
      return;
    }
    if (this.armorT > 0) return;
    this.unveil(big ? 7 : 5, big ? 'SHATTERED!!' : 'VEIL CRACKED!');
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (!this.awake) {
      this.onIgnored?.(info.point, 'paint', info.color);
      return { weak: false, absorbed: true };
    }
    if (this.armorT > 0) return { weak: false, absorbed: true };
    if (this.veiledF) {
      // a thrown dust ball / can cracks the veil (counter for a muffled WAI)
      if (info.kind === 'crash' || info.kind === 'spit') {
        this.unveil(5, 'CRACK!');
        return { weak: false, absorbed: true };
      }
      if (this.absorbCd <= 0) {
        this.absorbCd = 1.1;
        this.ctx.effects.comic(info.point.clone().add(this.tmp.set(0, 0.6, 0)), t('SOAKED UP — SHOUT!'), '#b49cff', 0.8);
        this.ctx.events.emit('hush:absorbed', { id: this.id });
      }
      return { weak: false, absorbed: true };
    }
    // a PAINT SLAM next to a downed Hush lands right on its core
    if (info.kind === 'stomp' && this.opened && info.point.distanceTo(this.pos) < 6) info.point.copy(this.core.getWorldPosition(this.tmp));
    return null;
  }

  protected override interrupt(): void {
    // staggers (every quarter repainted) cancel the wind-up; a stagger mid-dive drops it
    if (this.state === 'DIVE_UP' || this.state === 'DIVE_TELL' || this.state === 'DIVE') {
      this.hideTells();
      this.setState('STRANDED');
      return;
    }
    if (this.state === 'STRANDED' || this.state === 'DAZED') return;
    this.hideTells();
    if (this.state !== 'IDLE') this.setState('IDLE');
    this.attackCd = 1.3;
  }

  private hideTells(): void {
    for (const l of this.lanes) l.visible = false;
    this.domeFill.visible = this.domeRim.visible = false;
    this.domeShell.visible = false;
    this.domeT = -1;
    this.shadow.visible = false;
  }

  /** Tells, shockwave rings and dust bombs in flight: all gone (repainted, or the fight restarts). */
  private clearHazards(): void {
    this.hideTells();
    for (const r of this.rings) r.active = r.mesh.visible = false;
    for (const b of this.bombs) this.ctx.root.remove(b.mesh, b.ring);
    this.bombs = [];
  }

  protected override finish(): void {
    this.clearHazards();
    this.veil.visible = false;
    super.finish();
  }

  /** WAI was smudged (Hard): phase 1 again, veiled, still awake over the headland (no intro), a beat of grace. */
  protected override restartFight(): void {
    this.clearHazards();
    this.gates = [0.66, 0.33];
    this.armorT = this.shriekT = this.exposedT = 0;
    this.reveil();
    this.last = [];
    this.setState('IDLE');
    this.attackCd = 3;
    if (this.awake) this.alerted = true;
  }

  // ───────────── helpers ─────────────
  private arenaFloor(p: THREE.Vector3): THREE.Vector3 {
    return this.tmp2.set(p.x, this.arena.y + 0.06, p.z);
  }

  private bodyGone = false;

  /** Repainted and shrinking: its body leaves the physics world (nothing to bump into). */
  override dropCollider(): void {
    if (this.bodyGone) return;
    super.dropCollider();
    this.bodyGone = true;
  }

  private place(): void {
    if (this.bodyGone || this.disposed) return;
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + this.cOff, z: this.pos.z });
  }

  /** Kinematic hover: glide toward a point (no gravity, no KCC — it floats). */
  private glide(target: THREE.Vector3, speed: number, dt: number): void {
    this.tmp.copy(target).sub(this.pos);
    const d = this.tmp.length();
    if (d > 0.02) this.pos.addScaledVector(this.tmp, Math.min(1, (speed * dt) / d));
  }

  override knock(_dir: THREE.Vector3, _speed: number): void {
    // too big to shove
  }

  private bomb(target: THREE.Vector3, dur: number): void {
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? '#cfc8e2' : '#e6def4', roughness: 1 }));
    mesh.userData.noPaint = true;
    addOutline(mesh, 0.03);
    this.ctx.root.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: '#ff2448', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(target).setY(this.arena.y + 0.07);
    ring.userData.noPaint = true;
    this.ctx.root.add(ring);
    this.bombs.push({ mesh, ring, from: this.model.getWorldPosition(new THREE.Vector3()), to: target.clone().setY(this.arena.y), t: 0, dur });
  }

  private stepBombs(dt: number, player: PlayerController): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const p = b.mesh.position.copy(b.from).lerp(b.to, k);
      p.y += Math.sin(k * Math.PI) * 5;
      b.mesh.rotation.x += dt * 6;
      const flashing = b.dur - b.t < 0.3 && Math.sin(b.t * 50) > 0;
      (b.ring.material as THREE.MeshBasicMaterial).opacity = flashing ? 0.9 : 0.25 + k * 0.45;
      if (k >= 1) {
        this.ctx.effects.burst(b.to.clone().add(this.tmp.set(0, 0.3, 0)), '#e6def4', 10, 4, 0.08);
        this.ctx.audio.play('crumble', { pos: b.to, vol: 0.6 });
        this.ctx.effects.eraseNear(b.to, 1.4);
        const flat = Math.hypot(player.pos.x - b.to.x, player.pos.z - b.to.z);
        if (flat < 1.5 && Math.abs(player.pos.y - b.to.y) < 1.4 && player.takeHit(b.to, 1, 7)) this.onMuffle?.(1.5);
        this.ctx.root.remove(b.mesh, b.ring);
        this.bombs.splice(i, 1);
        if (Math.random() < 0.6) this.onBombLanded?.(b.to.clone());
      }
    }
  }

  private shockwave(speed: number): void {
    const r = this.rings.find((x) => !x.active) ?? this.rings[0];
    r.active = true;
    r.hit = false;
    r.r = 1;
    r.speed = speed;
    r.mesh.visible = true;
    r.mesh.position.copy(this.arenaFloor(this.pos));
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  private stepRings(dt: number, player: PlayerController): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.r += dt * r.speed;
      r.mesh.scale.setScalar(r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 0.95 - r.r / (this.arenaR + 4));
      const flat = Math.hypot(player.pos.x - r.mesh.position.x, player.pos.z - r.mesh.position.z);
      if (!r.hit && player.grounded && Math.abs(flat - r.r) < 0.55 && Math.abs(player.pos.y - r.mesh.position.y) < 1.5) r.hit = player.takeHit(r.mesh.position, 1, 10);
      if (r.r > this.arenaR + 2) r.active = r.mesh.visible = false;
    }
  }

  private pickAttack(): string {
    const ph = this.phase;
    if (ph >= 2 && !this.introduced.has('DOME')) return 'DOME';
    if (ph >= 3 && !this.introduced.has('DIVE')) return 'DIVE';
    const w: [string, number][] =
      ph === 1
        ? [['STING', 0.6], ['RAIN', 0.4]]
        : ph === 2
          ? [['STING', 0.3], ['RAIN', 0.25], ['DOME', 0.3], ['BROOD', this.mothCount() < 2 ? 0.2 : 0]]
          : [['STING', 0.22], ['RAIN', 0.18], ['DOME', 0.22], ['BROOD', this.mothCount() < 2 ? 0.12 : 0], ['DIVE', 0.3]];
    const banned = this.last.length >= 2 && this.last[0] === this.last[1] ? this.last[0] : null;
    const pool = w.filter(([k, v]) => k !== banned && v > 0);
    let sum = 0;
    for (const [, v] of pool) sum += v;
    let roll = Math.random() * sum;
    for (const [k, v] of pool) {
      roll -= v;
      if (roll <= 0) return k;
    }
    return pool[0]?.[0] ?? 'STING';
  }

  // ───────────── AI ─────────────
  protected ai(dt: number, player: PlayerController): void {
    this.bob += dt;
    this.absorbCd = Math.max(0, this.absorbCd - dt);
    if (this.harmless) {
      this.place();
      return;
    }
    this.stepBombs(dt, player);
    this.stepRings(dt, player);
    if (!this.awake) {
      // drifting out at sea (or over the headland once the lighthouse calls it), taunting
      const want = this.tmp.copy(this.idleSpot);
      want.y += Math.sin(this.bob * 0.8) * 0.6;
      this.glide(want, 9, dt);
      this.faceToward(player.pos, dt, 1.5);
      this.place();
      return;
    }
    const ph = this.phase;
    const fast = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.armorT = Math.max(0, this.armorT - dt);
    this.shriekT = Math.max(0, this.shriekT - dt);
    // the veil grows back
    if (!this.veiledF && !this.opened && this.state !== 'TANGLED') {
      this.exposedT -= dt;
      if (this.exposedT <= 0) this.reveil();
    }
    // phase gate: it swells and shrieks (no damage for a moment), comes back faster
    if (this.atGate && this.state !== 'DIVE' && this.state !== 'DIVE_UP' && this.state !== 'DIVE_TELL') {
      this.gates.shift();
      this.armorT = 1.7;
      this.shriekT = 1.7;
      this.hideTells();
      this.setState('IDLE');
      this.attackCd = 2.0;
      this.reveil();
      this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.6, vol: 1 });
      this.ctx.audio.play('hush', { pos: this.pos, vol: 1, pitch: 0.6 });
      this.ctx.audio.play('phaseSting', { pos: this.pos });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.8);
      this.ctx.effects.ring(this.arenaFloor(this.pos).clone(), '#b49cff', 8);
      this.ctx.effects.burst(this.model.getWorldPosition(this.tmp), '#e6def4', 30, 6, 0.12);
      this.ctx.effects.comic(this.model.getWorldPosition(this.tmp).add(this.tmp2.set(0, 3.6, 0)), t(this.gates.length ? 'IT’S SWELLING!' : 'IT’S FURIOUS!'), '#ff3fa4', 1.15);
    }
    const toP = this.tmp.copy(player.pos).sub(this.pos).setY(0);
    const d = toP.length();
    const floorY = this.arena.y;
    const hover = floorY + this.hoverAlt + Math.sin(this.bob * 1.6) * 0.25;
    switch (this.state) {
      case 'IDLE': {
        this.faceToward(player.pos, dt, 2.5 * fast);
        // keep ~6.5 m from WAI, inside the arena
        const want = this.tmp2.copy(this.pos);
        if (d > 0.1) want.addScaledVector(toP, (d - 6.5) / d);
        const off = want.clone().sub(this.arena).setY(0);
        if (off.length() > this.arenaR - 2.5) want.copy(this.arena).add(off.setLength(this.arenaR - 2.5));
        want.y = hover;
        this.glide(want, 2.4 * fast, dt);
        this.tauntT -= dt;
        if (this.tauntT <= 0) {
          this.tauntT = 6 + Math.random() * 5;
          this.ctx.effects.comic(this.model.getWorldPosition(this.tmp2).add(new THREE.Vector3(0, 3.6, 0)), t(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]), '#b49cff', 0.85);
        }
        if (this.attackCd <= 0 && this.armorT <= 0 && !player.smudged) {
          const atk = this.pickAttack();
          this.introduced.add(atk);
          this.last.unshift(atk);
          this.last.length = Math.min(2, this.last.length);
          this.laneHit = false;
          if (atk === 'STING') this.setState('STING_TELL');
          else if (atk === 'DOME') this.setState('DOME_TELL');
          else if (atk === 'DIVE') this.setState('DIVE_UP');
          else this.setState(atk);
        }
        break;
      }
      case 'STING_TELL': {
        const tell = 1.05 / Math.min(fast, 1.2);
        // lanes lock at HALF the tell: the flashing half is the player's window to step into a gap (or jump)
        const locked = this.stateT > tell * 0.5;
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 0.8 });
          this.ctx.audio.play('hush', { pos: this.pos, vol: 0.6, pitch: 1.3 });
        }
        if (!locked) {
          this.faceToward(player.pos, dt, 6);
          const base = Math.atan2(toP.x, toP.z);
          const spread = 0.62; // gaps ≈ 4 m at the Hush's distance: a sidestep or dodge lands in one
          for (let i = 0; i < 3; i++) {
            const a = base + (i - 1) * spread;
            this.laneDirs[i].set(Math.sin(a), 0, Math.cos(a));
          }
        } else if (this.stateT - dt <= tell * 0.5) this.ctx.audio.play('lockOn', { pos: this.pos });
        for (let i = 0; i < 3; i++) {
          const l = this.lanes[i];
          l.visible = true;
          l.position.copy(this.arenaFloor(this.pos));
          l.rotation.set(-Math.PI / 2, 0, -Math.atan2(this.laneDirs[i].x, this.laneDirs[i].z) + Math.PI);
          (l.material as THREE.MeshBasicMaterial).opacity = locked ? (Math.sin(this.stateT * 45) > 0 ? 0.85 : 0.35) : 0.18 + (this.stateT / tell) * 0.4;
        }
        if (this.stateT > tell) this.setState('STING');
        break;
      }
      case 'STING': {
        // tentacles whip down the lanes
        if (!this.laneHit && this.stateT > 0.12) {
          this.laneHit = true;
          this.ctx.audio.play('slamLand', { pos: this.pos, vol: 0.9 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5);
          const rel = this.tmp2.copy(player.pos).sub(this.pos).setY(0);
          for (let i = 0; i < 3; i++) {
            const along = rel.dot(this.laneDirs[i]);
            const side = Math.abs(rel.x * this.laneDirs[i].z - rel.z * this.laneDirs[i].x);
            const tip = this.pos.clone().addScaledVector(this.laneDirs[i], 7).setY(floorY);
            this.ctx.effects.burst(tip, '#ff3fa4', 8, 4, 0.07);
            this.ctx.effects.eraseNear(tip, 1.2);
            if (along > 0 && along < 13 && side < 0.85 && player.pos.y - floorY < 1.0) player.takeHit(this.pos, 1, 8);
          }
        }
        if (this.stateT > 0.45) {
          for (const l of this.lanes) l.visible = false;
          this.setState('TANGLED');
        }
        break;
      }
      case 'TANGLED': {
        // the tentacles are stuck in the floor: it can't attack — shout and paint!
        const lowY = floorY + this.hoverAlt - 0.9;
        this.pos.y += (lowY - this.pos.y) * Math.min(1, dt * 4);
        if (this.stateT > 1.6 / fast + 0.4) {
          this.attackCd = 1.4 / fast;
          this.setState('IDLE');
        }
        break;
      }
      case 'RAIN': {
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.8, vol: 0.6 });
          const n = 5 + ph;
          for (let i = 0; i < n; i++) {
            const tgt = i < 2
              ? player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)).add(player.vel.clone().setY(0).multiplyScalar(0.6))
              : this.arena.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * (this.arenaR - 1.5), 0, (Math.random() - 0.5) * 2 * (this.arenaR - 1.5)));
            if (tgt.clone().sub(this.arena).setY(0).length() > this.arenaR - 1) tgt.sub(this.arena).setY(0).setLength(this.arenaR - 1.2).add(this.arena);
            this.bomb(tgt, 1.3 + i * 0.12);
          }
        }
        this.faceToward(player.pos, dt, 3);
        if (this.stateT > 2.2) {
          this.attackCd = 1.6 / fast;
          this.setState('IDLE');
        }
        break;
      }
      case 'DOME_TELL': {
        // inhales: a lilac circle fills under it; at full the silence dome slams down
        const tell = 1.8 / Math.min(fast, 1.15);
        const R = 8.6; // bigger than the 6.5 m it keeps from WAI: the dome is a real threat (run out, or SHOUT it)
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('hush', { pos: this.pos, vol: 1, pitch: 0.75 });
          this.ctx.effects.comic(this.model.getWorldPosition(this.tmp2).add(new THREE.Vector3(0, 3.6, 0)), t('INHALES…'), '#b49cff', 0.9);
        }
        const c = this.arenaFloor(this.pos);
        this.domeRim.visible = this.domeFill.visible = true;
        this.domeRim.position.copy(c);
        this.domeFill.position.copy(c).setY(c.y + 0.01);
        this.domeRim.scale.setScalar(R);
        const k = Math.min(1, this.stateT / tell);
        this.domeFill.scale.setScalar(Math.max(0.05, R * k));
        (this.domeRim.material as THREE.MeshBasicMaterial).opacity = 0.9;
        (this.domeFill.material as THREE.MeshBasicMaterial).opacity = 0.2 + k * 0.35 + (k > 0.8 && Math.sin(this.stateT * 40) > 0 ? 0.25 : 0);
        this.bell.scale.set(1 + k * 0.15, 0.85 + k * 0.2, 1 + k * 0.15);
        if (this.stateT > tell) {
          this.domeRim.visible = this.domeFill.visible = false;
          this.bell.scale.set(1, 0.85, 1);
          this.domeShell.visible = true;
          this.domeShell.position.copy(c);
          this.domeT = 0;
          this.ctx.audio.play('slamLand', { pos: this.pos, vol: 1, pitch: 0.6 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.6);
          const flat = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
          if (flat < R && Math.abs(player.pos.y - floorY) < 3 && player.takeHit(c, 1, 6)) {
            this.onMuffle?.(3);
            this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), t('SILENCED!'), '#b49cff', 0.9);
          }
          this.attackCd = 1.8 / fast;
          this.setState('IDLE');
        }
        break;
      }
      case 'BROOD': {
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('hush', { pos: this.pos, vol: 0.8, pitch: 1.6 });
          this.ctx.effects.comic(this.model.getWorldPosition(this.tmp2).add(new THREE.Vector3(0, 3.6, 0)), t('FLUTTER…'), '#b49cff', 0.8);
        }
        this.bell.scale.set(1.1, 0.75, 1.1);
        const n = Math.max(0, Math.min(ph, 4 - this.mothCount()));
        if (this.stateT > 0.6 && this.stateT - dt <= 0.6) {
          for (let i = 0; i < n; i++) {
            const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random();
            this.onSummon?.(this.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5)).setY(floorY));
          }
        }
        if (this.stateT > 1.3) {
          this.bell.scale.set(1, 0.85, 1);
          this.attackCd = 1.8 / fast;
          this.setState('IDLE');
        }
        break;
      }
      case 'DIVE_UP': {
        // rises out of reach
        this.glide(this.tmp2.set(this.pos.x, floorY + 9, this.pos.z), 9, dt);
        if (this.stateT < dt * 1.5) this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 0.7 });
        if (this.stateT > 0.8) this.setState('DIVE_TELL');
        break;
      }
      case 'DIVE_TELL': {
        // its shadow hunts WAI, then locks (flashing) — move!
        const tell = 1.5 / Math.min(fast, 1.2);
        const locked = this.stateT > tell - 0.4;
        if (!locked) {
          this.diveAt.lerp(this.tmp2.set(player.pos.x, floorY, player.pos.z), Math.min(1, dt * 5));
          if (this.stateT < dt * 1.5) this.diveAt.set(player.pos.x, floorY, player.pos.z);
        } else if (this.stateT - dt <= tell - 0.4) this.ctx.audio.play('lockOn', { pos: this.pos });
        const off = this.diveAt.clone().sub(this.arena).setY(0);
        if (off.length() > this.arenaR - 2.5) this.diveAt.copy(this.arena).add(off.setLength(this.arenaR - 2.5)).setY(floorY);
        this.glide(this.tmp2.set(this.diveAt.x, floorY + 9, this.diveAt.z), 14, dt);
        this.shadow.visible = true;
        this.shadow.position.copy(this.diveAt).setY(floorY + 0.06);
        (this.shadow.material as THREE.MeshBasicMaterial).opacity = locked ? (Math.sin(this.stateT * 40) > 0 ? 0.8 : 0.4) : 0.35;
        if (this.stateT > tell) this.setState('DIVE');
        break;
      }
      case 'DIVE': {
        this.glide(this.tmp2.set(this.diveAt.x, floorY, this.diveAt.z), 30, dt);
        if (this.pos.y <= floorY + 0.05) {
          this.shadow.visible = false;
          this.ctx.audio.play('slamLand', { pos: this.pos, vol: 1 });
          this.ctx.audio.play('crash', { pos: this.pos, vol: 0.8, pitch: 0.6 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 1);
          this.ctx.effects.burst(this.arenaFloor(this.pos).clone().add(new THREE.Vector3(0, 0.4, 0)), '#e6def4', 30, 7, 0.12);
          const flat = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
          if (flat < 2.8 && Math.abs(player.pos.y - floorY) < 2) player.takeHit(this.pos, 2, 12);
          this.shockwave(9);
          this.unveil(3.4, 'SPLAT!');
          this.setState('STRANDED');
        }
        break;
      }
      case 'STRANDED': {
        // flopped on the floor: veil gone, core open
        this.pos.y += (floorY - this.pos.y) * Math.min(1, dt * 8);
        if (this.stateT > 3.2) {
          this.attackCd = 1.2;
          this.exposedT = 1.5;
          this.setState('IDLE');
        }
        break;
      }
      case 'DAZED': {
        // the dome popped in its face: it sags, exposed
        const lowY = floorY + this.hoverAlt - 1.1;
        this.pos.y += (lowY - this.pos.y) * Math.min(1, dt * 3);
        this.facing += dt * 1.2;
        if (this.stateT > 3.2) {
          this.attackCd = 1.2;
          this.exposedT = 1.5;
          this.setState('IDLE');
        }
        break;
      }
    }
    // keep it inside the arena (+ its floor)
    const off = this.tmp2.copy(this.pos).sub(this.arena).setY(0);
    if (off.length() > this.arenaR - 1.5) {
      off.setLength(this.arenaR - 1.5);
      this.pos.x = this.arena.x + off.x;
      this.pos.z = this.arena.z + off.z;
    }
    if (this.pos.y < floorY) this.pos.y = floorY;
    this.place();
  }

  protected animate(dt: number): void {
    const time = this.bob;
    // the dome shell: a quick bloom that fades
    if (this.domeT >= 0) {
      this.domeT += dt;
      const k = this.domeT / 0.6;
      this.domeShell.scale.setScalar(6.2 * (0.6 + Math.min(1, k) * 0.45));
      (this.domeShell.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 * (1 - k));
      if (k >= 1) {
        this.domeShell.visible = false;
        this.domeT = -1;
      }
    }
    // breathing bell + tentacle sway (whip straight down the lanes during STING)
    const sting = this.state === 'STING' || this.state === 'TANGLED';
    const tell = this.state === 'STING_TELL';
    const flop = this.state === 'STRANDED';
    const pulse = Math.sin(time * 2.2) * 0.05;
    if (this.state !== 'DOME_TELL' && this.state !== 'BROOD') this.bell.scale.set(1 + pulse, 0.85 - pulse, 1 + pulse);
    for (const tn of this.tentacles) {
      const lane = this.laneDirs[tn.lane];
      tn.segs.forEach((seg, k) => {
        if (sting) {
          // reach out along the lane, hugging the floor
          const yawL = Math.atan2(lane.x, lane.z) - this.facing;
          tn.root.rotation.set(0, yawL, 0);
          seg.rotation.set(k === 0 ? 1.15 : 0.08, 0, 0);
        } else if (flop) {
          tn.root.rotation.set(0, tn.phase, 0);
          seg.rotation.set(k === 0 ? 1.3 : 0.05 + Math.sin(time * 3 + k) * 0.05, 0, 0);
        } else {
          tn.root.rotation.set(0, 0, 0);
          const lift = tell ? -0.25 - k * 0.04 : 0;
          seg.rotation.set(Math.sin(time * 1.8 + tn.phase + k * 0.6) * (0.16 + k * 0.03) + lift, 0, Math.cos(time * 1.3 + tn.phase + k * 0.5) * 0.12);
        }
      });
    }
    // the core throbs (brighter when exposed)
    const open = !this.veiledF;
    this.coreMat.color.set(open ? (Math.sin(time * 10) > 0 ? '#ff3fa4' : '#ff7ac0') : '#9a6aa8');
    this.core.scale.setScalar(1 + Math.sin(time * (open ? 8 : 3)) * 0.08);
    // the veil churns
    if (this.veil.visible) {
      this.veil.rotation.y += dt * 0.6;
      this.veilMat.opacity = 0.42 + Math.sin(time * 2) * 0.06 + (this.shriekT > 0 ? 0.2 : 0);
    }
    // eyelids: sleepy while veiled, wide when hurt / exposed
    const lid = this.opened ? -0.7 : open ? -0.2 : 0.5;
    for (const l of this.lids) l.rotation.x += (lid - l.rotation.x) * Math.min(1, dt * 8);
    this.model.rotation.z = flop ? 0.35 : this.state === 'DAZED' ? Math.sin(time * 3) * 0.2 : 0;
    this.model.position.y = this.cOff + (flop ? -1.4 : 0);
  }

  override dispose(): void {
    for (const m of [...this.lanes, this.domeFill, this.domeRim, this.domeShell, this.shadow, ...this.rings.map((r) => r.mesh)]) m.removeFromParent();
    for (const b of this.bombs) this.ctx.root.remove(b.mesh, b.ring);
    super.dispose();
  }
}
