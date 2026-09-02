import { asMotionKeyValue } from './motionKeyValue.js';
import { cloneKeyframeValue } from '../timeline/cloneValue.js';

/**
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @returns {boolean}
 */
export function isStageMotionTrack(track) {
  return track?.section === 'stage';
}

/**
 * @typedef {{
 *   position?: number[],
 *   rotation?: number[],
 *   scale?: number[],
 * }} StageTransformPatch
 */

/**
 * @typedef {{ id: string, before: any }} StageKeySnapshot
 */

/**
 * Stage transform targets:
 * - exactly 2 keys + editing **first** → first + last
 * - otherwise → edited key only (incl. last key on 2-key track, middle keys, 3+ keys)
 *
 * @param {import('../timeline/Track.js').Track} track
 * @param {string | null | undefined} editedKeyId
 * @returns {string[]}
 */
export function resolveStageTransformTargetKeyIds(track, editedKeyId) {
  const keys = track.keys.list();
  if (!keys.length) return [];
  if (!editedKeyId) return [keys[0].id];
  if (keys.length === 2 && keys[0].id === editedKeyId) {
    return [keys[0].id, keys[1].id];
  }
  return [editedKeyId];
}

/**
 * @param {import('../timeline/Track.js').Track} track
 * @param {string | null | undefined} editedKeyId
 * @returns {boolean}
 */
export function shouldStageSyncStartKeyToEnd(track, editedKeyId) {
  const keys = track.keys.list();
  return keys.length === 2 && !!editedKeyId && keys[0].id === editedKeyId;
}

/**
 * @param {import('../timeline/Track.js').Track} track
 * @param {string | null | undefined} selectedKeyId
 * @returns {string}
 */
export function stageTransformEditHint(track, selectedKeyId) {
  if (!isStageMotionTrack(track)) return '';
  const keys = track.keys.list();
  if (keys.length === 2 && keys[0].id === selectedKeyId) {
    return '시작 키 — 위치·회전·크기 변경 시 퇴장 키에도 함께 적용됩니다.';
  }
  if (keys.length === 2 && keys[1].id === selectedKeyId) {
    return '퇴장 키 — 위치·회전·크기는 이 키만 적용됩니다.';
  }
  if (keys.length > 2) {
    return '키가 3개 이상 — 위치·회전·크기는 선택 키만 적용됩니다.';
  }
  return '';
}

/**
 * @param {import('../timeline/Track.js').Track} track
 * @param {string | null | undefined} editedKeyId
 * @returns {StageKeySnapshot[]}
 */
export function snapshotStageTransformKeys(track, editedKeyId) {
  return resolveStageTransformTargetKeyIds(track, editedKeyId)
    .map((id) => {
      const kf = track.keys.get(id);
      return kf ? { id, before: cloneKeyframeValue(kf.value) } : null;
    })
    .filter((s) => s != null);
}

/**
 * Apply position / rotation / scale to resolved Stage key targets (opacity·visible unchanged).
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {string} trackId
 * @param {StageTransformPatch} transform
 * @param {string | null | undefined} editedKeyId
 * @param {{
 *   label?: string,
 *   keysBefore?: StageKeySnapshot[],
 * }} [opt]
 * @returns {boolean}
 */
export function applyStageTransform(engine, trackId, transform, editedKeyId, opt = {}) {
  const track = engine.getTrack(trackId);
  if (!track || track.locked || !isStageMotionTrack(track)) return false;

  const targetIds = resolveStageTransformTargetKeyIds(track, editedKeyId);
  if (!targetIds.length) return false;

  const hasPatch = transform.position || transform.rotation || transform.scale;
  if (!hasPatch) return false;

  /** @type {StageKeySnapshot[]} */
  const snapshots = opt.keysBefore?.length
    ? opt.keysBefore
      .filter((s) => targetIds.includes(s.id))
      .map((s) => ({ id: s.id, before: cloneKeyframeValue(s.before) }))
    : snapshotStageTransformKeys(track, editedKeyId);

  if (!snapshots.length) return false;

  /** @type {{ id: string, after: ReturnType<typeof asMotionKeyValue> }[]} */
  const updates = snapshots.map(({ id, before }) => {
    const bag = asMotionKeyValue(before);
    if (transform.position) bag.position = transform.position.slice();
    if (transform.rotation) bag.rotation = transform.rotation.slice();
    if (transform.scale) bag.scale = transform.scale.slice();
    return { id, after: bag };
  });

  for (const { id, after } of updates) {
    track.keys.update(id, { value: after });
  }

  const syncStartEnd = shouldStageSyncStartKeyToEnd(track, editedKeyId);
  engine.commands.push({
    label: opt.label || (syncStartEnd ? 'Stage transform (start+end)' : 'Stage transform'),
    undo: () => {
      for (const { id, before } of snapshots) {
        track.keys.update(id, { value: cloneKeyframeValue(before) });
      }
      engine.emit('keys');
    },
    redo: () => {
      for (const { id, after } of updates) {
        track.keys.update(id, { value: cloneKeyframeValue(after) });
      }
      engine.emit('keys');
    },
  });
  engine.emit('keys');
  return true;
}

/**
 * Live preview during gizmo drag — no history.
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {string} trackId
 * @param {StageTransformPatch} transform
 * @param {string | null | undefined} editedKeyId
 */
export function previewStageTransform(engine, trackId, transform, editedKeyId) {
  const track = engine.getTrack(trackId);
  if (!track || track.locked || !isStageMotionTrack(track)) return;

  for (const id of resolveStageTransformTargetKeyIds(track, editedKeyId)) {
    const kf = track.keys.get(id);
    if (!kf) continue;
    const bag = asMotionKeyValue(kf.value);
    if (transform.position) bag.position = transform.position.slice();
    if (transform.rotation) bag.rotation = transform.rotation.slice();
    if (transform.scale) bag.scale = transform.scale.slice();
    track.keys.update(id, { value: bag });
  }
  engine.emit('keys');
}
