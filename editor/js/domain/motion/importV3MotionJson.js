import { INTERPOLATION } from '../timeline/types.js';
import { asMotionKeyValue, emptyMotionKeyValue } from './motionKeyValue.js';

/**
 * Convert v3 MotionTimeline JSON (`tracks` + optional `clips` / `visible` / `maxTime`)
 * into v4 compound motion key lists.
 *
 * v3 key sample:
 * `{ time, position:{x,y,z,interpolation}, rotation, scale }`
 * plus optional sibling `visible` map and clip ranges.
 *
 * @param {any} raw
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   maxTimeSec: number,
 *   frameRate: number | null,
 *   tracks: Array<{
 *     sourceId: string,
 *     keys: Array<{ timeSec: number, value: import('./motionKeyValue.js').MotionKeyValue, interpolation: number }>,
 *     clip?: { startSec: number, endSec: number } | null,
 *   }>,
 * }}
 */
export function importV3MotionJson(raw) {
  const data = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'JSON 객체가 필요합니다.', maxTimeSec: 0, frameRate: null, tracks: [] };
  }

  const trackMap = data.tracks && typeof data.tracks === 'object' ? data.tracks : null;
  if (!trackMap) {
    return { ok: false, error: 'v3 형식: tracks 필드가 없습니다.', maxTimeSec: 0, frameRate: null, tracks: [] };
  }

  const visibleMap = data.visible && typeof data.visible === 'object' ? data.visible : {};
  const clipsMap = data.clips && typeof data.clips === 'object' ? data.clips : {};
  const maxTimeSec = Number.isFinite(Number(data.maxTime)) ? Number(data.maxTime) : 0;
  const frameRate = Number.isFinite(Number(data.frameRate)) ? Number(data.frameRate) : null;

  /** @type {ReturnType<typeof importV3MotionJson>['tracks']} */
  const tracks = [];

  for (const [sourceId, keysRaw] of Object.entries(trackMap)) {
    if (!Array.isArray(keysRaw)) continue;
    const byTime = new Map();

    for (const row of keysRaw) {
      if (!row || typeof row !== 'object') continue;
      const timeSec = Number(row.time);
      if (!Number.isFinite(timeSec) || timeSec < 0) continue;
      const key = roundTime(timeSec);
      const prev = byTime.get(key) || {
        timeSec: key,
        value: emptyMotionKeyValue(),
        interpolation: INTERPOLATION.LINEAR,
      };
      const bag = { ...prev.value };
      if (row.position) bag.position = xyz(row.position, bag.position);
      if (row.rotation) bag.rotation = xyz(row.rotation, bag.rotation);
      if (row.scale) bag.scale = xyz(row.scale, bag.scale);
      if (row.opacity !== undefined) bag.opacity = clamp01(Number(row.opacity));
      if (row.visible !== undefined) bag.visible = !!row.visible;
      const interp = firstInterp(row) ?? prev.interpolation;
      byTime.set(key, {
        timeSec: key,
        value: asMotionKeyValue(bag),
        interpolation: interp,
      });
    }

    // visible.* keyframes
    const vis = visibleMap[sourceId];
    const visKeys = Array.isArray(vis?.keyframes) ? vis.keyframes
      : Array.isArray(vis) ? vis
        : [];
    for (const vk of visKeys) {
      const timeSec = Number(vk?.time);
      if (!Number.isFinite(timeSec) || timeSec < 0) continue;
      const key = roundTime(timeSec);
      const on = vk.value !== undefined ? !!vk.value : true;
      const prev = byTime.get(key) || {
        timeSec: key,
        value: emptyMotionKeyValue(),
        interpolation: INTERPOLATION.STEP,
      };
      const bag = { ...prev.value, visible: on, opacity: on ? Math.max(prev.value.opacity, 1) : 0 };
      byTime.set(key, {
        timeSec: key,
        value: asMotionKeyValue(bag),
        interpolation: INTERPOLATION.STEP,
      });
    }

    const clip = normalizeClip(clipsMap[sourceId], maxTimeSec);
    if (clip) {
      // Soft presence from clip window (v3 clip width ≈ visibility)
      ensurePresenceEdge(byTime, clip.startSec, true);
      ensurePresenceEdge(byTime, clip.endSec, false);
    }

    const keys = [...byTime.values()].sort((a, b) => a.timeSec - b.timeSec);
    if (keys.length === 0) continue;
    tracks.push({ sourceId, keys, clip });
  }

  if (tracks.length === 0) {
    return { ok: false, error: '변환할 모션 키가 없습니다.', maxTimeSec, frameRate, tracks: [] };
  }

  return { ok: true, maxTimeSec, frameRate, tracks };
}

