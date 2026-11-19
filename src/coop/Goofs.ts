/**
 * [INPUT]: depends on CoopPartner (pip, rules.line, mood, swagger, trick, event) from ./Coop; ATTACK_STATES from
 *          ./Companion; PIP colours from ./CompanionModel; t() from i18n
 * [OUTPUT]: exports GoofDirector (picks and plays one comic mishap now and then; hush() pauses it), GOOF_WEIGHTS,
 *           GOOF_TIMING, GoofId and GoofPose
 * [POS]: the "good dumb" layer of the co-op partner. Coop.step runs it after the brain set her intents, so a goof
 *        overrides them for a few seconds; Companion.autoDodge still runs after it every step. Swagger.ts hushes it
 *        after she annoyed WAI; sprayCam reports itself to Swagger as an annoyance.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { CoopPartner } from './Coop';
import { ATTACK_STATES } from './Companion';
import { PIP } from './CompanionModel';
import type { Face } from './prompt';
import { t } from '../i18n';

/**
 * The GOOD dumb: 蓝色大肥鱼 is in the game to be funny. A small director now and then picks one clumsy moment
 * from what is going on, plays it out — setup, a visible mishap, an embarrassed beat (bowl pulled down, a fluster
 * line) — and gives the body back to her brains. Never harmful: nothing here damages WAI, costs him paint or
 * health (the paint drop she eats is paid back as a half-heart), blocks him, or happens in a cutscene, a boss
 * telegraph, or when WAI is low.
 *
 * Weights live in GOOF_WEIGHTS (one table). Repeats are damped: a goof used in the last three gets a quarter of
 * its weight, and the same one never twice in a row.
 */
export const GOOF_WEIGHTS: Record<GoofId, number> = {
  sprayCam: 1.0, // sprays WAI / the camera: blue blots over the screen, then sorry
  slip: 1.2, // trips running, slides on her face
  wrongWall: 1.0, // repaints a perfectly fine wall with great confidence
  earlyCheer: 1.3, // celebrates a fight that is not over
  lampPost: 1.0, // walks into a post / wall, sees stars
  fightNap: 0.6, // nods off mid-fight for a second
  eatDrop: 1.1, // eats WAI's paint drop, offers half back
  bowlStuck: 1.0, // bowl over her eyes, walks in a circle
  wrongSalute: 0.8, // salutes… the wrong way
  deepThink: 1.1, // "Deep thinking in progress…": stands still like a model thinking, then a very confident (trivial) answer
};
export const GOOF_TIMING = {
  /** seconds between goofs (random in this range), and before the first one */
  gap: [38, 75] as [number, number],
  first: 30,
};

export type GoofId = 'sprayCam' | 'slip' | 'wrongWall' | 'earlyCheer' | 'lampPost' | 'fightNap' | 'eatDrop' | 'bowlStuck' | 'wrongSalute' | 'deepThink';

/** Deep thinking: how long she stands still before the answer, and how close to WAI's path is "in the way". */
const THINK = { secs: 3.2, pathAhead: 8, pathSide: 1.6, gap: 1.4 };

interface Ctx {
  fight: boolean;
  calm: boolean;
  moving: boolean;
  nearWai: boolean;
}

interface Goof {
  id: GoofId;
  when: (c: Ctx) => boolean;
  dur: number;
  /** false = could not set it up here after all */
  start: () => boolean;
  tick: (k: number, t: number, dt: number) => void;
  end: () => void;
}

/** What the goof wants her body to do this step (applied after the brain's intents). */
export interface GoofPose {
  trip: number;
  dizzy: number;
  salute: number;
}

export class GoofDirector {
  private cd = GOOF_TIMING.first;
  private cur: { g: Goof; t: number } | null = null;
  private recent: GoofId[] = [];
  private goofs: Goof[];
  private v = new THREE.Vector3();
  private aimAt = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private beat = false;
  /** for tests / status */
  readonly count: Partial<Record<GoofId, number>> = {};
  readonly log: string[] = [];
  /** blue ink blots on WAI's screen (CoopApp hands the HUD in via the corner-view hook) */
  inkHit: ((angle: number, heavy: boolean) => void) | null = null;

