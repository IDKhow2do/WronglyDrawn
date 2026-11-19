/**
 * [INPUT]: depends on the PlaySession (enemies, player, events, story, physics); Companion (her body), SpeechBubble,
 *          RuleBrain, LlmBrain, Mood, Goofs, Roast, Moves, Swagger (show-off), Journal, PipLife (hearts ↔ session)
 *          and findPlace from this module; PlayBody from player/PlayBody
 * [OUTPUT]: exports CoopPartner (one partner in one session: commands, standing orders, aggro, step / render /
 *           observe; `bodies` = her body for the world's mechanisms), CoopCommand, COOP_SCHEMA, CoopBrainPref and CoopOrder
 * [POS]: the hub of src/coop: it owns every personality layer and wires the session's events into them. GameSession
 *        calls step() right after WAI's step; CoopApp creates one per level. Her smudge (PipHealth) stays in here:
 *        it never reaches the session, so only WAI's smudge restarts a boss fight.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { PlaySession as GameSession } from '../level/Session';
import type { EnemyBase } from '../enemy/EnemyBase';
import type { PlayerController } from '../player/PlayerController';
import { PLAYER } from '../player/PlayerController';
import { getLang, t } from '../i18n';
import { Companion, ATTACK_STATES, COMPANION } from './Companion';
import { PIP } from './CompanionModel';
import { SpeechBubble } from './SpeechBubble';
import { RuleBrain } from './RuleBrain';
import { LlmBrain } from './LlmBrain';
import { Mood } from './Mood';
import { isFace, STANCES, type Face, type OrderTag, type Stance } from './prompt';
import { Journal } from './Journal';
import { orderAck } from './Chat';
import { CoopMoves, type MoveName } from './Moves';
import { GoofDirector } from './Goofs';
import { Roaster } from './Roast';
import { Swagger } from './Swagger';
import { PipLife } from './PipLife';
import { findPlace } from './Places';
import type { PlayBody } from '../player/PlayBody';

/**
 * The companion's command set — used by the built-in rule brain, the LLM commander
 * (as function-calling tools, see server/coopApi.ts) and external harnesses (window.WD_COOP.act).
 * All high level: Pip steers, aims, dodges and holds the trigger by itself every frame.
 */
export type CoopCommand =
  | { type: 'follow' }
  | { type: 'attack'; target: string }
  | { type: 'draw_aggro'; target: string }
  | { type: 'move_to'; x: number; z: number }
  | { type: 'hold'; seconds?: number }
  | { type: 'spray_at'; x: number; y: number; z: number; seconds?: number }
  | { type: 'jump' }
  | { type: 'dodge' }
  | { type: 'regroup' }
  | { type: 'ping'; target?: string; x?: number; y?: number; z?: number; label?: string }
  | { type: 'say'; text: string; face?: string }
  | { type: 'cheer' }
  | { type: 'stop' }
  | { type: 'mode'; mode: string; target?: string; place?: string }
  | { type: 'trick'; move: string; target?: string; x?: number; y?: number; z?: number };

export const COOP_SCHEMA = {
  follow: '{} stick close to WAI (default)',
  attack: '{target: enemy id} paint that creature from a flank (keeps out of WAI’s line of fire)',
  draw_aggro: '{target: enemy id} taunt it so it chases Pip for ~5 s (protects WAI; Pip can lose hearts)',
  move_to: '{x, z} go there and wait (~8 s)',
  hold: '{seconds?} stay put',
  spray_at: '{x, y, z, seconds?} paint a point',
  jump: '{}',
  dodge: '{} roll away from the nearest threat',
  regroup: '{} pop next to WAI (when lost)',
  ping: '{target? | x,y,z, label?} point something out to WAI (marker + bubble)',
  say: '{text, face?} a short speech bubble (≤ 14 words, current language); face = idle | rice | caught | angry | hide (expression sticker)',
  cheer: '{} happy hop + fast tail wag',
  stop: '{} cancel the current order (back to the built-in brain)',
  mode: '{mode: follow|close|stay|collect|attack|free|goto|wake, target?: enemy id, place?: place id} her STANDING order (what a chat message sets); it holds until changed',
  trick: '{move: slam|throw|bomb|hover|whistle|fetch_paint|point_crown, target?: enemy id | x,y,z} a player move of her own: PAINT SLAM (within 3 m), rice-ball throw, rice-bomb (her gadget, 14 s), jet hover, whistle (rings a veiled moth), fetch paint drops, point out a crown',
};

export type CoopBrainPref = 'auto' | 'rules';

export interface CoopOrder {
  mode: 'follow' | 'attack' | 'aggro' | 'move' | 'hold' | 'spray';
  target?: EnemyBase;
  at?: THREE.Vector3;
  until: number;
  by: 'rules' | 'llm' | 'api';
}

/** Events Pip remembers (fed to the LLM, shown in observe()). */
const MAX_EVENTS = 8;

/**
 * One co-op partner in one GameSession (蓝色大肥鱼, still "pip" in code and in observe()): her body + its brains + aggro + bubbles.
 * GameSession calls step()/render()/targetFor()/prompt()/dispose() (see the `coop` hooks there).
 */
