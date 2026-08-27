import * as THREE from 'three';

const STORAGE_KEY = 'houseStageLights';

export const FOH_SPOT_SUFFIXES = Object.freeze(['L', 'C', 'R']);

/** Beam size slider 0~1 → SpotLight.angle (rad) */
export const FOH_ANGLE_MIN = 0.22;
export const FOH_ANGLE_MAX = 1.05;

/** v3 NANSEOL_FRONT_SPOT_PRESETS — intensity at 100% dim */
export const HOUSE_LIGHT_BASE = Object.freeze({
  fill: 0.92,
  foh: Object.freeze({ L: 6.2, C: 4.0, R: 6.2 }),
});

/** v3 Sidebar.Nanseol front spots */
export const FOH_SPOT_PRESETS = Object.freeze([
  {
    suffix: 'L',
    position: [-76.096, 66.489, 223.147],
    target: [-35, 2, 30],
    intensity: 6.2,
    distance: 520,
    angle: 0.75,
    penumbra: 0.14,
  },
  {
    suffix: 'C',
    position: [1.89, 56.744, 225.001],
    target: [0, 2, 30],
    intensity: 4.0,
    distance: 520,
    angle: 0.65,
    penumbra: 0.1,
  },
  {
    suffix: 'R',
    position: [86.55, 65.051, 218.534],
    target: [35, 2, 30],
    intensity: 6.2,
    distance: 520,
    angle: 0.65,
    penumbra: 0.12,
  },
]);

export function size01ToAngle(size01) {
  const s = Math.max(0, Math.min(1, Number(size01) || 0));
  return FOH_ANGLE_MIN + s * (FOH_ANGLE_MAX - FOH_ANGLE_MIN);
}

export function angleToSize01(angle) {
  const a = Number(angle);
  if (!Number.isFinite(a)) return 0.5;
  return Math.max(0, Math.min(1, (a - FOH_ANGLE_MIN) / (FOH_ANGLE_MAX - FOH_ANGLE_MIN)));
}

export function hexToRgb01(hex, fallback = { r: 1, g: 1, b: 1 }) {
  try {
    const c = new THREE.Color(hex);
    return { r: c.r, g: c.g, b: c.b };
  } catch {
    return { ...fallback };
  }
}

export function rgb01ToHex(r, g, b) {
  const c = new THREE.Color(
    Math.max(0, Math.min(1, Number(r) || 0)),
    Math.max(0, Math.min(1, Number(g) || 0)),
    Math.max(0, Math.min(1, Number(b) || 0)),
  );
  return `#${c.getHexString()}`;
}

function defaultSizeForSuffix(suffix) {
  const preset = FOH_SPOT_PRESETS.find((p) => p.suffix === suffix);
  return angleToSize01(preset?.angle ?? 0.65);
}

/** @param {THREE.Scene | null | undefined} scene */
export function getStageGroup(scene) {
  return scene?.getObjectByName?.('Stage')
    || scene?.children?.find((c) => c.name === 'Stage')
    || null;
}

/** @param {THREE.Scene} scene */
export function getHouseFillLight(scene) {
  const stage = getStageGroup(scene);
  return stage?.children?.find((c) => c?.name === '_Light' && c?.isHemisphereLight) || null;
}

/** @param {THREE.Scene} scene @param {string} suffix */
export function getFohSpot(scene, suffix) {
  return getStageGroup(scene)?.children?.find((c) => c.name === `_StageFrontSpot_${suffix}`) || null;
}

export function defaultHouseLightLevels() {
  return {
    fill: 0.12,
    fohL: 0,
    fohC: 0,
    fohR: 0,
    colorFill: '#ffffff',
    colorL: '#ffffff',
    colorC: '#ffffff',
    colorR: '#ffffff',
    sizeL: defaultSizeForSuffix('L'),
    sizeC: defaultSizeForSuffix('C'),
    sizeR: defaultSizeForSuffix('R'),
  };
}

/** @param {THREE.Scene | null | undefined} scene */
export function readHouseLightLevels(scene) {
  const saved = scene?.userData?.[STORAGE_KEY];
  if (saved) return { ...defaultHouseLightLevels(), ...saved };
  return defaultHouseLightLevels();
}

/** @param {THREE.Scene | null | undefined} scene @param {Record<string, unknown>} levels */
export function persistHouseLightLevels(scene, levels) {
  if (!scene) return;
  if (!scene.userData) scene.userData = {};
  scene.userData[STORAGE_KEY] = { ...levels };
}

/**
 * Create fill + FOH spots on Stage group if missing (v3 ensureDefaultStageLights).
 * @param {import('../stage/StageManager.js').StageManager} stageManager
 */
