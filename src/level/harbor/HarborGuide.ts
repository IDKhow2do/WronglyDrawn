/**
 * [INPUT]: depends on Guide (the arrow + edge marker) from ui/Guide; HarborSession (spots, gates, guideGoal, the pier's
 *          exitStep); HY/LIGHTHOUSE/district from ./HarborTerrain; inPier from ./BandstandPier
 * [OUTPUT]: exports HarborGuide (Mute Harbor's objective arrow)
 * [POS]: level 2's "where do I go?" arrow. area() names the walkable area of a point; route() walks the open portals
 *        (BFS) to the goal's area. The sea wall at z ≈ 32 splits landing from market and east at every x.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { Guide } from '../../ui/Guide';
import type { HarborSession } from '../HarborSession';
import { HY, LIGHTHOUSE, district } from './HarborTerrain';
import { inPier } from './BandstandPier';

/**
 * Mute Harbor's objective arrow. The level is a chain of areas joined by "portals" (the bell gate,
 * the moored boats, the grand stair, the Bell Bridge, the lighthouse stair). The arrow points at the
 * next real step; when that's in another area, it points at the next portal on the way (entry first,
 * then its far end), and up the lighthouse stair it walks the helix.
 */
type Area = 'landing' | 'market' | 'east' | 'oldQuay' | 'oldHigh' | 'head' | 'spiral' | 'gallery';

interface Portal {
  a: Area;
  b: Area;
  pa: THREE.Vector3;
  pb: THREE.Vector3;
  open: () => boolean;
  /** Stepping stones on the way, in order from pa to pb (the moored boats' decks). */
  via?: THREE.Vector3[];
}

export class HarborGuide extends Guide {
  private portals: Portal[];

  constructor(
    private hs: HarborSession,
    root: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
  ) {
    super(hs, root, camera);
    const sp = hs.level.spots;
    this.portals = [
      { a: 'landing', b: 'market', pa: new THREE.Vector3(2, HY.quay, 34.2), pb: new THREE.Vector3(2, HY.quay, 28.5), open: () => hs.level.gateOpen },
      { a: 'market', b: 'oldQuay', pa: sp.pontoonEast.clone().add(new THREE.Vector3(1.2, 0, 0)), pb: sp.pontoonWest.clone().add(new THREE.Vector3(-1.4, 0, 0)), open: () => hs.level.pontoonReady, via: sp.decks },
      { a: 'oldQuay', b: 'oldHigh', pa: sp.stairBottom.clone(), pb: sp.stairTop.clone(), open: () => true },
      { a: 'oldHigh', b: 'head', pa: sp.bridgeWest.clone(), pb: sp.bridgeEast.clone(), open: () => hs.level.bridgeDown },
      { a: 'head', b: 'spiral', pa: sp.spiralStart.clone(), pb: hs.level.spiralAt(0.035), open: () => hs.level.cocoonBurst },
      { a: 'market', b: 'east', pa: new THREE.Vector3(18, HY.quay, 16), pb: new THREE.Vector3(26, HY.board, 12), open: () => true },
    ];
  }

  /** Which walkable area a point is in. */
  area(p: THREE.Vector3): Area {
    const L = LIGHTHOUSE;
    const dl = Math.hypot(p.x - L.x, p.z - L.z);
    if (dl < 7 && p.y > L.top - 0.6) return 'gallery';
    if (dl < 7 && p.y > HY.headland + 0.45) return 'spiral';
    // standing on the stair's first (low) steps counts as the stair too
    if (dl > 2.8 && dl < 6.4 && p.y > HY.headland + 0.05) {
      const q = this.hs.level.spiralAt(this.hs.level.spiralParam(p));
      if (Math.abs(q.y - p.y) < 0.6 && Math.hypot(q.x - p.x, q.z - p.z) < 1.6) return 'spiral';
    }
    // the exit jetty and the paper boat moored at it belong to the headland
    if (p.x > 21 && p.x < 33 && p.z > -42 && p.z < -32 && p.y < 3.5) return 'head';
    const d = district(p.x, p.z);
    if (d === 'old') return p.y > 3.2 ? 'oldHigh' : 'oldQuay';
    if (d === 'head') return 'head';
    // the sea wall (halls + fences at z ≈ 31–33, x −16 … 50) closes the landing at every x: south of it is the
    // landing, also east of x 22 where district() says 'east' (the Chomper Bin stands at x 24 on the landing)
    if (p.z > 32) return 'landing';
    return d === 'east' ? 'east' : 'market';
  }

  protected override goal(): THREE.Vector3 | null {
    return this.hs.guideGoal();
  }

