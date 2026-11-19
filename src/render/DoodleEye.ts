/**
 * [INPUT]: depends on three (MeshStandardMaterial + onBeforeCompile); no game modules
 * [OUTPUT]: exports DoodleEye (one drawn eye), DoodleEyes (a mirrored pair), EYE_STYLES (presets) and DoodleEyeOpts
 * [POS]: the game's one shared code-drawn eye. Guardians, creatures, houses and props mount it instead of
 *        white spheres with flat lids. Everything is drawn in one fragment shader on one shared domed disc:
 *        outline, sclera, iris, pupil, highlights, shaped lid, crease, lashes. One draw call per eye; the
 *        program is shared by every eye; no textures, no per-eye canvases, no per-frame allocations.
 *        The eye animates itself in onBeforeRender (blink, lid, gaze, grey, flash): owners only set targets.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';

// ───────────── options and presets ─────────────
export interface DoodleEyeOpts {
  /** Eye radius in metres. */
  size?: number;
  /** Iris colour. */
  iris?: THREE.ColorRepresentation;
  /** Lid (skin) colour. */
  lid?: THREE.ColorRepresentation;
  /** Rest openness: 1 = wide open, 0.5 = half-lidded, 0 = shut. */
  open?: number;
  /** Lid slant: + angry (inner corner down), − sad (outer corner down). */
  tilt?: number;
  /** Lash strokes on the lid edge (0–5). */
  lashes?: number;
  /** A drawn fold above the lid. */
  crease?: boolean;
  /** A tired line under the eye. */
  bags?: boolean;
  /** Iris radius (eye units, 0.25–0.7). */
  irisSize?: number;
  /** Pupil radius as a share of the iris. */
  pupil?: number;
  /** Height / width (1 = round). */
  oval?: number;
  /** How far the ball bulges out (eye units). */
  bulge?: number;
  /** 0 = lit like the scene, 1 = flat colour (reads in dark scenes). */
  selfLit?: number;
  /** Outline half width (eye units). */
  line?: number;
  /** Blink by itself every few seconds. */
  autoBlink?: boolean;
  /** −1 = the viewer's left eye of a pair, +1 = the right one (mirrors the tilt). */
  side?: number;
}

/** Character presets. The Red Pen's servants use STIFF (straight lids, no lashes, measured). */
export const EYE_STYLES = {
  /** Wide, friendly, a few lashes. */
  ROUND: { open: 0.95, lashes: 3, crease: true, irisSize: 0.5, pupil: 0.5 },
  /** Heavy half-lid with hanging lashes and a tired line (a silenced Guardian). */
  SLEEPY: { open: 0.38, lashes: 4, crease: true, bags: true, irisSize: 0.5, pupil: 0.5 },
  /** Slanted lid, small pupil, no lashes. */
  ANGRY: { open: 0.72, tilt: 0.38, lashes: 0, irisSize: 0.42, pupil: 0.42 },
  /** Wide, big pupil, staring. */
  STARE: { open: 1, lashes: 0, irisSize: 0.56, pupil: 0.62, crease: true },
  /** The Pen's servants: straight lid, no lashes, small iris, thin line. */
  STIFF: { open: 0.62, tilt: 0.12, lashes: 0, irisSize: 0.36, pupil: 0.5, line: 0.06 },
} satisfies Record<string, DoodleEyeOpts>;

