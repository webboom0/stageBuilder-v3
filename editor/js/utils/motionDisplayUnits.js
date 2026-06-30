import * as THREE from "three";

/**
 * 스테이지에 배치된 콘텐츠(모션·메쉬·로드 에셋 등)의 크기 표기.
 * 모션 로드 직후 월드 높이 = 기준 → UI 1.7m. 무대(_Stage·바닥 등)는 제외.
 * 실제 월드 스케일은 변경하지 않음.
 */
export const MOTION_DISPLAY_REFERENCE_HEIGHT = 1.7;
export const MOTION_WORLD_REFERENCE_HEIGHT_DEFAULT = 27;

/**
 * 속성창 크기(m)와 같은 표시 m 기준 격자 칸 너비.
 * 굵은 칸 = 1m 사각형 (1m 박스가 바닥에서 굵은 칸 1×1).
 */
export const STAGE_DISPLAY_GRID_MAJOR_CELL_M = 1;
/** 얇은 칸 (같은 1m 안을 나누지 않음 — 굵은 칸과 동일 간격, 선만 옅게) */
export const STAGE_DISPLAY_GRID_CELL_M = 1;

const STAGE_INFRA_NAMES = new Set([
  "Stage",
  "_Background",
  "_Floor",
]);

const HELPER_TYPES = new Set([
  "GridHelper",
  "PolarGridHelper",
  "AxesHelper",
  "Box3Helper",
  "CameraHelper",
  "DirectionalLightHelper",
  "PointLightHelper",
  "SpotLightHelper",
  "HemisphereLightHelper",
  "SkeletonHelper",
  "ArrowHelper",
  "PlaneHelper",
]);

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

function findRootBySource(object, source) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.source === source) return o;
    o = o.parent;
  }
  return null;
}

function getMotionRoot(object) {
  return findRootBySource(object, "motion");
}

function getMeshRoot(object) {
  return findRootBySource(object, "mesh");
}

function isExcludedFromStageDisplay(object, editor) {
  if (!object || !editor) return true;
  if (object === editor.scene) return true;
  if (object === editor.camera) return true;
  if (object.isCamera || object.isLight) return true;
  if (object.isBone) return true;
  if (HELPER_TYPES.has(object.type)) return true;
  if (object.userData?.excludeFromDisplayUnits === true) return true;

  let o = object;
  while (o) {
    if (o === editor.sceneHelpers) return true;
    if (STAGE_INFRA_NAMES.has(o.name)) return true;
    o = o.parent;
  }

  return false;
}

/**
 * 크기 표기·편집 대상 루트 (씬에 올라온 사용자 콘텐츠).
 */
function getDisplayRoot(object, editor) {
  if (!object || !editor) return null;

  const tagged = getMotionRoot(object) || getMeshRoot(object);
  if (tagged && !isExcludedFromStageDisplay(tagged, editor)) return tagged;

  let root = object;
  while (root.parent && root.parent !== editor.scene) {
    if (STAGE_INFRA_NAMES.has(root.parent.name)) return null;
    if (root.parent === editor.sceneHelpers) return null;
    root = root.parent;
  }

  if (root.parent !== editor.scene) return null;
  if (isExcludedFromStageDisplay(root, editor)) return null;

  return root;
}

function isMotionObject(object) {
  return getMotionRoot(object) !== null;
}

function isMeshObject(object) {
  return getMeshRoot(object) !== null;
}

function usesStageDisplayUnits(object, editor) {
  return getDisplayRoot(object, editor) !== null;
}

/** @deprecated alias */
const usesMotionDisplayUnits = usesStageDisplayUnits;

function getMotionWorldHeight(object, editor) {
  const root = getDisplayRoot(object, editor) || object;
  _box.setFromObject(root, true);
  return _box.getSize(_size).y;
}

