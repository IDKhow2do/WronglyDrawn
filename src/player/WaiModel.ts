/**
 * [INPUT]: depends on PAL from render/PaintTextures; paintedMesh/toon/wonkyBox from render/Materials; AssetManager (the 'wai' model + clips)
 * [OUTPUT]: exports WaiModel (root, anchors, setWorn, setFlash, ghost, update), WaiAction, WaiAnimInput
 * [POS]: WAI's view, fed by PlayerController every frame (gameplay never reads it). The rigged Tripo WAI (public/models/wai2.glb:
 *        idle walk run jump shoot hurt dodge fall) plays clips through a mixer with a procedural squash / lean layer on top;
 *        without the GLB a procedural body stands in. The souls fight's actions (stagger, knockdown → get-up, heavy landing,
 *        pant, the honest-i-frame ghost) are clips + procedural poses here, played through PlayerController.playAction.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import { PAL } from '../render/PaintTextures';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import type { AssetManager } from '../core/AssetManager';

export type WaiAction = 'none' | 'attack' | 'hurt' | 'pickup' | 'purify' | 'attach' | 'recall' | 'dodge' | 'chomp' | 'throw' | 'stagger' | 'knockdown' | 'land' | 'pant';

export interface WaiAnimInput {
  speed: number; // 0..1 (1 = sprint)
  grounded: boolean;
  vy: number;
  action: WaiAction;
  actionT: number; // seconds since action started
  justLanded: boolean;
  aim: number; // 0..1 first-person blend
  longLegs: boolean;
}

/**
 * Purely visual WAI. Gameplay never reads from this object; the controller
 * pushes an animation input each frame. A GLB from the manifest replaces the
 * procedural body while keeping root/bob/squash animation.
 */
