/**
 * [INPUT]: depends on EnemyBase (weak points, `teaching`) from ./EnemyBase; EyeVisual from hosts/OrganVisuals; toon/paintedMesh
 * [OUTPUT]: exports the PeepingLamp creature (kind 'lamp'): a lamp post whose eye sweeps a beam; drops the EYE sticker
 * [POS]: 第一关的眼睛教学敌人及屋顶小头目。攻击被打断或结束时同时关闭蓄力与光束音效。
 *        and the rooftop mini-boss that summons grubs (onSummon). Level 2 reuses the tutorial lamp.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo } from '../combat/Damage';
import { EyeVisual } from '../hosts/OrganVisuals';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';


/**
 * Peeping Lamp (mini-boss): a crooked 5 m street lamp whose head is a giant
 * corrupted eye. It sweeps an ink BEAM across the roof (hide behind cover or
 * jump the low sweep), summons grubs, and gets exhausted after each sweep —
 * paint the pupil then. Drops the EYE organ.
 */
export class PeepingLamp extends EnemyBase {
  readonly kind = 'lamp';
  readonly displayName = 'Peeping Lamp';
  readonly bigness = 0.9;
  override readonly drops: 'EYE' | null;
  /** Gentle first-encounter version (near spawn): slow beam, no summons. */
  readonly tutorial: boolean;
  private head = new THREE.Group();
  private eye: EyeVisual;
  private postMat: THREE.MeshToonMaterial;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private eraseT = 0;
  private aimLine: THREE.Mesh;
  private sweepFrom = 0;
  private sweepTo = 0;
  private beamYaw = 0;
  private beamPitchTarget = new THREE.Vector3();
  private attackCd = 2;
  private summonCd = 9;
  private beamHitCd = 0;
  /** Session hook: spawn grubs at this position. */
  onSummon: ((p: THREE.Vector3) => void) | null = null;
  private headYaw = 0;
  /** Height of the eye above the base (depends on the post model). */
  private EYE_H = 4.7;

