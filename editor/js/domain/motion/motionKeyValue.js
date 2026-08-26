import { INTERPOLATION } from '../timeline/types.js';

/**
 * Compound motion keyframe value (one UI track = one object, like v3).
 * @typedef {{
 *   position: number[],
 *   rotation: number[],
 *   scale: number[],
 *   opacity: number,
 *   visible: boolean,
 * }} MotionKeyValue
 */

/** @returns {MotionKeyValue} */
export function emptyMotionKeyValue() {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    opacity: 1,
    visible: true,
  };
}

/**
 * Snapshot transform + presence from a THREE object.
 * @param {import('three').Object3D} object
 * @param {{ opacity?: number, visible?: boolean }} [extra]
 * @returns {MotionKeyValue}
 */
export function motionKeyFromObject(object, extra = {}) {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
    opacity: extra.opacity ?? 1,
    visible: extra.visible ?? object.visible !== false,
  };
}

/**
 * Normalize any key value into a full MotionKeyValue.
 * @param {any} raw
 * @param {MotionKeyValue} [fallback]
 * @returns {MotionKeyValue}
 */
export function asMotionKeyValue(raw, fallback = emptyMotionKeyValue()) {
  const fb = fallback;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      position: fb.position.slice(),
      rotation: fb.rotation.slice(),
      scale: fb.scale.slice(),
      opacity: fb.opacity,
      visible: fb.visible,
    };
  }
  return {
    position: asVec3(raw.position, fb.position),
    rotation: asVec3(raw.rotation, fb.rotation),
    scale: asVec3(raw.scale, fb.scale),
    opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : fb.opacity,
    visible: raw.visible === undefined ? fb.visible : !!raw.visible,
  };
}

/** @param {any} v @param {number[]} fb */
function asVec3(v, fb) {
  if (Array.isArray(v) && v.length >= 3) {
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  }
  if (v && typeof v === 'object' && 'x' in v) {
    return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
  }
  return fb.slice(0, 3);
}

export { INTERPOLATION };
