/**
 * [INPUT]: depends on SoundFx / ARC_MODE / SOUND_GLYPH from ./SoundFx
 * [OUTPUT]: exports SOUND_INK_OURS / SOUND_INK_THEIRS / SOUND_INK_HUSH (palettes) and SoundInk, coneFront(), wallFront(), ringFront(),
 *           groundRipple(), soundSplat(), dangerZone() and a reusable basis helper flatBasis()
 * [POS]: the shared shape grammar of sound. WAI's SHOUT (harbor/Shout.ts) and every creature's sound attack
 *        (enemy/SoundWave.ts) draw their fronts with these, so a cone, a wall and a floor ring look like one family:
 *        wobbly marker arcs with an ink rim, echoes trailing behind the front, glyphs flying off it.
 *        Each shape is drawn at the exact radius / height / opening the caller tests hits with.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { ARC_MODE, SOUND_GLYPH, type SoundFx } from './SoundFx';

/** WAI's voice: cyan, pink, yellow (the big shout's front is yellow). */
export const SOUND_INK_OURS = { a: new THREE.Color('#5ff4e6'), b: new THREE.Color('#ff3fa4'), c: new THREE.Color('#ffd23a') };
/** The correctors' noise: red-pen red, a darker red, pencil grey. */
export const SOUND_INK_THEIRS = { a: new THREE.Color('#e8253a'), b: new THREE.Color('#9b1b2a'), c: new THREE.Color('#9a94a6') };

/** The Hush's silence: lilac, dusk indigo, eraser grey. */
export const SOUND_INK_HUSH = { a: new THREE.Color('#b49cff'), b: new THREE.Color('#5a4aa8'), c: new THREE.Color('#cfc8e2') };
export type SoundInk = typeof SOUND_INK_THEIRS;

const UP = new THREE.Vector3(0, 1, 0);
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/** A horizontal basis whose angle 0 points along `dir` (flattened). */
export function flatBasis(dir: THREE.Vector3, u = new THREE.Vector3(), v = new THREE.Vector3()): [THREE.Vector3, THREE.Vector3] {
  u.set(dir.x, 0, dir.z);
  if (u.lengthSq() < 1e-6) u.set(0, 0, 1);
  u.normalize();
  v.set(-u.z, 0, u.x);
  return [u, v];
}

/**
 * A shout's front: the spherical cap of radius R about `dir` with opening ±half, drawn as three arcs
 * (its rim ring, and its outline seen from the side and from above). Each arc fades as it turns edge-on,
 * so from behind you see rings spreading out, from the side you see ")))".
 */
export function coneFront(fx: SoundFx, origin: THREE.Vector3, dir: THREE.Vector3, R: number, half: number, col: THREE.Color, alpha: number, w: number, seed: number): void {
  // the rim: a circle perpendicular to dir
  _n.copy(Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP);
  _u.crossVectors(dir, _n).normalize();
  _v.crossVectors(_u, dir).normalize();
  _c.copy(origin).addScaledVector(dir, R * Math.cos(half));
  fx.arc({ c: _c, u: _u, v: _v, r: R * Math.sin(half), w, color: col, alpha, seed, wob: 0.06 });
  // the side outline (in the plane of dir and up) and the top outline (plane of dir and right)
  fx.arc({ c: origin, u: dir, v: _v, r: R, w: w * 0.9, a0: -half, a1: half, color: col, alpha, seed: seed + 1.3, wob: 0.035 });
  fx.arc({ c: origin, u: dir, v: _u, r: R, w: w * 0.9, a0: -half, a1: half, color: col, alpha, seed: seed + 2.1, wob: 0.035 });
}

/**
 * A wall of sound: the band of radius r from `from.y` to `from.y + height` within ±half of `dir`
 * (exactly the hit volume of SoundWaves.blare). A thin translucent curtain, bold top and foot edges,
 * and two echoes trailing behind.
 */
export function wallFront(fx: SoundFx, from: THREE.Vector3, dir: THREE.Vector3, r: number, half: number, height: number, ink: SoundInk, alpha: number, seed: number): void {
  const [u, v] = flatBasis(dir, _u, _v);
  _c.copy(from).setY(from.y + height / 2);
  fx.arc({ c: _c, u, v, r, w: height / 2, a0: -half, a1: half, color: ink.a, alpha: alpha * 0.4, mode: ARC_MODE.band, seed, wob: 0.02 });
  for (const [y, w, col] of [[0.06, 0.2, ink.b], [height, 0.26, ink.a], [height * 0.5, 0.11, ink.c]] as [number, number, THREE.Color][]) {
    _c.copy(from).setY(from.y + y);
    fx.arc({ c: _c, u, v, r, w, a0: -half, a1: half, color: col, alpha, seed: seed + y, wob: 0.03 });
  }
  for (let i = 1; i <= 2; i++) {
    const rr = r - i * 0.55;
    if (rr < 0.3) break;
    _c.copy(from).setY(from.y + height * (0.35 + i * 0.2));
    fx.arc({ c: _c, u, v, r: rr, w: 0.08, a0: -half * 0.85, a1: half * 0.85, color: ink.c, alpha: alpha * (0.7 - i * 0.25), seed: seed + i * 3.1, wob: 0.05 });
  }
}

