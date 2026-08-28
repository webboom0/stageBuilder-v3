import { INTERPOLATION } from './types.js';

let _nextId = 1;
export function newKeyframeId() {
  return `kf_${_nextId++}`;
}

/** Same-time key collision epsilon (seconds) — half frame @ 30fps */
export const KEYFRAME_TIME_EPS = 1 / 60;

/** Snap to timeline frame grid so +키 / playhead agree on "same time". */
export function snapKeyframeTimeSec(timeSec, fps = 30) {
  if (!Number.isFinite(timeSec)) return 0;
  const f = Math.max(1, Number(fps) || 30);
  const step = 1 / f;
  return Math.round(timeSec / step) * step;
}

export function keyframeTimeEps(fps = 30) {
  return Math.max(KEYFRAME_TIME_EPS, 0.5 / Math.max(1, Number(fps) || 30));
}

/**
 * Ordered keyframe list for one track. Times are absolute seconds.
 * @typedef {{ id: string, timeSec: number, value: any, interpolation: number }} Keyframe
 */
export class KeyframeStore {
  constructor() {
    /** @type {Keyframe[]} */
    this._keys = [];
  }

  get length() {
    return this._keys.length;
  }

  /** @returns {ReadonlyArray<Keyframe>} */
  list() {
    return this._keys;
  }

  /** @param {string} id */
  get(id) {
    return this._keys.find((k) => k.id === id) ?? null;
  }

  /**
   * Find key at approximately the same time (no stacking).
   * @param {number} timeSec
   * @param {{ eps?: number, excludeId?: string | null }} [opt]
   */
  findAtTime(timeSec, opt = {}) {
    const eps = opt.eps ?? KEYFRAME_TIME_EPS;
    const excludeId = opt.excludeId ?? null;
    if (!Number.isFinite(timeSec)) return null;
    return this._keys.find(
      (k) => k.id !== excludeId && Math.abs(k.timeSec - timeSec) <= eps,
    ) ?? null;
  }

  /**
   * @param {{ timeSec: number, value: any, interpolation?: number, id?: string }} input
   */
  add(input) {
    const kf = {
      id: input.id ?? newKeyframeId(),
      timeSec: Number(input.timeSec),
      value: cloneValue(input.value),
      interpolation: input.interpolation ?? INTERPOLATION.LINEAR,
    };
    if (!Number.isFinite(kf.timeSec) || kf.timeSec < 0) {
      throw new Error('Keyframe timeSec must be a non-negative number');
    }
    const existing = this.findAtTime(kf.timeSec, { excludeId: kf.id });
    if (existing) {
      throw new Error(`Keyframe already exists at ${existing.timeSec}s`);
    }
    this._keys.push(kf);
    this._sort();
    return { ...kf, value: cloneValue(kf.value) };
  }

  /** @param {string} id */
  remove(id) {
    const i = this._keys.findIndex((k) => k.id === id);
    if (i < 0) return null;
    const [removed] = this._keys.splice(i, 1);
    return removed;
  }

  /**
   * @param {string} id
   * @param {Partial<Pick<Keyframe, 'timeSec' | 'value' | 'interpolation'>>} patch
   */
  update(id, patch) {
    const kf = this.get(id);
    if (!kf) return null;
    if (patch.timeSec !== undefined) {
      if (!Number.isFinite(patch.timeSec) || patch.timeSec < 0) {
        throw new Error('Keyframe timeSec must be a non-negative number');
      }
      const clash = this.findAtTime(patch.timeSec, { excludeId: id });
      if (clash) return null;
      kf.timeSec = patch.timeSec;
    }
    if (patch.value !== undefined) kf.value = cloneValue(patch.value);
    if (patch.interpolation !== undefined) kf.interpolation = patch.interpolation;
    this._sort();
    return { ...kf, value: cloneValue(kf.value) };
  }

  /**
   * @param {number} oldDuration
   * @param {number} newDuration
   * @param {'scaleAll' | 'clampEnd'} mode
   */
  applyDurationChange(oldDuration, newDuration, mode) {
    if (oldDuration <= 0 || newDuration <= 0) return;
    if (mode === 'scaleAll') {
      const scale = newDuration / oldDuration;
      for (const kf of this._keys) {
        kf.timeSec = Math.min(newDuration, kf.timeSec * scale);
      }
    } else {
      this._keys = this._keys.filter((kf) => kf.timeSec <= newDuration + 1e-9);
      for (const kf of this._keys) {
        kf.timeSec = Math.min(kf.timeSec, newDuration);
      }
    }
    this._sort();
  }

  clear() {
    this._keys = [];
  }

  /** Deep snapshot for undo */
  snapshot() {
    return this._keys.map((k) => ({
      id: k.id,
      timeSec: k.timeSec,
      value: cloneValue(k.value),
      interpolation: k.interpolation,
    }));
  }

  /** @param {Keyframe[]} keys */
  restore(keys) {
    this._keys = keys.map((k) => ({
      id: k.id,
      timeSec: k.timeSec,
      value: cloneValue(k.value),
      interpolation: k.interpolation,
    }));
    this._sort();
  }

  _sort() {
    this._keys.sort((a, b) => a.timeSec - b.timeSec || a.id.localeCompare(b.id));
  }
}

function cloneValue(v) {
  if (Array.isArray(v)) return v.slice();
  if (v && typeof v === 'object') return { ...v };
  return v;
}
