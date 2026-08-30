import { normalizeRotYDeg } from './groupSegments.js';
import { normalizeMotionTemplate } from './motionTemplates.js';
import { trackKeyframesToPatternDraft } from './trackKeyframePattern.js';

/**
 * Convert a motion track's keyframes into a reusable pattern-library template
 * (offsets relative to the first key — applied with pose.fromX/fromZ on use).
 *
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 * @param {string} [label]
 */
export function trackToMotionTemplate(track, motionItem, label = '') {
  const draft = trackKeyframesToPatternDraft(track, motionItem);
  const keys = draft?.keyframes ?? [];
  if (keys.length < 2) return null;

  const first = keys[0];
  const baseX = Number(first.offsetX) || 0;
  const baseZ = Number(first.offsetZ) || 0;
  const baseRot = normalizeRotYDeg(first.deltaRotY ?? 0);

  let cumulative = 0;
  const keyframes = keys.map((kf, i) => {
    if (i > 0) cumulative += Math.max(0.1, Number(kf.timeOffset) || 0);
    const kind = kf.kind || (i === 0 ? 'move' : 'move');
    return {
      timeOffset: cumulative,
      offsetX: (Number(kf.offsetX) || 0) - baseX,
      offsetZ: (Number(kf.offsetZ) || 0) - baseZ,
      deltaRotY: normalizeRotYDeg((Number(kf.deltaRotY) ?? baseRot) - baseRot),
      opacity: kind === 'exit' ? 0 : clamp01(kf.opacity ?? 1),
      visible: kind !== 'exit' && kf.visible !== false,
    };
  });

  const resolvedLabel = String(label || draft.label || track?.name || '패턴').trim() || '패턴';
  return normalizeMotionTemplate({
    label: resolvedLabel,
    opacity: keyframes[0]?.opacity ?? 1,
    keyframes,
  });
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
