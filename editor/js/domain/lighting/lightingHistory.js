import { Track } from '../timeline/Track.js';
import {
  applyHouseLightLevels,
  readHouseLightLevels,
  readStageGrand,
} from './houseStageLights.js';
import { setWorkLightLevel, readWorkLightLevel } from './workLights.js';

let _playback = false;
/** @type {object | null} */
let _gestureOld = null;

export function isLightingHistoryPlayback() {
  return _playback;
}

function setLightingHistoryPlayback(on) {
  _playback = !!on;
}

/**
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   light: import('./LightDirector.js').LightDirector,
 *   fixtures: import('./FixtureDirector.js').FixtureDirector,
 *   scene: import('three').Scene,
 *   onAfterApply?: () => void,
 * }} opts
 */
export function createLightingHistoryContext(opts) {
  return {
    engine: opts.engine,
    light: opts.light,
    fixtures: opts.fixtures,
    scene: opts.scene,
    onAfterApply: opts.onAfterApply,
  };
}

/** @param {ReturnType<typeof createLightingHistoryContext>} ctx */
function snapshotLightTracks(engine) {
  return engine.listTracks()
    .filter((t) => t.kind === 'light')
    .map((t) => t.snapshot());
}

/**
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {ReturnType<Track['snapshot']>[]} snaps
 */
function restoreLightTracks(engine, snaps) {
  const ids = new Set(snaps.map((s) => s.id));
  for (const t of engine.listTracks()) {
    if (t.kind === 'light' && !ids.has(t.id)) {
      engine.tracks.delete(t.id);
    }
  }
  for (const snap of snaps) {
    engine.tracks.set(snap.id, Track.fromSnapshot(snap));
  }
}

/** @param {ReturnType<typeof createLightingHistoryContext>} ctx */
export function captureLightingState(ctx) {
  const { engine, fixtures, scene } = ctx;
  return {
    house: readHouseLightLevels(scene),
    stageGrand: readStageGrand(scene),
    workLight: readWorkLightLevel(scene),
    workLightLevelLast: scene?.userData?.workLightLevelLast ?? null,
    lightTracks: snapshotLightTracks(engine),
    fixture: fixtures.fxEngine.captureHistoryState(),
    selection: {
      playheadSec: engine.playheadSec,
      selectedTrackId: engine.selectedTrackId,
      selectedKeyframeId: engine.selectedKeyframeId,
      selectedKeys: engine.listSelectedKeys?.() || [],
      selectedTrackIds: [...(engine.selectedTrackIds || [])],
    },
  };
}

/** @param {ReturnType<typeof createLightingHistoryContext>} ctx @param {ReturnType<captureLightingState>} state */
export function applyLightingState(ctx, state) {
  if (!ctx || !state) return;
  const { engine, light, fixtures, scene } = ctx;

  setLightingHistoryPlayback(true);
  const prevSuspend = engine._suspendHistory;
  engine._suspendHistory = true;
  try {
    if (state.house) applyHouseLightLevels(scene, state.house);
    if (scene?.userData) {
      if (state.stageGrand != null) scene.userData.stageGrand = state.stageGrand;
      if (state.workLightLevelLast != null) {
        scene.userData.workLightLevelLast = state.workLightLevelLast;
      }
    }
    if (state.workLight != null) setWorkLightLevel(scene, state.workLight);

    if (state.fixture) fixtures.fxEngine.applyHistoryState(state.fixture);

    restoreLightTracks(engine, state.lightTracks || []);
    light.resyncChannelsFromEngine();
    fixtures.resyncChannelsFromEngine();

    const sel = state.selection || {};
    if (sel.playheadSec != null) engine.playheadSec = sel.playheadSec;
    const keyRefs = sel.selectedKeys || [];
    if (keyRefs.length) {
      engine.selectKeyframes(keyRefs);
    } else if (sel.selectedTrackIds?.length) {
      engine.selectTracks(sel.selectedTrackIds);
    } else {
      engine.selectedTrackId = sel.selectedTrackId ?? null;
      engine.selectedKeyframeId = sel.selectedKeyframeId ?? null;
      engine.selectedKeys = [];
      engine.selectedTrackIds = new Set(sel.selectedTrackIds || []);
    }

    light.apply(engine.playheadSec);
    fixtures.apply(engine.playheadSec);
  } finally {
    engine._suspendHistory = prevSuspend;
    setLightingHistoryPlayback(false);
  }

  engine.emit('tracks');
  engine.emit('keys');
  engine.emit('selection');
  engine.emit('playhead');
  ctx.onAfterApply?.();
}

/**
 * @param {ReturnType<typeof createLightingHistoryContext>} ctx
 * @param {string} label
 * @param {() => void} mutateFn
 */
export function runLightingEdit(ctx, label, mutateFn) {
  if (!ctx || typeof mutateFn !== 'function') return;
  if (_playback || isLightingHistoryPlayback()) {
    mutateFn();
    ctx.onAfterApply?.();
    return;
  }

  const oldState = captureLightingState(ctx);
  const prevSuspend = ctx.engine._suspendHistory;
  ctx.engine._suspendHistory = true;
  try {
    mutateFn();
  } finally {
    ctx.engine._suspendHistory = prevSuspend;
  }
  const newState = captureLightingState(ctx);

  ctx.engine.commands.push({
    label: label || '조명',
    undo: () => applyLightingState(ctx, oldState),
    redo: () => applyLightingState(ctx, newState),
  });
  ctx.onAfterApply?.();
}

/** @param {ReturnType<typeof createLightingHistoryContext>} ctx */
export function beginLightingGesture(ctx) {
  if (_gestureOld || !ctx || _playback) return;
  _gestureOld = captureLightingState(ctx);
  ctx.engine._suspendHistory = true;
}

export function cancelLightingGesture(ctx) {
  _gestureOld = null;
  if (ctx?.engine) ctx.engine._suspendHistory = false;
}

/**
 * @param {ReturnType<typeof createLightingHistoryContext>} ctx
 * @param {string} label
 */
export function endLightingGesture(ctx, label) {
  if (!ctx) return;
  ctx.engine._suspendHistory = false;
  if (_playback || !_gestureOld) {
    _gestureOld = null;
    return;
  }
  const oldState = _gestureOld;
  _gestureOld = null;
  const newState = captureLightingState(ctx);

  ctx.engine.commands.push({
    label: label || '조명 슬라이더',
    undo: () => applyLightingState(ctx, oldState),
    redo: () => applyLightingState(ctx, newState),
  });
  ctx.onAfterApply?.();
}
