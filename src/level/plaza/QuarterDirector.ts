/**
 * [INPUT]: depends on BuiltQuarter (spawns, washMarks, inSquare, crownInkwell) from ./CrossedQuarter; QUARTER/inTear from ../Terrain;
 *          WhiteoutBottle, Stapler, RedInkwell, PeepingLamp from ../../enemy; StoryDirector beats (midBossIntro, inkWashed);
 *          the GameSession hooks in QuarterHost (addEnemy, spawnGrub, toast, after)
 * [OUTPUT]: exports QuarterDirector (step, hint, guideGoal, debugClear) and the QuarterHost hook surface
 * [POS]: the GAMEPLAY of the level-1 second district: encounters, first-meeting tips, the mid-boss, the red
 *        红笔用红墨水封住盲眼雕像。提示指向红墨水瓶，击败它后解封。此模块也处理掉进裂缝。
 *        The Inkwell fights only while WAI is in its square (BuiltQuarter.inSquare). Its hints wait for the
 *        shared stuck rule (QuarterHost.stuck, src/ui/Guide.ts): tried-and-failed, then one line.
 *        GameSession owns one; CrossedQuarter owns the geometry.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { OrganHost } from '../../hosts/OrganHost';
import type { EnemyBase } from '../../enemy/EnemyBase';
import type { StoryDirector } from '../../story/StoryDirector';
import { WhiteoutBottle } from '../../enemy/WhiteoutBottle';
import { Stapler } from '../../enemy/Stapler';
import { RedInkwell } from '../../enemy/RedInkwell';
import { PeepingLamp } from '../../enemy/PeepingLamp';
import { PAL } from '../../render/PaintTextures';
import { inTear, QUARTER } from '../Terrain';
import type { BuiltQuarter } from './CrossedQuarter';
import { t } from '../../i18n';

/** What the director needs from the session (closures over its private plumbing). */
export interface QuarterHost {
  ctx: GameContext;
  player: PlayerController;
  quarter: BuiltQuarter;
  statue: OrganHost;
  woken: ReadonlySet<string>;
  story: StoryDirector;
  addEnemy<T extends EnemyBase>(e: T): T;
  spawnGrub(p: THREE.Vector3, leash: number): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>): void;
  after(sec: number, fn: () => void): void;
  /** Is the sketched spring at this spot painted real yet? */
  springDone(pos: THREE.Vector3): boolean;
  /** The shared stuck rule (src/ui/Guide.ts): the player has made no progress for a while. */
  stuck(): boolean;
}

const REFUSE = 'The Red Pen sealed my eye with red ink. Beat its Red Inkwell in the Crossed-Out Quarter to lift the mark.';

/** One tip the first time WAI meets each new creature (the counter in one line). */
const TIPS: Record<string, string> = {
  whiteout: 'WHITE-OUT BOTTLE: its front cap blanks paint. Get BEHIND it and spray the soft pink back. When it tips over, side-step the roll!',
  stapler: 'STAPLER: when it crouches, a red ring marks where it lands. Dodge (C) or step out — if it misses, it’s stuck: TAG IT!',
};

/** In the quarter (street level, east high ground)? */
export const inQuarter = (p: THREE.Vector3) => p.x > 26.2 && p.z < -10 && p.y > QUARTER.y - 1.6;

export class QuarterDirector {
  readonly inkwell: RedInkwell;
  private ids = new Map<string, EnemyBase>();
  private tipped = new Set<string>();
  private statueCross: THREE.Mesh;
  private crossFade = -1;
  private toldWay = false;
  private toldSpring = false;
  private toldHigher = false;
  /** Seconds spent at the East Walk's crossed-out boards, and the jumps tried there. */
  private wallT = 0;
  private wallJumps = 0;
  private wallAir = 0;
  /** Dev warps skip the wash cutscene. */
  private quiet = false;