  constructor(private p: CoopPartner) {
    const pip = p.pip;
    const s = p.s;
    const wai = s.player;
    const say = (en: string, face: Face = 'hide') => p.rules.line('goof', en, true, face);
    const embarrassed = (en: string, hide = 1.6) => {
      p.mood.blush(hide);
      say(en);
    };
    this.goofs = [
      {
        id: 'sprayCam',
        when: (c) => c.calm && c.nearWai,
        dur: 2.6,
        start: () => {
          // she points the paddle at… the camera
          this.aimAt.copy(s.ctx.camera.camera.position);
          say('Watch this — perfect aim!', 'rice');
          return true;
        },
        tick: (k, tt) => {
          pip.goal = null;
          pip.lookAt = this.aimAt;
          if (tt > 0.7 && tt < 1.5) {
            pip.sprayTarget = this.aimAt;
            if (!this.beat) {
              this.beat = true;
              const dc = this.v.copy(pip.pos).sub(wai.pos).setY(0);
              const { forward, right } = s.ctx.camera.basis();
              this.inkHit?.(Math.atan2(dc.dot(right), dc.dot(forward)), tt > 1);
              this.inkHit?.(Math.atan2(dc.dot(right), dc.dot(forward)) + 0.6, false);
              s.ctx.audio.play('splat', { vol: 0.8, pitch: 1.2 });
              p.event('I sprayed WAI right in the face (the camera) by accident', true, { blame: 'cheeky' });
            }
          }
          if (this.once('1.5', tt >= 1.5)) {
            embarrassed('Oops. Your face. …Sorry! It washes off. Probably.');
            p.swagger.annoyed('flood');
          }
          void k;
        },
        end: () => {},
      },
      {
        id: 'slip',
        when: (c) => c.moving && !c.fight,
        dur: 2.2,
        start: () => {
          this.dir.set(Math.sin(pip.facing), 0, Math.cos(pip.facing));
          if (!pip.safeAhead(this.dir, 1.2) || !pip.safeAhead(this.dir, 2.4)) return false;
          s.ctx.effects.comic(pip.pos.clone().setY(pip.pos.y + 1.2), t('WHOOPS!'), PIP.body, 0.6);
          s.ctx.audio.play('squeak', { pos: pip.pos, pitch: 1.3, vol: 0.6 });
          p.event('I slipped on fresh paint and slid on my face', true, { blame: 'cheeky' });
          return true;
        },
        tick: (k, tt) => {
          pip.goal = null;
          this.pose.trip = tt < 1.5 ? Math.min(1, tt * 6) : Math.max(0, 1 - (tt - 1.5) * 2);
          if (tt < 0.7) pip.slide(this.dir, 5 * (1 - tt / 0.7));
          if (tt > 0.15 && tt < 0.7 && Math.random() < 0.4) s.ctx.effects.burst(pip.pos.clone().setY(pip.pos.y + 0.05), PIP.paint, 2, 1.5, 0.05, 6);
          if (this.once('1.5', tt >= 1.5)) embarrassed('I meant to do that. It is called a slide.');
          void k;
        },
        end: () => (this.pose.trip = 0),
      },
      {
        id: 'wrongWall',
        when: (c) => c.calm,
        dur: 3.4,
        start: () => {
          // a wall / prop next to her that is perfectly fine
          const ph = s.physics;
          for (let i = 0; i < 8; i++) {
            const a = pip.facing + (Math.random() - 0.5) * 3;
            this.dir.set(Math.sin(a), 0, Math.cos(a));
            const h = ph.raycast(pip.pos.clone().setY(pip.pos.y + 0.8), this.dir, 6, (c) => ph.tagOf(c) === 'static');
            if (h && h.dist > 1.5 && Math.abs(h.normal.y) < 0.5) {
              this.aimAt.copy(h.point);
              say("This one's corrupted. Definitely. Stand back.", 'angry');
              return true;
            }
          }
          return false;
        },
        tick: (k, tt) => {
          pip.goal = null;
          pip.lookAt = this.aimAt;
          if (tt > 0.5 && tt < 2.2) pip.sprayTarget = this.aimAt;
          if (this.once('2.4', tt >= 2.4)) {
            p.event('I repainted a perfectly normal wall with great confidence', true, { blame: 'miss' });
            embarrassed('…It was already a nice wall. Now it is nicer.');
          }
          void k;
        },
        end: () => {},
      },
      {
        id: 'earlyCheer',
        when: (c) => c.fight && !!this.target() && this.target()!.repaint > 0.55 && this.target()!.repaint < 0.85,
        dur: 2.8,
        start: () => {
          pip.cheerT = 1.4;
          say('We did it! Victory rice!', 'rice');
          return true;
        },
        tick: (k, tt) => {
          if (tt < 1.4) {
            pip.sprayTarget = null;
            pip.goal = null;
          }
          if (this.once('1.5', tt >= 1.5)) {
            p.event(`I cheered before ${this.target()?.id ?? 'the creature'} was even repainted`, true, { blame: 'cheeky' });
            embarrassed('…It is still moving. Never mind. Not yet.', 1.2);
          }
          void k;
        },
        end: () => {},
      },
      {
        id: 'lampPost',
        when: (c) => c.calm && !!this.postNear(),
        dur: 3,
        start: () => {
          const q = this.postNear();
          if (!q) return false;
          this.aimAt.copy(q);
          return true;
        },
        tick: (k, tt) => {
          if (!this.beat) {
            pip.goal = this.aimAt;
            pip.run = false;
            pip.lookAt = this.aimAt.clone().add(this.v.set(Math.random(), 0, 0)); // looking anywhere but ahead
            if (pip.pos.distanceTo(this.aimAt) < 0.75 || tt > 1.6) {
              this.beat = true;
              pip.knockBack(this.aimAt, 2.5);
              s.ctx.effects.comic(pip.pos.clone().setY(pip.pos.y + 1.3), t('BONK!'), PIP.body, 0.7);
              s.ctx.audio.play('crash', { pos: pip.pos, vol: 0.4, pitch: 1.8 });
              p.event('I walked straight into a post', true, { blame: 'cheeky' });
              this.beatAt = tt;
            }
          } else {
            pip.goal = null;
            this.pose.dizzy = 1;
            if (this.once('b0.9', tt - this.beatAt > 0.9)) embarrassed('Who put that there? It was not there before.');
          }
          void k;
        },
        end: () => (this.pose.dizzy = 0),
      },
      {
        id: 'fightNap',
        when: (c) => c.fight && wai.hp > 3 && !this.danger(),
        dur: 2.4,
        start: () => {
          say('Zzz…', 'idle');
          p.event('I nodded off for a second in the middle of a fight', true, { blame: 'doze' });
          return true;
        },
        tick: (k, tt) => {
          pip.goal = null;
          pip.sprayTarget = null;
          pip.mood.sleepy = tt < 1.2 ? 1 : 0;
          if (this.once('1.2', tt >= 1.2)) {
            pip.requestJump();
            p.rules.line('goof', "I'm up! I was… recharging my paddle.", true, 'caught');
          }
          void k;
        },
        end: () => (pip.mood.sleepy = 0),
      },
      {
        id: 'eatDrop',
        when: (c) => !c.fight && !!this.dropNear(),
        dur: 4.5,
        start: () => {
          const d = this.dropNear();
          if (!d) return false;
          this.drop = d;
          return true;
        },
        tick: (k, tt) => {
          const d = this.drop;
          if (!this.beat && d && !d.collected && !d.disposed) {
            const q = d.position();
            pip.goal = q;
            pip.run = true;
            if (Math.hypot(q.x - pip.pos.x, q.z - pip.pos.z) < 0.9 || tt > 3) {
              this.beat = true;
              this.beatAt = tt;
              d.eat('small');
              pip.cheerT = 0.8;
              s.ctx.effects.comic(pip.pos.clone().setY(pip.pos.y + 1.3), t('NOM!'), PIP.body, 0.6);
              p.event('I ate a paint drop that was meant for WAI (and gave him half back)', true, { blame: 'nag' });
              say('Mmm— oh. That was yours? …Half for you.', 'caught');
            }
          } else if (this.beat) {
            pip.goal = null;
            pip.lookAt = wai.pos;
            // the half she gives back: half a heart, never less than he would have had
            if (this.once('b1.2', tt - this.beatAt > 1.2)) {
              wai.heal(1);
              s.ctx.effects.burst(wai.pos.clone().setY(wai.pos.y + 1), '#ff6fa8', 8, 2);
            }
          } else this.cur && (this.cur.t = 99); // the drop is gone: skip
          void k;
        },
        end: () => (this.drop = null),
      },
      {
        id: 'bowlStuck',
        when: (c) => c.calm,
        dur: 3.4,
        start: () => {
          say("Hey! Who turned off the lights?", 'hide');
          p.event('my bowl slid over my eyes and I walked in circles', true, { blame: 'cheeky' });
          this.aimAt.copy(pip.pos);
          return true;
        },
        tick: (k, tt) => {
          pip.mood.hide = 1;
          const a = tt * 2.6;
          pip.goal = this.v.set(this.aimAt.x + Math.sin(a) * 1.2, this.aimAt.y, this.aimAt.z + Math.cos(a) * 1.2);
          pip.run = false;
          if (this.once('2.9', tt > 2.9)) {
            pip.requestJump();
            p.rules.line('goof', 'Got it. Nobody saw that.', true, 'caught');
          }
          void k;
        },
        end: () => (pip.mood.hide = 0),
      },
      {
        id: 'wrongSalute',
        when: (c) => c.calm && c.nearWai,
        dur: 2.6,
        start: () => {
          say('Reporting for duty, captain!', 'portrait');
          return true;
        },
        tick: (k, tt) => {
          pip.goal = null;
          // facing the wrong way, proud as anything
          this.aimAt.copy(pip.pos).multiplyScalar(2).sub(wai.pos);
          pip.lookAt = tt < 1.5 ? this.aimAt : wai.pos;
          this.pose.salute = tt < 1.5 ? 1 : 0;
          if (this.once('1.5', tt >= 1.5)) {
            p.event('I saluted the wrong way (at a wall)', true, { blame: 'cheeky' });
            embarrassed('…You were behind me. I knew that.', 1.2);
          }
          void k;
        },
        end: () => (this.pose.salute = 0),
      },
      {
        id: 'deepThink',
        when: (c) => (c.calm || wai.hp > 3) && !this.inTheWay(),
        dur: THINK.secs + 2.2,
        start: () => {
          if (!p.swagger.speak('think', 'portrait')) return false;
          p.bubble.dots();
          p.event('I stood still for some "deep thinking"', true, { blame: 'cheeky' });
          return true;
        },
        tick: (k, tt) => {
          if (tt < THINK.secs) {
            // a model thinking: stock-still, head tilted, nothing else
            pip.goal = null;
            pip.sprayTarget = null;
            pip.sprayEnemy = null;
            pip.mood.think = 1;
            if (this.inTheWay()) this.cur && (this.cur.t = 99); // WAI needs the way: think somewhere else
            return;
          }
          if (!this.once('answer', true)) return;
          pip.mood.think = 0;
          pip.requestJump();
          pip.cheerT = 0.8;
          // a very confident answer: the obvious, a real crown (useful for once), or something trivial
          if (this.target()) p.swagger.speak('thinkFight', 'angry');
          else if (p.trick('point_crown') === 'pointed at a crown') p.swagger.speak('thinkCrown', 'rice');
          else p.swagger.speak('thinkDone', 'portrait');
          void k;
        },
        end: () => (pip.mood.think = 0),
      },
    ];
  }

