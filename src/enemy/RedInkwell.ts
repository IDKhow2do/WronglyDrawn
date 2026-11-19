/**
 * [INPUT]: depends on EnemyBase (stagger/TAG, hpFloor phase gate) from ./EnemyBase; Lobbed (ink flicks) from ./Lobbed;
 *          toon/paintedMesh/addOutline from render/Materials; PAL from render/PaintTextures
 * [OUTPUT]: exports the RedInkwell mid-boss (kind 'inkwell') with `counterHint`, `corked`, `phase`, onHelper/onWake/reachable
 * [POS]: the level-1 MID-BOSS in Inkwell Square (Crossed-Out Quarter). It holds the Red Pen's ink; repainting it
 *        washes the red marks off the quarter and off the Blind Statue (QuarterDirector does that).
 *        It teaches PAINT SLAM (jump, C in mid-air): the Eraser's DIZZY/STUCK openings want it later.
 *        It fights only while `reachable` (WAI on its side of the barricades); it wakes once, the cut-in never replays.
 *        Paint from over the barricades runs off the glass and reaches onIgnored (GameSession's NotYet says why).
 *        Its phase-2 helper (returned by onHelper) is repainted with it, and when the fight restarts (restartFight:
 *        a smudge on Hard → phase 1, uncorked, the cut-in still never replays).
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { Lobbed } from './Lobbed';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageKind, DamageResult } from '../combat/Damage';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';

// ───────────── tuning (phase 1 → phase 2) ─────────────
const HP = 1400; // ≥ 1000: a TAG lands the boss-sized 5 % (no one-TAG phases)
const LINE_LEN = 22;
const LINE_W = 1.6;
const P = [
  { tell: 1.0, flicks: 3, corkEvery: 12, cd: [2.2, 3.0] },
  { tell: 0.8, flicks: 5, corkEvery: 8, cd: [1.6, 2.3] },
];
const DAZED = 3.6;
const LEASH = 24;

interface Strike {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  dir: THREE.Vector3;
}

/**
 * THE RED INKWELL: a squat glass inkwell full of the Red Pen's ink, two angry eyes on the glass.
 *   FLICK  — rears back, flicks ink blobs at red landing rings (walk out of the rings)
 *   LINE   — a red line flashes through it toward WAI, then strikes (jump it, or step off it)
 *   CROSS  — phase 2: two lines cross on WAI (jump!)
 *   CORK   — it corks itself: spray slides off. PAINT SLAM (jump, C in mid-air) beside it pops the cork:
 *            DAZED, everything ×2.5, TAG IT.
 * At half paint it roars, corks, and calls a White-out Bottle (session hook onHelper).
 */
