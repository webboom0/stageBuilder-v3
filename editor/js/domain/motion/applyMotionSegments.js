import { applyGroupSegmentsToMotion } from './applyGroupSegments.js';
import { motionAnimAsGroup, ensureMotionAnim } from './motionAnim.js';

/**
 * Bake solo motion segment plan onto the object's timeline track.
 * Same pipeline as group GO (no formation offsets — 1 member / line).
 *
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motionItem: import('./MotionDirector.js').MotionItem,
 * }} opts
 */
export function applyMotionSegmentsToTrack(opts) {
  const { engine, motionItem } = opts;
  if (!motionItem) return false;
  ensureMotionAnim(motionItem);
  const group = motionAnimAsGroup(motionItem);
  return applyGroupSegmentsToMotion({
    engine,
    motionItem,
    group,
    memberIndex: 0,
    feetY: motionItem.object.position.y,
  });
}
