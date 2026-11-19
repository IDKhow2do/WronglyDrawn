/**
 * [INPUT]: depends on the PlaySession (allHosts, player) from level/Session
 * [OUTPUT]: exports findPlace() (a named spot for "go to …": a host by id, part of its id or a Chinese nickname)
 * [POS]: the place-name lookup behind her `goto` standing order (CoopPartner.setStance, Chat's order parser).
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type * as THREE from 'three';
import type { PlaySession } from '../level/Session';

/** A named spot for "go to …": a host (statue, fountain, bench…) by id / part of its id / a Chinese nickname. */
export function findPlace(s: PlaySession, name: string): { id: string; pos: THREE.Vector3 } | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const alias: [RegExp, string][] = [
    [/喷泉|水池/, 'fountain'],
    [/雕像|石像|守护者/, 'statue'],
    [/长椅|椅子|凳/, 'bench'],
    [/邮筒|信箱|邮箱/, 'mailbox'],
    [/路灯|灯/, 'lamp'],
    [/垃圾/, 'bin'],
    [/箱/, 'crate'],
    [/木桶|酒桶/, 'barrel'],
    [/桶/, 'bucket'],
    [/门楼|城门|大门/, 'gate'],
    [/墙/, 'wall'],
    [/船/, 'boat'],
    [/钟/, 'bell'],
  ];
  const keys = [q, ...alias.filter(([re]) => re.test(q)).map(([, k]) => k)];
  const wai = s.player.pos;
  let best: { id: string; pos: THREE.Vector3 } | null = null;
  let bd = Infinity;
  for (const h of s.allHosts as unknown as { id: string; pos: THREE.Vector3 }[]) {
    const id = h.id.toLowerCase();
    if (!keys.some((k) => id === k || id.includes(k) || k.includes(id))) continue;
    const d = h.pos.distanceTo(wai) + (id === q ? -1000 : 0);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}
