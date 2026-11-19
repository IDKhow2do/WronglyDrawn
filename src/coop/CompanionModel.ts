import * as THREE from 'three';
import { addOutline, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';

/**
 * The partner's colours (the export keeps its old name: Companion/Coop use it for paint + FX).
 * She is 蓝色大肥鱼 — Big Blue Fat Fish.
 */
export const PIP = {
  body: '#3f8cff',
  belly: '#dcecff',
  cheek: '#ff8fb0',
  paint: '#4fa8ff',
  border: '#ffffff',
};

const C = {
  navy: '#1c2a8a',
  hairTop: '#1b2488',
  hairTip: '#7cc4ff',
  dress: '#1d2a6e',
  skin: '#ffe2cc',
  white: '#fffaf2',
  fin: '#3a78ee',
  tail: '#2f6fe8',
  iris: '#2b62f2',
  bow: '#35b6ff',
  steelHi: '#f6f9ff',
  steel: '#b9c2d2',
  steelLo: '#6c7690',
};

export interface PipAnim {
  speed: number; // 0..1
  grounded: boolean;
  vy: number;
  spraying: boolean;
  down: number; // 0..1 knocked flat
  hurt: number; // 0..1 flash
  cheer: number; // 0..1 happy bounce
  aimPitch: number;
  /** 0..1 rice! (tail wags faster and faster, sparkle eyes) */
  excited?: number;
  /** 0..1 dozing off, sitting and hugging her tail */
  sleepy?: number;
  /** 0..1 flustered: the bowl is pulled down over her eyes */
  hide?: number;
  /** goofs: 0..1 face-plant / seeing stars / a (wrong-way) salute */
  trip?: number;
  dizzy?: number;
  salute?: number;
  /** real ground speed (m/s) and turn rate (rad/s, + = left): locomotion blend, playback rate, leans */
  mps?: number;
  turn?: number;
}

/** Bones of the Tripo rig her upper-body layers touch (spray pose, look-around). */
const UPPER = ['Spine01', 'Spine02', 'NeckTwist01', 'NeckTwist02', 'Head', 'L_Clavicle', 'L_Upperarm', 'L_UpperarmTwist01', 'L_UpperarmTwist02', 'L_Forearm', 'L_ForearmTwist01', 'L_ForearmTwist02', 'L_Hand', 'R_Clavicle', 'R_Upperarm', 'R_UpperarmTwist01', 'R_UpperarmTwist02', 'R_Forearm', 'R_ForearmTwist01', 'R_ForearmTwist02', 'R_Hand'];
const ARMS = UPPER.filter((n) => /Clavicle|arm|Hand/.test(n));
const R_ARM = ['R_Clavicle', 'R_Upperarm', 'R_UpperarmTwist01', 'R_UpperarmTwist02', 'R_Forearm', 'R_ForearmTwist01', 'R_ForearmTwist02', 'R_Hand'];
/**
 * The in-place walk / run clips have a ~0.2 m stride (chibi legs): no foot sliding at all would need 6-12x
 * playback at her game speeds, so playback follows the real speed up to these caps (a fast scurry) and the
 * rest is sold with bounce and lean. NATURAL.walk / .run = m/s at 1x playback (measured from the foot bones).
 */
const NATURAL = { walk: 0.6, run: 1.6, walkMax: 2.6, runMax: 3.4 };
type Fidget = 'look' | 'bowl' | 'wiggle';
/** hand-to-the-bowl arm: extra lift of the upper arm (about her forward axis) and fold of the forearm (rad) */
export const SALUTE = { lift: 1.2, fold: -1.0 };
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

let steelTex: THREE.Texture | null = null;
/** A tiny painted "brushed steel" matcap: reads as shiny metal under any of the game's art styles/lighting. */
function steelMatcap(): THREE.Texture {
  if (steelTex) return steelTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  // vertical bands (sky / horizon / ground reflections, like a polished basin)
  const lin = g.createLinearGradient(0, 0, 0, S);
  lin.addColorStop(0, '#c9d2e2');
  lin.addColorStop(0.2, '#aab4c8');
  lin.addColorStop(0.36, '#77829b');
  lin.addColorStop(0.47, '#4d5672');
  lin.addColorStop(0.52, '#d9e1ef');
  lin.addColorStop(0.62, '#8f9ab2');
  lin.addColorStop(0.82, '#66708b');
  lin.addColorStop(1, '#39415c');
  g.fillStyle = lin;
  g.fillRect(0, 0, S, S);
  // brushed streaks
  g.globalAlpha = 0.16;
  for (let i = 0; i < 26; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#1c2340';
    g.fillRect(0, ((i * 37) % S) + 0.5, S, 1 + (i % 3));
  }
  g.globalAlpha = 1;
  // a hard highlight blob top-left + a blue bounce bottom-right
  const hi = g.createRadialGradient(S * 0.34, S * 0.24, 0, S * 0.34, S * 0.24, S * 0.15);
  hi.addColorStop(0, 'rgba(255,255,255,1)');
  hi.addColorStop(0.5, 'rgba(255,255,255,.9)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, S, S);
  const bo = g.createRadialGradient(S * 0.72, S * 0.78, 0, S * 0.72, S * 0.78, S * 0.3);
  bo.addColorStop(0, 'rgba(90,150,255,.55)');
  bo.addColorStop(1, 'rgba(90,150,255,0)');
  g.fillStyle = bo;
  g.fillRect(0, 0, S, S);
  // dark rim so the silhouette edge stays readable
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.5);
  rim.addColorStop(0, 'rgba(40,48,80,0)');
  rim.addColorStop(1, 'rgba(24,30,60,.7)');
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);
  steelTex = new THREE.CanvasTexture(cv);
  steelTex.colorSpace = THREE.SRGBColorSpace;
  return steelTex;
}

