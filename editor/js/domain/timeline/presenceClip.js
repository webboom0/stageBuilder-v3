import { snapKeyframeTimeSec } from './KeyframeStore.js';
import { cmdAddKeyframe } from './KeyframeCommands.js';
import { INTERPOLATION } from './types.js';
import { asMotionKeyValue } from '../motion/motionKeyValue.js';
import { sampleMotionBag } from '../motion/sampleTracks.js';

/** Default enter / exit margins (seconds) — group bake may use these; manual clips use 0. */
export const DEFAULT_LEAD_IN_SEC = 3;
export const DEFAULT_LEAD_OUT_SEC = 3;

/** Default span for manually seeded motion/stage tracks (start key → end key). */
export const DEFAULT_CLIP_DURATION_SEC = 10;

const MIN_LEAD_SEC = 0.1;
const MIN_BODY_SEC = 0.05;

/**
 * @typedef {{
 *   startSec: number,
 *   leadInSec: number,
 *   leadOutSec: number,
 *   bodyInSec?: number | null,
 *   bodyOutSec?: number | null,
 *   enterPose?: { x: number, z: number, rotY?: number, opacity?: number } | null,
 *   exitPose?: { x: number, z: number, rotY?: number } | null,
 * }} PresenceClip
 */

/**
 * @param {Partial<PresenceClip> | null | undefined} raw
 * @param {{ fps?: number, keys?: import('./KeyframeStore.js').KeyframeStore | null }} [ctx]
 * @returns {PresenceClip | null}
 */
export function normalizePresenceClip(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const fps = ctx.fps ?? 30;
  const keys = ctx.keys?.list?.() ?? [];
  const leadInSec = clampLead(raw.leadInSec ?? DEFAULT_LEAD_IN_SEC);
  const leadOutSec = clampLead(raw.leadOutSec ?? DEFAULT_LEAD_OUT_SEC);
  const startSec = Math.max(0, snapKeyframeTimeSec(Number(raw.startSec) || 0, fps));
  let bodyInSec = Number.isFinite(Number(raw.bodyInSec)) ? Number(raw.bodyInSec) : null;
  let bodyOutSec = Number.isFinite(Number(raw.bodyOutSec)) ? Number(raw.bodyOutSec) : null;

  if (keys.length) {
    const firstT = keys[0].timeSec;
    const lastT = keys[keys.length - 1].timeSec;
    if (bodyInSec == null) bodyInSec = firstT;
    if (bodyOutSec == null) bodyOutSec = lastT;
    bodyInSec = snapKeyframeTimeSec(bodyInSec, fps);
    bodyOutSec = snapKeyframeTimeSec(Math.max(bodyInSec, bodyOutSec), fps);
  } else {
    const inSec = startSec + leadInSec;
    if (bodyInSec == null) bodyInSec = inSec;
    if (bodyOutSec == null) bodyOutSec = bodyInSec;
  }

  // Body must sit inside envelope; in/out edges follow body + leads.
  const inSec = bodyInSec;
  const outSec = bodyOutSec;
  const impliedStart = Math.max(0, inSec - leadInSec);
  const start = Math.abs(impliedStart - startSec) < 0.02 ? startSec : impliedStart;

  /** @type {PresenceClip} */
  const clip = {
    startSec: snapKeyframeTimeSec(start, fps),
    leadInSec,
    leadOutSec,
    bodyInSec: inSec,
    bodyOutSec: outSec,
    enterPose: sanitizePose(raw.enterPose),
    exitPose: sanitizeExitPose(raw.exitPose),
  };
  return clip;
}

/** @param {PresenceClip} clip */
export function presenceInSec(clip) {
  return clip.bodyInSec ?? (clip.startSec + clip.leadInSec);
}

/** @param {PresenceClip} clip */
export function presenceOutSec(clip) {
  return clip.bodyOutSec ?? presenceInSec(clip);
}

/** @param {PresenceClip} clip */
export function presenceEndSec(clip) {
  return presenceOutSec(clip) + clip.leadOutSec;
}

/**
 * Keys must live inside body only — clamp/warn on load.
 * @param {import('./KeyframeStore.js').KeyframeStore} keys
 * @param {PresenceClip} clip
 * @param {number} [fps]
 */
