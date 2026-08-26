import { INTERPOLATION } from '../timeline/types.js';
import { asMotionKeyValue, emptyMotionKeyValue } from './motionKeyValue.js';

/**
 * Sample bool / discrete tracks (STEP hold).
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {any} fallback
 */
export function sampleHold(store, timeSec, fallback) {
  const keys = store.list();
  if (!keys.length) return fallback;
  let value = fallback;
  for (const kf of keys) {
    if (kf.timeSec <= timeSec + 1e-9) value = kf.value;
    else break;
  }
  return value;
}

/**
 * Linear sample for scalars (falls back to hold for STEP keys).
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {number} fallback
 */
export function sampleScalar(store, timeSec, fallback) {
  const keys = store.list();
  if (!keys.length) return fallback;
  if (timeSec <= keys[0].timeSec) return Number(keys[0].value);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      if (a.interpolation === INTERPOLATION.STEP) return Number(a.value);
      const span = b.timeSec - a.timeSec;
      const u = span < 1e-9 ? 0 : easedUnit((timeSec - a.timeSec) / span, a.interpolation);
      return Number(a.value) + (Number(b.value) - Number(a.value)) * u;
    }
  }
  return Number(keys[keys.length - 1].value);
}

/**
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {number[]} fallback
 * @returns {number[]}
 */
export function sampleVec3(store, timeSec, fallback) {
  const keys = store.list();
  const fb = fallback.slice(0, 3);
  if (!keys.length) return fb;
  if (timeSec <= keys[0].timeSec) return asVec3(keys[0].value, fb);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const av = asVec3(a.value, fb);
      if (a.interpolation === INTERPOLATION.STEP) return av;
      const bv = asVec3(b.value, fb);
      const span = b.timeSec - a.timeSec;
      const u = span < 1e-9 ? 0 : easedUnit((timeSec - a.timeSec) / span, a.interpolation);
      return [
        av[0] + (bv[0] - av[0]) * u,
        av[1] + (bv[1] - av[1]) * u,
        av[2] + (bv[2] - av[2]) * u,
      ];
    }
  }
  return asVec3(keys[keys.length - 1].value, fb);
}

/**
 * Sample compound motion keys (pos/rot/scale linear; opacity linear; visible STEP-hold).
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {import('./motionKeyValue.js').MotionKeyValue} [fallback]
 * @returns {import('./motionKeyValue.js').MotionKeyValue}
 */
export function sampleMotionBag(store, timeSec, fallback = emptyMotionKeyValue()) {
  const keys = store.list();
  const fb = asMotionKeyValue(fallback);
  if (!keys.length) return fb;

  if (timeSec <= keys[0].timeSec) {
    return asMotionKeyValue(keys[0].value, fb);
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const av = asMotionKeyValue(a.value, fb);
      const bv = asMotionKeyValue(b.value, fb);
      if (a.interpolation === INTERPOLATION.STEP) return av;
      const span = b.timeSec - a.timeSec;
      const u = span < 1e-9 ? 0 : easedUnit((timeSec - a.timeSec) / span, a.interpolation);
      return {
        position: lerp3(av.position, bv.position, u),
        rotation: lerp3(av.rotation, bv.rotation, u),
        scale: lerp3(av.scale, bv.scale, u),
        opacity: av.opacity + (bv.opacity - av.opacity) * u,
        // visible holds until next key (like v3 STEP)
        visible: av.visible,
      };
    }
  }

  return asMotionKeyValue(keys[keys.length - 1].value, fb);
}

/** @param {number[]} a @param {number[]} b @param {number} u */
function lerp3(a, b, u) {
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}

/** v3 parity: Smooth uses smoothstep ease-in/out, Linear stays constant speed. */
function easedUnit(u, interpolation) {
  const t = Math.min(1, Math.max(0, Number(u) || 0));
  if (interpolation === INTERPOLATION.SMOOTH) {
    return t * t * (3 - 2 * t);
  }
  return t;
}

/** @param {any} v @param {number[]} fb */
function asVec3(v, fb) {
  if (Array.isArray(v) && v.length >= 3) {
    return [Number(v[0]), Number(v[1]), Number(v[2])];
  }
  if (v && typeof v === 'object' && 'x' in v) {
    return [Number(v.x), Number(v.y), Number(v.z)];
  }
  return fb.slice();
}