  readonly pose: GoofPose = { trip: 0, dizzy: 0, salute: 0 };
  private beatAt = 0;
  private fired = new Set<string>();
  /** true the first time `cond` holds during this goof (one-shot beats) */
  private once(key: string, cond: boolean): boolean {
    if (!cond || this.fired.has(key)) return false;
    this.fired.add(key);
    return true;
  }
  private drop: { position(): THREE.Vector3; eat(by: 'small'): boolean; collected: boolean; disposed: boolean } | null = null;

  /** No goofs until `seconds` from now (she is behaving: Swagger.annoyed). */
  hush(seconds: number): void {
    this.hushUntil = Math.max(this.hushUntil, this.p.time + seconds);
  }
  private hushUntil = 0;
  private wayV = new THREE.Vector3();
  private wayDir = new THREE.Vector3();

  /**
   * Would standing still here be in WAI's way? Too close to him, on the line he is walking along, or in a
   * doorway / narrow passage (walls close on two opposite sides).
   */
  private inTheWay(): boolean {
    const s = this.p.s;
    const pip = this.p.pip;
    const wai = s.player;
    const d = this.wayV.copy(pip.pos).sub(wai.pos).setY(0);
    if (d.length() < THINK.gap) return true;
    const sp = Math.hypot(wai.vel.x, wai.vel.z);
    if (sp > 1) {
      const fx = wai.vel.x / sp, fz = wai.vel.z / sp;
      const ahead = d.x * fx + d.z * fz;
      if (ahead > 0 && ahead < THINK.pathAhead && Math.abs(d.x * fz - d.z * fx) < THINK.pathSide) return true;
    }
    const ph = s.physics;
    const from = pip.pos.clone().setY(pip.pos.y + 0.8);
    const wall = (c: import('@dimforge/rapier3d-compat').Collider) => {
      const tg = ph.tagOf(c);
      return tg === 'static' || tg === 'gate' || tg === 'host' || tg === 'barrier' || tg === 'undrawn';
    };
    for (let i = 0; i < 4; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = this.wayDir.set(Math.sin(a), 0, Math.cos(a));
      if (!ph.raycast(from, dir, 1.6, wall)) continue;
      if (ph.raycast(from, dir.negate(), 1.6, wall)) return true;
    }
    return false;
  }

