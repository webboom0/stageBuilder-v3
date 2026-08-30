import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import {
  normalizeRotYDeg,
  unwrapRotYDeg,
  newSegmentId,
  SEGMENT_KIND,
} from './groupSegments.js';
import { asMotionKeyValue } from './motionKeyValue.js';
import { templateHasKeyframes } from './motionTemplates.js';
import { ensureMotionAnim } from './motionAnim.js';

/**
 * @typedef {{
 *   id?: string,
 *   x?: number,
 *   z?: number,
 *   rotY?: number,
 *   opacity?: number,
 * }} TemplatePresetRef
 */

/**
 * @typedef {{
 *   x: number,
 *   z: number,
 *   rotY: number,
 *   opacity: number,
 * }} ResolvedKeyframeAbs
 */

/**
 * 패턴 라이브러리 키 → 무대 절대 좌표.
 * presetId가 있으면 저장위치 좌표, 없으면 적용 pose + 상대 offset.
 *
 * @param {import('./motionTemplates.js').RelativeKeyframe[]} keyframes
 * @param {number} index
 * @param {{ fromX: number, fromZ: number, fromRotY?: number }} pose
 * @param {TemplatePresetRef[]} presets
 * @returns {ResolvedKeyframeAbs}
 */
export function resolveTemplateKeyframeAbs(keyframes, index, pose, presets = []) {
  const kf = keyframes[index];
  const first = keyframes[0];
  const lookup = (id) => (id && presets.find((p) => p.id === id)) || null;

  if (kf.presetId) {
    const p = lookup(kf.presetId);
    if (p) {
      const isExit = kf.visible === false || clamp01(kf.opacity ?? 1) <= 0.05;
      return {
        x: Number(p.x) || 0,
        z: Number(p.z) || 0,
        rotY: normalizeRotYDeg(p.rotY ?? 0),
        opacity: isExit ? clamp01(kf.opacity ?? 0) : clamp01(p.opacity ?? kf.opacity ?? 1),
      };
    }
  }

  const base = resolveTemplateFirstAbs(first, pose, presets);
  const rotY = index === 0
    ? normalizeRotYDeg(base.rotY + (Number(kf.deltaRotY) || 0))
    : unwrapRotYDeg(base.rotY, base.rotY + (Number(kf.deltaRotY) || 0));

  return {
    x: base.x + (Number(kf.offsetX) || 0),
    z: base.z + (Number(kf.offsetZ) || 0),
    rotY,
    opacity: clamp01(kf.opacity ?? 1),
  };
}

/**
 * @param {import('./motionTemplates.js').RelativeKeyframe} first
 * @param {{ fromX: number, fromZ: number, fromRotY?: number }} pose
 * @param {TemplatePresetRef[]} presets
 */
function resolveTemplateFirstAbs(first, pose, presets) {
  const fromX = Number(pose.fromX) || 0;
  const fromZ = Number(pose.fromZ) || 0;
  const fromRotY = normalizeRotYDeg(pose.fromRotY ?? 0);

  if (first?.presetId) {
    const p = presets.find((x) => x.id === first.presetId);
    if (p) {
      return {
        x: Number(p.x) || 0,
        z: Number(p.z) || 0,
        rotY: normalizeRotYDeg(p.rotY ?? 0),
      };
    }
  }

  return {
    x: fromX + (Number(first?.offsetX) || 0),
    z: fromZ + (Number(first?.offsetZ) || 0),
    rotY: normalizeRotYDeg(fromRotY + (Number(first?.deltaRotY) || 0)),
  };
}

/**
 * Apply saved keyframe template onto a Character track.
 * @param {import('./MotionDirector.js').MotionItem} motionItem
 * @param {import('./motionTemplates.js').MotionTemplate} template
 * @param {{ fromX: number, fromZ: number, fromRotY?: number, startTime?: number }} pose
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {{ presets?: TemplatePresetRef[] }} [opts]
 */
