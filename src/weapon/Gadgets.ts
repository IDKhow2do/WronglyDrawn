import * as THREE from 'three';
import type { PlaySession } from '../level/Session';
import { itemDef, type ItemId } from '../meta/Arsenal';
import { REWARDS } from '../meta/Progression';
import { t } from '../i18n';

interface Sprinkler {
  root: THREE.Group;
  pos: THREE.Vector3;
  t: number;
  acc: number;
}

/**
 * The equipped gadget (B / the GADGET touch button): one active tool with a cooldown.
 * Paint Bomb · Patch Sticker · Sprinkler Can · Magnet Pulse.
 */
export class Gadgets {
  cd = 0;
  private sprinklers: Sprinkler[] = [];

  constructor(
    private s: PlaySession,
    public id: ItemId | null,
  ) {}

  get maxCd(): number {
    return (this.id ? (itemDef(this.id).cd ?? 10) : 10) * REWARDS.gadgetCdMul;
  }
  get frac(): number {
    return this.id ? 1 - Math.min(1, this.cd / this.maxCd) : 0;
  }

  /** Try to fire it (false = on cooldown / nothing equipped / not allowed now). */
  use(allowed: boolean): boolean {
    const s = this.s;
    if (!this.id || !allowed || s.ctx.camera.inCine) return false;
    if (this.cd > 0) {
      s.ctx.audio.play('shootEmpty');
      return false;
    }
    const p = s.player;
    const head = p.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
    switch (this.id) {
      case 'bomb':
        s.weapon.lobBomb(p);
        break;
      case 'patch':
        p.heal(2);
        s.ctx.effects.comic(head, t('PATCHED!'), '#ff6fae', 0.8);
        s.ctx.effects.burst(head, '#ffffff', 14, 3, 0.05, -3);
        s.ctx.audio.play('crown', { vol: 0.6, pitch: 1.3 });
        break;
      case 'sprinkler': {
        const root = new THREE.Group();
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.6, 12), new THREE.MeshStandardMaterial({ color: s.weapon.color, roughness: 0.4 }));
        can.position.y = 0.3;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        cap.position.y = 0.66;
        root.add(can, cap);
        root.traverse((o) => (o.userData.noPaint = true));
        const at = p.pos.clone().add(p.forward().multiplyScalar(1.2));
        const down = s.physics.raycast(at.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0), 4);
        if (down) at.y = down.point.y;
        root.position.copy(at);
        s.ctx.root.add(root);
        this.sprinklers.push({ root, pos: at, t: 7, acc: 0 });
        s.ctx.effects.comic(head, t('SPRINKLER!'), s.weapon.color, 0.7);
        s.ctx.audio.play('land', { pitch: 1.4 });
        break;
      }
      case 'magnet': {
        let n = 0;
        for (const d of s.level.drops) {
          if (d.collected || d.disposed) continue;
          if (d.position().distanceTo(p.pos) > 16) continue;
          d.pullTo = 1;
          n++;
        }
        s.ctx.effects.ring(p.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#22c4c0', 16, new THREE.Vector3(0, 1, 0));
        s.ctx.effects.comic(head, n ? t('MAGNET ×{n}!', { n }) : t('MAGNET!'), '#22c4c0', 0.7);
        s.ctx.audio.play('select', { pitch: 0.6 });
        break;
      }
      default:
        return false;
    }
    this.cd = this.maxCd;
    return true;
  }

  step(dt: number): void {
    this.cd = Math.max(0, this.cd - dt);
    for (let i = this.sprinklers.length - 1; i >= 0; i--) {
      const sp = this.sprinklers[i];
      sp.t -= dt;
      sp.root.rotation.y += dt * 4;
      if (sp.t <= 0) {
        this.s.ctx.effects.burst(sp.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), this.s.weapon.color, 10, 2.5);
        this.s.ctx.root.remove(sp.root);
        sp.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
        this.sprinklers.splice(i, 1);
        continue;
      }
      // nearest awake creature within 7.5 m
      const nozzle = sp.pos.clone().add(new THREE.Vector3(0, 0.75, 0));
      let best: THREE.Vector3 | null = null;
      let bd = 7.5;
      for (const e of this.s.enemies) {
        if (e.disposed || (e as unknown as { harmless?: boolean }).harmless) continue;
        const d = e.pos.distanceTo(sp.pos);
        if (d < bd) {
          bd = d;
          best = e.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
        }
      }
      if (!best) continue;
      sp.acc += dt * 40;
      const dir = best.sub(nozzle).normalize();
      while (sp.acc >= 1) {
        sp.acc -= 1;
        this.s.weapon.emitFrom(nozzle, dir);
      }
    }
  }

  dispose(): void {
    for (const sp of this.sprinklers) this.s.ctx.root.remove(sp.root);
    this.sprinklers = [];
  }
}
