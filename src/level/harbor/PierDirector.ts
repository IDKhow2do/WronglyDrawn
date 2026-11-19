/**
 * [INPUT]: depends on BuiltPier/PIER/inPier/inRect/pierGround from ./BandstandPier; FogVeil; EchoGallery; RedPenSky;
 *          MegaphoneCrab, FogJelly, RedGramophone from ../../enemy; HarborBuilt (Bell Bridge, spots) from ./MuteHarbor;
 *          the HarborSession hooks in PierHost (addEnemy, giveEye, toast, after, muffle, respawn, springDone)
 * [OUTPUT]: exports PierDirector (clockRang, step, see, hint, guideGoal, exitStep, debug*) and the PierHost hook surface
 * [POS]: the GAMEPLAY of the level-2 second district: the Red Pen's sky moment, the gate, the Lost & Found Eye,
 *        the three encounters and their locks (turnstile, velvet rope), first-meeting tips, the fog's hiding rule,
 *        the Echo Gallery, the mid-boss (and its record's X on a restarted fight), falls off the pier, the guide's way in and out, and the Bell Bridge gate
 *        (the lighthouse waits on the Gramophone). HarborSession owns one; BandstandPier owns the geometry.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { OrganInventory } from '../../organs/OrganInventory';
import type { Gazer } from '../../hosts/OrganHost';
import type { EnemyBase } from '../../enemy/EnemyBase';
import type { HarborStory } from '../../story/HarborStory';
import { MegaphoneCrab } from '../../enemy/MegaphoneCrab';
import { FogJelly } from '../../enemy/FogJelly';
import { RedGramophone } from '../../enemy/RedGramophone';
import { PAL } from '../../render/PaintTextures';
import { t } from '../../i18n';
import type { HarborBuilt } from './MuteHarbor';
import type { Shoutable } from './Shout';
import { inPier, inRect, PIER, pierGround, type BuiltPier } from './BandstandPier';
import { FogVeil } from './FogVeil';
import { EchoGallery } from './EchoGallery';
import { RedPenSky } from './RedPenSky';

/** What the director needs from the session (closures over its private plumbing). */
export interface PierHost {
  ctx: GameContext;
  player: PlayerController;
  level: HarborBuilt;
  pier: BuiltPier;
  story: HarborStory;
  inventory: OrganInventory;
  woken: ReadonlySet<string>;
  shoutTargets: Shoutable[];
  addEnemy<T extends EnemyBase>(e: T): T;
  /** Drop a fresh (corrupted) Eye sticker at `at`, flying from `from` (the Lost & Found). */
  giveEye(at: THREE.Vector3, from: THREE.Vector3): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>): void;
  /** The shared stuck rule (src/ui/Guide.ts): the player has made no progress for a while. */
  stuck(): boolean;
  after(sec: number, fn: () => void): void;
  muffle(sec: number): void;
  /** Is WAI muffled right now (cannot shout)? */
  muted(): boolean;
  /** Redraw WAI at the last spray can he touched (the session's own respawn). */
  respawn(): void;
  /** Is the sketched spring at this spot painted real yet? */
  springDone(pos: THREE.Vector3): boolean;
}

/** Every creature of an encounter repainted (or gone)? */
function allQuiet(list: readonly EnemyBase[]): boolean {
  for (const e of list) if (!e.harmless && !e.disposed) return false;
  return true;
}

/** One tip the first time WAI meets each new creature (the counter in one line). */
const TIPS: Record<string, string> = {
  megacrab: 'MEGAPHONE CRAB: its lid stays shut — shout at it then and it CATCHES your shout and throws it back. Wait for the lid to flip open, then SHOUT into it!',
  fogjelly: 'FOG JELLY: its fog swallows paint, paint drops and even the walkway. Put your Eye on and AIM (right-click / Z) to see right through it.',
};

