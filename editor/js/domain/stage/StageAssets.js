import { FILES_BASE } from '../../config/app-config.js';
import { normalizeStageType } from './StageTypes.js';

/** @typedef {import('./StageTypes.js').StageTypeId} StageTypeId */

/** @type {Record<StageTypeId, string>} */
export const STAGE_FBX_URL = Object.freeze({
  proscenium: `${FILES_BASE}/stage/background.fbx`,
  arena: `${FILES_BASE}/stage/arena_stage.fbx`,
});

/** v3 VideoEdit.js — building shell transform per stage type */
/** @type {Record<StageTypeId, { position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] }>} */
export const STAGE_BACKGROUND_TRANSFORM = Object.freeze({
  proscenium: {
    position: [228.340, -125.909, 764.44],
    rotation: [-Math.PI / 2, 0, Math.PI / 2],
    scale: [0.6, 0.6, 0.4],
  },
  arena: {
    position: [-752.465, 318.258, 830.285],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [0.130, 0.130, 0.220],
  },
});

/** @param {StageTypeId | string} type */
export function getStageFbxUrl(type) {
  const id = normalizeStageType(type);
  return STAGE_FBX_URL[id];
}
