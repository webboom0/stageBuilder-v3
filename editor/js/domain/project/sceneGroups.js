/**
 * Scene-scoped group data — strip runtime refs on save, relink after motion restore.
 */

import { normalizeGroupAnimation } from '../motion/groupSegments.js';
import { recolorGroupDeployedMembers } from '../motion/walkLitePerformer.js';

/**
 * Unique timeline / motion name for a group member (avoids duplicate «Group · WalkLite»).
 * @param {{ name: string }} group
 * @param {{ name?: string }} member
 * @param {number} memberIndex
 */
export function memberDeployTrackName(group, member, memberIndex) {
  const gName = group?.name || 'Group';
  const label = member?.name || 'Member';
  return `${gName} · ${memberIndex + 1}. ${label}`;
}

/**
 * @param {import('../motion/MotionGroupStore.js').MotionGroup[]} groups
 */
export function serializeGroupsForScene(groups) {
  return (groups || []).map((g) => {
    const clone = structuredClone(g);
    for (const m of clone.members || []) {
      m.deployedMotionId = null;
    }
    return clone;
  });
}

/**
 * @param {import('../motion/MotionGroupStore.js').MotionGroup[]} groups
 */
export function normalizeGroupsOnLoad(groups) {
  return serializeGroupsForScene(groups).map((g) => normalizeGroupAnimation(g));
}

/**
 * After motions restore, link group members to motion instances (folder + index/name).
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../motion/MotionGroupStore.js').MotionGroupStore} groupStore
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine | null} [engine]
 */
export function relinkGroupDeployments(motion, groupStore, engine = null) {
  /** @type {Map<string, number>} */
  const trackOrder = new Map();
  if (engine) {
    engine.listTracks().forEach((t, idx) => trackOrder.set(t.id, idx));
  }

  for (const g of groupStore.list()) {
    if (!g.deployedFolderId) continue;
    const folderItems = motion.list()
      .filter((m) => m.folderId === g.deployedFolderId)
      .sort((a, b) => (trackOrder.get(a.trackId) ?? 0) - (trackOrder.get(b.trackId) ?? 0));

    const members = g.members || [];
    for (let i = 0; i < members.length; i++) {
      const mem = members[i];
      const deployName = memberDeployTrackName(g, mem, i);
      const legacyName = `${g.name} · ${mem.name}`;
      let item = folderItems.find((m) => m.name === deployName)
        ?? folderItems.find((m) => m.name === legacyName);
      if (!item) item = folderItems[i] ?? null;
      mem.deployedMotionId = item?.id ?? null;
    }
  }
}

/**
 * Motion items in a group's deployed folder, in timeline track order.
 * @param {import('../motion/MotionGroupStore.js').MotionGroup} group
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine | null} [engine]
 */
export function listGroupFolderMotions(group, motion, engine = null) {
  if (!group?.deployedFolderId) return [];
  /** @type {Map<string, number>} */
  const trackOrder = new Map();
  if (engine) {
    engine.listTracks().forEach((t, idx) => trackOrder.set(t.id, idx));
  }
  return motion.list()
    .filter((m) => m.folderId === group.deployedFolderId)
    .sort((a, b) => (trackOrder.get(a.trackId) ?? 0) - (trackOrder.get(b.trackId) ?? 0));
}

/**
 * Re-apply saved group.color to all deployed members after scene load.
 * @param {import('../motion/MotionGroupStore.js').MotionGroupStore} groupStore
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine | null} [engine]
 */
export function recolorAllGroupsAfterLoad(groupStore, motion, engine = null) {
  const groups = groupStore.list();
  for (let idx = 0; idx < groups.length; idx++) {
    const g = groups[idx];
    if (!g.deployedFolderId) continue;
    recolorGroupDeployedMembers(
      g,
      (id) => motion.get(id),
      idx,
      () => listGroupFolderMotions(g, motion, engine),
    );
  }
}