  private bulb: THREE.PointLight | null = null;
  private tmpBulb = new THREE.Vector3();
  constructor(ctx: GameContext, id: string, start: THREE.Vector3, opts: { tutorial?: boolean; drops?: 'EYE' | null } = {}) {
    super(ctx, id, start, opts.tutorial ? 380 : 620, 0.45, 2.1);
    this.tutorial = !!opts.tutorial;
    this.teaching = this.tutorial;
    this.drops = opts.drops === undefined ? 'EYE' : opts.drops;
    if (this.tutorial) {
      this.attackCd = 4;
      this.summonCd = Infinity;
    }
    this.postMat = toon({ map: ctx.assets.tex('metal_dark') });
    const post = ctx.assets.instantiateModel('lampPost');
    if (post) {
      this.root.add(post);
      // the eyeball IS the bulb: it sits inside the lantern cage and peeks out through the bars
      this.EYE_H = 3.45;
    }
    else {
      const base = paintedMesh(new THREE.CylinderGeometry(0.55, 0.75, 0.7, 10), toon({ color: PAL.orange }), 0.04);
      base.position.y = 0.35;
      const pole = paintedMesh(new THREE.CylinderGeometry(0.17, 0.26, 4.0, 10), this.postMat, 0.04);
      pole.position.y = 2.6;
      pole.rotation.z = 0.06;
      const arm = paintedMesh(new THREE.TorusGeometry(0.6, 0.1, 6, 12, Math.PI), this.postMat, 0.03);
      arm.position.set(0.55, 4.5, 0);
      this.root.add(base, pole, arm);
      // graffiti crown on the base
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), toon({ color: PAL.yellow }));
      crown.position.set(0, 0.85, 0.6);
      this.root.add(crown);
    }
    this.eye = new EyeVisual(1.25, true);
    const eyeModel = ctx.assets.instantiateModel('lampEye');
    if (eyeModel) {
      // smaller, centred in the cage, iris facing out (+Z)
      eyeModel.scale.multiplyScalar(0.62);
      eyeModel.rotation.y = Math.PI;
      eyeModel.position.y = -0.45;
      this.head.add(eyeModel);
    } else this.head.add(this.eye.root);
    // a warm bulb glow behind the eye (a lamp, after all)
    const bulb = new THREE.PointLight('#ffd27a', 1.6, 6);
    bulb.position.set(0, 0, -0.35);
    this.head.add(bulb);
    this.bulb = bulb;
    if (!post) {
      const hood = paintedMesh(new THREE.ConeGeometry(0.95, 0.6, 10, 1, true), this.postMat, 0.04);
      (hood.material as THREE.Material).side = THREE.DoubleSide;
      hood.position.y = 0.75;
      this.head.add(hood);
    }
    this.head.position.set(0, this.EYE_H, 0);
    this.root.add(this.head);
    this.paintAnchor = this.head;

    // THE ERASE BEAM: a soft pink-white rubbing light that scrolls like an eraser stroke
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLen: { value: 10 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uLen; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main(){
          float edge = pow(abs(dot(vN, vV)), 1.6);              // soft rim, bright core
          float along = vUv.y * uLen;
          // rubbing strokes travelling down the beam + crumbly breakup
          float strokes = 0.55 + 0.45 * sin(along * 2.2 - uTime * 14.0 + sin(vUv.x * 18.0) * 1.5);
          float crumbs = step(0.72, h(floor(vec2(vUv.x * 24.0, along * 6.0 - uTime * 18.0))));
          float a = edge * (0.35 + 0.5 * strokes) + crumbs * edge * 0.5;
          vec3 col = mix(vec3(1.0, 0.62, 0.8), vec3(1.0, 0.97, 0.92), strokes);
          gl_FragColor = vec4(col * a, a);
        }`,
    }) as unknown as THREE.MeshBasicMaterial;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1, 18, 1, true), this.beamMat);
    this.beam.visible = false;
    ctx.root.add(this.beam);
    this.aimLine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0.6 }));
    this.aimLine.visible = false;
    ctx.root.add(this.aimLine);
  }

  private eyeWorld(): THREE.Vector3 {
    return this.pos.clone().add(new THREE.Vector3(0, this.EYE_H, 0));
  }

  protected override weakPoints(): WeakPoint[] {
    const fwd = new THREE.Vector3(Math.sin(this.headYaw), 0, Math.cos(this.headYaw));
    const pupil = this.eyeWorld().addScaledVector(fwd, 0.5);
    return [{ pos: pupil, radius: 0.6, mul: this.state === 'TIRED' ? 3 : 1.4 }];
  }

  protected override onHit(info: DamageInfo, weak: boolean): void {
    if (weak) {
      this.eye.blink();
      this.ctx.audio.play('blinkBig', { pos: info.point });
    }
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('WATCH');
  }

  private clearAttack(): void {
    this.beam.visible = false;
    this.aimLine.visible = false;
    this.ctx.audio.loop(this.id + '-charge', false, 'charge');
    this.ctx.audio.loop(this.id, false, 'beam');
  }

  protected override finish(): void {
    this.clearAttack();
    this.ctx.audio.play('stunSting');
    this.ctx.audio.play('crash', { pos: this.pos });
    this.ctx.effects.burst(this.eyeWorld(), '#b23cff', 30, 6, 0.12);
    this.ctx.time.slowmo(0.3, 0.6);
    // the eye pops out (dropped organ takes over). The bulb light must stay in the scene:
    // hiding it changes the light count and every material recompiles its shaders (a 200 ms hitch)
    if (this.bulb) {
      this.bulb.getWorldPosition(this.tmpBulb);
      this.root.worldToLocal(this.tmpBulb);
      this.root.add(this.bulb);
      this.bulb.position.copy(this.tmpBulb);
      this.bulb.intensity = 0.5; // a dim glow left in the empty lantern
    }
    this.head.visible = false;
    super.finish();
  }

  calm(): void {
    this.clearAttack();
    this.setState('CALM');
    this.postMat.color.set('#bfe6ee');
  }

  protected override interrupt(): void {
    if (this.state !== 'AIM' && this.state !== 'BEAM') return;
    // knocked out of its stare: beam cut, it blinks dizzily (TIRED = open to paint)
    this.clearAttack();
    this.setState('TIRED');
  }

  protected ai(dt: number, player: PlayerController): void {
    if (this.harmless) return;
    const eye = this.eyeWorld();
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && player.pos.y > this.pos.y - 1.5;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.summonCd = Math.max(0, this.summonCd - dt);
    this.beamHitCd = Math.max(0, this.beamHitCd - dt);
    const wantYaw = Math.atan2(toP.x, toP.z);

    switch (this.state) {
      case 'IDLE': {
        this.headYaw += dt * 0.4;
        if (valid && d < 24 && this.lineOfSight(eye, player)) this.alert();
        break;
      }
      case 'WATCH': {
        this.turnHead(wantYaw, dt, 2.5);
        if (!valid || d > 30) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        if (this.summonCd <= 0 && !this.tutorial) {
          this.summonCd = 14;
          this.onSummon?.(this.pos.clone().add(new THREE.Vector3(1.2, 0, 1.2)));
          this.onSummon?.(this.pos.clone().add(new THREE.Vector3(-1.2, 0, 1.2)));
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 0.7 });
        }
        if (this.attackCd <= 0 && this.lineOfSight(eye, player)) {
          this.setState('AIM');
          this.ctx.audio.play('telegraph', { pos: this.pos });
          this.ctx.audio.loop(this.id + '-charge', true, 'charge', 0.6);
        }
        break;
      }
      case 'AIM': {
        this.turnHead(wantYaw, dt, 3);
        this.beamPitchTarget.copy(player.pos);
        this.aimLine.visible = true;
        this.placeCylinder(this.aimLine, eye, player.pos.clone().add(new THREE.Vector3(0, 0.3, 0)));
        if (this.stateT > (this.tutorial ? 1.6 : 1.0)) {
          this.ctx.audio.loop(this.id + '-charge', false, 'charge');
          this.aimLine.visible = false;
          // sweep across the player from one side to the other
          const dir = Math.random() < 0.5 ? 1 : -1;
          this.sweepFrom = wantYaw - dir * 0.75;
          this.sweepTo = wantYaw + dir * 0.75;
          this.beamYaw = this.sweepFrom;
          this.setState('BEAM');
          this.ctx.audio.loop(this.id, true, 'beam', 0.6);
        }
        break;
      }
      case 'BEAM': {
        const k = Math.min(1, this.stateT / (this.tutorial ? 3.2 : 2.2));
        this.beamYaw = THREE.MathUtils.lerp(this.sweepFrom, this.sweepTo, k);
        this.headYaw = this.beamYaw;
        // beam: from the eye down to a point at the player's distance on the roof
        // aim through WAI's body height at his distance (then on into the roof behind)
        const reach = Math.max(3, d);
        // it rubs along the ground at shin height: JUMP over it (or hide, or dodge through)
        const bodyY = player.pos.y + 0.25;
        const target = new THREE.Vector3(this.pos.x + Math.sin(this.beamYaw) * reach, bodyY, this.pos.z + Math.cos(this.beamYaw) * reach);
        const dir = target.clone().sub(eye).normalize();
        const hit = this.ctx.physics.raycast(eye, dir, 40, (c) => {
          const tag = this.ctx.physics.tagOf(c);
          return tag === 'static' || tag === 'host' || tag === 'undrawn' || c.handle === player.collider.handle;
        });
        const end = hit ? hit.point : eye.clone().addScaledVector(dir, 40);
        this.beam.visible = true;
        this.placeCylinder(this.beam, eye, end);
        if (hit && hit.collider.handle === player.collider.handle && this.beamHitCd <= 0) {
          if (player.takeHit(eye, this.tutorial ? 1 : 2, 10)) this.beamHitCd = 0.8;
        }
        // where it touches, the world is ERASED back to blank canvas (your paint too)
        const bm = this.beamMat as unknown as THREE.ShaderMaterial;
        bm.uniforms.uTime.value += 1 / 60;
        bm.uniforms.uLen.value = eye.distanceTo(end);
        this.eraseT -= 1 / 60;
        if (hit && this.eraseT <= 0) {
          // throttled: a few erase stamps per second is plenty to read as a rubbing stroke
          this.eraseT = 0.12;
          this.ctx.effects.eraseNear(end, 1.0);
          if (Math.random() < 0.5) this.ctx.effects.splat(end, hit.normal, '#f3ece4', 0.55, dir, { drip: 0 });
        }
        if (hit && Math.random() < 0.3) this.ctx.effects.burst(end, Math.random() < 0.5 ? '#ffc6dc' : '#fff4ea', 1, 2.2, 0.05, 10);
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.05);
        if (k >= 1) {
          this.clearAttack();
          this.setState('TIRED');
          this.ctx.events.emit('toast', { text: 'The lamp is exhausted — paint its pupil!', kind: 'good', at: this.pos });
        }
        break;
      }
      case 'TIRED': {
        if (this.stateT > (this.tutorial ? 3.4 : 2.6)) {
          this.attackCd = this.tutorial ? 4 : 2.5;
          this.setState('WATCH');
        }
        break;
      }
    }
    // stationary (it is bolted to the roof); keep the body scheduled
    this.move(0, 0, dt);
  }

  private turnHead(want: number, dt: number, rate: number): void {
    let d = want - this.headYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.headYaw += d * Math.min(1, dt * rate);
  }

  private lineOfSight(eye: THREE.Vector3, player: PlayerController): boolean {
    const to = player.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    const dir = to.clone().sub(eye);
    const d = dir.length();
    return !this.ctx.physics.raycast(eye, dir.normalize(), d, (c) => this.ctx.physics.tagOf(c) === 'static' || this.ctx.physics.tagOf(c) === 'host');
  }

  private placeCylinder(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    m.position.copy(mid);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }

  protected animate(dt: number): void {
    this.head.rotation.y = this.headYaw - this.root.rotation.y;
    const sleepy = this.state === 'TIRED' ? 0.55 : this.harmless ? 1 : 0;
    this.eye.update(dt, sleepy);
    this.head.rotation.x = this.state === 'TIRED' ? 0.35 : this.state === 'BEAM' ? 0.25 : 0;
    this.postMat.emissive.setRGB(this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0);
    const pulse = this.state === 'AIM' ? 0.5 + Math.sin(performance.now() / 50) * 0.5 : 0;
    this.head.scale.setScalar(1 + pulse * 0.08);
  }

  override dispose(): void {
    this.clearAttack();
    this.ctx.root.remove(this.beam, this.aimLine);
    super.dispose();
  }
}