export class CoopPartner {
  readonly pip: Companion;
  readonly rules: RuleBrain;
  readonly llm: LlmBrain;
  readonly bubble: SpeechBubble;
  /** rice, dozing, fluster (cosmetic personality layer) */
  readonly mood: Mood;
  /** her own slam / throws / gadget / hover / whistle (Moves.ts) */
  readonly moves: CoopMoves;
  /** the good dumb: clumsy moments now and then (Goofs.ts) */
  readonly goofs: GoofDirector;
  /** live roasts of what the player just did (Roast.ts) */
  readonly roast: Roaster;
  /** the show-off: fight credit with her real share, brags, "the user is REALLY angry now" (Swagger.ts) */
  readonly swagger: Swagger;
  /** her hearts ↔ the session: redraw, refills, fall price, heart tag (PipLife.ts) */
  readonly life: PipLife;
  /** bodies the world's mechanisms act on besides WAI (springs, presses: level/Ambient, StampingFloor) */
  readonly bodies: readonly PlayBody[];
  private ackCd = 0;
  private lastObjective = '';
  private watchT = 0;
  private bossAwake = false;
  private bossPhase = 0;
  private bossWasDone = false;
  /** WAI is talking to her: she turns to him (s) */
  chatT = 0;
  /** session time (s) */
  time = 0;
  order: CoopOrder | null = null;
  /** standing order from the rule brain (used when no LLM/API order is active) */
  auto: CoopOrder = { mode: 'follow', until: Infinity, by: 'rules' };
  /** the rule brain's own pick (fight what is already fighting, else follow), before the standing order is applied */
  rulesAuto: CoopOrder = { mode: 'follow', until: Infinity, by: 'rules' };
  /** which creatures are chasing Pip right now, and until when */
  private aggro = new Map<EnemyBase, { want: boolean; until: number; cd: number; cur: 'wai' | 'pip' }>();
  readonly events: string[] = [];
  /** damage dealt per enemy id (Pip's paint) */
  readonly dealt = new Map<string, number>();
  private standT = 0;
  private stand = new THREE.Vector3();
  private standFor: EnemyBase | null = null;
  private standSide = 1;
  private following = false;
  private followT = 0;
  private rescueCd = 0;
  private tmp2 = new THREE.Vector3();
  private pingT = 0;
  private aim = new THREE.Vector3();
  private followGoal = new THREE.Vector3();
  private lastDealtAt = new Map<EnemyBase, number>();
  private unsub: (() => void)[] = [];
  private tmp = new THREE.Vector3();
  readonly name: string;
  /** What WAI told her to do, until he says otherwise (chat / WD_COOP.act({type:'mode'})). */
  standing: { mode: Stance; at?: THREE.Vector3; target?: EnemyBase; place?: string; since: number; arrived?: number } = { mode: 'follow', since: 0 };
  private wanderT = 0;
  private wander = new THREE.Vector3();
  private lastLlmHold = -99;
  /** spawn-in: waiting for a calm moment → the pencil draws her → she pops up */
  private spawn: { phase: 'wait' | 'draw' | 'pop' | 'done'; t: number; redraw?: boolean } = { phase: 'wait', t: 0 };
  /** catch-up teleports (the last resort): each one is drawn in by the pencil */
  redraws = 0;

  constructor(
    readonly s: GameSession,
    public brainPref: CoopBrainPref,
    /** her memory of the run (owned by CoopApp so it survives level changes) */
    readonly journal: Journal = new Journal(),
  ) {
    const p = s.player;
    const back = new THREE.Vector3(-Math.sin(p.facing), 0, -Math.cos(p.facing));
    this.pip = new Companion(s, p.pos.clone().addScaledVector(back, 1.6).add(new THREE.Vector3(back.z * 1.2, 0, -back.x * 1.2)));
    this.pip.teleportNear(p.pos, p.facing, 'spawn');
    this.pip.teleports = 0;
    this.bubble = new SpeechBubble(s.ctx.camera.camera);
    this.name = t('Fat Fish');
    this.rules = new RuleBrain(this);
    this.mood = new Mood(this);
    this.llm = new LlmBrain(this);
    this.moves = new CoopMoves(this);
    this.goofs = new GoofDirector(this);
    this.roast = new Roaster(this);
    this.swagger = new Swagger(this);
    this.life = new PipLife(this);
    this.bodies = [this.pip];
    CoopMoves.shareRoom = () => this.swagger.ledger.room(); // she stays under FIGHT.shareCap of a fight's paint
    this.pip.spray.onHitEnemy = (o, paint) => {
      const e = o as EnemyBase;
      this.swagger.ledger.mine(paint);
      this.dealt.set(e.id, (this.dealt.get(e.id) ?? 0) + 1);
      this.lastDealtAt.set(e, this.time);
    };
    this.pip.health.onSmudged = () => {
      this.event('my hearts ran out: I got smudged', true, { blame: 'down' });
      this.rules.react('down');
      for (const a of this.aggro.values()) a.want = false;
    };
    this.pip.onHurt = () => {
      this.event('I got hit');
      if (Math.random() < 0.45) this.mood.fluster('hurt');
      else this.rules.react('hurt');
    };
    this.pip.onPoked = () => this.mood.poke();
    this.pip.onTeleport = () => {
      const why = this.pip.lastTeleport;
      if (why === 'smudged') return; // PipLife logs the redraw
      this.event(`I fell behind and popped back next to WAI (${why})`, why !== 'spawn', { blame: 'lost' });
      // wandered off (too far / outside the boss arena) — not stuck on a wall, which is the route's fault, not hers
      if (why === 'far' || why === 'arena') this.swagger.annoyed('lost');
    };
    const ev = s.events;
    this.unsub.push(
      ev.on('player:damaged', ({ hp }) => {
        if (hp < PLAYER.maxHp) {
          this.journal.count('WAI hit');
          this.event(`WAI got hit (hp ${hp}/${PLAYER.maxHp})`);
          this.rules.react(hp <= 2 ? 'waiLow' : 'waiHurt');
        }
      }),
      ev.on('enemy:stunned', ({ id }) => {
        const mine = (this.dealt.get(id) ?? 0) > 20;
        this.journal.count('creatures repainted');
        this.event(`${id} was repainted${mine ? ' (I helped)' : ''}`, true, { key: true });
        this.rules.react('repainted');
      }),
      ev.on('enemy:noticed', ({ id }) => {
        this.event(`${id} noticed us`);
        this.rules.noticed(id);
      }),
      ev.on('player:smudged', () => {
        this.journal.count('WAI smudged');
        this.event('WAI got smudged and respawned', true, { key: true });
      }),
      ev.on('crown:collected', ({ count }) => {
        this.event(`WAI found a crown (${count} so far)`, true, { key: count % 5 === 0 });
        this.swagger.brag('crown');
      }),
      ev.on('region:entered', ({ name }) => {
        this.event(`we entered: ${name}`);
        // she got there first: a step or two ahead of WAI along the way he is walking
        const v = s.player.vel, sp = Math.hypot(v.x, v.z);
        if (sp > 1 && ((this.pip.pos.x - s.player.pos.x) * v.x + (this.pip.pos.z - s.player.pos.z) * v.z) / sp > 1.5) this.swagger.brag('first');
      }),
      ev.on('organ:collected', ({ organ }) => this.event(`WAI got the ${String((organ as { type?: string }).type ?? 'organ')} sticker`, true, { key: true })),
      ev.on('organ:lent', ({ organ, hostId }) => this.event(`WAI lent the ${String((organ as { type?: string }).type ?? 'organ')} to ${hostId}`)),
      ev.on('encore:cashout', ({ mult }) => this.event(`WAI cashed out an ENCORE at x${mult}`)),
      ev.on('level:complete', () => this.event(`level ${this.s.levelId} complete`, true, { key: true })),
      ev.on('paint:collected', () => {
        this.journal.count('rice');
        if (this.mood.rice % 5 === 4) this.event(`WAI keeps picking up paint drops = rice for me (${this.mood.rice + 1} this level)`);
        this.mood.onRice();
      }),
      ev.on('organ:collected', () => this.rules.react('curious')),
      ev.on('city:awake', () => this.rules.line('home', undefined, true, 'rice')),
      ev.on('face:woken', ({ count }) => {
        this.event(`a Guardian woke up (${count}/3)`, true, { key: true });
        this.rules.react('woken');
      }),
    );
    this.journal.note(`${this.journal.totalEvents ? 'next level' : 'the run started'}: level "${s.levelId}", objective: ${s.objective().title}`, { key: true });
    this.lastObjective = s.objective().title;
    if (brainPref === 'auto') void this.llm.probe();
    // she is not there yet: the kid's pencil draws her in first (see spawnIn)
    this.pip.shown = false;
    this.pip.squash = 0.02;
    this.llm.onOrder = (o) => void this.setStance(o, 'player');
  }

