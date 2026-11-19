/**
 * [INPUT]: depends on Difficulty.swarmCount from ../meta/Difficulty; GameContext.physics (raycast, tagOf) from core/Context
 * [OUTPUT]: exports swarmSpots(ctx, at, spread?) — where to put the swarm creatures of one spawn point
 * [POS]: the sessions' spawners (grubs, moths) call it instead of spawning once. The first spot is always `at`
 *        itself; extras (Normal / Hard) stand in a ring beside it, only on ground at the same height,
 *        so an extra never spawns over a canal or off a roof edge. Gentle returns [at] alone.
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Difficulty } from '../meta/Difficulty';

const DOWN = new THREE.Vector3(0, -1, 0);

export function swarmSpots(ctx: GameContext, at: THREE.Vector3, spread = 1.3): THREE.Vector3[] {
  const n = Difficulty.swarmCount();
  const out = [at.clone()];
  for (let i = 1; i < n; i++) {
    // try a few angles round the original; keep the first one standing on ground level with it
    for (let k = 0; k < 6; k++) {
      const a = (i * 2.4 + k * 1.05) % (Math.PI * 2);
      const p = at.clone().add(new THREE.Vector3(Math.cos(a) * spread, 0, Math.sin(a) * spread));
      const hit = ctx.physics.raycast(p.clone().setY(at.y + 1.2), DOWN, 2.6, (c) => {
        const tag = ctx.physics.tagOf(c);
        return tag === 'static' || tag === 'host' || tag === 'gate';
      });
      if (!hit || Math.abs(hit.point.y - at.y) > 0.6) continue;
      out.push(p.setY(Math.max(at.y, hit.point.y)));
      break;
    }
  }
  return out;
}
