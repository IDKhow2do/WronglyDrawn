/**
 * [INPUT]: three (renderer, mixer), GLTFLoader + the meshopt decoder from three's examples, ../assets/wai.glb (the
 *          game's own rigged hero: clips idle, walk, run, jump, shoot); the page's sections and their data-say lines
 * [OUTPUT]: bundled to ../buddy.js (see ../vite.buddy.config.mjs). Importing it starts the page's companion: WAI
 *           stands in a bottom corner, walks to the other corner when the section changes, walks on the spot while
 *           the page scrolls, turns toward the pointer, says the section's line, and jumps when tapped. His upper arms are
 *           swung out sideways on top of every clip, so the hands show beside the box body.
 * [POS]: landing/. Decoration only: the page loads it after everything else and works without it. Under
 *        "reduce motion" he stands still and only the speech bubble changes.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, AnimationMixer, Clock, LoopOnce, Box3, Vector3, Group, SRGBColorSpace, Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => innerWidth < 720;
const size = () => (phone() ? { w: 118, h: 150 } : { w: 210, h: 270 });

// ── the stage: a small fixed box in a bottom corner, with a speech bubble above it ──
const box = document.createElement('div'); box.id = 'buddy'; box.setAttribute('aria-hidden', 'true');
box.innerHTML = '<div class="say"></div><canvas></canvas>';
document.body.appendChild(box);
const say = box.querySelector('.say'), canvas = box.querySelector('canvas');
const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true }); renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene(); const cam = new PerspectiveCamera(30, 1, 0.1, 50);
scene.add(new HemisphereLight(0xffffff, 0x9a86c8, 2.0)); const sun = new DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 5); scene.add(sun);
const rig = new Group(); scene.add(rig);

const FRONT = -Math.PI / 2;            // the model faces +X; this turns it to the viewer
const S = { x: 0, tx: 0, y: 1, ty: 1, yaw: FRONT, clip: '', side: 'hide', sec: -1, lastY: scrollY, scrollV: 0, px: 0, quip: 0, until: 0, busy: 0 };
let mixer = null; const actions = {};

// ── the arms: the rig hangs them inside the box body, so from the front no hand shows. After each animation
//    step both upper arms swing out sideways by SPREAD (about the model's forward axis, +X); the clips' own
//    swing stays on top. Only the page does this: the game sees WAI from behind and keeps the clips as they are. ──
const SPREAD = 1.2, FORWARD = new Vector3(1, 0, 0);
const arms = []; const _root = new Quaternion(), _parent = new Quaternion(), _delta = new Quaternion();
function spreadArms(model) {
  model.getWorldQuaternion(_root).invert();
  for (const { bone, angle } of arms) {
    bone.parent.getWorldQuaternion(_parent).premultiply(_root);           // the parent's turn in model space
    _delta.setFromAxisAngle(FORWARD, angle).premultiply(_parent.clone().invert()).multiply(_parent);
    bone.quaternion.premultiply(_delta);                                  // = the same sideways swing, in the bone's own space
  }
}
const play = (name, once) => {
  const a = actions[name]; if (!a || (S.clip === name && !once)) return;
  const from = actions[S.clip]; a.reset(); a.setLoop(once ? LoopOnce : 2201, once ? 1 : Infinity); a.clampWhenFinished = !!once; a.fadeIn(0.18).play(); if (from && from !== a) from.fadeOut(0.18);
  S.clip = name; if (once) S.busy = performance.now() + a.getClip().duration * 1000 * 0.85;
};
const fit = () => { const { w, h } = size(); box.style.width = w + 'px'; box.style.height = h + 'px'; renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); place(true); };
const sideX = (side) => (side === 'left' && !phone() ? 14 : innerWidth - size().w - (phone() ? 6 : 18));
function place(snap) { S.tx = sideX(S.side); S.ty = S.side === 'hide' ? 1 : 0; if (snap || calm) { S.x = S.tx; S.y = S.ty; } }

// ── what he says: each section brings its own lines (data-say="a|b|c") ──
const sections = [...document.querySelectorAll('[data-buddy]')];
const speak = (text, ms = 3600) => { say.textContent = text; say.classList.add('on'); S.until = performance.now() + ms; };
function enter(i) {
  if (i === S.sec) return; S.sec = i; const el = sections[i]; if (!el) return;
  S.side = el.dataset.buddy; S.quip = 0; place(false);
  const lines = (el.dataset.say || '').split('|').filter(Boolean); if (lines.length && S.side !== 'hide') setTimeout(() => S.sec === i && speak(lines[0]), calm ? 0 : 700);
  if (el.dataset.act && !calm) setTimeout(() => S.sec === i && play(el.dataset.act, true), 1300);
}
const current = () => { const mid = innerHeight * 0.55; let best = 0; sections.forEach((el, i) => { const r = el.getBoundingClientRect(); if (r.top <= mid) best = i; }); return best; };

box.addEventListener('click', () => {
  const el = sections[S.sec]; const lines = ((el && el.dataset.say) || '歪，不是错。').split('|').filter(Boolean);
  S.quip = (S.quip + 1) % lines.length; speak(lines[S.quip]); if (!calm) play('jump', true);
});
addEventListener('pointermove', (e) => { S.px = (e.clientX - (S.x + size().w / 2)) / innerWidth; }, { passive: true });
addEventListener('resize', fit);

// ── every frame: where he is, which way he faces, which clip plays ──
const clock = new Clock(); let buddyModel = null;
function frame() {
  requestAnimationFrame(frame); if (document.hidden) return;
  const dt = Math.min(0.05, clock.getDelta()), now = performance.now();
  enter(current());
  const v = (scrollY - S.lastY) / Math.max(dt, 0.001); S.lastY = scrollY; S.scrollV += (v - S.scrollV) * Math.min(1, dt * 8);
  const dx = S.tx - S.x, walking = Math.abs(dx) > 2, step = Math.sign(dx) * Math.min(Math.abs(dx), (Math.abs(dx) > 500 ? 760 : 430) * dt);
  if (!calm) { S.x += step; S.y += (S.ty - S.y) * Math.min(1, dt * 7); }
  let yaw = FRONT + Math.max(-0.5, Math.min(0.5, S.px * 1.6));
  if (walking) yaw = FRONT + (dx > 0 ? 1 : -1) * 1.35; else if (Math.abs(S.scrollV) > 60) yaw = FRONT + (S.scrollV > 0 ? 0.5 : -0.5);
  S.yaw += (yaw - S.yaw) * Math.min(1, dt * 9); rig.rotation.y = S.yaw;
  if (!calm && now > S.busy) play(walking ? (Math.abs(dx) > 500 ? 'run' : 'walk') : Math.abs(S.scrollV) > 900 ? 'run' : Math.abs(S.scrollV) > 60 ? 'walk' : 'idle');
  box.style.transform = `translate(${S.x.toFixed(1)}px, ${(S.y * (size().h + 40)).toFixed(1)}px)`;
  if (S.until && now > S.until) { say.classList.remove('on'); S.until = 0; }
  if (mixer) { mixer.update(dt); rig.updateMatrixWorld(true); spreadArms(buddyModel); }
  renderer.render(scene, cam);
}

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(new URL('./assets/wai.glb', import.meta.url).href, (g) => {
  const m = g.scene; const bb = new Box3().setFromObject(m); const h = bb.max.y - bb.min.y, c = bb.getCenter(new Vector3());
  m.position.set(-c.x, -bb.min.y, -c.z); rig.add(m); rig.scale.setScalar(1 / h);
  cam.position.set(0, 0.62, 3.5); cam.lookAt(0, 0.52, 0);
  mixer = new AnimationMixer(m); for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
  m.updateMatrixWorld(true);
  for (const name of ['L_Upperarm', 'R_Upperarm']) {
    const bone = m.getObjectByName(name); if (!bone) continue;
    const side = Math.sign(m.worldToLocal(bone.getWorldPosition(new Vector3())).z);   // which side of the body (model space z)
    arms.push({ bone, angle: -side * SPREAD });                                         // turning about +X by -θ moves a hanging arm toward +z
  }
  buddyModel = m;
  fit(); S.x = sideX('right'); play('idle'); if (calm && actions.idle) actions.idle.paused = true;
  box.classList.add('ready'); frame();
}, undefined, () => box.remove());
