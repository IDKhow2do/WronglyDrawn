/**
 * [INPUT]: depends on WorksBuilt (floors, locks, Guardians) from ./LimpWorks; WorksStory; WORKS/FY/floorOf/inRect/stairStep from
 *          ./WorksLayout; StampPress, RulerSnake, CompassSpinner, CrookedLegMutant from ../../enemy; OrganType; the session hooks
 *          in WorksHost (addEnemy, guardianWoken, recall, toast, after, respawn, partners); PlayBody from player/PlayBody
 * [OUTPUT]: exports WorksDirector (step, hint, guideGoal, debugTo, tipsFor) and the WorksHost hook surface
 * [POS]: the GAMEPLAY of Limp Works: who stands where (the Index crowd gets the Index as its home room), the encounter crowds and the locks they hold (the lift's CORRECT
 *        tape, the card catalogue), the three Guardian wakes (Legs → the lift climbs; Eye → the pencil stair is drawn;
 *        Eye + a shout → the roof stair opens), the lift ride, pit falls, first-meeting tips, the hint line and the
 *        guide's goal. WorksSession owns one; LimpWorks owns the geometry; RedPenBoss lives in the session.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { PlayBody } from '../../player/PlayBody';
import type { OrganInventory } from '../../organs/OrganInventory';
import type { OrganType } from '../../organs/Organ';
import type { EnemyBase } from '../../enemy/EnemyBase';
import type { OrganHost } from '../../hosts/OrganHost';
import { StampPress } from '../../enemy/StampPress';
import { RulerSnake } from '../../enemy/RulerSnake';
import { CompassSpinner } from '../../enemy/CompassSpinner';
import { CrookedLegMutant } from '../../enemy/CrookedLegMutant';
import { t } from '../../i18n';
import type { WorksBuilt } from './LimpWorks';
import type { WorksStory } from './WorksStory';
import { FY, WORKS, floorOf, inRect, stairStep } from './WorksLayout';

export type GuardianId = 'lift' | 'inspector' | 'archivist';

export interface WorksHost {
  ctx: GameContext;
  player: PlayerController;
  built: WorksBuilt;
  story: WorksStory;
  inventory: OrganInventory;
  woken: Set<string>;
  addEnemy<T extends EnemyBase>(e: T): T;
  /** A Guardian woke: shared wake fx, music, boon; returns how many are awake. */
  guardianWoken(id: GuardianId, at: THREE.Vector3): number;
  /** The lent sticker of `type` flies back from its host. */
  recall(type: OrganType): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>): void;
  after(sec: number, fn: () => void): void;
  respawn(): void;
  /** The shared stuck rule (src/ui/Guide.ts): the player has made no progress for a while. */
  stuck(): boolean;
  /** Bodies besides WAI that the floor's mechanisms act on (the co-op partner; none when she is off). */
  partners(): readonly PlayBody[];
}

const TIPS: Record<string, string> = {
  crookedLeg: 'THE LIMP has your LEGS! Spray it — its knees glow when it stumbles. Repaint it and the Legs drop out.',
  stamppress: 'STAMP PRESS: it stamps CORRECT on everything — it thinks it’s helping. Its stamp wipes paint off its front: when it stamp-runs at you, SPRINT (Shift) UNDER the raised ram to its back, then paint the ink pad!',
  rulersnake: 'RULER SNAKE: it can’t bear a crooked line. It lies dead straight beside a crooked platform and “fixes” it — and the platform FALLS. Paint it: paint bends it back.',
  compass: 'COMPASS SPINNER: it wants every circle perfect. It plants its needle and draws a red one — JUMP the pencil and the line, then paint the NEEDLE to topple it!',
};

function allQuiet(list: readonly EnemyBase[]): boolean {
  for (const e of list) if (!e.harmless && !e.disposed) return false;
  return true;
}