export function applyKeyframeTemplateToMotion(motionItem, template, pose, engine, opts = {}) {
  if (!motionItem?.object || !templateHasKeyframes(template) || !engine) return false;
  const track = engine.getTrack(motionItem.trackId);
  if (!track?.keys || track.locked) return false;

  const keyframes = template.keyframes;
  const presets = Array.isArray(opts.presets) ? opts.presets : [];
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

  /** @type {ResolvedKeyframeAbs[]} */
  const resolved = keyframes.map((_, i) => resolveTemplateKeyframeAbs(
    keyframes,
    i,
    pose,
    presets,
  ));

  // 등장(시작 opacity≈0): 첫 키는 투명만, visible은 true → 다음 키로 페이드인
  // 퇴장(마지막 opacity≈0 / visible false): 마지막 키만 숨김
  const startOp = clamp01(resolved[0]?.opacity ?? keyframes[0]?.opacity ?? 1);
  const showOpacity = startOp <= 0.05 ? 1 : startOp;

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const abs = resolved[i];
    const isFirst = i === 0;
    const isLast = i === keyframes.length - 1;
    const isExitKey = isLast && (
      kf.visible === false || clamp01(kf.opacity ?? abs.opacity ?? 1) <= 0.05
    );
    let opacity;
    if (isExitKey) opacity = 0;
    else if (isFirst) opacity = startOp;
    else opacity = showOpacity;

    const bag = asMotionKeyValue({
      position: [abs.x, feetY, abs.z],
      rotation: [0, THREE.MathUtils.degToRad(abs.rotY), 0],
      scale: scale.slice(),
      opacity,
      visible: !isExitKey,
    });
    const timeSec = snapKeyframeTimeSec(startTime + (Number(kf.timeOffset) || 0), engine.fps);
    const interp = Number.isFinite(Number(kf.interpolation)) ? Number(kf.interpolation) : smooth;
    engine.addKeyframe(track.id, timeSec, bag, interp);
  }

  const firstAbs = resolved[0];
  motionItem.object.position.set(firstAbs.x, feetY, firstAbs.z);
  motionItem.object.rotation.set(0, THREE.MathUtils.degToRad(firstAbs.rotY), 0);
  // 등장은 opacity 0이어도 객체는 스테이지에 있어야 재생·시크 시 페이드인 가능
  motionItem.object.visible = true;

  syncAnimPresetLinksFromTemplate(motionItem, template, {
    startTime,
    resolved,
  });

  engine.emit('keys');
  engine.emit('tracks');
  return true;
}

/**
 * @param {import('./MotionDirector.js').MotionItem} motionItem
 * @param {import('./motionTemplates.js').MotionTemplate} template
 * @param {{ startTime: number, resolved: ResolvedKeyframeAbs[] }} ctx
 */
function syncAnimPresetLinksFromTemplate(motionItem, template, ctx) {
  const anim = ensureMotionAnim(motionItem);
  const keys = template.keyframes || [];
  const { resolved } = ctx;
  if (!keys.length || !resolved.length) return;

  const firstAbs = resolved[0];
  const first = keys[0];
  anim.startTime = ctx.startTime;
  anim.fromX = firstAbs.x;
  anim.fromZ = firstAbs.z;
  anim.fromRotY = firstAbs.rotY;
  anim.opacity = firstAbs.opacity;
  anim.fromPresetId = first.presetId ?? null;
  anim.startConfigured = true;

  /** @type {Record<string, any>[]} */
  const segments = [];
  for (let i = 1; i < keys.length; i++) {
    const kf = keys[i];
    const prev = keys[i - 1];
    const abs = resolved[i];
    const dur = Math.max(0.1, (Number(kf.timeOffset) || 0) - (Number(prev.timeOffset) || 0));
    const isExit = kf.visible === false || Number(kf.opacity) <= 0.05;
    const prevAbs = resolved[i - 1];
    const samePos = Math.abs(abs.x - prevAbs.x) < 0.01 && Math.abs(abs.z - prevAbs.z) < 0.01;
    const sameRot = Math.abs(normalizeRotYDeg(abs.rotY - prevAbs.rotY)) < 0.5;
    let kind = SEGMENT_KIND.move;
    if (isExit) kind = SEGMENT_KIND.exit;
    else if (samePos && sameRot) kind = SEGMENT_KIND.hold;

    segments.push({
      id: newSegmentId(),
      kind,
      duration: dur,
      anchorX: abs.x,
      anchorZ: abs.z,
      toRotY: abs.rotY,
      anchorPresetId: kind === SEGMENT_KIND.hold ? null : (kf.presetId ?? null),
      easing: kind === SEGMENT_KIND.hold ? 'linear' : 'smooth',
      formation: 'line',
      formationSpacing: 1,
    });
  }
  anim.segments = segments;
  anim.selectedSegmentId = segments[segments.length - 1]?.id ?? null;
}

/** @param {number} n */
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}
