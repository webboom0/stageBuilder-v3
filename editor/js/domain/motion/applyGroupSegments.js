import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { cmdAddKeyframe } from '../timeline/KeyframeCommands.js';
import {
  buildMemberWaypoints,
  ensureGroupSegments,
  SEGMENT_KIND,
  normalizeSegmentKind,
} from './groupSegments.js';
import { asMotionKeyValue } from './motionKeyValue.js';
import { syncPresenceClipFromKeys } from '../timeline/presenceClip.js';

/**
 * Apply group animation segments as compound motion keys on a deployed member.
 * Keys include visible start + body + visible-false exit (no leadIn leadOut offset).
 *
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motionItem: import('./MotionDirector.js').MotionItem,
 *   group: import('./MotionGroupStore.js').MotionGroup,
 *   memberIndex: number,
 *   feetY?: number,
 *   quiet?: boolean,
 * }} opts
 */
export function applyGroupSegmentsToMotion(opts) {
  const { engine, motionItem, group, memberIndex } = opts;
  ensureGroupSegments(group);
  const waypoints = buildMemberWaypoints(group, memberIndex);
  if (!waypoints.length) return false;

  const track = engine.getTrack(motionItem.trackId);
  if (!track) return false;

  const feetY = Number.isFinite(opts.feetY)
    ? opts.feetY
    : motionItem.object.position.y;
  const scale = [
    motionItem.object.scale.x,
    motionItem.object.scale.y,
    motionItem.object.scale.z,
  ];

  const segments = ensureGroupSegments(group);
  const lastSeg = segments[segments.length - 1];
  const endsWithExit = lastSeg && normalizeSegmentKind(lastSeg.kind) === SEGMENT_KIND.exit;
  const exitOpacity = endsWithExit ? clamp01(lastSeg.opacity ?? 1) : 1;

  const batch = !opts.quiet;
  if (batch) engine.beginKeyframeBake();
  try {
    track.keys.clear?.();
    if (!track.keys.clear) {
      track.keys.list().slice().forEach((k) => track.keys.remove(k.id));
    }

    const smooth = INTERPOLATION.SMOOTH ?? INTERPOLATION.LINEAR;
    const startOpacity = clamp01(group.opacity ?? 1);
    const showOpacity = startOpacity <= 0.05 ? 1 : startOpacity;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const next = waypoints[i + 1];
      const easing = wp.spanEasing || next?.spanEasing;
      const interp = easing === 'linear' ? INTERPOLATION.LINEAR : smooth;
      const isFirst = i === 0;
      const isExitEnd = endsWithExit && i === waypoints.length - 1;

      const bag = asMotionKeyValue({
        position: [wp.x, feetY, wp.z],
        rotation: [0, THREE.MathUtils.degToRad(Number(wp.rotY) || 0), 0],
        scale: scale.slice(),
        opacity: isFirst ? startOpacity : (isExitEnd ? exitOpacity : showOpacity),
        visible: !isExitEnd,
      });
      const keyTime = snapKeyframeTimeSec(wp.time, engine.fps);
      cmdAddKeyframe(engine, {
        trackId: track.id,
        timeSec: keyTime,
        value: bag,
        interpolation: interp,
      }, { select: false });
    }

    syncPresenceClipFromKeys(track, engine.fps);

    const first = waypoints[0];
    motionItem.object.position.set(first.x, feetY, first.z);
    motionItem.object.rotation.set(0, THREE.MathUtils.degToRad(Number(first.rotY) || 0), 0);
    motionItem.object.visible = true;
  } finally {
    if (batch) engine.endKeyframeBake();
  }
  return true;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}
