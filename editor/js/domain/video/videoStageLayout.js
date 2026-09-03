import * as THREE from 'three';
import { mapStageScaledPoint, STAGE_CAMERA_PRESETS } from '../stage/CameraPresets.js';
import { getClampedProfileFactors, getStagePivot } from '../stage/stageFloorLayout.js';
import { normalizeStageType } from '../stage/StageTypes.js';

/**
 * v3 screen-bay coords @ V3_FBX_REFERENCE 20×22.5m.
 * Decor hide / occluder XY·Z bands stay on this bay (gray panel + lamps).
 * Restore active plane here if asked: copy into PROSCENIUM_VIDEO.position.
 */
export const PROSCENIUM_VIDEO_SCREEN_BAY = Object.freeze({
  position: [8.243, 65.273, -74.039],
  scale: [374.724, 125.114, 1.0],
});

/** Active video plane — further upstage (−Z) than the FBX screen bay. */
export const PROSCENIUM_VIDEO = Object.freeze({
  // 이전(스크린 개구): position: [8.243, 65.273, -74.039],
  position: [8.243, 65.273, -120],
  scale: [374.724, 125.114, 1.0],
});

export const ARENA_VIDEO = Object.freeze({
  position: [0, 100, 0],
  rotation: [0, Math.PI, 0],
  radius: 80,
  height: 60,
});

/** Tiny pull toward audience — avoid z-fight with hidden panel (not stage-front). */
const Z_FIGHT_EPS = 1.5;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Layout for screen-bay decor hide (not the pushed-back video mesh).
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 */
function getProsceniumVideoLayout(stageManager) {
  const pivot = getStagePivot('proscenium');
  const factors = getClampedProfileFactors(stageManager.profile, 'proscenium');
  const bay = PROSCENIUM_VIDEO_SCREEN_BAY;
  const pos = mapStageScaledPoint(bay.position, pivot, factors);
  return {
    pos,
    halfW: (bay.scale[0] * factors.widthFactor) / 2,
    halfH: (bay.scale[1] * (factors.heightFactor ?? 1)) / 2,
    factors,
  };
}

/**
 * Screen plane band only — excludes building back wall (far upstage, smaller Z).
 * @param {THREE.Vector3} center
 * @param {{ pos: number[], factors: ReturnType<typeof getClampedProfileFactors> }} layout
 * @param {number} [depthFactor=1]
 */
function isNearVideoPlane(center, layout, depthFactor = 1) {
  const zBand = 34 * layout.factors.depthFactor * depthFactor;
  return Math.abs(center.z - layout.pos[2]) <= zBand;
}

/**
 * @param {THREE.Vector3} center
 * @param {{ pos: number[], halfW: number, halfH: number, factors: ReturnType<typeof getClampedProfileFactors> }} layout
 * @param {{ x?: number, y?: number }} [slack]
 */
function isInScreenRect(center, layout, slack = {}) {
  const { pos, halfW, halfH, factors } = layout;
  const xSlack = (slack.x ?? 12) * factors.widthFactor;
  const ySlack = (slack.y ?? 10) * (factors.heightFactor ?? 1);
  return (
    Math.abs(center.x - pos[0]) <= halfW + xSlack &&
    Math.abs(center.y - pos[1]) <= halfH + ySlack
  );
}

/**
 * Gray blank screen panel at the video opening (not building shell elsewhere).
 * @param {THREE.Vector3} size
 * @param {THREE.Vector3} center
 * @param {{ pos: number[], halfW: number, halfH: number, factors: ReturnType<typeof getClampedProfileFactors> }} layout
 */
function isStageVideoScreenWall(size, center, layout) {
  const { factors } = layout;
  if (!isNearVideoPlane(center, layout)) return false;
  if (!isInScreenRect(center, layout)) return false;
  return (
    size.x >= 40 * factors.widthFactor &&
    size.y >= 18 * (factors.heightFactor ?? 1) &&
    size.z <= 55 * factors.depthFactor
  );
}

/**
 * Small lamp/bulb geometry in the screen opening (FBX uses gray material; reads yellow in viewport).
 * @param {THREE.Vector3} size
 * @param {THREE.Vector3} center
 * @param {{ pos: number[], halfW: number, halfH: number, factors: ReturnType<typeof getClampedProfileFactors> }} layout
 */
