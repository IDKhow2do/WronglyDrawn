/**
 * [INPUT]: depends on GameContext (effects.sound) from core/Context; PlayerController (takeHit, pos, smudged) from player/;
 *          SoundShapes (wallFront, ringFront, dangerZone, soundSplat, the palettes) from render/
 * [OUTPUT]: exports SoundWaves (blare(): a travelling arc wall of sound; blast(): a floor ring to jump; tell(): the
 *           blare's warning) and WaveOpts
 * [POS]: shared projectile helper for the level-2 expansion creatures (MegaphoneCrab, RedGramophone).
 *        Mirrors Lobbed for level 1: the creature owns one, calls update() every step and clear() on finish.
 *        A blare is dodged sideways (or rolled through); a blast is jumped. A hit can MUFFLE WAI (onMuffle).
 *        Drawn in the same hand-drawn language as WAI's SHOUT, in the correctors' red and grey: every frame the
 *        front is drawn at exactly the radius, opening and height the hit test uses.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import { SOUND_GLYPH } from '../render/SoundFx';
import { SOUND_INK_HUSH, SOUND_INK_OURS, SOUND_INK_THEIRS, dangerZone, ringFront, soundSplat, wallFront, type SoundInk } from '../render/SoundShapes';

export interface WaveOpts {
  /** Accent colour (comic words on a hit). */
  color: string;
  /** Half the arc's opening (rad). Blasts are full rings. */
  half: number;
  speed: number;
  range: number;
  /** Half hearts on a hit. */
  damage: number;
  /** Seconds of no-shouting on a hit (0 = none). */
  muffle: number;
  /** Wall height (m): blares are tall (step aside), blasts are low (jump). */
  height: number;
  /** Whose noise: the correctors' red (default), WAI's own stolen shout, or the Hush's lilac silence. */
  ink?: 'theirs' | 'ours' | 'hush';
  /** Marks that fly off the front (default: "!" for blares, notes for blasts). */
  glyph?: number;
}

interface Wave {
  from: THREE.Vector3;
  dir: THREE.Vector3;
  o: WaveOpts;
  ink: SoundInk;
  r: number;
  ring: boolean;
  hit: boolean;
  on: boolean;
  seed: number;
  /** Seconds to the next mark flying off the front. */
  markT: number;
}

const POOL = 4;
const _to = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vel = new THREE.Vector3();
const INKS: Record<NonNullable<WaveOpts['ink']>, SoundInk> = { theirs: SOUND_INK_THEIRS, ours: SOUND_INK_OURS, hush: SOUND_INK_HUSH };

/** A pool of sound waves (arc walls and floor rings) with their own hit tests. */
export class SoundWaves {
  private waves: Wave[] = [];
  /** WAI was hit and muffled (seconds): the session silences his shout. */
  onMuffle: ((sec: number) => void) | null = null;

  constructor(private ctx: GameContext) {
    for (let i = 0; i < POOL; i++)
      this.waves.push({ from: new THREE.Vector3(), dir: new THREE.Vector3(), o: null as unknown as WaveOpts, ink: SOUND_INK_THEIRS, r: 0, ring: false, hit: false, on: false, seed: 0, markT: 0 });
  }

  private take(): Wave {
    return this.waves.find((w) => !w.on) ?? this.waves[0];
  }

  /** A wall of sound from `from` along `dir` (flat): step out of its arc, or roll through it. */
  blare(from: THREE.Vector3, dir: THREE.Vector3, o: WaveOpts): void {
    const w = this.take();
    this.arm(w, from, o, false);
    w.dir.set(dir.x, 0, dir.z).normalize();
  }

  /** A low ring rolling out over the floor from `center`: jump it as it passes. */
  blast(center: THREE.Vector3, o: WaveOpts): void {
    const w = this.take();
    this.arm(w, center, o, true);
    w.dir.set(0, 0, 1);
  }

  /**
   * The blare's warning, drawn this frame: its footprint at full range on the floor, edges included,
   * and breath gathering into the mouth. Call it every step of the tell (k: 0 → 1).
   */
  tell(from: THREE.Vector3, dir: THREE.Vector3, o: WaveOpts, k: number): void {
    _to.set(dir.x, 0, dir.z).normalize();
    dangerZone(this.ctx.effects.sound, from, _to, o.half, o.range, INKS[o.ink ?? 'theirs'], k, 3.7);
  }

  private arm(w: Wave, from: THREE.Vector3, o: WaveOpts, ring: boolean): void {
    w.on = true;
    w.ring = ring;
    w.hit = false;
    w.o = o;
    w.ink = INKS[o.ink ?? 'theirs'];
    w.r = 0.6;
    w.seed = Math.random() * 30;
    w.markT = 0.05;
    w.from.copy(from);
  }

  get active(): number {
    let n = 0;
    for (const w of this.waves) if (w.on) n++;
    return n;
  }

  update(dt: number, player: PlayerController): void {
    const fx = this.ctx.effects.sound;
    for (const w of this.waves) {
      if (!w.on) continue;
      w.r += w.o.speed * dt;
      const k = w.r / w.o.range;
      if (k >= 1) {
        w.on = false;
        continue;
      }
      // the front, exactly where it hits
      const fade = Math.min(1, (1 - k) * 2.5) * Math.min(1, w.r * 1.5);
      if (w.ring) ringFront(fx, w.from, w.r, w.o.height, w.ink, fade, w.seed);
      else wallFront(fx, w.from, w.dir, w.r, w.o.half, w.o.height, w.ink, fade, w.seed);
      // marks fly off it
      w.markT -= dt;
      if (w.markT <= 0) {
        w.markT = w.ring ? 0.09 : 0.12;
        const a = w.ring ? Math.random() * Math.PI * 2 : Math.atan2(w.dir.x, w.dir.z) + (Math.random() * 2 - 1) * w.o.half;
        _vel.set(Math.sin(a), 0, Math.cos(a));
        _p.copy(w.from).addScaledVector(_vel, w.r).setY(w.from.y + w.o.height * (0.4 + Math.random() * 0.8));
        _vel.multiplyScalar(w.o.speed * 0.8).setY(1.2);
        fx.spawnGlyph({ pos: _p, vel: _vel, glyph: w.o.glyph ?? (w.ring ? SOUND_GLYPH.notes : Math.random() < 0.5 ? SOUND_GLYPH.bang2 : SOUND_GLYPH.note), size: 0.34, color: Math.random() < 0.6 ? w.ink.a : w.ink.c, dur: 0.45, spin: (Math.random() - 0.5) * 4 });
      }
      if (w.hit || player.smudged) continue;
      // the wall passes WAI: inside its arc, at its height?
      _to.copy(player.pos).sub(w.from);
      const dy = _to.y;
      _to.y = 0;
      const d = _to.length();
      if (Math.abs(d - w.r) > 0.55 || dy < -0.8 || dy > w.o.height) continue;
      if (!w.ring && d > 0.01 && _to.dot(w.dir) / d < Math.cos(w.o.half)) continue;
      w.hit = true;
      if (player.takeHit(w.from, w.o.damage, 7)) {
        if (w.o.muffle > 0) this.onMuffle?.(w.o.muffle);
        _p.copy(player.pos).setY(player.pos.y + 1);
        soundSplat(fx, _p, w.ink, w.o.muffle > 0);
        this.ctx.effects.burst(_p, w.o.color, 8, 3, 0.06);
      }
    }
  }

  clear(): void {
    for (const w of this.waves) w.on = false;
  }

  dispose(): void {
    this.clear();
  }
}
