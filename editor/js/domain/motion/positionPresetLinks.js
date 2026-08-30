import { syncHoldSegmentsFromChain } from './groupSegments.js';
import { reapplyGroupKeyframes, isGroupDeployed } from './applyGroupKeyframes.js';
import { applyMotionSegmentsToTrack } from './applyMotionSegments.js';
import { ensureMotionAnim } from './motionAnim.js';

/**
 * When a saved position preset is edited, push new coords to every linked group/segment/motion anim.
 *
 * @param {import('./positionPresets.js').PositionPreset} preset
 * @param {{
 *   groupStore: import('./MotionGroupStore.js').MotionGroupStore,
 *   motion: import('./MotionDirector.js').MotionDirector,
 *   timeline: import('../timeline/TimelineEngine.js').TimelineEngine,
 * }} ctx
 * @returns {{ groups: number, motions: number }}
 */
export function propagatePositionPresetUpdate(preset, ctx) {
  const { groupStore, motion, timeline } = ctx;
  if (!preset?.id) return { groups: 0, motions: 0 };

  let groups = 0;
  for (const g of groupStore.list()) {
    let changed = false;
    if (g.fromPresetId === preset.id) {
      g.fromX = preset.x;
      g.fromZ = preset.z;
      g.fromRotY = preset.rotY;
      changed = true;
    }
    for (const seg of g.segments || []) {
      if (seg.anchorPresetId === preset.id) {
        seg.anchorX = preset.x;
        seg.anchorZ = preset.z;
        seg.toRotY = preset.rotY;
        changed = true;
      }
    }
    if (!changed) continue;
    syncHoldSegmentsFromChain(g);
    groups++;
    if (isGroupDeployed(g, (id) => motion.get(id))) {
      reapplyGroupKeyframes({
        engine: timeline,
        group: g,
        getMotionItem: (id) => motion.get(id),
      });
    }
  }

  let motions = 0;
  for (const item of motion.list?.() || []) {
    const anim = item.anim;
    if (!anim) continue;
    let changed = false;
    if (anim.fromPresetId === preset.id) {
      anim.fromX = preset.x;
      anim.fromZ = preset.z;
      anim.fromRotY = preset.rotY;
      changed = true;
    }
    for (const seg of anim.segments || []) {
      if (seg.anchorPresetId === preset.id) {
        seg.anchorX = preset.x;
        seg.anchorZ = preset.z;
        seg.toRotY = preset.rotY;
        changed = true;
      }
    }
    if (!changed) continue;
    ensureMotionAnim(item);
    motions++;
    applyMotionSegmentsToTrack({ engine: timeline, motionItem: item });
  }

  if (groups || motions) {
    motion.apply(timeline.playheadSec);
    timeline.emit('keys');
  }

  return { groups, motions };
}

/**
 * Drop preset links in the current scene but keep baked coordinate values.
 *
 * @param {string} presetId
 * @param {{
 *   groupStore: import('./MotionGroupStore.js').MotionGroupStore,
 *   motion: import('./MotionDirector.js').MotionDirector,
 * }} ctx
 * @returns {{ groups: number, motions: number }}
 */
export function unlinkPositionPreset(presetId, ctx) {
  const { groupStore, motion } = ctx;
  if (!presetId) return { groups: 0, motions: 0 };

  let groups = 0;
  for (const g of groupStore.list()) {
    let changed = false;
    if (g.fromPresetId === presetId) {
      g.fromPresetId = null;
      changed = true;
    }
    for (const seg of g.segments || []) {
      if (seg.anchorPresetId === presetId) {
        seg.anchorPresetId = null;
        changed = true;
      }
    }
    if (changed) groups++;
  }

  let motions = 0;
  for (const item of motion.list?.() || []) {
    const anim = item.anim;
    if (!anim) continue;
    let changed = false;
    if (anim.fromPresetId === presetId) {
      anim.fromPresetId = null;
      changed = true;
    }
    for (const seg of anim.segments || []) {
      if (seg.anchorPresetId === presetId) {
        seg.anchorPresetId = null;
        changed = true;
      }
    }
    if (changed) motions++;
  }

  return { groups, motions };
}

/**
 * Clear stale preset ids (deleted project-wide) — coords stay as saved.
 *
 * @param {import('./PositionPresetStore.js').PositionPresetStore | null | undefined} presetStore
 * @param {{
 *   groupStore: import('./MotionGroupStore.js').MotionGroupStore,
 *   motion: import('./MotionDirector.js').MotionDirector,
 * }} ctx
 * @returns {{ groups: number, motions: number }}
 */
export function sanitizePresetLinks(presetStore, ctx) {
  const valid = new Set((presetStore?.list?.() || []).map((p) => p.id));
  const stale = [];
  for (const g of ctx.groupStore.list()) {
    if (g.fromPresetId && !valid.has(g.fromPresetId)) stale.push(g.fromPresetId);
    for (const seg of g.segments || []) {
      if (seg.anchorPresetId && !valid.has(seg.anchorPresetId)) stale.push(seg.anchorPresetId);
    }
  }
  for (const item of ctx.motion.list?.() || []) {
    const anim = item.anim;
    if (!anim) continue;
    if (anim.fromPresetId && !valid.has(anim.fromPresetId)) stale.push(anim.fromPresetId);
    for (const seg of anim.segments || []) {
      if (seg.anchorPresetId && !valid.has(seg.anchorPresetId)) stale.push(seg.anchorPresetId);
    }
  }
  const unique = [...new Set(stale)];
  let groups = 0;
  let motions = 0;
  for (const id of unique) {
    const r = unlinkPositionPreset(id, ctx);
    groups += r.groups;
    motions += r.motions;
  }
  return { groups, motions };
}
