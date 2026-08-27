import * as THREE from 'three';
import { mapStageScaledPoint, STAGE_CAMERA_PRESETS } from '../stage/CameraPresets.js';
import { getClampedProfileFactors, getStagePivot } from '../stage/stageFloorLayout.js';
import { normalizeStageType } from '../stage/StageTypes.js';

/** v3 VideoBackground.js @ V3_FBX_REFERENCE 20×22.5m */
export const PROSCENIUM_VIDEO = Object.freeze({
  position: [8.243, 65.273, -74.039],
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
 * Blank FBX panels between audience and video (hide while video plane is up).
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {number[]} videoWorldPos
 * @returns {import('three').Object3D[]}
 */
export function findScreenOccluders(stageManager, videoWorldPos) {
  const bg = stageManager.background;
  if (!bg) return [];

  const factors = getClampedProfileFactors(stageManager.profile, stageManager.stageType);
  const pivot = getStagePivot(stageManager.stageType);
  const camPos = mapStageScaledPoint(
    STAGE_CAMERA_PRESETS.audience.position,
    pivot,
    factors,
  );

  stageManager.stageGroup.updateWorldMatrix(true, true);

  const origin = new THREE.Vector3(camPos[0], camPos[1], camPos[2]);
  const target = new THREE.Vector3(videoWorldPos[0], videoWorldPos[1], videoWorldPos[2]);
  const dir = target.clone().sub(origin);
  const dist = dir.length();
  if (dist < 1e-6) return [];
  dir.normalize();

  const raycaster = new THREE.Raycaster(origin, dir, 0, dist + 40 * factors.depthFactor);
  const hits = [];
  raycastMeshes(raycaster, bg, hits);

  const videoZ = videoWorldPos[2];
  /** @type {Set<import('three').Object3D>} */
  const set = new Set();

  // Hide everything the audience ray hits up to (and just past) the video plane.
  for (const h of hits) {
    if (h.distance <= dist + 30 * factors.depthFactor) {
      set.add(h.object);
    }
  }

  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const zSlack = 40 * factors.depthFactor;
  bg.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    _box.setFromObject(child);
    _box.getSize(_size);
    _box.getCenter(_center);
    // In front of / at video (toward audience = larger Z), not far upstage behind.
    if (_center.z < videoZ - zSlack) return;
    if (_center.z > videoZ + 80 * factors.depthFactor) return;
    if (_size.x < 50 * factors.widthFactor) return;
    if (_size.y < 25 * (factors.heightFactor ?? 1)) return;
    if (_size.z > 55 * factors.depthFactor) return;
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
