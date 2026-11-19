import * as THREE from 'three';
import { PAL } from '../render/PaintTextures';
import { addOutline, toon } from '../render/Materials';
import { Quality } from '../render/Quality';

/**
 * The plaza fountain: a hollow stone basin with real water, a pink pedestal,
 * two overflowing bowls and a bell jet on top, four little fish spitting arcs
 * into the pool and splashes where the water lands. All the water is shader-
 * animated (no per-frame CPU work): curtains scroll, pools ripple, droplets fly
 * on the GPU from a shared clock.
 *
 * Local space = the host's bodyGroup: the collider centre, so the ground is at
 * y = -0.55 and the basin lip at about +0.55 (half = 1.8 × 0.55 × 1.8).
 */

const G = -0.55; // ground
const POOL_Y = 0.32; // basin water level
const MID_Y = 1.43; // middle bowl water level
const TOP_Y = 2.2; // top bowl water level

const clock = { value: 0 };
const tick = () => (clock.value = performance.now() / 1000);

const inkMat = new THREE.MeshBasicMaterial({ color: PAL.black, side: THREE.BackSide });

const COMMON_HEAD = /* glsl */ `
uniform float uTime;
float hash(float n) { return fract(sin(n) * 43758.5453); }
`;

// ─────────────── profiles ───────────────
const v2 = (r: number, y: number) => new THREE.Vector2(r, y);

/** Lathe with a hand-drawn wobble in the radius, and tiled UVs. */
function lathe(pts: THREE.Vector2[], seg: number, wobble: number, uvRepeat = [1, 1]): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  if (wobble) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + wobble * (Math.sin(a * 3 + 0.7) * 0.6 + Math.sin(a * 5 - 1.3) * 0.4);
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
    g.computeVertexNormals();
  }
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvRepeat[0], uv.getY(i) * uvRepeat[1]);
  return g;
}

/** Ink outline for a lathe: the outer silhouette pushed out, drawn back-faced in black. */
function latheInk(pts: THREE.Vector2[], seg: number, wobble: number, t = 0.035): THREE.Mesh {
  const off = pts.map((p) => v2(p.x + t, p.y));
  const m = new THREE.Mesh(lathe(off, seg, wobble), inkMat);
  m.userData.isOutline = true;
  m.userData.noPaint = true;
  m.castShadow = false;
  return m;
}

function stone(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function waterBits(o: THREE.Object3D): void {
  o.userData.noPaint = true;
  o.userData.organVisual = true; // stickers ignore the water when finding the basin's surface
  o.castShadow = false;
  o.receiveShadow = false;
  o.onBeforeRender = tick;
}

// ─────────────── water surfaces ───────────────
function pool(radius: number, y: number, ring: number, ring2 = -1): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: clock,
      uR: { value: radius },
      uRing: { value: ring },
      uRing2: { value: ring2 },
      uDeep: { value: new THREE.Color('#1f7fd6') },
      uShallow: { value: new THREE.Color('#3fe0e6') },
      uFoam: { value: new THREE.Color('#f4fffd') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_HEAD}
      uniform float uR, uRing, uRing2;
      uniform vec3 uDeep, uShallow, uFoam;
      varying vec2 vP;
      float ripple(float r, float at, float t) {
        if (at < 0.0) return 0.0;
        float d = abs(r - at);
        return (0.5 + 0.5 * sin(d * 22.0 - t * 6.0)) * exp(-d * 3.2);
      }
      void main() {
        float t = uTime;
        float r = length(vP);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, uR, r) * 0.55 + 0.25);
        // painted caustics: wobbly bright threads drifting across the pool
        vec2 p = vP * 3.2;
        float c = sin(p.x * 2.1 + sin(p.y * 1.7 + t * 0.9) * 1.6 + t * 0.6) * sin(p.y * 2.3 + sin(p.x * 1.3 - t * 0.7) * 1.6 - t * 0.5);
        col = mix(col, uShallow * 1.25, smoothstep(0.55, 0.75, c) * 0.55);
        // toon ripple bands from where the falling water hits
        float w = max(ripple(r, uRing, t), ripple(r, uRing2, t * 1.15 + 1.3));
        col = mix(col, uFoam, step(0.72, w) * 0.75);
        // churned white foam right at the impact ring(s)
        float hit = exp(-abs(r - uRing) * 16.0) * step(0.0, uRing) + exp(-abs(r - uRing2) * 16.0) * step(0.0, uRing2);
        col = mix(col, uFoam, clamp(hit * (0.75 + 0.25 * sin(atan(vP.y, vP.x) * 9.0 + t * 7.0)), 0.0, 1.0));
        // foam lip where the water meets the stone
        col = mix(col, uFoam, smoothstep(uR - 0.1, uR, r) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  waterBits(m);
  return m;
}