  get active(): GoofId | null {
    return this.cur?.g.id ?? null;
  }

  private target() {
    const o = this.p.order ?? this.p.auto;
    return o.mode === 'attack' ? o.target ?? null : null;
  }

  /** Something winding up an attack near WAI or her (never goof through a telegraph). */
  private danger(): boolean {
    const s = this.p.s;
    return s.enemies.some((e) => !e.disposed && !e.harmless && e.engaged && ATTACK_STATES.has(e.state) && (e.pos.distanceTo(s.player.pos) < 14 || e.pos.distanceTo(this.p.pip.pos) < 14));
  }

  /** A post / thin pillar / wall corner a couple of metres ahead of her. */
  private postNear(): THREE.Vector3 | null {
    const s = this.p.s;
    const ph = s.physics;
    const pip = this.p.pip;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.dir.set(Math.sin(a), 0, Math.cos(a));
      const h = ph.raycast(pip.pos.clone().setY(pip.pos.y + 0.6), this.dir, 3.5, (c) => ph.tagOf(c) === 'static' || ph.tagOf(c) === 'host');
      if (h && h.dist > 1.2 && Math.abs(h.normal.y) < 0.4) return h.point.clone().setY(pip.pos.y);
    }
    return null;
  }

  private dropNear() {
    const s = this.p.s;
    const pip = this.p.pip;
    for (const d of s.level.drops) {
      if (d.collected || d.disposed) continue;
      const q = d.position();
      if (q.distanceTo(pip.pos) < 7 && Math.abs(q.y - pip.pos.y) < 1 && !s.inWater(q)) return d as unknown as GoofDirector['drop'];
    }
    return null;
  }

  /** Force one (tests / docs / WD_COOP.goof). */
  play(id: GoofId): boolean {
    const g = this.goofs.find((x) => x.id === id);
    if (!g || this.cur) return false;
    return this.begin(g);
  }

  private begin(g: Goof): boolean {
    this.beat = false;
    this.beatAt = 0;
    this.fired.clear();
    if (!g.start()) return false;
    this.cur = { g, t: 0 };
    this.count[g.id] = (this.count[g.id] ?? 0) + 1;
    this.recent.push(g.id);
    if (this.recent.length > 3) this.recent.shift();
    this.log.push(`${this.p.time.toFixed(0)}s ${g.id}`);
    if (this.log.length > 30) this.log.shift();
    return true;
  }

  private context(): Ctx {
    const p = this.p;
    const s = p.s;
    const pip = p.pip;
    const fight = s.enemies.some((e) => !e.disposed && e.engaged && p.fightable(e) && e.pos.distanceTo(s.player.pos) < 20);
    return {
      fight,
      calm: !fight,
      moving: Math.hypot(pip.vel.x, pip.vel.z) > 3 && pip.grounded,
      nearWai: pip.pos.distanceTo(s.player.pos) < 7,
    };
  }

  /** May a goof start now at all? */
  private allowed(): boolean {
    const p = this.p;
    const s = p.s;
    const pip = p.pip;
    if (s.story.locked || s.ctx.camera.inCine || s.completed || s.frozen) return false;
    if (pip.down > 0 || !pip.grounded || pip.slam > 0 || p.mood.asleep || p.chatT > 0 || p.bubble.busy) return false;
    if (s.player.hp <= 2 || s.player.smudged || this.danger()) return false;
    if (s.boss.awake && !s.bossDone) return false;
    if (p.time < this.hushUntil) return false;
    return pip.pos.distanceTo(s.player.pos) < 12;
  }

  /** Runs after the brain set her intents: a goof in progress overrides them. */
  step(dt: number): void {
    const p = this.p;
    if (this.cur) {
      const c = this.cur;
      c.t += dt;
      // trouble: drop the act at once (never goof through danger)
      if (c.t >= c.g.dur || p.pip.down > 0 || this.danger() || p.s.story.locked) {
        c.g.end();
        this.cur = null;
        this.cd = GOOF_TIMING.gap[0] + Math.random() * (GOOF_TIMING.gap[1] - GOOF_TIMING.gap[0]);
        return;
      }
      c.g.tick(c.t / c.g.dur, c.t, dt);
      return;
    }
    this.cd -= dt;
    if (this.cd > 0) return;
    if (!this.allowed()) {
      this.cd = 1;
      return;
    }
    const ctx = this.context();
    const pool = this.goofs.filter((g) => g.when(ctx) && g.id !== this.recent[this.recent.length - 1]);
    let sum = 0;
    const w = pool.map((g) => {
      const x = GOOF_WEIGHTS[g.id] * (this.recent.includes(g.id) ? 0.25 : 1);
      sum += x;
      return x;
    });
    if (!sum) {
      this.cd = 2;
      return;
    }
    let r = Math.random() * sum;
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) {
        if (!this.begin(pool[i])) this.cd = 2;
        return;
      }
    }
  }
}
