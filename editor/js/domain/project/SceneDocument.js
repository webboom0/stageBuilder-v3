import { DURATION_MODE } from '../timeline/types.js';
import { toProjectRelPath, resolveProjectAssetUrl } from './projectPaths.js';
import { saveScene as apiSaveScene } from './projectApi.js';
import { repairSceneDocument } from './sceneLoadRepair.js';
import {
  serializeGroupsForScene,
  normalizeGroupsOnLoad,
  relinkGroupDeployments,
  recolorAllGroupsAfterLoad,
} from './sceneGroups.js';
import {
  serializeMotionsForScene,
  motionMetaFromItem,
} from './sceneMotionPersistence.js';
import { serializeSceneLighting, applySceneLighting } from './sceneLighting.js';
import { setWorkLightActive } from '../lighting/houseStageLights.js';
import { sanitizePresetLinks } from '../motion/positionPresetLinks.js';

/**
 * @param {{
 *   projectId: string,
 *   sceneId: string,
 *   sceneName: string,
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motion: import('../motion/MotionDirector.js').MotionDirector,
 *   groupStore: import('../motion/MotionGroupStore.js').MotionGroupStore,
 *   videoBg: import('../video/VideoBackground.js').VideoBackground,
 *   audio: import('../audio/AudioDirector.js').AudioDirector,
 *   stageManager: import('../stage/StageManager.js').StageManager,
 *   previousSceneDoc?: object | null,
 * }} ctx
 */
export function serializeScene(ctx) {
  const { projectId, sceneId, sceneName, engine, motion, groupStore, videoBg, audio, stageManager } = ctx;

  const motionByTrackId = new Map(motion.list().map((m) => [m.trackId, m]));
  const tracks = engine.listTracks().map((t) => {
    const snap = t.snapshot();
    if (snap.kind === 'audio' && Array.isArray(snap.clips)) {
      snap.clips = snap.clips.map((c) => ({
        ...c,
        sourcePath: c.sourcePath ? toProjectRelPath(projectId, c.sourcePath) : c.sourcePath,
      }));
    }
    const live = motionByTrackId.get(t.id)
      || (t.motionId ? motion.get(t.motionId) : null);
    if (live) {
      snap.motionMeta = motionMetaFromItem(live, projectId, toProjectRelPath);
    } else if (t.motionMeta) {
      snap.motionMeta = { ...t.motionMeta };
    }
    return snap;
  });
  const folders = engine.listFolders().map((f) => ({ ...f }));

  const motions = serializeMotionsForScene(ctx, toProjectRelPath);

  const groups = serializeGroupsForScene(groupStore.list());

  /** @type {object | null} */
  let video = null;
  if (videoBg.currentVideoPath) {
    video = {
      path: toProjectRelPath(projectId, videoBg.currentVideoPath),
    };
  }

  return {
    version: 4,
    id: sceneId,
    name: sceneName,
    stageType: stageManager.stageType,
    stageProfile: stageManager.profile,
    durationSec: engine.durationSec,
    durationMode: engine.durationMode,
    playheadSec: engine.playheadSec,
    timelinePxPerSec: engine.pxPerSec,
    tracks,
    folders,
    motions,
    groups,
    video,
    audioMasterVolume: audio.masterVolume,
    lighting: serializeSceneLighting(stageManager.scene),
  };
}

/**
 * Collect asset paths referenced in a scene document.
 * @param {object} doc
 * @returns {string[]}
 */
export function collectManifestAssets(doc) {
  const set = new Set();
  for (const m of doc.motions || []) {
    if (m.fileUrl && !String(m.fileUrl).startsWith('procedural')) set.add(m.fileUrl);
  }
  for (const t of doc.tracks || []) {
    if (t.kind !== 'audio' || !t.clips) continue;
    for (const c of t.clips) {
      if (c.sourcePath) set.add(c.sourcePath);
    }
  }
  if (doc.video?.path) set.add(doc.video.path);
  return [...set];
}

/**
 * @param {object} doc
 * @param {{
 *   projectId: string,
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motion: import('../motion/MotionDirector.js').MotionDirector,
 *   groupStore: import('../motion/MotionGroupStore.js').MotionGroupStore,
 *   videoBg: import('../video/VideoBackground.js').VideoBackground,
 *   audio: import('../audio/AudioDirector.js').AudioDirector,
 *   stageManager: import('../stage/StageManager.js').StageManager,
 *   light?: import('../lighting/LightDirector.js').LightDirector,
 *   fixtures?: import('../lighting/FixtureDirector.js').FixtureDirector,
 *   onStageReload?: () => Promise<void>,
 *   onSceneApplied?: () => void,
 *   onPrepareSceneLoad?: () => void,
 *   positionPresetStore?: import('../motion/PositionPresetStore.js').PositionPresetStore | null,
 *   loadReport?: ReturnType<import('./sceneLoadReport.js').createSceneLoadReport>,
 * }} ctx
 */