export function ensureHouseStageLights(stageManager) {
  const stageGroup = stageManager?.stageGroup;
  if (!stageGroup) return false;

  let added = false;

  if (!stageGroup.children.some((c) => c.name === '_Light' && c.isHemisphereLight)) {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x181818, 0);
    hemi.position.set(0, 1, 0);
    hemi.name = '_Light';
    hemi.userData.baseIntensity = HOUSE_LIGHT_BASE.fill;
    hemi.userData.isBackground = true;
    hemi.userData.notSelectable = true;
    stageGroup.add(hemi);
    added = true;
  }

  for (const cfg of FOH_SPOT_PRESETS) {
    const spotName = `_StageFrontSpot_${cfg.suffix}`;
    if (stageGroup.children.some((c) => c.name === spotName)) continue;

    const target = new THREE.Object3D();
    target.position.set(...cfg.target);
    target.name = `_StageFrontSpotTarget_${cfg.suffix}`;
    target.userData.isBackground = true;
    target.userData.notSelectable = true;
    stageGroup.add(target);

    const spot = new THREE.SpotLight(0xffffff, 0, cfg.distance, cfg.angle, cfg.penumbra, 0);
    spot.name = spotName;
    spot.position.set(...cfg.position);
    spot.target = target;
    spot.userData.baseIntensity = cfg.intensity;
    spot.userData.isBackground = true;
    spot.userData.notSelectable = true;
    stageGroup.add(spot);
    added = true;
  }

  tagHouseLightsForBlackout(stageGroup);
  return added;
}

/** @param {THREE.Object3D | null | undefined} stageGroup */
export function tagHouseLightsForBlackout(stageGroup) {
  if (!stageGroup) return;
  const hemi = stageGroup.children.find((c) => c.name === '_Light' && c.isHemisphereLight);
  if (hemi && hemi.userData.baseIntensity == null) {
    hemi.userData.baseIntensity = HOUSE_LIGHT_BASE.fill;
  }
  for (const suffix of FOH_SPOT_SUFFIXES) {
    const spot = stageGroup.children.find((c) => c.name === `_StageFrontSpot_${suffix}`);
    if (spot && spot.userData.baseIntensity == null) {
      spot.userData.baseIntensity = HOUSE_LIGHT_BASE.foh[suffix] ?? spot.intensity;
    }
  }
}

function applyFill(scene, levels) {
  const light = getHouseFillLight(scene);
  if (!light) return;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.fill;
  const level01 = Math.max(0, Math.min(1, Number(levels.fill) || 0));
  light.intensity = level01 * base;
  const rgb = hexToRgb01(levels.colorFill || '#ffffff');
  light.color.setRGB(rgb.r, rgb.g, rgb.b);
}

function applyFoh(scene, suffix, levels) {
  const light = getFohSpot(scene, suffix);
  if (!light) return;
  const key = `foh${suffix}`;
  const colorKey = `color${suffix}`;
  const sizeKey = `size${suffix}`;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.foh[suffix] ?? 4;
  const level01 = Math.max(0, Math.min(1, Number(levels[key]) || 0));
  light.intensity = level01 * base;
  const rgb = hexToRgb01(levels[colorKey] || '#ffffff');
  light.color.setRGB(rgb.r, rgb.g, rgb.b);
  if (light.angle !== undefined) {
    light.angle = size01ToAngle(levels[sizeKey] ?? 0.5);
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {Record<string, unknown>} levels
 */
export function applyHouseLightLevels(scene, levels) {
  if (!scene) return;
  const merged = { ...defaultHouseLightLevels(), ...levels };
  applyFill(scene, merged);
  applyFoh(scene, 'L', merged);
  applyFoh(scene, 'C', merged);
  applyFoh(scene, 'R', merged);
  persistHouseLightLevels(scene, merged);
}

/**
 * Write one channel bag into levels and apply.
 * @param {THREE.Scene} scene
 * @param {'fill' | 'L' | 'C' | 'R'} channel
 * @param {{ dim: number, color: string, size: number }} bag
 */
export function applyHouseChannelBag(scene, channel, bag) {
  const levels = readHouseLightLevels(scene);
  const dim01 = Math.max(0, Math.min(1, Number(bag.dim) || 0));
  const size01 = Math.max(0, Math.min(1, Number(bag.size) ?? 0.5));
  const hex = String(bag.color || '#ffffff');
  if (channel === 'fill') {
    levels.fill = dim01;
    levels.colorFill = hex;
  } else {
    levels[`foh${channel}`] = dim01;
    levels[`color${channel}`] = hex;
    levels[`size${channel}`] = size01;
  }
  applyHouseLightLevels(scene, levels);
  return levels;
}

/**
 * @param {THREE.Scene} scene
 * @param {'fill' | 'L' | 'C' | 'R'} channel
 */
export function captureHouseChannelBag(scene, channel) {
  const levels = readHouseLightLevels(scene);
  if (channel === 'fill') {
    return {
      dim: levels.fill ?? 0,
      color: levels.colorFill || '#ffffff',
      size: 0.5,
    };
  }
  return {
    dim: levels[`foh${channel}`] ?? 0,
    color: levels[`color${channel}`] || '#ffffff',
    size: levels[`size${channel}`] ?? 0.5,
  };
}