export class PierDirector {
  readonly gramophone: RedGramophone;
  readonly veil: FogVeil;
  readonly gallery: EchoGallery;
  readonly sky: RedPenSky;
  private jellies: FogJelly[] = [];
  private eyeGiven = false;
  private tmp = new THREE.Vector3();
  /** Encounter crowds: the yard's turnstile and the spring's cordon open when theirs are all repainted. */
  private yardCrowd: EnemyBase[] = [];
  private carouselCrowd: EnemyBase[] = [];
  private ids = new Map<string, EnemyBase>();
  private tipped = new Set<string>();
  private told = new Set<string>();
  /** Dev warps skip the wash cutscene. */
  private quiet = false;
  private clockDone = false;

  constructor(private h: PierHost) {
    const sp = h.pier.spawns;
    const add = <T extends EnemyBase>(e: T): T => {
      this.ids.set(e.id, e);
      return h.addEnemy(e);
    };
    const crab = (id: string, at: THREE.Vector3, size = 1) => {
      const c = add(new MegaphoneCrab(h.ctx, id, at, size));
      c.waves.onMuffle = (s) => h.muffle(s);
      c.onCaught = () => this.once('caught', 'It CAUGHT your shout and threw it back! Shout only while its lid is OPEN (pink throat showing).', 'warn');
      return c;
    };
    const jelly = (id: string, at: THREE.Vector3, path: THREE.Vector3[]) => {
      const j = add(new FogJelly(h.ctx, id, at, path, pierGround));
      j.onFogged = () => this.once('fogged', h.inventory.get('EYE') ? 'LOST IN THE FOG! Put your Eye on and AIM (right-click / Z): True Sight sees through the fog.' : 'LOST IN THE FOG! You need an EYE to see through it — SHOUT at the Lost & Found bell on the ticket booth.', 'warn');
      this.jellies.push(j);
      return j;
    };
    // encounter 1 · the Ticket Yard: two Megaphone Crabs (the Lost & Found keeps a spare Eye: shout at its bell)
    sp.yardCrabs.forEach((p, i) => this.yardCrowd.push(crab(`p-crab-yard-${i}`, p)));
    const lf = h.pier.lostFound;
    h.shoutTargets.push({
      pos: lf,
      radius: 0.8,
      enabled: () => !this.eyeGiven,
      onShout: () => {
        h.ctx.audio.play('smallBell', { pos: lf, pitch: 1.2 });
        h.ctx.effects.comic(lf.clone().setY(lf.y + 0.9), t('DING!'), '#ffd23a', 0.8);
        if (h.inventory.get('EYE')) {
          h.toast('“Lost & Found: one Eye, unclaimed… oh, you have one already!”', 'info');
          return true;
        }
        this.eyeGiven = true;
        h.after(0.6, () => {
          h.giveEye(new THREE.Vector3(lf.x, PIER.y, lf.z + 1.6), lf.clone());
          h.toast('The Lost & Found coughs up a lost EYE sticker! Walk over it, then hold Q to purify it.', 'good');
        });
        return true;
      },
    });
    // encounter 2 · the Fog Walk: two jellies drift over the broken pier, hiding the zigzag walkway
    sp.jellies.forEach((j, i) => jelly(`p-jelly-walk-${i}`, j.at, j.path));
    // encounter 3 · the Carousel Deck: the Barker (a big crab), a crab and a jelly round the carousel
    this.carouselCrowd.push(crab('p-barker', sp.barker, 1.45), crab('p-crab-carousel', sp.carouselCrab), jelly('p-jelly-carousel', sp.carouselJelly.at, sp.carouselJelly.path));
    // the mid-boss · the Bandstand
    this.gramophone = add(new RedGramophone(h.ctx, 'gramophone', sp.gramophone));
    this.gramophone.waves.onMuffle = (s) => h.muffle(s);
    this.gramophone.onWake = () => this.gramoIntro();
    this.gramophone.onQuiet = () => this.once('quiet', 'Too quiet — it swallowed that. HOLD X until the ring glows, then let go into its horn: BIG SHOUT!', 'warn');
    this.gramophone.onRoar = () => {
      h.pier.showRecordX();
      h.ctx.effects.burst(PIER.arena.clone().setY(PIER.bandY + 0.5), PAL.red, 24, 5);
      h.toast('The Red Pen scratches an X into its record — LOUDER! And a crab scuttles in.', 'warn');
    };
    this.gramophone.onHelper = () => crab('p-crab-gramo', sp.gramoHelper);
    this.gramophone.canAnswer = () => !h.muted();
    this.gramophone.onFinished = () => this.washed();
    // a restarted fight (smudged on Hard: level/FightReset) starts on a clean record
    this.gramophone.onFightReset = () => h.pier.hideRecordX();

    // first meetings
    h.ctx.events.on('enemy:noticed', ({ id }) => {
      const e = this.ids.get(id);
      if (!e || this.tipped.has(e.kind) || !TIPS[e.kind]) return;
      this.tipped.add(e.kind);
      h.toast(TIPS[e.kind], 'warn');
    });

    // the fog hides the walkway, the drops over it and the fog crown
    this.veil = new FogVeil(() => this.jellies);
    for (const m of h.pier.walkway) this.veil.add(m.getWorldPosition(new THREE.Vector3()), (on) => (m.visible = on));
    for (const d of h.pier.foggedDrops) this.veil.add(d.pos, (on) => (d.root.visible = on), () => !d.collected && !d.disposed);
    const fc = h.pier.fogCrown;
    this.veil.add(fc.pos, (on) => (fc.hidden = !on), () => !fc.collected);

    this.gallery = new EchoGallery(h.ctx, h.pier.horns, h.pier.crownGallery, h.toast);
    h.shoutTargets.push(...this.gallery.targets());
    this.sky = new RedPenSky(h.ctx, h.pier.bridgeX, PIER.gate);
  }