function nearestLive(list: readonly EnemyBase[], p: THREE.Vector3): EnemyBase | null {
  let best: EnemyBase | null = null;
  for (const e of list) if (!e.harmless && !e.disposed && (!best || e.pos.distanceTo(p) < best.pos.distanceTo(p))) best = e;
  return best;
}

export class WorksDirector {
  readonly mutant: CrookedLegMutant;
  readonly beltCrowd: EnemyBase[] = [];
  readonly westCrowd: EnemyBase[] = [];
  readonly readingCrowd: EnemyBase[] = [];
  readonly indexCrowd: EnemyBase[] = [];
  readonly snakes: RulerSnake[] = [];
  private ids = new Map<string, EnemyBase>();
  private tipped = new Set<string>();
  private told = new Set<string>();
  private archivistRead = false;
  private quiet = false;

  constructor(private h: WorksHost) {
    const S = WORKS.spawns;
    const b = h.built;
    const add = <T extends EnemyBase>(e: T): T => {
      this.ids.set(e.id, e);
      return h.addEnemy(e);
    };
    // F1: THE LIMP (it has the Legs), the stamp presses on the belt floor and at the lift
    this.mutant = add(new CrookedLegMutant(h.ctx, 'limp', S.mutant));
    S.pressBelt.forEach((p, i) => this.beltCrowd.push(add(new StampPress(h.ctx, `w3-press-belt-${i}`, p))));
    this.beltCrowd.push(add(new StampPress(h.ctx, 'w3-press-lift', S.pressLift)));
    // F2: two ruler snakes on the pit rims (they straighten the platforms), the Inspector's yard
    S.snakesPit.forEach((p, i) => this.snakes.push(add(new RulerSnake(h.ctx, `w3-snake-pit-${i}`, p, b.stamping.platforms))));
    this.westCrowd.push(add(new StampPress(h.ctx, 'w3-press-west', S.pressWest)));
    const sw = add(new RulerSnake(h.ctx, 'w3-snake-west', S.snakeWest, []));
    this.snakes.push(sw);
    this.westCrowd.push(sw);
    // F3: compasses in the Reading Room, a mixed crowd in the Index
    S.compassReading.forEach((p, i) => this.readingCrowd.push(add(new CompassSpinner(h.ctx, `w3-compass-reading-${i}`, p))));
    this.indexCrowd.push(add(new CompassSpinner(h.ctx, 'w3-compass-index', S.compassIndex)));
    const si = add(new RulerSnake(h.ctx, 'w3-snake-index', S.snakeIndex, []));
    this.snakes.push(si);
    this.indexCrowd.push(si, add(new StampPress(h.ctx, 'w3-press-index', S.pressIndex)));
    // the Index crowd lives behind the catalogue: chases stay in the room, the way home is the gate
    for (const e of this.indexCrowd) e.room = WORKS.indexRoom;
    for (const s of this.snakes)
      s.onMeasured = () => this.once('measured', 'A Ruler Snake measured the platform DEAD STRAIGHT — and it fell! Paint the snakes first: paint bends them.', 'warn');

    // the servants are correction tools: repainted, they stop correcting (the player is told once)
    h.ctx.events.on('enemy:stunned', ({ id }) => {
      const e = this.ids.get(id);
      if (e && e.kind !== 'crookedLeg') this.once('stopped', 'Repainted, it stops correcting — and starts playing. The Red Pen’s tools only ever thought they were helping.', 'good');
    });
    h.ctx.events.on('enemy:noticed', ({ id }) => {
      const e = this.ids.get(id);
      if (!e || this.tipped.has(e.kind) || !TIPS[e.kind]) return;
      this.tipped.add(e.kind);
      h.toast(TIPS[e.kind], 'warn');
    });

    // ── Guardian 1 · the Freight Lift (lend it the Legs) ──
    b.lift.host.def.onOrgans = (host) => {
      if (!host.lent('LEG') || h.woken.has('lift')) return;
      if (!b.hall.tape.open) {
        h.toast('The Red Pen’s CORRECT tape is round the lift — repaint the stamp presses first!', 'warn');
        h.after(0.8, () => h.recall('LEG'));
        return;
      }
      this.wakeLift(host);
    };
    // ── Guardian 2 · the Inspector (lend it the Eye) ──
    b.inspector.host.def.onOrgans = (host) => {
      if (!host.lent('EYE') || h.woken.has('inspector')) return;
      if (!allQuiet(this.westCrowd)) {
        h.toast('The Inspector won’t look while the Red Pen’s servants stamp about its yard — repaint them first!', 'warn');
        h.after(0.8, () => h.recall('EYE'));
        return;
      }
      this.wakeInspector(host);
    };
    // ── Guardian 3 · the Archivist (the Eye to read, a shout into its horn to speak) ──
    b.archivist.host.def.onOrgans = (host) => {
      if (!host.lent('EYE') || h.woken.has('archivist')) return;
      if (!allQuiet(this.indexCrowd)) {
        h.toast('The Archivist is shaking too hard to read — repaint the Red Pen’s servants in the Index first!', 'warn');
        h.after(0.8, () => h.recall('EYE'));
        return;
      }
      this.archivistRead = true;
      h.toast('The Archivist READS again! Now give it a voice: SHOUT (X) into its brass horn — Eye and Mouth together.', 'good');
    };
    b.archivist.onQuiet = () => this.once('archQuiet', 'It can’t read what to say — lend it your EYE first (face its monocle, press E), then SHOUT into the horn.', 'warn');
    b.archivist.onShout = () => this.wakeArchivist();
  }