/** Vertex colours: `top` at the geometry's highest point → `tip` at its lowest (her navy → sky-blue hair). */
function gradient(geo: THREE.BufferGeometry, top: string, tip: string, bias = 1): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(tip), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.pow(THREE.MathUtils.clamp((max.y - pos.getY(i)) / Math.max(1e-4, max.y - min.y), 0, 1), bias);
    c.copy(a).lerp(b, k);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Loose waves: push vertices sideways along a sine of their height. */
function wavy(geo: THREE.BufferGeometry, amp: number, freq: number, phase = 0): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * freq + phase) * amp);
    pos.setZ(i, pos.getZ(i) + Math.cos(y * freq * 0.8 + phase) * amp * 0.6);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * 蓝色大肥鱼 — a chibi blue-whale girl (~2.3 heads tall), drawn with the same thick ink hulls as
 * WAI: big round head, navy → sky-blue wavy hair with one ahoge, whale-fin "ears", an
 * upside-down stainless-steel rice bowl as a helmet, a blue-white maid dress with a whale apron,
 * a rice paddle (her "spray can") and a fat two-fluke tail that wags — faster when there is rice.
 * Procedural, ~11k triangles including the ink hulls.
 */
type Move = 'idle' | 'walk' | 'run' | 'jump' | 'hurt' | 'shoot';
const MOVES: Move[] = ['idle', 'walk', 'run', 'jump', 'hurt', 'shoot'];

