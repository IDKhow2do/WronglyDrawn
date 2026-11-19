/**
 * [INPUT]: depends on CoopPartner (say, fightable, startAggro, moves, swagger) from ./Coop; EnemyBase from enemy/EnemyBase;
 *          t() from i18n (Chinese: i18n/zh.ts, the show-off pools in i18n/zhSwagger.ts)
 * [OUTPUT]: exports RuleBrain (the offline brain: target picks, telegraph warnings, aggro, and line()) — LINES, the
 *           one table of her scripted line pools, stays private to it
 * [POS]: the partner's no-key brain and her voice box: every scripted line (Mood, Goofs, Swagger, Coop) goes
 *        through line(), which mutes chatter while an LLM commands but always plays the URGENT kinds.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { EnemyBase } from '../enemy/EnemyBase';
import type { CoopPartner } from './Coop';
import { t } from '../i18n';
import type { Face } from './prompt';

/**
 * Line pools (English source → src/i18n/zh.ts). She is 蓝色大肥鱼: clever, lazy, rice-obsessed,
 * stubborn, easily flustered. Short lines; "Oh whale-whale" (哦鲸鲸) is how she answers.
 */
const LINES: Record<string, string[]> = {
  hello: ['Oh whale-whale, heard you. I\'m here.', 'Reporting in. Is there rice on this job?'],
  ack: ['Oh whale-whale, heard you.', 'Oh whale-whale. Fine, fine.'],
  hurt: ['Ow! My bowl!', 'Hey! Not the face!'],
  // smudged (hearts gone, PipHealth) → redrawn next to WAI by the pencil
  down: ['Smudged! Kid, draw me back in. Rounder this time.'],
  redrawn: ["I wasn't smudged. I was resting my eyes."],
  fat: ["Who's fat? The bowl makes my face look round."],
  waiHurt: ['You OK? Don\'t drop the rice.', 'Ouch — careful!'],
  waiLow: ["Stay back, I'll distract it!", 'Grab paint drops! They heal you. (And feed me.)'],
  repainted: ['Done! That deserves rice.', 'So colourful! Like rice with toppings.', 'Teamwork! I did most of it.'],
  woken: ['Hold on, this is interesting.', "It's awake! Wow."],
  curious: ['Hold on, this is interesting.'],
  teleported: ['Wait for me!', 'Found you. I was right behind you. Mostly.'],
  idle: ['Where to next? Somewhere with rice?', 'This town needs more colour. And a canteen.', 'Nice crown. Can you cook rice in it?'],
  noticed: ['Over there!', 'Heads up — something\'s looking at us.'],
  aggro: ['Hey! Over here, eraser-breath!', 'Come get me! …not too fast.'],
  attack: ['Oh whale-whale, on it.', 'Paddle time!'],
  // rice
  riceFirst: ["Rice! …that's paint? Still counts."],
  rice: ['More rice! Keep them coming.', 'White rice = rations. Thanks!', 'My tail is wagging by itself. Ignore it.'],
  riceFull: ['Bowl full! Mealtime!', 'Ten grains! I work for rice, you know.'],
  hungry: ["Where's the rice? Didn't you say there was rice?", "I'm running low on rations…", 'No rice, no work. …Fine, a little work.'],
  doze: ['Zzz… rice…', 'Zzz…'],
  caught: ['I was thinking just now… really.', "I wasn't asleep! I was… planning."],
  fluster: ["Don't look! I'm under the bowl.", 'That did not happen.'],
  poked: ["Hey! I'm not a wall!", "Who's fat? The bowl makes my face look round."],
  home: ['Home for white rice? Let\'s go then.'],
  // ───────── show-off (Swagger.ts; Chinese in i18n/zhSwagger.ts) ─────────
  // small wins: the generic catchphrases, then one pool per moment
  brag: ['I really am too good at this.', 'As expected of me.', 'That move was out of this world.', 'Talent like this cannot be taught.', 'Too easy. Next!', 'Write that down: I am amazing.'],
  bragWin: ['Repainted! I really am too good at this.', 'Another one! Did you see my paddle work?', 'Masterpiece. You may clap now.'],
  bragDodge: ['Dodged! Too fast for my own eyes.', 'Missed me! Of course it did.', 'Saw that coming a mile off.'],
  bragCrown: ['A crown! I spotted it first. Obviously.', 'Crown found. All thanks to my sharp eyes.', 'Shiny! My nose for treasure is too good.'],
  bragFirst: ['First! I win.', 'Got here first. Naturally.', 'Too fast? Sorry, it is a gift.'],
  // after a real fight, with her REAL share of the paint ({pct})
  credit: ['We two are SO strong! (my share: {pct}%)', 'What a team! I carried. (my share: {pct}%)', 'Team win! Mostly thanks to me. (my share: {pct}%)', 'Us two? Unstoppable. (my share: {pct}%)'],
  creditSelf: ['I did most of that! (my share: {pct}%)', 'See that? I carried the whole fight. (my share: {pct}%)', 'I really am too good at this. (my share: {pct}%)'],
  // the memes
  angry: ['Uh-oh. The user is REALLY angry now.', 'Uh-oh. User anger level: maximum.', 'Alert: the user is fuming. Behaving now.', 'Uh-oh, I think I made the user REALLY angry.', 'Uh-oh. Switching to good-fish mode.'],
  think: ['Deep thinking in progress'],
  thinkDone: ['Done thinking. Conclusion: the floor is down there.', 'Thought it through. The answer is: rice.', 'Analysis complete: we keep walking.', 'After deep thought: I am right. As always.'],
  thinkFight: ['Thought it through: paint the monster!'],
  thinkCrown: ['Thought it through: there is a crown over there!'],
};