  /** A nudge that waits for the shared stuck rule (src/ui/Guide.ts): the player tried, and stopped getting on. */
  private stuckOnce(key: string, text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    if (this.h.stuck()) this.once(key, text, kind);
  }

  private once(key: string, text: string, kind: 'info' | 'warn' | 'good' = 'info', params?: Record<string, string | number>): void {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.h.toast(text, kind, params);
  }

  // ───────────── the Guardians wake ─────────────
  private wakeLift(host: OrganHost): void {
    const h = this.h;
    const b = h.built;
    const n = h.guardianWoken('lift', host.socketWorld('LEG'));
    host.grantPermanent('LEG');
    b.lift.wake();
    b.hall.f.washer.start(this.quiet);
    if (!this.quiet) h.story.liftBeat(host.center());
    h.toast('THE FREIGHT LIFT WAKES! Its crossed-out legs are drawn back on — it can climb its shaft again.', 'good');
    h.after(this.quiet ? 0 : 3.0, () => {
      if (host.lent('LEG')) {
        h.recall('LEG');
        h.toast('“Got my own legs now — thanks!” Your Legs fly back.', 'info');
      }
    });
    h.after(this.quiet ? 0 : 6.5, () => h.toast('Guardian {n}/3 awake. Step into the lift’s cage — it’ll carry you up to the Stamping Floor.', 'good', { n }));
  }

  private wakeInspector(host: OrganHost): void {
    const h = this.h;
    const b = h.built;
    const n = h.guardianWoken('inspector', host.socketWorld('EYE'));
    host.grantPermanent('EYE');
    b.inspector.wake();
    b.stamping.drawStair(this.quiet);
    b.archive.showStairTop();
    b.stamping.f.washer.start(this.quiet);
    const st = WORKS.stair2;
    if (!this.quiet) {
      h.story.inspectorBeat(host.socketWorld('EYE'), stairStep(st, 8));
      for (const k of [2, 6, 10, 14]) h.after(1.6 + k * 0.12, () => h.story.pencilDraw(stairStep(st, k), 1.0));
    }
    h.toast('THE INSPECTOR LOOKS — and the pencil stair is inked in for real! PASSED.', 'good');
    h.after(this.quiet ? 0 : 3.2, () => {
      if (host.lent('EYE')) {
        h.recall('EYE');
        h.toast('“I can see it from here — have your Eye back.”', 'info');
      }
    });
    h.after(this.quiet ? 0 : 6.6, () => h.toast('Guardian {n}/3 awake. Up the stair by the west wall to the Archive! (Shortcut: a gangway now crosses the pit.)', 'good', { n }));
  }

