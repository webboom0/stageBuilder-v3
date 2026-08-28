import { INTERPOLATION } from '../timeline/types.js';
import { hexToRgb01, rgb01ToHex } from './houseStageLights.js';

/**
 * @typedef {{
 *   dim: number,
 *   color: string,
 *   size: number,
 * }} LightKeyValue
 */

/** @returns {LightKeyValue} */
export function emptyLightKeyValue() {
  return {
    dim: 0,
    color: '#ffffff',
    size: 0.5,
  };
}

/**
 * @param {any} raw
 * @param {LightKeyValue} [fallback]
 * @returns {LightKeyValue}
 */
export function asLightKeyValue(raw, fallback = emptyLightKeyValue()) {
  const fb = fallback;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { dim: fb.dim, color: fb.color, size: fb.size };
  }
  let color = fb.color;
  if (typeof raw.color === 'string' && raw.color) {
    color = raw.color;
  } else if (raw.r != null || raw.g != null || raw.b != null) {
    color = rgb01ToHex(raw.r ?? 1, raw.g ?? 1, raw.b ?? 1);
  }
  let dim = Number(raw.dim);
  if (!Number.isFinite(dim)) dim = fb.dim;
  // v3 capture used 0–100
  if (dim > 1.0001) dim /= 100;
  dim = Math.max(0, Math.min(1, dim));

  let size = Number(raw.size);
  if (!Number.isFinite(size)) size = fb.size;
  if (size > 1.0001) size /= 100;
  size = Math.max(0, Math.min(1, size));

  return { dim, color, size };
}

/**
 * Sample compound light keys (dim/size linear; color rgb lerp).
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {LightKeyValue} [fallback]
 * @returns {LightKeyValue}
 */
export function sampleLightBag(store, timeSec, fallback = emptyLightKeyValue()) {
  const keys = store.list();
  const fb = asLightKeyValue(fallback);
  if (!keys.length) return fb;

  // Before first cue → off (HOUSE / Fill / FOH)
  if (timeSec < keys[0].timeSec - 1e-6) {
    const first = asLightKeyValue(keys[0].value, fb);
    return { ...first, dim: 0 };
  }

  if (timeSec <= keys[0].timeSec) {
    return asLightKeyValue(keys[0].value, fb);
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const av = asLightKeyValue(a.value, fb);
      const bv = asLightKeyValue(b.value, fb);
      if (a.interpolation === INTERPOLATION.STEP) return av;
      const span = b.timeSec - a.timeSec;
      const u = span < 1e-9 ? 0 : easedUnit((timeSec - a.timeSec) / span, a.interpolation);
      const ca = hexToRgb01(av.color);
      const cb = hexToRgb01(bv.color);
      return {
        dim: av.dim + (bv.dim - av.dim) * u,
        size: av.size + (bv.size - av.size) * u,
        color: rgb01ToHex(
          ca.r + (cb.r - ca.r) * u,
          ca.g + (cb.g - ca.g) * u,
          ca.b + (cb.b - ca.b) * u,
        ),
      };
    }
  }

  return asLightKeyValue(keys[keys.length - 1].value, fb);
}

function easedUnit(u, interpolation) {
  const t = Math.min(1, Math.max(0, Number(u) || 0));
  if (interpolation === INTERPOLATION.SMOOTH) {
    return t * t * (3 - 2 * t);
  }
  return t;
}

export { INTERPOLATION };