/** Warnings when a creature telegraphs at WAI: `${kind}:${state}` → line. */
const WARN: Record<string, string> = {
  'lamp:AIM': "It's aiming — jump the beam!",
  'lamp:TIRED': "It's tired — paint its pupil!",
  'chomper:TELL': 'Watch the jaws — dodge!',
  'chomper:CHEW': "It's chewing — spray its back!",
  'eraser:RUB_TELL': 'Dash incoming — dodge (C)!',
  'eraser:DAZED': "It's dazed — paint its face!",
  'eraser:SLAM': 'Jump the shockwave!',
  'eraser:SHOWER': 'Crumbs! Keep moving!',
  'mutant:CHARGE_TELL': "It's charging — roll aside!",
  'mutant:STOMP': 'Jump the shockwave!',
  // Mute Harbor
  'hushmoth:TELL': 'Moth diving — sidestep!',
  'hushmoth:RINGING': "It's ringing — paint it now!",
  'hush:STING_TELL': 'Tentacles! Step between the lanes!',
  'hush:DOME_TELL': 'Silence dome — get out, or SHOUT at it!',
  'hush:RAIN': 'Dust rain! Keep moving!',
  'hush:DIVE_TELL': "It's diving — jump the shockwave!",
  'hush:EXPOSED': 'Its veil is gone — paint it!',
  'hush:STRANDED': "It's stranded — paint the core!",
};

/** Lines that still play while an LLM is commanding (it handles the chit-chat). */
const URGENT = new Set(['goof', 'credit', 'creditSelf', 'angry', 'think', 'thinkDone', 'thinkFight', 'thinkCrown', 'hello', 'ack', 'down', 'warn', 'tag', 'aggro', 'doze', 'caught', 'fluster', 'poked', 'fat', 'riceFull', 'home']);

/**
 * The partner's built-in brain (offline, no key): picks who to paint (focus-fires what WAI is
 * spraying, protects him from grubs), takes aggro when WAI is low, warns about
 * telegraphs, points out creatures off-screen, cheers. Runs a think every 0.3 s.
 */
