import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { getStageWorldPerMeter } from '../stage/stageGridAdaptive.js';

/** Default max bounding size for props on stage (meters). */
export const PROP_MAX_SIZE_M = 3;

/**
 * Load stage prop (FBX or OBJ). No human-height scaling — fit to stage meters.
 *
 * @param {string} url
 * @param {{
 *   name?: string,
 *   stageManager?: import('../stage/StageManager.js').StageManager | null,
 *   maxSizeM?: number,
 * }} [opts]
 */
export async function loadPropAsset(url, opts = {}) {
  const ext = guessExt(url);
  let root;

  if (ext === 'obj') {
    const loader = new OBJLoader();
    root = await new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
    ensureObjMaterials(root);
  } else {
    const loader = new FBXLoader();
    root = await new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
    applyFirstFramePose(root);
  }

  root.name = opts.name || root.name || 'Prop';
  if (!root.userData) root.userData = {};
  root.userData.source = 'stage-prop';
  root.userData.fileUrl = url;

  fitPropScale(root, opts.stageManager ?? null, opts.maxSizeM ?? PROP_MAX_SIZE_M);

  const animations = root.animations?.length ? root.animations.slice() : [];
  const animDuration = animations[0]?.duration > 0 ? animations[0].duration : 2;

  return { root, animations, animDuration };
}

/** @param {string} url */
function guessExt(url) {
  const clean = String(url).split('?')[0].split('#')[0];
  const i = clean.lastIndexOf('.');
  if (i < 0) return 'fbx';
  return clean.slice(i + 1).toLowerCase();
}

/**
 * @param {THREE.Object3D} root
 * @param {import('../stage/StageManager.js').StageManager | null} stageManager
 * @param {number} maxSizeM
 */
function fitPropScale(root, stageManager, maxSizeM) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const wpm = getStageWorldPerMeter(stageManager) || 1;
  const maxWorld = maxSizeM * wpm;
  if (maxDim > 1e-6 && maxDim > maxWorld) {
    root.scale.multiplyScalar(maxWorld / maxDim);
  }
  root.userData.propMaxSizeM = maxSizeM;
}

/** @param {THREE.Object3D} root */
function ensureObjMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    }
  });
}

/** @param {THREE.Object3D} root */
function applyFirstFramePose(root) {
  if (!root.animations?.length) return;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(root.animations[0]);
  action.reset();
  action.time = 0;
  action.setEffectiveWeight(1);
  action.play();
  mixer.update(0);
  root.updateMatrixWorld(true);
}
