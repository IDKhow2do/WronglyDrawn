/**
 * [INPUT]: depends on GameContext (effects coverage, audio, events), PlayerController (WAI's position);
 *          PlayBody (what a spring throws) from player/PlayBody; DoodleEye from render/DoodleEye (facade eyes);
 *          addOutline / toon from render/Materials
 * [OUTPUT]: exports Ambient (sleeping facade eyes, paper-bird flocks, sketched springs, readySprings()) and SpringSpot
 * [POS]: the city's ambient life for levels 1 and 2; GameSession and HarborSession build it from the level's eyeSpots.
 *        A painted spring throws every body on it the same way: WAI and the co-op partner (the `partners` of update).
 *        Only WAI's bounce counts for the 'spring:bounce' goal.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { PlayBody } from '../player/PlayBody';
import { addOutline, toon } from '../render/Materials';
import { DoodleEye, EYE_STYLES } from '../render/DoodleEye';
import { PAL } from '../render/PaintTextures';
import { t } from '../i18n';

/**
 * Ambient life — the city is never still:
 *  · SLEEPING FACADES: buildings' eyes are shut (the Eraser rubbed them). Spray one
 *    and it pops open, follows WAI around and giggles. Each Guardian you wake opens
 *    a third of the city; the finale opens them all.
 *  · PAPER BIRDS: flocks of folded-paper birds that scatter when WAI charges in or
 *    paint lands near them, then flutter off to another perch.
 *  · SKETCHED SPRINGS: pencil outlines on the ground — fill them with paint and a
 *    bouncy spring pops up that launches WAI somewhere interesting.
 */

interface FacadeEye {
  root: THREE.Group;
  eye: DoodleEye;
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
  open: number; // shown openness 0..1
  /** WAI's head, copied each frame for the eye to follow (no allocation). */
  watch: THREE.Vector3;
  awake: boolean;
  blinkT: number;
  nextBlink: number;
  paintSeen: number;
  giggleCd: number;
  group: number; // which third of the city
}

interface Bird {
  mesh: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  flying: boolean;
  phase: number;
  peck: number;
}

interface Flock {
  perch: number;
  birds: Bird[];
  cd: number;
}

export interface SpringSpot {
  pos: THREE.Vector3;
  /** Where the spring throws WAI (landing point). */
  target: THREE.Vector3;
  need?: number;
}

interface Spring {
  spot: SpringSpot;
  outline: THREE.Object3D;
  pad: THREE.Group | null;
  done: boolean;
  squash: number;
  /** re-bounce lock per body (s left) */
  cd: Map<PlayBody, number>;
  paintSeen: number;
}

export class Ambient {
  private eyes: FacadeEye[] = [];
  private flocks: Flock[] = [];
  private springs: Spring[] = [];
  private checkT = 0;
  private perches: THREE.Vector3[];

  constructor(
    private ctx: GameContext,
    eyeSpots: { pos: THREE.Vector3; normal: THREE.Vector3; size: number }[],
    perches: THREE.Vector3[],
    springs: SpringSpot[],
  ) {
    this.perches = perches;
    eyeSpots.forEach((s, i) => this.addEye(s, i % 3));
    for (let i = 0; i < perches.length; i += 2) this.addFlock(i, 4 + (i % 3));
    for (const sp of springs) this.addSpring(sp);
  }

  // ───────────── facades ─────────────
  private addEye(s: { pos: THREE.Vector3; normal: THREE.Vector3; size: number }, group: number): void {
    const root = new THREE.Group();
    root.position.copy(s.pos);
    root.lookAt(s.pos.clone().add(s.normal));
    root.userData.noPaint = true;
    const r = s.size;
    // a shared doodle eye (render/DoodleEye): shut and lashed while asleep, a random iris once awake
    const eye = new DoodleEye({
      ...EYE_STYLES.ROUND,
      size: r * 0.92,
      oval: 0.88,
      iris: [PAL.cobalt, PAL.turq, PAL.hotpink, PAL.orange][Math.floor(Math.random() * 4)],
      lid: '#ff9ec4',
      lashes: 4,
      open: 0,
      autoBlink: false,
      selfLit: 0.3,
    });
    eye.mesh.position.z = r * 0.05;
    eye.settle();
    root.add(eye.mesh);
    this.ctx.root.add(root);
    this.eyes.push({ root, eye, watch: new THREE.Vector3(), pos: s.pos.clone(), normal: s.normal.clone(), size: r, open: 0, awake: false, blinkT: 0, nextBlink: 2 + Math.random() * 4, paintSeen: 0, giggleCd: 0, group });
  }