export class RedInkwell extends EnemyBase {
  readonly kind = 'inkwell';
  readonly displayName = 'The Red Inkwell';
  readonly bigness = 0.75;
  phase = 0;
  corked = false;
  /** Phase 2 begins: the session sends in a helper creature (returned: it is repainted with the Inkwell). */
  onHelper: (() => EnemyBase | void) | null = null;
  private helper: EnemyBase | null = null;
  /** It noticed WAI for the first time (the session plays its intro beat). */
  onWake: (() => void) | null = null;
  /** Is WAI on its side of the red barricades? While not: it sleeps, paint slides off, no attacks (null = always). */
  reachable: (() => boolean) | null = null;
  private glass: THREE.Group = new THREE.Group();
  private cork: THREE.Group = new THREE.Group();
  private ink: THREE.Mesh;
  private brows: THREE.Mesh[] = [];
  private glassMat: THREE.MeshToonMaterial;
  private attackCd = 2.5;
  private corkT = 10;
  private strikes: Strike[] = [];
  private lineMat = new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  private struck = false;
  private blobs: Lobbed;
  private lastKind: DamageKind = 'paint';
  private woke = false;
  private toldCork = false;
  private wob = 0;
  private corkPopT = -1;
  private corkVel = new THREE.Vector3();
  private puddles: { m: THREE.Mesh; t: number }[] = [];

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, HP, 1.6, 0.25);
    const T = (n: string) => ctx.assets.tex(n);
    // squat faceted glass body, red ink inside showing at the top, a neck, a cork above
    this.glassMat = toon({ map: T('stone_cream'), color: '#cfe0ff' });
    const body = paintedMesh(new THREE.CylinderGeometry(1.25, 1.55, 1.9, 8), this.glassMat, 0.06);
    body.position.y = 0.95;
    const shoulder = paintedMesh(new THREE.CylinderGeometry(0.8, 1.25, 0.55, 8), this.glassMat, 0.05);
    shoulder.position.y = 2.17;
    const neck = paintedMesh(new THREE.CylinderGeometry(0.72, 0.8, 0.45, 12), toon({ map: T('metal_dark'), color: '#ffd23a' }), 0.04);
    neck.position.y = 2.66;
    // the ink line seen through the glass (a red band) + the ink surface in the mouth
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.52, 1.1, 8, 1, true), toon({ color: '#c0182a' }));
    band.position.y = 0.6;
    band.scale.setScalar(1.005);
    this.ink = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18).rotateX(-Math.PI / 2), toon({ color: '#d81b30', emissive: '#4a0008' }));
    this.ink.position.y = 2.86;
    // the face on the glass: big white eyes, heavy brows, a scowl
    for (const x of [-0.5, 0.5]) {
      const e = paintedMesh(new THREE.SphereGeometry(0.33, 12, 10), toon({ color: PAL.white }), 0.03);
      e.position.set(x, 1.45, 1.22);
      e.scale.z = 0.45;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.black }));
      p.position.set(x * 0.92, 1.42, 1.38);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.08), new THREE.MeshBasicMaterial({ color: PAL.black }));
      brow.position.set(x, 1.84, 1.33);
      brow.rotation.z = x > 0 ? 0.42 : -0.42;
      this.brows.push(brow);
      this.glass.add(e, p, brow);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: PAL.black }));
    mouth.position.set(0, 0.85, 1.42);
    this.glass.add(body, shoulder, neck, band, this.ink, mouth);
    // the cork (pulled in when it defends)
    const corkBody = paintedMesh(new THREE.CylinderGeometry(0.62, 0.55, 0.7, 12), toon({ map: T('wood'), color: '#d8a070' }), 0.04);
    this.cork.add(corkBody);
    this.cork.position.y = 4.4;
    this.cork.visible = false;
    this.glass.add(this.cork);
    this.root.add(this.glass);
    this.paintAnchor = this.glass;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LINE_W, LINE_LEN).rotateX(-Math.PI / 2), this.lineMat.clone());
      m.visible = false;
      m.userData.noPaint = true;
      ctx.root.add(m);
      this.strikes.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3() });
    }
    this.blobs = new Lobbed(ctx, { color: '#e8323c', size: 0.28, splash: 1.3, damage: 1, ring: true, onLand: (at) => this.puddle(at) });
  }

  /** The hint panel line while the fight is on. */
  get counterHint(): string {
    if (this.staggerT > 0) return 'It’s DAZED — spray it anywhere, then TAG IT! (E)';
    switch (this.state) {
      case 'LINE_TELL':
      case 'LINE':
        return 'A red line is coming — JUMP it, or step off the line';
      case 'CROSS_TELL':
      case 'CROSS':
        return 'Two lines cross on you — JUMP!';
      case 'FLICK_TELL':
        return 'Ink is coming — walk out of the red rings';
      case 'ROAR':
        return 'It’s roaring — get ready';
    }
    if (this.corked) return 'It’s CORKED — paint slides off. JUMP, then press C in mid-air beside it: PAINT SLAM pops the cork!';
    return 'Spray its ink-filled mouth (the top) — and watch for the cork';
  }

  // ───────────── damage rules ─────────────
  protected override hpFloor(): number {
    return this.phase === 0 ? this.maxHp * 0.5 : 0;
  }

  protected override weakPoints(): WeakPoint[] {
    // dazed: all of it, but only for paint (a TAG lands its own big number)
    if (this.staggerT > 0 && this.lastKind === 'paint') return [{ pos: this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), radius: 3, mul: 2.2 }];
    if (this.corked) return [];
    return [{ pos: this.pos.clone().add(new THREE.Vector3(0, 2.9, 0)), radius: 1.1, mul: 1.6 }];
  }

  /** Pinned at the half-way gate: the roar wins (no TAG into a floor). */
  override get canBeTagged(): boolean {
    return super.canBeTagged && !(this.phase === 0 && this.hp <= this.maxHp * 0.5 + 0.5);
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    this.lastKind = info.kind;
    // sprayed over a barricade: the paint runs off the glass and does not wake it
    if (this.reachable && !this.reachable()) {
      this.ctx.effects.burst(info.point, '#ffffff', 2, 1.5, 0.05);
      this.onIgnored?.(info.point, 'paint', info.color); // GameSession's NotYet says why
      return { weak: false, absorbed: true };
    }
    if (!this.corked) return null;
    if (info.kind === 'stomp') {
      this.popCork(info);
      return null;
    }
    // corked: paint slides down the glass
    if (Math.random() < 0.08) {
      this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 3.6, 0)), t('CORKED!'), '#d8a070', 0.7);
      this.ctx.audio.play('denied', { pos: this.pos, vol: 0.5 });
    }
    this.ctx.effects.burst(info.point, '#ffffff', 2, 1.5, 0.05);
    if (!this.alerted) this.alert();
    return { weak: false, absorbed: true };
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: 0.8, vol: 0.6 });
  }

  protected override interrupt(): void {
    if (this.state.endsWith('_TELL')) {
      this.hideLines();
      this.attackCd = 1.6;
      this.setState('FIGHT');
    }
  }

  protected override alert(): void {
    if (this.reachable && !this.reachable()) return;
    super.alert();
    if (this.state === 'IDLE') {
      this.setState('FIGHT');
      this.attackCd = 2.5;
      this.corkT = 10;
    }
    // the wake cut-in plays once per fight: coming back to the square (or a stomp on its head) never replays it
    if (!this.woke) {
      this.woke = true;
      this.onWake?.();
    }
  }

  protected override finish(): void {
    this.hideLines();
    this.blobs.clear();
    this.corked = false;
    this.cork.visible = false;
    this.ctx.audio.play('stunSting');
    // its servant stops correcting with it (repainted, not deleted)
    if (this.helper && !this.helper.harmless && !this.helper.disposed) this.helper.debugRepaint();
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
  }

  /** WAI was smudged (Hard): phase 1, uncorked, no lines or blobs, the helper repainted; it waits in IDLE. */
  protected override restartFight(): void {
    this.hideLines();
    this.blobs.clear();
    this.phase = 0;
    this.corked = false;
    this.cork.visible = false;
    this.corkPopT = -1;
    if (this.helper && !this.helper.harmless && !this.helper.disposed) this.helper.debugRepaint();
    this.helper = null;
    this.attackCd = 2.5;
    this.corkT = 10;
    this.alerted = false;
    this.setState('IDLE');
  }

  private popCork(info: DamageInfo): void {
    this.corked = false;
    this.corkPopT = 0;
    this.corkVel.copy(info.dir).setY(0).normalize().multiplyScalar(-3).add(new THREE.Vector3(0, 9, 0));
    this.hideLines();
    this.setState('FIGHT');
    this.attackCd = DAZED + 0.8;
    this.corkT = P[this.phase].corkEvery;
    this.holdStagger(DAZED);
    this.tagSpent = false;
    const top = this.pos.clone().add(new THREE.Vector3(0, 3.3, 0));
    this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 0.8, 0)), t('POP!'), PAL.yellow, 1.1);
    this.ctx.effects.burst(top, '#e8323c', 24, 6, 0.1);
    this.ctx.audio.play('pop', { pos: top, pitch: 0.6, vol: 1 });
    this.ctx.audio.play('dizzy', { pos: top });
    this.ctx.time.hitstop(0.1);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5);
    this.ctx.events.emit('toast', { text: t('POP! The cork is out — it’s dazed. Spray it, then TAG IT!'), kind: 'good', at: this.pos });
  }

  private corkUp(): void {
    this.corked = true;
    this.corkPopT = -1;
    this.cork.visible = true;
    this.cork.position.set(0, 4.4, 0);
    this.cork.rotation.set(0, 0, 0);
    this.ctx.audio.play('stick', { pos: this.pos, pitch: 0.5, vol: 1 });
    this.ctx.audio.play('gulp', { pos: this.pos, pitch: 0.5 });
    this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), t('CORKED!'), '#d8a070', 0.9);
    if (!this.toldCork) {
      this.toldCork = true;
      this.ctx.events.emit('toast', {
        text: t('It’s CORKED — paint slides off. JUMP, then press C in mid-air beside it: PAINT SLAM pops the cork!'),
        kind: 'warn',
        at: this.pos,
        immediate: true,
      });
    }
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    this.blobs.update(dt, player);
    this.updatePuddles(dt);
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.5) this.calm();
      return;
    }
    if (this.harmless) return;
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    // on its head counts as in the square (EnemyBase bucks him off): standing there must not reset the fight
    const onTop = d < this.bodyRadius * 1.6 + 0.6 && player.pos.y > this.pos.y && player.pos.y < this.topY + 2.5;
    const valid = !player.smudged && d < LEASH && (Math.abs(player.pos.y - this.pos.y) < 3 || onTop) && (!this.reachable || this.reachable());
    if (this.state === 'IDLE') {
      if (valid && d < 15 && this.canSee(player.pos, 2.4)) this.alert();
      return;
    }
    if (!valid) {
      // WAI left the square: it waits, the fight resumes when he's back (a fresh start: uncorked)
      this.hideLines();
      this.corked = false;
      this.cork.visible = false;
      this.alerted = false;
      this.setState('IDLE');
      return;
    }
    this.faceToward(player.pos, dt, 2.5);
    const ph = P[this.phase];
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (!this.corked && this.state === 'FIGHT') {
      this.corkT -= dt;
      if (this.corkT <= 0) this.corkUp();
    }
    switch (this.state) {
      case 'FIGHT': {
        if (this.phase === 0 && this.hp <= this.maxHp * 0.5 + 0.5) {
          this.setState('ROAR');
          this.ctx.audio.play('phaseSting');
          this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.3 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.7);
          this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 4.2, 0)), t('MORE INK!'), PAL.red, 1.2);
          break;
        }
        if (this.attackCd > 0) break;
        const r = Math.random();
        if (this.phase === 1 && r < 0.4) this.tell('CROSS_TELL', player);
        else if (r < 0.55 && d < 16) this.tell('LINE_TELL', player);
        else this.tell('FLICK_TELL', player);
        break;
      }
      case 'FLICK_TELL':
        if (this.stateT > ph.tell * 0.8) {
          this.flick(player, ph.flicks);
          this.endAttack();
        }
        break;
      case 'LINE_TELL':
      case 'CROSS_TELL': {
        const k = this.stateT / (ph.tell * 1.15);
        for (const s of this.strikes) if (s.mesh.visible) (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.4 * Math.abs(Math.sin(this.stateT * (7 + k * 16)));
        if (k >= 1) {
          this.setState(this.state === 'LINE_TELL' ? 'LINE' : 'CROSS');
          this.struck = false;
          this.ctx.audio.play('stampHit', { pos: this.pos });
          this.ctx.audio.play('whoosh', { pos: this.pos, pitch: 0.7 });
        }
        break;
      }
      case 'LINE':
      case 'CROSS': {
        // the strike: solid red for a beat, then it dries away
        const k = this.stateT / 0.7;
        for (const s of this.strikes) if (s.mesh.visible) (s.mesh.material as THREE.MeshBasicMaterial).opacity = this.stateT < 0.25 ? 0.95 : Math.max(0, 0.95 * (1 - k));
        if (!this.struck && this.stateT < 0.25 && this.onLine(player)) {
          this.struck = true;
          if (player.takeHit(this.pos, 1, 6)) this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), t('CROSSED OUT!'), PAL.red, 0.8);
        }
        if (k >= 1) {
          this.hideLines();
          this.endAttack();
        }
        break;
      }
      case 'ROAR':
        if (this.stateT > 1.8) {
          this.phase = 1;
          if (!this.corked) this.corkUp();
          this.helper = this.onHelper?.() ?? null;
          this.ctx.events.emit('toast', { text: t('The Inkwell corks itself again and calls for help! PAINT SLAM the cork out.'), kind: 'warn', at: this.pos });
          this.attackCd = 1.5;
          this.setState('FIGHT');
        }
        break;
    }
    this.move(0, 0, dt);
  }

  private endAttack(): void {
    const cd = P[this.phase].cd;
    this.attackCd = cd[0] + Math.random() * (cd[1] - cd[0]);
    this.setState('FIGHT');
  }

  private tell(state: 'FLICK_TELL' | 'LINE_TELL' | 'CROSS_TELL', player: PlayerController): void {
    this.setState(state);
    this.ctx.audio.play('telegraph', { pos: this.pos, pitch: state === 'FLICK_TELL' ? 1.2 : 0.8 });
    if (state === 'FLICK_TELL') return;
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const dir = toP.lengthSq() > 0.01 ? toP.normalize() : this.forward();
    if (state === 'LINE_TELL') {
      // through the Inkwell, past WAI
      this.placeLine(this.strikes[0], this.pos.clone().addScaledVector(dir, LINE_LEN / 2 - 1.5), dir);
    } else {
      // an X centred on WAI, its arms diagonal to the Inkwell's line of sight
      for (const [i, a] of [[0, Math.PI / 4], [1, -Math.PI / 4]] as [number, number][]) this.placeLine(this.strikes[i], player.pos.clone(), dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a));
    }
  }

  private placeLine(s: Strike, centre: THREE.Vector3, dir: THREE.Vector3): void {
    s.from.copy(centre).setY(this.pos.y);
    s.dir.copy(dir);
    s.mesh.visible = true;
    s.mesh.position.copy(s.from).setY(this.pos.y + 0.06);
    s.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.2;
  }

  private onLine(player: PlayerController): boolean {
    // airborne (jumped, hovering) = safe; so is standing on something above the square floor
    if (!player.grounded || player.pos.y > this.pos.y + 0.5) return false;
    for (const s of this.strikes) {
      if (!s.mesh.visible) continue;
      const rel = player.pos.clone().sub(s.from).setY(0);
      const along = rel.dot(s.dir);
      const across = Math.abs(rel.x * s.dir.z - rel.z * s.dir.x);
      if (Math.abs(along) < LINE_LEN / 2 && across < LINE_W / 2 + 0.3) return true;
    }
    return false;
  }

  private hideLines(): void {
    for (const s of this.strikes) s.mesh.visible = false;
  }

  private flick(player: PlayerController, n: number): void {
    const from = this.pos.clone().add(new THREE.Vector3(0, 3.1, 0));
    for (let i = 0; i < n; i++) {
      const to = player.pos.clone();
      if (i > 0) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const r = 2 + Math.random() * 1.8;
        to.add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      to.y = this.pos.y;
      this.blobs.launch(from, to, 1.0 + i * 0.08);
    }
    this.ctx.audio.play('spit', { pos: from, pitch: 0.7, vol: 1 });
    this.ctx.effects.burst(from, '#e8323c', 14, 4);
  }

  private puddle(at: THREE.Vector3): void {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c0182a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.position.copy(at).add(new THREE.Vector3(0, 0.04, 0));
    m.userData.noPaint = true;
    this.ctx.root.add(m);
    this.puddles.push({ m, t: 0 });
  }

  private updatePuddles(dt: number): void {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t += dt;
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, 1 - p.t / 2.5);
      if (p.t > 2.5) {
        p.m.removeFromParent();
        p.m.geometry.dispose();
        (p.m.material as THREE.Material).dispose();
        this.puddles.splice(i, 1);
      }
    }
  }

  // ───────────── look ─────────────
  protected animate(dt: number): void {
    this.wob += dt;
    const ph = P[this.phase];
    let lean = 0;
    let slosh = Math.sin(this.wob * 2) * 0.03;
    if (this.state === 'FLICK_TELL') lean = -0.22 * Math.min(1, this.stateT / (ph.tell * 0.6)); // rears back
    if (this.state === 'LINE_TELL' || this.state === 'CROSS_TELL') slosh = Math.sin(this.wob * 30) * 0.05;
    if (this.state === 'ROAR') slosh = Math.sin(this.wob * 40) * 0.09;
    this.glass.rotation.x = THREE.MathUtils.lerp(this.glass.rotation.x, lean, Math.min(1, dt * 10));
    this.glass.rotation.z = slosh;
    this.ink.position.y = 2.86 + Math.sin(this.wob * 3) * 0.04;
    for (const b of this.brows) b.position.y = 1.84 - (this.state === 'ROAR' || this.state.endsWith('_TELL') ? 0.08 : 0);
    // the cork: sits in the neck when corked, flies off (spinning) when popped
    if (this.corked) this.cork.position.y = THREE.MathUtils.lerp(this.cork.position.y, 2.95, Math.min(1, dt * 12));
    else if (this.corkPopT >= 0 && this.corkPopT < 1.4) {
      this.corkPopT += dt;
      this.corkVel.y -= 20 * dt;
      this.cork.position.addScaledVector(this.corkVel, dt);
      this.cork.rotation.x += dt * 12;
      if (this.corkPopT >= 1.4) this.cork.visible = false;
    }
    this.glassMat.emissive.setRGB(this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0);
  }

  override dispose(): void {
    this.blobs.clear();
    for (const s of this.strikes) s.mesh.removeFromParent();
    for (const p of this.puddles) p.m.removeFromParent();
    this.puddles = [];
    super.dispose();
  }
}