  /** BFS over the open portals: the first portal to take from `from` toward `to`. */
  private firstPortal(from: Area, to: Area): { p: Portal; fwd: boolean } | null {
    if (from === to) return null;
    const prev = new Map<Area, { p: Portal; fwd: boolean; from: Area }>();
    const q: Area[] = [from];
    const seen = new Set<Area>([from]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const p of this.portals) {
        if (!p.open()) continue;
        const next = p.a === cur ? p.b : p.b === cur ? p.a : null;
        if (!next || seen.has(next)) continue;
        seen.add(next);
        prev.set(next, { p, fwd: p.a === cur, from: cur });
        q.push(next);
      }
    }
    if (!prev.has(to)) return null;
    let cur: Area = to;
    let step = prev.get(cur)!;
    while (step.from !== from) {
      cur = step.from;
      step = prev.get(cur)!;
    }
    return { p: step.p, fwd: step.fwd };
  }

  protected override route(g: THREE.Vector3): THREE.Vector3 {
    const p = this.hs.player.pos;
    // on Bandstand Pier with the goal back on the island: the pier's own way out (level-2 expansion)
    if (!inPier(g)) {
      const out = this.hs.pier.exitStep(p);
      if (out) return out;
    }
    let pa = this.area(p);
    const ga = this.area(g);
    if (pa === 'gallery') pa = 'spiral';
    const target = ga === 'gallery' ? 'spiral' : ga;
    // on the lighthouse stair: walk the helix (up to a goal on the gallery, down otherwise)
    if (pa === 'spiral') {
      const k = this.hs.level.spiralParam(p);
      const up = ga === 'gallery' || ga === 'spiral';
      if (up) {
        if (ga === 'gallery' && k > 0.97) return g;
        if (ga === 'spiral') {
          const kg = this.hs.level.spiralParam(g);
          if (Math.abs(kg - k) < 0.05) return g;
          return this.hs.level.spiralAt(THREE.MathUtils.clamp(k + Math.sign(kg - k) * 0.06, 0, 1));
        }
        return this.hs.level.spiralAt(Math.min(1, k + 0.06));
      }
      if (k < 0.06) return this.hs.level.spots.spiralStart.clone();
      return this.hs.level.spiralAt(Math.max(0, k - 0.06));
    }
    // on the ground beside the lighthouse, heading up: walk round the tower to the stair's foot (south)
    if (pa === 'head' && target === 'spiral') {
      const L = LIGHTHOUSE;
      const dl = Math.hypot(p.x - L.x, p.z - L.z);
      if (dl < 7.6) {
        const a = Math.atan2(p.z - L.z, p.x - L.x);
        let d = Math.PI / 2 - a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > 0.55) {
          const na = a + Math.sign(d) * 0.6;
          return new THREE.Vector3(L.x + Math.cos(na) * 7, HY.headland, L.z + Math.sin(na) * 7);
        }
      }
    }
    if (pa === target) return g;
    const step = this.firstPortal(pa, target);
    if (!step) return g;
    const near = step.fwd ? step.p.pa : step.p.pb;
    const far = step.fwd ? step.p.pb : step.p.pa;
    // walk to the portal's near end, then through to its far end (deck by deck over the boats)
    if (Math.hypot(p.x - near.x, p.z - near.z) > 2.2 && !this.onPortal(p, step.p)) return near;
    return this.nextVia(p, step.p, step.fwd) ?? far;
  }

  /** The next stepping stone ahead of WAI on a portal (null: none left, or the portal has none). */
  private nextVia(p: THREE.Vector3, pt: Portal, fwd: boolean): THREE.Vector3 | null {
    if (!pt.via?.length) return null;
    const ab = pt.pb.clone().sub(pt.pa).setY(0);
    const at = (v: THREE.Vector3) => v.clone().sub(pt.pa).setY(0).dot(ab) / ab.lengthSq();
    const tp = at(p);
    const ahead = pt.via.filter((v) => (fwd ? at(v) > tp + 0.08 : at(v) < tp - 0.08));
    if (!ahead.length) return null;
    return (fwd ? ahead[0] : ahead[ahead.length - 1]).clone();
  }

  /** Is WAI already on the portal's span (boat decks / bridge / stair)? */
  private onPortal(p: THREE.Vector3, pt: Portal): boolean {
    const ab = pt.pb.clone().sub(pt.pa).setY(0);
    const len = ab.length();
    if (len < 0.01) return false;
    const t = p.clone().sub(pt.pa).setY(0).dot(ab) / (len * len);
    if (t < 0 || t > 1) return false;
    const c = pt.pa.clone().lerp(pt.pb, t);
    return Math.hypot(p.x - c.x, p.z - c.z) < 2.2;
  }
}
