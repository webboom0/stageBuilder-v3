import * as THREE from 'three';
import { getStageWorldPerMeter } from './stageGridAdaptive.js';

/** Default adult height on stage (meters) — 170cm (UI / userData). */
export const DEFAULT_HUMAN_HEIGHT_M = 1.7;

/**
 * Visual scale vs strict floor m↔world (1m grid).
 * FBX hall is authored large — at 1.0 people look ~1.7 grid cells tall.
 * 0.24 → ~0.41m on the 1m grid (170cm label in Properties) so 16×13.5m(216㎡)
 * can read as ~100–200 person choreography / chorus density.
 */
export const HUMAN_STAGE_SCALE = 0.24;

/** Default line-formation center spacing on the floor (meters). */
export const HUMAN_FORMATION_SPACING_M = 0.7;

/**
 * Scale an Object3D so its bounding-box height matches `targetWorldHeight`
 * (Three.js world units). Pass `resolveHumanWorldHeight(stage)`.
 *
 * @param {THREE.Object3D} object
 * @param {number} targetWorldHeight
 * @returns {number} applied scale factor
 */
export function scaleToHumanHeight(object, targetWorldHeight = 45) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = size.y;
  if (height <= 1e-6) return 1;

  const factor = targetWorldHeight / height;
  object.scale.multiplyScalar(factor);

  object.updateMatrixWorld(true);
  const boxAfter = new THREE.Box3().setFromObject(object);
  object.position.y -= boxAfter.min.y;

  return factor;
}

/**
 * World-unit height for a human standing on the current stage.
 * labeledM × worldPerMeter × HUMAN_STAGE_SCALE.
 *
 * @param {import('./StageManager.js').StageManager | null} stageManager
 * @param {number} [humanHeightM]
 * @returns {number}
 */
export function resolveHumanWorldHeight(stageManager, humanHeightM) {
  const m = Number.isFinite(humanHeightM) && humanHeightM > 0
    ? humanHeightM
    : (stageManager?.profile?.humanHeightM ?? DEFAULT_HUMAN_HEIGHT_M);
  return m * getStageWorldPerMeter(stageManager) * HUMAN_STAGE_SCALE;
}

/**
 * Line formation spacing in world units (~0.7m on floor grid).
 * @param {import('./StageManager.js').StageManager | null} stageManager
 * @param {number} [spacingM]
 */
export function getHumanFormationSpacingWorld(stageManager, spacingM = HUMAN_FORMATION_SPACING_M) {
  return spacingM * getStageWorldPerMeter(stageManager);
}

/** Display / Properties m ↔ mesh world (matches spawn scale). */
export function getHumanWorldPerMeter(stageManager) {
  return getStageWorldPerMeter(stageManager) * HUMAN_STAGE_SCALE;
}

/** @param {number} cm @returns {number} meters */
export function cmToMeters(cm) {
  return cm / 100;
}
