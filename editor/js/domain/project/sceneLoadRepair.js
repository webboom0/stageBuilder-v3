import { repairMotionsFromTracks, repairMotionsFromGroups, isMotionTrackSnapshot } from './sceneMotionPersistence.js';
import { repairGroupsFromTracks } from './sceneGroupRepair.js';
import { KeyframeStore } from '../timeline/KeyframeStore.js';
import {
  inferPresenceFromKeys,
  normalizePresenceClip,
  stripLegacyEdgeKeys,
  syncMotionExitKeyVisibility,
  supportsPresenceClip,
} from '../timeline/presenceClip.js';

/**
 * v4 legacy tracks: infer presence envelope, strip enter/exit edge keys from body.
 * @param {object} doc
 * @param {number} [fps]
 */
export function migratePresenceClipsOnTracks(doc, fps = 30) {
  for (const t of doc.tracks || []) {
    if (!isMotionTrackSnapshot(t)) continue;
    if (t.presenceClip) {
      const ks = new KeyframeStore();
      ks.restore(t.keys || []);
      t.presenceClip = normalizePresenceClip(t.presenceClip, { fps, keys: ks });
    } else if (Array.isArray(t.keys) && t.keys.length) {
      const ks = new KeyframeStore();
      ks.restore(t.keys);
      const clip = inferPresenceFromKeys(ks, fps);
      if (clip) {
        stripLegacyEdgeKeys(ks, fps);
        t.keys = ks.snapshot();
        t.presenceClip = normalizePresenceClip(clip, { fps, keys: ks });
      }
    }
    repairTrackExitKeyVisibility(t, fps);
  }
}

/** @param {object} track @param {number} fps */
function repairTrackExitKeyVisibility(track, fps) {
  if (!track || !supportsPresenceClip(track)) return;
  const ks = new KeyframeStore();
  ks.restore(track.keys || []);
  if (!ks.list().length) return;
  syncMotionExitKeyVisibility({ ...track, keys: ks });
  track.keys = ks.snapshot();
  if (track.presenceClip) {
    track.presenceClip = normalizePresenceClip(track.presenceClip, { fps, keys: ks });
  }
}

/**
 * Repair motion/track desync in saved scene documents (Phase 6 load).
 * @param {object} doc
 */
export function repairSceneDocument(doc) {
  if (!doc || typeof doc !== 'object') return;
  doc.tracks = Array.isArray(doc.tracks) ? doc.tracks : [];
  doc.motions = Array.isArray(doc.motions) ? doc.motions : [];
  doc.folders = Array.isArray(doc.folders) ? doc.folders : [];
  repairMotionsFromTracks(doc);
  repairMotionsFromGroups(doc);
  repairGroupsFromTracks(doc);
  migratePresenceClipsOnTracks(doc, Number(doc.fps) || 30);

  /** @type {Map<string, object>} */
  const trackById = new Map();
  /** @type {Map<string, object>} */
  const trackByMotionId = new Map();
  for (const t of doc.tracks) {
    if (!t?.id) continue;
    trackById.set(t.id, t);
    if (t.motionId) trackByMotionId.set(t.motionId, t);
  }

  for (const m of doc.motions) {
    if (!m?.id) continue;
    if (m.trackId && trackById.has(m.trackId)) continue;
    const byMotion = trackByMotionId.get(m.id);
    if (byMotion) {
      m.trackId = byMotion.id;
      continue;
    }
    if (!m.trackId) {
      m.trackId = `track_${m.id.replace(/^mot_/, '')}`;
    }
  }

  for (const m of doc.motions) {
    if (!m?.trackId || trackById.has(m.trackId)) continue;
    const section = m.assetRole === 'stage' ? 'stage' : 'motion';
    const snap = {
      id: m.trackId,
      name: m.name || (section === 'stage' ? 'Stage' : 'Character'),
      kind: 'motion',
      group: `${section}:${m.id}`,
      section,
      keys: [],
      clips: [],
      clipStartSec: 0,
      clipDurationSec: 10,
      folderId: m.folderId ?? null,
      motionId: m.id,
      color: m.color ?? null,
      hidden: false,
      locked: false,
      audioVolume: 1,
    };
    doc.tracks.push(snap);
    trackById.set(snap.id, snap);
    trackByMotionId.set(m.id, snap);
  }

  for (const t of doc.tracks) {
    normalizeMotionTrackSnapshot(t, doc.motions);
  }
}

/**
 * @param {object} t
 * @param {object[] | undefined} motions
 */
function normalizeMotionTrackSnapshot(t, motions) {
  if (!t?.id) return;
  const motionRef = motions?.find((m) => m.trackId === t.id || m.id === t.motionId);
  const group = String(t.group || '');
  const isMotionRelated = t.kind === 'motion'
    || !!t.motionId
    || !!motionRef
    || group.startsWith('motion:')
    || group.startsWith('stage:');

  if (!isMotionRelated) return;

  if (t.kind !== 'motion' && t.kind !== 'light' && t.kind !== 'audio') {
    t.kind = 'motion';
  }
  if (motionRef) {
    t.section = motionRef.assetRole === 'stage' ? 'stage' : 'motion';
    if (!t.motionId) t.motionId = motionRef.id;
    if (!t.name && motionRef.name) t.name = motionRef.name;
  } else if (!t.section) {
    t.section = group.startsWith('stage:') ? 'stage' : 'motion';
  }
}
