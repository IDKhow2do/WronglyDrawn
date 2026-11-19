/**
 * Dev-only catalog of the code-built (procedural) models, for asset-review.html.
 * Every entry builds the real thing from the game's own code; anything that needs a live
 * GameContext (physics/effects/audio) gets a no-op proxy, so we only ever *look* at the mesh.
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import { AssetManager } from '../core/AssetManager';
import type { GameContext } from '../core/Context';
import { ensureKitTextures, StaticBatch } from '../level/harbor/HarborKit';
import { buildBridgeFrame, buildBridgePiers, buildBigAwning, buildBuoy, buildFerry, buildGateArch, buildGateBell, buildSailBoat, buildStairParapet, buildStall } from '../level/harbor/HarborModels';
import { ensureTextures as ensureHarborTextures } from '../level/harbor/MuteHarbor';
import { buildClockTower } from '../level/harbor/ClockTower';
import { buildFountain } from '../level/Fountain';
import { wonkyBuilding } from '../level/WonkyBuilding';
import { Crown, PaintDrop, Checkpoint } from '../level/Collectibles';
import { makeCrown } from '../level/BlindPlaza';
import { makePencil } from '../story/StoryDirector';
import { makeCapeTie } from '../player/Cape';
import { buildSprayGun } from '../weapon/SprayGunModel';
import { makeOrganVisual } from '../organs/OrganVisuals';
import { EyeVisual, MouthVisual, LegsVisual } from '../hosts/OrganVisuals';
import { WaiModel } from '../player/WaiModel';
import { CompanionModel } from '../coop/CompanionModel';
import { MutantModel } from '../enemy/MutantModel';
import { EraserGrub } from '../enemy/EraserGrub';
import { EraserBoss } from '../enemy/EraserBoss';
import { ChomperBin } from '../enemy/ChomperBin';
import { PeepingLamp } from '../enemy/PeepingLamp';
import { CrookedLegMutant } from '../enemy/CrookedLegMutant';
import { HushMoth } from '../enemy/HushMoth';
import { HushBoss } from '../enemy/HushBoss';

export interface CodeModel {
  id: string;
  name: string;
  group: string;
  /** Source file that builds it. */
  src: string;
  build(): THREE.Object3D;
}

/** A value that accepts any property access / call and returns itself — stands in for physics, effects, audio… */
function sink(): any {
  const f: any = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : f),
    apply: () => f,
    construct: () => f,
  });
  return f;
}