  constructor(private h: QuarterHost) {
    const sp = h.quarter.spawns;
    const add = <T extends EnemyBase>(e: T): T => {
      this.ids.set(e.id, e);
      return h.addEnemy(e);
    };
    const refill = () => h.ctx.events.emit('weapon:refill', {});
    // encounter 1 · Gate Yard: a Stapler and three grubs
    add(new Stapler(h.ctx, 'q-stapler-yard', sp.yardStapler));
    for (const g of sp.yardGrubs) h.spawnGrub(g, 8);
    // encounter 2 · past the tear: a Stapler waits for WAI to step off the planks nobody drew
    add(new Stapler(h.ctx, 'q-stapler-tear', sp.tearStapler));
    // encounter 3 · the East Walk: a Peeping Lamp (the Blot hides it from the yard) and a White-out
    // Bottle that blanks the paint on the sketched spring while you try to make it real
    add(new PeepingLamp(h.ctx, 'q-lamp-walk', sp.walkLamp, { tutorial: true, drops: null }));
    add(new WhiteoutBottle(h.ctx, 'q-bottle-walk', sp.walkBottle)).onRefill = refill;
    // the mid-boss · Inkwell Square
    this.inkwell = add(new RedInkwell(h.ctx, 'inkwell', sp.inkwell));
    this.inkwell.onWake = () => {
      h.story.midBossIntro(this.inkwell.pos, 'THE RED INKWELL');
      h.after(2.4, () => h.toast('It holds the Red Pen’s ink. Spray its mouth — and when it corks itself, PAINT SLAM it: jump, then C in mid-air.', 'warn'));
    };
    // it fights only WAI on its side of the red barricades (no waking, no hits over them)
    this.inkwell.reachable = () => h.quarter.inSquare(h.player.pos);
    this.inkwell.onHelper = () => {
      const b = add(new WhiteoutBottle(h.ctx, 'q-bottle-ink', sp.inkwellHelper));
      b.onRefill = refill;
      h.ctx.effects.burst(sp.inkwellHelper.clone().setY(sp.inkwellHelper.y + 1), '#ffffff', 16, 4);
      return b;
    };
    this.inkwell.onFinished = () => this.washed();

    // first meetings
    h.ctx.events.on('enemy:noticed', ({ id }) => {
      const e = this.ids.get(id);
      if (!e || this.tipped.has(e.kind) || !TIPS[e.kind]) return;
      this.tipped.add(e.kind);
      h.toast(TIPS[e.kind], 'warn');
    });

    // the third Guardian waits: a red cross over the Blind Statue's eye
    h.statue.def.refuses = { ...(h.statue.def.refuses ?? {}), EYE: REFUSE };
    const tex = new THREE.CanvasTexture(crossCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    this.statueCross = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.statueCross.userData.noPaint = true;
    const eye = h.statue.socketWorld('EYE').addScaledVector(h.statue.forward(), 0.25);
    h.statue.bodyGroup.updateWorldMatrix(true, false);
    this.statueCross.position.copy(h.statue.bodyGroup.worldToLocal(eye.clone()));
    this.statueCross.rotation.z = 0.12;
    h.statue.bodyGroup.add(this.statueCross);
  }

  get cleared(): boolean {
    return this.h.quarter.washed;
  }

  /** The Inkwell is repainted: the marks wash off, the crown pops out, the statue's cross goes. */
  private washed(): void {
    const h = this.h;
    h.quarter.washMarks();
    const c = h.quarter.crownInkwell;
    c.hidden = false;
    h.ctx.effects.burst(c.pos, PAL.yellow, 18, 3);
    if (this.quiet) return this.liftStatueCross();
    h.after(1.6, () => {
      h.story.inkWashed(new THREE.Vector3(44, QUARTER.y + 17, -28), h.statue.socketWorld('EYE'), () => this.liftStatueCross());
      h.after(5.8, () => h.toast('The red barricades fold away. Drop off the square onto the workyard rooftop — or take the lane — and give your Eye to the Blind Statue!', 'good'));
    });
  }

  private liftStatueCross(): void {
    if (this.crossFade >= 0) return;
    this.crossFade = 0;
    const r = { ...(this.h.statue.def.refuses ?? {}) };
    delete r.EYE;
    this.h.statue.def.refuses = r;
    this.h.ctx.effects.burst(this.h.statue.socketWorld('EYE'), PAL.red, 20, 3);
    this.h.ctx.audio.play('reveal', { pos: this.h.statue.socketWorld('EYE') });
  }

  /** Dev warp / story skip: as if the Inkwell had been beaten. */
  debugClear(): void {
    this.quiet = true;
    if (!this.inkwell.disposed && !this.inkwell.harmless) this.inkwell.debugRepaint();
    this.liftStatueCross();
  }

  step(dt: number): void {
    const h = this.h;
    const p = h.player;
    if (this.crossFade >= 0 && this.crossFade < 1) {
      this.crossFade = Math.min(1, this.crossFade + dt * 0.8);
      (this.statueCross.material as THREE.MeshBasicMaterial).opacity = 1 - this.crossFade;
      this.statueCross.scale.setScalar(1 + this.crossFade * 0.6);
      if (this.crossFade >= 1) this.statueCross.visible = false;
    }
    // the way to the quarter: only for a player who has stopped finding it
    if (!this.toldWay && h.woken.has('gatehouse') && !this.cleared && h.stuck() && !inQuarter(p.pos)) {
      this.toldWay = true;
      h.toast('The redrawn road climbs to its second bend. From there, a sunken lane runs east — someone crossed out a whole quarter up there.', 'info');
    }
    // fell into the tear: the canvas spits WAI back out at the quarter's spray can
    const T = QUARTER.tear;
    const underTear = p.pos.x > T.x0 - 3 && p.pos.x < T.x1 + 3 && p.pos.z > T.z0 - 3 && p.pos.z < T.z1 + 3;
    if (p.pos.y < QUARTER.y - 2.6 && p.pos.y > QUARTER.y - 12 && (inTear(p.pos.x, p.pos.z) || underTear) && !p.smudged) {
      p.teleport(h.quarter.checkpointAt.clone().add(new THREE.Vector3(0, 0.1, 1.2)), Math.PI / 2);
      h.ctx.camera.yaw = Math.PI / 2;
      h.ctx.audio.play('whoosh', { pitch: 0.7 });
      p.hp = Math.max(1, p.hp - 1);
      h.ctx.events.emit('player:damaged', { hp: p.hp });
      h.toast('WAI fell through the tear — redrawn at the quarter’s spray can. Aim at the gap (right-click / Z) to see the planks nobody drew, lend your Eye to the street lamp, or jet-hover over.', 'warn');
    }
    // the East Walk's crossed-out boards: WAI thinks out loud only after he has tried and failed
    this.atWall(dt);
  }

  /**
   * The East Walk ends at boards with a red cross on them, 3 m of collider over a 1.35 m jump. The painted spring
   * is one way over; worn Legs (2.9 m jump, the workyard's optional creature) are the other. A player who skipped
   * the Legs and never noticed the spring used to stand here with nothing to go on.
   */
  private atWall(dt: number): void {
    const h = this.h;
    const p = h.player;
    const spring = h.quarter.springs[0].pos;
    if (this.cleared || h.springDone(spring)) return;
    // south of the boards, on the walk, looking at them
    const atWall = p.pos.z < -24.4 && p.pos.z > -31 && p.pos.x > 46 && p.pos.y > QUARTER.y - 1 && p.pos.y < QUARTER.y + 2.5;
    if (!atWall) {
      this.wallT = 0;
      return;
    }
    this.wallT += dt;
    if (!p.grounded && p.vy > 0 && this.wallAir <= 0) {
      this.wallAir = 0.6;
      this.wallJumps++;
    }
    this.wallAir = Math.max(0, this.wallAir - dt);
    if (!this.toldHigher && ((this.wallJumps >= 2 && this.wallT > 4) || this.wallT > 8)) {
      this.toldHigher = true;
      h.toast('“That cross is too high for me… maybe if I could jump higher. Somebody in this city has longer legs.”', 'info');
      return;
    }
    // still here right by the sketched spring: name it promptly
    if (this.toldHigher && !this.toldSpring && this.wallT > 12 && p.pos.distanceTo(spring) < 10) {
      this.toldSpring = true;
      h.toast('A sketched spring! Spray it full to make it real — then jump on it to clear the red barricade.', 'info');
    }
  }

  /** The hint line while the quarter is the next step (null = the session's own hint). */
  hint(): string | null {
    const h = this.h;
    if (!h.woken.has('gatehouse') || h.woken.has('statue') || this.cleared) return null;
    if (this.inkwell.engaged) return t(this.inkwell.counterHint);
    const p = h.player.pos;
    if (!inQuarter(p)) return t('The Red Pen crossed out the Statue’s eye. Follow the sunken lane east from the second bend to find its Red Inkwell.');
    const spring = h.quarter.springs[0].pos;
    if (p.x >= QUARTER.tear.x0 && p.z < -24 && !h.springDone(spring)) return t('Paint the sketched spring full, then jump on it to sail over the red barricade');
    // west of the tear: how to get over it
    if (p.x < QUARTER.tear.x0 && p.z < -28 && p.z > -44) return t('The street is torn. Aim at the gap (right-click / Z) to see planks nobody drew — or lend your Eye to the street lamp, or jet-hover over');
    return t('Beat the Red Inkwell in the square behind the big rock. The red cross over the Statue’s eye will wash away.');
  }

  /** Where the guide arrow points while the quarter is the next step (null = not now). */
  guideGoal(): THREE.Vector3 | null {
    const h = this.h;
    if (!h.woken.has('gatehouse') || h.woken.has('statue') || this.cleared) return null;
    const p = h.player.pos;
    const spring = h.quarter.springs[0].pos;
    // west of the tear: point to the planks over the gap first
    if (inQuarter(p) && p.x < QUARTER.tear.x0 && !h.quarter.inSquare(p)) return new THREE.Vector3(41.25, QUARTER.y + 1.2, -36.6);
    // on the East Walk with the spring still a sketch: the spring is the goal
    if (inQuarter(p) && p.x >= QUARTER.tear.x0 && p.z < -24 && !h.springDone(spring)) return spring.clone();
    return this.inkwell.pos.clone().setY(this.inkwell.pos.y + 3.6);
  }
}

/** The red cross for the statue's eye (same brush as the quarter's marks, smaller canvas). */
function crossCanvas(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  for (const [w, col] of [[22, '#7a0d1a'], [15, '#e8323c']] as [number, string][]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(20, 22);
    g.lineTo(108, 106);
    g.moveTo(108, 20);
    g.lineTo(22, 108);
    g.stroke();
  }
  return c;
}
