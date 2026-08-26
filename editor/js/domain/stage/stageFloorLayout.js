import { V3_FBX_REFERENCE } from './StageProfile.js';
import { normalizeStageType } from './StageTypes.js';

/** v3 VideoEdit.createFloor — proscenium base (V3_FBX_REFERENCE 20×22.5m = 1.0×) */
export const V3_PROSCENIUM_FLOOR = Object.freeze({
  geometry: [147.446, 1, 111.747],
  position: [74, -4.163, 0],
  scale: [5.5, 6.779, 3.0],
});

/** Scale pivot — building + floor expand together around this point */
export const STAGE_PIVOT = Object.freeze({
  proscenium: [74, 0, 0],
  arena: [0, 0, 0],
});

/**
 * Meter limits — typical hall range (15~20m × 10~14.5m) + v3 FBX shell cap
 * (measure-stage-bounds.mjs @ V3_FBX_REFERENCE 20×22.5m).
 */
export const STAGE_PROFILE_LIMITS = Object.freeze({
  proscenium: Object.freeze({
    minWidthM: 15,
    maxWidthM: 20,
    minDepthM: 10,
    maxDepthM: 23,
  }),
  arena: Object.freeze({
    minWidthM: 15,
    maxWidthM: 21,
    minDepthM: 10,
    maxDepthM: 23.6,
  }),
});

/** @param {import('./StageTypes.js').StageTypeId | string} stageType */
export function getProfileLimits(stageType) {
  return STAGE_PROFILE_LIMITS[normalizeStageType(stageType)];
}

/**
 * Profile W×D maps to the **full floor plate** (v3 FBX authored at 20×22.5m = 1×).
 * Y stays 1 so the hall shell / audience rake keep authored proportions —
 * people are sized down separately (HumanScale), not by warping the building.
 *
 * @param {{ widthM: number, depthM: number }} profile
 * @param {{ widthM: number, depthM: number }} [reference]
 */
export function profileFloorFactors(profile, reference = V3_FBX_REFERENCE) {
  return {
    widthFactor: profile.widthM / reference.widthM,
    depthFactor: profile.depthM / reference.depthM,
    heightFactor: 1,
  };
}

/**
 * @param {{ widthM: number, depthM: number }} profile
 * @param {import('./StageTypes.js').StageTypeId | string} stageType
 * @param {{ widthM: number, depthM: number }} [reference]
 */
export function getClampedProfileFactors(profile, stageType, reference = V3_FBX_REFERENCE) {
  const limits = getProfileLimits(stageType);
  const effectiveWidthM = Math.min(limits.maxWidthM, Math.max(limits.minWidthM, profile.widthM));
  const effectiveDepthM = Math.min(limits.maxDepthM, Math.max(limits.minDepthM, profile.depthM));

  return {
    widthFactor: effectiveWidthM / reference.widthM,
    depthFactor: effectiveDepthM / reference.depthM,
    /** Never stretch Y — FBX audience / portal proportions stay stable */
    heightFactor: 1,
    effectiveWidthM,
    effectiveDepthM,
    limits,
    clamped:
      effectiveWidthM !== profile.widthM ||
      effectiveDepthM !== profile.depthM,
  };
}

/** @param {import('./StageTypes.js').StageTypeId | string} stageType */
export function getStagePivot(stageType) {
  const type = normalizeStageType(stageType);
  const [x, y, z] = STAGE_PIVOT[type];
  return { x, y, z };
}

/** Proscenium floor top surface Y (local to pivot) */
export function prosceniumFloorSurfaceY() {
  const [, posY] = V3_PROSCENIUM_FLOOR.position;
  const [, geoH] = V3_PROSCENIUM_FLOOR.geometry;
  const scaleY = V3_PROSCENIUM_FLOOR.scale[1];
  return posY + (geoH * scaleY) / 2;
}

/** @param {[number, number, number]} worldPos @param {{ x: number, y: number, z: number }} pivot */
export function worldToPivotLocal(worldPos, pivot) {
  return [
    worldPos[0] - pivot.x,
    worldPos[1] - pivot.y,
    worldPos[2] - pivot.z,
  ];
}
