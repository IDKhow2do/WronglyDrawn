/**
 * [INPUT]: 会话中的器官、输入、敌人和宿主。
 * [OUTPUT]: 世界器官、拾取事件、净化和借用操作。
 * [POS]: 拾取源于世界器官进入库存。成功拾取立刻显示通知。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import { ORGAN_DEFS, ORGAN_ORDER, Organ, type OrganType } from './Organ';
import { makeOrganVisual, tintOrganVisual, animateOrganVisual } from './OrganVisuals';
import type { OrganHost, Gazer } from '../hosts/OrganHost';
import type { EdibleRegistry } from '../hosts/Edible';
import type { Damageable } from '../combat/Damage';
import { t as tr } from '../i18n';

/** A corrupted organ lying in the world (dropped by a stunned enemy). Auto-collected. */
const GUARDIANS = ['sleepyWall', 'gatehouse', 'statue'];

const UP_AXIS = new THREE.Vector3(0, 1, 0);
export class WorldOrgan {
  readonly visual: THREE.Group;
  disposed = false;
  /** seconds WAI has been standing near it (then it flies to him) */
  nearT = 0;
  private t = 0;
  private dropT = 0;
  private ring: THREE.Mesh;

  constructor(
    private ctx: GameContext,
    readonly organ: Organ,
    readonly at: THREE.Vector3,
    private from: THREE.Vector3,
  ) {
    this.visual = makeOrganVisual(organ.type, true);
    this.visual.position.copy(from);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 28),
      new THREE.MeshBasicMaterial({ color: '#ff3cf0', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(at).setY(at.y + 0.04);
    ctx.root.add(this.visual, this.ring);
  }

  get ready(): boolean {
    return this.dropT >= 1;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.dropT < 1) {
      this.dropT = Math.min(1, this.dropT + dt * 1.3);
      const k = this.dropT;
      this.visual.position.lerpVectors(this.from, this.at, k);
      this.visual.position.y += Math.sin(k * Math.PI) * 2;
      this.visual.rotation.z = (1 - k) * 5;
    } else {
      this.visual.position.set(this.at.x, this.at.y + 0.1 + Math.abs(Math.sin(this.t * 3)) * 0.15, this.at.z);
      this.ring.position.set(this.at.x, this.at.y + 0.04, this.at.z);
      this.visual.rotation.set(0, this.t * 1.4, Math.sin(this.t * 7) * 0.1);
    }
    animateOrganVisual(this.visual, dt);
    this.ring.scale.setScalar(1 + Math.sin(this.t * 5) * 0.12);
  }

  dispose(): void {
    this.disposed = true;
    this.ctx.root.remove(this.visual, this.ring);
  }
}

interface Flight {
  visual: THREE.Group;
  from: THREE.Vector3;
  host: OrganHost;
  organ: Organ;
  t: number;
  dur: number;
  back: boolean;
}

/**
 * All organ verbs:
 *  Q / R / F   select Eye / Mouth / Legs · hold to purify (corrupted) · hold to recall (lent)
 *  E           lend the selected sticker: aim at anything (first person) or stand next to it
 *              (E on a legged crate that already has legs: stay / follow)
 *  V           Chomp (Mouth worn): bite, swallow grubs for spit ammo, eat paint & rubble
 * Worn organs = WAI abilities (Long Legs in PlayerController, True Sight gazer here).
 */
export class OrganSystem {
  readonly worldOrgans: WorldOrgan[] = [];
  private holdT: Record<OrganType, number> = { EYE: 0, MOUTH: 0, LEG: 0 };
  private purifyVisual: THREE.Group | null = null;
  private purifyType: OrganType | null = null;
  private flights: Flight[] = [];
  private hintCd = 0;
  private chompCd = 0;
  /** HUD: current hold action. */
  hold: { label: string; progress: number } | null = null;
  focusedHost: OrganHost | null = null;

  constructor(
    private ctx: GameContext,
    private hosts: () => OrganHost[],
    private edibles: EdibleRegistry,
    private enemiesNear: (p: THREE.Vector3, r: number) => Damageable[],
  ) {}