  /** A nudge that waits for the shared stuck rule (src/ui/Guide.ts): the player tried, and stopped getting on. */
  private stuckOnce(key: string, text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    if (this.h.stuck()) this.once(key, text, kind);
  }

  private once(key: string, text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.h.toast(text, kind);
  }

  get cleared(): boolean {
    return this.h.pier.washed;
  }

  // ───────────── the story around the district ─────────────
  /** The Clock Tower rang (Guardian 2): the Red Pen strikes the bridge out, the pier gate swings open. */
  clockRang(n: number): void {
    this.sky.strike(() => {
      this.clockDone = true;
      this.h.toast('Guardian {n}/3 awake — but the RED PEN crossed out the Bell Bridge! The clock’s BONG opened the old pier gate behind the tower: go and find who’s playing the Hush’s lullaby.', 'warn', { n });
    });
    this.h.after(12.3, () => this.h.pier.openGate());
  }

  private gramoIntro(): void {
    const h = this.h;
    const at = this.gramophone.pos;
    const p = h.player.pos;
    const side = new THREE.Vector3(-(at.z - p.z), 0, at.x - p.x).normalize();
    h.ctx.camera.playCine([
      { pos: p.clone().add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(side, 2.6).add(at.clone().sub(p).multiplyScalar(-0.2)), look: at.clone().add(new THREE.Vector3(0, 3.2, 0)), dur: 1.8, fov: 48, toFov: 40, handheld: 0.05 },
    ]);
    h.ctx.audio.play('roar', { pos: at, pitch: 0.9, vol: 0.9 });
    h.ctx.camera.shake = 0.6;
    h.ctx.events.emit('story:caption', { text: t('THE RED GRAMOPHONE'), big: true });
    h.after(2.4, () => {
      h.ctx.events.emit('story:caption', { text: null });
      h.toast('It plays the Hush’s lullaby for the Red Pen, and the music shakes paint off. When it BREATHES IN, hold X and BIG SHOUT into its horn!', 'warn');
    });
  }

  /** The Gramophone is repainted: the pier's red marks wash off, then the X comes off the Bell Bridge. */
  private washed(): void {
    const h = this.h;
    h.pier.washMarks();
    const c = h.pier.crownGramophone;
    c.hidden = false;
    h.ctx.effects.burst(c.pos, PAL.yellow, 18, 3);
    if (this.quiet) return this.lowerBridge();
    h.after(1.6, () =>
      this.sky.unstrike(() => {
        h.toast('The Bell Bridge is down — cross to the lighthouse on the headland! (Shortcut: the stair off the bandstand drops to the Ticket Yard.)', 'good');
      }),
    );
    h.after(3.8, () => this.lowerBridge());
  }

