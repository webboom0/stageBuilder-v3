import { ensureWorkLights, setWorkLightLevel } from '../lighting/workLights.js';
import {
  applyHouseLightLevels,
  ensureHouseStageLights,
  readHouseLightLevels,
  readStageGrand,
  readWorkLightLevel,
} from '../lighting/houseStageLights.js';

/**
 * Persist WORK + HOUSE live levels (panel dim without timeline keys).
 * @param {import('three').Scene | null | undefined} scene
 */
export function serializeSceneLighting(scene) {
  if (!scene) return null;
  return {
    workLightLevel: readWorkLightLevel(scene),
    workLightLevelLast: scene.userData?.workLightLevelLast ?? null,
    stageGrand: readStageGrand(scene),
    houseLevels: readHouseLightLevels(scene),
  };
}

/**
 * Restore WORK + HOUSE live levels after scene tracks load.
 * @param {import('three').Scene} scene
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {ReturnType<typeof serializeSceneLighting>} data
 */
export function applySceneLighting(scene, stageManager, data) {
  if (!scene || !data || typeof data !== 'object') return;

  ensureWorkLights(scene);
  ensureHouseStageLights(stageManager);
  if (!scene.userData) scene.userData = {};

  const last = Number(data.workLightLevelLast);
  if (Number.isFinite(last)) {
    scene.userData.workLightLevelLast = last;
  }

  const grand = Number(data.stageGrand);
  if (Number.isFinite(grand)) {
    scene.userData.stageGrand = grand;
  }

  const workLevel = Math.max(0, Math.min(1, Number(data.workLightLevel) || 0));
  setWorkLightLevel(scene, workLevel);

  if (data.houseLevels && typeof data.houseLevels === 'object') {
    applyHouseLightLevels(scene, data.houseLevels, stageManager);
  }
}
