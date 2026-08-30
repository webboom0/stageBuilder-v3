import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { normalizeRotYDeg, unwrapRotYDeg } from './groupSegments.js';
import { asMotionKeyValue } from './motionKeyValue.js';
import { templateHasKeyframes } from './motionTemplates.js';

/**
 * Apply saved keyframe template onto a Character track.
 * @param {import('./MotionDirector.js').MotionItem} motionItem
 * @param {import('./motionTemplates.js').MotionTemplate} template
 * @param {{ fromX: number, fromZ: number, fromRotY?: number, startTime?: number }} pose
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 */
export function applyKeyframeTemplateToMotion(motionItem, template, pose, engine) {
  if (!motionItem?.object || !templateHasKeyframes(template) || !engine) return false;
  const track = engine.getTrack(motionItem.trackId);
  if (!track?.keys || track.locked) return false;

  const keyframes = template.keyframes;
  const fromX = Number(pose.fromX) || 0;
  const fromZ = Number(pose.fromZ) || 0;
  const fromRotY = normalizeRotYDeg(pose.fromRotY ?? 0);
  const startTime = snapKeyframeTimeSec(
    Number.isFinite(Number(pose.startTime)) ? Number(pose.startTime) : 0,
    engine.fps,
  );

  const feetY = motionItem.object.position.y;
  const scale = [
    motionItem.object.scale.x,
    motionItem.object.scale.y,
    motionItem.object.scale.z,
  ];
  const smooth = INTERPOLATION.SMOOTH ?? INTERPOLATION.LINEAR;

  track.keys.clear?.();
  if (!track.keys.clear) {
    track.keys.list().slice().forEach((k) => track.keys.remove(k.id));
  }

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const rotY = unwrapRotYDeg(fromRotY, fromRotY + (Number(kf.deltaRotY) || 0));
    const bag = asMotionKeyValue({
      position: [fromX + (Number(kf.offsetX) || 0), feetY, fromZ + (Number(kf.offsetZ) || 0)],
      rotation: [0, THREE.MathUtils.degToRad(rotY), 0],
      scale: scale.slice(),
      opacity: kf.opacity,
      visible: kf.visible,
    });
    const timeSec = snapKeyframeTimeSec(startTime + (Number(kf.timeOffset) || 0), engine.fps);
    const interp = Number.isFinite(Number(kf.interpolation)) ? Number(kf.interpolation) : smooth;
    engine.addKeyframe(track.id, timeSec, bag, interp);
  }

  const first = keyframes[0];
  const firstRot = unwrapRotYDeg(fromRotY, fromRotY + (Number(first.deltaRotY) || 0));
  motionItem.object.position.set(
    fromX + (Number(first.offsetX) || 0),
    feetY,
    fromZ + (Number(first.offsetZ) || 0),
  );
  motionItem.object.rotation.set(0, THREE.MathUtils.degToRad(firstRot), 0);
  motionItem.object.visible = first.visible !== false;

  engine.emit('keys');
  engine.emit('tracks');
  return true;
}
