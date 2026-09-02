import { applyGroupSegmentsToMotion } from './applyGroupSegments.js';
import { ensureGroupSegments, getGroupClipRange } from './groupSegments.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';

/** Playhead at pattern start after bake. */
export function groupBakePlayheadSec(group, engine) {
  ensureGroupSegments(group);
  const clip = getGroupClipRange(group, engine.durationSec);
  return snapKeyframeTimeSec(Math.max(0, Number(clip.startTime) || 0), engine.fps);
}

export function isGroupDeployed(group, getMotionItem) {
  if (!group?.members?.length) return false;
  return group.members.some((m) => {
    if (!m.deployedMotionId) return false;
    const item = getMotionItem(m.deployedMotionId);
    return !!item?.object;
  });
}

/**
 * Re-bake segment plan onto existing deployed members (no remove/recreate).
 *
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   group: import('./MotionGroupStore.js').MotionGroup,
 *   getMotionItem: (id: string) => import('./MotionDirector.js').MotionItem | null | undefined,
 * }} opts
 * @returns {number} members updated
 */
export function reapplyGroupKeyframes(opts) {
  const { engine, group, getMotionItem } = opts;
  ensureGroupSegments(group);
  let applied = 0;
  engine.beginKeyframeBake();
  try {
    for (let i = 0; i < group.members.length; i++) {
      const mem = group.members[i];
      if (!mem.deployedMotionId) continue;
      const item = getMotionItem(mem.deployedMotionId);
      if (!item?.object) continue;
      applyGroupSegmentsToMotion({
        engine,
        motionItem: item,
        group,
        memberIndex: i,
        feetY: item.object.position.y,
        quiet: true,
      });
      applied++;
    }
  } finally {
    engine.endKeyframeBake();
  }
  return applied;
}
