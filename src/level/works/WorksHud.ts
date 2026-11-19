/**
 * [INPUT]: depends on WorksSession's public surface (WorksSessionView, incl. the SoulsFight gate prompt); ORGAN_DEFS from organs/Organ; t from i18n; WORKS/IN from ./WorksLayout
 * [OUTPUT]: exports WorksSessionView, worksPrompt() (the action prompt line) and worksDevInfo() (the dev panel's tables)
 * [POS]: the HUD-facing helpers of WorksSession, kept apart so the session stays a readable composition root:
 *        what the prompt says next to WAI (TAG IT, SHOUT, lend a sticker, recall), and the dev panel's warps,
 *        map and cutscene buttons for level 3.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { ORGAN_DEFS } from '../../organs/Organ';
import type { DevLevelInfo, PlaySession, PromptView } from '../Session';
import type { RedPenBoss } from '../../enemy/RedPenBoss';
import type { ShoutSystem } from '../harbor/Shout';
import type { WorksBuilt } from './LimpWorks';
import type { WorksStory } from './WorksStory';
import type { SoulsFight } from './SoulsFight';
import { t } from '../../i18n';
import { FY, IN, WORKS } from './WorksLayout';

export interface WorksSessionView extends PlaySession {
  readonly built: WorksBuilt;
  readonly pen: RedPenBoss;
  readonly shout: ShoutSystem;
  readonly story: WorksStory;
  readonly souls: SoulsFight;
}

export function worksPrompt(s: WorksSessionView): PromptView | null {
  const p = s.player;
  const inv = s.inventory;
  const sel = inv.get(inv.selected);
  if (sel?.corrupted) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to purify {organ}', { organ: t(sel.def.corruptedName) }), enabled: true };
  if (sel && inv.crossed.has(sel.type)) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Crossed out by the Red Pen!'), enabled: false };
  const gate = s.souls.gatePrompt;
  if (gate) return { ...gate, text: t(gate.text) };
  const coopPrompt = s.coop?.prompt();
  if (coopPrompt) return coopPrompt;
  const enc = s.combat.encorePrompt;
  if (enc) return { ...enc, enabled: true };
  if (s.combat.finisherTarget()) return { key: 'E', action: 'Tag', text: t('TAG IT!'), enabled: true };
  if (s.throws.held) return { key: 'G', text: t('Hold G to charge · release to throw the {thing}', { thing: t(s.throws.held.def.name) }), enabled: true };
  // SHOUT: the Archivist's horn (while it reads) or the flying Pen (phase 2)
  if (inv.worn('MOUTH') && s.organs.focusedHost == null) {
    const { origin, dir } = s.shout.aim(p);
    const horn = s.built.archivist;
    if (horn.reading) {
      const to = horn.horn.clone().sub(origin);
      if (to.length() < 9 && to.normalize().dot(dir) > 0.6) return { key: 'X', text: t('SHOUT into the horn!'), enabled: s.shout.muteT <= 0 };
    }
    const pen = s.pen;
    if (pen.awake && pen.shoutable) {
      const d = pen.pos.distanceTo(p.pos);
      if (d < 9.5) return { key: 'X', text: t('SHOUT at the Red Pen!'), enabled: true };
      if (d < 15.5) return { key: 'X', text: t('Too far — hold X: BIG SHOUT'), enabled: true };
    }
  }
  const liftable = s.throws.canLiftNear(p);
  if (liftable && !s.organs.focusedHost) return { key: 'G', text: t('Pick up the {thing}', { thing: t(liftable.def.name) }), enabled: true };
  const host = s.organs.focusedHost;
  if (!host) return null;
  if (!sel) return { key: 'E', text: t(host.def.name), enabled: false };
  if (sel.lent && (host.permanent.has(sel.type) || s.story.locked || s.ctx.camera.inCine)) return null;
  if (sel.lent) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to recall {organ}', { organ: t(sel.def.name) }), enabled: true };
  const reason = host.canAccept(sel);
  if (reason) return { key: 'E', text: reason, enabled: false };
  return { key: 'E', action: 'Apply', text: t('Stick {organ} on the {host}', { organ: t(sel.def.name), host: t(host.def.name) }), enabled: true };
}

export function worksDevInfo(s: WorksSessionView): DevLevelInfo {
  const W = WORKS;
  return {
    stages: [
      { id: 'start', label: '0 开局', note: '刚进塔门 · 什么都没做' },
      { id: 'legs', label: '1 拿到腿', note: '「瘸子」已上色 · 长腿 · 在入口' },
      { id: 'belts', label: '1½ 传送带', note: '装卸台下 · 两台盖章机' },
      { id: 'lift', label: '2 货梯醒了', note: '已在冲压层 · 货梯旁' },
      { id: 'stamp', label: '2½ 冲压层', note: '存档点 · 盖章快跑在东墙' },
      { id: 'pit', label: '2¾ 碎纸坑', note: '东侧坑边 · 吊台 + 尺子蛇' },
      { id: 'inspector', label: '3 检查员醒了', note: '铅笔楼梯画好了 · 西侧' },
      { id: 'archive', label: '3½ 档案层', note: '刚上楼梯' },
      { id: 'index', label: '3¾ 索引室', note: '卡片柜已开 · 档案员前' },
      { id: 'roof', label: '4 档案员醒了', note: '屋顶楼梯口' },
      { id: 'boss', label: '5 红笔战', note: '第一阶段 · 在圈里' },
      { id: 'phase2', label: '5½ 第二阶段', note: '腿被划掉 · 寂静来帮忙' },
      { id: 'phase3', label: '5¾ 第三阶段', note: '嘴被划掉 · 橡皮来帮忙' },
      { id: 'final', label: '5⅞ 最后一击', note: '笔尖插进屋顶 · 去盖涂鸦' },
      { id: 'exit', label: '6 红笔已上色', note: '结尾' },
    ],
    bounds: [-IN - 2, IN + 2, -IN - 2, IN + 2],
    outline: [[-IN, -IN], [IN, -IN], [IN, IN], [-IN, IN]],
    height: (x, z) => {
      const y = s.player.pos.y;
      const f = y < FY[1] - 1 ? 0 : y < FY[2] - 1 ? 1 : y < FY[3] - 1 ? 2 : 3;
      if (f === 1 && Math.abs(x) < 8) return { y: W.pitBottom, zone: 'pit' };
      if (f === 0 && z > 8 && z < 12) return { y: W.dockY, zone: 'dock' };
      if (f === 0 && W.belts.some((b) => Math.abs(z - b.z) < b.half && x > b.x0 && x < b.x1)) return { y: 1, zone: 'belt' };
      return { y: FY[f], zone: 'floor' };
    },
    zoneColors: { floor: [236, 230, 214], dock: [120, 130, 170], belt: [60, 58, 80], pit: [200, 60, 70] },
    zoneNames: { floor: '地板', dock: '装卸台', belt: '传送带', pit: '碎纸坑' },
    labels: [
      ['塔门', 0, 20], ['装卸台', 0, 10], ['传送带', 0, -1], ['货梯', 17.8, -17.8], ['盖章快跑', 19, 4], ['碎纸坑', 0, 0], ['检查员', W.inspector.x, W.inspector.z], ['阅览室', 0, 9], ['档案员', W.archivist.x, W.archivist.z], ['屋顶圈', W.arena.x, W.arena.z],
    ],
    guardians: ['lift', 'inspector', 'archivist'],
    cines: [
      { id: 'intro', label: '开场（进塔门）', run: () => s.story.intro(s.pen, new THREE.Vector3(-8, 0, 16)) },
      { id: 'lift', label: '货梯醒来', run: () => s.story.liftBeat(s.built.lift.host.center()) },
      { id: 'ride', label: '货梯上升', run: () => s.story.rideShots() },
      { id: 'inspector', label: '检查员看楼梯', run: () => s.story.inspectorBeat(s.built.inspector.host.center(), W.stair2.foot.clone().setZ(-1).setY(FY[1] + 4)) },
      { id: 'archivist', label: '档案员开口', run: () => s.story.archivistBeat(s.built.archivist.host.center(), W.stair3.foot.clone()) },
      { id: 'boss', label: '红笔登场', run: () => s.story.bossIntro(s.pen) },
      { id: 'finale', label: '结尾（城市还是画歪的）', run: () => s.story.finale(s.pen, () => {}) },
    ],
  };
}
