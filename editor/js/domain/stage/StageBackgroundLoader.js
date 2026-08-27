import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { getStageFbxUrl, STAGE_BACKGROUND_TRANSFORM } from './StageAssets.js';
import { normalizeStageType } from './StageTypes.js';

/**
 * 무대 셸 FBX가 레이에 먼저 맞으면 선택이 막히므로 지오메트리만 raycast 비활성화.
 * @param {import('three').Object3D} root
 */
export function disableStageBackgroundRaycast(root) {
  root.traverse((child) => {
    if (
      !child.isMesh &&
      !child.isLine &&
      !child.isLineSegments &&
      !child.isLineLoop &&
      !child.isPoints &&
      !child.isSkinnedMesh
    ) {
      return;
    }
    if (child.userData?.allowStageRaycast) return;
    child.raycast = function () {};
  });
}

/**
 * @param {import('three').Object3D} root
 */
export function disposeObject3D(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

/** Resolve stage shell URL for FBXLoader (absolute same-origin). */
function resolveShellLoadUrl(url) {
  if (typeof window === 'undefined') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return new URL(url, window.location.href).href;
}

/** Texture paths in background.fbx point at files/stage/*.jpg (optional). */
function stageTextureResourcePath() {
  if (typeof window === 'undefined') return '/files/stage/';
  return `${window.location.origin}/files/stage/`;
}

/**
 * @param {import('./StageTypes.js').StageTypeId} stageType
 * @returns {Promise<import('three').Group>}
 */
export function loadStageBackgroundFbx(stageType) {
  const type = normalizeStageType(stageType);
  const url = resolveShellLoadUrl(getStageFbxUrl(type));
  const transform = STAGE_BACKGROUND_TRANSFORM[type];
  const loader = new FBXLoader();
  loader.setResourcePath(stageTextureResourcePath());

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        object.name = '_Background';
        object.position.set(...transform.position);
        object.rotation.set(...transform.rotation);
        object.scale.set(...transform.scale);
        object.userData.isBackground = true;
        object.userData.notSelectable = true;
        disableStageBackgroundRaycast(object);
        resolve(object);
      },
      undefined,
      (err) => reject(new Error(`Stage FBX load failed (${url}): ${err?.message || err}`)),
    );
  });
}