/**
 * Replace all keys on a v4 motion track with imported keys (undoable per-key via engine API).
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   trackId: string,
 *   keys: Array<{ timeSec: number, value: any, interpolation?: number }>,
 *   extendDuration?: boolean,
 * }} opts
 * @returns {{ added: number, cleared: number }}
 */
export function applyImportedKeysToTrack(opts) {
  const { engine, trackId, keys } = opts;
  const track = engine.getTrack(trackId);
  if (!track || track.locked) return { added: 0, cleared: 0 };

  const existing = [...track.keys.list()];
  for (const k of existing) {
    engine.removeKeyframe(trackId, k.id);
  }

  let maxT = 0;
  let added = 0;
  for (const row of keys) {
    const t = Number(row.timeSec);
    if (!Number.isFinite(t) || t < 0) continue;
    maxT = Math.max(maxT, t);
    try {
      engine.addKeyframe(
        trackId,
        t,
        asMotionKeyValue(row.value),
        row.interpolation ?? INTERPOLATION.LINEAR,
      );
      added += 1;
    } catch (err) {
      // Same-time collision — edit instead
      const hit = track.keys.findAtTime(t);
      if (hit) {
        engine.editKeyframe(trackId, hit.id, {
          value: asMotionKeyValue(row.value),
          interpolation: row.interpolation ?? INTERPOLATION.LINEAR,
        });
        added += 1;
      } else {
        console.warn('[importV3]', err);
      }
    }
  }

  if (opts.extendDuration !== false && maxT > engine.durationSec) {
    engine.setDuration(Math.ceil(maxT + 1), 'clampEnd');
  }

  engine.emit('keys');
  return { added, cleared: existing.length };
}

/** @param {string} text */
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @param {any} v @param {number[]} fb */
function xyz(v, fb) {
  if (Array.isArray(v) && v.length >= 3) {
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  }
  if (v && typeof v === 'object') {
    return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
  }
  return fb.slice(0, 3);
}

/** @param {any} row */
function firstInterp(row) {
  for (const k of ['position', 'rotation', 'scale']) {
    const n = Number(row?.[k]?.interpolation);
    if (Number.isFinite(n)) return n;
  }
  if (Number.isFinite(Number(row?.interpolation))) return Number(row.interpolation);
  return null;
}

/** @param {number} n */
function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/** @param {number} t */
function roundTime(t) {
  return Math.round(t * 1000) / 1000;
}

/**
 * @param {any} clip
 * @param {number} maxTimeSec
 * @returns {{ startSec: number, endSec: number } | null}
 */
function normalizeClip(clip, maxTimeSec) {
  if (!clip || typeof clip !== 'object') return null;
  if (Number.isFinite(Number(clip.duration)) && Number.isFinite(Number(clip.left))) {
    // left/width are often % of timeline UI; prefer duration + initialLeft when present
    const start = Number.isFinite(Number(clip.initialLeft))
      ? Number(clip.initialLeft)
      : (maxTimeSec > 0 ? (Number(clip.left) / 100) * maxTimeSec : 0);
    const dur = Number(clip.duration);
    if (dur > 0) return { startSec: Math.max(0, start), endSec: Math.max(0, start + dur) };
  }
  if (Number.isFinite(Number(clip.start)) && Number.isFinite(Number(clip.end))) {
    return { startSec: Number(clip.start), endSec: Number(clip.end) };
  }
  return null;
}

/**
 * @param {Map<number, any>} byTime
 * @param {number} timeSec
 * @param {boolean} on
 */
function ensurePresenceEdge(byTime, timeSec, on) {
  if (!Number.isFinite(timeSec) || timeSec < 0) return;
  const key = roundTime(timeSec);
  const prev = byTime.get(key) || {
    timeSec: key,
    value: emptyMotionKeyValue(),
    interpolation: INTERPOLATION.STEP,
  };
  const bag = {
    ...prev.value,
    visible: on,
    opacity: on ? (prev.value.opacity > 0 ? prev.value.opacity : 1) : 0,
  };
  byTime.set(key, {
    timeSec: key,
    value: asMotionKeyValue(bag),
    interpolation: INTERPOLATION.STEP,
  });
}
