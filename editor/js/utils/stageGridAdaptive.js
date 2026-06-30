import * as THREE from "three";

import {
  STAGE_DISPLAY_GRID_MAJOR_CELL_M,
  getStageGridDisplayFactor,
} from "./motionDisplayUnits.js";

const GRID_MODE_ADAPTIVE = "adaptive";
const GRID_MODE_FIXED = "fixed";

/** 화면에서 굵은 칸이 차지할 목표 픽셀 너비 (적응형) */
const TARGET_PX_PER_MAJOR_CELL = 72;
const MIN_PX_PER_MAJOR = 28;
const MAX_PX_PER_MAJOR = 160;

const NICE_STEPS = [1, 2, 5];

/**
 * 표시 m 기준 1·2·5 × 10^n 으로 스냅 (블렌더류 adaptive grid).
 */
function snapToNiceDisplayMeters(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return STAGE_DISPLAY_GRID_MAJOR_CELL_M;
  }

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

function getCameraGroundDistance(camera, center) {
  return Math.max(camera.position.distanceTo(center), 0.5);
}

function getWorldUnitsPerPixel(camera, distance, viewportHeight) {
  const height = Math.max(viewportHeight, 1);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  return visibleHeight / height;
}

function computeStageGridSizes(editor, camera, center, viewportHeight, mode) {
  const displayFactor = getStageGridDisplayFactor(editor);

  let displayMinor;
  let displayMajor;

  if (mode === GRID_MODE_FIXED) {
    displayMajor = STAGE_DISPLAY_GRID_MAJOR_CELL_M;
    displayMinor = displayMajor / 10;
  } else {
    const distance = getCameraGroundDistance(camera, center);
    const worldPerPixel = getWorldUnitsPerPixel(camera, distance, viewportHeight);
    const refMajorWorld = STAGE_DISPLAY_GRID_MAJOR_CELL_M / displayFactor;
    const pxPerRefMajor = refMajorWorld / worldPerPixel;

    if (pxPerRefMajor >= MIN_PX_PER_MAJOR && pxPerRefMajor <= MAX_PX_PER_MAJOR) {
      displayMajor = STAGE_DISPLAY_GRID_MAJOR_CELL_M;
    } else {
      const worldPerMajorTarget = TARGET_PX_PER_MAJOR_CELL * worldPerPixel;
      const displayPerMajorTarget = worldPerMajorTarget * displayFactor;
      displayMajor = snapToNiceDisplayMeters(displayPerMajorTarget);
    }

    displayMinor = displayMajor / 10;
  }

  const minorWorld = displayMinor / displayFactor;
  const majorWorld = displayMajor / displayFactor;

  return {
    minorWorld,
    majorWorld,
    displayMinor,
    displayMajor,
    mode,
    label: formatGridScaleLabel(displayMajor),
  };
}

function formatGridScaleLabel(displayMeters) {
  if (displayMeters >= 1) {
    const v = displayMeters;
    return Number.isInteger(v) ? `${v} m` : `${v.toFixed(1)} m`;
  }

  if (displayMeters >= 0.01) {
    return `${Math.round(displayMeters * 100)} cm`;
  }

  return `${Math.round(displayMeters * 1000)} mm`;
}

export {
  GRID_MODE_ADAPTIVE,
  GRID_MODE_FIXED,
  computeStageGridSizes,
  formatGridScaleLabel,
  snapToNiceDisplayMeters,
};