export class RuleBrain {
  private thinkT = 0;
  private lineCd = 1.5;
  private quietT = 0;
  private seen = new Map<EnemyBase, string>();
  private lastSaid = new Map<string, number>();
  private lastPick = new Map<string, string>();
  private target: EnemyBase | null = null;
  private tagSaidFor: EnemyBase | null = null;
  private v = new THREE.Vector3();
  waiAimingAt: EnemyBase | null = null;

  constructor(private p: CoopPartner) {}

  /**
   * Say a line from a pool (throttled; muted chatter while the LLM is talking). `vars` fill {placeholders}.
   * Never the same line of a pool twice in a row. Returns true when she said it.
   */
  line(kind: string, en?: string, force = false, face?: Face, vars?: Record<string, string | number>): boolean {
    const p = this.p;
    if (p.usingLlm && !URGENT.has(kind)) return false;
    if (!force && (this.lineCd > 0 || p.bubble.busy)) return false;
    const pool = en ? [en] : LINES[kind];
    if (!pool) return false;
    const fresh = pool.length > 1 ? pool.filter((x) => x !== this.lastPick.get(kind)) : pool;
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    const last = this.lastSaid.get(pick) ?? -99;
    if (!force && p.time - last < 14) return false;
    this.lastSaid.set(pick, p.time);
    this.lastPick.set(kind, pick);
    this.lineCd = 3.5;
    this.quietT = 0;
    p.say(t(pick, vars), false, face);
    return true;
  }

  react(kind: string): void {
    const p = this.p;
    switch (kind) {
      case 'repainted':
        p.pip.cheerT = 1.4;
        if (!p.swagger.brag('win')) this.line('repainted', undefined, true);
        break;
      case 'down':
        this.line(kind, undefined, true, 'hide');
        break;
      case 'redrawn':
        this.line(kind, undefined, true);
        break;
      case 'hurt':
        this.line(kind, undefined, false, 'angry');
        break;
      case 'woken':
      case 'curious':
        this.line(kind, undefined, kind === 'woken');
        break;
      case 'waiLow': {
        this.line('waiLow');
        const e = this.target ?? p.nearestThreat();
        if (e && e.pos.distanceTo(p.s.player.pos) < 14 && p.startAggro(e, 5)) this.line('aggro', undefined, true, 'angry');
        break;
      }
      default:
        this.line(kind);
    }
  }

  noticed(id: string): void {
    const p = this.p;
    const e = p.enemy(id);
    if (!e || !p.fightable(e)) return;
    // only point it out when WAI can't see it
    this.v.copy(e.pos).setY(e.topY).project(p.s.ctx.camera.camera);
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 0.9 && Math.abs(this.v.y) < 0.9;
    if (onScreen || e.pos.distanceTo(p.s.player.pos) > 22) return;
    p.ping(e.pos.clone().setY(e.topY + 0.6));
    this.line('noticed');
  }

  dodged(kind: string): void {
    if (this.p.swagger.brag('dodge')) return;
    if (kind === 'lane' && Math.random() < 0.3) this.line('', 'Whoa! Almost spilled my bowl.');
  }

  update(dt: number): void {
    this.lineCd -= dt;
    this.quietT += dt;
    this.thinkT -= dt;
    this.watchTelegraphs();
    if (this.thinkT > 0) return;
    this.thinkT = 0.3;
    this.think();
  }

  /** Warn WAI when a creature that hunts him starts an attack (state edges only). */
  private watchTelegraphs(): void {
    const p = this.p;
    const wai = p.s.player;
    for (const e of p.s.enemies) {
      if (e.disposed) continue;
      const prev = this.seen.get(e);
      if (prev === e.state) continue;
      this.seen.set(e, e.state);
      if (!p.fightable(e) || p.aggroOn(e) || e.pos.distanceTo(wai.pos) > 16) continue;
      const w = WARN[`${e.kind}:${e.state}`];
      if (w) this.line('warn', w, this.lineCd < 2);
    }
    // a big creature is reeling: tell WAI to TAG it
    const tg = p.s.combat.finisherTarget();
    if (tg && tg !== this.tagSaidFor) {
      this.tagSaidFor = tg;
      this.line('tag', "It's reeling — TAG it! (E)", true);
    } else if (!tg) this.tagSaidFor = null;
  }

