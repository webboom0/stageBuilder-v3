import * as THREE from 'three';
import { getStageDeckWorldY, getStageWorldPerMeter } from '../stage/stageGridAdaptive.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/** @type {boolean} */
let _xRayEnabled = false;
/** @type {import('../stage/StageManager.js').StageManager | null} */
let _stageManager = null;
/** @type {THREE.Scene | null} */
let _scene = null;

/**
 * @type {Map<THREE.Material, { transparent: boolean, opacity: number, depthWrite: boolean }>}
 */
const _savedMats = new Map();

/**
 * @type {Array<{ mesh: THREE.Object3D, visible: boolean }>}
 */
const _savedVis = [];

const XRAY_OPACITY = 0.12;

function isRenderableMesh(obj) {
  return obj.isMesh || obj.isSkinnedMesh;
}

function isExcludedMesh(obj) {
  if (!isRenderableMesh(obj)) return false;
  if (!obj.visible) return false;
  if (obj.userData.isFixture || obj.userData.fixturePart || obj.userData.isFixtureRig) return true;
  if (obj.userData.motionId || obj.userData.source === 'motion' || obj.userData.source === 'stage-prop') {
    return true;
  }
  if (obj.userData.excludeFromTimeline || obj.userData._VideoBackground) return true;
  if (obj.name === 'StageFloor' || obj.userData.isStageFloor) return true;
  return false;
}

/**
 * @param {THREE.Object3D} obj
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 */
function isXRayTargetMesh(obj, stageManager) {
  if (isExcludedMesh(obj)) return false;

  const deckY = getStageDeckWorldY(stageManager);
  const worldPerM = getStageWorldPerMeter(stageManager);
  const minAbove = deckY + 1.2 * worldPerM;

  _box.setFromObject(obj);
  if (_box.isEmpty()) return false;
  _box.getCenter(_center);
  _box.getSize(_size);

  const maxHoriz = Math.max(_size.x, _size.z);
  const minHoriz = Math.min(_size.x, _size.z);

  const thinY = _size.y <= maxHoriz * 0.55;
  const fullyAbove = _box.min.y >= minAbove;
  const highCenter = _center.y >= deckY + 6 * worldPerM;
  const wideFlat = maxHoriz >= 2 * worldPerM && _size.y <= 3 * worldPerM;
  if (fullyAbove && (thinY || wideFlat)) return true;
  if (highCenter && thinY) return true;
  if (fullyAbove && minHoriz <= 2 * worldPerM && maxHoriz >= 4 * worldPerM) return true;

  if (_center.y < deckY + 0.35 * worldPerM) return false;
  const tall = _size.y >= 2.5 * worldPerM && _size.y >= maxHoriz * 0.9;
  const panel = minHoriz <= 14 * worldPerM && maxHoriz >= 1.5 * worldPerM;
  return tall && panel;
}

/** @param {THREE.Material} mat */
function saveMaterialOnce(mat) {
  if (_savedMats.has(mat)) return;
  _savedMats.set(mat, {
    transparent: mat.transparent,
    opacity: mat.opacity,
    depthWrite: mat.depthWrite,
  });
}

/** @param {THREE.Object3D} mesh */
function applyXRayToMesh(mesh) {
  const raw = mesh.material;
  const mats = Array.isArray(raw) ? raw : [raw];
  for (const mat of mats) {
    if (!mat) continue;
    saveMaterialOnce(mat);
    mat.transparent = true;
    mat.opacity = XRAY_OPACITY;
    mat.depthWrite = false;
    mat.needsUpdate = true;
  }
}

function restoreAll() {
  for (const [mat, saved] of _savedMats) {
    mat.transparent = saved.transparent;
    mat.opacity = saved.opacity;
    mat.depthWrite = saved.depthWrite;
    mat.needsUpdate = true;
  }
  _savedMats.clear();

  for (const { mesh, visible } of _savedVis) {
    mesh.visible = visible;
  }
  _savedVis.length = 0;
}

function applyToScene() {
  if (!_stageManager || !_scene) return;
  restoreAll();

  _stageManager.stageGroup?.updateWorldMatrix(true, true);
  _stageManager.background?.updateWorldMatrix(true, true);

  const roots = [_stageManager.background].filter(Boolean);
  for (const root of roots) {
    root.traverse((obj) => {
      if (!isRenderableMesh(obj)) return;
      if (!isXRayTargetMesh(obj, _stageManager)) return;
      applyXRayToMesh(obj);
    });
  }
}

export function isStageShellXRayEnabled() {
  return _xRayEnabled;
}

/**
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {THREE.Scene} scene
 */
export function bindStageShellXRayContext(stageManager, scene) {
  _stageManager = stageManager;
  _scene = scene;
}

/** Re-apply after stage/scene reload while toggle is on. */
export function refreshStageShellXRay() {
  if (!_xRayEnabled) return;
  applyToScene();
}

/** @param {boolean} on */
export function setStageShellXRayEnabled(on) {
  const next = !!on;
  if (next === _xRayEnabled) return;

  if (next) {
    _xRayEnabled = true;
    applyToScene();
  } else {
    _xRayEnabled = false;
    restoreAll();
  }
}

/** @deprecated No-op — x-ray is persistent; kept for call-site compat. */
export function beginStageShellXRay(_stageManager, _scene, _camera = null) {}

/** @deprecated No-op */
export function endStageShellXRay() {}