  /** A Guardian woke up (count 1..3): a third of the city opens its eyes each time. */
  wake(count: number): void {
    for (const e of this.eyes) if (e.group < count) this.openEye(e, false);
  }

  /** The finale: every eye in town opens. */
  wakeAll(): void {
    for (const e of this.eyes) this.openEye(e, false);
  }

  private openEye(e: FacadeEye, giggle: boolean): void {
    if (e.awake) return;
    e.awake = true;
    e.blinkT = 0;
    this.ctx.effects.burst(e.pos.clone().addScaledVector(e.normal, 0.4), PAL.yellow, 6, 2, 0.05);
    if (giggle) {
      this.ctx.events.emit('facade:woken');
      this.ctx.audio.play('blinkBig', { pos: e.pos, vol: 0.7 });
      this.giggle(e);
    }
  }

  private giggle(e: FacadeEye): void {
    if (e.giggleCd > 0) return;
    e.giggleCd = 3.5;
    const words = ['HEE HEE!', 'TICKLES!', 'OI!', 'PEEKABOO!'];
    this.ctx.effects.comic(e.pos.clone().addScaledVector(e.normal, 0.8).add(new THREE.Vector3(0, 0.8, 0)), t(words[Math.floor(Math.random() * words.length)]), PAL.yellow, 0.7);
    this.ctx.audio.play('squeak', { pos: e.pos, pitch: 1.7 + Math.random() * 0.3, vol: 0.7 });
  }

