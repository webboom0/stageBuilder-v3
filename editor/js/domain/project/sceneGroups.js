/**
 * Scene-scoped group data — strip runtime refs on save, relink after motion restore.
 */

import { normalizeGroupAnimation } from '../motion/groupSegments.js';
import { isGroupDeployed } from '../motion/applyGroupKeyframes.js';
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
/**
 * Whether a group still has timeline folder rows and/or live deployed members.
 * @param {import('../motion/MotionGroupStore.js').MotionGroup | null | undefined} group
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 */
export function getGroupTimelineUsage(group, motion, engine) {
  if (!group) return { onTimeline: false, trackCount: 0, folderId: null };
  const folderId = group.deployedFolderId ?? null;
  const folderTracks = folderId
    ? engine.listTracks().filter((t) => t.folderId === folderId)
    : [];
  const memberTrackRefs = (group.members || []).filter((m) => m.deployedMotionId).length;
  const onTimeline = isGroupDeployed(group, (id) => motion.get(id))
    || folderTracks.length > 0
    || (folderId != null && memberTrackRefs > 0);
  const trackCount = Math.max(folderTracks.length, memberTrackRefs);
  return { onTimeline, trackCount, folderId };
}

/**
 * Remove a group's deployed folder, timeline tracks, and scene motion instances.
 * @param {import('../motion/MotionGroupStore.js').MotionGroup} group
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @returns {number} removed track count
 */
export function removeGroupFromTimeline(group, motion, engine) {
  if (!group) return 0;
  let removed = 0;
  const folderId = group.deployedFolderId ?? null;

  for (const mem of group.members || []) {
    if (!mem.deployedMotionId) continue;
    if (motion.get(mem.deployedMotionId)) {
      motion.remove(mem.deployedMotionId);
      removed++;
    }
    mem.deployedMotionId = null;
  }

  if (folderId) {
    for (const tr of engine.listTracks().filter((t) => t.folderId === folderId)) {
      const item = motion.findByTrackId(tr.id);
      if (item) {
        motion.remove(item.id);
      } else {
        engine.removeTrack(tr.id, { history: true });
      }
      removed++;
    }
    engine.removeFolder(folderId);
  }

  group.deployedFolderId = null;
  engine.emit('tracks');
  return removed;
}

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