export function assertKeysInsideBody(keys, clip, fps = 30) {
  const inSec = presenceInSec(clip);
  const outSec = presenceOutSec(clip);
  const eps = 1 / Math.max(fps, 1);
  for (const kf of keys.list()) {
    if (kf.timeSec < inSec - eps || kf.timeSec > outSec + eps) {
      return false;
    }
  }
  return true;
}

/**
 * Build presence clip from legacy baked keys (v4 pre-clip or v3 import).
 * @param {import('./KeyframeStore.js').KeyframeStore} keys
 * @param {number} [fps]
 * @returns {PresenceClip | null}
 */
export function inferPresenceFromKeys(keys, fps = 30) {
  const list = keys?.list?.() ?? [];
  if (!list.length) return null;

  const first = list[0];
  const last = list[list.length - 1];
  let bodyInSec = first.timeSec;
  let bodyOutSec = last.timeSec;
  let leadOutSec = DEFAULT_LEAD_OUT_SEC;
  /** @type {PresenceClip['exitPose'] | null} */
  let exitPose = null;

  const lastBag = asMotionKeyValue(last.value);
  const firstBag = asMotionKeyValue(first.value);
  const hasExitKey = lastBag.visible === false || lastBag.opacity <= 0.05;

  if (hasExitKey && list.length >= 2) {
    const prev = list[list.length - 2];
    bodyOutSec = prev.timeSec;
    leadOutSec = Math.max(MIN_LEAD_SEC, last.timeSec - prev.timeSec);
    exitPose = {
      x: lastBag.position[0],
      z: lastBag.position[2],
      rotY: (lastBag.rotation[1] * 180) / Math.PI,
    };
  }

  let leadInSec = DEFAULT_LEAD_IN_SEC;
  let enterPose = null;
  if (firstBag.opacity <= 0.05 && list.length >= 2) {
    const second = list[1];
    bodyInSec = second.timeSec;
    leadInSec = Math.max(MIN_LEAD_SEC, second.timeSec - first.timeSec);
    enterPose = {
      x: firstBag.position[0],
      z: firstBag.position[2],
      rotY: (firstBag.rotation[1] * 180) / Math.PI,
      opacity: firstBag.opacity,
    };
  }

  const startSec = Math.max(0, bodyInSec - leadInSec);
  return normalizePresenceClip({
    startSec,
    leadInSec,
    leadOutSec,
    bodyInSec,
    bodyOutSec,
    enterPose,
    exitPose,
  }, { fps, keys });
}

/**
 * After segment bake — body keys already at absolute times.
 * @param {{
 *   startSec: number,
 *   leadInSec?: number,
 *   leadOutSec?: number,
 *   bodyInSec: number,
 *   bodyOutSec: number,
 *   enterPose?: PresenceClip['enterPose'],
 *   exitPose?: PresenceClip['exitPose'],
 * }} opts
 * @param {number} [fps]
 */
export function presenceClipFromBake(opts, fps = 30) {
  return normalizePresenceClip({
    startSec: opts.startSec,
    leadInSec: opts.leadInSec ?? DEFAULT_LEAD_IN_SEC,
    leadOutSec: opts.leadOutSec ?? DEFAULT_LEAD_OUT_SEC,
    bodyInSec: opts.bodyInSec,
    bodyOutSec: opts.bodyOutSec,
    enterPose: opts.enterPose ?? null,
    exitPose: opts.exitPose ?? null,
  }, { fps });
}

/**
 * Move clip + body keys together.
 * @param {import('./Track.js').Track} track
 * @param {number} deltaSec
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 */
export function shiftPresenceClip(track, deltaSec, engine) {
  if (!track.presenceClip || Math.abs(deltaSec) < 1e-9) return;
  const fps = engine.fps;
  let d = snapKeyframeTimeSec(deltaSec, fps);
  const newStart = track.presenceClip.startSec + d;
  if (newStart < 0) {
    d = snapKeyframeTimeSec(-track.presenceClip.startSec, fps);
  }
  if (Math.abs(d) < 1e-9) return;
  const clip = track.presenceClip;
  clip.startSec = snapKeyframeTimeSec(clip.startSec + d, fps);
  if (clip.bodyInSec != null) clip.bodyInSec = snapKeyframeTimeSec(clip.bodyInSec + d, fps);
  if (clip.bodyOutSec != null) clip.bodyOutSec = snapKeyframeTimeSec(clip.bodyOutSec + d, fps);
  for (const kf of track.keys.list()) {
    kf.timeSec = snapKeyframeTimeSec(kf.timeSec + d, fps);
  }
  track.presenceClip = normalizePresenceClip(clip, { fps, keys: track.keys });
}