// ───────────── shared geometry and shader ─────────────
const geoCache = new Map<number, THREE.BufferGeometry>();
/** Disc of radius 1.5 facing +Z: a dome (radius 1) in the middle, a flat collar for lashes and creases. */
function eyeGeometry(bulge: number): THREE.BufferGeometry {
  const key = Math.round(bulge * 100);
  const hit = geoCache.get(key);
  if (hit) return hit;
  const RINGS = [0, 0.25, 0.45, 0.62, 0.76, 0.87, 0.94, 0.985, 1.0, 1.15, 1.5];
  const SEG = 36;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of RINGS)
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const z = r < 1 ? bulge * Math.sqrt(1 - r * r) : 0;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  for (let i = 0; i < RINGS.length - 1; i++)
    for (let s = 0; s < SEG; s++) {
      const a = i * SEG + s;
      const b = i * SEG + ((s + 1) % SEG);
      const c = (i + 1) * SEG + s;
      const d = (i + 1) * SEG + ((s + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

const SHARED = { uInk: { value: new THREE.Color('#0c0612') } };

const FRAG_HEAD = /* glsl */ `
uniform vec3 uIris;
uniform vec3 uLidCol;
uniform vec3 uInk;
uniform vec3 uFlashCol;
uniform vec4 uState;  // x open, y tilt (mirrored), z grey, w flash
uniform vec4 uLook;   // xy gaze, z pupil share, w iris radius
uniform vec4 uStyle;  // x lashes, y crease, z bags, w seed
uniform vec2 uShade;  // x self-lit, y line half width
varying vec2 vEyeP;
float wdLidY( float x ) {
  float o = uState.x;
  return mix( -1.1, 1.08, o ) + uState.y * x - 0.17 * ( 1.0 - x * x ) * ( 1.0 - 0.7 * o );
}
float wdSeg( vec2 p, vec2 a, vec2 b ) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
  return length( pa - ba * h ) + h * 0.02;
}
float wdLine( float d, float w, float aa ) { return 1.0 - smoothstep( w - aa, w + aa, d ); }
`;

const FRAG_BODY = /* glsl */ `
vec3 wdEye;
{
  vec2 p = vEyeP;
  float ang = atan( p.y, p.x );
  float wob = 1.0 + 0.022 * sin( ang * 3.0 + uStyle.w ) + 0.012 * sin( ang * 5.0 + uStyle.w * 1.7 );
  float r = length( p ) / wob;
  float aa = clamp( fwidth( r ), 0.004, 0.08 );
  float lw = uShade.y;
  float inEye = 1.0 - smoothstep( 1.0 - aa, 1.0 + aa, r );
  float lidY = wdLidY( p.x );
  float skin = smoothstep( lidY - aa, lidY + aa, p.y );
  // sclera: warm paper white, rounded by a soft edge shade and the lid's shadow
  vec3 col = vec3( 1.0, 0.97, 0.9 );
  col *= 1.0 - 0.2 * smoothstep( 0.5, 1.0, r );
  col *= 1.0 - 0.28 * smoothstep( 0.34, 0.0, lidY - p.y ) * ( 1.0 - skin );
  // iris, pupil and two highlights (the iris may slide under the lid)
  float ir = uLook.w;
  vec2 c = uLook.xy * ( 0.94 - ir );
  vec2 q = p - c;
  float d = length( q );
  float iA = 1.0 - smoothstep( ir - aa, ir + aa, d );
  vec3 irisCol = uIris * mix( 0.62, 1.3, smoothstep( ir * 0.7, -ir * 0.9, q.y ) );
  irisCol *= 0.9 + 0.1 * sin( atan( q.y, q.x ) * 13.0 + uStyle.w );
  irisCol = mix( irisCol, uInk, smoothstep( ir * 0.78, ir * 0.97, d ) * 0.8 );
  col = mix( col, irisCol, iA );
  float pr = ir * uLook.z;
  col = mix( col, vec3( 0.05, 0.03, 0.07 ), 1.0 - smoothstep( pr - aa, pr + aa, d ) );
  float h1 = 1.0 - smoothstep( ir * 0.24 - aa, ir * 0.24 + aa, length( q - vec2( -0.34, 0.36 ) * ir ) );
  float h2 = 1.0 - smoothstep( ir * 0.11 - aa, ir * 0.11 + aa, length( q - vec2( 0.3, -0.32 ) * ir ) );
  col = mix( col, vec3( 1.0 ), max( h1, h2 * 0.9 ) * iA );
  // the lid: skin colour with crayon hatching, lighter toward its edge
  vec3 lc = uLidCol * mix( 0.78, 1.08, smoothstep( lidY + 0.6, lidY, p.y ) );
  lc *= 0.93 + 0.07 * step( 0.5, fract( ( p.x * 0.8 + p.y ) * 7.0 + 0.3 * sin( p.y * 23.0 + uStyle.w ) ) );
  col = mix( col, lc, skin );
  // ink: outline, lid edge, crease, lashes, the tired line
  float ink = wdLine( abs( r - 1.0 - lw * 0.35 ), lw, aa );
  ink = max( ink, wdLine( abs( p.y - lidY ), lw * 0.85, aa ) * inEye );
  if ( uStyle.y > 0.5 ) {
    float cy = lidY + 0.3 + 0.05 * ( 1.0 - p.x * p.x );
    ink = max( ink, wdLine( abs( p.y - cy ), lw * 0.4, aa ) * skin * inEye * step( abs( p.x ), 0.66 ) );
    // the fold over a wide-open eye sits outside the ball
    float arc = wdLine( abs( r - 1.22 ), lw * 0.45, aa ) * smoothstep( 0.4, 0.6, ang ) * smoothstep( 2.75, 2.55, ang );
    ink = max( ink, arc * smoothstep( 0.82, 0.95, uState.x ) );
  }
  if ( uStyle.z > 0.5 ) {
    float bag = wdLine( abs( r - 1.17 ), lw * 0.4, aa ) * smoothstep( -2.5, -2.2, ang ) * smoothstep( -0.65, -0.95, ang );
    ink = max( ink, bag * 0.85 );
  }
  for ( int i = 0; i < 5; i++ ) {
    if ( float( i ) >= uStyle.x ) break;
    float t = ( float( i ) + 0.5 ) / uStyle.x;
    float x = mix( -0.78, 0.78, t );
    float top = sqrt( max( 0.0, 1.0 - x * x ) );
    float ly = wdLidY( x );
    // a wide-open eye wears its lashes up on the rim; a lowered lid lets them hang from its edge
    float up = step( 0.62, uState.x );
    vec2 b = vec2( x, mix( min( ly, top ), top, up ) );
    vec2 dir = normalize( mix( vec2( x * 0.75, -1.0 ), vec2( x * 1.2, 1.0 ), up ) );
    float L = 0.3 * ( 1.0 - 0.35 * abs( x ) );
    ink = max( ink, wdLine( wdSeg( p, b, b + dir * L ), lw * 0.55, aa ) );
  }
  float alpha = max( inEye, ink );
  if ( alpha < 0.5 ) discard;
  col = mix( col, uInk, ink );
  // silenced: greyed out; hit: a flash
  float g = dot( col, vec3( 0.3, 0.59, 0.11 ) );
  col = mix( col, vec3( g ) * vec3( 0.84, 0.86, 0.96 ) * ( 1.0 - 0.3 * skin ), uState.z * ( 1.0 - ink ) );
  col = mix( col, uFlashCol, uState.w );
  wdEye = col;
  diffuseColor.rgb = col;
}
`;

function eyeMaterial(u: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, SHARED);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEyeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', FRAG_BODY)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, wdEye + totalEmissiveRadiance, uShade.x );\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'wd-doodle-eye';
  return m;
}

// ───────────── one eye ─────────────
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const FLASH = new THREE.Color('#ffffff');

/**
 * One drawn eye facing +Z, ball radius `size`. Set `open`, `grey`, `look` / `follow` and call `blink()` /
 * `flash()`; the eye eases toward them on its own whenever it is drawn.
 */
export class DoodleEye {
  readonly mesh: THREE.Mesh;
  /** Target openness (0 shut … 1 wide). */
  open: number;
  /** Target grey-out (0 colour … 1 silenced). */
  grey = 0;
  /** Widen (surprise): bigger ball, smaller pupil, 0..1. */
  wide = 0;
  /** Gaze target in eye space (−1..1 each axis) when `follow` is null. */
  readonly look = new THREE.Vector2();
  /** A world point to watch (WAI, the camera); null = use `look`. */
  follow: THREE.Vector3 | null = null;
  autoBlink: boolean;
  private readonly u: {
    uIris: { value: THREE.Color };
    uLidCol: { value: THREE.Color };
    uFlashCol: { value: THREE.Color };
    uState: { value: THREE.Vector4 };
    uLook: { value: THREE.Vector4 };
    uStyle: { value: THREE.Vector4 };
    uShade: { value: THREE.Vector2 };
  };
  private readonly baseScale: THREE.Vector3;
  private readonly pupil0: number;
  private tilt: number;
  private cur = { open: 1, grey: 0, x: 0, y: 0, flash: 0, wide: 0 };
  private blinkT = -1;
  private nextBlink = 1 + Math.random() * 3;
  private last = -1;

  constructor(o: DoodleEyeOpts = {}) {
    const size = o.size ?? 0.4;
    this.open = o.open ?? 0.9;
    this.cur.open = this.open;
    this.tilt = o.tilt ?? 0;
    this.autoBlink = o.autoBlink ?? true;
    this.pupil0 = o.pupil ?? 0.5;
    this.u = {
      uIris: { value: new THREE.Color(o.iris ?? '#3fb6c8') },
      uLidCol: { value: new THREE.Color(o.lid ?? '#ff8fa3') },
      uFlashCol: { value: FLASH.clone() },
      uState: { value: new THREE.Vector4(this.open, this.tilt * (o.side ?? 1), 0, 0) },
      uLook: { value: new THREE.Vector4(0, 0, this.pupil0, o.irisSize ?? 0.5) },
      uStyle: { value: new THREE.Vector4(o.lashes ?? 3, o.crease ? 1 : 0, o.bags ? 1 : 0, Math.random() * 6.28) },
      uShade: { value: new THREE.Vector2(o.selfLit ?? 0.35, o.line ?? 0.075) },
    };
    this.u.uState.value.y = this.tilt * (o.side ?? 1);
    this.mesh = new THREE.Mesh(eyeGeometry(o.bulge ?? 0.35), eyeMaterial(this.u));
    this.mesh.name = 'doodle-eye';
    this.mesh.scale.set(size, size * (o.oval ?? 1), size);
    this.baseScale = this.mesh.scale.clone();
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.noPaint = true;
    this.mesh.onBeforeRender = () => this.tick();
  }

  /** Close and reopen once (ignored mid-blink). */
  blink(): void {
    if (this.blinkT < 0) this.blinkT = 0;
  }

  /** A hit flash (white unless a colour is given) that fades in ~0.25 s. */
  flash(color?: THREE.ColorRepresentation): void {
    this.u.uFlashCol.value.set(color ?? FLASH);
    this.cur.flash = 1;
  }

  setIris(c: THREE.ColorRepresentation): void {
    this.u.uIris.value.set(c);
  }

  setLid(c: THREE.ColorRepresentation): void {
    this.u.uLidCol.value.set(c);
  }

  /** Pupil share of the iris (a tell: shrink to lock on, grow to plead). */
  set pupil(k: number) {
    this.u.uLook.value.z = k;
  }

  /** Jump every eased value to its target (after building, after a warp). */
  settle(): void {
    this.cur.open = this.open;
    this.cur.grey = this.grey;
    this.cur.wide = this.wide;
    this.cur.x = this.look.x;
    this.cur.y = this.look.y;
    this.apply();
  }

  private tick(): void {
    const now = performance.now() / 1000;
    const dt = this.last < 0 ? 0 : Math.min(0.1, now - this.last);
    this.last = now;
    const c = this.cur;
    // gaze: toward the followed point (yaw / pitch in the eye's frame), else the set look
    let gx = this.look.x;
    let gy = this.look.y;
    if (this.follow) {
      _m.copy(this.mesh.matrixWorld).invert();
      _v.copy(this.follow).applyMatrix4(_m);
      _v.x *= this.baseScale.x;
      _v.y *= this.baseScale.y;
      _v.z *= this.baseScale.z;
      gx = Math.atan2(_v.x, Math.max(0.01, _v.z)) / 0.9;
      gy = Math.atan2(_v.y, Math.hypot(_v.x, Math.max(0.01, _v.z))) / 0.7;
    }
    const gl = Math.hypot(gx, gy);
    if (gl > 1) {
      gx /= gl;
      gy /= gl;
    }
    const kLook = 1 - Math.exp(-dt * 9);
    c.x += (gx - c.x) * kLook;
    c.y += (gy - c.y) * kLook;
    // blink: fast close, short hold, slower open
    if (this.autoBlink && this.blinkT < 0 && dt > 0 && (this.nextBlink -= dt) <= 0) {
      this.blinkT = 0;
      this.nextBlink = 2.5 + Math.random() * 3.5;
    }
    let shut = 0;
    if (this.blinkT >= 0) {
      const t = (this.blinkT += dt);
      shut = t < 0.08 ? t / 0.08 : t < 0.13 ? 1 : t < 0.3 ? 1 - (t - 0.13) / 0.17 : 0;
      if (t >= 0.3) this.blinkT = -1;
    }
    const kSlow = 1 - Math.exp(-dt * 4);
    c.open += (this.open - c.open) * kSlow;
    c.grey += (this.grey - c.grey) * kSlow;
    c.wide += (this.wide - c.wide) * (1 - Math.exp(-dt * 10));
    c.flash = Math.max(0, c.flash - dt * 4);
    this.apply(shut);
  }

  private apply(shut = 0): void {
    const c = this.cur;
    const s = this.u.uState.value;
    // looking up lifts the lid a little, looking down lowers it
    s.x = Math.max(0, Math.min(1, c.open + c.y * 0.08 * c.open) * (1 - shut));
    s.z = c.grey;
    s.w = c.flash;
    const l = this.u.uLook.value;
    l.x = c.x;
    l.y = c.y;
    l.z = this.pupil0 * (1 - 0.35 * c.wide);
    const k = 1 + 0.14 * c.wide;
    this.mesh.scale.set(this.baseScale.x * k, this.baseScale.y * k, this.baseScale.z * k);
  }
}

// ───────────── a pair ─────────────
/** Two mirrored eyes `spacing` apart (centre to centre) in a group facing +Z. Setters drive both. */
export class DoodleEyes {
  readonly group = new THREE.Group();
  readonly eyes: [DoodleEye, DoodleEye];
  constructor(o: DoodleEyeOpts & { spacing?: number } = {}) {
    const sp = (o.spacing ?? (o.size ?? 0.4) * 2.3) / 2;
    const l = new DoodleEye({ ...o, side: -1 });
    const r = new DoodleEye({ ...o, side: 1 });
    l.mesh.position.x = -sp;
    r.mesh.position.x = sp;
    this.group.add(l.mesh, r.mesh);
    this.group.name = 'doodle-eyes';
    this.eyes = [l, r];
  }
  set open(v: number) {
    for (const e of this.eyes) e.open = v;
  }
  set grey(v: number) {
    for (const e of this.eyes) e.grey = v;
  }
  set wide(v: number) {
    for (const e of this.eyes) e.wide = v;
  }
  set follow(p: THREE.Vector3 | null) {
    for (const e of this.eyes) e.follow = p;
  }
  lookAt(x: number, y: number): void {
    for (const e of this.eyes) e.look.set(x, y);
  }
  blink(): void {
    for (const e of this.eyes) e.blink();
  }
  flash(color?: THREE.ColorRepresentation): void {
    for (const e of this.eyes) e.flash(color);
  }
  settle(): void {
    for (const e of this.eyes) e.settle();
  }
}
