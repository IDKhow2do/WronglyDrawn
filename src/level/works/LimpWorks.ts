/**
 * [INPUT]: depends on buildAtmosphere/finishFloor/WorksLists from ./WorksShell; the four floor builders (ConveyorHall,
 *          StampingFloor, Archive, Roof); buildLift/buildInspector/buildArchivist from ./Guardians; WORKS/FY/floorOf/inRect from
 *          ./WorksLayout; HostDef/OrganHost/UndrawnSolid via the session's LevelApi; Shoutable from ../harbor/Shout
 * [OUTPUT]: exports LIMP (spawn/kill/arena for levels.ts and the session), worksTitlePose() (the roof), worksIntroPose() (the hall), buildLimpWorks() → WorksBuilt
 * [POS]: level 3's geometry root. Builds the tower floor by floor (each floor one culling group), lets the Guardians
 *        add their models before each floor is flushed into a few batched meshes, and decides every frame which
 *        floors are drawn (the one WAI/the camera is on, plus a neighbour by a stair or the lift) and when the open sky is
 *        (the roof, or F1 while the tower door stands open in the intro). WorksDirector owns
 *        the gameplay; WorksSession owns the player and the systems.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { HostDef, OrganHost } from '../../hosts/OrganHost';
import type { UndrawnSolid } from '../../hosts/Undrawn';
import type { Shoutable } from '../harbor/Shout';
import { buildConveyorHall, type BuiltHall } from './ConveyorHall';
import { buildStampingFloor, type BuiltStamping } from './StampingFloor';
import { buildArchive, type BuiltArchive } from './Archive';
import { buildRoof, type BuiltRoof } from './Roof';
import { buildArchivist, buildInspector, buildLift, type Archivist, type FreightLift, type Inspector } from './Guardians';
import { ensureWorksTextures } from './WorksTextures';
import { ensureKitTextures } from '../harbor/HarborKit';
import { buildAtmosphere, finishFloor, type FloorBuild, type WorksLists } from './WorksShell';
import { FY, IN, WORKS, floorOf, inRect } from './WorksLayout';

export const LIMP = {
  spawn: WORKS.spawn,
  spawnYaw: WORKS.spawnYaw,
  killY: WORKS.killY,
  arena: WORKS.arena,
  arenaR: WORKS.arenaR,
};

/**
 * The title-screen drift: on the ROOF, low by the west rim of the painted circle, the Red Pen standing right of the logo
 * against the drawn city. Not in the Conveyor Hall: the shredder hopper hangs across the whole hall (x −8.3..8.3, from
 * 5.2 m up) and filled the frame behind the logo from every spot on F1.
 */
export function worksTitlePose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
  const sx = Math.sin(time * 0.16);
  const sy = Math.sin(time * 0.23 + 1.3);
  return {
    pos: new THREE.Vector3(-12 + sx * 1.2, FY[3] + 1.8 + sy * 0.2, 12 - sx * 0.3),
    look: new THREE.Vector3(-9 + sx * 0.8, FY[3] + 5.5 + sy * 0.2, -8),
    fov: 56 + Math.sin(time * 0.11) * 1.2,
  };
}

/** Where the push-in to WAI starts (a cut from the roof title, under the bursting title stickers): inside the tower door. */
export function worksIntroPose(): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
  return { pos: new THREE.Vector3(-4.5, 3.6, 21), look: new THREE.Vector3(1, 1.4, 8), fov: 56 };
}

export interface WorksApi {
  addHost(def: HostDef): OrganHost;
  addUndrawn(id: string, center: THREE.Vector3, half: THREE.Vector3): UndrawnSolid;
}

export interface WorksBuilt extends WorksLists {
  hall: BuiltHall;
  stamping: BuiltStamping;
  archive: BuiltArchive;
  roof: BuiltRoof;
  lift: FreightLift;
  inspector: Inspector;
  archivist: Archivist;
  floors: FloorBuild[];
  shoutables: Shoutable[];
  /** Which floors were drawn this frame (bit i = floor i). */
  readonly shown: number;
  /** Is floor i drawn this frame? */
  floorShown(i: number): boolean;
  update(dt: number, player: THREE.Vector3, camPos: THREE.Vector3): void;
}

export function buildLimpWorks(ctx: GameContext, api: WorksApi): WorksBuilt {
  const L: WorksLists = { crowns: [], drops: [], checkpoints: [], regions: [] };
  ensureWorksTextures(ctx.assets);
  ensureKitTextures(ctx.assets); // (the creatures borrow a few brushed harbour paints)
  const air = buildAtmosphere(ctx);
  const hall = buildConveyorHall(ctx, L);
  const stamping = buildStampingFloor(ctx, L, api.addUndrawn);
  const archive = buildArchive(ctx, L);
  const roof = buildRoof(ctx, L);
  const lift = buildLift(ctx, hall.f, api.addHost);
  const inspector = buildInspector(ctx, stamping.f, api.addHost);
  const archivist = buildArchivist(ctx, archive.f, api.addHost);
  const floors = [hall.f, stamping.f, archive.f, roof.f];
  finishFloor(hall.f);
  finishFloor(stamping.f, [stamping.f.mats.mesh]);
  finishFloor(archive.f, [archive.f.mats.mesh]);
  finishFloor(roof.f);

  let time = 0;
  let shown = 0b1111;
  // portal zones: near a stair or riding the lift, the neighbouring floor is drawn too
  const stair2Zone = { x0: -IN, x1: -14.5, z0: -14, z1: 11 };
  const stair3Zone = { x0: -9, x1: 15.5, z0: 15.2, z1: IN };
  const self: WorksBuilt = {
    ...L,
    hall,
    stamping,
    archive,
    roof,
    lift,
    inspector,
    archivist,
    floors,
    shoutables: [archivist.shoutable],
    get shown() {
      return shown;
    },
    floorShown: (i) => (shown & (1 << i)) !== 0,
    update(dt, p, camPos) {
      time += dt;
      // ── floor culling ──
      let m = 0;
      const fp = floorOf(p.y), fc = floorOf(camPos.y);
      m |= 1 << fp;
      m |= 1 << fc;
      if (lift.riding || (inRect(WORKS.shaft, p.x, p.z, 2.5) && p.y < FY[1] + 4)) m |= 0b11;
      if (inRect(stair2Zone, p.x, p.z) && p.y > FY[1] - 0.5 && p.y < FY[2] + 3) m |= 0b110;
      if (inRect(stair3Zone, p.x, p.z) && p.y > FY[2] - 0.5) m |= 0b1100;
      shown = m;
      for (let i = 0; i < floors.length; i++) floors[i].group.visible = (m & (1 << i)) !== 0;
      // open sky: on the roof, and through F1's tower door while it stands open (the intro: the way in)
      air.sky.visible = air.city.visible = (m & 0b1000) !== 0 || ((m & 1) !== 0 && hall.doorK > 0);
      // ── floors ──
      if (m & 1) hall.update(dt, time);
      lift.update(dt);
      archivist.update(dt, time);
      archive.update(dt, time);
      if (m & 0b1000) roof.update(dt, time);
      for (const c of L.crowns) c.update(dt, camPos);
    },
  };
  return self;
}