export async function loadCatalog(onProgress: (label: string) => void): Promise<CodeModel[]> {
  await RAPIER.init?.();
  const assets = new AssetManager();
  onProgress('生成程序贴图…');
  await assets.buildTextures(() => {});
  onProgress('载入手绘贴图…');
  await assets.loadPaintedTextures(() => {});
  ensureKitTextures(assets);
  ensureHarborTextures(assets);
  onProgress('载入 GLB 覆盖模型…');
  await assets.loadOptionalModels(() => {});

  const ctxFor = (holder: THREE.Group) => new Proxy({ root: holder, assets, scene: new THREE.Scene() } as any, { get: (t, k) => (k in t ? t[k] : sink()) }) as GameContext;
  /** Build something that wants a ctx and return its `.root` (or the holder group). */
  const withCtx = <T extends { root: THREE.Object3D }>(fn: (ctx: GameContext) => T): THREE.Object3D => {
    const holder = new THREE.Group();
    const o = fn(ctxFor(holder));
    const g = new THREE.Group();
    g.add(holder, o.root);
    return g;
  };
  const batch = (fn: (B: StaticBatch) => void): THREE.Object3D => {
    const g = new THREE.Group();
    const B = new StaticBatch();
    fn(B);
    B.flush(g);
    return g;
  };
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  const list: CodeModel[] = [];
  const add = (group: string, name: string, src: string, build: () => THREE.Object3D) => list.push({ id: `code/${group}/${name}`, name, group, src, build });

  // ── hero & companion ──
  add('角色', 'WAI（程序版）', 'player/WaiModel.ts', () => new WaiModel(assets).root);
  add('角色', 'Pip 同伴', 'coop/CompanionModel.ts', () => new CompanionModel().root);
  add('角色', '蜡笔披风结', 'player/Cape.ts', () => makeCapeTie());
  add('角色', '巨型铅笔', 'story/StoryDirector.ts', () => makePencil(0.4));
  add('角色', '喷漆枪（程序版）', 'weapon/SprayGunModel.ts', () => buildSprayGun(assets).root);

  // ── enemies (visual only) ──
  add('敌人', 'CrookedLegMutant（歪腿怪）', 'enemy/CrookedLegMutant.ts', () => withCtx((c) => new CrookedLegMutant(c, 'm', V())));
  add('敌人', 'MutantModel（歪腿怪模型）', 'enemy/MutantModel.ts', () => new MutantModel(assets).root);
  add('敌人', 'EraserGrub（橡皮虫）', 'enemy/EraserGrub.ts', () => withCtx((c) => new EraserGrub(c, 'g', V())));
  add('敌人', 'EraserBoss（橡皮 Boss）', 'enemy/EraserBoss.ts', () => withCtx((c) => new EraserBoss(c, 'eb', V())));
  add('敌人', 'ChomperBin（咬人垃圾桶）', 'enemy/ChomperBin.ts', () => withCtx((c) => new ChomperBin(c, 'cb', V())));
  add('敌人', 'PeepingLamp（偷窥路灯）', 'enemy/PeepingLamp.ts', () => withCtx((c) => new PeepingLamp(c, 'pl', V())));
  add('敌人', 'HushMoth（噤声飞蛾）', 'enemy/HushMoth.ts', () => withCtx((c) => new HushMoth(c, 'hm', V())));
  add('敌人', 'HushBoss（噤声 Boss）', 'enemy/HushBoss.ts', () => withCtx((c) => new HushBoss(c, 'hb', V())));

  // ── organs / stickers ──
  for (const t of ['EYE', 'MOUTH', 'LEG'] as const)
    for (const bad of [false, true]) add('器官贴纸', `${t}${bad ? '（腐化）' : ''}`, 'organs/OrganVisuals.ts', () => makeOrganVisual(t, bad));
  add('器官贴纸', 'EyeVisual（宿主眼睛）', 'hosts/OrganVisuals.ts', () => new EyeVisual(1).root);
  add('器官贴纸', 'EyeVisual（腐化）', 'hosts/OrganVisuals.ts', () => new EyeVisual(1, true).root);
  add('器官贴纸', 'MouthVisual（宿主嘴）', 'hosts/OrganVisuals.ts', () => new MouthVisual(1).root);
  add('器官贴纸', 'LegsVisual（宿主腿）', 'hosts/OrganVisuals.ts', () => new LegsVisual(1.2, 0.5, 0.18).root);

  // ── collectibles ──
  add('收集物', 'Crown 皇冠', 'level/Collectibles.ts', () => withCtx((c) => new Crown(c, 'c', V(), '')));
  add('收集物', 'makeCrown 皇冠（装饰）', 'level/BlindPlaza.ts', () => makeCrown(1, '#ffd23a'));
  add('收集物', 'PaintDrop 颜料滴', 'level/Collectibles.ts', () => withCtx((c) => new PaintDrop(c, 'p', V(), '#ff4fa3')));
  add('收集物', 'Checkpoint 喷漆罐存档点', 'level/Collectibles.ts', () => withCtx((c) => new Checkpoint(c, 'cp', V(), 0)));

  // ── level props ──
  add('关卡', '喷泉', 'level/Fountain.ts', () => buildFountain((n) => assets.tex(n)));
  for (const [facade, w, d, h] of [['facade_sleepy', 6, 5, 7], ['facade_awake', 5, 5, 9], ['facade_cyclops', 7, 5, 6], ['facade_teeth', 6, 6, 8], ['facade_crowns', 5, 5, 10], ['facade_nose', 6, 5, 7]] as [string, number, number, number][])
    add('关卡', `歪楼 ${facade.replace('facade_', '')}`, 'level/WonkyBuilding.ts', () => {
      const holder = new THREE.Group();
      wonkyBuilding(ctxFor(holder), { x: 0, z: 0, w, d, h, ground: 0, facade, door: true, eyes: true, seed: 5 });
      holder.position.y = 0;
      return holder;
    });

  // ── harbor ──
  add('港口', '钟楼', 'level/harbor/ClockTower.ts', () => {
    const g = new THREE.Group();
    buildClockTower(g, assets, { x: 0, z: 0, base: 0, bellPos: V(0, 20, 0), facePos: V(0, 12, 4) });
    return g;
  });
  add('港口', '雾笛渡轮', 'level/harbor/HarborModels.ts', () => buildFerry(assets).hull);
  add('港口', '渡轮雾笛', 'level/harbor/HarborModels.ts', () => buildFerry(assets).horn);
  add('港口', '大门钟', 'level/harbor/HarborModels.ts', () => buildGateBell(assets));
  add('港口', '浮标', 'level/harbor/HarborModels.ts', () => buildBuoy(assets));
  for (const [i, c] of ['h2_p_coral', 'h2_p_teal', 'h2_p_brass'].entries()) add('港口', `帆船 ${i + 1}`, 'level/harbor/HarborModels.ts', () => buildSailBoat(assets, c, i + 1).g);
  add('港口', '桥框', 'level/harbor/HarborModels.ts', () => buildBridgeFrame(assets, 24));
  add('港口', '桥墩', 'level/harbor/HarborModels.ts', () => batch((B) => buildBridgePiers(B, assets, V(-8, 2, 0), V(8, 2, 0))));
  add('港口', '门拱', 'level/harbor/HarborModels.ts', () => batch((B) => buildGateArch(B, assets, 0, 0, 0)));
  add('港口', '集市摊位 · 珊瑚', 'level/harbor/HarborModels.ts', () => batch((B) => buildStall(B, assets, 0, 0, 0, 0, 'h2_stripe_coral', 1)));
  add('港口', '集市摊位 · 青', 'level/harbor/HarborModels.ts', () => batch((B) => buildStall(B, assets, 0, 0, 0, 0, 'h2_stripe_teal', 2)));
  add('港口', '大遮阳棚', 'level/harbor/HarborModels.ts', () => batch((B) => buildBigAwning(B, assets, V(0, 3, 0), V(4, 2, 3), 0)));
  add('港口', '楼梯护墙', 'level/harbor/HarborModels.ts', () => batch((B) => buildStairParapet(B, assets, V(0, 4, 0), V(6, 0, 0), 0)));

  return list;
}