  private lowerBridge(): void {
    if (this.h.level.bridgeDown) return;
    this.h.level.lowerBellBridge();
    this.h.story.pencilDraw(this.h.level.spots.bridge.clone(), 1.8);
  }

  // ───────────── every step ─────────────
  step(dt: number): void {
    const h = this.h;
    const p = h.player;
    this.sky.update(dt);
    h.pier.update(dt);
    this.gallery.step(dt, p);
    // fell off the pier: the fog spits WAI back out at the pier's spray can
    if (inPier(p.pos) && p.pos.y < PIER.y - 3.2 && !p.smudged) {
      const hp = p.hp;
      h.respawn();
      h.ctx.audio.play('whoosh', { pitch: 0.7 });
      p.hp = Math.max(1, hp - 1);
      h.ctx.events.emit('player:damaged', { hp: p.hp });
      h.toast(h.inventory.get('EYE') ? 'WAI fell into the fog — redrawn at the pier’s spray can. Aim with your Eye on (right-click / Z) to see the walkway, or lend your Eye to the Fog Lamp.' : 'WAI fell into the fog — redrawn at the pier’s spray can. Get an Eye first: SHOUT at the Lost & Found bell on the ticket booth.', 'warn');
    }
    // encounter locks: the crowd repainted → the way on opens
    if (!h.pier.yardLock.open && allQuiet(this.yardCrowd)) {
      h.pier.yardLock.unlock();
      h.toast('Both crabs are repainted — the turnstile clicks open! On to the Fog Walk.', 'good');
    }
    if (!h.pier.springLock.open && allQuiet(this.carouselCrowd)) {
      h.pier.springLock.unlock();
      h.toast('The carousel’s crowd is quiet — the velvet rope drops off the spring!', 'good');
    }
    // the velvet rope keeps WAI off the spring until it drops (spray still reaches the sketch)
    if (!h.pier.springLock.open) {
      const sp = h.pier.spring.pos;
      const dx = p.pos.x - sp.x, dz = p.pos.z - sp.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.9 && Math.abs(p.pos.y - sp.y) < 2.5) {
        const k = d > 0.01 ? 1.95 / d : 1;
        p.nudgeTo(this.tmp.set(sp.x + (d > 0.01 ? dx * k : 1.95), p.pos.y, sp.z + dz * k));
        this.stuckOnce('rope', 'A velvet rope! The Barker and its crowd keep the spring roped off — repaint them first.', 'warn');
      }
    }
    // nudges, once each
    if (!this.cleared && inRect(PIER.walkNear, p.pos.x, p.pos.z, 0.5)) this.stuckOnce('gap', 'The pier is broken! A walkway zigzags over the gap, hidden in the jellies’ fog. Aim with your Eye on to see it — or lend your Eye to the Fog Lamp.', 'info');
    if (!this.cleared && p.pos.distanceTo(h.pier.spring.pos) < 6 && !h.springDone(h.pier.spring.pos)) this.stuckOnce('spring', 'A sketched spring! Spray it full to make it real — then jump on it to sail over the barricade onto the bandstand.', 'info');
    if (this.cleared && this.h.level.bridgeDown && inRect(PIER.yard, p.pos.x, p.pos.z) && !this.h.woken.has('lighthouse')) this.stuckOnce('back', 'Back in the Ticket Yard. Through the gate, round the clock tower, and over the Bell Bridge!', 'info');
  }

  /** The frame's True-Sight gazers (WAI aiming with the Eye, hosts holding one). */
  see(gazers: readonly Gazer[]): void {
    this.veil.see(gazers);
    if (this.veil.revealed) this.once('seen', 'TRUE SIGHT: you see the walkway through the fog!', 'good');
  }

  /** Is the pier the next step (the clock has rung, the Gramophone still plays)? */
  private active(): boolean {
    return this.h.woken.has('clock') && !this.cleared;
  }

  /** The hint line while the pier is the next step (null = the session's own hint). */
  hint(): string | null {
    const h = this.h;
    if (!this.active()) return null;
    if (!this.clockDone && !h.pier.gateOpen) return t('Listen to the clock…');
    if (this.gramophone.engaged) {
      // its breath can only be answered one way: say what stops WAI, then where to stand
      if (this.gramophone.inhaling) {
        if (!h.inventory.worn('MOUTH')) return t('It’s breathing in — wear your Mouth Sticker (R), then HOLD X and BIG SHOUT into its horn!');
        if (h.muted()) return t('MUFFLED — wait for your voice to come back, then BIG SHOUT into its horn!');
        if (h.player.pos.y < this.gramophone.pos.y - 1.5) return t('Climb back onto the bandstand, face its horn, then HOLD X: BIG SHOUT!');
      }
      return t(this.gramophone.counterHint);
    }
    const p = h.player.pos;
    if (!inPier(p)) return t('The Red Pen crossed out the Bell Bridge. Go round behind the clock tower: the old pier gate is open');
    const eye = h.inventory.get('EYE');
    if (inRect(PIER.yard, p.x, p.z) || inRect(PIER.causeway, p.x, p.z)) {
      if (!h.pier.yardLock.open) return t('The Megaphone Crabs hold the turnstile shut. Wait for a lid to open, then SHOUT into it!');
      return eye ? t('Bandstand Pier! Head west along the pier — the music comes from the bandstand') : t('You’ll need an Eye to see through the fog ahead — SHOUT at the Lost & Found bell on the ticket booth');
    }
    if (inRect(PIER.walkNear, p.x, p.z, 0.5) || inRect(PIER.gap, p.x, p.z)) return eye ? t('Aim with your Eye on (right-click / Z) to see the hidden walkway — or lend your Eye to the Fog Lamp') : t('You need an Eye to see the walkway in the fog — SHOUT at the Lost & Found bell on the ticket booth');
    if (inRect(PIER.carousel, p.x, p.z) && !h.pier.springLock.open) return t('A velvet rope keeps you off the spring until the Barker and its crowd are repainted');
    if (inRect(PIER.carousel, p.x, p.z)) return h.springDone(h.pier.spring.pos) ? t('Jump on the spring to sail over the barricade onto the bandstand') : t('Paint the sketched spring by the barricade full, then jump on it');
    return t('Follow the pier round to the carousel — the bandstand is beyond it');
  }

  /** Where the guide arrow points while the pier is the next step (null = not now). */
  guideGoal(): THREE.Vector3 | null {
    const h = this.h;
    if (!this.active() || (!this.clockDone && !h.pier.gateOpen)) return null;
    const p = h.player.pos;
    const g = (x: number, z: number, y = PIER.y) => new THREE.Vector3(x, y + 0.6, z);
    if (this.gramophone.engaged || (p.y > PIER.bandY - 1 && inPier(p))) return this.gramophone.pos.clone().setY(this.gramophone.pos.y + 4);
    if (!inPier(p)) {
      // round the clock tower's west side, then north to the gate
      // the strip of lawn west of the back houses, then the gate
      if (p.z > -41.5 && p.x > -47) return g(-47.8, -41.5, 5.8);
      return g(PIER.gate.x, PIER.gate.z - 3);
    }
    const eye = h.inventory.get('EYE');
    const nearest = (list: EnemyBase[]) => {
      let best: EnemyBase | null = null;
      for (const e of list) if (!e.harmless && !e.disposed && (!best || e.pos.distanceTo(p) < best.pos.distanceTo(p))) best = e;
      return best ? best.pos.clone().setY(best.pos.y + 1.6) : null;
    };
    if (inRect(PIER.causeway, p.x, p.z) || inRect(PIER.yard, p.x, p.z)) {
      if (!h.pier.yardLock.open) return nearest(this.yardCrowd);
      if (!eye) return h.pier.lostFound.clone().setY(PIER.y + 1.2);
      return g(-60, -66);
    }
    // on the walkway: the next bend west of WAI
    if (inRect(PIER.walkNear, p.x, p.z, 0.5) || inRect(PIER.gap, p.x, p.z)) {
      for (const [x, z] of PIER.walk) if (x < p.x - 0.4 && Math.hypot(x - p.x, z - p.z) > 1.1) return g(x, z);
      return g(PIER.landing.x1 - 2.5, -66);
    }
    // west side: up the link onto the carousel deck (the waypoint sits on the deck, past the link's end)
    if (inRect(PIER.landing, p.x, p.z) || inRect(PIER.gallery, p.x, p.z) || inRect(PIER.link, p.x, p.z)) return g(-82, PIER.carousel.z1 - 1.8);
    // the carousel deck: its crowd, then the spring
    if (!h.pier.springLock.open) return nearest(this.carouselCrowd);
    return h.pier.spring.pos.clone().setY(PIER.y + 0.6);
  }

  /**
   * The way back to the island from anywhere on the pier (the guide's route when the goal is elsewhere):
   * bandstand → stair → yard → causeway → gate; the west side walks the zigzag back (or the ramp, once open).
   */
  exitStep(p: THREE.Vector3): THREE.Vector3 | null {
    if (!inPier(p)) return null;
    const P = PIER;
    const g = (x: number, z: number, y = P.y) => new THREE.Vector3(x, y + 0.6, z);
    const near = (v: THREE.Vector3) => Math.hypot(v.x - p.x, v.z - p.z) < 1.4;
    const washed = this.cleared;
    if (p.y > P.bandY - 1.2 || (p.z < P.stairFoot.z && p.z > P.stairTop.z && Math.abs(p.x - P.stairTop.x) < 2.2)) {
      if (Math.abs(p.x - P.stairTop.x) < 2.2 && p.z > P.stairTop.z - 1) return g(P.stairFoot.x, P.stairFoot.z + 1.5);
      if (near(P.stairTop)) return g(P.stairFoot.x, P.stairFoot.z + 1.5);
      return g(P.stairTop.x, P.stairTop.z - 0.6, P.bandY);
    }
    // (each waypoint lies inside the next rect, so arriving always moves the route on)
    if (inRect(P.yard, p.x, p.z)) return g((P.causeway.x0 + P.causeway.x1) / 2, P.causeway.z0 + 1.2);
    if (inRect(P.causeway, p.x, p.z, 0.3)) return g(P.gate.x, P.gate.z + 2.5);
    if (inRect(P.carousel, p.x, p.z) && washed) return near(P.rampFoot) || p.x > P.rampFoot.x ? g(P.rampTop.x, P.rampTop.z, P.bandY) : g(P.rampFoot.x - 1, P.rampFoot.z);
    if (inRect(P.carousel, p.x, p.z)) return g((P.link.x0 + P.link.x1) / 2, P.link.z1 - 1);
    if (inRect(P.walkNear, p.x, p.z, 0.5)) return g(P.yard.x0 + 1, -66);
    // the landing, the gallery, the link, the walkway: back east along the zigzag
    for (let i = P.walk.length - 1; i >= 0; i--) {
      const [x, z] = P.walk[i];
      if (x > p.x + 0.4 && Math.hypot(x - p.x, z - p.z) > 1.1) return g(x, z);
    }
    return g(P.yard.x0 + 1, -66);
  }

  // ───────────── dev ─────────────
  /** Dev warp past the clock: the X is on the bridge, the gate is open (no sky moment). */
  debugClockDone(): void {
    this.clockDone = true;
    this.sky.snap(true);
    this.h.pier.openGate();
  }

  /** Dev warp / story skip: as if the Gramophone had been beaten. */
  debugClear(): void {
    this.debugClockDone();
    this.h.pier.yardLock.unlock();
    this.h.pier.springLock.unlock();
    this.quiet = true;
    this.sky.snap(false);
    if (!this.gramophone.disposed && !this.gramophone.harmless) this.gramophone.debugRepaint();
    this.lowerBridge();
  }

  dispose(): void {
    this.sky.dispose();
  }
}
