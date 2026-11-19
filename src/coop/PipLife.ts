/**
 * [INPUT]: depends on CoopPartner (pip, s, redraw, event, rules) from ./Coop; PLAYER (maxHp) from player/PlayerController;
 *          HeartTag from ./HeartTag
 * [OUTPUT]: exports PipLife (step, fell, render, dispose)
 * [POS]: the glue between her hearts (PipHealth) and the session. It answers PipHealth.onRedraw (the pencil draws her
 *        in next to WAI, full hearts), gives her the session's refills that cost WAI nothing (a checkpoint's refill; a
 *        paint drop WAI picks up while his hearts are already full), charges her WAI's price for a fall, runs the
 *        creatures' push-out on her and moves her heart tag. CoopPartner owns one; it reads nothing back.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { PLAYER } from '../player/PlayerController';
import type { CoopPartner } from './Coop';
import { HeartTag } from './HeartTag';

export class PipLife {
  private tag: HeartTag;
  /** WAI's hearts were full when this step began (a drop he picks up now would heal him nothing) */
  private waiWasFull = false;
  private unsub: (() => void)[] = [];
  private head = new THREE.Vector3();

  constructor(private p: CoopPartner) {
    const pip = p.pip;
    this.tag = new HeartTag(p.s.ctx.camera.camera);
    pip.health.onRedraw = () => {
      const wai = p.s.player;
      if (wai.smudged || !p.pip.teleportNear(wai.pos, wai.facing, 'smudged', true)) return false;
      p.redraw();
      p.event('I was drawn back in next to WAI, hearts full', true);
      p.rules.react('redrawn');
      return true;
    };
    const ev = p.s.events;
    this.unsub.push(
      // his paint drops are his heals: hers only when his hearts are already full (nothing taken from him)
      ev.on('paint:collected', () => {
        if (this.waiWasFull && p.s.player.hp >= PLAYER.maxHp) pip.heal(1);
      }),
      // a spray can's refill heals WAI fully; it refills her too (it is not shared out)
      ev.on('checkpoint', () => pip.heal(PLAYER.maxHp)),
    );
  }

  /** Start of her step (CoopPartner.step). */
  step(): void {
    this.waiWasFull = this.p.s.player.hp >= PLAYER.maxHp;
    this.p.pip.world.pushOut();
  }

  /** She was fished out of the water / the pit or fell off the canvas (CoopPartner's rescue): WAI's fall price. */
  fell(why: string): void {
    if (why === 'fell' || why === 'canal') this.p.pip.health.fall();
  }

  render(hidden: boolean): void {
    const pip = this.p.pip;
    const h = pip.health;
    this.head.copy(pip.renderPos).setY(pip.renderPos.y + 1.05);
    this.tag.update(this.head, pip.hp, h.max, h.smudged, h.changedAgo, hidden || !pip.shown);
  }

  /** What the tag shows ('' = hidden), for tests. */
  get tagText(): string {
    return this.tag.shown;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.tag.dispose();
  }
}