  private wakeArchivist(): void {
    const h = this.h;
    const b = h.built;
    if (h.woken.has('archivist') || !this.archivistRead || !b.archivist.host.lent('EYE')) return;
    const host = b.archivist.host;
    const n = h.guardianWoken('archivist', b.archivist.horn);
    host.grantPermanent('EYE');
    b.archivist.wake();
    b.archive.grille.unlock();
    b.archive.f.washer.start(this.quiet);
    const c = b.archive.crownArchivist;
    c.hidden = false;
    h.ctx.effects.burst(c.pos, '#ffd23a', 18, 3);
    if (!this.quiet) h.story.archivistBeat(host.center(), WORKS.stair3.foot.clone());
    h.ctx.audio.play('bigBell', { pos: b.archivist.horn, vol: 0.7, pitch: 1.3 });
    h.toast('THE ARCHIVIST SPEAKS! “UN-CORRECTED!” it types — and the roof stair’s grille rattles up.', 'good');
    h.after(this.quiet ? 0 : 3.2, () => {
      if (host.lent('EYE')) h.recall('EYE');
    });
    h.after(this.quiet ? 0 : 6.6, () => h.toast('Guardian {n}/3 awake! The stair to the ROOF is open (south wall, behind the Reading Room). The Red Pen is waiting.', 'good', { n }));
  }

  // ───────────── every step ─────────────
  step(dt: number, time: number): void {
    const h = this.h;
    const b = h.built;
    const p = h.player;
    b.stamping.update(dt, time, p, (text, kind, params) => h.toast(text, kind, params), h.partners());
    // creatures on floors nobody can see are not drawn
    const shown = b.shown;
    for (const id of this.ids.values()) {
      if (id.disposed) continue;
      id.root.visible = (shown & (1 << floorOf(id.pos.y + 0.3))) !== 0;
    }
    // locks
    if (!b.hall.tape.open && allQuiet(this.beltCrowd)) {
      b.hall.tape.unlock();
      h.toast('The stamp presses are repainted — the CORRECT tape drops off the Freight Lift!', 'good');
    }
    if (!b.archive.gate.open && allQuiet(this.readingCrowd)) {
      b.archive.gate.unlock();
      h.toast('The compasses are repainted — the card catalogue slides open! The Index is beyond.', 'good');
    }
    // the lift ride: WAI steps into the woken cage
    if (b.lift.awake && !b.lift.atTop && !b.lift.riding && b.lift.inside(p.pos) && p.grounded && !h.story.locked) {
      b.lift.ride();
      h.story.rideShots();
    }
    // fell into the shredder pit: spat back out at the last spray can
    if (b.stamping.inPit(p.pos) && !p.smudged) {
      const hp = p.hp;
      h.respawn();
      p.hp = Math.max(1, hp - 1);
      h.ctx.events.emit('player:damaged', { hp: p.hp });
      h.ctx.audio.play('crash', { vol: 0.6, pitch: 1.5 });
      h.toast('Into the SHREDDER — it spat you back out at the spray can. Sprint and JUMP between the platforms (Long Legs reach far).', 'warn');
    }
    // nudges, once each
    const pos = p.pos;
    const f = floorOf(pos.y + 0.3);
    if (f === 0 && !h.inventory.get('LEG') && inRect(WORKS.entry, pos.x, pos.z) && pos.z < 13.6) this.stuckOnce('dock', 'The Loading Dock is too high to jump — without LEGS. THE LIMP has yours: repaint it!', 'info');
    if (f === 0 && h.inventory.worn('LEG') && inRect(WORKS.entry, pos.x, pos.z)) this.once('legs', 'LONG LEGS! Huge jumps and a faster sprint. Jump up onto the Loading Dock!', 'good');
    if (f === 0 && inRect(WORKS.beltFloor, pos.x, pos.z) && Math.abs(pos.y - (FY[0] + 1)) < 0.25) this.once('belt', 'Conveyor belts carry you along — and the trays of crossed-out drawings to the CORRECTOR.', 'info');
    if (f === 1 && pos.x > 8 && !h.woken.has('inspector')) this.stuckOnce('pit', 'The shredder pit splits the Stamping Floor in two. Cross on the hanging platforms — sprint, then LONG jumps — to the Inspector on the far side.', 'info');
    if (f === 1 && inRect(WORKS.stampRun, pos.x, pos.z, 1.5)) this.once('run', 'The STAMP RUN: step on the teal start pad, then sprint the press lane without getting stamped. A crown for the fast and the long-legged!', 'info');
    if (f === 1 && pos.x < -8.5 && !h.woken.has('inspector')) this.stuckOnce('west', 'The Inspector’s yard. The stair by the west wall is only a pencil sketch — the Inspector must LOOK at it (lend it your Eye).', 'info');
    if (f === 2 && !b.archive.gate.open && inRect(WORKS.reading, pos.x, pos.z)) this.stuckOnce('reading', 'The card catalogue is locked while the Reading Room is busy. Repaint the compasses!', 'info');
    if (f === 2 && pos.z < -10) this.once('archive', 'These are CHILDREN’S DRAWINGS — a crooked house, a wobbly sun, a cat. Every one crossed out WRONG and filed away, “for their own good”.', 'warn');
    if (f === 3) this.once('roof', 'The ROOF. The whole drawn city is down there — and the RED PEN is up here, correcting it as kindly as it knows how. Step into the red circle.', 'warn');
  }

