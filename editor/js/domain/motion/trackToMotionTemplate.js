import { normalizeRotYDeg } from './groupSegments.js';
import { normalizeMotionTemplate } from './motionTemplates.js';
import { trackKeyframesToPatternDraft } from './trackKeyframePattern.js';
import { importTrackKeyframesToMotionAnim } from './motionAnim.js';

/**
 * Convert a motion track's keyframes into a pattern-library template.
 * Stores world-space coordinates and timeline start so library ↔ track round-trip matches.
 *
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 * @param {string} [label]
 * @param {{ presets?: { id?: string, x?: number, z?: number }[] }} [opts]
 */
export function trackToMotionTemplate(track, motionItem, label = '', opts = {}) {
  const draft = trackKeyframesToPatternDraft(track, motionItem);
  const keys = draft?.keyframes ?? [];
  if (keys.length < 2) return null;

  const presets = Array.isArray(opts.presets) ? opts.presets : [];
  const startTimeSec = Number(draft.startTimeSec) || 0;
  importTrackKeyframesToMotionAnim(track, motionItem, startTimeSec, { presets });
  const anim = motionItem?.anim;
  const presetIds = resolvePresetIdsForKeys(keys, anim);

  const first = keys[0];
  let cumulative = 0;
  const keyframes = keys.map((kf, i) => {
    if (i > 0) cumulative += Math.max(0.1, Number(kf.timeOffset) || 0);
    const kind = kf.kind || (i === 0 ? 'move' : 'move');
    return {
      timeOffset: cumulative,
      offsetX: Number(kf.offsetX) || 0,
      offsetZ: Number(kf.offsetZ) || 0,
      deltaRotY: normalizeRotYDeg(kf.deltaRotY ?? 0),
      opacity: clamp01(kf.opacity ?? 1),
      visible: kind === 'exit' ? false : kf.visible !== false,
      presetId: presetIds[i] ?? null,
    };
  });

  const resolvedLabel = String(label || draft.label || track?.name || '패턴').trim() || '패턴';
  return normalizeMotionTemplate({
    label: resolvedLabel,
    opacity: clamp01(first.opacity ?? 1),
    absoluteCoords: true,
    startTimeSec,
    fromX: Number(first.offsetX) || 0,
    fromZ: Number(first.offsetZ) || 0,
    fromRotY: normalizeRotYDeg(first.deltaRotY ?? 0),
    fromPresetId: presetIds[0] ?? null,
    keyframes,
  });
}

/**
 * @param {import('../../ui/keyframeTemplateUi.js').DraftKeyframe[]} absKeys
 * @param {import('./motionAnim.js').MotionAnim | null | undefined} anim
 * @returns {(string | null)[]}
 */
function resolvePresetIdsForKeys(absKeys, anim) {
  /** @type {(string | null)[]} */
  const ids = absKeys.map(() => null);
  if (!absKeys.length) return ids;

  if (anim?.fromPresetId) {
    ids[0] = anim.fromPresetId;
  }

  const segs = Array.isArray(anim?.segments) ? anim.segments : [];
  for (let i = 1; i < absKeys.length; i++) {
    const kf = absKeys[i];
    const kind = kf.kind || 'move';
    if (kind === 'hold') continue;
    const seg = segs[i - 1];
    if (seg?.anchorPresetId) {
      ids[i] = seg.anchorPresetId;
    }
  }

  return ids;
}

/**
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 */
export function canSaveTrackToPatternLibrary(track, motionItem) {
  if (!track || track.locked || track.kind !== 'motion' || !motionItem) return false;
  const draft = trackKeyframesToPatternDraft(track, motionItem);
  return (draft?.keyframes?.length ?? 0) >= 2;
}

/** @param {number} n */
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}
