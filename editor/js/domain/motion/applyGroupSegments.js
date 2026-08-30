import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { buildMemberWaypoints, getGroupClipRange, ensureGroupSegments } from './groupSegments.js';
import { asMotionKeyValue } from './motionKeyValue.js';

/**
 * Apply group animation segments as compound motion keys on a deployed member.
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

  // Replace keys
  track.keys.clear?.();
  if (!track.keys.clear) {
    track.keys.list().slice().forEach((k) => track.keys.remove(k.id));
  }

  const clip = getGroupClipRange(group, engine.durationSec);
  const smooth = INTERPOLATION.SMOOTH ?? INTERPOLATION.LINEAR;
  const startOpacity = clamp01(group.opacity ?? 1);
  // Enter fade (opacity≈0): first key invisible, then fade to full during first span.
  // Otherwise keep uniform opacity (e.g. semi-transparent 0.8 throughout).
  const showOpacity = startOpacity <= 0.05 ? 1 : startOpacity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const next = waypoints[i + 1];
    const easing = wp.spanEasing || next?.spanEasing;
    const interp = easing === 'linear' ? INTERPOLATION.LINEAR : smooth;
    const isFirst = i === 0;
    const isLast = i === waypoints.length - 1;
    const hide = clip.endsWithExit && isLast;
    const opacity = hide ? 0 : (isFirst ? startOpacity : showOpacity);

    const bag = asMotionKeyValue({
      position: [wp.x, feetY, wp.z],
      rotation: [0, THREE.MathUtils.degToRad(Number(wp.rotY) || 0), 0],
      scale: scale.slice(),
      opacity,
      visible: !hide,
    });
    const keyTime = snapKeyframeTimeSec(wp.time, engine.fps);
    engine.addKeyframe(track.id, keyTime, bag, interp);
  }

  // Pose object at first waypoint
  const first = waypoints[0];
  motionItem.object.position.set(first.x, feetY, first.z);
  motionItem.object.rotation.set(0, THREE.MathUtils.degToRad(Number(first.rotY) || 0), 0);
  motionItem.object.visible = true;

  if (!opts.quiet) {
    engine.emit('keys');
    engine.emit('tracks');
  }
  return true;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}