  drop(organ: Organ, at: THREE.Vector3, from: THREE.Vector3): void {
    this.worldOrgans.push(new WorldOrgan(this.ctx, organ, at, from));
    this.ctx.events.emit('organ:dropped', { organ });
  }

  hostById(id: string | null): OrganHost | undefined {
    return id ? this.hosts().find((h) => h.id === id) : undefined;
  }

  /** True Sight: WAI's own gaze while aiming with the Eye worn. */
  waiGazer(): Gazer | null {
    if (!this.ctx.inventory.worn('EYE') || this.ctx.camera.aimT < 0.6) return null;
    const ray = this.ctx.camera.aimRay();
    return { origin: ray.origin, dir: ray.dir, range: 26, cosHalf: Math.cos((24 * Math.PI) / 180), sourceId: 'wai' };
  }

  /** `text` is the English source (i18n key); `params` fill its {placeholders}. */
  private toast(text: string, kind: 'info' | 'warn' | 'good' = 'info', params?: Record<string, string | number>, immediate = false): void {
    this.ctx.events.emit('toast', { text: tr(text, params), kind, immediate });
  }

  step(dt: number, player: PlayerController, allowed: boolean): void {
    const inv = this.ctx.inventory;
    const input = this.ctx.input;
    this.hintCd = Math.max(0, this.hintCd - dt);
    this.chompCd = Math.max(0, this.chompCd - dt);

    // ---- pick up dropped organs (walk over them) ----
    for (const wo of this.worldOrgans) {
      wo.update(dt);
      // safety net: a sticker you're standing near always comes to you
      if (!wo.disposed && wo.ready) {
        const flat = Math.hypot(wo.at.x - player.pos.x, wo.at.z - player.pos.z);
        wo.nearT = flat < 4 ? wo.nearT + dt : 0;
        if (wo.nearT > 1.2) wo.at.lerp(player.pos, Math.min(1, dt * 6));
      }
      if (!wo.disposed && wo.ready && allowed && wo.at.distanceTo(player.pos) < 1.6) {
        wo.organ.collect();
        const added = inv.add(wo.organ);
        wo.dispose();
        if (!added) continue;
        player.playAction('pickup', 0.45, 0.3);
        this.ctx.audio.play('peel');
        this.ctx.effects.burst(wo.at.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ff3cf0', 14, 3);
        this.ctx.events.emit('organ:collected', { organ: wo.organ });
        this.toast('Got the {organ}! Hold {key} to purify it.', 'good', { organ: tr(wo.organ.def.corruptedName), key: wo.organ.def.keyLabel }, true);
      }
    }
    for (let i = this.worldOrgans.length - 1; i >= 0; i--) if (this.worldOrgans[i].disposed) this.worldOrgans.splice(i, 1);

    // ---- Q / R / F: select, hold to purify / recall ----
    this.hold = null;
    let purifying: OrganType | null = null;
    for (const t of ORGAN_ORDER) {
      const def = ORGAN_DEFS[t];
      const organ = inv.get(t);
      if (allowed && input.consumePressed(def.key)) {
        if (!organ) {
          if (this.hintCd <= 0) {
            this.hintCd = 1.2;
            this.toast('No {organ} yet — some mutant must have it…', 'warn', { organ: tr(def.name) });
            this.ctx.audio.play('denied');
          }
        } else {
          inv.select(t);
          this.ctx.audio.play('select');
        }
        this.holdT[t] = 0;
      }
      if (allowed && organ && input.isDown(def.key) && player.grounded) {
        this.holdT[t] += dt;
        if (organ.corrupted) {
          purifying = t;
          const p = this.holdT[t] / def.purifyTime;
          this.hold = { label: tr('Purifying {organ}', { organ: tr(def.corruptedName) }), progress: p };
          if (p >= 1) this.completePurify(organ, player);
        } else if (organ.lent && this.holdT[t] > 0.12) {
          const p = (this.holdT[t] - 0.12) / 0.4;
          this.hold = { label: tr('Recalling {organ}', { organ: tr(def.name) }), progress: p };
          if (p >= 1) {
            this.recall(organ, player);
            this.holdT[t] = -10; // don't re-trigger until released
          }
        }
      } else this.holdT[t] = 0;
    }
    this.updatePurifyVisual(purifying, player, dt);

    // ---- E: lend selected sticker / host command ----
    this.focusedHost = this.pickHost(player);
    for (const h of this.hosts()) h.setFocused(h === this.focusedHost && this.ctx.camera.aimT < 0.6);
    if (allowed && input.consumePressed('KeyE') && player.lockTimer <= 0) this.pressE(player);

    // ---- V: chomp ----
    if (allowed && input.consumePressed('KeyV')) {
      if (!inv.worn('MOUTH')) {
        if (this.hintCd <= 0) {
          this.hintCd = 1.2;
          this.toast(inv.get('MOUTH') ? 'Your Mouth Sticker is lent out — hold R to recall it' : 'You need a Mouth Sticker to chomp', 'warn');
          this.ctx.audio.play('denied');
        }
      } else if (this.chompCd <= 0) this.chomp(player);
    }

    // ---- sticker flights ----
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const to = f.back ? player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)) : f.host.socketWorld(f.organ.type);
      const from = f.back ? f.host.socketWorld(f.organ.type) : f.from;
      f.visual.position.lerpVectors(from, to, k);
      f.visual.position.y += Math.sin(k * Math.PI) * 1.2;
      f.visual.rotation.y += dt * 14;
      if (k >= 1) {
        this.ctx.root.remove(f.visual);
        this.flights.splice(i, 1);
        if (!f.back) this.landSticker(f.organ, f.host, player);
      }
    }
  }

  /** Host WAI would lend to right now (aimed in first person, nearest in front otherwise). */
  private pickHost(player: PlayerController): OrganHost | null {
    if (this.ctx.camera.aimT > 0.6) {
      const ray = this.ctx.camera.aimRay();
      const hit = this.ctx.physics.raycast(ray.origin, ray.dir, 22, (c) => c.handle !== player.collider.handle);
      const owner = hit ? this.ctx.physics.ownerOf<unknown>(hit.collider) : null;
      if (hit && this.hosts().includes(owner as OrganHost)) return owner as OrganHost;
      // some big hosts aren't their own collider (the Foghorn Ferry's hull is plain level geometry,
      // or nothing at all where its face is): test the ray against each host's box, in front of the hit
      let near: OrganHost | null = null;
      let nearT = (hit?.dist ?? 22) + 1.2;
      const lo = new THREE.Vector3();
      const ld = new THREE.Vector3();
      const box = new THREE.Box3();
      const r = new THREE.Ray();
      const out = new THREE.Vector3();
      for (const h of this.hosts()) {
        const c = h.center();
        lo.copy(ray.origin).sub(c).applyAxisAngle(UP_AXIS, -h.yaw);
        ld.copy(ray.dir).applyAxisAngle(UP_AXIS, -h.yaw);
        box.min.copy(h.def.half).negate();
        box.max.copy(h.def.half);
        r.set(lo, ld);
        if (!r.intersectBox(box, out)) continue;
        const tHit = out.distanceTo(lo);
        if (tHit < nearT) {
          nearT = tHit;
          near = h;
        }
      }
      return near;
    }
    let best: OrganHost | null = null;
    let bestD = Infinity;
    const fwd = player.forward();
    for (const h of this.hosts()) {
      const cp = h.closestPoint(player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)));
      const to = cp.clone().sub(player.pos).setY(0);
      const d = to.length();
      const vertical = cp.y - player.pos.y;
      if (d > 2.4 || vertical < -1.5 || vertical > 3) continue;
      const front = d > 0.05 ? to.normalize().dot(fwd) : 1;
      const score = d - front * 0.8;
      if (score < bestD) {
        bestD = score;
        best = h;
      }
    }
    if (best) return best;
    // the Guardians are huge: looking roughly at one from nearby is enough (no precise aiming)
    const look = this.ctx.camera.lookDir();
    const eye = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    let bestDot = Math.cos((20 * Math.PI) / 180);
    for (const id of GUARDIANS) {
      const h = this.hostById(id);
      if (!h) continue;
      const sock = h.socketWorld('EYE');
      const to = sock.clone().sub(eye);
      const flat = Math.hypot(to.x, to.z);
      if (flat > 11 || Math.abs(to.y) > 9) continue;
      const dot = to.normalize().dot(look);
      // the follow camera looks a bit down at WAI: forgive vertical error, judge mostly by heading
      const yawDot = new THREE.Vector2(to.x, to.z).normalize().dot(new THREE.Vector2(look.x, look.z).normalize());
      const score = Math.max(dot, yawDot - 0.03);
      if (score > bestDot) {
        bestDot = score;
        best = h;
      }
    }
    return best;
  }

  private pressE(player: PlayerController): void {
    const inv = this.ctx.inventory;
    const host = this.focusedHost;
    const organ = inv.get(inv.selected);
    if (host && organ && host.has(organ.type) && organ.type === 'LEG' && host.movable) {
      host.mode = host.mode === 'follow' ? 'stay' : 'follow';
      this.toast(host.mode === 'stay' ? 'The {host} sits and stays.' : 'The {host} follows you again.', 'info', { host: tr(host.def.name) });
      this.ctx.audio.play('shuffle', { pos: host.center() });
      return;
    }
    if (!organ) {
      if (host && this.hintCd <= 0) {
        this.hintCd = 1.5;
        this.toast('The {host}. If only you had a sticker to give it…', 'info', { host: tr(host.def.name) });
      }
      return;
    }
    if (organ.corrupted) {
      this.toast('Purify it first: hold {key}', 'warn', { key: organ.def.keyLabel });
      this.ctx.audio.play('denied');
      return;
    }
    if (organ.lent) {
      this.toast('Your {organ} is on the {host} — hold {key} to recall it', 'warn', {
        organ: tr(organ.def.name),
        host: tr(this.hostById(organ.hostId)?.def.name ?? 'something'),
        key: organ.def.keyLabel,
      });
      this.ctx.audio.play('denied');
      return;
    }
    if (!host) {
      if (this.hintCd <= 0) {
        this.hintCd = 2;
        this.toast('Hold right mouse and aim at something, or stand next to it — then press E to stick it on');
      }
      return;
    }
    const reason = host.canAccept(organ);
    if (reason) {
      this.toast(reason, 'warn');
      this.ctx.audio.play('denied');
      return;
    }
    // throw the sticker
    organ.lend(host.id); // reserve immediately (no double lending)
    const visual = makeOrganVisual(organ.type, false);
    visual.scale.setScalar(0.7);
    const from = player.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    visual.position.copy(from);
    this.ctx.root.add(visual);
    const dist = from.distanceTo(host.socketWorld(organ.type));
    this.flights.push({ visual, from, host, organ, t: 0, dur: Math.min(0.55, 0.15 + dist * 0.03), back: false });
    player.playAction('throw', 0.3);
    this.ctx.audio.play('throwSticker');
    this.ctx.inventory.changed();
  }

  private landSticker(organ: Organ, host: OrganHost, player: PlayerController): void {
    host.attach(organ);
    this.ctx.audio.play('stick', { pos: host.socketWorld(organ.type) });
    this.ctx.effects.burst(host.socketWorld(organ.type), organ.def.color, 14, 3);
    this.ctx.events.emit('organ:lent', { organ, hostId: host.id });
    this.ctx.inventory.changed();
    void player;
  }

  recall(organ: Organ, player: PlayerController, silent = false): boolean {
    const host = this.hostById(organ.hostId);
    if (!host) {
      organ.recall();
      return true;
    }
    const reason = host.canRecall(organ.type);
    if (reason) {
      if (!silent) {
        this.toast(reason, 'warn');
        this.ctx.audio.play('denied');
      }
      return false;
    }
    const from = host.socketWorld(organ.type);
    host.detach(organ.type);
    organ.recall();
    const visual = makeOrganVisual(organ.type, false);
    visual.scale.setScalar(0.6);
    visual.position.copy(from);
    this.ctx.root.add(visual);
    this.flights.push({ visual, from, host, organ, t: 0, dur: 0.35, back: true });
    if (!silent) {
      this.ctx.audio.play('recall');
      player.playAction('recall', 0.4);
    }
    this.ctx.events.emit('organ:recalled', { organ });
    this.ctx.inventory.changed();
    return true;
  }

  private completePurify(organ: Organ, player: PlayerController): void {
    organ.purify();
    const wp = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.ctx.effects.burst(wp, '#ffd23a', 20, 4);
    this.ctx.effects.burst(wp, '#22c4c0', 12, 3);
    this.ctx.effects.ring(player.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), '#ffd23a', 3.5);
    this.ctx.audio.loop('purify', false, 'purify');
    this.ctx.audio.play('purifyDone');
    this.ctx.audio.duck(0.4, 1.4);
    player.holdingPurify = false;
    player.action = 'none';
    this.holdT[organ.type] = -10;
    this.ctx.inventory.changed();
    this.ctx.events.emit('organ:purified', { organ });
    this.toast('{organ}! Worn: {ability}', 'good', { organ: tr(organ.def.name), ability: tr(organ.def.wornAbility) });
  }

  private updatePurifyVisual(t: OrganType | null, player: PlayerController, dt: number): void {
    if (t) {
      if (this.purifyType !== t) {
        this.clearPurifyVisual();
        this.purifyType = t;
        this.purifyVisual = makeOrganVisual(t, true);
        this.purifyVisual.scale.setScalar(0.7);
        this.purifyVisual.position.set(0, -0.25, 0);
        player.model.holdAnchor.add(this.purifyVisual);
        player.playAction('purify', 999);
        this.ctx.audio.loop('purify', true, 'purify', 0.9);
      }
      player.holdingPurify = true;
      const p = Math.min(1, this.holdT[t] / ORGAN_DEFS[t].purifyTime);
      if (this.purifyVisual) {
        this.purifyVisual.rotation.y += dt * (3 + p * 12);
        tintOrganVisual(this.purifyVisual, p);
        animateOrganVisual(this.purifyVisual, dt);
        if (Math.random() < 0.4) {
          const w = new THREE.Vector3();
          this.purifyVisual.getWorldPosition(w);
          this.ctx.effects.sparkle(w.add(new THREE.Vector3(0, 0.4, 0)), Math.random() > 0.5 ? '#ffd23a' : '#22c4c0', 1);
        }
      }
    } else if (this.purifyType) {
      this.clearPurifyVisual();
      if (player.holdingPurify) {
        player.holdingPurify = false;
        if (player.action === 'purify') player.action = 'none';
      }
      this.ctx.audio.loop('purify', false, 'purify');
    }
  }

  private clearPurifyVisual(): void {
    this.purifyVisual?.parent?.remove(this.purifyVisual);
    this.purifyVisual = null;
    this.purifyType = null;
  }

  private chomp(player: PlayerController): void {
    this.chompCd = 0.45;
    player.playAction('chomp', 0.3);
    this.ctx.audio.play('chomp');
    const zone = player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(player.forward(), 0.9);
    this.ctx.effects.burst(zone, '#ffb3d1', 5, 2, 0.05);
    let did = false;
    for (const e of this.edibles.near(zone, 1.0, 'wai')) {
      if (e.swallowable && player.mouthful) continue;
      if (e.eat('wai')) {
        did = true;
        if (e.swallowable) {
          player.mouthful = true;
          this.toast('Mouthful! Left-click to SPIT it', 'good');
          this.ctx.inventory.changed();
        }
        break;
      }
    }
    if (!did) {
      for (const d of this.enemiesNear(zone, 1.1)) {
        d.applyDamage({ amount: 20, point: zone, dir: player.forward(), collider: null, kind: 'bite' });
        this.ctx.events.emit('hit:marker', { weak: false, finished: false });
        this.ctx.time.hitstop(0.05);
        did = true;
      }
    }
  }

  clear(): void {
    for (const wo of this.worldOrgans) wo.dispose();
    for (const f of this.flights) this.ctx.root.remove(f.visual);
    this.flights = [];
    this.clearPurifyVisual();
    this.ctx.audio.loop('purify', false, 'purify');
  }
}