/** A low ring rolling over the floor (SoundWaves.blast): a band of `height` at radius r, a bold lip on top. */
export function ringFront(fx: SoundFx, center: THREE.Vector3, r: number, height: number, ink: SoundInk, alpha: number, seed: number): void {
  _u.set(1, 0, 0);
  _v.set(0, 0, 1);
  _c.copy(center).setY(center.y + height / 2);
  fx.arc({ c: _c, u: _u, v: _v, r, w: height / 2, color: ink.a, alpha: alpha * 0.3, mode: ARC_MODE.band, seed, wob: 0.015 });
  _c.copy(center).setY(center.y + height);
  fx.arc({ c: _c, u: _u, v: _v, r, w: 0.17, color: ink.a, alpha, seed: seed + 1, wob: 0.02 });
  _c.copy(center).setY(center.y + 0.05);
  fx.arc({ c: _c, u: _u, v: _v, r, w: 0.2, color: ink.b, alpha, seed: seed + 2, wob: 0.02 });
  if (r > 0.9) {
    _c.copy(center).setY(center.y + 0.06);
    fx.arc({ c: _c, u: _u, v: _v, r: r - 0.7, w: 0.07, color: ink.c, alpha: alpha * 0.5, seed: seed + 3, wob: 0.04 });
  }
}

/** A short ripple on the ground: two rings that run out and dry up. */
export function groundRipple(fx: SoundFx, at: THREE.Vector3, r1: number, col: THREE.Color, dur = 0.55): void {
  _u.set(1, 0, 0);
  _v.set(0, 0, 1);
  _c.copy(at).setY(at.y + 0.06);
  fx.spawnArc({ c: _c, u: _u, v: _v, r0: 0.3, r1, w: 0.16, w1: 0.04, color: col, dur, seed: Math.random() * 9, wob: 0.05 });
  fx.spawnArc({ c: _c, u: _u, v: _v, r0: 0.2, r1: r1 * 0.6, w: 0.1, w1: 0.03, color: col, dur: dur * 0.9, delay: 0.09, seed: Math.random() * 9, wob: 0.07 });
}

/** Where sound hits: a ragged splat, a ring snapping out and a few marks flying off. */
export function soundSplat(fx: SoundFx, at: THREE.Vector3, ink: SoundInk, big = false): void {
  fx.spawnGlyph({ pos: at, glyph: SOUND_GLYPH.splat, size: big ? 0.75 : 0.55, color: ink.a, dur: 0.38, spin: 2 });
  fx.spawnGlyph({ pos: at, glyph: SOUND_GLYPH.burst, size: big ? 1.1 : 0.85, color: ink.c, dur: 0.3 });
  for (let i = 0; i < (big ? 3 : 2); i++) {
    const a = Math.random() * Math.PI * 2;
    fx.spawnGlyph({
      pos: at,
      vel: new THREE.Vector3(Math.cos(a) * 3, 2.5 + Math.random() * 2, Math.sin(a) * 3),
      glyph: i === 0 ? SOUND_GLYPH.bang2 : SOUND_GLYPH.note,
      size: 0.3,
      color: i % 2 ? ink.b : ink.a,
      dur: 0.6,
      spin: (Math.random() - 0.5) * 4,
    });
  }
}

/**
 * The tell: where a wall of sound WILL go, drawn on the floor at its full range (the arc and its two edges),
 * and arcs gathering into the mouth. k = 0 → 1 over the tell.
 */
export function dangerZone(fx: SoundFx, from: THREE.Vector3, dir: THREE.Vector3, half: number, range: number, ink: SoundInk, k: number, seed: number): void {
  const [u, v] = flatBasis(dir, _u, _v);
  const blink = 0.45 + 0.4 * Math.abs(Math.sin(k * 14));
  _c.copy(from).setY(from.y + 0.06);
  fx.arc({ c: _c, u, v, r: range, w: 0.2, a0: -half, a1: half, color: ink.a, alpha: blink, seed, wob: 0.01 });
  for (const s of [-1, 1]) {
    _n.copy(u).multiplyScalar(Math.cos(half)).addScaledVector(v, Math.sin(half) * s);
    fx.arc({ c: _c, u: _n, v, r: range, w: 0.11, color: ink.a, alpha: blink * 0.8, mode: ARC_MODE.stroke, seed: seed + s });
  }
  // the breath: three arcs pulled into the mouth
  _c.copy(from).setY(from.y + 1.0);
  for (let i = 0; i < 3; i++) {
    const kk = (k * 2.5 + i / 3) % 1;
    const r = 2.4 * (1 - kk) + 0.3;
    fx.arc({ c: _c, u, v: UP, r, w: 0.08, a0: -0.8, a1: 0.8, color: i % 2 ? ink.c : ink.a, alpha: Math.sin(kk * Math.PI) * 0.9, seed: seed + i * 1.9, wob: 0.05 });
  }
}
