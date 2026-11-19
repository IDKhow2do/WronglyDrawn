import * as THREE from 'three';
import type { PlaySession as GameSession, DevLevelInfo } from '../level/Session';
import type { GameSession as PlazaSession } from '../level/GameSession';
import type { Progression } from '../meta/Progression';
import { ISLAND, heightAt } from '../level/Terrain';
import { LEVEL } from '../level/BlindPlaza';
import { PLAYER } from '../player/PlayerController';
import { SPRAY } from '../weapon/WeaponSystem';
import { Quality, type TierPref } from '../render/Quality';
import { Organ } from '../organs/Organ';
import type { OrganType } from '../organs/Organ';
import { t } from '../i18n';

const ZH_ORGAN: Record<string, string> = { EYE: '眼睛', MOUTH: '嘴巴', LEG: '腿' };
const ZH_ZONE: Record<string, string> = { cobble: '石板地', road: '路', grass: '草地', towpath: '运河步道', bed: '运河底', stone: '石台' };

/**
 * DEV PANEL (` or F2) — test any moment of the level without replaying it.
 *
 *  MAP       click anywhere on the island to teleport there (live markers)
 *  STORY     jump forward to any chapter (runs the real story steps), replay cutscenes
 *  PLAYER    invincible, infinite paint, give/take stickers, speed, super jump
 *  CREATURES every creature: go to it, repaint it
 *  WORLD     game speed, guide arrow, HUD, graphics tier
 *  REWARDS   unlock everything / reset progress
 *
 * Only in the dev server (or with ?dev in the URL). The game keeps running underneath.
 */
export interface DevHost {
  session: GameSession | null;
  progress: Progression;
  restart(): Promise<void>;
  releaseLock(): void;
  setTimeScale(k: number): void;
  showHUD(on: boolean): void;
}

type StageId = string;
const STAGES: { id: StageId; label: string; note: string }[] = [
  { id: 'start', label: '0 开局', note: '什么都没做 · 在码头' },
  { id: 'eye', label: '1 拿到眼睛', note: '路灯已上色 · 站在瞌睡崖前' },
  { id: 'cliff', label: '2 瞌睡崖醒了', note: '桥画好了，山路 1/3 · 在运河桥上' },
  { id: 'gate', label: '3 门楼醒了', note: '拿到嘴巴，吊桥放下，山路 2/3 · 在雕像旁' },
  { id: 'quarter', label: '3½ 打叉街区', note: '门楼醒了 · 站在街区入口' },
  { id: 'inkwell', label: '3¾ 红墨水瓶', note: '在墨水瓶广场 · 中Boss前' },
  { id: 'statue', label: '4 三位守护者全醒', note: '山路完整 · 在山路起点' },
  { id: 'summit', label: '5 Boss 战前', note: '在山顶台阶下' },
  { id: 'door', label: '6 Boss 已上色', note: '塔门打开 · 站在门前' },
];

/** Map bounds (world x/z) — level 1's; other levels bring their own (session.devInfo). */
let MX0 = -60, MX1 = 60, MZ0 = -62, MZ1 = 52;
const MW = 300;
let MH = Math.round((MW * (MZ1 - MZ0)) / (MX1 - MX0));

export class DevMenu {
  private el: HTMLDivElement;
  private open = false;
  private god = false;
  private infPaint = false;
  private speed = 1;
  private status: HTMLDivElement;
  private map: HTMLCanvasElement;
  private base: HTMLCanvasElement | null = null;
  /** The level the panel is laid out for (stages, map, cutscenes). */
  private levelShown = 'plaza';
  private info: DevLevelInfo | null = null;
  private plazaCines = '';
  private creatures: HTMLDivElement;
  private hover: HTMLDivElement;
  private baseSpeeds = { walk: PLAYER.walkSpeed, sprint: PLAYER.sprintSpeed, jump: PLAYER.jumpHeight };

  static enabled(): boolean {
    return import.meta.env.DEV || new URLSearchParams(location.search).has('dev');
  }

