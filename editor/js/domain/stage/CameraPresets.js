import * as THREE from 'three';
import { normalizeStageType } from './StageTypes.js';
import { getClampedProfileFactors, getStagePivot, STAGE_PIVOT } from './stageFloorLayout.js';
import { getStageDeckWorldY } from './stageGridAdaptive.js';
import { V3_FBX_REFERENCE } from './StageProfile.js';

/**
 * @typedef {'perspective' | 'audience' | 'front' | 'right' | 'left' | 'top'} CameraPresetId
 */

/**
 * v3 stageCameraView.js — world coords at shell scale (1,1,1).
 * Positions map through pivot × profile scale; audience/front use rotation only (no lookAt).
 */
export const STAGE_CAMERA_PRESETS = Object.freeze({
  perspective: {
    position: [0, 126.461, 252.922],
    rotation: [-26.57 * (Math.PI / 180), 0, 0],
    lookAt: [0, 0, 0],
  },
  audience: {
    position: [0, 46.38, 365],
    rotation: [0, 0, 0],
  },
  front: {
    position: [0, 11.66, 284.553],
    rotation: [0, 0, 0],
  },
  right: {
    position: [151.409, 11.793, -1.179],
    rotation: [0, Math.PI / 2, 0],
  },
  left: {
    position: [-151.409, 11.793, -1.179],
    rotation: [0, -Math.PI / 2, 0],
  },
  top: {
    position: [0, 125.282, 0.012],
    rotation: [-Math.PI / 2, 0, 0],
    lookAt: [0, 0, 0],
  },
});

/** Arena stage load default — v3 VideoEdit changeStage */
export const ARENA_CAMERA_DEFAULT = Object.freeze({
  position: [0, 126.461, 262.92],
  rotation: [-26.57 * (Math.PI / 180), 0, 0],
  lookAt: [0, 20, 0],
});

/**
 * Map a v3 world point through the same pivot × scale as StageScaled.
 * @param {number[]} pos
 * @param {{ x: number, y: number, z: number }} pivot
 * @param {{ widthFactor: number, depthFactor: number, heightFactor?: number }} factors
 */
export function mapStageScaledPoint(pos, pivot, factors) {
  const hy = factors.heightFactor ?? 1;
  return [
    pivot.x + (pos[0] - pivot.x) * factors.widthFactor,
    pivot.y + (pos[1] - pivot.y) * hy,
    pivot.z + (pos[2] - pivot.z) * factors.depthFactor,
  ];
}

/**
 * Stage focus for lookAt — scaled v3 point; Y lifted to deck when floor exists.
 * X/Z stay on the authored sightline (do not snap to floor bbox — that skews audience view).
 */
function resolveLookAtWorld(stageManager, lookAtAuthored, factors, pivot) {
  const hy = factors.heightFactor ?? 1;
  const mapped = mapStageScaledPoint(lookAtAuthored, pivot, factors);
  const deckY = stageManager?.floor ? getStageDeckWorldY(stageManager) : 0;
  mapped[1] = deckY + Math.max(0, lookAtAuthored[1]) * hy;
  return new THREE.Vector3(mapped[0], mapped[1], mapped[2]);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
 * @param {{ position: number[], rotation: number[], lookAt?: number[] }} preset
 * @param {{ widthFactor: number, depthFactor: number, heightFactor?: number }} factors
 * @param {{ x: number, y: number, z: number }} pivot
 * @param {import('./StageManager.js').StageManager | null | undefined} stageManager
 * @param {CameraPresetId | string} [presetId]
 */
function applyV3CameraPreset(camera, controls, preset, factors, pivot, stageManager, presetId = '') {
  const pos = mapStageScaledPoint(preset.position, pivot, factors);
  camera.position.set(pos[0], pos[1], pos[2]);

  if (preset.lookAt) {
    const look = resolveLookAtWorld(stageManager, preset.lookAt, factors, pivot);
    controls.target.copy(look);
    camera.lookAt(look);
  } else {
    camera.rotation.set(preset.rotation[0], preset.rotation[1], preset.rotation[2]);
    const span = 200 * Math.max(
      factors.widthFactor,
      factors.depthFactor,
      factors.heightFactor ?? 1,
    );
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, span);
  }

  if (presetId === 'top') {
    camera.up.set(0, 0, -1);
  } else {
    camera.up.set(0, 1, 0);
  }

  camera.fov = 50;
  camera.near = 0.05;
  camera.far = 20000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
  controls.update();
}

/**
 * @param {CameraPresetId} presetId
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
 * @param {import('./StageTypes.js').StageTypeId | string} stageType
 * @param {{ widthM: number, depthM: number }} [profile]
 * @param {import('./StageManager.js').StageManager | null} [stageManager]
 */
export function applyCameraPreset(
  presetId,
  camera,
  controls,
  stageType,
  profile = V3_FBX_REFERENCE,
  stageManager = null,
) {
  const type = normalizeStageType(stageType);
  const factors = getClampedProfileFactors(profile, type);
  const pivot = getStagePivot(type);

  let preset = STAGE_CAMERA_PRESETS[presetId] ?? STAGE_CAMERA_PRESETS.front;

  if (type === 'arena' && (presetId === 'perspective' || presetId === 'audience')) {
    preset = {
      position: [...ARENA_CAMERA_DEFAULT.position],
      rotation: [...ARENA_CAMERA_DEFAULT.rotation],
      lookAt: [...ARENA_CAMERA_DEFAULT.lookAt],
    };
  }

  applyV3CameraPreset(camera, controls, preset, factors, pivot, stageManager, presetId);
}

/** Initial view after stage load — v3 uses audience coords on proscenium load */
export function applyDefaultStageCamera(
  camera,
  controls,
  stageType,
  profile = V3_FBX_REFERENCE,
  stageManager = null,
) {
  const type = normalizeStageType(stageType);
  if (type === 'arena') {
    applyCameraPreset('perspective', camera, controls, type, profile, stageManager);
    return;
  }
  applyCameraPreset('audience', camera, controls, type, profile, stageManager);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
 * @param {number} delta — positive = zoom in
 */
export function zoomCamera(camera, controls, delta) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  camera.position.addScaledVector(direction, delta);
  controls.update();
}
