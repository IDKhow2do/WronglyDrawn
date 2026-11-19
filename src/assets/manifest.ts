/**
 * Optional GLB/glTF replacements for procedural placeholder visuals.
 *
 * Drop a Tripo-generated (or any) .glb into /public/models and set its url here,
 * e.g. `wai: { url: '/models/wai.glb', height: 1.05 }`.
 *
 * Only the *visual* is replaced. Colliders, sockets, gameplay anchors and the
 * procedural animation (bob/squash/lean of the visual root) stay in code, so no
 * gameplay logic changes are needed. `height` is the target height in metres
 * the model is uniformly scaled to; `yaw` rotates it to face +Z (game forward).
 */
export type ModelSlot =
  | 'wai'
  | 'sprayGun'
  | 'mutant'
  | 'mutantThigh'
  | 'mutantShin'
  | 'mutantFoot'
  | 'grub'
  | 'chomperBody'
  | 'chomperJaw'
  | 'lampPost'
  | 'lampEye'
  | 'boxLegs'
  | 'statue'
  | 'statueHead'
  | 'statueEye'
  | 'statueLid'
  | 'statueCrown'
  | 'statuePlinth'
  | 'gateTower'
  | 'eraserBoss'
  | 'houseTall'
  | 'houseWide'
  | 'houseLean'
  | 'houseShop'
  | 'fountain2'
  | 'crown'
  | 'paintDrop'
  | 'checkpointCan'
  | 'mothTorso'
  | 'mothWing'
  | 'hushBell'
  | 'lighthouseHorn'
  | 'paperBoat'
  | 'whiteoutBottle'
  | 'rubberStamp'
  | 'redPen';

export interface ModelEntry {
  url: string;
  /** Target size in metres along the `fit` axis (default: height). */
  height: number;
  fit?: 'height' | 'length' | 'width';
  yaw?: number;
}

const FACE_Z = -Math.PI / 2; // Tripo exports face +X; rotate to the game's +Z

export const MODEL_MANIFEST: Partial<Record<ModelSlot, ModelEntry>> = {
  // WAI v2 (Tripo, rigid box on Spine02, sculpted face, sneakers) — see docs/ASSETS.md "WAI v2"
  wai: { url: '/models/wai2.glb', height: 1.1, yaw: FACE_Z },
  sprayGun: { url: '/models/spray_gun.glb', height: 0.34, fit: 'length', yaw: FACE_Z },
  grub: { url: '/models/eraser_grub.glb', height: 0.8, fit: 'length', yaw: FACE_Z },
  mutant: { url: '/models/crooked_leg_mutant_body.glb', height: 1.05, yaw: FACE_Z },
  mutantThigh: { url: '/models/mutant_thigh.glb', height: 0.62, yaw: FACE_Z },
  mutantShin: { url: '/models/mutant_shin.glb', height: 0.62, yaw: FACE_Z },
  mutantFoot: { url: '/models/mutant_foot.glb', height: 0.32, fit: 'length', yaw: FACE_Z },
  chomperBody: { url: '/models/chomper_bin_body.glb', height: 1.2, yaw: FACE_Z },
  chomperJaw: { url: '/models/chomper_bin_lid.glb', height: 0.9, fit: 'width', yaw: FACE_Z },
  lampPost: { url: '/models/peeping_lamp_post.glb', height: 5.2, yaw: FACE_Z },
  lampEye: { url: '/models/peeping_lamp_eye.glb', height: 1.5, fit: 'width', yaw: FACE_Z },
  // Statue v2 — separate parts (already in metres; pivots documented in docs/ASSETS.md)
  statueHead: { url: '/models/statue2_head.glb', height: 3.0, yaw: FACE_Z },
  statueEye: { url: '/models/statue2_eye.glb', height: 0.852, yaw: FACE_Z },
  statueLid: { url: '/models/statue2_lid.glb', height: 0.78, yaw: FACE_Z },
  statueCrown: { url: '/models/statue2_crown.glb', height: 1.41, yaw: FACE_Z },
  statuePlinth: { url: '/models/statue2_plinth.glb', height: 2.4, yaw: FACE_Z },
  gateTower: { url: '/models/gate_tower.glb', height: 15, yaw: FACE_Z },
  // Town kit v3 (Tripo) — see docs/ASSETS.md "Town kit v3"
  eraserBoss: { url: '/models/eraser_boss.glb', height: 4.5, yaw: FACE_Z },
  houseTall: { url: '/models/house_tall.glb', height: 12, yaw: FACE_Z },
  houseWide: { url: '/models/house_wide.glb', height: 9, yaw: FACE_Z },
  houseLean: { url: '/models/house_lean.glb', height: 10, yaw: FACE_Z },
  houseShop: { url: '/models/house_shop.glb', height: 8, yaw: FACE_Z },
  fountain2: { url: '/models/fountain.glb', height: 2.11, yaw: FACE_Z },
  // Small props (Tripo v3.1 text-to-3D, 2026-11) — upright, no facing
  crown: { url: '/models/crown.glb', height: 1.0, fit: 'width' },
  paintDrop: { url: '/models/paint_drop.glb', height: 0.42 },
  checkpointCan: { url: '/models/checkpoint_can.glb', height: 1.15 },
  // Hush family (Tripo v3.1) — torso & bell face +X; the wing's root is at its local origin, tip along +X
  mothTorso: { url: '/models/moth_torso.glb', height: 0.8, yaw: FACE_Z },
  mothWing: { url: '/models/moth_wing.glb', height: 0.9, fit: 'width' },
  hushBell: { url: '/models/hush_bell.glb', height: 4.4, fit: 'width', yaw: FACE_Z },
  // art pass (Tripo v3.1, docs/art-pass/NOTES.md): the lighthouse's foghorn, the exit paper boat, the White-out Bottle
  lighthouseHorn: { url: '/models/lighthouse_horn.glb', height: 2.0 },
  paperBoat: { url: '/models/paper_boat.glb', height: 6.6, fit: 'length' },
  whiteoutBottle: { url: '/models/whiteout_bottle.glb', height: 1.3 },
  // the TAG stamp (Tripo v3.1, docs/art-pass/STAMP.md): die face at y 0, upright; combat/StampFx sizes it
  rubberStamp: { url: '/models/rubber_stamp.glb', height: 1 },
  // the Red Pen's body (Codex three-view sheet → Tripo v3.1 multiview, docs/level3/SOULS.md "The sculpted Pen"):
  // upright, nib tip at y 0. 7.5 m puts its grip, clip and blank cap front on the rig's weak points (RedPenBody); the
  // crown stands above RedPenLook's PEN_H 6.4. Blank cap front = Tripo +X, clip on its left. enemy/RedPenModel fits
  // the axis and the barrel radius to the rig
  redPen: { url: '/models/red_pen.glb', height: 7.5, yaw: FACE_Z },
};