  constructor(private host: DevHost) {
    this.el = document.createElement('div');
    this.el.className = 'dev-menu hidden';
    const stageBtns = stageButtons(STAGES);
    this.el.innerHTML = `
      <div class="dev-head"><b>🛠 开发者面板</b><span>按 <kbd>\`</kbd> 或 <kbd>F2</kbd> 关闭 · 游戏在后台继续运行</span><button class="dev-x" data-act="close">✕</button></div>
      <div class="dev-status"></div>
      <div class="dev-body">
        <section class="dev-map-sec">
          <h4>🗺 地图 —— 点哪里就传送到哪里</h4>
          <div class="dev-map-wrap"><canvas class="dev-map" width="${MW}" height="${MH}"></canvas><div class="dev-hover"></div></div>
          <div class="dev-legend"><i class="lg you"></i>你 <i class="lg foe"></i>怪物 <i class="lg done"></i>已上色 <i class="lg host"></i>守护者 <i class="lg cp"></i>检查点</div>
        </section>
        <section>
          <h4>📖 剧情 —— 跳到某一章</h4>
          <div class="dev-stages">${stageBtns}</div>
          <p class="dev-note">章节只能往前跳（会真实执行剧情步骤，桥、路、门都会对上）。想回到前面：<button class="inline" data-act="restart">重开本关</button></p>
          <h4>🎬 重放过场动画</h4>
          <div class="dev-grid dev-cines">
            <button data-cine="intro">开场（铅笔画 WAI）</button>
            <button data-cine="pencil">铅笔重画山路</button>
            <button data-cine="boss">Boss 登场</button>
            <button data-cine="finale">Boss 结局</button>
            <button data-act="skip">⏭ 跳过当前</button>
          </div>
        </section>
        <section>
          <h4>🧍 玩家</h4>
          <div class="dev-grid">
            <button data-act="god" class="toggle">🛡 无敌</button>
            <button data-act="paint" class="toggle">🎨 无限颜料</button>
            <button data-act="heal">❤ 回满血</button>
            <button data-act="hurt">💥 挨一下打</button>
          </div>
          <div class="dev-row"><span>贴纸</span>
            <button data-give="EYE">+ 眼睛</button><button data-give="MOUTH">+ 嘴巴</button><button data-give="LEG">+ 腿</button>
            <button data-act="corrupt">变回腐化</button><button data-act="strip">全部移除</button></div>
          <div class="dev-row"><span>移动速度</span>
            <button data-speed="1" class="on">×1</button><button data-speed="1.6">×1.6</button><button data-speed="2.5">×2.5</button>
            <button data-act="jump" class="toggle">🦘 超级跳</button></div>
          <h4>👾 怪物</h4>
          <div class="dev-creatures"></div>
        </section>
        <section>
          <h4>🌍 世界</h4>
          <div class="dev-row"><span>游戏速度</span>
            <button data-ts="0">⏸ 0</button><button data-ts="0.25">0.25</button><button data-ts="0.5">0.5</button><button data-ts="1" class="on">1</button><button data-ts="2">2</button></div>
          <div class="dev-grid">
            <button data-act="guide" class="toggle on">➤ 指引箭头</button>
            <button data-act="hud" class="toggle on">▣ 界面 HUD</button>
          </div>
          <div class="dev-row"><span>画质</span>
            <button data-gfx="auto">自动</button><button data-gfx="low">低</button><button data-gfx="medium">中</button><button data-gfx="high">高</button></div>
          <h4>🏆 奖励</h4>
          <div class="dev-grid">
            <button data-act="unlock">解锁全部奖励</button>
            <button data-act="resetprog">清空全部进度</button>
          </div>
          <h4>📍 位置</h4>
          <div class="dev-grid"><button data-act="where">复制我的坐标（发给 Claude 用）</button></div>
        </section>
      </div>`;
    this.status = this.el.querySelector('.dev-status')!;
    this.map = this.el.querySelector('.dev-map')!;
    this.creatures = this.el.querySelector('.dev-creatures')!;
    this.hover = this.el.querySelector('.dev-hover')!;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.stopPropagation();
      void this.run(b as HTMLButtonElement);
    });
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.map.addEventListener('click', (e) => this.mapClick(e));
    this.map.addEventListener('mousemove', (e) => {
      const { x, z } = this.mapToWorld(e);
      const zone = this.info ? this.info.height(x, z).zone : heightAt(x, z).zone;
      const names = this.info ? this.info.zoneNames : ZH_ZONE;
      this.hover.textContent = `${x.toFixed(0)}, ${z.toFixed(0)} · ${names[zone] ?? zone}`;
    });
    this.map.addEventListener('mouseleave', () => (this.hover.textContent = ''));
    document.getElementById('ui-root')!.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F2') {
        e.preventDefault();
        this.toggle();
      }
    });
    setInterval(() => this.open && this.refresh(), 250);
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) {
      this.host.releaseLock();
      this.refresh();
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Per frame. */
  update(): void {
    const s = this.host.session;
    if (!s) return;
    if (this.god) s.player.invuln = Math.max(s.player.invuln, 0.5);
    if (this.infPaint) s.weapon.tank = SPRAY.tank;
  }

  // ───────────── map ─────────────
  private w2m(x: number, z: number): [number, number] {
    return [((x - MX0) / (MX1 - MX0)) * MW, ((z - MZ0) / (MZ1 - MZ0)) * MH];
  }

  private mapToWorld(e: MouseEvent): { x: number; z: number } {
    const r = this.map.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    return { x: MX0 + u * (MX1 - MX0), z: MZ0 + v * (MZ1 - MZ0) };
  }

  private mapClick(e: MouseEvent): void {
    const s = this.host.session;
    if (!s) return;
    const { x, z } = this.mapToWorld(e);
    // land on whatever is really there (roofs, bridges, terrain): cast down from the sky
    const hit = s.physics.raycast(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0), 90, (c) => c.handle !== s.player.collider.handle);
    const y = hit ? hit.point.y : this.info ? this.info.height(x, z).y : heightAt(x, z).y;
    this.teleport(s, new THREE.Vector3(x, y + 0.4, z));
    this.refresh();
  }

  private teleport(s: GameSession, at: THREE.Vector3, yaw?: number): void {
    s.player.teleport(at, yaw);
    if (yaw !== undefined) s.camYaw = yaw;
  }

  /** The island, shaded by height, drawn once. */
  private drawBase(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = MW;
    c.height = MH;
    const g = c.getContext('2d')!;
    g.fillStyle = '#9fb3ff';
    g.fillRect(0, 0, MW, MH);
    const img = g.getImageData(0, 0, MW, MH);
    const info = this.info;
    const zoneCol: Record<string, [number, number, number]> = info?.zoneColors ?? {
      cobble: [242, 196, 220], road: [255, 214, 120], grass: [150, 214, 140], towpath: [214, 200, 255], bed: [40, 70, 190], stone: [210, 150, 120],
    };
    const poly = info?.outline ?? ISLAND;
    const hgt = info ? info.height : heightAt;
    for (let py = 0; py < MH; py++)
      for (let px = 0; px < MW; px++) {
        const x = MX0 + ((px + 0.5) / MW) * (MX1 - MX0), z = MZ0 + ((py + 0.5) / MH) * (MZ1 - MZ0);
        if (!inPoly(x, z, poly)) continue;
        const h = hgt(x, z);
        const base = zoneCol[h.zone] ?? [230, 230, 230];
        const k = 0.7 + Math.min(1, Math.max(0, (h.y + 5) / 19)) * 0.45;
        const i = (py * MW + px) * 4;
        img.data[i] = Math.min(255, base[0] * k);
        img.data[i + 1] = Math.min(255, base[1] * k);
        img.data[i + 2] = Math.min(255, base[2] * k);
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // island outline
    g.strokeStyle = '#141014';
    g.lineWidth = 2;
    g.beginPath();
    poly.forEach(([x, z], i) => {
      const [u, v] = this.w2m(x, z);
      if (i) g.lineTo(u, v);
      else g.moveTo(u, v);
    });
    g.closePath();
    g.stroke();
    // labels
    g.font = 'bold 11px "PingFang SC", sans-serif';
    g.fillStyle = '#141014';
    for (const [t, x, z] of info?.labels ?? [
      ['码头', -2, 49], ['港口街', 0, 34], ['中心广场', -4, 8], ['运河', -37, 30], ['渡口', -47, 20], ['门楼', -54, -6], ['工地', 32, 14],
      ['山路', 18, -24], ['山顶', -4, -43], ['瞌睡崖', -16, -20],
    ] as [string, number, number][]) {
      const [u, v] = this.w2m(x, z);
      g.fillText(t, u - t.length * 5.5, v);
    }
    return c;
  }

  private drawMap(s: GameSession): void {
    if (!this.base) this.base = this.drawBase();
    const g = this.map.getContext('2d')!;
    g.drawImage(this.base, 0, 0);
    const dot = (x: number, z: number, r: number, fill: string, stroke = '#141014') => {
      const [u, v] = this.w2m(x, z);
      g.beginPath();
      g.arc(u, v, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = stroke;
      g.stroke();
    };
    for (const cp of s.level.checkpoints) dot(cp.pos.x, cp.pos.z, 3, cp.active ? '#22c4c0' : '#ffffff');
    for (const id of this.info?.guardians ?? ['sleepyWall', 'gatehouse', 'statue']) {
      const h = s.organs.hostById(id);
      if (h) dot(h.pos.x, h.pos.z, 5, s.woken.has(id as never) ? '#ffd23a' : '#7a6aa8');
    }
    for (const e of s.enemies) if (!e.disposed) dot(e.pos.x, e.pos.z, e === (s.boss as unknown) ? 6 : 3.5, e.harmless ? '#9be08f' : '#ff3c6e');
    const p = s.player.pos;
    const [u, v] = this.w2m(p.x, p.z);
    const yaw = s.camYaw;
    g.save();
    g.translate(u, v);
    g.rotate(-yaw + Math.PI);
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5, 5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fillStyle = '#ff4fa3';
    g.fill();
    g.strokeStyle = '#141014';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }

  // ───────────── refresh ─────────────
  /** A different level is running: chapters, map and cutscene buttons follow it. */
  private layoutFor(s: GameSession): void {
    if (s.levelId === this.levelShown) return;
    this.levelShown = s.levelId;
    this.info = s.devInfo ?? null;
    [MX0, MX1, MZ0, MZ1] = this.info?.bounds ?? [-60, 60, -62, 52];
    MH = Math.round((MW * (MZ1 - MZ0)) / (MX1 - MX0));
    this.map.height = MH;
    this.base = null;
    this.el.querySelector('.dev-stages')!.innerHTML = stageButtons(this.info?.stages ?? STAGES);
    const cines = this.el.querySelector('.dev-cines')!;
    if (!this.plazaCines) this.plazaCines = cines.innerHTML;
    cines.innerHTML = this.info ? this.info.cines.map((c) => `<button data-cine="${c.id}">${c.label}</button>`).join('') + '<button data-act="skip">⏭ 跳过当前</button>' : this.plazaCines;
  }

  private refresh(): void {
    const s = this.host.session;
    if (!s) return;
    this.layoutFor(s);
    const p = s.player.pos;
    const inv = (['EYE', 'MOUTH', 'LEG'] as const)
      .map((t) => {
        const o = s.inventory.get(t);
        return o ? `${ZH_ORGAN[t]}${o.corrupted ? '（腐化）' : o.hostId ? ` → 借给了 ${o.hostId}` : ''}` : null;
      })
      .filter(Boolean);
    const chapter = s.completed ? '本关已通关' : s.bossDone ? (s.levelId === 'plaza' ? 'Boss 已上色，去塔门' : 'Boss 已上色，去出口') : s.boss.awake ? 'Boss 战中' : `守护者醒了 ${s.woken.size}/3`;
    this.status.innerHTML = `<b>当前：</b>${chapter} · <b>贴纸：</b>${inv.join('、') || '无'} · <b>血量</b> ${s.player.hp}/${PLAYER.maxHp} · <b>坐标</b> ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    this.drawMap(s);
    // creatures list
    const rows = s.enemies
      .filter((e) => !e.disposed)
      .map((e, i) => {
        const d = e.pos.distanceTo(p);
        const st = e.harmless ? '✓ 已上色' : `${e.state.toLowerCase()} · 上色 ${Math.round(e.repaint * 100)}%`;
        return `<div class="cr ${e.harmless ? 'done' : ''}"><span><b>${t(e.displayName)}</b> <small>${st} · ${d.toFixed(0)} 米</small></span><button data-goto="${i}">传送过去</button>${e.harmless ? '' : `<button data-kill="${i}">一键上色</button>`}</div>`;
      })
      .join('');
    if (this.creatures.dataset.sig !== rows) {
      this.creatures.innerHTML = rows;
      this.creatures.dataset.sig = rows;
    }
    this.el.querySelectorAll<HTMLButtonElement>('[data-gfx]').forEach((b) => b.classList.toggle('on', b.dataset.gfx === Quality.pref));
  }

  private setToggle(b: HTMLButtonElement, on: boolean): void {
    b.classList.toggle('on', on);
  }

  private async run(b: HTMLButtonElement): Promise<void> {
    const s = this.host.session;
    if (!s) return;
    const live = s.enemies.filter((e) => !e.disposed);
    if (b.dataset.stage) s.debugWarp(b.dataset.stage as StageId);
    else if (b.dataset.goto) {
      const e = live[Number(b.dataset.goto)];
      if (e) {
        const back = e.pos.clone().add(new THREE.Vector3(0, 0, 5));
        const hit = s.physics.raycast(back.clone().setY(e.pos.y + 6), new THREE.Vector3(0, -1, 0), 20, (c) => c.handle !== s.player.collider.handle);
        this.teleport(s, back.setY((hit ? hit.point.y : e.pos.y) + 0.4), Math.PI);
      }
    } else if (b.dataset.kill) {
      const e = live[Number(b.dataset.kill)];
      if (e) {
        if (e === (s.boss as unknown) && !s.boss.awake) s.boss.engage();
        e.debugRepaint();
      }
    } else if (b.dataset.give) {
      const t = b.dataset.give as OrganType;
      if (!s.inventory.get(t)) {
        const o = new Organ(t, 'dev');
        o.collect();
        o.purify();
        s.inventory.add(o);
      }
    } else if (b.dataset.speed) {
      this.speed = Number(b.dataset.speed);
      PLAYER.walkSpeed = this.baseSpeeds.walk * this.speed;
      PLAYER.sprintSpeed = this.baseSpeeds.sprint * this.speed;
      this.el.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.dataset.ts) {
      this.host.setTimeScale(Number(b.dataset.ts));
      this.el.querySelectorAll('[data-ts]').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.dataset.gfx) {
      Quality.setPref(b.dataset.gfx as TierPref);
    } else if (b.dataset.cine && this.info) {
      if (b.dataset.cine === 'intro') this.host.showHUD(false); // like the real start: the intro's end brings the HUD back
      this.info.cines.find((c) => c.id === b.dataset.cine)?.run();
      this.toggle(false);
    } else if (b.dataset.cine && s.levelId === 'plaza') {
      const story = (s as PlazaSession).story;
      const eraser = (s as PlazaSession).eraser;
      if (b.dataset.cine === 'intro') {
        this.host.showHUD(false); // a cutscene, like the real start (the intro's end brings the HUD back)
        story.intro(LEVEL.spawn, eraser);
      }
      else if (b.dataset.cine === 'boss') story.bossIntro(eraser);
      else if (b.dataset.cine === 'finale') story.finale(eraser, () => {});
      else if (b.dataset.cine === 'pencil') story.pencilDraw((s as PlazaSession).level.roadGapCenter(0));
      this.toggle(false);
    } else
      switch (b.dataset.act) {
        case 'close':
          this.toggle(false);
          break;
        case 'god':
          this.god = !this.god;
          this.setToggle(b, this.god);
          break;
        case 'paint':
          this.infPaint = !this.infPaint;
          this.setToggle(b, this.infPaint);
          break;
        case 'jump': {
          const on = PLAYER.jumpHeight === this.baseSpeeds.jump;
          PLAYER.jumpHeight = on ? this.baseSpeeds.jump * 3 : this.baseSpeeds.jump;
          this.setToggle(b, on);
          break;
        }
        case 'heal':
          s.player.hp = PLAYER.maxHp;
          s.weapon.tank = SPRAY.tank;
          s.events.emit('player:healed', { hp: s.player.hp });
          break;
        case 'hurt':
          if (s.player.takeHit(s.player.pos.clone().add(new THREE.Vector3(1, 0, 0)), 2, 6)) s.events.emit('player:damaged', { hp: s.player.hp });
          break;
        case 'corrupt':
          for (const t of ['EYE', 'MOUTH', 'LEG'] as const) {
            const o = s.inventory.get(t);
            if (o && !o.lent) {
              const c = new Organ(t, 'dev');
              c.collect(); // carried, still corrupted: hold its key to purify
              s.inventory.debugSet(t, c);
            }
          }
          break;
        case 'strip':
          s.inventory.debugClear();
          break;
        case 'skip':
          if (s.story.locked) s.story.skip();
          s.stopCine();
          break;
        case 'guide': {
          s.guide.enabled = !s.guide.enabled;
          this.setToggle(b, s.guide.enabled);
          break;
        }
        case 'hud': {
          const on = !b.classList.contains('on');
          this.host.showHUD(on);
          this.setToggle(b, on);
          break;
        }
        case 'unlock':
          this.host.progress.debugUnlockAll();
          break;
        case 'resetprog':
          this.host.progress.debugReset();
          break;
        case 'restart':
          this.toggle(false);
          await this.host.restart();
          return;
        case 'where': {
          const p = s.player.pos;
          const txt = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} (yaw ${s.camYaw.toFixed(2)})`;
          void navigator.clipboard?.writeText(txt).catch(() => {});
          b.textContent = `📋 已复制：${txt}`;
          break;
        }
      }
    this.refresh();
  }
}

function stageButtons(stages: { id: string; label: string; note: string }[]): string {
  return stages.map((s) => `<button class="stage" data-stage="${s.id}"><b>${s.label}</b><small>${s.note}</small></button>`).join('');
}

function inPoly(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