  /** Remember something (first person). `journal: false` = debug-only, not part of her memory. */
  event(text: string, journal = true, opts: { key?: boolean; blame?: 'miss' | 'doze' | 'nag' | 'lost' | 'down' | 'cheeky' } = {}): void {
    if (journal) this.journal.note(text, opts);
    this.events.push(`${this.time.toFixed(0)}s ${text}`);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  get usingLlm(): boolean {
    return this.brainPref === 'auto' && this.llm.live;
  }

  say(text: string, fromLlm = false, face?: Face): void {
    // no sticker chosen → one that fits how she feels right now
    const st = this.mood.state;
    const f = face ?? (st === 'dozing' ? 'idle' : st === 'flustered' ? 'hide' : st === 'excited' ? 'rice' : 'portrait');
    this.bubble.say(this.name, text, 3.2, fromLlm, f);
    this.event(`I said "${text}"`, false);
  }

  enemy(id: string): EnemyBase | undefined {
    return this.s.enemies.find((e) => e.id === id && !e.disposed);
  }

  /** Can Pip fight this one? (story-safe: the Eraser only once the boss fight is on) */
  fightable(e: EnemyBase): boolean {
    if (e.disposed || e.harmless) return false;
    if (e === this.s.boss && !this.s.boss.awake) return false;
    return true;
  }

  // ───────── commands ─────────
  act(cmd: CoopCommand, by: 'llm' | 'api' = 'api'): string {
    const now = this.time;
    const pip = this.pip;
    // an outside voice gives her an order: "哦鲸鲸，听到了。" (now and then)
    if (by === 'api' && now > this.ackCd && ['follow', 'attack', 'draw_aggro', 'move_to', 'hold', 'regroup'].includes(cmd.type)) {
      this.ackCd = now + 12;
      this.rules.line('ack', undefined, true);
    }
    switch (cmd.type) {
      case 'follow':
        // the model saying "follow" must not cancel what WAI told her to do
        if (by === 'llm') return this.standing.mode === 'follow' ? 'following' : `standing order is ${this.standing.mode}`;
        this.order = { mode: 'follow', until: now + 10, by };
        return 'following';
      case 'attack':
      case 'draw_aggro': {
        const e = this.enemy(cmd.target);
        if (!e) return `no enemy ${cmd.target}`;
        if (!this.fightable(e)) return `${cmd.target} can't be fought now`;
        if (e.pos.distanceTo(this.s.player.pos) > 20) return `${cmd.target} is too far from WAI (Pip stays with WAI)`;
        // told to stay: she paints what comes within reach from where she stands, she does not walk off to flank
        if (by === 'llm' && this.standing.mode === 'stay') return 'WAI told me to stay here (I paint from where I stand)';
        this.order = { mode: cmd.type === 'attack' ? 'attack' : 'aggro', target: e, until: now + (cmd.type === 'attack' ? 10 : 6), by };
        if (cmd.type === 'draw_aggro') this.startAggro(e, 5.5);
        return cmd.type === 'attack' ? `attacking ${e.id}` : `taunting ${e.id}`;
      }
      case 'move_to': {
        if (by === 'llm') {
          // the model may reposition her a little, never park her far from WAI or break a "stay"
          if (this.standing.mode === 'stay') return 'WAI told me to stay here';
          if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.z) || Math.hypot(cmd.x - this.s.player.pos.x, cmd.z - this.s.player.pos.z) > 12) return 'too far from WAI';
        }
        const y = this.groundY(cmd.x, cmd.z) ?? this.s.player.pos.y;
        this.order = { mode: 'move', at: new THREE.Vector3(cmd.x, y, cmd.z), until: now + 8, by };
        return 'moving';
      }
      case 'hold':
        if (by === 'llm') {
          // a model that keeps answering "hold" must not freeze her: a short pause, rarely
          if (now - this.lastLlmHold < 25) return 'no — keep moving (hold is only for a short pause)';
          this.lastLlmHold = now;
          this.order = { mode: 'hold', at: pip.pos.clone(), until: now + Math.min(3, cmd.seconds ?? 2), by };
          return 'pausing 3 s';
        }
        this.order = { mode: 'hold', at: pip.pos.clone(), until: now + Math.min(20, cmd.seconds ?? 6), by };
        return 'holding';
      case 'spray_at':
        this.order = { mode: 'spray', at: new THREE.Vector3(cmd.x, cmd.y, cmd.z), until: now + Math.min(6, cmd.seconds ?? 2), by };
        return 'spraying';
      case 'jump':
        pip.requestJump();
        return 'ok';
      case 'dodge': {
        const near = this.nearestThreat();
        const away = near ? pip.pos.clone().sub(near.pos).setY(0) : pip.forward().negate();
        const perp = new THREE.Vector3(away.z, 0, -away.x).normalize();
        return pip.requestDodge(perp) ? 'dodged' : 'cannot dodge now';
      }
      case 'regroup':
        return pip.teleportNear(this.s.player.pos, this.s.player.facing, 'regroup') ? 'regrouped' : 'no room next to WAI';
      case 'ping': {
        const e = cmd.target ? this.enemy(cmd.target) : undefined;
        const host = !e && cmd.target ? this.s.organs.hostById(cmd.target) : undefined;
        const at = e ? e.pos.clone().setY(e.topY + 0.6) : host ? host.pos.clone().setY(host.pos.y + 2) : cmd.x !== undefined && cmd.z !== undefined ? new THREE.Vector3(cmd.x, cmd.y ?? this.s.player.pos.y + 1.5, cmd.z) : null;
        if (!at) return 'nothing to ping';
        this.ping(at, cmd.label);
        return 'pinged';
      }
      case 'say':
        this.say(String(cmd.text ?? ''), by === 'llm', isFace(cmd.face) ? cmd.face : undefined);
        return 'said';
      case 'cheer':
        pip.cheerT = 1.4;
        this.s.ctx.audio.play('squeak', { pos: pip.pos, pitch: 1.8, vol: 0.5 });
        return 'yay';
      case 'stop':
        this.order = null;
        return 'stopped';
      case 'trick':
        return this.trick(String(cmd.move ?? ''), cmd.target, cmd.x !== undefined && cmd.z !== undefined ? new THREE.Vector3(cmd.x, cmd.y ?? this.pip.pos.y, cmd.z) : null);
      case 'mode': {
        const mode = String(cmd.mode ?? '').toLowerCase();
        if (mode !== 'wake' && !(STANCES as readonly string[]).includes(mode)) return `unknown mode ${mode}`;
        const res = this.setStance({ mode: mode as OrderTag['mode'], arg: cmd.target ?? cmd.place }, by === 'llm' ? 'player' : by);
        if (by === 'api') {
          const ack = orderAck(res.startsWith('no place') ? 'nowhere' : mode);
          this.say(ack.text, false, ack.face);
        }
        return res;
      }
    }
    return 'unknown command';
  }

  /** One of her player moves (rule brain, LLM `trick`, WD_COOP.act). */
  trick(move: string, target?: string, at?: THREE.Vector3 | null): string {
    const m = move.toLowerCase();
    if (m === 'fetch_paint') return this.setStance({ mode: 'collect' }, 'api');
    if (m === 'point_crown') {
      const wai = this.s.player.pos;
      const c = this.s.level.crowns.filter((k) => !k.collected && !k.hidden && k.pos.distanceTo(wai) < 30).sort((a, b) => a.pos.distanceTo(wai) - b.pos.distanceTo(wai))[0];
      if (!c) return 'no crown around';
      this.pingT = 0;
      this.ping(c.pos.clone().setY(c.pos.y + 0.8), '♛');
      return 'pointed at a crown';
    }
    if (!['slam', 'throw', 'bomb', 'hover', 'whistle'].includes(m)) return `unknown move ${m}`;
    const e = target ? this.enemy(target) : undefined;
    if (target && (!e || !this.fightable(e))) return `no enemy ${target} to use it on`;
    const foe = e ?? (m === 'slam' || m === 'throw' || m === 'bomb' ? this.nearestThreat() : null);
    const where = at ?? (foe && foe.pos.distanceTo(this.s.player.pos) < 24 ? this.aimPoint(foe, new THREE.Vector3()) : null);
    return this.moves.do(m as MoveName, where, foe && !at ? foe : null);
  }

  /** Point at something: a lime marker + "!" over it, Pip faces it. */
  ping(at: THREE.Vector3, label?: string): void {
    if (this.pingT > 0) return;
    this.pingT = 1.5;
    const fx = this.s.ctx.effects;
    fx.comic(at, label ? label.slice(0, 16) : '!', PIP.body, 0.9);
    fx.ring(at.clone().setY(at.y - 0.4), PIP.body, 2.2);
    fx.burst(at, PIP.body, 8, 2.5);
    this.pip.lookAt = at.clone();
    this.s.ctx.audio.play('blink', { pos: at, vol: 0.5 });
  }

  /** A named spot for "go to …" (./Places). */
  findPlace(name: string): { id: string; pos: THREE.Vector3 } | null {
    return findPlace(this.s, name);
  }

  /** Nearest paint drop she could fetch (near WAI, roughly on his floor). */
  private nearestDrop(maxFromWai = 24): { pos: THREE.Vector3; d: unknown } | null {
    const wai = this.s.player.pos;
    let best: { pos: THREE.Vector3; d: unknown } | null = null;
    let bd = Infinity;
    for (const d of this.s.level.drops) {
      if (d.collected || d.disposed) continue;
      const p = d.position();
      if (p.distanceTo(wai) > maxFromWai || Math.abs(p.y - wai.y) > 4 || this.s.inWater(p)) continue;
      const dd = p.distanceTo(this.pip.pos);
      if (dd < bd) {
        bd = dd;
        best = { pos: p, d };
      }
    }
    return best;
  }

  /**
   * WAI gave her a standing order (typed in chat, or a harness). It replaces the previous one and
   * holds until he changes it — the rule brain and the LLM work inside it, never against it.
   */
  setStance(o: OrderTag, by: 'player' | 'api' = 'player'): string {
    const pip = this.pip;
    if (by === 'player') this.swagger.ordered(o.mode);
    if (this.mood.asleep) this.mood.wakeQuietly();
    if (o.mode === 'wake') {
      this.event('WAI told me to wake up', true);
      return 'awake';
    }
    const st: CoopPartner['standing'] = { mode: o.mode, since: this.time };
    let desc: string = o.mode;
    if (o.mode === 'stay') {
      st.at = pip.pos.clone();
      desc = 'stay / wait here';
    } else if (o.mode === 'goto') {
      const place = o.arg ? this.findPlace(o.arg) : null;
      if (!place) return `no place called "${o.arg ?? ''}"`;
      st.at = place.pos.clone();
      st.place = place.id;
      desc = `go to ${place.id}`;
    } else if (o.mode === 'attack') {
      const e = o.arg ? this.enemy(o.arg) : undefined;
      if (e && this.fightable(e)) st.target = e;
      desc = `attack${st.target ? ' ' + st.target.id : ' (whatever is around)'}`;
    } else if (o.mode === 'collect') desc = 'collect paint drops (rice)';
    else if (o.mode === 'free') desc = 'do my own thing (play by myself)';
    else if (o.mode === 'close') desc = 'stay right beside him';
    else desc = 'follow him';
    this.standing = st;
    this.order = null;
    this.wanderT = 0;
    this.event(`WAI told me to: ${desc}${by === 'api' ? ' (via the API)' : ''} — my standing order now`, true, { key: true });
    // the model hears about it soon
    this.llm.nudge(0.6);
    return `standing order: ${desc}`;
  }

  /** The standing order → what her body does when no short-lived order is active. Runs after the rule brain. */
  private applyStance(dt: number): void {
    const s = this.s;
    const st = this.standing;
    const pip = this.pip;
    const wai = s.player;
    const base = this.rulesAuto; // the rule brain's pick: fight what is already fighting, else follow
    this.auto = base.target && !this.fightable(base.target) ? { mode: 'follow', until: Infinity, by: 'rules' } : base;
    const fight = base.mode === 'attack' && base.target;
    const back = (line: string, why: string) => {
      this.standing = { mode: 'follow', since: this.time };
      this.event(`${why}: back to following WAI`, true);
      this.rules.line('ack', line, true);
    };
    // never left behind for good
    if (st.mode !== 'follow' && st.mode !== 'close' && pip.pos.distanceTo(wai.pos) > 40) return back("You went too far. I'm coming!", 'WAI went too far away');
    switch (st.mode) {
      case 'follow':
        return;
      case 'close':
        if (fight && base.target!.pos.distanceTo(wai.pos) > 7) this.auto = { mode: 'follow', until: Infinity, by: 'rules' };
        return;
      case 'stay':
        this.auto = { mode: 'hold', at: st.at!, until: Infinity, by: 'rules' };
        return;
      case 'goto': {
        this.auto = { mode: 'move', at: st.at!, until: Infinity, by: 'rules' };
        if (st.arrived === undefined && Math.hypot(pip.pos.x - st.at!.x, pip.pos.z - st.at!.z) < 2.2) {
          st.arrived = this.time;
          this.event(`I arrived at ${st.place}`, true);
          this.rules.line('ack', "I'm here. Now what?", true);
        }
        if (st.arrived !== undefined && this.time - st.arrived > 25) back('Nothing here. Coming back.', `nothing to do at ${st.place}`);
        return;
      }
      case 'collect': {
        if (fight) return;
        const drop = this.nearestDrop();
        if (!drop) return back('No more rice around here.', 'no paint drops left nearby');
        this.auto = { mode: 'move', at: drop.pos, until: Infinity, by: 'rules' };
        return;
      }
      case 'attack': {
        let e = st.target && this.fightable(st.target) && st.target.pos.distanceTo(wai.pos) < 30 ? st.target : undefined;
        if (!e) e = fight ? base.target : this.nearestFoe(26);
        if (!e) return back('Nothing left to paint. Break time?', 'nothing left to fight nearby');
        st.target = e;
        this.auto = { mode: 'attack', target: e, until: Infinity, by: 'rules' };
        return;
      }
      case 'free': {
        if (fight) return;
        const drop = this.nearestDrop(22);
        if (drop) {
          this.auto = { mode: 'move', at: drop.pos, until: Infinity, by: 'rules' };
          return;
        }
        const e = this.nearestFoe(18, true);
        if (e) {
          this.auto = { mode: 'attack', target: e, until: Infinity, by: 'rules' };
          return;
        }
        // nothing to do: potter about near WAI
        this.wanderT -= dt;
        if (this.wanderT <= 0 || pip.pos.distanceTo(this.wander) < 0.8) {
          this.wanderT = 4 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
          const x = wai.pos.x + Math.sin(a) * r, z = wai.pos.z + Math.cos(a) * r;
          const y = this.groundY(x, z);
          if (y !== null && Math.abs(y - wai.pos.y) < 1.2 && !s.inWater(this.tmp2.set(x, y, z))) this.wander.set(x, y, z);
          else this.wander.copy(wai.pos);
        }
        this.auto = { mode: 'move', at: this.wander, until: Infinity, by: 'rules' };
        return;
      }
    }
  }

  /** Nearest creature she may pick a fight with herself (never the sleeping boss; `small` = not the boss at all). */
  private nearestFoe(maxFromWai: number, small = false): EnemyBase | undefined {
    const wai = this.s.player.pos;
    let best: EnemyBase | undefined;
    let bd = Infinity;
    for (const e of this.s.enemies) {
      if (!this.fightable(e) || (small && e === this.s.boss)) continue;
      if (e.pos.distanceTo(wai) > maxFromWai || Math.abs(e.pos.y - wai.y) > 6) continue;
      const d = e.pos.distanceTo(this.pip.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Drawn in again by the pencil (after a catch-up teleport or a smudge) instead of popping into view. */
  redraw(): void {
    this.redraws++;
    this.pip.squash = 0.02;
    this.spawn = { phase: 'wait', t: 0, redraw: true };
  }

  /** The kid's pencil draws her in (like WAI's intro); she lies flat as a doodle, then pops up. */
  private spawnIn(dt: number, canAct: boolean): boolean {
    const sp = this.spawn;
    if (sp.phase === 'done') return true;
    const pip = this.pip;
    const fx = this.s.ctx.effects;
    if (sp.phase === 'wait') {
      if (!canAct) return false;
      const story = this.s.story as unknown as { pencilDraw?: (at: THREE.Vector3, dur?: number) => void };
      pip.shown = true;
      pip.squash = 0.02;
      if (typeof story.pencilDraw === 'function') {
        story.pencilDraw(pip.pos.clone().setY(pip.pos.y + 0.05), sp.redraw ? 0.8 : 1.3);
        sp.t = sp.redraw ? 0.9 : 1.45;
      } else {
        // no pencil on this level: a paint burst does the job
        fx.burst(pip.pos.clone().setY(pip.pos.y + 0.4), PIP.body, 18, 4);
        fx.ring(pip.pos.clone().setY(pip.pos.y + 0.05), PIP.body, 1.6);
        sp.t = 0.35;
      }
      sp.phase = 'draw';
      this.event(`I was drawn into the level next to WAI`, false);
      return false;
    }
    sp.t -= dt;
    if (sp.phase === 'draw') {
      // the outline fills in while the pencil scribbles
      pip.squash = 0.02 + 0.05 * Math.min(1, Math.max(0, 1 - sp.t / (sp.redraw ? 0.9 : 1.45)));
      if (sp.t <= 0) {
        sp.phase = 'pop';
        sp.t = 0.38;
        fx.burst(pip.pos.clone().setY(pip.pos.y + 0.5), PIP.body, 18, 4.5);
        fx.burst(pip.pos.clone().setY(pip.pos.y + 0.5), '#ffffff', 10, 3);
        fx.ring(pip.pos.clone().setY(pip.pos.y + 0.05), PIP.body, 1.8);
        this.s.ctx.audio.play('pop', { pos: pip.pos, vol: 0.6, pitch: 1.2 });
        pip.cheerT = 0.9;
      }
      return false;
    }
    // pop: up with an overshoot
    const k = 1 - Math.max(0, sp.t) / 0.38;
    pip.squash = k < 0.6 ? 0.07 + (1.28 - 0.07) * (k / 0.6) : 1.28 - 0.28 * ((k - 0.6) / 0.4);
    if (sp.t <= 0) {
      pip.squash = 1;
      sp.phase = 'done';
      if (!sp.redraw) this.rules.line('hello', undefined, true);
      return true;
    }
    return false;
  }

  private groundY(x: number, z: number): number | null {
    const ph = this.s.physics;
    const top = Math.max(this.s.player.pos.y, this.pip.pos.y) + 6;
    const g = ph.raycast(new THREE.Vector3(x, top, z), new THREE.Vector3(0, -1, 0), top + 15, (c) => ph.tagOf(c) === 'static' || ph.tagOf(c) === 'gate');
    return g ? g.point.y : null;
  }

  nearestThreat(): EnemyBase | null {
    let best: EnemyBase | null = null;
    let bd = 1e9;
    for (const e of this.s.enemies) {
      if (!this.fightable(e)) continue;
      const d = e.pos.distanceTo(this.pip.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ───────── aggro ─────────
  startAggro(e: EnemyBase, seconds: number): boolean {
    const a = this.aggro.get(e) ?? { want: false, until: 0, cd: 0, cur: 'wai' as 'wai' | 'pip' };
    if (a.cd > this.time || this.pip.down > 0 || !e.engaged) return false;
    a.want = true;
    a.until = this.time + seconds;
    a.cd = this.time + seconds + 7;
    this.aggro.set(e, a);
    this.event(`I taunted ${e.id} so it chases me instead of WAI`);
    return true;
  }

  aggroOn(e: EnemyBase): boolean {
    return this.aggro.get(e)?.cur === 'pip';
  }

  /**
   * Who an enemy hunts this step. Pip only ever takes the aggro of a creature that is already
   * fighting, and the switch (both ways) only happens between attacks, never mid-telegraph
   * (except that a smudged Pip is dropped at once).
   */
  targetFor(e: EnemyBase): PlayerController {
    const a = this.aggro.get(e);
    const wai = this.s.player;
    if (!a) return wai;
    const pip = this.pip;
    const want = a.want && this.time < a.until && pip.down <= 0 && pip.pos.distanceTo(e.pos) < 18 && e.engaged;
    if (!want) a.want = false;
    const desired = want ? 'pip' : 'wai';
    if (desired !== a.cur && (!ATTACK_STATES.has(e.state) || pip.down > 0)) {
      a.cur = desired;
      if (desired === 'pip') this.event(`${e.id} is chasing me`, false);
    }
    return a.cur === 'pip' ? (pip as unknown as PlayerController) : wai;
  }

  // ───────── per step (from GameSession.step, right after WAI's step) ─────────
  step(dt: number): void {
    const s = this.s;
    this.time += dt;
    this.pingT = Math.max(0, this.pingT - dt);
    const pip = this.pip;
    const wai = s.player;
    const canAct = !s.story.locked && !s.ctx.camera.inCine && !s.completed;
    // not drawn in yet: nothing else happens (she is a flat doodle on the ground)
    if (!this.spawnIn(dt, canAct && !s.frozen)) {
      this.journal.now += dt;
      pip.goal = null;
      pip.sprayTarget = null;
      pip.step(dt, false);
      return;
    }
    this.life.step();
    // lost? (canal, off the island, stuck, far behind, outside the locked boss arena)
    // (a standing order like "stay here" lets WAI walk further off before she pops after him)
    // far behind is fine while she has a route and is making progress along it; only lost for real (no route,
    // no progress) — or absurdly far — counts
    const dW = pip.pos.distanceTo(wai.pos);
    const far = dW > (this.standing.mode === 'follow' || this.standing.mode === 'close' ? 30 : 46) && (dW > 95 || pip.navStuck());
    pip.catchUp = dW > 11 && (this.standing.mode === 'follow' || this.standing.mode === 'close');
    const arenaLocked = s.boss.awake && !s.bossDone;
    const outsideArena = arenaLocked && wai.pos.distanceTo(s.arena.center) < s.arena.radius + 1 && pip.pos.distanceTo(s.arena.center) > s.arena.radius + 0.5;
    const rescue = pip.needsRescue();
    this.rescueCd -= dt;
    if ((rescue || far || outsideArena) && !wai.smudged && wai.grounded && this.rescueCd <= 0 && pip.down <= 0) {
      const why = rescue ? rescue : far ? 'far' : 'arena';
      // into the arena: put "behind WAI" on the arena's inner side (he may stand right at its edge)
      const yaw = why === 'arena' ? Math.atan2(wai.pos.x - s.arena.center.x, wai.pos.z - s.arena.center.z) : wai.facing;
      const from = pip.pos.clone();
      if (pip.teleportNear(wai.pos, yaw, why, true)) {
        // the kid's eraser rubs her out where she was, the pencil draws her back in next to WAI
        this.s.ctx.effects.burst(from.setY(from.y + 0.5), '#ffffff', 14, 3.5);
        this.life.fell(why);
        this.redraw();
        if (why === 'blocked' || why === 'no-progress' || why === 'canal') this.mood.fluster('lost');
        else this.rules.react('teleported');
        this.rescueCd = 1.5; // never pop every frame
      } else this.rescueCd = 0.5; // no room next to WAI right now
    }
    // brains (think) → order → intents
    this.journal.now += dt;
    this.chatT = Math.max(0, this.chatT - dt);
    this.watchT -= dt;
    if (this.watchT <= 0) {
      this.watchT = 0.5;
      this.watch();
    }
    this.rules.update(dt);
    this.applyStance(dt);
    this.mood.update(dt, canAct);
    // fetching: a drop she reaches is picked up for WAI (his heal, her rice)
    if (this.standing.mode === 'collect' || this.standing.mode === 'free') {
      for (const d of s.level.drops) {
        if (d.collected || d.disposed) continue;
        const q = d.position();
        if (Math.hypot(q.x - pip.pos.x, q.z - pip.pos.z) < 0.95 && Math.abs(q.y - pip.pos.y) < 1.8) d.eat('wai');
      }
    }
    if (this.brainPref === 'auto') this.llm.update(dt);
    const ot = this.order?.target;
    if (this.order && (this.time > this.order.until || (ot && (!this.fightable(ot) || ot.pos.distanceTo(wai.pos) > 24)))) this.order = null;
    // a model's "wait / go there / paint that spot" never keeps her from keeping up with WAI
    const od = this.order;
    if (od && od.by === 'llm' && (od.mode === 'hold' || od.mode === 'move' || od.mode === 'spray') && (this.standing.mode === 'follow' || this.standing.mode === 'close') && pip.pos.distanceTo(wai.pos) > 8) this.order = null;
    this.execute(this.order ?? this.auto, dt);
    this.moves.step(dt);
    this.goofs.step(dt);
    this.swagger.step(dt);
    if (canAct) this.roast.step(dt);
    const gp = this.goofs.pose;
    pip.pose.trip = gp.trip;
    pip.pose.dizzy = gp.dizzy;
    pip.pose.salute = gp.salute;
    const threat = pip.autoDodge(s.enemies);
    if (threat) this.rules.dodged(threat);
    pip.step(dt, canAct);
  }

  /** Slow polls for things that have no event: the objective line, the boss fight's start / phase / end. */
  private watch(): void {
    const s = this.s;
    const title = s.objective().title;
    if (title !== this.lastObjective) {
      this.lastObjective = title;
      this.event(`objective is now: ${title}`, true, { key: true });
    }
    const boss = s.boss as unknown as { awake: boolean; id: string; phase?: number };
    if (boss.awake && !this.bossAwake && !s.bossDone) {
      this.bossAwake = true;
      this.bossPhase = boss.phase ?? 1;
      this.event(`the boss fight started (${boss.id})`, true, { key: true });
    }
    if (this.bossAwake && !s.bossDone && typeof boss.phase === 'number' && boss.phase !== this.bossPhase) {
      this.bossPhase = boss.phase;
      this.event(`the boss (${boss.id}) went into phase ${boss.phase}`, true, { key: true });
    }
    if (s.bossDone && !this.bossWasDone) {
      this.bossWasDone = true;
      this.event(`the boss (${boss.id}) was repainted: fight won`, true, { key: true });
    }
  }

  /** WAI typed a line to her: she turns to him and thinks (the answer comes via answered()). */
  heard(q: string): void {
    this.chatT = 12;
    const dozing = this.mood.asleep;
    if (dozing) this.mood.wakeQuietly();
    this.pip.mood.think = 1;
    this.bubble.think(this.name, t('Hmm…'), dozing ? 'caught' : 'portrait');
    this.event(`WAI spoke to me${dozing ? ' while I was dozing' : ''}`, false);
    void q;
  }

  /** The answer is out (LLM or canned): it becomes part of the chat history. */
  answered(q: string, a: string, face: Face, llm: boolean): void {
    this.pip.mood.think = 0;
    this.chatT = 4;
    this.journal.addChat(q, `[${face}] ${a}`, llm);
  }

  /** Turn the active order into Pip's intents (goal / spray target / look). */
  private execute(o: CoopOrder, dt: number): void {
    const pip = this.pip;
    const wai = this.s.player;
    pip.sprayTarget = null;
    pip.sprayEnemy = null;
    pip.lookAt = null;
    switch (o.mode) {
      case 'attack':
      case 'aggro': {
        const e = o.target!;
        this.aimPoint(e, this.aim);
        this.standT -= dt;
        if (this.standFor !== e || this.standT <= 0 || this.stand.distanceTo(e.pos) > 8.5) this.pickStand(e);
        pip.goal = this.stand;
        const d = pip.pos.distanceTo(this.stand);
        pip.run = d > 3;
        pip.sprayTarget = this.aim;
        pip.sprayEnemy = e;
        if (o.mode === 'aggro' && !this.aggroOn(e)) this.startAggro(e, 5);
        break;
      }
      case 'move':
      case 'hold': {
        pip.goal = o.at!;
        pip.run = pip.pos.distanceTo(o.at!) > 4;
        pip.lookAt = wai.pos;
        // standing her ground: she still paints whatever comes at her / at WAI within reach
        if (o.mode === 'hold') {
          let near: EnemyBase | null = null;
          let nd: number = COMPANION.sprayRange;
          for (const e of this.s.enemies) {
            if (!this.fightable(e) || !e.engaged) continue;
            const d = e.pos.distanceTo(pip.pos);
            if (d < nd) {
              nd = d;
              near = e;
            }
          }
          if (near) {
            pip.sprayTarget = this.aimPoint(near, this.aim);
            pip.sprayEnemy = near;
          }
        }
        break;
      }
      case 'spray':
        pip.goal = null;
        pip.sprayTarget = o.at!;
        break;
      case 'follow':
      default: {
        // beside WAI, a little ahead, on the camera's side we're on: always in view, never in the way
        this.followT -= dt;
        if (this.followT <= 0) {
          this.followT = 0.3;
          this.pickFollow();
        }
        const back = this.tmp.set(-Math.sin(this.s.ctx.camera.yaw), 0, -Math.cos(this.s.ctx.camera.yaw));
        const want = this.followGoal;
        const dist = Math.hypot(pip.pos.x - wai.pos.x, pip.pos.z - wai.pos.z) + Math.abs(pip.pos.y - wai.pos.y);
        if (dist > (this.standing.mode === 'close' ? 2.6 : 3.4)) this.following = true;
        else if (dist < 2.4 || pip.pos.distanceTo(want) < 0.9) this.following = false;
        // (WAI up where she can't walk: a painted spring that lands next to him, PipWorld.route)
        pip.goal = this.following && !this.mood.asleep ? pip.world.route(want, this.time) : null;
        pip.run = dist > 5.5;
        // (asleep: she doesn't track anything)
        pip.lookAt = this.mood.asleep ? null : this.chatT > 0 ? wai.pos : this.tmp2.copy(wai.pos).addScaledVector(back, -6);
        break;
      }
    }
  }

  /** A free spot beside WAI (camera-relative), on his floor, with no wall in between. */
  private pickFollow(): void {
    const s = this.s;
    const ph = s.physics;
    const wai = s.player;
    const yaw = s.ctx.camera.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const solid = (c: import('@dimforge/rapier3d-compat').Collider) => {
      const tg = ph.tagOf(c);
      return tg === 'static' || tg === 'gate' || tg === 'host' || tg === 'undrawn' || tg === 'barrier';
    };
    const from = new THREE.Vector3(wai.pos.x, wai.pos.y + 0.7, wai.pos.z);
    const dir = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const [sd, fw] of [
      [this.standSide, 0.6],
      [-this.standSide, 0.6],
      [this.standSide, -1.2],
      [-this.standSide, -1.2],
      [0, -2.2],
    ]) {
      c.set(wai.pos.x + fx * fw - fz * 1.8 * sd, wai.pos.y + 0.7, wai.pos.z + fz * fw + fx * 1.8 * sd);
      dir.copy(c).sub(from);
      const len = dir.length();
      if (ph.raycast(from, dir.normalize(), len + 0.4, solid)) continue;
      const g = ph.raycast(c, new THREE.Vector3(0, -1, 0), 2, solid);
      if (!g || Math.abs(g.point.y - wai.pos.y) > 0.9) continue;
      this.followGoal.copy(g.point);
      if (sd !== 0) this.standSide = sd;
      return;
    }
    this.followGoal.copy(wai.pos);
  }

  /** Where Pip aims on a creature: its body (WAI is the one who nails the weak points). */
  aimPoint(e: EnemyBase, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(e.pos).setY(e.pos.y + Math.min(1.5, e.bigness * 2 + 0.3));
  }

  /** A flank spot: 4–6.5 m from the creature, ~75° off WAI's line of fire, on ground Pip can reach. */
  private pickStand(e: EnemyBase): void {
    const s = this.s;
    const ph = s.physics;
    const wai = s.player;
    const pip = this.pip;
    this.standFor = e;
    this.standT = 1.6;
    const toW = new THREE.Vector3(wai.pos.x - e.pos.x, 0, wai.pos.z - e.pos.z);
    if (toW.lengthSq() < 0.01) toW.set(0, 0, 1);
    const r = THREE.MathUtils.clamp(toW.length(), 4 + e.bigness * 1.5, 6.5);
    toW.normalize();
    // keep the side Pip is already on (no running through WAI's stream)
    const side = toW.x * (pip.pos.z - e.pos.z) - toW.z * (pip.pos.x - e.pos.x);
    // (a positive rotation of toW toward her = the side she is on; picking the other one had her run laps
    // round the creature every 1.6 s)
    this.standSide = side >= 0 ? 1 : -1;
    const aim = this.aimPoint(e, new THREE.Vector3());
    const boss = e === s.boss && s.boss.awake;
    for (const sd of [this.standSide, -this.standSide]) {
      for (const deg of [75, 105, 50, 130]) {
        const a = (deg * Math.PI) / 180 * sd;
        const dir = new THREE.Vector3(toW.x * Math.cos(a) - toW.z * Math.sin(a), 0, toW.x * Math.sin(a) + toW.z * Math.cos(a));
        const c = e.pos.clone().addScaledVector(dir, r);
        if (boss && c.distanceTo(s.arena.center.clone().setY(c.y)) > s.arena.radius - 1.5) continue;
        const top = Math.max(e.pos.y, wai.pos.y) + 2.5;
        const g = ph.raycast(c.clone().setY(top), new THREE.Vector3(0, -1, 0), 6, (col) => {
          const tg = ph.tagOf(col);
          return tg === 'static' || tg === 'gate' || tg === 'host' || tg === 'undrawn';
        });
        if (!g || Math.abs(g.point.y - wai.pos.y) > 1.3 || Math.abs(g.point.y - pip.pos.y) > 1.6) continue;
        const eye = g.point.clone().setY(g.point.y + 0.6);
        const dir2 = aim.clone().sub(eye);
        const len = dir2.length();
        const blocked = ph.raycast(eye, dir2.normalize(), Math.max(0, len - 0.8), (col) => ph.tagOf(col) === 'static');
        if (blocked) continue;
        this.stand.copy(g.point);
        this.standSide = sd;
        return;
      }
    }
    // nowhere good: paint from right beside WAI
    const back = new THREE.Vector3(-Math.sin(wai.facing), 0, -Math.cos(wai.facing));
    this.stand.copy(wai.pos).addScaledVector(back, 1.2).add(new THREE.Vector3(back.z * 1.6, 0, -back.x * 1.6));
  }

  /** HUD prompt: none (a smudged partner is redrawn by the pencil, like WAI; nobody helps her up). */
  prompt(): { key: string; text: string; enabled: boolean } | null {
    return null;
  }

  render(alpha: number, frameDt: number): void {
    this.pip.render(alpha, frameDt);
    const head = this.tmp.copy(this.pip.renderPos).setY(this.pip.renderPos.y + (this.mood.asleep ? 1.05 : 1.22));
    const hidden = this.s.frozen || this.s.ctx.camera.inCine || this.s.completed || this.spawn.phase === 'wait';
    this.bubble.update(frameDt, head, hidden, this.pip.down > 0);
    this.life.render(hidden);
  }

  /** Compact snapshot (window.WD_COOP.observe() and the LLM's observation). */
  observe(): Record<string, unknown> {
    const s = this.s;
    const wai = s.player;
    const pip = this.pip;
    const r = (v: THREE.Vector3) => [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)];
    const input = s.ctx.input;
    const spraying = input.isDown('Mouse0');
    // what WAI's crosshair is on
    let aimingAt: string | null = null;
    const ray = s.ctx.camera.aimRay();
    const hit = s.physics.raycast(ray.origin, ray.dir, 40, (c) => c.handle !== wai.collider.handle);
    if (hit) {
      const o = s.physics.ownerOf<EnemyBase>(hit.collider);
      if (o && (o as { kind?: string }).kind && (o as EnemyBase).id) aimingAt = (o as EnemyBase).id;
    }
    const sp = Math.hypot(wai.vel.x, wai.vel.z);
    const doing = wai.smudged ? 'smudged (respawning)' : wai.dodging ? 'dodging' : spraying ? `spraying${aimingAt ? ' ' + aimingAt : ''}` : sp > 5 ? 'running' : sp > 0.5 ? 'walking' : 'standing';
    const o = this.order ?? this.auto;
    const obj = s.objective();
    return {
      lang: getLang(),
      objective: obj.title,
      hint: obj.hint,
      brain: this.usingLlm ? 'llm' : 'rules',
      wai: { pos: r(wai.pos), hp: wai.hp, maxHp: PLAYER.maxHp, doing, aimingAt, paintTank: +s.weapon.tankFrac.toFixed(2) },
      pip: {
        pos: r(pip.pos),
        hp: pip.hp,
        maxHp: COMPANION.maxHp,
        smudged: pip.down > 0,
        order: o.mode + (o.target ? ' ' + o.target.id : '') + (o.by !== 'rules' ? ` (${o.by})` : ''),
        spraying: pip.sprayingNow,
        distToWai: +pip.pos.distanceTo(wai.pos).toFixed(1),
        paintDealt: Math.round(pip.spray.damageDealt),
      },
      enemies: s.enemies
        .filter((e) => !e.disposed && !e.harmless && e.pos.distanceTo(wai.pos) < 20 && (e !== s.boss || s.boss.awake))
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          pos: r(e.pos),
          distWai: +e.pos.distanceTo(wai.pos).toFixed(1),
          distPip: +e.pos.distanceTo(pip.pos).toFixed(1),
          state: e.state,
          repaintPct: Math.round(e.repaint * 100),
          chasing: this.aggroOn(e) ? 'pip' : e.engaged ? 'wai' : 'nobody',
          reeling: e.canBeTagged,
        })),
      standing: this.standing.mode + (this.standing.target ? ' ' + this.standing.target.id : '') + (this.standing.place ? ' ' + this.standing.place : ''),
      places: (s.allHosts as unknown as { id: string; pos: THREE.Vector3 }[])
        .map((h) => ({ id: h.id, d: h.pos.distanceTo(wai.pos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 8)
        .map((h) => `${h.id} ${Math.round(h.d)}m`),
      dropsNear: s.level.drops.filter((d) => !d.collected && !d.disposed && d.position().distanceTo(wai.pos) < 24).length,
      ...this.mood.snapshot(),
      events: this.events.slice(-5),
      pipSaid: this.bubble.history.slice(-3),
      cinematic: s.story.locked || s.ctx.camera.inCine,
    };
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.llm.dispose();
    this.moves.dispose();
    this.roast.dispose();
    this.bubble.dispose();
    this.life.dispose();
    this.pip.dispose();
    this.aggro.clear();
  }
}