function isStageLampBulb(size, center, layout) {
  const { pos, factors } = layout;
  const maxDim = Math.max(size.x, size.y, size.z);
  const minDim = Math.min(size.x, size.y, size.z);

  if (maxDim > 24 * factors.widthFactor) return false;
  if (minDim < 0.12) return false;
  if (isStageVideoScreenWall(size, center, layout)) return false;

  // Keep large upstage shell (building back wall panels).
  const footprint = Math.max(size.x, size.z);
  if (
    footprint > 120 * factors.widthFactor &&
    size.y > 40 * (factors.heightFactor ?? 1)
  ) {
    return false;
  }

  if (!isInScreenRect(center, layout, { x: 18, y: 18 })) return false;

  // Bulbs sit in the screen bay — mostly audience-side of the video plane, not deep upstage.
  const zMin = pos[2] - 38 * factors.depthFactor;
  const zMax = pos[2] + 215 * factors.depthFactor;
  return center.z >= zMin && center.z <= zMax;
}

/**
 * @param {import('three').Mesh | import('three').SkinnedMesh} mesh
 */
function isYellowishDecorMaterial(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat?.color) continue;
    mat.color.getHSL(_hsl);
    if (_hsl.h >= 0.07 && _hsl.h <= 0.19 && _hsl.s >= 0.3 && _hsl.l >= 0.2) {
      return true;
    }
    if (mat.emissive) {
      mat.emissive.getHSL(_hsl);
      if (_hsl.h >= 0.07 && _hsl.h <= 0.19 && _hsl.s >= 0.25 && _hsl.l >= 0.15) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {import('three').Mesh | import('three').SkinnedMesh} mesh
 * @param {{ pos: number[], halfW: number, halfH: number, factors: ReturnType<typeof getClampedProfileFactors> }} layout
 */
function shouldHideProsceniumScreenDecor(mesh, layout) {
  _box.setFromObject(mesh);
  _box.getSize(_size);
  _box.getCenter(_center);

  if (isStageVideoScreenWall(_size, _center, layout)) {
    return true;
  }

  if (isStageLampBulb(_size, _center, layout)) {
    return true;
  }

  if (
    isYellowishDecorMaterial(mesh) &&
    isInScreenRect(_center, layout, { x: 22, y: 18 }) &&
    isNearVideoPlane(_center, layout, 6.5)
  ) {
    return true;
  }

  return false;
}

/**
 * @param {THREE.Vector3} size
 * @param {ReturnType<typeof getClampedProfileFactors>} factors
 */
function isLargeFlatScreenOccluder(size, factors) {
  return (
    size.x >= 50 * factors.widthFactor &&
    size.y >= 25 * (factors.heightFactor ?? 1) &&
    size.z <= 55 * factors.depthFactor
  );
}

/**
 * @param {THREE.Raycaster} raycaster
 * @param {import('three').Object3D} root
 * @param {import('three').Intersection[]} hits
 */
function raycastMeshes(raycaster, root, hits) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    THREE.Mesh.prototype.raycast.call(child, raycaster, hits);
  });
}

/**
 * Hide stage video-screen gray panel + yellow bulbs (building back wall stays).
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 */
export function hideProsceniumScreenDecor(stageManager) {
  if (normalizeStageType(stageManager.stageType) !== 'proscenium') return;
  const bg = stageManager.background;
  if (!bg) return;

  stageManager.stageGroup.updateWorldMatrix(true, true);
  const layout = getProsceniumVideoLayout(stageManager);

  bg.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;

    if (child.userData._stageDecorHidden && !shouldHideProsceniumScreenDecor(child, layout)) {
      child.visible = child.userData._stageDecorWasVisible !== false;
      delete child.userData._stageDecorHidden;
      delete child.userData._stageDecorWasVisible;
      return;
    }

    if (!shouldHideProsceniumScreenDecor(child, layout)) return;
    if (child.userData._stageDecorHidden) return;
    child.userData._stageDecorWasVisible = child.visible;
    child.userData._stageDecorHidden = true;
    child.visible = false;
  });
}

/**
 * Blank FBX panels between audience and video (hide while video plane is up).
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {number[]} videoWorldPos
 * @returns {import('three').Object3D[]}
 */