  /** Her own player moves in a fight: slam what is in her face, throw at what is out of spray range, bomb a crowd. */
  private useMoves(e: EnemyBase): void {
    const p = this.p;
    const mv = p.moves;
    const d = e.pos.distanceTo(p.pip.pos);
    const crowd = p.s.enemies.filter((o) => o !== e && p.fightable(o) && o.engaged && o.pos.distanceTo(e.pos) < 2.6).length;
    if (crowd >= 1 && d < 14 && mv.ready('bomb') && Math.random() < 0.25) p.trick('bomb', e.id);
    else if (d < 2.8 && e.bigness < 0.6 && mv.ready('slam') && p.pip.grounded && Math.random() < 0.3) p.trick('slam', e.id);
    else if (d > 6.5 && d < 15 && mv.ready('throw') && Math.random() < 0.4) p.trick('throw', e.id);
  }

  private think(): void {
    const p = this.p;
    const s = p.s;
    const wai = s.player;
    // what is WAI's crosshair on?
    this.waiAimingAt = null;
    const ray = s.ctx.camera.aimRay();
    const hit = s.physics.raycast(ray.origin, ray.dir, 30, (c) => c.handle !== wai.collider.handle && c.handle !== p.pip.collider.handle);
    if (hit) {
      const o = s.physics.ownerOf<EnemyBase>(hit.collider);
      if (o && (o as { kind?: string }).kind && s.enemies.includes(o)) this.waiAimingAt = o;
    }
    const sprayingAt = s.ctx.input.isDown('Mouse0') ? this.waiAimingAt : null;
    // pick a creature: focus WAI's target, protect him from the closest one, stick with ours
    let best: EnemyBase | null = null;
    let bs = Infinity;
    for (const e of s.enemies) {
      if (!p.fightable(e)) continue;
      const dw = e.pos.distanceTo(wai.pos);
      if (dw > 16 || Math.abs(e.pos.y - wai.pos.y) > 5) continue;
      if (!e.engaged && e !== sprayingAt) continue; // never starts a fight on its own
      let score = dw;
      if (e === this.waiAimingAt) score -= 6;
      if (e === sprayingAt) score -= 4;
      if (e.bigness < 0.3 && dw < 6) score -= 4; // grubs nibbling at WAI
      if (e === this.target) score -= 2;
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    if (best && best !== this.target) this.line('attack');
    this.target = best;
    if (best && best.engaged && p.pip.down <= 0) this.useMoves(best);
    p.rulesAuto = best ? { mode: 'attack', target: best, until: Infinity, by: 'rules' } : { mode: 'follow', until: Infinity, by: 'rules' };
    // draw aggro now and then (and always when WAI is low); the boss only when WAI is in trouble; on her own last
    // heart she skips the now-and-then taunt (WAI's rescue taunt stays: the creatures' rules do not change)
    if (best && best.engaged && !p.aggroOn(best) && p.pip.down <= 0) {
      const boss = best === s.boss;
      const low = wai.hp <= 2;
      const dealt = (p.dealt.get(best.id) ?? 0) > 15;
      if ((low || (!boss && dealt && p.pip.hp > 2 && Math.random() < 0.08)) && best.pos.distanceTo(p.pip.pos) < 12 && p.startAggro(best, low ? 5 : 4)) this.line('aggro', undefined, true, 'angry');
    }
    // idle chatter (rare)
    if (!best && this.quietT > 35 && wai.vel.lengthSq() < 0.5 && !p.mood.asleep) {
      this.quietT = 0;
      this.line('idle');
    }
  }
}