export class WaiModel {
  readonly root = new THREE.Group();
  readonly holdAnchor = new THREE.Object3D();
  readonly handAnchor = new THREE.Object3D();
  private hips = new THREE.Group();
  private body = new THREE.Group();
  private eye = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private bodyMat: THREE.MeshToonMaterial;
  private phase = 0;
  private time = 0;
  private squash = 0;
  private eyeTarget = new THREE.Vector2();
  private eyeCur = new THREE.Vector2();
  private eyeTimer = 0;
  private blink = 0;
  private teeth: THREE.Mesh[] = [];
  private irisMat: THREE.MeshToonMaterial | null = null;
  private legMat: THREE.MeshToonMaterial | null = null;
  private legScale = 1;
  readonly gunSocket = new THREE.Object3D();
  /** Follows the body's lean/squash; same frame as root when neutral (the cape pins here). */
  readonly capeAnchor = new THREE.Object3D();
  private gltf: THREE.Object3D | null = null;
  private gltfMats: THREE.MeshStandardMaterial[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  gunInBone = false;
  /** 0..1 white "ghost" glow: the dodge's invulnerable instant (souls fight only; set every frame). */
  ghost = 0;
  private hipBone: THREE.Object3D | null = null;
  private hipRest = new THREE.Quaternion();

  private playClip(name: string, fade = 0.18): void {
    if (name === this.current) return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next) return;
    const prev = this.actions.get(this.current);
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (name === 'jump') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.timeScale = 1.8;
    }
    if (name === 'fall' || name === 'hurt') {
      // one-shots of the souls fight: knocked flat (fall), a reeling stagger (hurt: its first second)
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.timeScale = name === 'fall' ? 1.9 : 1.6;
    }
    prev?.fadeOut(fade);
    this.current = name;
  }

  constructor(assets: AssetManager) {
    this.root.userData.noPaint = true;
    this.bodyMat = toon({ map: assets.tex('wai_body') });
    this.root.name = 'WAI';
    this.root.add(this.hips);
    this.hips.position.y = 0.3;
    this.hips.add(this.body);
    this.capeAnchor.position.y = -0.3;
    this.body.add(this.capeAnchor);

    const override = assets.instantiateModel('wai');
    if (override) {
      // sculpted WAI (Tripo). Rigged clips drive the limbs; the procedural layer
      // still adds squash/stretch, lean and hit shake on top.
      override.position.y = -0.3;
      this.body.add(override);
      this.gltf = override;
      this.body.add(this.holdAnchor);
      this.holdAnchor.position.set(0, 1.05, 0);
      const clips = (override.userData.clips as THREE.AnimationClip[]) ?? [];
      if (clips.length) {
        this.mixer = new THREE.AnimationMixer(override.userData.inner as THREE.Object3D);
        for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
        this.playClip('idle');
      }
      // the cape follows the CHEST bone (the rigged clips move the torso around the root)
      let chest: THREE.Object3D | null = null;
      override.traverse((o) => {
        if (!(o as THREE.Bone).isBone) return;
        const n = o.name.toLowerCase();
        if (/spine0?2|chest|upperchest/.test(n)) chest = o;
        else if (!chest && /spine/.test(n)) chest = o;
      });
      if (chest) {
        this.root.updateMatrixWorld(true);
        (chest as THREE.Object3D).attach(this.capeAnchor); // keeps today's world transform, then rides the bone
      }
      // find the right hand bone for the gun
      let hand: THREE.Object3D | null = null;
      override.traverse((o) => {
        const n = o.name.toLowerCase();
        if (!hand && (o as THREE.Bone).isBone && n.includes('hand') && (n.includes('r') && (n.includes('right') || n.endsWith('_r') || n.includes('.r') || n.includes('r_') || n.includes('_r')))) hand = o;
      });
      override.traverse((o) => {
        if (!this.hipBone && (o as THREE.Bone).isBone && /^hip/i.test(o.name)) {
          this.hipBone = o;
          this.hipRest.copy(o.quaternion);
        }
      });
      if (hand) {
        (hand as THREE.Object3D).add(this.gunSocket);
        this.gunSocket.rotation.set(0, 0, 0);
        // mitten centre (v2 measured ≈8 cm from the wrist joint)
        this.gunSocket.position.set(-0.03, 0.031, -0.075);
        this.gunInBone = true;
      } else {
        this.gunSocket.position.set(0.32, 0.38, 0.18);
        this.body.add(this.gunSocket);
      }
      this.handAnchor.position.set(0.3, 0.4, 0.2);
      this.body.add(this.handAnchor);
      override.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) this.gltfMats.push(...(Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]);
      });
      return;
    }

    // --- torso (asymmetrical painted block) ---
    const torso = paintedMesh(wonkyBox(0.62, 0.6, 0.46, 0.08, 7, 0.06), this.bodyMat, 0.03);
    torso.position.y = 0.3;
    this.body.add(torso);

    // --- one oversized eye ---
    this.eye.position.set(0.07, 0.43, 0.2);
    const white = paintedMesh(new THREE.SphereGeometry(0.2, 20, 14), toon({ color: PAL.white }), 0.025);
    white.scale.set(1, 1, 0.75);
    this.eye.add(white);
    this.irisMat = toon({ color: '#3a2a1e' });
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), this.irisMat);
    iris.scale.set(1, 1, 0.4);
    iris.position.z = 0.135;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: PAL.black }));
    pupil.scale.set(1, 1, 0.4);
    pupil.position.z = 0.165;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(-0.03, 0.03, 0.18);
    const pupilGroup = new THREE.Group();
    pupilGroup.name = 'pupil';
    pupilGroup.add(iris, pupil, glint);
    this.eye.add(pupilGroup);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: PAL.orange }));
    lid.name = 'lid';
    lid.scale.set(1, 0.05, 0.78);
    lid.position.y = 0.02;
    this.eye.add(lid);
    this.body.add(this.eye);

    // --- spiral ear ---
    const ear = paintedMesh(new THREE.TorusGeometry(0.1, 0.045, 8, 16), toon({ color: PAL.pink }), 0.015);
    ear.position.set(-0.35, 0.36, 0);
    ear.rotation.y = Math.PI / 2;
    const earIn = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), toon({ color: '#c7266f' }));
    earIn.position.set(-0.36, 0.36, 0);
    earIn.rotation.y = -Math.PI / 2;
    this.body.add(ear, earIn);

    // --- crooked crown ---
    const crown = new THREE.Group();
    const yellow = toon({ color: PAL.yellow });
    const band = paintedMesh(new THREE.CylinderGeometry(0.17, 0.16, 0.08, 10, 1, true), yellow, 0.015);
    (band.material as THREE.Material).side = THREE.DoubleSide;
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = paintedMesh(new THREE.ConeGeometry(0.05, 0.13 + (i % 2) * 0.05, 4), yellow, 0.012);
      spike.position.set(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
      spike.rotation.z = Math.cos(a) * -0.2;
      spike.rotation.x = Math.sin(a) * 0.2;
      crown.add(spike);
    }
    crown.position.set(-0.04, 0.66, -0.02);
    crown.rotation.z = 0.28;
    crown.rotation.x = -0.1;
    this.body.add(crown);

    // --- jagged teeth ---
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), new THREE.MeshBasicMaterial({ color: PAL.black }));
    mouth.position.set(0.0, 0.13, 0.236);
    this.body.add(mouth);
    const toothMat = toon({ color: PAL.cream });
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 3), toothMat);
      this.teeth.push(t);
      t.position.set(-0.18 + i * 0.06, 0.155, 0.245);
      t.rotation.z = Math.PI;
      this.body.add(t);
      if (i < 6) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.055, 3), toothMat);
        b.position.set(-0.15 + i * 0.06, 0.1, 0.245);
        this.body.add(b);
      }
    }

    // --- short arms ---
    const mkArm = (g: THREE.Group, x: number, color: string) => {
      g.position.set(x, 0.33, 0);
      const upper = paintedMesh(new THREE.CylinderGeometry(0.05, 0.045, 0.22, 8), toon({ color }), 0.015);
      upper.position.y = -0.1;
      const hand = paintedMesh(new THREE.SphereGeometry(0.075, 10, 8), toon({ color: PAL.pink }), 0.015);
      hand.position.y = -0.23;
      g.add(upper, hand);
      g.rotation.z = x > 0 ? 0.35 : -0.35;
      this.body.add(g);
    };
    mkArm(this.armL, -0.34, PAL.pink);
    mkArm(this.armR, 0.34, PAL.orange);
    this.handAnchor.position.set(0, -0.25, 0.05);
    this.armR.add(this.handAnchor);
    // gun held in the right mitten, barrel pointing forward when the arm is raised
    this.gunSocket.position.set(0, -0.24, 0.06);
    this.gunSocket.rotation.x = Math.PI / 2;
    this.armR.add(this.gunSocket);

    // --- short legs ---
    this.legMat = toon({ color: '#3b4fb8' });
    const mkLeg = (g: THREE.Group, x: number) => {
      g.position.set(x, 0, 0);
      const leg = paintedMesh(new THREE.CylinderGeometry(0.065, 0.06, 0.22, 8), this.legMat!, 0.015);

      leg.position.y = -0.1;
      const boot = paintedMesh(wonkyBox(0.15, 0.1, 0.2, 0.1, x > 0 ? 3 : 5), toon({ color: '#5a3424' }), 0.015);
      boot.position.set(0, -0.25, 0.03);
      g.add(leg, boot);
      this.hips.add(g);
    };
    mkLeg(this.legL, -0.15);
    mkLeg(this.legR, 0.15);

    this.holdAnchor.position.set(0, 1.0, 0);
    this.hips.add(this.holdAnchor);
  }

  /** Visual feedback for worn organs. */
  setWorn(w: { eye: boolean; mouth: boolean; leg: boolean }): void {
    this.irisMat?.color.set(w.eye ? '#ffb000' : '#3a2a1e');
    this.irisMat?.emissive.set(w.eye ? '#553300' : '#000000');
    for (const t of this.teeth) {
      (t.material as THREE.MeshToonMaterial).color.set(w.mouth ? '#ffd6ec' : '#f6e8d0');
      t.scale.setScalar(w.mouth ? 1.35 : 1);
    }
    this.legMat?.color.set(w.leg ? '#ff7a1a' : '#3b4fb8');
    this.legScale = w.leg ? 1.35 : 1;
  }

  /** Red flash used for damage feedback. */
  setFlash(amount: number): void {
    this.bodyMat.emissive.setRGB(amount * 0.9, amount * 0.1, amount * 0.1);
    for (const m of this.gltfMats) m.emissive?.setRGB(amount * 0.8, amount * 0.1, amount * 0.1);
  }

  /**
   * Souls-fight poses on top of the clip (both bodies): a reeling stagger, knocked flat and getting up, a heavy
   * landing crouch, panting when out of breath. Returns the squash to add; `lean` adds body pitch / roll.
   */
  private soulsPose(a: WaiAnimInput, lean: (pitch: number, roll: number) => void): number {
    const k = a.actionT;
    switch (a.action) {
      case 'stagger': {
        const e = Math.max(0, 1 - k / 0.5);
        lean(-0.35 * Math.sin(Math.min(1, k / 0.12) * Math.PI * 0.5) * e, Math.sin(k * 30) * 0.12 * e);
        return -0.06 * e;
      }
      case 'knockdown': {
        // flat on the back by 0.25 s, lie there, push up from 0.7 s (the get-up the lock covers)
        const down = Math.min(1, k / 0.25);
        const up = THREE.MathUtils.clamp((k - 0.7) / 0.4, 0, 1);
        const flat = down * (1 - up);
        lean(-1.35 * flat * (this.gltf && this.actions.has('fall') ? 0.25 : 1), Math.sin(k * 9) * 0.05 * flat);
        return -0.25 * flat + 0.08 * Math.sin(up * Math.PI);
      }
      case 'land': {
        const e = Math.sin(Math.min(1, k / 0.3) * Math.PI);
        lean(0.25 * e, 0);
        return -0.22 * e;
      }
      case 'pant':
        lean(0.18 + Math.sin(k * 14) * 0.04, 0);
        return Math.sin(k * 14) * 0.04;
    }
    return 0;
  }

  update(dt: number, a: WaiAnimInput): void {
    this.time += dt;
    const t = this.time;
    if (this.gltf) {
      if (this.gunInBone && this.gunSocket.parent && !this.gunSocket.userData.scaled) {
        this.root.updateMatrixWorld(true);
        // the bone's scale relative to WAI's root (NOT world scale: the intro holds the root at
        // 0.001 until the pencil draws him, and latching that made the can 1000× too big on replays)
        const ws = this.gunSocket.parent.getWorldScale(new THREE.Vector3());
        const rs = this.root.getWorldScale(new THREE.Vector3());
        this.gunSocket.scale.setScalar(1 / Math.max(1e-4, ws.x / Math.max(1e-6, rs.x)));
        this.gunSocket.userData.scaled = true;
      }
      // clip selection from gameplay state
      if (this.mixer) {
        const special = a.action === 'knockdown' && this.actions.has('fall') ? 'fall' : a.action === 'stagger' && this.actions.has('hurt') ? 'hurt' : '';
        const clip = special || (!a.grounded ? 'jump' : a.action === 'attack' || a.aim > 0.3 ? (a.speed > 0.08 ? 'walk' : 'idle') : a.speed > 0.62 ? 'run' : a.speed > 0.06 ? 'walk' : 'idle');
        this.playClip(clip);
        const w = this.actions.get('walk');
        if (w) w.timeScale = 0.8 + a.speed * 1.4;
        this.mixer.update(dt);
        // the v2 run clip pitches the rigid box ~40° forward from the Hip: damp it to a lean
        if (this.hipBone && this.current === 'run') this.hipBone.quaternion.slerp(this.hipRest, 0.55);
      }
      if (a.justLanded) this.squash = 1;
      this.squash = Math.max(0, this.squash - dt * 6);
      let sy = 1 - this.squash * 0.15;
      let roll = 0;
      let pitch = a.grounded ? a.speed * 0.08 : 0;
      if (a.action === 'hurt') roll = Math.sin(a.actionT * 50) * 0.2 * Math.max(0, 1 - a.actionT / 0.4);
      if (a.action === 'dodge') pitch += Math.min(1, a.actionT / 0.42) * Math.PI * 2;
      if (a.action === 'chomp') sy += 0.1 * Math.sin(Math.min(1, a.actionT / 0.3) * Math.PI);
      sy += this.soulsPose(a, (p, r) => {
        pitch += p;
        roll += r;
      });
      for (const m of this.gltfMats) if (this.ghost > 0.01) m.emissive?.setRGB(0.55 * this.ghost, 0.85 * this.ghost, 0.9 * this.ghost);
      if (!a.grounded) sy = 1 + THREE.MathUtils.clamp(a.vy * 0.02, -0.08, 0.1);
      this.hips.position.y = 0.3;
      this.body.rotation.set(pitch, 0, roll);
      this.body.scale.set(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5);
      return;
    }
    if (a.justLanded) this.squash = 1;
    this.squash = Math.max(0, this.squash - dt * 6);

    // locomotion
    const moving = a.grounded && a.speed > 0.05;
    this.phase += dt * (moving ? 7 + a.speed * 7 : 0);
    const swing = moving ? Math.sin(this.phase) * (0.55 + a.speed * 0.35) : 0;
    let legL = swing;
    let legR = -swing;
    let armLx = -swing * 0.8;
    let armRx = swing * 0.8;
    let armLz = -0.35;
    let armRz = 0.35;
    let bodyPitch = moving ? a.speed * 0.18 : 0;
    let bodyRoll = moving ? Math.sin(this.phase) * 0.05 : Math.sin(t * 1.3) * 0.015;
    let bob = moving ? Math.abs(Math.sin(this.phase)) * 0.05 : 0;
    let sy = 1 + Math.sin(t * 2.2) * 0.02; // breathing

    if (!a.grounded) {
      legL = -0.6;
      legR = 0.3;
      armLz = -1.2;
      armRz = 1.2;
      armLx = armRx = 0;
      sy = 1 + THREE.MathUtils.clamp(a.vy * 0.025, -0.12, 0.15);
    }
    sy -= this.squash * 0.18;

    // one-shot actions
    const k = a.actionT;
    switch (a.action) {
      case 'attack': {
        const p = Math.min(1, k / 0.12);
        const back = Math.max(0, (k - 0.12) / 0.2);
        armRx = -1.7 * p * (1 - Math.min(1, back));
        armRz = 0.1;
        bodyRoll -= 0.06 * p;
        break;
      }
      case 'hurt': {
        bodyRoll += Math.sin(k * 50) * 0.2 * Math.max(0, 1 - k / 0.4);
        sy -= 0.1 * Math.max(0, 1 - k / 0.3);
        break;
      }
      case 'pickup': {
        const p = Math.sin(Math.min(1, k / 0.45) * Math.PI);
        bodyPitch += 0.6 * p;
        armLx = armRx = -0.9 * p;
        sy -= 0.12 * p;
        break;
      }
      case 'purify': {
        armLz = -2.6;
        armRz = 2.6;
        armLx = armRx = 0;
        bodyRoll += Math.sin(k * 30) * 0.04;
        bob += 0.03 + Math.sin(k * 8) * 0.02;
        break;
      }
      case 'dodge': {
        const p = Math.min(1, k / 0.42);
        bodyPitch += p * Math.PI * 2; // forward roll
        sy -= 0.15;
        armLz = -1.2;
        armRz = 1.2;
        break;
      }
      case 'chomp': {
        const p = Math.sin(Math.min(1, k / 0.3) * Math.PI);
        bodyPitch += 0.45 * p;
        sy += 0.12 * p;
        break;
      }
      case 'throw': {
        const p = Math.min(1, k / 0.25);
        armRx = -2.6 + p * 2.2;
        break;
      }
      case 'attach':
      case 'recall': {
        const p = Math.sin(Math.min(1, k / 0.5) * Math.PI);
        armLx = armRx = -1.5 * p;
        armLz = -0.15;
        armRz = 0.15;
        bodyPitch += 0.2 * p;
        break;
      }
    }

    sy += this.soulsPose(a, (p, r) => {
      bodyPitch += p;
      bodyRoll += r;
    });
    if (this.ghost > 0.01) this.bodyMat.emissive.setRGB(0.55 * this.ghost, 0.85 * this.ghost, 0.9 * this.ghost);

    // aiming / shooting: right arm points the gun forward
    if (a.aim > 0.01 || a.action === 'attack') {
      const k2 = Math.max(a.aim, a.action === 'attack' ? 1 : 0);
      armRx = THREE.MathUtils.lerp(armRx, -1.5, k2);
      armRz = THREE.MathUtils.lerp(armRz, 0.15, k2);
    }
    this.legL.scale.y = this.legR.scale.y = this.legScale;
    this.legL.rotation.x = legL;
    this.legR.rotation.x = legR;
    this.armL.rotation.set(armLx, 0, armLz);
    this.armR.rotation.set(armRx, 0, armRz);
    this.hips.position.y = 0.3 * this.legScale + bob;
    this.body.rotation.set(bodyPitch, 0, bodyRoll);
    this.body.scale.set(1 + (1 - sy) * 0.6, sy, 1 + (1 - sy) * 0.6);

    // eye wander + blink
    this.eyeTimer -= dt;
    if (this.eyeTimer <= 0) {
      this.eyeTimer = 0.8 + Math.random() * 2;
      this.eyeTarget.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3);
      if (Math.random() < 0.35) this.blink = 0.14;
    }
    this.eyeCur.lerp(this.eyeTarget, 1 - Math.exp(-dt * 10));
    const pupil = this.eye.getObjectByName('pupil');
    if (pupil) pupil.rotation.set(-this.eyeCur.y, this.eyeCur.x, 0);
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.eye.getObjectByName('lid');
    if (lid) {
      const closed = this.blink > 0 || a.action === 'hurt' ? 1 : 0;
      lid.scale.y = 0.05 + closed * 0.95;
    }
  }
}
