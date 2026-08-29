import * as THREE from 'three';
import { getStageDeckCenter, getStageDeckWorldY, getStageWorldPerMeter } from '../stage/stageGridAdaptive.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _camToStage = new THREE.Vector3();
const _camToMesh = new THREE.Vector3();
const _deckCenter = new THREE.Vector3();
const _viewFwd = new THREE.Vector3();

/** @typedef {'top' | 'side' | 'xray'} MultiViewOccluderMode */

/** @type {Array<{ mats: Array<{ mat: THREE.Material, transparent: boolean, opacity: number, depthWrite: boolean }> }>} */
let _matPatches = [];
/** @type {Array<{ mesh: THREE.Mesh, visible: boolean }>} */
let _visPatches = [];
/** @type {boolean} */
let _sessionActive = false;

/**
 * @param {THREE.Object3D} obj
 */
function isRenderableMesh(obj) {
  return obj.isMesh || obj.isSkinnedMesh;
}

/**
 * @param {THREE.Object3D} obj
 */
function isExcludedMesh(obj) {
  if (!isRenderableMesh(obj)) return false;
  if (!obj.visible) return false;
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
function isOverheadOccluderMesh(obj, stageManager) {
  if (isExcludedMesh(obj)) return false;
  if (obj.userData.isFixture || obj.userData.fixturePart) return true;

  const deckY = getStageDeckWorldY(stageManager);
  const worldPerM = getStageWorldPerMeter(stageManager);
  const minAbove = deckY + 1.2 * worldPerM;

  _box.setFromObject(obj);
  if (_box.isEmpty()) return false;
  _box.getCenter(_center);
  _box.getSize(_size);

  const maxHoriz = Math.max(_size.x, _size.z);
  const minHoriz = Math.min(_size.x, _size.z);
  const verticalWall = _size.y > maxHoriz * 2.5 && _size.y > 8 * worldPerM;
  if (verticalWall) return false;

  const thinY = _size.y <= maxHoriz * 0.55;
  const fullyAbove = _box.min.y >= minAbove;
  const highCenter = _center.y >= deckY + 6 * worldPerM;
  const wideFlat = maxHoriz >= 2 * worldPerM && _size.y <= 3 * worldPerM;

  if (fullyAbove && (thinY || wideFlat)) return true;
  if (highCenter && thinY) return true;
  if (fullyAbove && minHoriz <= 2 * worldPerM && maxHoriz >= 4 * worldPerM) return true;
  return false;
}

/**
 * Shell mesh between side camera and deck — blocks wing walls / masking flats.
 * @param {THREE.Object3D} obj
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {THREE.Camera} camera
 */
function isSideBlockingMesh(obj, stageManager, camera) {
  if (isExcludedMesh(obj)) return false;
  if (obj.userData.isFixture || obj.userData.fixturePart) return false;

  const deckY = getStageDeckWorldY(stageManager);
  const worldPerM = getStageWorldPerMeter(stageManager);
  getStageDeckCenter(stageManager, _deckCenter);
  _deckCenter.y = deckY + 1.5 * worldPerM;

  _box.setFromObject(obj);
  if (_box.isEmpty()) return false;
  _box.getCenter(_center);
  _box.getSize(_size);

  if (_box.max.y < deckY + 0.2 * worldPerM) return false;
  if (_size.y < 1.2 * worldPerM) return false;

  _viewFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _viewFwd.y = 0;
  if (_viewFwd.lengthSq() < 1e-8) return false;
  _viewFwd.normalize();

  _camToMesh.subVectors(_center, camera.position);
  _camToMesh.y = 0;
  const meshAhead = _camToMesh.dot(_viewFwd);
  if (meshAhead < 0.3 * worldPerM) return false;

  _camToStage.subVectors(_deckCenter, camera.position);
  _camToStage.y = 0;
  const stageAhead = _camToStage.dot(_viewFwd);
  if (meshAhead > stageAhead + 16 * worldPerM) return false;

  const lateral = _camToMesh.clone().sub(_viewFwd.clone().multiplyScalar(meshAhead)).length();
  const maxHoriz = Math.max(_size.x, _size.z);
  if (lateral > Math.max(22 * worldPerM, maxHoriz * 0.85)) return false;

  const minHoriz = Math.min(_size.x, _size.z);
  const tall = _size.y >= 2 * worldPerM;
  const panel = minHoriz <= 14 * worldPerM && maxHoriz >= 1 * worldPerM;
  if (tall && panel) return true;

  return meshAhead < stageAhead * 0.95 && _size.y >= 2.5 * worldPerM;
}

/** @type {Set<THREE.Material>} */
let _patchedMats = new Set();

/** @param {THREE.Object3D} mesh @param {number} [opacity=0.06] */
function fadeMeshMaterials(mesh, opacity = 0.06) {
  const raw = mesh.material;
  const mats = Array.isArray(raw) ? raw : [raw];

  for (const mat of mats) {
    if (!mat || _patchedMats.has(mat)) continue;
    _patchedMats.add(mat);
    _matPatches.push({
      mats: [{
        mat,
        transparent: mat.transparent,
        opacity: mat.opacity,
        depthWrite: mat.depthWrite,
      }],
    });
    mat.transparent = true;
    mat.opacity = Math.min(mat.opacity, opacity);
    mat.depthWrite = false;
    mat.needsUpdate = true;
  }
}

/** @param {THREE.Object3D} mesh */
function hideMesh(mesh) {
  _visPatches.push({ mesh, visible: mesh.visible });
  mesh.visible = false;
}

/**
 * @param {MultiViewOccluderMode} mode
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} [camera]
 */
export function beginMultiViewOccluder(mode, stageManager, scene, camera = null) {
  if (_sessionActive) endMultiViewOccluder();
  _sessionActive = true;
  _matPatches = [];
  _visPatches = [];
  _patchedMats = new Set();

  stageManager.stageGroup?.updateWorldMatrix(true, true);
  stageManager.background?.updateWorldMatrix(true, true);

  const bgRoots = [stageManager.background].filter(Boolean);
  const allRoots = [stageManager.background, stageManager.stageGroup].filter(Boolean);
  const roots = mode === 'side' ? bgRoots : allRoots;

  for (const root of roots) {
    root.traverse((obj) => {
      if (!isRenderableMesh(obj)) return;
      if (mode === 'top' && isOverheadOccluderMesh(obj, stageManager)) {
        fadeMeshMaterials(obj);
        return;
      }
      if (mode === 'side' && camera) {
        if (isSideBlockingMesh(obj, stageManager, camera)) {
          hideMesh(obj);
          return;
        }
        if (isOverheadOccluderMesh(obj, stageManager)) {
          fadeMeshMaterials(obj);
        }
        return;
      }
      if (mode === 'xray') {
        if (camera && isSideBlockingMesh(obj, stageManager, camera)) {
          fadeMeshMaterials(obj, 0.12);
          return;
        }
        if (isOverheadOccluderMesh(obj, stageManager)) {
          fadeMeshMaterials(obj, 0.12);
        }
      }
    });
  }

  if (mode === 'top' || mode === 'side') {
    scene.traverse((obj) => {
      if (!isRenderableMesh(obj)) return;
      if (!obj.userData?.isFixture && !obj.userData?.fixturePart) return;
      fadeMeshMaterials(obj);
    });
  }
}

export function endMultiViewOccluder() {
  if (!_sessionActive && !_matPatches.length && !_visPatches.length) return;
  for (const { mats } of _matPatches) {
    for (const s of mats) {
      s.mat.transparent = s.transparent;
      s.mat.opacity = s.opacity;
      s.mat.depthWrite = s.depthWrite;
      s.mat.needsUpdate = true;
    }
  }
  for (const { mesh, visible } of _visPatches) {
    mesh.visible = visible;
  }
  _matPatches = [];
  _visPatches = [];
  _patchedMats = new Set();
  _sessionActive = false;
}

/** Force-restore materials / visibility (e.g. x-ray toggle off). */
export function forceRestoreMultiViewOccluder() {
  endMultiViewOccluder();
}