  // ───────────── HUD ─────────────
  /** Hint line for the current step (null = the session decides). */
  hint(): string | null {
    const h = this.h;
    const b = h.built;
    const inv = h.inventory;
    const leg = inv.get('LEG');
    if (!leg) {
      return t(this.mutant.harmless ? 'Walk over the Legs Sticker to pick it up' : 'THE LIMP stomps about the entry yard with your Legs. Spray it — its glowing knees are the weak spot');
    }
    if (leg.corrupted) return t('Hold F to purify the crooked legs');
    if (!h.woken.has('lift')) {
      if (floorOf(h.player.pos.y + 0.3) === 0 && h.player.pos.z > 8) return t('Jump up onto the Loading Dock (Long Legs!), then cross the belts to the Freight Lift');
      if (!b.hall.tape.open) return t('The CORRECT tape closes the lift until the stamp presses are repainted. When one stamp-runs at you, SPRINT under its raised ram!');
      return t('The Freight Lift’s legs are crossed out. Face its control box and press E to lend it your LEGS (F to select)');
    }
    if (!b.lift.atTop) return t(b.lift.riding ? 'Going up…' : 'Step into the lift’s cage');
    if (!h.woken.has('inspector')) {
      const x = h.player.pos.x;
      if (x > 8) return t('Cross the shredder pit on the hanging platforms (sprint + jump) to the west side');
      if (!allQuiet(this.westCrowd)) return t('Repaint the stamp press and the ruler snake in the Inspector’s yard');
      return t('The Inspector’s lens is crossed out. Face it and press E to lend it your EYE (Q to select)');
    }
    if (floorOf(h.player.pos.y + 0.3) === 1) return t('Climb the inked stair by the west wall to the Archive');
    if (!h.woken.has('archivist')) {
      if (!b.archive.gate.open) return t('Through the stacks to the Reading Room — repaint the two Compass Spinners to open the card catalogue');
      if (!allQuiet(this.indexCrowd)) return t('Repaint the Red Pen’s servants in the Index');
      if (!b.archivist.host.lent('EYE')) return t('The Archivist can’t read: lend it your EYE (face its monocle, E)');
      return t('Now SHOUT (X) into the Archivist’s brass horn — Eye and Mouth together!');
    }
    if (floorOf(h.player.pos.y + 0.3) === 2) return t('The roof stair is open — south wall, behind the Reading Room');
    return null;
  }

