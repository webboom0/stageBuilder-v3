/**
 * Scene-scoped group data — strip runtime refs on save, relink after motion restore.
 */

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
  return serializeGroupsForScene(groups);
}

/**
 * After motions restore, link group members to motion instances (same folder + name).
 * @param {import('../motion/MotionDirector.js').MotionDirector} motion
 * @param {import('../motion/MotionGroupStore.js').MotionGroupStore} groupStore
 */
export function relinkGroupDeployments(motion, groupStore) {
  for (const g of groupStore.list()) {
    if (!g.deployedFolderId) continue;
    for (const mem of g.members || []) {
      const expectedName = `${g.name} · ${mem.name}`;
      const item = motion.list().find((m) => {
        if (m.folderId !== g.deployedFolderId) return false;
        if (m.name === expectedName) return true;
        const url = String(mem.url || '');
        const file = String(m.fileUrl || '');
        return url && (file === url || file.endsWith(url) || url.endsWith(file));
      });
      mem.deployedMotionId = item?.id ?? null;
    }
  }
}
