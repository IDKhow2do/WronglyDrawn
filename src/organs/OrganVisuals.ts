import * as THREE from 'three';
import { PAL } from '../render/PaintTextures';
import { toon } from '../render/Materials';
import { CrookedLeg } from '../enemy/MutantModel';
import { EyeVisual, MouthVisual } from '../hosts/OrganVisuals';
import type { OrganType } from './Organ';
import { crispSticker, stickerKey } from '../render/OrganArt';

/**
 * A real die-cut vinyl STICKER (hand-painted art): a thick card with the
 * painting on the front, a white backing, a stacked edge for thickness, and a
 * slow wobble. Purifying cross-fades the corrupted print to the clean one.
 */
function makeStickerCard(type: OrganType, corrupted: boolean): THREE.Group | null {
  // crisp die-cut prints (the painted soft shadow is cut away: just art + a thin white border)
  const cleanCut = crispSticker(stickerKey(type, false));
  const dirtyCut = crispSticker(stickerKey(type, true));
  if (!cleanCut || !dirtyCut) return null;
  const clean = cleanCut.art;
  const dirty = dirtyCut.art;
  const g = new THREE.Group();
  const card = new THREE.Group();
  const S = 0.95;
  const geo = new THREE.PlaneGeometry(S, S);
  const front = (map: THREE.Texture, opacity: number, z: number) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.35, opacity, roughness: 0.3, metalness: 0, side: THREE.FrontSide, depthWrite: opacity > 0.5 }));
    m.position.z = z;
    return m;
  };
  const cleanM = front(clean, corrupted ? 0 : 1, 0.012);
  const dirtyM = front(dirty, corrupted ? 1 : 0, 0.013);
  cleanM.name = 'sticker-clean';
  dirtyM.name = 'sticker-dirty';
  // the white vinyl edge (thickness) and plain white back
  for (let i = 0; i < 4; i++) {
    const edge = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: cleanCut.sil, alphaTest: 0.5, color: i === 0 ? '#cfc6b8' : '#f4efe6', roughness: 0.6, side: THREE.DoubleSide }));
    edge.position.z = -i * 0.006;
    card.add(edge);
  }
  card.add(cleanM, dirtyM);
  card.position.y = 0.55;
  g.add(card);
  g.userData.card = card;
  g.userData.sticker = { clean: cleanM, dirty: dirtyM };
  if (corrupted) {
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: '#b23cff', transparent: true, opacity: 0.16, depthWrite: false }));
    aura.position.y = 0.55;
    aura.name = 'aura';
    g.add(aura);
  }
  g.traverse((o) => (o.userData.noPaint = true));
  return g;
}

/** Small free-floating organ visual (dropped organ, held while purifying, thrown sticker). */
export function makeOrganVisual(type: OrganType, corrupted: boolean): THREE.Group {
  const card = makeStickerCard(type, corrupted);
  if (card) return card;
  const g = new THREE.Group();
  if (type === 'LEG') {
    const legMat = toon({ color: corrupted ? '#3a1d52' : PAL.cobalt, emissive: corrupted ? '#2a0040' : '#000000' });
    const footMat = toon({ color: corrupted ? '#ff3cf0' : PAL.orange, emissive: corrupted ? '#550055' : '#000000' });
    const a = new CrookedLeg(0.3, 0.3, legMat, footMat, 0.05);
    const b = new CrookedLeg(0.26, 0.3, legMat, footMat, 0.055);
    a.hip.position.set(-0.1, 0.6, 0);
    b.hip.position.set(0.1, 0.6, 0);
    a.pose(0.3, -0.7, -0.1);
    b.pose(-0.2, -0.5, 0.1);
    g.add(a.hip, b.hip);
    g.userData.mats = [legMat, footMat];
    g.userData.from = ['#3a1d52', '#ff3cf0'];
    g.userData.to = [PAL.cobalt, PAL.orange];
  } else if (type === 'EYE') {
    const e = new EyeVisual(0.4, corrupted);
    e.root.position.y = 0.4;
    g.add(e.root);
    g.userData.eye = e;
  } else {
    const m = new MouthVisual(0.4);
    m.root.position.y = 0.4;
    g.add(m.root);
    g.userData.mouth = m;
  }
  if (corrupted) {
    // corrupted aura
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: '#b23cff', transparent: true, opacity: 0.18, depthWrite: false }));
    aura.position.y = 0.4;
    aura.name = 'aura';
    g.add(aura);
  }
  return g;
}

/** Shift colours from corrupted to clean as purification progresses (0..1). */
export function tintOrganVisual(g: THREE.Group, purity: number): void {
  const st = g.userData.sticker as { clean: THREE.Mesh; dirty: THREE.Mesh } | undefined;
  if (st) {
    (st.clean.material as THREE.MeshStandardMaterial).opacity = purity;
    (st.dirty.material as THREE.MeshStandardMaterial).opacity = 1 - purity;
    (st.clean.material as THREE.MeshStandardMaterial).depthWrite = purity > 0.5;
    (st.dirty.material as THREE.MeshStandardMaterial).depthWrite = purity <= 0.5;
  }
  const mats = g.userData.mats as THREE.MeshToonMaterial[] | undefined;
  if (mats) {
    const from = g.userData.from as string[];
    const to = g.userData.to as string[];
    mats.forEach((m, i) => {
      m.color.set(from[i]).lerp(new THREE.Color(to[i]), purity);
      m.emissive.setRGB(0.2 * (1 - purity), 0, 0.3 * (1 - purity));
    });
  }
  const aura = g.getObjectByName('aura') as THREE.Mesh | undefined;
  if (aura) (aura.material as THREE.MeshBasicMaterial).opacity = 0.18 * (1 - purity) + 0.25 * purity * Math.abs(Math.sin(purity * 20));
}

export function animateOrganVisual(g: THREE.Group, dt: number): void {
  const card = g.userData.card as THREE.Group | undefined;
  if (card) {
    // a sticker floats, turns and flaps a little, like it's being peeled
    const tt = performance.now() / 1000;
    card.rotation.set(Math.sin(tt * 1.7) * 0.18, card.rotation.y + dt * 1.6, Math.sin(tt * 2.3) * 0.1);
    card.position.y = 0.55 + Math.sin(tt * 2.2) * 0.06;
  }
  (g.userData.eye as EyeVisual | undefined)?.update(dt);
  (g.userData.mouth as MouthVisual | undefined)?.update(dt);
}