  /** Where the arrow points (the next real step). */
  guideGoal(): THREE.Vector3 | null {
    const h = this.h;
    const b = h.built;
    const inv = h.inventory;
    const p = h.player.pos;
    const leg = inv.get('LEG');
    if (!leg) return this.mutant.harmless ? null : this.mutant.pos.clone().setY(this.mutant.pos.y + 2);
    if (leg.corrupted) return null;
    if (leg.lent && leg.hostId !== 'freight-lift') return null;
    if (!h.woken.has('lift')) {
      if (!b.hall.tape.open) return nearestLive(this.beltCrowd, p)?.pos.clone().setY(p.y + 1.4) ?? null;
      return b.lift.host.socketWorld('LEG').clone().setY(FY[0] + 0.6).setZ(b.lift.host.pos.z + 1.6);
    }
    if (!b.lift.atTop) return WORKS.cage.clone().setY(FY[0] + 0.3).add(new THREE.Vector3(-0.5, 0, 1));
    if (!h.woken.has('inspector')) {
      if (!allQuiet(this.westCrowd) && p.x < -8.5 && floorOf(p.y + 0.3) === 1) return nearestLive(this.westCrowd, p)?.pos.clone().setY(FY[1] + 1.4) ?? null;
      return b.inspector.host.socketWorld('EYE').clone().setY(FY[1] + 0.6).addScaledVector(b.inspector.host.forward(), 2.6);
    }
    if (!h.woken.has('archivist')) {
      if (!b.archive.gate.open) {
        const e = nearestLive(this.readingCrowd, p);
        if (e && floorOf(p.y + 0.3) === 2 && inRect(WORKS.reading, p.x, p.z, 2)) return e.pos.clone().setY(FY[2] + 1.4);
        return new THREE.Vector3(0, FY[2], 8);
      }
      if (!allQuiet(this.indexCrowd)) {
        const e = nearestLive(this.indexCrowd, p);
        if (e && inRect(WORKS.index, p.x, p.z)) return e.pos.clone().setY(FY[2] + 1.4);
        return new THREE.Vector3(12.6, FY[2], 9.5);
      }
      return b.archivist.host.socketWorld('EYE').clone().setY(FY[2] + 0.6).addScaledVector(b.archivist.host.forward(), 2.4);
    }
    return null;
  }

  // ───────────── dev warps ─────────────
  /** Bring the level's state up to `stage` (forwards only). Order: start legs lift stamp inspector archive index roof. */
  debugTo(stage: number): void {
    const h = this.h;
    const b = h.built;
    this.quiet = true;
    if (stage >= 2) {
      for (const e of this.beltCrowd) if (!e.harmless) e.debugRepaint();
      b.hall.tape.unlock();
      if (!h.woken.has('lift')) this.wakeLift(b.lift.host);
      b.lift.snapTop();
    }
    if (stage >= 4) {
      for (const e of [...this.westCrowd, ...this.snakes.slice(0, 2)]) if (!e.harmless) e.debugRepaint();
      if (!h.woken.has('inspector')) this.wakeInspector(b.inspector.host);
    }
    if (stage >= 6) {
      for (const e of this.readingCrowd) if (!e.harmless) e.debugRepaint();
      b.archive.gate.unlock();
    }
    if (stage >= 7) {
      for (const e of this.indexCrowd) if (!e.harmless) e.debugRepaint();
      if (!h.woken.has('archivist')) {
        this.archivistRead = true;
        h.guardianWoken('archivist', b.archivist.horn);
        b.archivist.host.grantPermanent('EYE');
        b.archivist.wake();
        b.archive.grille.unlock();
        b.archive.f.washer.start(true);
        b.archive.crownArchivist.hidden = false;
      }
    }
    this.quiet = false;
  }

  /** Is a creature one of this level's (tips table). */
  tipsFor(kind: string): string | null {
    return TIPS[kind] ?? null;
  }
}