/** Falling water sheet along a lathe profile; flows in the profile's direction (uv.y grows). */
function sheet(pts: THREE.Vector2[], seg: number, speed: number, opacity: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: clock,
      uSpeed: { value: speed },
      uOpacity: { value: opacity },
      uA: { value: new THREE.Color('#5fe4ef') },
      uB: { value: new THREE.Color('#f2fffe') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_HEAD}
      uniform float uSpeed, uOpacity;
      uniform vec3 uA, uB;
      varying vec2 vUv;
      void main() {
        float t = uTime;
        float u = vUv.x, v = vUv.y;
        // wavy vertical streaks that slide down with the flow
        float lane = floor(u * 46.0);
        float s = 0.5 + 0.5 * sin(u * 6.2831 * 23.0 + sin(v * 7.0 - t * 4.0 + hash(lane) * 6.0) * 0.9);
        float streak = step(0.62, s);
        // bright pulses travelling down each lane at its own pace
        float f = fract(v * 2.2 - t * uSpeed * (0.8 + 0.4 * hash(lane + 3.0)) + hash(lane));
        float pulse = smoothstep(0.78, 0.9, f) * (1.0 - smoothstep(0.93, 1.0, f)) * (0.35 + 0.65 * streak);
        float a = uOpacity * (0.55 + 0.45 * streak);
        a *= smoothstep(0.0, 0.06, v);
        // white water churn at the bottom
        float churn = smoothstep(0.82, 1.0, v);
        vec3 col = mix(uA, uB, clamp(streak * 0.45 + pulse * 0.8 + churn * 0.7, 0.0, 1.0));
        a = clamp(a + pulse * 0.3 + churn * 0.25, 0.0, 0.95);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
  m.renderOrder = 2;
  waterBits(m);
  return m;
}

// ─────────────── GPU droplets ───────────────
const SPOUT_ANGLES = [0.25, 0.75, 1.25, 1.75].map((k) => k * Math.PI); // the front (+z, the face) stays clear
const SPOUT_R = 1.56;
const SPOUT_Y = 0.93;

function droplets(): THREE.Mesh {
  const fx = Quality.s.fx;
  const nCrown = Math.round(70 * fx);
  const nArc = Math.round(26 * fx) * 4;
  const nSplash = Math.round(70 * fx);
  const N = nCrown + nArc + nSplash;
  const base = new THREE.IcosahedronGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.instanceCount = N;
  const d = new Float32Array(N * 4);
  let i = 0;
  const push = (type: number, a: number, r: number, ph: number) => {
    d.set([type, a, r, ph], i * 4);
    i++;
  };
  for (let k = 0; k < nCrown; k++) push(0, Math.random() * Math.PI * 2, Math.random(), Math.random());
  const per = nArc / 4;
  for (let s = 0; s < 4; s++) for (let k = 0; k < per; k++) push(1, SPOUT_ANGLES[s], Math.random(), k / per);
  for (let k = 0; k < nSplash; k++) push(2, Math.random() * Math.PI * 2, Math.random(), Math.random());
  geo.setAttribute('aD', new THREE.InstancedBufferAttribute(d, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0), 3.2);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uA: { value: new THREE.Color('#7ceaf2') }, uB: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */ `
      ${COMMON_HEAD}
      attribute vec4 aD; // type, angle, random, phase
      varying float vLit;
      const float GR = 9.8;
      void main() {
        float type = aD.x, ang = aD.y, rnd = aD.z, ph = aD.w;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec3 o; vec3 vel; float P; float size; float floorY = ${POOL_Y.toFixed(2)};
        if (type < 0.5) {
          // spray thrown off the bell jet's crown
          P = 0.85;
          o = vec3(dir.x * 0.16, 3.05, dir.y * 0.16);
          float h = 0.45 + rnd * 0.9;
          vel = vec3(dir.x * h, 0.2 + hash(rnd * 91.0) * 1.0, dir.y * h);
          size = 0.018 + 0.016 * hash(rnd * 13.0);
        } else if (type < 1.5) {
          // a fish on the rim spitting an arc toward the middle
          P = 0.6;
          o = vec3(dir.x * ${SPOUT_R.toFixed(2)}, ${SPOUT_Y.toFixed(2)}, dir.y * ${SPOUT_R.toFixed(2)});
          float h = -0.75 - (rnd - 0.5) * 0.08;
          vel = vec3(dir.x * h, 2.2 + (rnd - 0.5) * 0.1, dir.y * h);
          size = 0.034;
        } else {
          // splashes hopping where the curtains land
          P = 0.5;
          bool mid = rnd < 0.3;
          float r0 = mid ? 0.56 : 1.13 + (hash(rnd * 7.0) - 0.5) * 0.08;
          float y0 = mid ? ${MID_Y.toFixed(2)} : ${POOL_Y.toFixed(2)};
          floorY = y0;
          o = vec3(dir.x * r0, y0, dir.y * r0);
          float out_ = (hash(rnd * 29.0) - 0.3) * 0.9;
          vec2 tang = vec2(-dir.y, dir.x) * (hash(rnd * 51.0) - 0.5) * 0.6;
          vel = vec3(dir.x * out_ + tang.x, (mid ? 0.6 : 0.9) + hash(rnd * 17.0) * 1.1, dir.y * out_ + tang.y);
          size = 0.018 + 0.014 * hash(rnd * 5.0);
        }
        float t = fract(uTime / P + ph) * P;
        vec3 p = o + vel * t + vec3(0.0, -0.5 * GR * t * t, 0.0);
        vec3 v = vel + vec3(0.0, -GR * t, 0.0);
        // land in the right pool: inside the middle bowl the floor is higher
        if (type < 0.5 && length(p.xz) < 0.9) floorY = ${MID_Y.toFixed(2)};
        float alive = step(floorY, p.y) * step(0.02, t);
        // stretch each drop along its velocity: reads as a streak
        vec3 vd = normalize(v + vec3(1e-4));
        float stretch = clamp(length(v) * 0.3, 0.0, 1.2);
        vec3 lp = position * size;
        lp += vd * dot(position, vd) * size * stretch;
        vLit = step(0.15, dot(normalize(position), normalize(vec3(0.4, 1.0, 0.5))));
        vec4 mv = modelViewMatrix * vec4(p + lp * alive, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB;
      varying float vLit;
      void main() {
        gl_FragColor = vec4(mix(uA, uB, vLit), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  waterBits(m);
  return m;
}

// ─────────────── the fountain ───────────────
export function buildFountain(tex: (n: string) => THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const SEG = 36;
  const W = 0.012; // wobble

  // basin: outer wall up, over a fat lip, down the inside, across the floor (front faces out/up)
  const basinPts = [
    v2(1.97, G),
    v2(1.9, G + 0.12),
    v2(1.88, 0.0),
    v2(1.86, 0.36),
    v2(1.96, 0.42),
    v2(2.0, 0.52),
    v2(1.93, 0.6),
    v2(1.72, 0.62),
    v2(1.6, 0.56),
    v2(1.58, 0.4),
    v2(1.56, 0.1),
    v2(1.5, -0.3),
    v2(1.0, -0.36),
    v2(0.0, -0.36),
  ];
  const stoneMat = toon({ map: tex('stone_blue') });
  const basin = stone(lathe(basinPts, SEG, W, [7, 2.2]), stoneMat);
  g.add(basin, latheInk(basinPts.slice(0, 8), SEG, W));
  // ink line along the inner lip
  const lipInk = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.022, 5, 64), new THREE.MeshBasicMaterial({ color: PAL.black }));
  lipInk.rotation.x = Math.PI / 2;
  lipInk.position.y = 0.565;
  lipInk.userData.noPaint = true;
  g.add(lipInk);
  // a cream trim band on the lip, so it reads as carved stone
  const trimPts = [v2(2.005, 0.44), v2(2.02, 0.5), v2(2.005, 0.56)];
  const trim = stone(lathe(trimPts, SEG, W), toon({ color: PAL.cream }));
  g.add(trim);

  g.add(pool(1.57, POOL_Y, 1.13, 0.98));

  // pedestal: pink column with yellow collars, through both bowls to the bell nozzle
  const colPts = [
    v2(0.5, -0.36),
    v2(0.46, -0.2),
    v2(0.3, -0.1),
    v2(0.24, 0.3),
    v2(0.34, 0.62),
    v2(0.36, 0.78),
    v2(0.24, 1.0),
    v2(0.2, 1.3),
    v2(0.16, 1.6),
    v2(0.13, 2.0),
    v2(0.15, 2.25),
    v2(0.09, 2.34),
    v2(0.0, 2.36),
  ];
  const pink = toon({ map: tex('stone_pink'), relief: 0.7 });
  g.add(stone(lathe(colPts, 20, 0.02, [2, 3]), pink), latheInk(colPts, 20, 0.02, 0.03));
  for (const [y, r] of [
    [-0.12, 0.33],
    [0.7, 0.38],
  ] as const) {
    const collar = stone(new THREE.TorusGeometry(r, 0.06, 8, 24), toon({ color: PAL.yellow }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    addOutline(collar, 0.02);
    g.add(collar);
  }

  // middle bowl
  const midPts = [v2(0.2, 1.13), v2(0.6, 1.26), v2(0.88, 1.39), v2(0.95, 1.47), v2(0.87, 1.48), v2(0.6, 1.41), v2(0.0, 1.38)];
  const bowlMat = toon({ map: tex('stone_yellow'), relief: 0.7 });
  g.add(stone(lathe(midPts, SEG, W, [5, 1]), bowlMat), latheInk(midPts.slice(0, 5), SEG, W, 0.03));
  g.add(pool(0.86, MID_Y, 0.56));

  // top bowl
  const topPts = [v2(0.12, 2.02), v2(0.3, 2.08), v2(0.44, 2.18), v2(0.48, 2.25), v2(0.42, 2.25), v2(0.3, 2.21), v2(0.0, 2.19)];
  g.add(stone(lathe(topPts, 24, W, [3, 1]), bowlMat), latheInk(topPts.slice(0, 5), 24, W, 0.025));
  g.add(pool(0.42, TOP_Y + 0.01, 0.36));

  // water: the bell jet, then two overflowing curtains
  g.add(
    sheet([v2(0.05, 2.3), v2(0.045, 2.7), v2(0.06, 2.97), v2(0.14, 3.07), v2(0.26, 3.04), v2(0.34, 2.88), v2(0.38, 2.6), v2(0.37, TOP_Y + 0.02)], 28, 1.6, 0.8),
  );
  g.add(sheet([v2(0.485, 2.24), v2(0.51, 2.1), v2(0.54, 1.85), v2(0.56, 1.6), v2(0.57, MID_Y + 0.01)], 28, 1.4, 0.7));
  g.add(sheet([v2(0.955, 1.46), v2(0.99, 1.34), v2(1.04, 1.1), v2(1.09, 0.8), v2(1.12, 0.55), v2(1.13, POOL_Y + 0.01)], SEG, 1.2, 0.68));

  // four carved koi on the lip, spitting arcs toward the middle: a bent, scaled body on a little
  // stone wave, fan tail flicked up, dorsal + side fins, a round spout mouth, sleepy cartoon eyes
  const koiTex = tex('stone_orange').clone();
  koiTex.wrapS = koiTex.wrapT = THREE.RepeatWrapping;
  koiTex.repeat.set(3, 2);
  koiTex.needsUpdate = true;
  const koiMat = toon({ map: koiTex, color: '#ffb36b' });
  const bellyMat = toon({ color: '#fff0d8' });
  const finMat = toon({ color: PAL.hotpink });
  (finMat as THREE.Material).side = THREE.DoubleSide;
  const waveMat = toon({ map: tex('stone_blue'), color: '#bfe6ff' });
  const eyeW = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const eyeB = new THREE.MeshBasicMaterial({ color: PAL.black });
  const L = 0.62;
  // body profile along its length (mouth at 0 → tail root at L): radius
  const prof = [v2(0.07, 0), v2(0.1, 0.02), v2(0.15, 0.1), v2(0.185, 0.24), v2(0.17, 0.38), v2(0.12, 0.5), v2(0.07, 0.58), v2(0.045, L)];
  const bend = (geo: THREE.BufferGeometry, flat = 0.8) => {
    // lathe axis (y) → the fish's length (+z, tail); flatten sideways; arch the back and flick the tail up
    geo.rotateX(Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const z = p.getZ(k);
      const t = z / L;
      p.setX(k, p.getX(k) * flat);
      p.setY(k, p.getY(k) * 1.12 - Math.sin(t * Math.PI) * 0.05 + Math.max(0, t - 0.55) ** 2 * 1.1);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const fan = (w: number, h: number) => {
    // a scalloped fin (three lobes)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(-w * 0.9, h * 0.35, -w, h);
    sh.quadraticCurveTo(-w * 0.45, h * 0.78, -w * 0.3, h * 1.05);
    sh.quadraticCurveTo(0, h * 0.8, w * 0.3, h * 1.05);
    sh.quadraticCurveTo(w * 0.45, h * 0.78, w, h);
    sh.quadraticCurveTo(w * 0.9, h * 0.35, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false });
  };
  for (const a of SPOUT_ANGLES) {
    const fish = new THREE.Group();
    const body = stone(bend(new THREE.LatheGeometry(prof, 18)), koiMat);
    const ink = new THREE.Mesh(bend(new THREE.LatheGeometry(prof.map((q) => v2(q.x + 0.022, q.y)), 18)), inkMat);
    ink.userData.isOutline = true;
    ink.userData.noPaint = true;
    // pale belly: the same shape, a touch smaller, pushed down
    const belly = stone(bend(new THREE.LatheGeometry(prof.map((q) => v2(q.x * 0.9, q.y)), 14), 0.72), bellyMat);
    belly.position.y = -0.035;
    // spout mouth: a fat ring lip
    const lips = stone(new THREE.TorusGeometry(0.075, 0.032, 8, 16), toon({ color: PAL.hotpink }));
    lips.position.set(0, 0, -0.005);
    addOutline(lips, 0.012);
    // tail fan, flicked up at the end of the arch
    const tail = stone(fan(0.2, 0.26), finMat);
    tail.position.set(-0.012, 0.2, L - 0.03);
    tail.rotation.set(-0.5, Math.PI / 2, 0);
    addOutline(tail, 0.012);
    // dorsal fin along the back
    const dorsal = stone(fan(0.13, 0.13), finMat);
    dorsal.position.set(-0.012, 0.15, 0.3);
    dorsal.rotation.set(-0.15, Math.PI / 2, 0);
    addOutline(dorsal, 0.01);
    fish.add(body, ink, belly, lips, tail, dorsal);
    for (const sx of [-1, 1]) {
      // side fins + eyes with a heavy lid (asleep until the plaza wakes — same family as the faces)
      const pec = stone(fan(0.08, 0.12), finMat);
      pec.position.set(sx * 0.13, -0.06, 0.2);
      pec.rotation.set(0.4, 0, sx * -2.0);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), eyeW);
      w.position.set(sx * 0.105, 0.075, 0.1);
      w.scale.set(0.6, 1, 1);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), eyeB);
      b.position.set(sx * 0.13, 0.07, 0.092);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 16), inkMat);
      ring.position.set(sx * 0.118, 0.075, 0.1);
      ring.rotation.y = Math.PI / 2;
      // gill line
      const gill = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 4, 14, Math.PI * 0.8), inkMat);
      gill.position.set(0, 0, 0.19);
      gill.rotation.set(0, 0, sx > 0 ? -Math.PI * 0.4 : Math.PI * 0.6);
      gill.scale.x = 0.82;
      fish.add(pec, w, b, ring, gill);
    }
    // the stone wave it leaps from: two curls hugging the lip
    for (const [dz, sc] of [[0.28, 1], [0.46, 0.75]] as [number, number][]) {
      const curl = stone(new THREE.TorusGeometry(0.13 * sc, 0.06 * sc, 8, 14, Math.PI * 1.35), waveMat);
      curl.position.set(0, -0.24, dz - 0.04);
      curl.rotation.set(0, Math.PI / 2, -0.4);
      addOutline(curl, 0.014);
      fish.add(curl);
    }
    // mouth exactly where the water arc starts; nose tipped up toward the middle
    const mx = Math.cos(a) * SPOUT_R, mz = Math.sin(a) * SPOUT_R;
    fish.position.set(mx, SPOUT_Y, mz);
    fish.lookAt(mx * 2, SPOUT_Y - 0.1, mz * 2); // +z (the tail) points outward and a little down
    g.add(fish);
  }

  g.add(droplets());
  return g;
}
