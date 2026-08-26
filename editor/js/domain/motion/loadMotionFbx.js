import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { scaleToHumanHeight } from '../stage/HumanScale.js';

/**
 * Load a motion FBX, pose first frame, scale to stage-world human height (170cm).
 * `targetWorldHeight` is Three.js world units (= humanHeightM × worldPerMeter).
 *
 * @param {string} url
 * @param {{ name?: string, targetWorldHeight?: number }} [opts]
 * @returns {Promise<{ root: THREE.Group, animations: THREE.AnimationClip[], animDuration: number }>}
 */
export async function loadMotionFbx(url, opts = {}) {
  const loader = new FBXLoader();
  const root = await new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  root.name = opts.name || root.name || 'Motion';
  if (!root.userData) root.userData = {};
  root.userData.source = 'motion';
  root.userData.fileUrl = url;

  applyFirstFramePose(root);

  // Stage uses v3-sized world units. Never treat 1.7m as 1.7 world units.
  const targetWorld = opts.targetWorldHeight ?? 45;
  scaleToHumanHeight(root, targetWorld);
  root.userData.spawnWorldHeight = targetWorld;

  const animations = root.animations?.length ? root.animations.slice() : [];
  const animDuration = animations[0]?.duration > 0 ? animations[0].duration : 2;

  return { root, animations, animDuration };
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