export function findScreenOccluders(stageManager, videoWorldPos) {
  const bg = stageManager.background;
  if (!bg) return [];

  if (normalizeStageType(stageManager.stageType) === 'proscenium') {
    hideProsceniumScreenDecor(stageManager);
  }

  const factors = getClampedProfileFactors(stageManager.profile, stageManager.stageType);
  const pivot = getStagePivot(stageManager.stageType);
  const camPos = mapStageScaledPoint(
    STAGE_CAMERA_PRESETS.audience.position,
    pivot,
    factors,
  );

  stageManager.stageGroup.updateWorldMatrix(true, true);

  _origin.set(camPos[0], camPos[1], camPos[2]);
  _target.set(videoWorldPos[0], videoWorldPos[1], videoWorldPos[2]);
  _dir.subVectors(_target, _origin);
  const dist = _dir.length();
  if (dist < 1e-6) return [];
  _dir.normalize();

  /** @type {Set<import('three').Object3D>} */
  const set = new Set();
  const raycaster = new THREE.Raycaster();
  const rayDepth = dist + 40 * factors.depthFactor;

  if (normalizeStageType(stageManager.stageType) === 'proscenium') {
    const layout = getProsceniumVideoLayout(stageManager);
    const sampleXs = [-0.45, 0, 0.45];
    const sampleYs = [-0.35, 0, 0.35];
    const planeMargin = 20 * factors.depthFactor;

    for (const sx of sampleXs) {
      for (const sy of sampleYs) {
        _target.set(
          layout.pos[0] + sx * layout.halfW * 2,
          layout.pos[1] + sy * layout.halfH * 2,
          layout.pos[2],
        );
        _dir.subVectors(_target, _origin);
        const sampleDist = _dir.length();
        if (sampleDist < 1e-6) continue;
        _dir.normalize();
        raycaster.set(_origin, _dir, 0, sampleDist + planeMargin);
        const hits = [];
        raycastMeshes(raycaster, bg, hits);
        for (const h of hits) {
          if (h.distance <= sampleDist + planeMargin) {
            set.add(h.object);
          }
        }
      }
    }

    bg.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      _box.setFromObject(child);
      _box.getSize(_size);
      _box.getCenter(_center);
      if (isStageVideoScreenWall(_size, _center, layout)) {
        set.add(child);
      }
    });

    return [...set];
  }

  raycaster.set(_origin, _dir, 0, rayDepth);
  const hits = [];
  raycastMeshes(raycaster, bg, hits);

  const videoZ = videoWorldPos[2];
  for (const h of hits) {
    if (h.distance <= dist + 30 * factors.depthFactor) {
      set.add(h.object);
    }
  }

  const zSlack = 40 * factors.depthFactor;
  bg.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    _box.setFromObject(child);
    _box.getSize(_size);
    _box.getCenter(_center);
    if (_center.z < videoZ - zSlack) return;
    if (_center.z > videoZ + 80 * factors.depthFactor) return;
    if (!isLargeFlatScreenOccluder(_size, factors)) return;
    set.add(child);
  });

  return [...set];
}

/**
 * @param {THREE.Mesh} mesh
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @returns {{ occluders: import('three').Object3D[] }}
 */
export function layoutProsceniumVideo(mesh, stageManager) {
  const pivot = getStagePivot('proscenium');
  const factors = getClampedProfileFactors(stageManager.profile, 'proscenium');
  const pos = mapStageScaledPoint(PROSCENIUM_VIDEO.position, pivot, factors);
  // Slightly toward audience (+Z)
  pos[2] += Z_FIGHT_EPS * factors.depthFactor;

  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(
    PROSCENIUM_VIDEO.scale[0] * factors.widthFactor,
    PROSCENIUM_VIDEO.scale[1] * (factors.heightFactor ?? 1),
    PROSCENIUM_VIDEO.scale[2],
  );
  mesh.frustumCulled = false;
  mesh.visible = true;

  if (mesh.parent !== stageManager.stageGroup) {
    stageManager.stageGroup.add(mesh);
  }

  const occludeAt = mapStageScaledPoint(PROSCENIUM_VIDEO.position, pivot, factors);
  return { occluders: findScreenOccluders(stageManager, occludeAt) };
}

/**
 * @param {THREE.Mesh} mesh
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @returns {{ occluders: import('three').Object3D[] }}
 */
export function layoutArenaVideo(mesh, stageManager) {
  const pivot = getStagePivot('arena');
  const factors = getClampedProfileFactors(stageManager.profile, 'arena');
  const pos = mapStageScaledPoint(ARENA_VIDEO.position, pivot, factors);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(...ARENA_VIDEO.rotation);
  mesh.scale.set(
    factors.widthFactor,
    factors.heightFactor ?? 1,
    factors.depthFactor,
  );
  mesh.frustumCulled = false;
  mesh.visible = true;
  if (mesh.parent !== stageManager.stageGroup) {
    stageManager.stageGroup.add(mesh);
  }
  return { occluders: [] };
}

/**
 * @param {THREE.Mesh} mesh
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @returns {{ occluders: import('three').Object3D[] }}
 */
export function attachVideoToStage(mesh, stageManager) {
  const type = normalizeStageType(stageManager.stageType);
  if (type === 'arena') return layoutArenaVideo(mesh, stageManager);
  return layoutProsceniumVideo(mesh, stageManager);
}