export async function applyScene(doc, ctx) {
  const {
    projectId,
    engine,
    motion,
    groupStore,
    videoBg,
    audio,
    stageManager,
    light,
    fixtures,
    onStageReload,
    onSceneApplied,
    onPrepareSceneLoad,
    positionPresetStore,
    loadReport,
  } = ctx;

  const warn = (kind, label, detail) => loadReport?.addWarning(kind, label, detail);

  onPrepareSceneLoad?.();

  motion.clearAll();
  audio.dispose();
  videoBg.removeVideoBackground?.();

  if (doc.stageProfile) {
    stageManager.applyProfile(doc.stageProfile);
  }
  if (doc.stageType && doc.stageType !== stageManager.stageType) {
    await stageManager.setStageType(doc.stageType);
    await onStageReload?.();
  }

  repairSceneDocument(doc);

  light?.resetForSceneLoad?.();
  fixtures?.resetForSceneLoad?.();

  engine.loadFromSceneData({
    durationSec: doc.durationSec,
    durationMode: doc.durationMode || DURATION_MODE.CLAMP_END,
    playheadSec: doc.playheadSec ?? 0,
    timelinePxPerSec: doc.timelinePxPerSec,
    tracks: doc.tracks || [],
    folders: doc.folders || [],
  });

  for (const t of engine.listTracks()) {
    if (t.kind !== 'audio' || !t.clips) continue;
    for (const c of t.clips.list()) {
      c.sourcePath = normalizeLoadedAudioPath(projectId, c.sourcePath);
    }
  }

  groupStore.replaceAll(
    normalizeGroupsOnLoad(doc.groups || []),
    doc.groups?.[0]?.id || null,
  );

  const resolveUrl = (p) => resolveProjectAssetUrl(projectId, p);
  for (const ref of doc.motions || []) {
    try {
      await motion.restoreFromSaved(ref, resolveUrl);
    } catch (err) {
      console.warn('[SceneDocument] motion restore failed:', ref.name, err);
      warn(ref.assetRole === 'stage' ? 'stage' : 'character', ref.name || ref.id || '캐릭터', err.message || String(err));
    }
  }
  try {
    await motion.reconcileMotionsFromDocument(doc, resolveUrl);
  } catch (err) {
    console.warn('[SceneDocument] motion reconcile failed:', err);
    warn('motion', '모션 동기화', err.message || String(err));
  }

  audio.masterVolume = Number.isFinite(doc.audioMasterVolume) ? doc.audioMasterVolume : 1;

  if (doc.video?.path) {
    try {
      const url = resolveUrl(doc.video.path);
      videoBg.loadVideo(url, { autoplay: false });
    } catch (err) {
      console.warn('[SceneDocument] video restore failed:', err);
      warn('video', doc.video.path || '비디오', err.message || String(err));
    }
  }

  motion.reconcileTracks();
  sanitizePresetLinks(positionPresetStore, { groupStore, motion });
  relinkGroupDeployments(motion, groupStore, engine);
  recolorAllGroupsAfterLoad(groupStore, motion, engine);
  audio.preloadAllClips();

  if (doc.lighting) {
    applySceneLighting(stageManager.scene, stageManager, doc.lighting);
  } else {
    // Legacy scenes (before lighting save) — rehearsal WORK default
    setWorkLightActive(stageManager.scene, true);
  }

  motion.apply(engine.playheadSec);
  light?.resyncChannelsFromEngine();
  light?.apply(engine.playheadSec);
  fixtures?.resyncChannelsFromEngine();
  fixtures?.apply(engine.playheadSec);
  audio.apply(engine.playheadSec);

  engine.emit('sceneLoaded');
  engine.emit('tracks');
  onSceneApplied?.();
}

/**
 * @param {string} projectId
 * @param {string | undefined} sourcePath
 */
function normalizeLoadedAudioPath(projectId, sourcePath) {
  if (!sourcePath) return sourcePath;
  if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
    try {
      const u = new URL(sourcePath);
      if (u.pathname.startsWith('/files/')) return u.pathname;
    } catch { /* ignore */ }
    return sourcePath;
  }
  const rel = toProjectRelPath(projectId, sourcePath);
  if (rel.startsWith('assets/')) {
    return `/files/projects/${projectId}/${rel}`;
  }
  return sourcePath.startsWith('/files/') ? sourcePath : sourcePath;
}

/**
 * @param {import('./ProjectStore.js').ProjectStore} store
 * @param {ReturnType<typeof serializeScene>} sceneDoc
 */
export async function persistScene(store, sceneDoc) {
  const manifest = {
    version: 4,
    assets: collectManifestAssets(sceneDoc),
    updatedAt: new Date().toISOString(),
  };
  await apiSaveScene(store.projectId, sceneDoc.id, sceneDoc, manifest);
  store.markSaved();
}
