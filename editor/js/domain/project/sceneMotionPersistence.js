/**
 * Scene save/load helpers for motion tracks ↔ 3D instances.
 */

/** @param {string | undefined} group */
export function parseMotionIdFromGroup(group) {
  const g = String(group || '');
  const m = g.match(/^(?:motion|stage):(.+)$/);
  return m ? m[1] : null;
}

/** @param {object | null | undefined} t */
export function isMotionTrackSnapshot(t) {
  if (!t) return false;
  const group = String(t.group || '');
  return t.kind === 'motion'
    || !!t.motionId
    || group.startsWith('motion:')
    || group.startsWith('stage:');
}

/**
 * @param {string | undefined} fileUrl
 * @param {string | null | undefined} procedural
 */
export function inferProcedural(fileUrl, procedural) {
  if (procedural) {
    return String(procedural).replace(/^procedural:\/\//, '');
  }
  const f = String(fileUrl || '');
  if (f.includes('procedural://')) {
    return f.replace(/^procedural:\/\//, '');
  }
  return null;
}

/**
 * @param {{
 *   fileUrl?: string,
 *   procedural?: string | null,
 * }} ref
 * @param {(path: string) => string} resolveUrl
 */
export function resolveMotionLoadUrl(ref, resolveUrl) {
  const procedural = inferProcedural(ref.fileUrl, ref.procedural);
  if (procedural) {
    return procedural.startsWith('procedural://') ? procedural : `procedural://${procedural}`;
  }
  const raw = String(ref.fileUrl || '').trim();
  if (raw.startsWith('procedural://')) return raw;
  if (!raw) throw new Error('motion fileUrl missing');
  return resolveUrl(raw);
}

/**
 * Build motionMeta for track snapshot.
 * @param {import('../motion/MotionDirector.js').MotionItem} m
 * @param {string} projectId
 * @param {typeof import('./projectPaths.js').toProjectRelPath} toRel
 */
export function motionMetaFromItem(m, projectId, toRel) {
  return {
    fileUrl: toRel(projectId, m.fileUrl),
    assetRole: m.assetRole || 'character',
    procedural: inferProcedural(m.fileUrl, m.object?.userData?.procedural),
    color: m.color || null,
    folderId: m.folderId ?? null,
  };
}

/**
 * Ensure doc.motions[] has an entry for every motion track (uses track.motionMeta).
 * @param {object} doc
 */
export function repairMotionsFromTracks(doc) {
  if (!doc || typeof doc !== 'object') return;
  doc.motions = Array.isArray(doc.motions) ? doc.motions : [];
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Map<string, object>} */
  const byTrackId = new Map();
  for (const m of doc.motions) {
    if (!m?.id) continue;
    byId.set(m.id, m);
    if (m.trackId) byTrackId.set(m.trackId, m);
  }

  for (const t of doc.tracks || []) {
    if (!isMotionTrackSnapshot(t)) continue;
    const motionId = t.motionId || parseMotionIdFromGroup(t.group);
    if (!motionId) continue;

    let ref = byId.get(motionId) || byTrackId.get(t.id);
    if (ref) {
      ref.id = motionId;
      ref.trackId = t.id;
      if (!ref.name && t.name) ref.name = t.name;
      if (ref.procedural == null && t.motionMeta?.procedural) {
        ref.procedural = t.motionMeta.procedural;
      }
      if (!ref.fileUrl && t.motionMeta?.fileUrl) {
        ref.fileUrl = t.motionMeta.fileUrl;
      }
      continue;
    }

    const meta = t.motionMeta;
    if (!meta?.fileUrl && !meta?.procedural) continue;

    ref = {
      id: motionId,
      trackId: t.id,
      name: t.name || 'Object',
      fileUrl: meta.fileUrl || '',
      assetRole: meta.assetRole || (t.section === 'stage' ? 'stage' : 'character'),
      procedural: meta.procedural || inferProcedural(meta.fileUrl, null),
      color: meta.color ?? t.color ?? null,
      folderId: meta.folderId ?? t.folderId ?? null,
    };
    doc.motions.push(ref);
    byId.set(motionId, ref);
    byTrackId.set(t.id, ref);
  }
}

/**
 * Recover motion refs from group member URLs when motions[] was lost but group GO tracks remain.
 * @param {object} doc
 */
export function repairMotionsFromGroups(doc) {
  if (!doc || typeof doc !== 'object') return;
  doc.motions = Array.isArray(doc.motions) ? doc.motions : [];
  /** @type {Set<string>} */
  const coveredTracks = new Set(doc.motions.filter((m) => m?.trackId).map((m) => m.trackId));
  /** @type {Set<string>} */
  const coveredIds = new Set(doc.motions.filter((m) => m?.id).map((m) => m.id));

  for (const g of doc.groups || []) {
    if (!g?.deployedFolderId || !g.members?.length) continue;
    for (const mem of g.members) {
      const expectedName = `${g.name} · ${mem.name}`;
      const track = (doc.tracks || []).find(
        (t) => isMotionTrackSnapshot(t)
          && t.folderId === g.deployedFolderId
          && (t.name === expectedName || t.name === mem.name),
      );
      if (!track) continue;
      const motionId = track.motionId || parseMotionIdFromGroup(track.group);
      if (!motionId || coveredIds.has(motionId) || coveredTracks.has(track.id)) continue;
      if (!mem.url && !mem.procedural) continue;

      const fileUrl = mem.url || (mem.procedural ? `procedural://${mem.procedural}` : '');
      doc.motions.push({
        id: motionId,
        trackId: track.id,
        name: track.name || expectedName,
        fileUrl,
        assetRole: 'character',
        procedural: inferProcedural(fileUrl, mem.procedural),
        color: mem.color ?? track.color ?? null,
        folderId: g.deployedFolderId,
      });
      coveredIds.add(motionId);
      coveredTracks.add(track.id);
    }
  }
}

/**
 * Serialize motions[] — live instances + preserve refs when 3D not loaded yet.
 * @param {{
 *   projectId: string,
 *   motion: import('../motion/MotionDirector.js').MotionDirector,
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   previousSceneDoc?: object | null,
 * }} ctx
 * @param {(projectId: string, path: string) => string} toRel
 */
export function serializeMotionsForScene(ctx, toRel) {
  const { projectId, motion, engine, previousSceneDoc } = ctx;
  /** @type {Map<string, object>} */
  const byId = new Map();

  for (const m of motion.list()) {
    byId.set(m.id, {
      id: m.id,
      trackId: m.trackId,
      name: m.name,
      fileUrl: toRel(projectId, m.fileUrl),
      assetRole: m.assetRole || 'character',
      procedural: inferProcedural(m.fileUrl, m.object?.userData?.procedural),
      color: m.color || null,
      folderId: m.folderId ?? null,
    });
  }

  for (const t of engine.listTracks()) {
    if (!isMotionTrackSnapshot(t)) continue;
    const motionId = t.motionId || parseMotionIdFromGroup(t.group);
    if (!motionId || byId.has(motionId)) continue;

    const prev = previousSceneDoc?.motions?.find(
      (m) => m.id === motionId || m.trackId === t.id,
    );
    if (prev) {
      byId.set(motionId, {
        ...prev,
        id: motionId,
        trackId: t.id,
        name: prev.name || t.name,
      });
      continue;
    }

    if (t.motionMeta?.fileUrl || t.motionMeta?.procedural) {
      byId.set(motionId, {
        id: motionId,
        trackId: t.id,
        name: t.name,
        fileUrl: toRel(projectId, t.motionMeta.fileUrl || ''),
        assetRole: t.motionMeta.assetRole || (t.section === 'stage' ? 'stage' : 'character'),
        procedural: t.motionMeta.procedural || inferProcedural(t.motionMeta.fileUrl, null),
        color: t.motionMeta.color ?? t.color ?? null,
        folderId: t.motionMeta.folderId ?? t.folderId ?? null,
      });
    }
  }

  return [...byId.values()];
}
