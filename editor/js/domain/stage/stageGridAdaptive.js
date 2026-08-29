import * as THREE from 'three';
import { V3_FBX_REFERENCE } from './StageProfile.js';
import { V3_PROSCENIUM_FLOOR, getClampedProfileFactors } from './stageFloorLayout.js';
import { normalizeStageType } from './StageTypes.js';

export const GRID_MODE_ADAPTIVE = 'adaptive';
export const GRID_MODE_FIXED = 'fixed';
export const GRID_MODE_GRID_HELPER = 'gridHelper';

/** @param {string} mode */
export function normalizeGridMode(mode) {
  if (mode === GRID_MODE_FIXED) return GRID_MODE_FIXED;
  if (mode === GRID_MODE_GRID_HELPER) return GRID_MODE_GRID_HELPER;
  return GRID_MODE_ADAPTIVE;
}

/** 표시 m 기준 굵은 칸 = 1m (v3 STAGE_DISPLAY_GRID_MAJOR_CELL_M) */
export const STAGE_DISPLAY_GRID_MAJOR_CELL_M = 1;

const TARGET_PX_PER_MAJOR_CELL = 72;
const MIN_PX_PER_MAJOR = 28;
const MAX_PX_PER_MAJOR = 160;
const NICE_STEPS = [1, 2, 5];

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function snapToNiceDisplayMeters(value) {
  if (!Number.isFinite(value) || value <= 0) return STAGE_DISPLAY_GRID_MAJOR_CELL_M;
  const exponent = Math.floor(Math.log10(value));
  const scale = Math.pow(10, exponent);
  const fraction = value / scale;
  let step = NICE_STEPS[NICE_STEPS.length - 1];
  for (let i = 0; i < NICE_STEPS.length; i++) {
    if (fraction <= NICE_STEPS[i] * 1.25) {
      step = NICE_STEPS[i];
      break;
    }
  }
  return step * scale;
}

export { snapToNiceDisplayMeters };

/** Fallback — full floor plate at V3 reference */
export function getDefaultWorldPerMeter() {
  const [gw] = V3_PROSCENIUM_FLOOR.geometry;
  const [sx] = V3_PROSCENIUM_FLOOR.scale;
  return (gw * sx) / V3_FBX_REFERENCE.widthM;
}

/**
 * World units per meter for grid / formation / human scale.
 * Uses the v3 proscenium floor plate as the canonical meter ruler so proscenium
 * and arena share the same character size at the same profile W×D (arena circle
 * mesh is smaller in world units but must not shrink performers).
 *
 * @param {import('./StageManager.js').StageManager | null} stageManager
 */
export function getStageWorldPerMeter(stageManager) {
  const profile = stageManager?.profile;
  if (!profile?.widthM) {
    return getDefaultWorldPerMeter();
  }

  const stageType = normalizeStageType(stageManager?.stageType ?? 'proscenium');
  const factors = getClampedProfileFactors(profile, stageType);
  const [gw] = V3_PROSCENIUM_FLOOR.geometry;
  const [sx] = V3_PROSCENIUM_FLOOR.scale;
  const plateWorldWidth = gw * sx * factors.widthFactor;
  const perM = plateWorldWidth / profile.widthM;

  if (!Number.isFinite(perM) || perM < 1e-6) {
    return getDefaultWorldPerMeter();
  }
  return perM;
}

/**
 * @param {import('./StageManager.js').StageManager | null} stageManager
 */
export function getStageDeckWorldY(stageManager) {
  const floor = stageManager?.floor;
  if (!floor) return 0.02;
  floor.updateWorldMatrix(true, true);
  _box.setFromObject(floor);
  if (_box.isEmpty()) return 0.02;
  return _box.max.y + 0.02;
}

/**
 * @param {import('./StageManager.js').StageManager | null} stageManager
 * @param {THREE.Vector3} out
 */
export function getStageDeckCenter(stageManager, out = _center) {
  const floor = stageManager?.floor;
  if (!floor) {
    out.set(0, 0, 0);
    return out;
  }
  floor.updateWorldMatrix(true, true);
  _box.setFromObject(floor);
  if (_box.isEmpty()) {
    out.set(0, 0, 0);
    return out;
  }
  _box.getCenter(out);
  out.y = 0;
  return out;
}

function getWorldUnitsPerPixel(camera, distance, viewportHeight) {
  const height = Math.max(viewportHeight, 1);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  return visibleHeight / height;
}

export function formatGridScaleLabel(displayMeters) {
  if (displayMeters >= 1) {
    return Number.isInteger(displayMeters)
      ? `${displayMeters} m`
      : `${displayMeters.toFixed(1)} m`;
  }
  if (displayMeters >= 0.01) return `${Math.round(displayMeters * 100)} cm`;
  return `${Math.round(displayMeters * 1000)} mm`;
}

/**
 * @param {{
 *   stageManager: import('./StageManager.js').StageManager | null,
 *   camera: THREE.PerspectiveCamera,
 *   lookTarget?: THREE.Vector3,
 *   viewportHeight: number,
 *   mode: string,
 * }} opts
 */
export function computeStageGridSizes(opts) {
  const {
    stageManager,
    camera,
    lookTarget,
    viewportHeight,
    mode,
  } = opts;

  const worldPerMeter = getStageWorldPerMeter(stageManager);
  const center = lookTarget?.clone?.() ?? getStageDeckCenter(stageManager);

  let displayMajor;
  let displayMinor;

  if (mode === GRID_MODE_GRID_HELPER) {
    return {
      minorWorld: 0,
      majorWorld: 0,
      displayMinor: 0,
      displayMajor: STAGE_DISPLAY_GRID_MAJOR_CELL_M,
      worldPerMeter: getStageWorldPerMeter(stageManager),
      mode,
      label: 'GridHelper',
    };
  }

  if (mode === GRID_MODE_FIXED) {
    displayMajor = STAGE_DISPLAY_GRID_MAJOR_CELL_M;
    displayMinor = displayMajor / 10;
  } else {
    const distance = Math.max(camera.position.distanceTo(center), 0.5);
    const worldPerPixel = getWorldUnitsPerPixel(camera, distance, viewportHeight);
    const refMajorWorld = STAGE_DISPLAY_GRID_MAJOR_CELL_M * worldPerMeter;
    const pxPerRefMajor = refMajorWorld / worldPerPixel;

    if (pxPerRefMajor >= MIN_PX_PER_MAJOR && pxPerRefMajor <= MAX_PX_PER_MAJOR) {
      displayMajor = STAGE_DISPLAY_GRID_MAJOR_CELL_M;
    } else {
      const worldPerMajorTarget = TARGET_PX_PER_MAJOR_CELL * worldPerPixel;
      displayMajor = snapToNiceDisplayMeters(worldPerMajorTarget / worldPerMeter);
    }
    displayMinor = displayMajor / 10;
  }

  return {
    minorWorld: displayMinor * worldPerMeter,
    majorWorld: displayMajor * worldPerMeter,
    displayMinor,
    displayMajor,
    worldPerMeter,
    mode,
    label: formatGridScaleLabel(displayMajor),
  };
}
