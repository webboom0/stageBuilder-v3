import {
  SEGMENT_KIND,
  ensureGroupSegments,
  getGroupTotalDuration,
  normalizeSegment,
  normalizeSegmentKind,
  newSegmentId,
  normalizeRotYDeg,
  syncHoldSegmentsFromChain,
} from './groupSegments.js';

/**
 * Solo motion animation plan (group segments without formation).
 * Stored on MotionItem.anim
 *
 * @typedef {{
 *   startTime: number,
 *   fromX: number,
 *   fromZ: number,
 *   fromRotY: number,
 *   opacity: number,
 *   segments: ReturnType<typeof normalizeSegment>[],
 *   selectedSegmentId: string | null,
 * }} MotionAnim
 */

/**
 * Lazy-init anim from current object pose.
 * @param {import('./MotionDirector.js').MotionItem} item
 * @returns {MotionAnim}
 */
export function ensureMotionAnim(item) {
  if (item.anim && Array.isArray(item.anim.segments)) {
    item.anim.segments = item.anim.segments.map((s) => soloNormalize(s, item.anim));
    if (!item.anim.segments.length) {
      item.anim.segments = [defaultMoveSegment(item.anim)];
    }
    if (!item.anim.selectedSegmentId) {
      item.anim.selectedSegmentId = item.anim.segments[0]?.id || null;
    }
    return item.anim;
  }

  const obj = item.object;
  const fromX = obj?.position?.x ?? 0;
  const fromZ = obj?.position?.z ?? 0;
  const fromRotY = obj
    ? normalizeRotYDeg((obj.rotation.y * 180) / Math.PI)
    : 0;

  /** @type {MotionAnim} */
  const anim = {
    startTime: 0,
    fromX,
    fromZ,
    fromRotY,
    opacity: 1,
    segments: [],
    selectedSegmentId: null,
  };
  anim.segments = [defaultMoveSegment(anim)];
  anim.selectedSegmentId = anim.segments[0].id;
  item.anim = anim;
  return anim;
}

function soloNormalize(seg, anim) {
  const n = normalizeSegment(seg, {
    formation: 'line',
    formationSpacing: 1,
    toX: anim?.fromX ?? 0,
    toZ: (anim?.fromZ ?? 0) + 5,
  });
  n.formation = 'line';
  n.formationSpacing = 1;
  return n;
}

function defaultMoveSegment(anim) {
  return soloNormalize(
    {
      id: newSegmentId(),
      kind: SEGMENT_KIND.move,
      duration: 5,
      anchorX: (anim?.fromX ?? 0),
      anchorZ: (anim?.fromZ ?? 0) + 5,
      toRotY: anim?.fromRotY ?? 0,
      easing: 'smooth',
    },
    anim,
  );
}

/** @param {MotionAnim} anim */
export function getMotionAnimDuration(anim) {
  return (anim?.segments || []).reduce((s, seg) => s + (Number(seg.duration) || 0), 0);
}

/**
 * @param {MotionAnim} anim
 * @param {'move'|'hold'|'exit'} kind
 */
export function addMotionAnimSegment(anim, kind) {
  const segs = anim.segments;
  const last = segs[segs.length - 1];
  const k = normalizeSegmentKind(kind);
  const inheritEasing = resolveInheritEasing(segs);
  const seg = soloNormalize(
    {
      id: newSegmentId(),
      kind: k,
      duration: k === SEGMENT_KIND.hold ? 2 : 3,
      anchorX: last ? Number(last.anchorX) : anim.fromX,
      anchorZ: last
        ? Number(last.anchorZ) + (k === SEGMENT_KIND.hold ? 0 : 5)
        : anim.fromZ + 5,
      toRotY: last ? last.toRotY : anim.fromRotY,
      easing: k === SEGMENT_KIND.hold ? 'linear' : inheritEasing,
    },
    anim,
  );
  segs.push(seg);
  anim.selectedSegmentId = seg.id;
  syncSoloHold(anim);
  return seg;
}

/** Skip hold (forced linear); default smooth */
function resolveInheritEasing(segments) {
  if (!Array.isArray(segments)) return 'smooth';
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (!s || s.kind === SEGMENT_KIND.hold) continue;
    if (s.easing === 'linear' || s.easing === 'smooth') return s.easing;
  }
  return 'smooth';
}

/**
 * @param {MotionAnim} anim
 * @param {string} segId
 * @param {Record<string, any>} patch
 */
export function updateMotionAnimSegment(anim, segId, patch) {
  const seg = anim.segments.find((s) => s.id === segId);
  if (!seg) return;
  Object.assign(seg, patch);
  if (patch.toRotY != null) seg.toRotY = normalizeRotYDeg(patch.toRotY);
  if (patch.duration != null) seg.duration = Math.max(0.1, Number(patch.duration) || 0.1);
  const fixed = soloNormalize(seg, anim);
  Object.assign(seg, fixed);
  syncSoloHold(anim);
}

/** @param {MotionAnim} anim @param {string} segId */
export function removeMotionAnimSegment(anim, segId) {
  if (anim.segments.length <= 1) return;
  anim.segments = anim.segments.filter((s) => s.id !== segId);
  if (anim.selectedSegmentId === segId) {
    anim.selectedSegmentId = anim.segments[0]?.id || null;
  }
  syncSoloHold(anim);
}

/** Seed start pose from current object (optional UX helper) */
export function syncMotionAnimStartFromObject(item) {
  const anim = ensureMotionAnim(item);
  const obj = item.object;
  if (!obj) return anim;
  anim.fromX = obj.position.x;
  anim.fromZ = obj.position.z;
  anim.fromRotY = normalizeRotYDeg((obj.rotation.y * 180) / Math.PI);
  return anim;
}

/**
 * Synthetic 1-member group for buildMemberWaypoints / applyGroupSegments.
 * Formation fixed to line@1 → offset (0,0).
 * @param {import('./MotionDirector.js').MotionItem} item
 */
export function motionAnimAsGroup(item) {
  const anim = ensureMotionAnim(item);
  syncSoloHold(anim);
  return {
    id: `solo_${item.id}`,
    name: item.name,
    members: [{ id: item.id }],
    fromX: anim.fromX,
    fromZ: anim.fromZ,
    fromRotY: anim.fromRotY,
    fromFormation: 'line',
    fromFormationSpacing: 1,
    formation: 'line',
    formationSpacing: 1,
    startTime: anim.startTime,
    opacity: anim.opacity,
    segments: anim.segments.map((s) => soloNormalize({ ...s }, anim)),
    toX: anim.segments[anim.segments.length - 1]?.anchorX ?? anim.fromX,
    toZ: anim.segments[anim.segments.length - 1]?.anchorZ ?? anim.fromZ,
    toRotY: anim.segments[anim.segments.length - 1]?.toRotY ?? anim.fromRotY,
    duration: getMotionAnimDuration(anim),
    color: undefined,
    deployedFolderId: null,
  };
}

function syncSoloHold(anim) {
  // Reuse group hold sync via temporary group shape
  const g = {
    fromX: anim.fromX,
    fromZ: anim.fromZ,
    fromRotY: anim.fromRotY,
    formation: 'line',
    formationSpacing: 1,
    segments: anim.segments,
  };
  ensureGroupSegments(g);
  syncHoldSegmentsFromChain(g);
  anim.segments = g.segments.map((s) => soloNormalize(s, anim));
}

export { getGroupTotalDuration };
