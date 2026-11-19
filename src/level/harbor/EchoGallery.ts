/**
 * [INPUT]: depends on GalleryHorn/PIER from ./BandstandPier; Shoutable from ./Shout; Crown from ../Collectibles;
 *          GameContext (effects, audio, events) from core/Context
 * [OUTPUT]: exports EchoGallery (targets(), step(), won) — the pier's optional challenge
 * [POS]: Bandstand Pier's side goal: step onto the Echo Gallery and six brass horns pop up one at a time; SHOUT each
 *        before it sinks. 8 of 10 wins the gallery crown. Owned by PierDirector; its horns are Shoutables it hands
 *        to the session's ShoutSystem.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { Crown } from '../Collectibles';
import { t } from '../../i18n';
import { inRect, PIER, type GalleryHorn } from './BandstandPier';
import type { Shoutable } from './Shout';

const POPS = 10;
const NEED = 8;
const UP_T = 2.3; // seconds a horn stays up
const GAP_T = 0.55;
const DOWN_Y = -2.2; // horn group offset under the deck (hidden)
const UP_Y = -0.6;

export class EchoGallery {
  private state: 'idle' | 'run' | 'done' | 'cool' = 'idle';
  private pop = 0;
  private hits = 0;
  private cur = -1;
  private t = 0;
  private hit = false;
  private mats: THREE.MeshToonMaterial[] = [];

  constructor(
    private ctx: GameContext,
    private horns: GalleryHorn[],
    private crown: Crown,
    private toast: (text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>) => void,
  ) {
    for (const h of horns) {
      // each horn its own brass (it glows when it's up)
      const m = (h.bell.material as THREE.MeshToonMaterial).clone();
      h.bell.material = m;
      this.mats.push(m);
      h.root.position.y = PIER.y + DOWN_Y;
    }
  }

  get won(): boolean {
    return this.state === 'done';
  }

  /** The horns as shout targets (only the one that is up listens). */
  targets(): Shoutable[] {
    return this.horns.map((h, i) => ({
      pos: h.pos,
      radius: 0.9,
      enabled: () => this.state === 'run' && this.cur === i && !this.hit && h.up > 0.5,
      onShout: () => {
        this.hit = true;
        this.hits++;
        this.ctx.effects.comic(h.pos.clone().setY(h.pos.y + 1.2), t('HONK!'), '#ffd23a', 0.8);
        this.ctx.effects.burst(h.pos, '#ffd23a', 10, 3);
        this.ctx.audio.play('smallBell', { pos: h.pos, pitch: 1 + this.hits * 0.06 });
        return true;
      },
    }));
  }

  step(dt: number, p: PlayerController): void {
    const on = inRect(PIER.gallery, p.pos.x, p.pos.z, -0.5) && Math.abs(p.pos.y - PIER.y) < 1.5;
    if (this.state === 'cool' && !on) this.state = 'idle';
    if (this.state === 'idle' && on) {
      this.state = 'run';
      this.pop = 0;
      this.hits = 0;
      this.next();
      this.toast('ECHO GALLERY! Horns pop up one at a time — SHOUT at each before it sinks. {need} of {n} wins a crown.', 'info', { need: NEED, n: POPS });
    }
    if (this.state === 'run') {
      this.t += dt;
      if (this.t > UP_T + GAP_T || (this.hit && this.t > 0.35)) {
        this.pop++;
        if (this.pop >= POPS) this.end();
        else this.next();
      }
    }
    // the horns rise and sink
    this.horns.forEach((h, i) => {
      const want = this.state === 'run' && i === this.cur && !this.hit && this.t < UP_T ? 1 : 0;
      h.up += (want - h.up) * Math.min(1, dt * (want ? 10 : 6));
      h.root.position.y = PIER.y + DOWN_Y + (UP_Y - DOWN_Y) * h.up;
      this.mats[i].emissive.setRGB(want * 0.5, want * 0.38, 0);
    });
  }

  private next(): void {
    let i = Math.floor(Math.random() * this.horns.length);
    if (i === this.cur) i = (i + 1 + Math.floor(Math.random() * (this.horns.length - 1))) % this.horns.length;
    this.cur = i;
    this.t = 0;
    this.hit = false;
    this.ctx.audio.play('pop', { pos: this.horns[i].pos, pitch: 1.3 });
  }

  private end(): void {
    this.cur = -1;
    if (this.hits >= NEED) {
      this.state = 'done';
      this.crown.hidden = false;
      this.ctx.effects.burst(this.crown.pos, '#ffd23a', 24, 4);
      this.ctx.audio.play('fanfare', { vol: 0.8 });
      this.toast('{hits}/{n}! The Echo Gallery’s crown rises out of the floor.', 'good', { hits: this.hits, n: POPS });
    } else {
      this.state = 'cool';
      this.toast('{hits}/{n} — not quite. Step off the gallery and back on to try again.', 'warn', { hits: this.hits, n: POPS });
    }
  }
}