/** The sculpted, rigged whale girl (Tripo, from our A-pose drawing): loaded once, cloned per partner. */
let whaleGltf: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> | null = null;
function loadWhale() {
  whaleGltf ??= (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/whale_girl.glb`);
      const clips = g.animations.slice();
      // more moves on the same skeleton (jump / hurt / shoot), kept in a second small file
      try {
        const extra = await loader.loadAsync(`${import.meta.env.BASE_URL}models/whale_girl_anims.glb`);
        clips.push(...extra.animations);
      } catch {
        /* optional */
      }
      return { scene: g.scene, clips };
    } catch (e) {
      console.warn('[whale] sculpted model unavailable — using the built-in body', e);
      return null;
    }
  })();
  return whaleGltf;
}

export class CompanionModel {
  readonly root = new THREE.Group();
  // ── sculpted body (replaces the procedural one once loaded) ──
  private rig: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Partial<Record<Move, THREE.AnimationAction>> = {};
  private rigMats: THREE.MeshStandardMaterial[] = [];
  private move: Move = 'idle';
  private disposed = false;
  private height = 1;

  private async adoptRig(): Promise<void> {
    const src = await loadWhale();
    if (!src || this.disposed) return;
    const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
    const rig = clone(src.scene);
    this.rigProbe = clone(src.scene);
    // as tall as the built-in body (her head-top anchor), feet on the ground, facing +z
    const box = new THREE.Box3().setFromObject(rig);
    const k = (this.height * 1.02) / Math.max(0.01, box.max.y - box.min.y);
    rig.scale.setScalar(k);
    rig.position.y = -box.min.y * k;
    rig.rotation.y = -Math.PI / 2; // the export faces +x; the game's forward is +z
    rig.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false; // skinned bounds lag the pose
      m.userData.noPaint = true;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.roughness = Math.max(mat.roughness, 0.7);
      mat.metalness = 0;
      m.material = mat;
      this.rigMats.push(mat);
    });
    this.mixer = new THREE.AnimationMixer(rig);
    for (const n of MOVES) {
      const clip = src.clips.find((c) => c.name === n);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(n === 'idle' ? 1 : 0);
      this.acts[n] = a;
    }
    this.tilt.visible = false;
    this.bones = new Map();
    rig.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
    });
    // poses lifted from the clips (no extra animation files): the shoot clip's arms-forward frame = her spray
    // pose (upper body only, over walk / run / idle), the frame where her right hand is highest = hand-to-head
    // (tapping the bowl, saluting)
    this.sprayPose = this.pickPose(src.clips.find((c) => c.name === 'shoot'), ARMS, (hand, head) => hand.z - Math.abs(hand.y - head.y) * 0.5);
    this.headPose = this.pickPose(src.clips.find((c) => c.name === 'idle') ?? null, R_ARM, (hand, head) => -hand.distanceTo(head.clone().add(new THREE.Vector3(0.04, 0.06, 0.1))), src.clips);
    this.rig = rig;
    this.rigHolder.add(rig);
  }
  private bones = new Map<string, THREE.Bone>();
  private sprayPose: Map<string, THREE.Quaternion> | null = null;
  private headPose: Map<string, THREE.Quaternion> | null = null;
  private sprayW = 0;
  private headW = 0;
  private loco = { idle: 1, walk: 0, run: 0 };
  private lean = 0;
  private roll = 0;
  private fidget: { kind: Fidget; t: number; dur: number } | null = null;
  private fidgetT = 4;
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();

  /**
   * Sample `clips` (or one clip) on a scratch mixer and keep the local rotations of `names` at the frame that scores
   * best (score gets the right hand and the head in root space: +z forward, +y up).
   */
  private pickPose(clip: THREE.AnimationClip | null | undefined, names: string[], score: (hand: THREE.Vector3, head: THREE.Vector3) => number, all?: THREE.AnimationClip[]): Map<string, THREE.Quaternion> | null {
    const rig = this.rig ?? null;
    void rig;
    const clips = all ?? (clip ? [clip] : []);
    if (!clips.length || !this.rigProbe) return null;
    const probe = this.rigProbe;
    const mixer = new THREE.AnimationMixer(probe);
    const hand = probe.getObjectByName('R_Hand');
    const head = probe.getObjectByName('Head');
    if (!hand || !head) return null;
    let best = -Infinity;
    let pose: Map<string, THREE.Quaternion> | null = null;
    const vh = new THREE.Vector3(), vd = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const c of clips) {
      const act = mixer.clipAction(c);
      act.play();
      for (let i = 0; i <= 48; i++) {
        act.time = (c.duration * i) / 48;
        mixer.update(0);
        probe.updateMatrixWorld(true);
        inv.copy(probe.matrixWorld).invert();
        hand.getWorldPosition(vh).applyMatrix4(inv);
        head.getWorldPosition(vd).applyMatrix4(inv);
        // the export faces +x: turn into "forward = +z"
        const f = (v: THREE.Vector3) => new THREE.Vector3(-v.z, v.y, v.x);
        const sc = score(f(vh), f(vd));
        if (sc > best) {
          best = sc;
          pose = new Map();
          for (const n of names) {
            const b = probe.getObjectByName(n);
            if (b) pose.set(n, b.quaternion.clone());
          }
        }
      }
      act.stop();
    }
    mixer.uncacheRoot(probe);
    return pose;
  }
  /** an un-animated copy of the rig to sample poses on */
  private rigProbe: THREE.Object3D | null = null;

  /** Rotate a bone about a world-space axis (after the mixer: parents are posed). */
  private turnBone(b: THREE.Bone | undefined, axis: THREE.Vector3, angle: number): void {
    if (!b || !b.parent || Math.abs(angle) < 1e-4) return;
    b.parent.updateWorldMatrix(true, false);
    const pw = b.parent.getWorldQuaternion(this.qa);
    const local = this.qb.copy(pw).invert();
    const ax = axis.clone().applyQuaternion(local).normalize();
    b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, angle));
  }

  /** carries the sculpted body's lean / squash / knocked-flat pose */
  private rigHolder = new THREE.Group();

  /** Upper-body layers over the clips: the spray pose, hand to the bowl / a salute, idle fidgets. */
  private layers(dt: number, a: PipAnim, mps: number): void {
    const B = this.bones;
    // spray: arms forward from the shoot clip, legs keep walking / running
    this.sprayW += ((a.spraying && a.down <= 0 ? 1 : 0) - this.sprayW) * Math.min(1, dt * 10);
    if (this.sprayPose && this.sprayW > 0.01) for (const [n, q] of this.sprayPose) B.get(n)?.quaternion.slerp(q, this.sprayW);
    // idle fidgets: now and then, standing still
    const calm = mps < 0.1 && a.grounded && a.down <= 0 && !a.spraying && (a.sleepy ?? 0) < 0.1 && (a.hide ?? 0) < 0.1 && a.cheer <= 0;
    if (!calm) {
      this.fidget = null;
      // the first one comes soon after she stops (before she dozes off)
      this.fidgetT = 1.5 + Math.random() * 2;
    }
    else if (!this.fidget) {
      this.fidgetT -= dt;
      if (this.fidgetT <= 0) {
        this.fidgetT = 4 + Math.random() * 5;
        const r = Math.random();
        const kind: Fidget = r < 0.45 ? 'look' : r < 0.75 ? 'wiggle' : 'bowl';
        this.fidget = { kind, t: 0, dur: kind === 'look' ? 2.4 : kind === 'bowl' ? 1.6 : 1.3 };
      }
    }
    let head = 0;
    let bowl = 0;
    let wig = 0;
    if (this.fidget) {
      const f = this.fidget;
      f.t += dt;
      const env = Math.sin(Math.min(1, f.t / f.dur) * Math.PI);
      if (f.kind === 'look') head = Math.sin((f.t / f.dur) * Math.PI * 2) * 0.75 * Math.min(1, env * 2);
      else if (f.kind === 'bowl') bowl = Math.min(1, env * 1.6);
      else wig = env;
      if (f.t >= f.dur) this.fidget = null;
    }
    // hand to the bowl: a fidget (taps it), or a salute (a goof)
    const hw = Math.max(bowl, a.salute ?? 0);
    this.headW += (hw - this.headW) * Math.min(1, dt * 9);
    if (this.headPose && this.headW > 0.01) {
      for (const [n, q] of this.headPose) B.get(n)?.quaternion.slerp(q, this.headW);
      // up to the bowl's rim: elbow out and up, forearm folded in (tuned on screenshots)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion);
      this.turnBone(B.get('R_Upperarm'), fwd, SALUTE.lift * this.headW);
      this.turnBone(B.get('R_Forearm'), side, SALUTE.fold * this.headW);
      // the taps
      if (bowl > 0.5) this.turnBone(B.get('R_Hand'), new THREE.Vector3(1, 0, 0), Math.sin(this.time * 18) * 0.25);
    }
    const up = new THREE.Vector3(0, 1, 0);
    if (head) this.turnBone(B.get('Head'), up, head);
    // her whole back end wags (the rig has no tail bones): a hip wiggle, faster with rice
    const wag = wig * Math.sin(this.time * 16) * 0.22 + this.excited * Math.sin(this.time * 22) * 0.12 * (mps < 0.5 ? 1 : 0.3);
    if (wag) this.turnBone(B.get('Hip'), up, wag);
  }

  private updateRig(dt: number, a: PipAnim): void {
    const sp = THREE.MathUtils.clamp(a.speed, 0, 1);
    const k = Math.min(1, dt * 8);
    // one move at a time, by priority: flinch > in the air / cheering > spraying on the spot > run / walk / idle
    const mps = a.mps ?? sp * 7.2;
    // one-shot layers by priority: flinch > in the air / cheering; under them a speed-blended idle / walk / run
    const now: Move = (a.hurt > 0.15 || a.down > 0) && this.acts.hurt ? 'hurt' : (!a.grounded || a.cheer > 0) && this.acts.jump ? 'jump' : 'idle';
    if (now !== this.move) {
      if (now === 'jump' || now === 'hurt') this.acts[now]!.time = now === 'jump' ? 0.25 : 0;
      this.move = now;
    }
    const over = now === 'idle' ? 0 : 1;
    const moving = smooth(0.12, 0.7, mps);
    const fast = smooth(2.6, 5.6, mps);
    const lk = Math.min(1, dt * 10);
    this.loco.idle += (1 - moving - this.loco.idle) * lk;
    this.loco.walk += (moving * (1 - fast) - this.loco.walk) * lk;
    this.loco.run += (moving * fast - this.loco.run) * lk;
    const want: Record<Move, number> = { idle: this.loco.idle * (1 - over), walk: this.loco.walk * (1 - over), run: this.loco.run * (1 - over), jump: now === 'jump' ? 1 : 0, hurt: now === 'hurt' ? 1 : 0, shoot: 0 };
    for (const n of MOVES) {
      const act = this.acts[n];
      if (!act) continue;
      const cur = act.getEffectiveWeight();
      act.setEffectiveWeight(n === 'walk' || n === 'run' || n === 'idle' ? want[n] : cur + (want[n] - cur) * k);
    }
    // playback follows the real speed (feet keep up as far as the clips allow)
    this.acts.walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(mps / NATURAL.walk, 0.6, NATURAL.walkMax));
    this.acts.run?.setEffectiveTimeScale(THREE.MathUtils.clamp(mps / NATURAL.run, 0.8, NATURAL.runMax));
    this.mixer!.update(dt * (1 + this.excited * 0.6));
    this.layers(dt, a, mps);
    const h = this.rigHolder;
    const L = THREE.MathUtils.lerp;
    // dozing: slumps and sways; hiding: ducks; excited / cheering: bounces; knocked flat: lies back
    const bounce = (this.excited > 0.2 || a.cheer > 0 ? Math.abs(Math.sin(this.time * 9)) * 0.08 : 0) * (a.grounded ? 1 : 0);
    h.position.y = bounce - this.sleepy * 0.05;
    h.scale.set(1 + this.hide * 0.08, 1 - this.sleepy * 0.12 - this.hide * 0.14, 1 + this.hide * 0.08);
    // lean into speed changes and into turns (a little scurry bounce sells the fast feet)
    this.lean += (THREE.MathUtils.clamp(mps * 0.014, 0, 0.12) - this.lean) * Math.min(1, dt * 6);
    this.roll += (THREE.MathUtils.clamp(-(a.turn ?? 0) * mps * 0.012, -0.22, 0.22) - this.roll) * Math.min(1, dt * 8);
    h.rotation.x = L(L(this.lean + (a.spraying ? -0.04 : 0), 0.22, this.sleepy), -Math.PI / 2, a.down);
    h.rotation.z = Math.sin(this.time * 1.3) * 0.06 * this.sleepy + this.roll;
    if (a.grounded && mps > 1) h.position.y += Math.abs(Math.sin(this.time * (8 + mps * 1.4))) * 0.035;
    if (!a.grounded) h.rotation.x += THREE.MathUtils.clamp(-a.vy * 0.02, -0.2, 0.25);
    // goofs: a face-plant (tips forward onto her face), a wobble while seeing stars, a stiff proud salute
    const trip = a.trip ?? 0;
    h.rotation.x += trip * 1.35;
    h.position.y += trip * 0.12;
    h.rotation.z += (a.dizzy ?? 0) * Math.sin(this.time * 7) * 0.12;
    h.rotation.x -= (a.salute ?? 0) * 0.12;
    for (const m of this.rigMats) m.emissive.setRGB(a.hurt * 0.8, a.hurt * 0.3, a.hurt * 0.4);
  }

  /** everything visual (the root itself carries position + yaw only) */
  private tilt = new THREE.Group();
  /** Tip of the rice paddle (the spray's world muzzle is computed in Companion). */
  readonly muzzle = new THREE.Object3D();
  readonly headTop = new THREE.Object3D();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private bowl = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  private tail = new THREE.Group();
  private tailTip = new THREE.Group();
  private finL = new THREE.Group();
  private finR = new THREE.Group();
  private ahoge = new THREE.Group();
  private eyes: THREE.Group[] = [];
  private lids: THREE.Mesh[] = [];
  private sparkles: THREE.Mesh[] = [];
  /** fringe + lash lines: tucked away while the bowl is over her face */
  private underBowl: THREE.Object3D[] = [];
  private mouth: THREE.Mesh;
  private mouthOpen: THREE.Mesh;
  private flashMats: THREE.MeshToonMaterial[] = [];
  private phase = 0;
  private wag = 0;
  private time = 0;
  private blink = 0;
  private blinkT = 2;
  private stars = new THREE.Group();
  // smoothed moods
  private excited = 0;
  private sleepy = 0;
  private hide = 0;

  constructor() {
    const mat = (color: string) => {
      const m = toon({ color });
      this.flashMats.push(m);
      return m;
    };
    const white = mat(C.white);
    const skin = mat(C.skin);
    const dress = mat(C.dress);
    const hairMat = mat('#ffffff');
    hairMat.vertexColors = true;
    const ink = new THREE.MeshBasicMaterial({ color: PAL.black });
    const steel = new THREE.MeshMatcapMaterial({ matcap: steelMatcap(), side: THREE.DoubleSide });

    // ───────── head ─────────
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.245, 20, 14), skin);
    skull.scale.set(1.06, 0.95, 0.96);
    skull.castShadow = true;
    addOutline(skull, 0.022);
    this.head.add(skull);
    // hair: a cap that leaves the face free, a long wavy mass down the back, two side locks, a fringe
    const cap = new THREE.Mesh(gradient(new THREE.SphereGeometry(0.255, 18, 12), C.hairTop, '#2a3fb4'), hairMat);
    cap.position.set(0, -0.005, -0.045);
    cap.scale.set(1.08, 1, 1);
    addOutline(cap, 0.022);
    const back = new THREE.Mesh(gradient(wavy(new THREE.SphereGeometry(0.3, 16, 14), 0.03, 15), C.hairTop, C.hairTip, 1.3), hairMat);
    back.scale.set(1.04, 1.1, 0.5);
    back.position.set(0, -0.3, -0.15);
    back.castShadow = true;
    addOutline(back, 0.024);
    this.head.add(cap, back);
    for (const sx of [-1, 1]) {
      const lock = new THREE.Mesh(gradient(wavy(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), 0.016, 22, sx), C.hairTop, C.hairTip, 0.9), hairMat);
      lock.position.set(sx * 0.25, -0.17, -0.02);
      lock.rotation.z = sx * 0.22;
      lock.scale.set(1, 1, 0.8);
      addOutline(lock, 0.018);
      this.head.add(lock);
    }
    // fringe: three fat spikes over the forehead (the middle one between the eyes)
    const spike = gradient(new THREE.ConeGeometry(0.075, 0.17, 5), '#2433a4', C.hairTop);
    for (const [x, rz, sy] of [
      [-0.13, 0.5, 0.9],
      [0.0, -0.08, 1.1],
      [0.13, -0.5, 0.9],
    ]) {
      const f = new THREE.Mesh(spike, hairMat);
      f.position.set(x, 0.06, 0.2 - Math.abs(x) * 0.25);
      f.rotation.set(0.25, 0, Math.PI + rz);
      f.scale.set(1, sy, 0.45);
      this.underBowl.push(f);
      this.head.add(f);
    }
    // ahoge: one curl poking out from under the bowl
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 5, 12, Math.PI * 1.25), mat(C.hairTop));
    curl.rotation.set(0, 0.3, 0.5);
    curl.position.set(-0.03, 0.07, 0);
    addOutline(curl, 0.012);
    this.ahoge.add(curl);
    this.ahoge.position.set(-0.1, 0.315, -0.12);
    this.head.add(this.ahoge);
    // whale-fin "ears": blue on top, pale underneath, a little bow at the root
    const finGeo = new THREE.ConeGeometry(0.08, 0.2, 6);
    finGeo.translate(0, 0.1, 0);
    const finBlue = mat(C.fin);
    const pale = mat(PIP.belly);
    const bowMat = mat(C.bow);
    for (const [g, sx] of [
      [this.finL, -1],
      [this.finR, 1],
    ] as const) {
      const top = new THREE.Mesh(finGeo, finBlue);
      top.scale.set(1, 1, 0.42);
      addOutline(top, 0.016);
      const under = new THREE.Mesh(finGeo, pale);
      under.scale.set(0.8, 0.86, 0.3);
      under.position.set(sx * 0.014, 0, 0.022);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), bowMat);
      bow.scale.set(1.5, 0.9, 0.7);
      bow.position.set(0, 0.02, 0.05);
      addOutline(bow, 0.01);
      g.add(top, under, bow);
      g.position.set(sx * 0.24, 0.02, -0.03);
      g.rotation.z = -sx * 1.75;
      this.head.add(g);
    }
    // face: big blue eyes with a lash line, blush, a small cat-smile
    const eyeWhite = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const irisMat = new THREE.MeshBasicMaterial({ color: C.iris });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#10184e' });
    const sparkMat = new THREE.MeshBasicMaterial({ color: PAL.yellow });
    // a point on the face (head-local), pushed `out` metres off the skull
    const onFace = (x: number, y: number, out: number) => {
      const z = 0.235 * Math.sqrt(Math.max(0.05, 1 - (x / 0.26) ** 2 - (y / 0.233) ** 2));
      const v = new THREE.Vector3(x, y, z);
      return v.addScaledVector(v.clone().normalize(), out);
    };
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), eyeWhite);
      w.scale.set(0.9, 1.1, 0.22);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), irisMat);
      iris.scale.set(0.9, 1.1, 0.22);
      iris.position.set(0, -0.006, 0.008);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), pupilMat);
      pupil.scale.set(0.9, 1.2, 0.22);
      pupil.position.set(0, -0.01, 0.016);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeWhite);
      glint.scale.z = 0.4;
      glint.position.set(-0.02, 0.026, 0.022);
      // rice sparkle: a little yellow star over the pupil (only when excited)
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), sparkMat);
      sp.scale.set(1, 1, 0.25);
      sp.position.set(0.004, -0.006, 0.026);
      sp.visible = false;
      this.sparkles.push(sp);
      eye.add(w, iris, pupil, glint, sp);
      const at = onFace(sx * 0.1, -0.035, 0.004);
      eye.position.copy(at);
      eye.lookAt(at.clone().multiplyScalar(2));
      this.eyes.push(eye);
      // lash line: follows the upper edge of the eye (child of a pivot with the eye's orientation)
      const lidPivot = new THREE.Group();
      lidPivot.position.copy(at);
      lidPivot.quaternion.copy(eye.quaternion);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.02, 0.012), ink);
      lid.position.set(0, 0.07, 0.014);
      lid.rotation.z = -sx * 0.12;
      lidPivot.add(lid);
      this.underBowl.push(lidPivot);
      this.lids.push(lid);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.036, 10), new THREE.MeshBasicMaterial({ color: PIP.cheek, transparent: true, opacity: 0.85 }));
      const ca = onFace(sx * 0.17, -0.11, 0.004);
      cheek.position.copy(ca);
      cheek.lookAt(ca.clone().multiplyScalar(2));
      cheek.scale.set(1.25, 0.75, 1);
      this.head.add(eye, lidPivot, cheek);
    }
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 5, 10, Math.PI), ink);
    this.mouth.rotation.z = Math.PI;
    this.mouth.position.set(0, -0.115, 0.214);
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#b3273d' }));
    this.mouthOpen.scale.set(1, 0.9, 0.3);
    this.mouthOpen.position.set(0, -0.125, 0.208);
    this.mouthOpen.visible = false;
    this.head.add(this.mouth, this.mouthOpen);
    // the rice-bowl helmet: an upside-down stainless-steel basin (lathe), a size too big
    const prof = [
      [0.0, 0.215],
      [0.16, 0.215],
      [0.205, 0.198],
      [0.24, 0.155],
      [0.275, 0.05],
      [0.29, 0.014],
      [0.33, 0.0],
      [0.33, -0.016],
      [0.285, -0.016],
    ]
      .map(([r, y]) => new THREE.Vector2(r, y))
      .reverse(); // bottom → top: lathe faces point outwards
    const basin = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), steel);
    basin.castShadow = true;
    addOutline(basin, 0.022);
    // white frilly headband peeking out under the rim
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.024, 5, 20, Math.PI * 1.1), white);
    band.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05 - Math.PI);
    band.position.set(0, -0.012, 0.0);
    this.bowl.add(basin, band);
    this.bowl.position.set(0, 0.105, -0.03);
    this.bowl.rotation.x = -0.26;
    this.head.add(this.bowl);
    this.headTop.position.set(0, 0.36, 0);
    this.head.add(this.headTop);
    this.head.position.set(0, 0.4, 0);

    // ───────── body: maid dress, apron, arms ─────────
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.125, 0.17, 12), dress);
    torso.position.y = 0.09;
    addOutline(torso, 0.018);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.275, 0.2, 16), dress);
    skirt.position.y = -0.06;
    skirt.castShadow = true;
    addOutline(skirt, 0.02);
    const frill = new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.028, 6, 18), white);
    frill.rotation.x = Math.PI / 2;
    frill.position.y = -0.16;
    addOutline(frill, 0.012);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 5, 12), white);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.17;
    const brooch = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: C.bow }));
    brooch.position.set(0, 0.155, 0.105);
    const apron = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), white);
    apron.scale.set(1.05, 1.15, 0.2);
    apron.position.set(0, -0.035, 0.175);
    apron.rotation.x = -0.6;
    addOutline(apron, 0.014);
    const bib = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.02), white);
    bib.position.set(0, 0.1, 0.112);
    bib.rotation.x = -0.1;
    // the whale on the apron (a blue blob + a tail flick) and the pocket
    const emb = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), new THREE.MeshBasicMaterial({ color: C.iris }));
    emb.scale.set(1.3, 0.8, 0.25);
    emb.position.set(-0.035, -0.045, 0.213);
    emb.rotation.x = -0.6;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), new THREE.MeshBasicMaterial({ color: '#e6ecf6' }));
    pocket.position.set(0.06, -0.07, 0.222);
    pocket.rotation.x = -0.6;
    const backBow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), white);
    backBow.scale.set(1.9, 1, 0.5);
    backBow.position.set(0, 0.02, -0.14);
    addOutline(backBow, 0.012);
    this.body.add(torso, skirt, frill, collar, brooch, apron, bib, emb, pocket, backBow, this.head);
    for (const [g, sx] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.1, 3, 6), dress);
      sleeve.position.y = -0.08;
      addOutline(sleeve, 0.014);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.018, 5, 8), white);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.15;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skin);
      hand.position.y = -0.19;
      addOutline(hand, 0.012);
      g.add(sleeve, cuff, hand);
      g.position.set(sx * 0.135, 0.15, 0.0);
      g.rotation.z = sx * 0.4;
      this.body.add(g);
    }
    // the rice paddle in her right hand: this is what she flings paint with
    const paddle = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), white);
    handle.position.y = -0.06;
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), white);
    scoop.scale.set(0.95, 1.25, 0.28);
    scoop.position.y = -0.17;
    addOutline(scoop, 0.012);
    const dab = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(PIP.paint));
    dab.scale.set(1, 1, 0.5);
    dab.position.set(0, -0.19, 0.016);
    paddle.add(handle, scoop, dab);
    paddle.position.set(0, -0.2, 0.02);
    paddle.rotation.x = 0.35;
    this.armR.add(paddle);
    this.muzzle.position.set(0, -0.42, 0.06);
    this.armR.add(this.muzzle);

    // ───────── fat whale tail: a thick root, then two flukes on their own joint ─────────
    const tailMat = mat(C.tail);
    const rootGeo = new THREE.SphereGeometry(0.13, 14, 10);
    const tRoot = new THREE.Mesh(rootGeo, tailMat);
    tRoot.scale.set(0.95, 0.8, 1.75);
    tRoot.position.z = -0.17;
    tRoot.castShadow = true;
    addOutline(tRoot, 0.02);
    const tBelly = new THREE.Mesh(rootGeo, pale);
    tBelly.scale.set(0.8, 0.6, 1.6);
    tBelly.position.set(0, -0.035, -0.17);
    const stem = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), tailMat);
    stem.scale.set(0.8, 0.7, 1.5);
    stem.position.z = -0.03;
    addOutline(stem, 0.016);
    const flukeGeo = new THREE.SphereGeometry(0.12, 12, 8);
    for (const sx of [-1, 1]) {
      const fl = new THREE.Mesh(flukeGeo, tailMat);
      fl.scale.set(0.72, 0.24, 1.25);
      fl.position.set(sx * 0.1, 0, -0.14);
      fl.rotation.y = -sx * 0.75;
      fl.castShadow = true;
      addOutline(fl, 0.016);
      this.tailTip.add(fl);
    }
    this.tailTip.add(stem);
    this.tailTip.position.set(0, 0.01, -0.37);
    this.tail.add(tRoot, tBelly, this.tailTip);
    this.tail.position.set(0, -0.02, -0.1);
    this.body.add(this.tail);
    this.body.position.y = 0.3;
    this.root.add(this.tilt);
    this.tilt.add(this.body);

    // ───────── legs: white socks, navy mary-janes ─────────
    const shoeMat = mat(C.navy);
    for (const [g, sx] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 3, 6), white);
      sock.position.y = -0.09;
      addOutline(sock, 0.012);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 6), shoeMat);
      shoe.scale.set(1, 0.62, 1.45);
      shoe.position.set(0, -0.18, 0.025);
      addOutline(shoe, 0.014);
      g.add(sock, shoe);
      g.position.set(sx * 0.085, 0.22, 0);
      this.tilt.add(g);
    }
    // dizzy stars (knocked down)
    const starMat = new THREE.MeshBasicMaterial({ color: PAL.yellow });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), starMat);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.root.add(this.stars);
    this.root.add(this.rigHolder);
    this.root.updateMatrixWorld(true);
    this.height = this.headTop.getWorldPosition(new THREE.Vector3()).y - this.root.position.y;
    void this.adoptRig();
    this.root.traverse((o) => {
      o.userData.noPaint = true;
    });
  }

  /** Triangles in the whole model, ink hulls included (tests / docs). */
  triangles(): number {
    let n = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    return Math.round(n);
  }

  update(dt: number, a: PipAnim): void {
    this.time += dt;
    const L = THREE.MathUtils.lerp;
    const k = (r: number) => Math.min(1, dt * r);
    const sp = THREE.MathUtils.clamp(a.speed, 0, 1);
    const down = a.down;
    this.excited += ((a.excited ?? 0) - this.excited) * k(6);
    // waking up is a jolt, dozing off is slow
    const sleepTarget = down > 0 || sp > 0.08 || a.spraying ? 0 : (a.sleepy ?? 0);
    this.sleepy += (sleepTarget - this.sleepy) * k(sleepTarget > this.sleepy ? 1.6 : 14);
    this.hide += ((down > 0 ? 0 : (a.hide ?? 0)) - this.hide) * k(12);
    const ex = this.excited, sl = this.sleepy, hd = this.hide;
    const cheer = a.cheer > 0 ? 1 : 0;

    this.phase += dt * (6 + sp * 12) * (sp > 0.05 ? 1 : 0);
    const swing = Math.sin(this.phase) * 0.9 * sp;
    // legs: walk / jump tuck / sit down with the legs out front when dozing
    this.legL.rotation.x = L(a.grounded ? swing : -0.5, -1.35, sl);
    this.legR.rotation.x = L(a.grounded ? -swing : 0.3, -1.25, sl);
    this.legL.position.y = this.legR.position.y = 0.22 - sl * 0.12;
    // bouncy waddle + idle breathing; cheering / rice hops
    const bob = a.grounded ? Math.abs(Math.sin(this.phase)) * 0.06 * sp + Math.sin(this.time * 2.4) * 0.01 : 0;
    const hop = cheer ? Math.abs(Math.sin(this.time * 12)) * 0.16 : ex > 0.5 && a.grounded ? Math.abs(Math.sin(this.time * 9)) * 0.05 * ex : 0;
    this.body.position.y = 0.3 + bob + hop - sl * 0.13;
    this.body.rotation.z = Math.sin(this.phase * 0.5) * 0.09 * sp;
    this.body.rotation.x = sp * 0.12 + sl * 0.2;
    const stretch = THREE.MathUtils.clamp(a.vy * 0.02, -0.12, 0.16);
    this.body.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    // head: nods off when sleepy (slow breathing), ducks when hiding
    const breathe = Math.sin(this.time * 1.5);
    this.head.rotation.x = sl * (0.32 + breathe * 0.06) + hd * 0.22 - sp * 0.06;
    this.head.rotation.z = sl * 0.16 + Math.sin(this.phase * 0.5) * 0.05 * sp;
    // the bowl: bounces a little when she runs, slides down over her eyes when she hides
    this.bowl.position.y = 0.105 + Math.abs(Math.sin(this.phase)) * 0.012 * sp - hd * 0.1;
    this.bowl.scale.y = 1 + hd * 0.4; // squash & stretch: deep enough to hide under
    this.bowl.rotation.x = -0.26 + hd * 0.4;
    this.bowl.position.z = -0.03 + hd * 0.035;
    const covered = hd > 0.45;
    for (const o of this.underBowl) o.visible = !covered;
    this.bowl.rotation.z = sl * -0.12 + Math.sin(this.phase) * 0.03 * sp;
    this.ahoge.rotation.z = Math.sin(this.time * 3.1) * 0.12 + ex * Math.sin(this.time * 14) * 0.25 - hd * 0.5;
    // fin ears: flick, perk up for rice, droop when hiding / asleep
    const flick = Math.sin(this.time * 2.2) * 0.06 + ex * 0.35 - (hd + sl) * 0.45;
    this.finL.rotation.z = 1.75 - flick;
    this.finR.rotation.z = -1.75 + flick;
    // arms: fling (right arm forward, follows aim pitch) / cheer (both up) / hold the bowl rim / hug the tail
    let rx = Math.sin(this.phase) * 0.5 * sp, lx = -Math.sin(this.phase) * 0.5 * sp, rz = 0.4, lz = -0.4;
    if (a.spraying) rx = -1.5 - a.aimPitch + Math.sin(this.time * 22) * 0.12;
    else if (cheer || ex > 0.6) {
      rx = lx = -2.6;
    }
    if (hd > 0.02) {
      rx = L(rx, -2.75, hd);
      lx = L(lx, -2.75, hd);
      rz = L(rz, -0.15, hd);
      lz = L(lz, 0.15, hd);
    }
    if (sl > 0.02) {
      rx = L(rx, -0.95, sl);
      lx = L(lx, -0.75, sl);
      rz = L(rz, -0.25, sl);
      lz = L(lz, 0.45, sl);
    }
    this.armR.rotation.x += (rx - this.armR.rotation.x) * k(14);
    this.armL.rotation.x += (lx - this.armL.rotation.x) * k(12);
    this.armR.rotation.z += (rz - this.armR.rotation.z) * k(12);
    this.armL.rotation.z += (lz - this.armL.rotation.z) * k(12);
    // tail: a lazy sway that gets faster and faster with rice; curls round to the front to be hugged when dozing
    const wagHz = 2.2 + sp * 4 + ex * 16 + cheer * 6;
    this.wag += dt * wagHz;
    const amp = (0.28 + ex * 0.4 + sp * 0.12) * (1 - sl * 0.85);
    this.tail.rotation.y = Math.sin(this.wag) * amp + sl * 2.0;
    this.tail.rotation.x = 0.32 + ex * 0.25 - sl * 0.3 + Math.sin(this.wag * 2) * 0.05;
    this.tail.position.set(sl * 0.1, -0.02 + sl * 0.03, -0.1 + sl * 0.1);
    this.tailTip.rotation.y = Math.sin(this.wag - 0.9) * amp * 1.4 + sl * 0.9;
    this.tailTip.rotation.x = 0.25 + Math.sin(this.wag * 2 - 0.5) * 0.1;
    // eyes: blink / droop when sleepy / shut when knocked out; sparkles for rice
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.12;
      this.blinkT = 2 + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt);
    const open = down > 0.5 || this.blink > 0 ? 0.1 : Math.max(0.1, 1 - sl * 1.05) * (1 + ex * 0.12);
    for (let i = 0; i < 2; i++) {
      this.eyes[i].scale.y = open;
      this.eyes[i].visible = !covered;
      this.lids[i].position.y = 0.07 * open;
      this.sparkles[i].visible = ex > 0.4 && open > 0.5;
      this.sparkles[i].rotation.z = this.time * 3;
    }
    const mouthOpen = (cheer || ex > 0.5) && down <= 0;
    this.mouthOpen.visible = mouthOpen;
    this.mouth.visible = !mouthOpen;
    // knocked flat: tip over backwards, stars circle
    this.tilt.rotation.x = -down * 1.35;
    this.tilt.position.y = down * 0.3;
    this.stars.visible = down > 0.5 || (a.dizzy ?? 0) > 0.5;
    if (this.stars.visible) {
      this.stars.children.forEach((s, i) => {
        const ang = this.time * 4 + (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(ang) * 0.32, 1.12, Math.sin(ang) * 0.32);
        s.rotation.y = this.time * 6;
      });
    }
    for (const m of this.flashMats) m.emissive.setRGB(a.hurt * 0.8, a.hurt * 0.3, a.hurt * 0.4);
    if (this.rig) this.updateRig(dt, a);
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.parent?.remove(this.root);
    const seen = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      // her own materials only: the ink hulls share the game's outline material
      if (!m.userData.isOutline && !seen.has(m.material as THREE.Material)) {
        seen.add(m.material as THREE.Material);
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