/**
 * Minimum time for the exit (last) key when trimming the clip end.
 * Stays strictly after the previous key so interior keys are not orphaned.
 * @param {import('./Track.js').Track} track
 * @param {number} [fps]
 */
export function minPresenceClipEndSec(track, fps = 30) {
  const keys = track.keys?.list?.() ?? [];
  if (!keys.length) return MIN_BODY_SEC;
  let min = keys[0].timeSec + MIN_BODY_SEC;
  for (let i = 0; i < keys.length - 1; i++) {
    min = Math.max(min, keys[i].timeSec + MIN_BODY_SEC);
  }
  return snapKeyframeTimeSec(min, fps);
}

/**
 * Right handle — move exit (last key) time; clip end follows.
 * @param {import('./Track.js').Track} track
 * @param {number} deltaSec
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 */
export function resizePresenceClipEnd(track, deltaSec, engine) {
  if (!track.presenceClip || Math.abs(deltaSec) < 1e-9) return;
  const fps = engine.fps;
  const keys = track.keys.list();
  if (!keys.length) return;
  const last = keys[keys.length - 1];
  const d = snapKeyframeTimeSec(deltaSec, fps);
  const minOut = minPresenceClipEndSec(track, fps);
  const maxOut = engine.durationSec;
  const newLast = snapKeyframeTimeSec(
    Math.min(maxOut, Math.max(minOut, last.timeSec + d)),
    fps,
  );
  if (Math.abs(newLast - last.timeSec) < 1e-9) return;
  last.timeSec = newLast;
  syncPresenceClipFromKeys(track, fps);
}

/**
 * Sync clip envelope from first/last keys (no lead margins).
 * @param {import('./Track.js').Track} track
 * @param {number} [fps]
 */
export function syncPresenceClipFromKeys(track, fps = 30) {
  if (!supportsPresenceClip(track)) return null;
  const keys = track.keys.list();
  if (!keys.length) return null;
  const first = keys[0];
  const last = keys[keys.length - 1];
  track.presenceClip = presenceClipFromBake({
    startSec: first.timeSec,
    leadInSec: 0,
    leadOutSec: 0,
    bodyInSec: first.timeSec,
    bodyOutSec: last.timeSec,
    enterPose: null,
    exitPose: null,
  }, fps);
  syncMotionExitKeyVisibility(track);
  return track.presenceClip;
}

/**
 * Presence tracks: only the last key is exit (visible false); all others visible true.
 * Opacity handles fade; visible is not user-edited on body keys.
 * @param {import('./Track.js').Track} track
 */
export function syncMotionExitKeyVisibility(track) {
  if (!supportsPresenceClip(track)) return;
  const list = track.keys.list();
  if (!list.length) return;

  if (list.length === 1) {
    const bag = asMotionKeyValue(list[0].value);
    if (!bag.visible) {
      list[0].value = asMotionKeyValue({ ...bag, visible: true });
    }
    return;
  }

  for (let i = 0; i < list.length; i++) {
    const shouldVisible = i < list.length - 1;
    const bag = asMotionKeyValue(list[i].value);
    if (bag.visible === shouldVisible) continue;
    list[i].value = asMotionKeyValue({ ...bag, visible: shouldVisible });
  }
}

/**
 * New motion/stage track: visible start key + hidden end key ~10s later.
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {import('./Track.js').Track} track
 * @param {import('../motion/motionKeyValue.js').MotionKeyValue | any} keyValue
 * @param {number} startSec
 */
