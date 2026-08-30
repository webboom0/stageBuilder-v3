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
import { trackKeyframesToPatternDraft } from './trackKeyframePattern.js';

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
 *   fromPresetId?: string | null,
 *   startConfigured?: boolean,
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
    if (item.anim.startConfigured == null) {
      item.anim.startConfigured = item.anim.segments.length > 0
        || Number.isFinite(item.anim.fromX);
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
    fromPresetId: null,
    startConfigured: false,
  };
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
 * @param {number} [atIndex] — 삽입 위치(미지정 시 맨 끝)
 */
export function addMotionAnimSegment(anim, kind, atIndex) {
  const segs = anim.segments;
  const insertAt = Number.isInteger(atIndex)
    ? Math.max(0, Math.min(atIndex, segs.length))
    : segs.length;
  const prev = insertAt > 0 ? segs[insertAt - 1] : null;
  const k = normalizeSegmentKind(kind);
  const inheritEasing = resolveInheritEasing(segs.slice(0, insertAt));
  const seg = soloNormalize(
    {
      id: newSegmentId(),
      kind: k,
      duration: k === SEGMENT_KIND.hold ? 3 : 3,
      anchorX: prev ? Number(prev.anchorX) : anim.fromX,
      anchorZ: prev
        ? Number(prev.anchorZ) + (k === SEGMENT_KIND.hold ? 0 : 5)
        : anim.fromZ + 5,
      toRotY: prev ? prev.toRotY : anim.fromRotY,
      easing: k === SEGMENT_KIND.hold ? 'linear' : inheritEasing,
    },
    anim,
  );
  segs.splice(insertAt, 0, seg);
  anim.selectedSegmentId = seg.id;
  syncSoloHold(anim);
  return seg;
}

/**
 * @param {MotionAnim} anim
 * @param {string} segId
 * @param {number} toIndex
 */
export function moveMotionAnimSegment(anim, segId, toIndex) {
  const segs = anim.segments;
  const from = segs.findIndex((s) => s.id === segId);
  if (from < 0) return false;
  const dest = Math.max(0, Math.min(Number(toIndex) || 0, segs.length - 1));
  if (from === dest) return true;
  const [seg] = segs.splice(from, 1);
  segs.splice(dest, 0, seg);
  anim.selectedSegmentId = seg.id;
  syncSoloHold(anim);
  return true;
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
  anim.startConfigured = true;
  return anim;
}

const PRESET_POS_EPS = 0.5;

/**
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 */
function nearPos(ax, az, bx, bz) {
  return Math.abs(Number(ax) - Number(bx)) < PRESET_POS_EPS
    && Math.abs(Number(az) - Number(bz)) < PRESET_POS_EPS;
}

/**
 * @param {{ id?: string, x?: number, z?: number }[]} presets
 * @param {number} x
 * @param {number} z
 * @returns {string | null}
 */
function findPresetIdAt(presets, x, z) {
  if (!presets?.length) return null;
  const hit = presets.find((p) => p?.id && nearPos(p.x, p.z, x, z));
  return hit?.id ?? null;
}

/**
 * 타임라인 키 → MotionAnim (Properties 구간 탭).
 * 키프레임 적용 후에도 이전/좌표 매칭으로 위치 프리셋 연결을 복원한다.
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem} item
 * @param {number} [fallbackStartSec]
 * @param {{
 *   presets?: { id?: string, x?: number, z?: number }[],
 * }} [opts]
 */
export function importTrackKeyframesToMotionAnim(track, item, fallbackStartSec = 0, opts = {}) {
  const anim = ensureMotionAnim(item);
  if (!track?.keys) return anim;

  const keyCount = track.keys.list().length;
  if (keyCount === 0) {
    anim.segments = [];
    anim.selectedSegmentId = null;
    anim.startConfigured = false;
    anim.startTime = Number.isFinite(fallbackStartSec) ? fallbackStartSec : 0;
    const obj = item.object;
    if (obj) {
      anim.fromX = obj.position.x;
      anim.fromZ = obj.position.z;
      anim.fromRotY = normalizeRotYDeg((obj.rotation.y * 180) / Math.PI);
    }
    return anim;
  }

  const prevFromPresetId = anim.fromPresetId || null;
  const prevFromX = Number(anim.fromX) || 0;
  const prevFromZ = Number(anim.fromZ) || 0;
  const prevSegLinks = (anim.segments || []).map((s) => ({
    presetId: s.anchorPresetId || null,
    x: Number(s.anchorX) || 0,
    z: Number(s.anchorZ) || 0,
  }));
  const presets = Array.isArray(opts.presets) ? opts.presets : [];

  const draft = trackKeyframesToPatternDraft(track, item, fallbackStartSec);
  if (!draft?.keyframes?.length) return anim;

  const first = draft.keyframes[0];
  anim.startTime = draft.startTimeSec;
  anim.fromX = first.offsetX;
  anim.fromZ = first.offsetZ;
  anim.fromRotY = normalizeRotYDeg(first.deltaRotY ?? 0);
  anim.opacity = Number.isFinite(Number(first.opacity)) ? Number(first.opacity) : 1;
  anim.startConfigured = true;

  if (prevFromPresetId && nearPos(anim.fromX, anim.fromZ, prevFromX, prevFromZ)) {
    anim.fromPresetId = prevFromPresetId;
  } else {
    anim.fromPresetId = findPresetIdAt(presets, anim.fromX, anim.fromZ);
  }

  anim.segments = draft.keyframes.slice(1).map((kf) => {
    const anchorX = Number(kf.offsetX) || 0;
    const anchorZ = Number(kf.offsetZ) || 0;
    const kind = kf.kind || SEGMENT_KIND.move;
    let anchorPresetId = null;
    if (kind !== SEGMENT_KIND.hold) {
      const kept = prevSegLinks.find(
        (p) => p.presetId && nearPos(p.x, p.z, anchorX, anchorZ),
      );
      anchorPresetId = kept?.presetId ?? findPresetIdAt(presets, anchorX, anchorZ);
    }
    return soloNormalize({
      id: newSegmentId(),
      kind,
      duration: Math.max(0.1, Number(kf.timeOffset) || 0.1),
      anchorX,
      anchorZ,
      toRotY: normalizeRotYDeg(kf.deltaRotY ?? 0),
      anchorPresetId,
      easing: 'smooth',
    }, anim);
  });

  anim.selectedSegmentId = anim.segments[anim.segments.length - 1]?.id ?? null;
  syncSoloHold(anim);
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
