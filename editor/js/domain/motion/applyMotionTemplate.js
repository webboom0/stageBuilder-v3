import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { cmdAddKeyframe } from '../timeline/KeyframeCommands.js';
import { syncPresenceClipFromKeys } from '../timeline/presenceClip.js';
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
 * @param {import('./motionTemplates.js').MotionTemplate | null | undefined} [template]
 * @returns {ResolvedKeyframeAbs}
 */
export function resolveTemplateKeyframeAbs(keyframes, index, pose, presets = [], template = null) {
  const kf = keyframes[index];
  const first = keyframes[0];
  const lookup = (id) => (id && presets.find((p) => p.id === id)) || null;

  if (template?.absoluteCoords) {
    return {
      x: Number(kf.offsetX) || 0,
      z: Number(kf.offsetZ) || 0,
      rotY: normalizeRotYDeg(kf.deltaRotY ?? 0),
      opacity: clamp01(kf.opacity ?? 1),
    };
  }

  if (kf.presetId) {
    const p = lookup(kf.presetId);
    if (p) {
      return {
        x: Number(p.x) || 0,
        z: Number(p.z) || 0,
        rotY: normalizeRotYDeg(p.rotY ?? 0),
        opacity: clamp01(kf.opacity ?? p.opacity ?? 1),
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
  const startTime = template.absoluteCoords && Number.isFinite(Number(template.startTimeSec))
    ? snapKeyframeTimeSec(Number(template.startTimeSec), engine.fps)
    : snapKeyframeTimeSec(
      Number.isFinite(Number(pose.startTime)) ? Number(pose.startTime) : 0,
      engine.fps,
    );

  const poseForResolve = template.absoluteCoords
    ? {
      fromX: Number(template.fromX ?? keyframes[0]?.offsetX) || 0,
      fromZ: Number(template.fromZ ?? keyframes[0]?.offsetZ) || 0,
      fromRotY: normalizeRotYDeg(template.fromRotY ?? keyframes[0]?.deltaRotY ?? 0),
    }
    : pose;

  const feetY = motionItem.object.position.y;
  const scale = [
    motionItem.object.scale.x,
    motionItem.object.scale.y,
    motionItem.object.scale.z,
  ];
  const smooth = INTERPOLATION.SMOOTH ?? INTERPOLATION.LINEAR;

  /** @type {ResolvedKeyframeAbs[]} */
  const resolved = keyframes.map((_, i) => resolveTemplateKeyframeAbs(
    keyframes,
    i,
    poseForResolve,
    presets,
    template,
  ));

  // 등장(시작 opacity≈0): 첫 키는 투명만, visible은 true → 다음 키로 페이드인
  // 퇴장: visible false — opacity는 키에 저장된 값 유지(기본 1, 페이드아웃은 opacity로)
  const startOp = clamp01(resolved[0]?.opacity ?? keyframes[0]?.opacity ?? 1);
  const showOpacity = startOp <= 0.05 ? 1 : startOp;

  engine.beginKeyframeBake();
  try {
    track.keys.clear?.();
    if (!track.keys.clear) {
      track.keys.list().slice().forEach((k) => track.keys.remove(k.id));
    }

    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const abs = resolved[i];
      const isFirst = i === 0;
      const isLast = i === keyframes.length - 1;
      const isExitKey = isLast && kf.visible === false;
      let opacity;
      let visible;
      if (isExitKey) {
        opacity = clamp01(kf.opacity ?? abs.opacity ?? 1);
        visible = false;
      } else if (isFirst) {
        opacity = startOp;
        visible = true;
      } else {
        opacity = showOpacity;
        visible = true;
      }
      const bag = asMotionKeyValue({
        position: [abs.x, feetY, abs.z],
        rotation: [0, THREE.MathUtils.degToRad(abs.rotY), 0],
        scale: scale.slice(),
        opacity,
        visible,
      });
      const timeSec = snapKeyframeTimeSec(startTime + (Number(kf.timeOffset) || 0), engine.fps);
      const interp = Number.isFinite(Number(kf.interpolation)) ? Number(kf.interpolation) : smooth;
      cmdAddKeyframe(engine, {
        trackId: track.id,
        timeSec,
        value: bag,
        interpolation: interp,
      }, { select: false });
    }

    syncPresenceClipFromKeys(track, engine.fps);
  } finally {
    engine.endKeyframeBake();
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
    const isExit = kf.visible === false;
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
      opacity: clamp01(kf.opacity ?? abs.opacity ?? 1),
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
