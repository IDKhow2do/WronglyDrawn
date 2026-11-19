/**
 * [INPUT]: depends on PlaySession (objective, hintFull, guide, enemies, hosts) from ../level/Session; InputManager;
 *          CameraController; OrganType from ../organs/Organ
 * [OUTPUT]: exports AgentBridge (observe, act, SCHEMA) and AgentCommand
 * [POS]: the only door an outside AI player uses. observe() reports the un-delayed objective line (hintFull), so an
 *        agent never waits out the HUD's stuck rule; act() turns one high-level command into frames of input.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { PlaySession as GameSession } from '../level/Session';
import type { InputManager } from '../core/InputManager';
import type { CameraController } from '../render/CameraController';
import type { OrganType } from '../organs/Organ';

/**
 * AGENT BRIDGE — lets an AI (DeepSeek, Claude, anything with an API) play.
 *
 * An LLM can't press keys at 60 Hz, so this splits the job:
 *   observe()  → a compact JSON snapshot (what a player would know)
 *   act(cmd)   → a HIGH-LEVEL command ("go to", "spray at for 2 s", "lend Eye to host")
 *                that the game executes frame by frame (steering, aiming, holding buttons).
 * The AI calls observe/act every ~1–2 s; this module does the rest.
 *
 * It drives WAI. The co-op companion (Pip, src/coop) has its own bridge with the same
 * shape: window.WD_COOP.observe()/act(). See docs/AI_AGENT.md.
 */
export type AgentCommand =
  | { type: 'move_to'; x: number; z: number; run?: boolean }
  | { type: 'move'; forward: number; right: number; seconds?: number }
  | { type: 'look_at'; x: number; y: number; z: number }
  | { type: 'spray'; seconds: number; at?: [number, number, number] }
  | { type: 'jump' }
  | { type: 'dodge' }
  | { type: 'bomb'; at?: [number, number, number] }
  | { type: 'select_organ'; organ: OrganType }
  | { type: 'lend'; organ: OrganType; host: string }
  | { type: 'recall'; organ: OrganType }
  | { type: 'interact' }
  | { type: 'aim'; on: boolean }
  | { type: 'shout'; big?: boolean; at?: [number, number, number] }
  | { type: 'stop' };

const ORGAN_KEY: Record<OrganType, string> = { EYE: 'KeyQ', MOUTH: 'KeyR', LEG: 'KeyF' };

/** The level's mid-boss, when it has one (duck-typed: only Blind Plaza's session has a quarter). */
function midBoss(s: GameSession): Record<string, unknown> | null {
  const q = (s as { quarter?: { cleared: boolean; inkwell: { id: string; displayName: string; pos: THREE.Vector3; hp: number; maxHp: number; state: string; corked: boolean; phase: number; engaged: boolean; counterHint: string } } }).quarter;
  if (!q) return null;
  const k = q.inkwell;
  const r = (v: THREE.Vector3) => [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)];
  return { id: k.id, name: k.displayName, pos: r(k.pos), hp: Math.round((k.hp / k.maxHp) * 100), state: k.state, corked: k.corked, phase: k.phase + 1, engaged: k.engaged, repainted: q.cleared, counter: k.counterHint };
}

export class AgentBridge {
  private session: GameSession | null = null;
  private goal: { x: number; z: number; run: boolean } | null = null;
  private moveT = 0;
  private moveDir = { forward: 0, right: 0 };
  private sprayT = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private pressT = new Map<string, number>();
  /** Last command results / errors, readable by the AI next turn. */
  readonly log: string[] = [];
  enabled = false;

  constructor(
    private input: InputManager,
    private camera: CameraController,
  ) {}

  attach(session: GameSession | null): void {
    this.session = session;
    this.stopAll();
  }