export function seedDefaultMotionTrackKeys(engine, track, keyValue, startSec) {
  const fps = engine.fps;
  const t0 = snapKeyframeTimeSec(Math.max(0, startSec), fps);
  const t1 = snapKeyframeTimeSec(
    Math.min(engine.durationSec, t0 + DEFAULT_CLIP_DURATION_SEC),
    fps,
  );
  const base = asMotionKeyValue(keyValue);
  const startBag = asMotionKeyValue({ ...base, opacity: 1, visible: true });
  const endBag = asMotionKeyValue({ ...base, opacity: 1, visible: false });

  cmdAddKeyframe(engine, {
    trackId: track.id,
    timeSec: t0,
    value: startBag,
    interpolation: INTERPOLATION.LINEAR,
  });
  cmdAddKeyframe(engine, {
    trackId: track.id,
    timeSec: t1,
    value: endBag,
    interpolation: INTERPOLATION.LINEAR,
  });
  syncPresenceClipFromKeys(track, fps);
  engine.emit('keys');
  engine.emit('tracks');
}

/**
 * Manual workflow: create clip on first key, expand body when adding keys outside body.
 * Group/pattern bake overwrites with presenceClipFromBake afterward.
 * @param {import('./Track.js').Track} track
 * @param {number} [fps]
 * @param {number | null} [atTimeSec]
 * @returns {PresenceClip | null}
 */
export function ensurePresenceClipForTrack(track, fps = 30, atTimeSec = null) {
  if (!supportsPresenceClip(track)) return null;
  const keys = track.keys.list();
  if (!keys.length) return null;

  const first = keys[0];
  const last = keys[keys.length - 1];

  if (!track.presenceClip) {
    let bodyInSec = first.timeSec;
    let bodyOutSec = last.timeSec;
    if (atTimeSec != null && Number.isFinite(atTimeSec)) {
      bodyInSec = Math.min(bodyInSec, atTimeSec);
      bodyOutSec = Math.max(bodyOutSec, atTimeSec);
    }
    track.presenceClip = presenceClipFromBake({
      startSec: Math.max(0, bodyInSec),
      leadInSec: 0,
      leadOutSec: 0,
      bodyInSec,
      bodyOutSec,
      enterPose: null,
      exitPose: null,
    }, fps);
    return track.presenceClip;
  }

  if (atTimeSec == null || !Number.isFinite(atTimeSec)) {
    return track.presenceClip;
  }

  const curIn = presenceInSec(track.presenceClip);
  const curOut = presenceOutSec(track.presenceClip);
  const eps = 1 / Math.max(fps, 1);
  if (atTimeSec >= curIn - eps && atTimeSec <= curOut + eps) {
    return track.presenceClip;
  }

  const clip = { ...track.presenceClip };
  clip.bodyInSec = snapKeyframeTimeSec(Math.min(curIn, atTimeSec), fps);
  clip.bodyOutSec = snapKeyframeTimeSec(Math.max(curOut, atTimeSec), fps);
  clip.startSec = clip.bodyInSec;
  clip.leadInSec = 0;
  clip.leadOutSec = 0;
  track.presenceClip = normalizePresenceClip(clip, { fps, keys: track.keys });
  return track.presenceClip;
}

/**
 * Sample motion with presence envelope (gate + lead in/out lerp).
 * @param {import('./KeyframeStore.js').KeyframeStore} keys
 * @param {PresenceClip} clip
 * @param {number} timeSec
 * @param {import('../motion/motionKeyValue.js').MotionKeyValue} fallback
 * @param {number} [feetY]
 */
export function samplePresenceMotion(keys, clip, timeSec, fallback, feetY = null) {
  const fb = asMotionKeyValue(fallback);
  const inSec = presenceInSec(clip);
  const outSec = presenceOutSec(clip);
  const endSec = presenceEndSec(clip);
  const startSec = clip.startSec;

  if (timeSec < startSec - 1e-6 || timeSec > endSec + 1e-6) {
    return { ...fb, visible: false, opacity: 0 };
  }

  const bodyBag = (t) => sampleMotionBag(keys, t, fb);
  const firstBody = bodyBag(inSec);
  const lastBody = bodyBag(outSec);

  if (timeSec >= inSec - 1e-6 && timeSec <= outSec + 1e-6) {
    return bodyBag(timeSec);
  }

  if (clip.leadInSec < 1e-6 && clip.leadOutSec < 1e-6) {
    return { ...fb, visible: false, opacity: 0 };
  }

  if (timeSec < inSec) {
    const lead = clip.leadInSec;
    const u = lead < 1e-6 ? 1 : Math.min(1, Math.max(0, (timeSec - startSec) / lead));
    const from = clip.enterPose
      ? poseToBag(clip.enterPose, feetY ?? firstBody.position[1], firstBody)
      : { ...firstBody, opacity: 0, visible: true };
    return lerpBags(from, firstBody, smoothstep(u), feetY);
  }

  // lead out
  const lead = clip.leadOutSec;
  const u = lead < 1e-6 ? 1 : Math.min(1, Math.max(0, (timeSec - outSec) / lead));
  const to = clip.exitPose
    ? poseToBag(clip.exitPose, feetY ?? lastBody.position[1], lastBody)
    : { ...lastBody, opacity: 0, visible: false };
  const bag = lerpBags(lastBody, to, smoothstep(u), feetY);
  if (u >= 1 - 1e-6) return { ...bag, visible: false, opacity: 0 };
  return { ...bag, visible: true };
}

