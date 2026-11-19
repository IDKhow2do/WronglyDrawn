/**
 * [INPUT]: depends on three (Vector3); the rise limit is read against PLAYER.jumpHeight from ../player/PlayerController
 * [OUTPUT]: exports jumpFlight() (the blocks of one straight jump-up staircase), FlightBox, MAX_RISE
 * [POS]: the one rule for every jump-up flight in level 1: the workyard's painted steps (BlindPlaza ladder tag),
 *        the sky stairs (BlindPlaza, undrawn) and the Gate Yard kiosk steps (CrossedQuarter, undrawn).
 *        Callers turn the blocks into solids or undrawn solids; this file builds nothing itself.
 * [PROTOCOL]: Update this header on change, then check docs/regression/ROUND3_GUIDANCE.md
 */
import * as THREE from 'three';
import { PLAYER } from '../player/PlayerController';

/** One step: centre and half extents in its own frame, turned by `yaw` (like PhysicsWorld.addStaticBox). */
export interface FlightBox {
  center: THREE.Vector3;
  half: THREE.Vector3;
  yaw: number;
}

/** The highest rise per jump: under two thirds of the base jump, so a late or short hop still clears it. */
export const MAX_RISE = PLAYER.jumpHeight * 0.63;

/**
 * A straight run of solid steps from the ground up to a landing (a roof, a ledge).
 *
 *   landing ───────┐          each step is a block that stands on the ground:
 *            ┌─────┘ rise     nothing hangs over a step, so the head never hits,
 *       ┌────┘                and a jump that carries too far stops at the next
 *  ─────┘ ← foot              riser and drops back onto the step below it.
 *
 * `edge` is the landing's edge at ground height; `yaw` points up the run, into the landing (0 = +z, like the
 * camera). The rise count is the fewest jumps of at most MAX_RISE; the last jump goes onto the landing itself.
 */
export function jumpFlight(edge: THREE.Vector3, yaw: number, landingY: number, tread = 1.1, halfWidth = 0.8): { blocks: FlightBox[]; foot: THREE.Vector3; rise: number } {
  const rises = Math.ceil((landingY - edge.y) / MAX_RISE - 1e-6);
  const rise = (landingY - edge.y) / rises;
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const foot = edge.clone().addScaledVector(dir, -(rises - 1) * tread);
  const blocks: FlightBox[] = [];
  for (let k = 1; k < rises; k++) {
    const h = rise * k;
    const c = foot.clone().addScaledVector(dir, (k - 0.5) * tread);
    c.y = edge.y + h / 2;
    blocks.push({ center: c, half: new THREE.Vector3(halfWidth, h / 2, tread / 2), yaw });
  }
  return { blocks, foot, rise };
}
