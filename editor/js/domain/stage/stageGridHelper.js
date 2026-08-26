import * as THREE from 'three';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * Three.js GridHelper sized to the stage floor (classic opaque lines, depthTest ON).
 *
 * @param {import('./StageManager.js').StageManager | null} stageManager
 */
export function computeStageGridHelperLayout(stageManager) {
  const floor = stageManager?.floor;
  const profile = stageManager?.profile;
  if (!floor || !profile) {
    return { size: 20, divisions: 20, centerX: 0, centerZ: 0, deckTopY: 0.02 };
  }

  floor.updateWorldMatrix(true, true);
  _box.setFromObject(floor);
  if (_box.isEmpty()) {
    return { size: 20, divisions: 20, centerX: 0, centerZ: 0, deckTopY: 0.02 };
  }

  _box.getSize(_size);
  const center = _box.getCenter(new THREE.Vector3());
  const size = Math.max(_size.x, _size.z, 1);
  const divisions = Math.max(
    10,
    Math.round(Math.max(profile.widthM, profile.depthM)),
  );

  return {
    size,
    divisions,
    centerX: center.x,
    centerZ: center.z,
    deckTopY: _box.max.y,
  };
}

/**
 * @param {number} size
 * @param {number} divisions
 */
export function createStageGridHelper(size, divisions) {
  const grid = new THREE.GridHelper(size, divisions, 0x666666, 0x444444);
  grid.name = 'StageGridHelper';
  grid.frustumCulled = false;
  return grid;
}

/** @param {THREE.GridHelper | null | undefined} grid */
export function disposeStageGridHelper(grid) {
  if (!grid) return;
  grid.geometry?.dispose();
  if (Array.isArray(grid.material)) {
    grid.material.forEach((m) => m.dispose());
  } else {
    grid.material?.dispose();
  }
}