/**
 * Strip exit/enter keys that were baked into legacy tracks after migration.
 * @param {import('./KeyframeStore.js').KeyframeStore} keys
 * @param {number} [fps]
 */
export function stripLegacyEdgeKeys(keys, fps = 30) {
  const list = keys.list();
  if (!list.length) return;
  const last = list[list.length - 1];
  const lastBag = asMotionKeyValue(last.value);
  if (lastBag.visible === false || lastBag.opacity <= 0.05) {
    keys.remove(last.id);
  }
  const next = keys.list();
  if (next.length >= 2) {
    const first = next[0];
    const fb = asMotionKeyValue(first.value);
    if (fb.opacity <= 0.05) {
      keys.remove(first.id);
    }
  }
}

/** @param {import('./Track.js').Track} track */
export function supportsPresenceClip(track) {
  return track?.kind === 'motion'
    || String(track?.group || '').startsWith('motion:')
    || String(track?.group || '').startsWith('stage:');
}

function clampLead(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_LEAD_IN_SEC;
  return Math.min(120, Math.max(MIN_LEAD_SEC, n));
}

/** @param {any} p */
function sanitizePose(p) {
  if (!p || typeof p !== 'object') return null;
  if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.z))) return null;
  return {
    x: Number(p.x),
    z: Number(p.z),
    rotY: Number.isFinite(Number(p.rotY)) ? Number(p.rotY) : 0,
    opacity: Number.isFinite(Number(p.opacity)) ? Number(p.opacity) : 0,
  };
}

/** @param {any} p */
function sanitizeExitPose(p) {
  const s = sanitizePose(p);
  if (!s) return null;
  return { x: s.x, z: s.z, rotY: s.rotY };
}

/** @param {NonNullable<PresenceClip['enterPose']>} pose @param {number} y @param {import('../motion/motionKeyValue.js').MotionKeyValue} ref */
function poseToBag(pose, y, ref) {
  const rotY = Number(pose.rotY) || 0;
  return asMotionKeyValue({
    position: [pose.x, y, pose.z],
    rotation: [0, (rotY * Math.PI) / 180, 0],
    scale: ref.scale,
    opacity: pose.opacity ?? 0,
    visible: true,
  }, ref);
}

/** @param {import('../motion/motionKeyValue.js').MotionKeyValue} a @param {import('../motion/motionKeyValue.js').MotionKeyValue} b @param {number} u @param {number | null} feetY */
function lerpBags(a, b, u, feetY) {
  const y = feetY ?? a.position[1];
  return {
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * u,
      y,
      a.position[2] + (b.position[2] - a.position[2]) * u,
    ],
    rotation: [
      a.rotation[0] + (b.rotation[0] - a.rotation[0]) * u,
      a.rotation[1] + (b.rotation[1] - a.rotation[1]) * u,
      a.rotation[2] + (b.rotation[2] - a.rotation[2]) * u,
    ],
    scale: [
      a.scale[0] + (b.scale[0] - a.scale[0]) * u,
      a.scale[1] + (b.scale[1] - a.scale[1]) * u,
      a.scale[2] + (b.scale[2] - a.scale[2]) * u,
    ],
    opacity: a.opacity + (b.opacity - a.opacity) * u,
    visible: u < 1 ? true : b.visible,
  };
}

function smoothstep(u) {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}
