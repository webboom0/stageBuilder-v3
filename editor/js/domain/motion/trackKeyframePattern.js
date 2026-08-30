import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { normalizeRotYDeg } from './groupSegments.js';
import { asMotionKeyValue } from './motionKeyValue.js';

const TIME_COLLAPSE_EPS = 0.02;
const POS_EPS = 0.08;

let _kfSeq = 1;

/** @returns {string} */
export function newTrackPatternKeyframeId() {
  return `kfd_${Date.now().toString(36)}_${(_kfSeq++).toString(36)}`;
}

/**
 * @typedef {import('../../ui/keyframeTemplateUi.js').DraftKeyframe} DraftKeyframe
 * @typedef {{ label: string, startTimeSec: number, keyframes: DraftKeyframe[] }} TrackPatternDraft
 */

/**
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 * @param {number} [startTimeSec]
 * @returns {TrackPatternDraft}
 */
export function createEmptyTrackPatternDraft(motionItem, startTimeSec = 0) {
  const obj = motionItem?.object;
  const rotY = obj ? normalizeRotYDeg((obj.rotation.y * 180) / Math.PI) : 0;
  return {
    label: '',
    startTimeSec: Number.isFinite(startTimeSec) ? startTimeSec : 0,
    keyframes: [{
      id: newTrackPatternKeyframeId(),
      timeOffset: 0,
      offsetX: obj?.position.x ?? 0,
      offsetZ: obj?.position.z ?? 0,
      deltaRotY: rotY,
      opacity: 1,
      visible: true,
    }],
  };
}

/**
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 * @param {number} [fallbackStartSec]
 * @returns {TrackPatternDraft | null}
 */
export function trackKeyframesToPatternDraft(track, motionItem, fallbackStartSec = 0) {
  if (!track?.keys) return null;
  const raw = [...track.keys.list()].sort((a, b) => a.timeSec - b.timeSec);
  if (!raw.length) {
    return createEmptyTrackPatternDraft(motionItem, fallbackStartSec);
  }

  /** @type {typeof raw} */
  const collapsed = [];
  for (const k of raw) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && Math.abs(prev.timeSec - k.timeSec) < TIME_COLLAPSE_EPS) {
      collapsed[collapsed.length - 1] = k;
    } else {
      collapsed.push(k);
    }
  }

  if (collapsed.length < 2) {
    const bag = asMotionKeyValue(collapsed[0].value);
    return {
      label: track.name || '',
      startTimeSec: collapsed[0].timeSec,
      keyframes: [{
        id: newTrackPatternKeyframeId(),
        timeOffset: 0,
        offsetX: bag.position[0],
        offsetZ: bag.position[2],
        deltaRotY: normalizeRotYDeg((bag.rotation[1] * 180) / Math.PI),
        opacity: clamp01(bag.opacity ?? 1),
        visible: bag.visible !== false,
      }],
    };
  }

  /** @type {DraftKeyframe[]} */
  const keyframes = [];
  for (let i = 0; i < collapsed.length; i++) {
    const k = collapsed[i];
    const bag = asMotionKeyValue(k.value);
    const rotY = normalizeRotYDeg((bag.rotation[1] * 180) / Math.PI);
    if (i === 0) {
      keyframes.push({
        id: newTrackPatternKeyframeId(),
        timeOffset: 0,
        offsetX: bag.position[0],
        offsetZ: bag.position[2],
        deltaRotY: rotY,
        opacity: clamp01(bag.opacity ?? 1),
        visible: bag.visible !== false,
      });
      continue;
    }
    const prev = collapsed[i - 1];
    const prevBag = asMotionKeyValue(prev.value);
    const dur = Math.max(0.1, k.timeSec - prev.timeSec);
    const samePos = Math.abs(bag.position[0] - prevBag.position[0]) < POS_EPS
      && Math.abs(bag.position[2] - prevBag.position[2]) < POS_EPS;
    const isLast = i === collapsed.length - 1;
    const isExit = isLast && (clamp01(bag.opacity ?? 1) <= 0.05 || bag.visible === false);
    /** @type {'move'|'hold'|'exit'} */
    let kind = 'move';
    if (samePos) kind = 'hold';
    else if (isExit) kind = 'exit';
    keyframes.push({
      id: newTrackPatternKeyframeId(),
      kind,
      timeOffset: dur,
      offsetX: bag.position[0],
      offsetZ: bag.position[2],
      deltaRotY: rotY,
      opacity: kind === 'exit' ? 0 : clamp01(bag.opacity ?? 1),
      visible: kind !== 'exit' && bag.visible !== false,
    });
  }

  return {
    label: track.name || '',
    startTimeSec: collapsed[0].timeSec,
    keyframes,
  };
}

/**
 * Write pattern draft onto a Character track (absolute world coords).
 * @param {import('./MotionDirector.js').MotionItem} motionItem
 * @param {TrackPatternDraft} draft
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 */
export function applyPatternDraftToMotionTrack(motionItem, draft, engine) {
  if (!motionItem?.object || !draft?.keyframes?.length || !engine) return false;
  const track = engine.getTrack(motionItem.trackId);
  if (!track?.keys || track.locked) return false;

  const keys = draft.keyframes;
  const startTime = snapKeyframeTimeSec(
    Number.isFinite(Number(draft.startTimeSec)) ? Number(draft.startTimeSec) : 0,
    engine.fps,
  );
  const feetY = motionItem.object.position.y;
  const scale = [
    motionItem.object.scale.x,
    motionItem.object.scale.y,
    motionItem.object.scale.z,
  ];
  const smooth = INTERPOLATION.SMOOTH ?? INTERPOLATION.LINEAR;

  track.keys.clear();

  let cumulative = 0;
  for (let i = 0; i < keys.length; i++) {
    const kf = keys[i];
    if (i > 0) cumulative += Math.max(0.1, Number(kf.timeOffset) || 0);
    const kind = kf.kind || (i === 0 ? 'move' : 'move');
    const rotY = normalizeRotYDeg(kf.deltaRotY ?? 0);
    const bag = asMotionKeyValue({
      position: [Number(kf.offsetX) || 0, feetY, Number(kf.offsetZ) || 0],
      rotation: [0, THREE.MathUtils.degToRad(rotY), 0],
      scale: scale.slice(),
      opacity: kind === 'exit' ? 0 : clamp01(kf.opacity ?? 1),
      visible: kind !== 'exit' && kf.visible !== false,
    });
    const timeSec = snapKeyframeTimeSec(startTime + cumulative, engine.fps);
    engine.addKeyframe(track.id, timeSec, bag, smooth);
  }

  const first = keys[0];
  motionItem.object.position.set(
    Number(first.offsetX) || 0,
    feetY,
    Number(first.offsetZ) || 0,
  );
  motionItem.object.rotation.set(
    0,
    THREE.MathUtils.degToRad(normalizeRotYDeg(first.deltaRotY ?? 0)),
    0,
  );
  motionItem.object.visible = first.visible !== false;

  engine.emit('keys');
  engine.emit('tracks');
  return true;
}

/** @param {number} n */
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}