  // ───────────── paper birds ─────────────
  private makeBird(): Bird {
    const mesh = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.9, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 4), paper);
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), new THREE.MeshStandardMaterial({ color: '#ff4fa3', roughness: 0.8 }));
    head.position.set(0, 0.12, 0.2);
    head.rotation.x = -0.6;
    const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, 0, 0.14), new THREE.Vector3(0.38, 0.02, -0.04)]);
    wingGeo.computeVertexNormals();
    const wingL = new THREE.Mesh(wingGeo, paper);
    const wingR = new THREE.Mesh(wingGeo, paper);
    wingR.scale.x = -1;
    mesh.add(body, head, wingL, wingR);
    mesh.traverse((o) => (o.userData.noPaint = true));
    this.ctx.root.add(mesh);
    return { mesh, wingL, wingR, pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, flying: false, phase: Math.random() * 6, peck: Math.random() * 3 };
  }

  private addFlock(perch: number, n: number): void {
    const f: Flock = { perch, birds: [], cd: 0 };
    for (let i = 0; i < n; i++) {
      const b = this.makeBird();
      b.pos.copy(this.perches[perch]).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4));
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y = Math.random() * 6;
      f.birds.push(b);
    }
    this.flocks.push(f);
  }

  private scatter(f: Flock, away: THREE.Vector3): void {
    if (f.cd > 0) return;
    f.cd = 4;
    // pick another perch, preferably away from WAI
    let best = f.perch;
    let bd = -Infinity;
    for (let i = 0; i < this.perches.length; i++) {
      if (i === f.perch) continue;
      const score = this.perches[i].distanceTo(away) - this.perches[i].distanceTo(this.perches[f.perch]) * 0.3 + Math.random() * 8;
      if (score > bd) {
        bd = score;
        best = i;
      }
    }
    f.perch = best;
    for (const b of f.birds) {
      b.flying = true;
      b.t = -Math.random() * 0.3;
      b.from.copy(b.pos);
      b.to.copy(this.perches[best]).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4));
    }
    this.ctx.audio.play('whoosh', { pos: this.perches[f.perch], pitch: 2.2, vol: 0.45 });
    this.ctx.audio.play('shuffle', { pos: away, pitch: 2.0, vol: 0.5 });
  }

  // ───────────── sketched springs ─────────────
  /** Is the sketched spring nearest `pos` (within 2 m) painted real yet? (null = no spring there) */
  springDone(pos: THREE.Vector3): boolean | null {
    const s = this.springs.find((sp) => sp.spot.pos.distanceTo(pos) < 2);
    return s ? s.done : null;
  }

  /** The painted (real) springs: where each one stands and where it throws (the partner's brain uses them). */
  readySprings(): SpringSpot[] {
    return this.springs.filter((s) => s.done).map((s) => s.spot);
  }

  private addSpring(spot: SpringSpot): void {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05));
    }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#2a2230', dashSize: 0.18, gapSize: 0.12 }));
    ring.computeLineDistances();
    // a sketched coil inside + "BOING" arrow
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 8;
      coil.push(new THREE.Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45 + (i / 60 - 0.5) * 0.9));
    }
    const sketch = new THREE.Line(new THREE.BufferGeometry().setFromPoints(coil), new THREE.LineDashedMaterial({ color: '#2a2230', dashSize: 0.1, gapSize: 0.08 }));
    sketch.computeLineDistances();
    g.add(ring, sketch);
    g.position.copy(spot.pos).add(new THREE.Vector3(0, 0.04, 0));
    g.userData.noPaint = true;
    this.ctx.root.add(g);
    this.springs.push({ spot, outline: g, pad: null, done: false, squash: 0, cd: new Map(), paintSeen: 0 });
  }

  private makeSpringPad(s: Spring): void {
    const g = new THREE.Group();
    const coilPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 10;
      coilPts.push(new THREE.Vector3(Math.cos(a) * 0.5, (i / 80) * 0.6, Math.sin(a) * 0.5));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 120, 0.06, 6), new THREE.MeshStandardMaterial({ color: '#c0c6d0', metalness: 0.7, roughness: 0.3 }));
    coil.name = 'coil';
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 20), toon({ color: PAL.hotpink }));
    pad.position.y = 0.68;
    pad.name = 'pad';
    addOutline(pad, 0.04);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: PAL.yellow }));
    star.rotation.x = -Math.PI / 2;
    star.position.y = 0.77;
    g.add(coil, pad, star);
    g.position.copy(s.spot.pos);
    g.traverse((o) => (o.userData.noPaint = true));
    g.scale.setScalar(0.01);
    this.ctx.root.add(g);
    s.pad = g;
  }

  // ───────────── per frame ─────────────
  update(dt: number, player: PlayerController, partners: readonly PlayBody[] = []): void {
    this.checkT -= dt;
    const doCheck = this.checkT <= 0;
    if (doCheck) this.checkT = 0.35;
    const fx = this.ctx.effects;
    const head = player.pos.clone().add(new THREE.Vector3(0, 0.8, 0));

    // facades
    for (const e of this.eyes) {
      e.giggleCd = Math.max(0, e.giggleCd - dt);
      if (doCheck) {
        const c = fx.coverage(e.pos, e.size * 2.6);
        if (c > e.paintSeen) {
          if (!e.awake) this.openEye(e, true);
          else this.giggle(e);
        }
        e.paintSeen = c;
      }
      let want = e.awake ? 1 : 0;
      if (e.awake) {
        e.nextBlink -= dt;
        if (e.nextBlink <= 0) {
          e.nextBlink = 2 + Math.random() * 5;
          e.blinkT = 0.18;
        }
        e.blinkT = Math.max(0, e.blinkT - dt);
        if (e.blinkT > 0) want = 0;
        if (e.giggleCd > 2.5) want = 0.35; // squint while giggling
      }
      e.open += (want - e.open) * Math.min(1, dt * (e.blinkT > 0 ? 30 : 6));
      // the doodle eye eases its own lid; a blink snaps it shut
      e.eye.open = e.open;
      if (e.blinkT > 0.12) e.eye.blink();
      // pupils follow WAI when he's around
      e.eye.follow = e.awake && e.pos.distanceToSquared(head) < 32 * 32 ? e.watch.copy(head) : null;
    }

    // birds
    for (const f of this.flocks) {
      f.cd = Math.max(0, f.cd - dt);
      const perch = this.perches[f.perch];
      const resting = f.birds.every((b) => !b.flying);
      if (resting && doCheck) {
        const near = player.pos.distanceTo(perch) < 4.5 && Math.hypot(player.vel.x, player.vel.z) > 3;
        const sprayed = fx.coverage(perch, 3) > 0 && Math.random() < 0.5;
        if (near || sprayed) this.scatter(f, player.pos);
      }
      for (const b of f.birds) {
        b.phase += dt * (b.flying ? 22 : 2);
        if (b.flying) {
          b.t += dt / 3.2;
          const k = THREE.MathUtils.clamp(b.t, 0, 1);
          const e = k * k * (3 - 2 * k);
          const p = b.from.clone().lerp(b.to, e);
          p.y += Math.sin(k * Math.PI) * (6 + b.from.distanceTo(b.to) * 0.15);
          const dir = p.clone().sub(b.pos);
          b.pos.copy(p);
          if (dir.lengthSq() > 1e-6) b.mesh.rotation.y = Math.atan2(dir.x, dir.z);
          const flap = Math.sin(b.phase) * 0.9;
          b.wingL.rotation.z = flap;
          b.wingR.rotation.z = -flap;
          if (k >= 1) b.flying = false;
        } else {
          // hop & peck
          b.peck -= dt;
          if (b.peck <= 0) {
            b.peck = 1 + Math.random() * 3;
            b.mesh.rotation.y += (Math.random() - 0.5) * 1.5;
          }
          const fold = 0.15 + Math.sin(b.phase) * 0.05;
          b.wingL.rotation.z = fold;
          b.wingR.rotation.z = -fold;
        }
        b.mesh.position.copy(b.pos);
        if (!b.flying) b.mesh.position.y += Math.max(0, Math.sin(b.phase * 3)) * 0.04;
      }
    }

    // springs
    for (const s of this.springs) {
      for (const [b, left] of s.cd) s.cd.set(b, Math.max(0, left - dt));
      if (!s.done) {
        if (doCheck) {
          s.paintSeen = fx.coverage(s.spot.pos, 1.2);
          const pct = Math.min(1, s.paintSeen / (s.spot.need ?? 22));
          (s.outline.children[0] as THREE.Line).scale.setScalar(1 + pct * 0.1);
          if (pct >= 1) {
            s.done = true;
            s.outline.visible = false;
            this.makeSpringPad(s);
            this.ctx.audio.play('reveal', { pos: s.spot.pos });
            this.ctx.effects.comic(s.spot.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('SPRING!'), PAL.hotpink, 0.8);
            this.ctx.events.emit('toast', { text: t('Your painted spring is REAL — jump on it!'), kind: 'good' });
          }
        }
        continue;
      }
      const pad = s.pad!;
      // pop-in
      const sc = pad.scale.x + (1 - pad.scale.x) * Math.min(1, dt * 9);
      pad.scale.set(sc, sc * (1 - s.squash * 0.5), sc);
      s.squash = Math.max(0, s.squash - dt * 3);
      // bounce: every body on the pad, each with its own re-bounce lock
      for (const body of [player as PlayBody, ...partners]) {
        if (body !== player && body.smudged) continue;
        const dx = body.pos.x - s.spot.pos.x, dz = body.pos.z - s.spot.pos.z;
        const onTop = Math.hypot(dx, dz) < 0.95 && body.pos.y > s.spot.pos.y - 0.3 && body.pos.y < s.spot.pos.y + 1.3;
        if (!onTop || (s.cd.get(body) ?? 0) > 0) continue;
        s.cd.set(body, 0.8);
        s.squash = 1;
        const to = s.spot.target.clone().sub(body.pos);
        const dist = Math.hypot(to.x, to.z);
        const rise = Math.max(1.5, s.spot.target.y - body.pos.y + 2.5);
        body.leap(new THREE.Vector3(to.x, 0, to.z).normalize(), dist, Math.sqrt(2 * 24 * rise));
        if (body === player) this.ctx.events.emit('spring:bounce');
        this.ctx.audio.play('bigJump', { pos: s.spot.pos, pitch: 1.4 });
        this.ctx.audio.play('pop', { pos: s.spot.pos, pitch: 0.7 });
        this.ctx.effects.comic(s.spot.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), t('BOING!'), PAL.yellow, 0.8);
        this.ctx.effects.ring(s.spot.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), PAL.hotpink, 3);
      }
    }
  }
}