  /** Everything an AI needs to decide its next move (positions in metres, x east / z south / y up). */
  observe(): Record<string, unknown> {
    const s = this.session;
    if (!s) return { state: 'NO_SESSION' };
    const p = s.player;
    const near = (v: THREE.Vector3) => +v.distanceTo(p.pos).toFixed(1);
    const r = (v: THREE.Vector3) => [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)];
    const obj = s.objective();
    const inv = s.inventory;
    return {
      objective: obj.title,
      hint: s.hintFull || obj.hint, // the un-delayed line: an AI player never waits out the stuck rule
      prompt: s.prompt()?.text ?? null,
      player: {
        pos: r(p.pos),
        hp: p.hp,
        grounded: p.grounded,
        paintTank: +s.weapon.tankFrac.toFixed(2),
        // stapled to the ground by a Stapler: seconds left (mash jump/dodge to break free), 0 = free
        pinned: +Math.max(0, ...s.enemies.map((e) => (e as { pinned?: number }).pinned ?? 0)).toFixed(2),
        bombReady: s.weapon.bombFrac >= 1,
        organs: (['EYE', 'MOUTH', 'LEG'] as OrganType[]).map((t) => {
          const o = inv.get(t);
          return { type: t, have: !!o, corrupted: !!o?.corrupted, lentTo: o?.hostId ?? null, worn: !!o && !o.corrupted && !o.hostId };
        }),
      },
      guardiansAwake: [...s.woken],
      level: s.levelId,
      // `eraser` = the level's boss (name kept for level-1 harnesses); `boss` is the same, for every level
      eraser: { awake: s.boss.awake, repainted: s.bossDone, pos: r(s.boss.pos), hp: Math.round((s.boss.hp / s.boss.maxHp) * 100) },
      // level 1's mid-boss (the Red Inkwell in the Crossed-Out Quarter): corked = only a PAINT SLAM (jump, then dodge in mid-air) hurts it
      midBoss: midBoss(s),
      boss: { id: s.boss.id, name: s.boss.displayName, awake: s.boss.awake, repainted: s.bossDone, pos: r(s.boss.pos), hp: Math.round((s.boss.hp / s.boss.maxHp) * 100), state: s.boss.state },
      enemies: s.enemies
        .filter((e) => !e.disposed && near(e.pos) < 40)
        .map((e) => {
          const f = e.forward();
          return { id: e.id, kind: e.kind, pos: r(e.pos), facing: [+f.x.toFixed(2), +f.z.toFixed(2)], dist: near(e.pos), state: e.state, harmless: e.harmless, repaintPct: Math.round(e.repaint * 100) };
        }),
      hosts: s.allHosts
        .filter((h) => near(h.pos) < 30)
        .map((h) => ({ id: h.id, name: h.def.name, pos: r(h.pos), dist: near(h.pos), has: (['EYE', 'MOUTH', 'LEG'] as OrganType[]).filter((t) => h.has(t)) })),
      droppedOrgans: s.organs.worldOrgans.filter((w) => !w.disposed).map((w) => ({ type: w.organ.type, pos: r(w.at), dist: near(w.at) })),
      crownsNear: s.level.crowns.filter((c) => !c.hidden && !c.collected && near(c.pos) < 25).map((c) => ({ id: c.id, pos: r(c.pos), dist: near(c.pos) })),
      paintTime: s.combat.paintTime > 0,
      // the AI co-op partner (src/coop), when it's on — see window.WD_COOP for its own controls
      coop: s.coop ? { pos: r(s.coop.pip.pos), hp: s.coop.pip.hp, down: s.coop.pip.down > 0, order: (s.coop.order ?? s.coop.auto).mode } : null,
      cinematic: s.story.locked || this.camera.inCine,
    };
  }

  /** Queue a command. Returns a short status string. */
  act(cmd: AgentCommand): string {
    const s = this.session;
    if (!s) return 'no session';
    this.enabled = true;
    switch (cmd.type) {
      case 'move_to':
        this.goal = { x: cmd.x, z: cmd.z, run: !!cmd.run };
        return 'moving';
      case 'move':
        this.goal = null;
        this.moveDir = { forward: cmd.forward, right: cmd.right };
        this.moveT = cmd.seconds ?? 1;
        return 'moving';
      case 'look_at':
        this.lookTarget = new THREE.Vector3(cmd.x, cmd.y, cmd.z);
        return 'looking';
      case 'spray':
        if (cmd.at) this.lookTarget = new THREE.Vector3(...cmd.at);
        this.sprayT = Math.min(6, cmd.seconds);
        return 'spraying';
      case 'jump':
        return this.tap('Space');
      case 'dodge':
        return this.tap('KeyC');
      case 'bomb':
        if (cmd.at) this.lookTarget = new THREE.Vector3(...cmd.at);
        return this.tap('KeyG');
      case 'interact':
        return this.tap('KeyE');
      case 'select_organ':
        return this.tap(ORGAN_KEY[cmd.organ]);
      case 'aim':
        if (cmd.on) this.input.virtualDown('KeyZ');
        else this.input.virtualUp('KeyZ');
        return cmd.on ? 'aiming' : 'not aiming';
      case 'lend': {
        const host = s.organs.hostById(cmd.host);
        if (!host) return `no host ${cmd.host}`;
        this.lookTarget = host.socketWorld(cmd.organ).clone();
        this.goal = host.pos.distanceTo(s.player.pos) > 3 ? { x: host.pos.x, z: host.pos.z + 2.5, run: true } : null;
        this.tap(ORGAN_KEY[cmd.organ]);
        // E only once that host is the one in focus (never sticks it on a prop on the way)
        this.pendingLend = { host: cmd.host, t: 25 };
        return 'lending';
      }
      case 'recall': {
        this.input.virtualDown(ORGAN_KEY[cmd.organ]);
        this.pressT.set(ORGAN_KEY[cmd.organ], 1.2); // hold to recall
        return 'recalling';
      }
      case 'shout':
        // X (Mute Harbor, Mouth worn): tap = shout, hold ~0.7 s = BIG SHOUT
        if (cmd.at) this.lookTarget = new THREE.Vector3(...cmd.at);
        this.input.virtualDown('KeyX');
        this.pressT.set('KeyX', cmd.big ? 0.75 : 0.08);
        return cmd.big ? 'charging a big shout' : 'shouting';
      case 'stop':
        this.stopAll();
        return 'stopped';
    }
  }

  private tap(code: string): string {
    this.input.virtualDown(code);
    this.pressT.set(code, 0.08);
    return 'ok';
  }

  private pendingLend: { host: string; t: number; aiming?: boolean } | null = null;
  private lastPos = new THREE.Vector3();
  private stuckT = 0;
  private detourT = 0;
  private detourSide = 1;

  private stopAll(): void {
    this.pendingLend = null;
    this.goal = null;
    this.moveT = 0;
    this.sprayT = 0;
    this.lookTarget = null;
    this.input.virtualMove.x = this.input.virtualMove.y = 0;
    this.input.virtualUp('Mouse0');
    for (const k of this.pressT.keys()) this.input.virtualUp(k);
    this.pressT.clear();
  }

  /** Per frame: turn commands into stick/button/camera input. */
  update(dt: number): void {
    const s = this.session;
    if (!s || !this.enabled) return;
    for (const [k, t] of this.pressT) {
      const n = t - dt;
      if (n <= 0) {
        this.input.virtualUp(k);
        this.pressT.delete(k);
      } else this.pressT.set(k, n);
    }
    const p = s.player;
    if (this.pendingLend) {
      const pl = this.pendingLend;
      pl.t -= dt;
      const host = s.organs.hostById(pl.host);
      // big or out-of-reach hosts: aim at them (Z) like a player would
      const far = !!host && host.closestPoint(p.pos.clone().add(new THREE.Vector3(0, 0.5, 0))).distanceTo(p.pos) > 2.2;
      if (host && far && host.pos.distanceTo(p.pos) < 14 && !pl.aiming) {
        pl.aiming = true;
        this.input.virtualDown('KeyZ');
      }
      const done = () => {
        if (pl.aiming) setTimeout(() => this.input.virtualUp('KeyZ'), 250);
        this.pendingLend = null;
      };
      if (s.organs.focusedHost?.id === pl.host && !this.pressT.has('KeyE')) {
        this.tap('KeyE');
        this.goal = null;
        done();
      } else if (pl.t <= 0) done();
    }
    // aim the camera (yaw/pitch) at the look target
    if (this.lookTarget) {
      const eye = p.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
      const d = this.lookTarget.clone().sub(eye);
      const yaw = Math.atan2(d.x, d.z);
      const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      let dy = yaw - this.camera.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.camera.yaw += dy * Math.min(1, dt * 8);
      this.camera.pitch += (pitch - this.camera.pitch) * Math.min(1, dt * 8);
    }
    // movement → virtual stick in camera space
    let fx = 0, rx = 0;
    if (this.goal) {
      const to = new THREE.Vector3(this.goal.x - p.pos.x, 0, this.goal.z - p.pos.z);
      if (to.length() < 0.7) this.goal = null;
      else {
        const { forward, right } = this.camera.basis();
        to.normalize();
        // unstick: no progress for a moment → sidestep around the obstacle (alternating sides) and hop
        const moved = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z);
        this.lastPos.copy(p.pos);
        if (this.detourT > 0) {
          this.detourT -= dt;
          to.set(-to.z * this.detourSide, 0, to.x * this.detourSide).multiplyScalar(0.85).addScaledVector(to, 0.35).normalize();
        } else if (moved < dt * 0.6) {
          this.stuckT += dt;
          if (this.stuckT > 0.45) {
            this.stuckT = 0;
            this.detourT = 0.9;
            this.detourSide = -this.detourSide;
            this.tap('Space');
          }
        } else this.stuckT = Math.max(0, this.stuckT - dt);
        fx = to.dot(forward);
        rx = to.dot(right);
        const k = this.goal.run ? 1 : 0.6;
        fx *= k;
        rx *= k;
      }
    } else if (this.moveT > 0) {
      this.moveT -= dt;
      fx = this.moveDir.forward;
      rx = this.moveDir.right;
    }
    this.input.virtualMove.y = fx;
    this.input.virtualMove.x = rx;
    // spraying = holding the trigger
    if (this.sprayT > 0) {
      this.sprayT -= dt;
      this.input.virtualDown('Mouse0');
      if (this.sprayT <= 0) this.input.virtualUp('Mouse0');
    }
  }

  /** JSON schema of the commands (hand this to the model as its "tools"). */
  static readonly SCHEMA = {
    move_to: '{x, z, run?} walk/run to a point (auto-steers)',
    move: '{forward, right, seconds?} raw stick (-1..1)',
    look_at: '{x, y, z} turn the camera/aim',
    spray: '{seconds, at?:[x,y,z]} hold the spray can (aim first)',
    jump: '{}',
    dodge: '{} roll; a last-instant dodge triggers Paint Time',
    bomb: '{at?:[x,y,z]} throw: lifts a nearby prop, or throws what you hold / a rock / the empty can (G)',
    select_organ: '{organ: EYE|MOUTH|LEG}',
    lend: '{organ, host} stick an organ on a host by id (walks there first)',
    recall: '{organ} take a lent organ back',
    interact: '{} E: lend selected organ / TAG IT! on a reeling enemy',
    aim: '{on} first-person aim (Z)',
    shout: '{big?, at?:[x,y,z]} X: SHOUT a sound-wave cone (needs the Mouth worn; Mute Harbor) — rings bells, wakes echoes, strips Hush veils',
    stop: '{} cancel everything',
  };
}
