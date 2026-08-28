import { INTERPOLATION } from '../timeline/types.js';
import { hexToRgb01, rgb01ToHex } from './houseStageLights.js';
import { mkFixtureAttr } from './fixtureTypes.js';

/**
 * Timeline compound bag for fixture tracks.
 * dim: 0–1 (UI %) · pan/tilt deg · zoom deg · focus 0–100 · color #hex
 *
 * @typedef {{
 *   dim: number,
 *   pan: number,
 *   tilt: number,
 *   zoom: number,
 *   focus: number,
 *   color: string,
 * }} FixtureKeyValue
 */

/** @returns {FixtureKeyValue} */
export function emptyFixtureKeyValue() {
  return {
    dim: 0,
    pan: 0,
    tilt: 35,
    zoom: 16,
    focus: 35,
    color: '#ffffff',
  };
}

/**
 * @param {any} raw
 * @param {FixtureKeyValue} [fallback]
 * @returns {FixtureKeyValue}
 */
export function asFixtureKeyValue(raw, fallback = emptyFixtureKeyValue()) {
  const fb = fallback;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...fb };
  }

  let color = fb.color;
  if (typeof raw.color === 'string' && raw.color) {
    color = raw.color.startsWith('#') ? raw.color : `#${raw.color}`;
  } else if (raw.r != null || raw.g != null || raw.b != null) {
    color = rgb01ToHex(raw.r ?? 1, raw.g ?? 1, raw.b ?? 1);
  }

  let dim = Number(raw.dim);
  if (!Number.isFinite(dim)) dim = fb.dim;
  if (dim > 1.0001) dim /= 100;
  dim = Math.max(0, Math.min(1, dim));

  let pan = Number(raw.pan);
  if (!Number.isFinite(pan)) pan = fb.pan;
  pan = Math.max(-270, Math.min(270, pan));

  let tilt = Number(raw.tilt);
  if (!Number.isFinite(tilt)) tilt = fb.tilt;
  tilt = Math.max(-120, Math.min(120, tilt));

  let zoom = Number(raw.zoom);
  if (!Number.isFinite(zoom)) zoom = fb.zoom;
  zoom = Math.max(5, Math.min(50, zoom));

  let focus = Number(raw.focus);
  if (!Number.isFinite(focus)) focus = fb.focus;
  focus = Math.max(0, Math.min(100, focus));

  return { dim, pan, tilt, zoom, focus, color };
}

/** Convert UI bag → FixtureEngine attr (dim 0–100, rgb). */
export function fixtureBagToEngineAttr(bag) {
  const v = asFixtureKeyValue(bag);
  const rgb = hexToRgb01(v.color);
  return mkFixtureAttr({
    dim: v.dim * 100,
    pan: v.pan,
    tilt: v.tilt,
    zoom: v.zoom,
    focus: v.focus,
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
  });
}

/** Engine attr → UI bag */
export function engineAttrToFixtureBag(attr) {
  const a = attr || {};
  let dim = Number(a.dim);
  if (!Number.isFinite(dim)) dim = 0;
  if (dim > 1.0001) dim /= 100;
  return asFixtureKeyValue({
    dim,
    pan: a.pan,
    tilt: a.tilt,
    zoom: a.zoom,
    focus: a.focus,
    r: a.r,
    g: a.g,
    b: a.b,
  });
}

function lerpAngleDeg(a, b, u) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * u;
}

function easedUnit(u, interpolation) {
  const t = Math.min(1, Math.max(0, Number(u) || 0));
  if (interpolation === INTERPOLATION.SMOOTH) {
    return t * t * (3 - 2 * t);
  }
  return t;
}

/**
 * @param {import('../timeline/KeyframeStore.js').KeyframeStore} store
 * @param {number} timeSec
 * @param {FixtureKeyValue} [fallback]
 * @returns {FixtureKeyValue}
 */
export function sampleFixtureBag(store, timeSec, fallback = emptyFixtureKeyValue()) {
  const keys = store.list();
  const fb = asFixtureKeyValue(fallback);
  if (!keys.length) return fb;

  // Before first cue → off (keep aim/color from first key so it snaps on cleanly)
  if (timeSec < keys[0].timeSec - 1e-6) {
    const first = asFixtureKeyValue(keys[0].value, fb);
    return { ...first, dim: 0 };
  }

  if (timeSec <= keys[0].timeSec) {
    return asFixtureKeyValue(keys[0].value, fb);
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const av = asFixtureKeyValue(a.value, fb);
      const bv = asFixtureKeyValue(b.value, fb);
      if (a.interpolation === INTERPOLATION.STEP) return av;
      const span = b.timeSec - a.timeSec;
      const u = span < 1e-9 ? 0 : easedUnit((timeSec - a.timeSec) / span, a.interpolation);
      const ca = hexToRgb01(av.color);
      const cb = hexToRgb01(bv.color);
      return {
        dim: av.dim + (bv.dim - av.dim) * u,
        pan: lerpAngleDeg(av.pan, bv.pan, u),
        tilt: lerpAngleDeg(av.tilt, bv.tilt, u),
        zoom: av.zoom + (bv.zoom - av.zoom) * u,
        focus: av.focus + (bv.focus - av.focus) * u,
        color: rgb01ToHex(
          ca.r + (cb.r - ca.r) * u,
          ca.g + (cb.g - ca.g) * u,
          ca.b + (cb.b - ca.b) * u,
        ),
      };
    }
  }

  return asFixtureKeyValue(keys[keys.length - 1].value, fb);
}

export { INTERPOLATION };
