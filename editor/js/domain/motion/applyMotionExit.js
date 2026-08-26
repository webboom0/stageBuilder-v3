import { INTERPOLATION } from '../timeline/types.js';
import { asMotionKeyValue } from './motionKeyValue.js';

/** Default exit duration (seconds) from playhead → hide */
export const MOTION_EXIT_DURATION_SEC = 2;

/**
 * Append exit keys: stay at current pose @ playhead, then move to (x,z) with opacity 0.
 * Mirrors group 퇴장 end behavior for a single motion.
 *
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motionItem: import('./MotionDirector.js').MotionItem,
 *   x: number,
 *   z: number,
 *   durationSec?: number,
 * }} opts
 */
export function applyMotionExitKeys(opts) {
  const { engine, motionItem, x, z } = opts;
  const track = engine.getTrack(motionItem.trackId);
  if (!track || track.locked) return null;

  const duration = Math.max(
    0.1,
    Number.isFinite(opts.durationSec) ? opts.durationSec : MOTION_EXIT_DURATION_SEC,
  );
  const t0 = Math.max(0, engine.playheadSec);
  const t1 = Math.min(engine.durationSec, t0 + duration);
  const obj = motionItem.object;
  const scale = [obj.scale.x, obj.scale.y, obj.scale.z];
  const y = obj.position.y;

  const startBag = asMotionKeyValue({
    position: [obj.position.x, y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: scale.slice(),
    opacity: 1,
    visible: true,
  });
  const endBag = asMotionKeyValue({
    position: [x, y, z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: scale.slice(),
    opacity: 0,
    visible: false,
  });

  // Upsert start key (same time = select/update via add+edit)
  const existing0 = track.keys.findAtTime(t0);
  if (existing0) {
    engine.editKeyframe(track.id, existing0.id, {
      value: startBag,
      interpolation: INTERPOLATION.LINEAR,
    });
  } else {
    engine.addKeyframe(track.id, t0, startBag, INTERPOLATION.LINEAR);
  }

  const existing1 = track.keys.findAtTime(t1);
  if (existing1) {
    engine.editKeyframe(track.id, existing1.id, {
      value: endBag,
      interpolation: INTERPOLATION.LINEAR,
    });
    engine.selectKeyframe(track.id, existing1.id);
  } else {
    engine.addKeyframe(track.id, t1, endBag, INTERPOLATION.LINEAR);
  }

  engine.setPlayhead(t1);
  engine.emit('keys');
  return { t0, t1 };
}
