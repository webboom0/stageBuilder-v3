import * as THREE from 'three';

/** v3 Editor.initWorkLights — rehearsal / setup illumination (not cued). */
export function ensureWorkLights(scene) {
  if (!scene) return null;
  let g = scene.getObjectByName('_WorkLights');
  if (g) {
    return {
      group: g,
      amb: g.children.find((c) => c.isAmbientLight),
      hemi: g.children.find((c) => c.isHemisphereLight),
      key: g.children.find((c) => c.isDirectionalLight),
    };
  }

  g = new THREE.Group();
  g.name = '_WorkLights';
  g.userData.type = 'workLights';
  g.userData.excludeFromTimeline = true;
  g.userData.notSelectable = true;

  const amb = new THREE.AmbientLight(0xffffff, 0);
  const hemi = new THREE.HemisphereLight(0x9fb4d4, 0x202833, 0);
  const key = new THREE.DirectionalLight(0xfff2e0, 0);
  key.position.set(20, 60, 30);
  key.castShadow = false;

  g.add(amb, hemi, key);
  scene.add(g);

  const kit = { group: g, amb, hemi, key };
  setWorkLightLevel(scene, readWorkLightLevel(scene));
  return kit;
}

/** @param {THREE.Scene | null | undefined} scene */
export function readWorkLightLevel(scene) {
  return scene?.userData?.workLightLevel ?? 0;
}

/**
 * @param {THREE.Scene | null | undefined} scene
 * @param {number} level01
 */
export function setWorkLightLevel(scene, level01) {
  const v = Math.max(0, Math.min(1, Number(level01) || 0));
  if (!scene) return v;
  if (!scene.userData) scene.userData = {};
  scene.userData.workLightLevel = v;

  const kit = ensureWorkLights(scene);
  if (kit?.amb) kit.amb.intensity = 0.55 * v;
  if (kit?.hemi) kit.hemi.intensity = 0.9 * v;
  if (kit?.key) kit.key.intensity = 1.25 * v;

  // StageManager editor base lights (were always-on — blocked WORK blackout)
  const baseAmb = scene.getObjectByName('_EditorBaseAmb');
  const baseDir = scene.getObjectByName('_EditorBaseDir');
  if (baseAmb) baseAmb.intensity = 0.45 * v;
  if (baseDir) baseDir.intensity = 0.85 * v;

  return v;
}
