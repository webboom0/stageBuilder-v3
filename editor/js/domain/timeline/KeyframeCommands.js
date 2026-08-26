import { DURATION_MODE } from './types.js';
import { cloneKeyframeValue } from './cloneValue.js';

/**
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {{ trackId: string, timeSec: number, value: any, interpolation?: number }} args
 */
export function cmdAddKeyframe(engine, args) {
  const track = engine.getTrack(args.trackId);
  if (!track) throw new Error(`Track not found: ${args.trackId}`);

  const existing = track.keys.findAtTime(args.timeSec);
  if (existing) {
    // Same time — do not stack; select existing key
    engine.selectKeyframe(track.id, existing.id);
    return existing;
  }

  const added = track.keys.add({
    timeSec: args.timeSec,
    value: cloneKeyframeValue(args.value),
    interpolation: args.interpolation,
  });

  engine.commands.push({
    label: 'Add keyframe',
    undo: () => {
      track.keys.remove(added.id);
      if (engine.selectedKeyframeId === added.id) engine.clearSelection();
    },
    redo: () => {
      track.keys.add({
        id: added.id,
        timeSec: added.timeSec,
        value: cloneKeyframeValue(added.value),
        interpolation: added.interpolation,
      });
    },
  });

  engine.selectKeyframe(track.id, added.id);
  return added;
}

/**
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {{ trackId: string, keyframeId: string }} args
 */
export function cmdRemoveKeyframe(engine, args) {
  const track = engine.getTrack(args.trackId);
  if (!track) throw new Error(`Track not found: ${args.trackId}`);
  const removed = track.keys.remove(args.keyframeId);
  if (!removed) return null;

  engine.commands.push({
    label: 'Delete keyframe',
    undo: () => {
      track.keys.add({
        id: removed.id,
        timeSec: removed.timeSec,
        value: removed.value,
        interpolation: removed.interpolation,
      });
    },
    redo: () => {
      track.keys.remove(removed.id);
      if (engine.selectedKeyframeId === removed.id) engine.clearSelection();
    },
  });

  if (engine.selectedKeyframeId === removed.id) engine.clearSelection();
  return removed;
}

/**
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {{ trackId: string, keyframeId: string, timeSec: number }} args
 */
export function cmdMoveKeyframe(engine, args) {
  const track = engine.getTrack(args.trackId);
  if (!track) throw new Error(`Track not found: ${args.trackId}`);
  const prev = track.keys.get(args.keyframeId);
  if (!prev) return null;

  const before = prev.timeSec;
  const after = Math.min(engine.durationSec, Math.max(0, args.timeSec));
  const clash = track.keys.findAtTime(after, { excludeId: args.keyframeId });
  if (clash) {
    // Do not stack on another key
    return prev;
  }
  if (Math.abs(before - after) < 1e-9) return prev;

  track.keys.update(args.keyframeId, { timeSec: after });

  engine.commands.push({
    label: 'Move keyframe',
    undo: () => track.keys.update(args.keyframeId, { timeSec: before }),
    redo: () => track.keys.update(args.keyframeId, { timeSec: after }),
  });

  return track.keys.get(args.keyframeId);
}

/**
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {{ trackId: string, keyframeId: string, patch: object }} args
 */
export function cmdEditKeyframe(engine, args) {
  const track = engine.getTrack(args.trackId);
  if (!track) throw new Error(`Track not found: ${args.trackId}`);
  const prev = track.keys.get(args.keyframeId);
  if (!prev) return null;

  const before = {
    timeSec: prev.timeSec,
    value: cloneKeyframeValue(prev.value),
    interpolation: prev.interpolation,
  };
  const patch = { ...args.patch };
  if ('value' in patch) patch.value = cloneKeyframeValue(patch.value);
  if (patch.timeSec !== undefined) {
    const clash = track.keys.findAtTime(patch.timeSec, { excludeId: args.keyframeId });
    if (clash) return prev;
  }
  const updated = track.keys.update(args.keyframeId, patch);
  if (!updated) return prev;
  const after = track.keys.get(args.keyframeId);
  const afterSnap = {
    timeSec: after.timeSec,
    value: cloneKeyframeValue(after.value),
    interpolation: after.interpolation,
  };

  engine.commands.push({
    label: 'Edit keyframe',
    undo: () => track.keys.update(args.keyframeId, before),
    redo: () => track.keys.update(args.keyframeId, afterSnap),
  });

  return after;
}

/**
 * @param {import('./TimelineEngine.js').TimelineEngine} engine
 * @param {{ durationSec: number, mode?: string }} args
 */
export function cmdSetDuration(engine, args) {
  const oldDuration = engine.durationSec;
  const newDuration = Math.max(1, Number(args.durationSec) || oldDuration);
  const mode = args.mode === DURATION_MODE.CLAMP_END
    ? DURATION_MODE.CLAMP_END
    : DURATION_MODE.SCALE_ALL;

  if (Math.abs(oldDuration - newDuration) < 1e-9) return;

  const snaps = engine.listTracks().map((t) => ({
    id: t.id,
    keys: t.keys.snapshot(),
  }));

  engine.durationSec = newDuration;
  for (const track of engine.listTracks()) {
    track.keys.applyDurationChange(oldDuration, newDuration, mode);
  }
  engine.playheadSec = Math.min(engine.playheadSec, newDuration);

  const afterSnaps = engine.listTracks().map((t) => ({
    id: t.id,
    keys: t.keys.snapshot(),
  }));

  engine.commands.push({
    label: `Duration ${oldDuration}→${newDuration} (${mode})`,
    undo: () => {
      engine.durationSec = oldDuration;
      for (const s of snaps) {
        engine.getTrack(s.id)?.keys.restore(s.keys);
      }
      engine.playheadSec = Math.min(engine.playheadSec, oldDuration);
    },
    redo: () => {
      engine.durationSec = newDuration;
      for (const s of afterSnaps) {
        engine.getTrack(s.id)?.keys.restore(s.keys);
      }
      engine.playheadSec = Math.min(engine.playheadSec, newDuration);
    },
  });
}