function getSceneMotionDisplayFactor(editor, object = null) {
  const scene = editor?.scene;
  const sceneFactor = scene?.userData?.motionDisplayFactor;
  if (typeof sceneFactor === "number" && sceneFactor > 0) {
    return sceneFactor;
  }

  const sceneRef = scene?.userData?.motionWorldReferenceHeight;
  if (typeof sceneRef === "number" && sceneRef > 1e-6) {
    return MOTION_DISPLAY_REFERENCE_HEIGHT / sceneRef;
  }

  const motionRoot = getMotionRoot(object);
  const rootRef = motionRoot?.userData?.motionWorldReferenceHeight;
  if (typeof rootRef === "number" && rootRef > 1e-6) {
    return MOTION_DISPLAY_REFERENCE_HEIGHT / rootRef;
  }

  return (
    MOTION_DISPLAY_REFERENCE_HEIGHT / MOTION_WORLD_REFERENCE_HEIGHT_DEFAULT
  );
}

/** @deprecated alias */
const getMotionDisplayFactor = getSceneMotionDisplayFactor;

/**
 * 격자 ↔ 속성창 크기(m) 동일 환산.
 * 모션 import 후 씬 factor 우선, 없으면 mesh/motion 표기와 같은 factor 사용.
 */
function getStageGridDisplayFactor(editor) {
  const sceneFactor = editor?.scene?.userData?.motionDisplayFactor;
  if (typeof sceneFactor === "number" && sceneFactor > 1e-9) {
    return sceneFactor;
  }

  if (editor?.scene) {
    for (let i = 0; i < editor.scene.children.length; i++) {
      const child = editor.scene.children[i];
      if (getMotionRoot(child) || getMeshRoot(child)) {
        return getSceneMotionDisplayFactor(editor, child);
      }
    }
  }

  return 1;
}

/** 표시 m → 월드 격자 칸 (모션 환산 씬에서 1m 표시 = 굵은 칸 1개) */
function getStageGridWorldCellSize(editor) {
  return STAGE_DISPLAY_GRID_CELL_M / getStageGridDisplayFactor(editor);
}

function getStageGridWorldMajorCellSize(editor) {
  return STAGE_DISPLAY_GRID_MAJOR_CELL_M / getStageGridDisplayFactor(editor);
}

function worldSizeToMotionDisplay(worldSize, object, editor) {
  if (!usesStageDisplayUnits(object, editor)) return worldSize.clone();

  return worldSize
    .clone()
    .multiplyScalar(getSceneMotionDisplayFactor(editor, object));
}

function motionDisplayToWorldSize(displaySize, object, editor) {
  if (!usesStageDisplayUnits(object, editor)) return displaySize.clone();

  const k = getSceneMotionDisplayFactor(editor, object);
  const inv = k > 1e-9 ? 1 / k : 1;
  return displaySize.clone().multiplyScalar(inv);
}

function applySceneMotionDisplayFactor(editor, worldReferenceHeight) {
  if (!editor?.scene) return;
  if (!editor.scene.userData) editor.scene.userData = {};
  editor.scene.userData.motionWorldReferenceHeight = worldReferenceHeight;
  editor.scene.userData.motionDisplayFactor =
    MOTION_DISPLAY_REFERENCE_HEIGHT / worldReferenceHeight;
}

/** 모션 로드 직후 — 월드 높이 = UI 1.7m 기준, 씬 전체 환산 비율 갱신 */
function captureMotionWorldReferenceHeight(object, editor) {
  if (!object.userData) object.userData = {};
  object.userData.source = object.userData.source || "motion";
  object.updateMatrixWorld(true);

  const h = getMotionWorldHeight(object, editor);
  if (h > 1e-6) {
    object.userData.motionWorldReferenceHeight = h;
    object.userData.motionDisplayHeight = MOTION_DISPLAY_REFERENCE_HEIGHT;
    applySceneMotionDisplayFactor(editor, h);
    return h;
  }

  return 1;
}

export {
  getMotionRoot,
  getMeshRoot,
  getDisplayRoot,
  isMotionObject,
  isMeshObject,
  isExcludedFromStageDisplay,
  usesStageDisplayUnits,
  usesMotionDisplayUnits,
  getSceneMotionDisplayFactor,
  getMotionDisplayFactor,
  getStageGridDisplayFactor,
  getStageGridWorldCellSize,
  getStageGridWorldMajorCellSize,
  worldSizeToMotionDisplay,
  motionDisplayToWorldSize,
  captureMotionWorldReferenceHeight,
  applySceneMotionDisplayFactor,
};
