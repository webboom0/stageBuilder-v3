import { computeFormationOffsets } from "./groupFormation.js";

export const SEGMENT_EASING = {
  linear: "linear",
  smooth: "smooth",
};

export const SEGMENT_EASING_LABELS = {
  linear: "Linear",
  smooth: "Smooth",
};

export const SEGMENT_KIND = {
  move: "move",
  hold: "hold",
  exit: "exit",
};

export const SEGMENT_KIND_LABELS = {
  move: "이동",
  hold: "대기",
  exit: "퇴장",
};

/** 그룹 Y축 회전 — 30° 단위 */
export const GROUP_ROT_Y_STEP = 30;
export const GROUP_ROT_Y_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export function normalizeRotYDeg(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  const snapped = Math.round(n / GROUP_ROT_Y_STEP) * GROUP_ROT_Y_STEP;
  return ((snapped % 360) + 360) % 360;
}

export function normalizeSegmentEasing(easing) {
  return easing === SEGMENT_EASING.linear ? SEGMENT_EASING.linear : SEGMENT_EASING.smooth;
}

export function normalizeSegmentKind(kind) {
  if (kind === SEGMENT_KIND.hold || kind === SEGMENT_KIND.exit) return kind;
  return SEGMENT_KIND.move;
}

export function newSegmentId() {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeSegment(seg, groupDefaults = {}) {
  if (!seg) seg = {};
  const kind = normalizeSegmentKind(seg.kind);
  return {
    id: seg.id || newSegmentId(),
    kind,
    duration: Math.max(0.1, Number(seg.duration) || 3),
    formation: seg.formation || groupDefaults.formation || "grid",
    formationSpacing: Math.max(0.5, Number(seg.formationSpacing ?? groupDefaults.formationSpacing) || 30),
    anchorX: Number.isFinite(Number(seg.anchorX)) ? Number(seg.anchorX) : Number(groupDefaults.toX) || 0,
    anchorZ: Number.isFinite(Number(seg.anchorZ)) ? Number(seg.anchorZ) : Number(groupDefaults.toZ) || 2,
    toRotY: normalizeRotYDeg(seg.toRotY),
    easing: kind === SEGMENT_KIND.hold ? SEGMENT_EASING.linear : normalizeSegmentEasing(seg.easing),
  };
}

/** 레거시 단일 구간 → segments 배열 */
export function ensureGroupSegments(group) {
  if (!group) return [];
  if (Array.isArray(group.segments) && group.segments.length) {
    group.segments = group.segments.map((s) => normalizeSegment(s, group));
    return group.segments;
  }
  group.segments = [
    normalizeSegment(
      {
        duration: group.duration,
        formation: group.formation,
        formationSpacing: group.formationSpacing,
        anchorX: group.toX,
        anchorZ: group.toZ,
        toRotY: group.toRotY,
        kind: SEGMENT_KIND.move,
      },
      group,
    ),
  ];
  return group.segments;
}

export function getGroupTotalDuration(group) {
  return ensureGroupSegments(group).reduce((sum, s) => sum + s.duration, 0);
}

/** 상위 필드(duration, toX…)를 segments와 동기화 */
export function syncLegacyFieldsFromSegments(group) {
  const segments = ensureGroupSegments(group);
  syncHoldSegmentsFromChain(group);
  group.duration = getGroupTotalDuration(group);
  if (!segments.length) return;
  const first = segments[0];
  const last = segments[segments.length - 1];
  group.formation = first.formation;
  group.formationSpacing = getSegmentSpacing(group, first);
  if (!group.fromFormation) group.fromFormation = first.formation;
  if (group.fromFormationSpacing == null) {
    group.fromFormationSpacing = getSegmentSpacing(group, first);
  }
  group.toX = last.anchorX;
  group.toZ = last.anchorZ;
  group.toRotY = last.toRotY;
}

export function getSegmentSpacing(group, segment) {
  return Math.max(0.5, Number(segment?.formationSpacing ?? group?.formationSpacing) || 30);
}

/** 첫 키(시작) 포메이션 — group.fromFormation */
export function getGroupStartFormation(group) {
  const first = group?.segments?.[0];
  return {
    formation: group?.fromFormation || first?.formation || group?.formation || "grid",
    spacing: Math.max(
      0.5,
      Number(group?.fromFormationSpacing ?? first?.formationSpacing ?? group?.formationSpacing) || 30,
    ),
  };
}

function memberOffsetFrom(group, formation, spacing, memberIndex) {
  const count = group.members?.length || 0;
  const offsets = computeFormationOffsets(count, formation || "grid", spacing ?? 30);
  return offsets[memberIndex] || { x: 0, z: 0 };
}

function segmentStartFormation(group, segments, segIndex) {
  if (segIndex <= 0) {
    const start = getGroupStartFormation(group);
    return { formation: start.formation, formationSpacing: start.spacing };
  }
  return segments[segIndex - 1];
}

function memberOffsetForSegmentStart(group, segments, segIndex, memberIndex) {
  const form = segmentStartFormation(group, segments, segIndex);
  return memberOffsetFrom(
    group,
    form.formation,
    getSegmentSpacing(group, form),
    memberIndex,
  );
}

function memberOffset(group, segment, memberIndex) {
  const count = group.members?.length || 0;
  const spacing = getSegmentSpacing(group, segment);
  const offsets = computeFormationOffsets(count, segment.formation, spacing);
  return offsets[memberIndex] || { x: 0, z: 0 };
}

function segmentEndCenter(group, segments, segIndex) {
  if (segIndex < 0) {
    return {
      x: Number(group.fromX) || 0,
      z: Number(group.fromZ) || 0,
      rotY: Number(group.fromRotY) || 0,
    };
  }
  const seg = segments[segIndex];
  if (!seg) {
    return {
      x: Number(group.fromX) || 0,
      z: Number(group.fromZ) || 0,
      rotY: Number(group.fromRotY) || 0,
    };
  }
  if (seg.kind === SEGMENT_KIND.hold) {
    return segmentEndCenter(group, segments, segIndex - 1);
  }
  return {
    x: Number(seg.anchorX) || 0,
    z: Number(seg.anchorZ) || 0,
    rotY: Number(seg.toRotY) || 0,
  };
}

/** 대기 직전 실제 포즈 기준 (연속 hold는 첫 non-hold 구간을 따름) */
function resolveHoldReference(group, segments, holdIndex) {
  let j = holdIndex - 1;
  while (j >= 0 && segments[j].kind === SEGMENT_KIND.hold) j--;
  if (j < 0) {
    return {
      center: segmentEndCenter(group, segments, -1),
      formSeg: segments[0] || { formation: group.formation || "grid" },
    };
  }
  return {
    center: segmentEndCenter(group, segments, j),
    formSeg: segments[j],
  };
}

/** hold 구간 anchor는 직전 이동/퇴장 끝과 동기화 (저장값이 웨이포인트를 덮어쓰지 않게) */
export function syncHoldSegmentsFromChain(group) {
  const segments = ensureGroupSegments(group);
  let ref = {
    anchorX: Number(group.fromX) || 0,
    anchorZ: Number(group.fromZ) || 0,
    toRotY: Number(group.fromRotY) || 0,
    formation: segments[0]?.formation || group.formation || "grid",
    formationSpacing: getSegmentSpacing(group, segments[0]),
  };
  for (const seg of segments) {
    if (seg.kind === SEGMENT_KIND.hold) {
      seg.anchorX = ref.anchorX;
      seg.anchorZ = ref.anchorZ;
      seg.toRotY = ref.toRotY;
      seg.formation = ref.formation;
      seg.formationSpacing = ref.formationSpacing;
    } else {
      ref = {
        anchorX: Number(seg.anchorX) || 0,
        anchorZ: Number(seg.anchorZ) || 0,
        toRotY: Number(seg.toRotY) || 0,
        formation: seg.formation,
        formationSpacing: getSegmentSpacing(group, seg),
      };
    }
  }
}

function prevEndCenter(group, segments, index) {
  if (index <= 0) {
    return segmentEndCenter(group, segments, -1);
  }
  return segmentEndCenter(group, segments, index - 1);
}

function memberPosAtCenter(group, segment, memberIndex, center) {
  const off = memberOffset(group, segment, memberIndex);
  return {
    x: center.x + off.x,
    y: 0,
    z: center.z + off.z,
    rotY: center.rotY,
  };
}

/**
 * 멤버별 타임라인 웨이포인트 생성
 * @returns {{ time, x, y, z, rotY, spanEasing? }[]}
 */
export function buildMemberWaypoints(group, memberIndex) {
  const segments = ensureGroupSegments(group);
  const startTime = Math.max(0, Number(group.startTime) || 0);
  const waypoints = [];
  let t = startTime;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const kind = seg.kind || SEGMENT_KIND.move;

    if (kind === SEGMENT_KIND.hold) {
      const { center, formSeg } = resolveHoldReference(group, segments, i);
      const pos = memberPosAtCenter(group, formSeg, memberIndex, center);
      const holdRotY = Number(formSeg.toRotY ?? center.rotY) || 0;
      waypoints.push({
        time: t,
        x: pos.x,
        y: 0,
        z: pos.z,
        rotY: holdRotY,
        spanEasing: SEGMENT_EASING.linear,
      });
      waypoints.push({
        time: t + seg.duration,
        x: pos.x,
        y: 0,
        z: pos.z,
        rotY: holdRotY,
      });
      t += seg.duration;
      continue;
    }

    if (kind === SEGMENT_KIND.exit) {
      const startCenter = prevEndCenter(group, segments, i);
      const offStart = memberOffsetForSegmentStart(group, segments, i, memberIndex);
      const offEnd = memberOffset(group, seg, memberIndex);
      const endX = (Number(seg.anchorX) || 0) + offEnd.x;
      const endZ = (Number(seg.anchorZ) || 0) + offEnd.z;

      waypoints.push({
        time: t,
        x: startCenter.x + offStart.x,
        y: 0,
        z: startCenter.z + offStart.z,
        rotY: startCenter.rotY,
        spanEasing: seg.easing,
      });

      const tEnd = t + seg.duration;
      waypoints.push({
        time: tEnd,
        x: endX,
        y: 0,
        z: endZ,
        rotY: Number(seg.toRotY) || 0,
      });
      t = tEnd;
      continue;
    }

    // move
    const offStart = memberOffsetForSegmentStart(group, segments, i, memberIndex);
    const offEnd = memberOffset(group, seg, memberIndex);
    const centerStart = prevEndCenter(group, segments, i);
    const rotStart = centerStart.rotY;

    waypoints.push({
      time: t,
      x: centerStart.x + offStart.x,
      y: 0,
      z: centerStart.z + offStart.z,
      rotY: rotStart,
      spanEasing: seg.easing,
    });

    const tEnd = t + seg.duration;
    waypoints.push({
      time: tEnd,
      x: (Number(seg.anchorX) || 0) + offEnd.x,
      y: 0,
      z: (Number(seg.anchorZ) || 0) + offEnd.z,
      rotY: Number(seg.toRotY) || 0,
    });
    t = tEnd;
  }

  return dedupeWaypoints(waypoints);
}

function dedupeWaypoints(waypoints) {
  const sorted = [...waypoints].sort((a, b) => a.time - b.time);
  const out = [];
  for (const wp of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.time - wp.time) < 0.001) {
      out[out.length - 1] = wp;
    } else {
      out.push(wp);
    }
  }
  return out;
}

/** 레거시 호환 — 단일 시작·끝 (첫/마지막 구간) */
export function resolveMemberPositions(group, memberIndex) {
  const segments = ensureGroupSegments(group);
  const wps = buildMemberWaypoints(group, memberIndex);
  if (wps.length < 2) {
    const off = memberOffset(group, segments[0], memberIndex);
    return {
      fromX: (Number(group.fromX) || 0) + off.x,
      fromY: 0,
      fromZ: (Number(group.fromZ) || 0) + off.z,
      toX: (Number(segments[0]?.anchorX) || 0) + off.x,
      toY: 0,
      toZ: (Number(segments[0]?.anchorZ) || 0) + off.z,
      offset: off,
    };
  }
  const first = wps[0];
  const last = wps[wps.length - 1];
  return {
    fromX: first.x,
    fromY: first.y,
    fromZ: first.z,
    toX: last.x,
    toY: last.y,
    toZ: last.z,
    offset: memberOffset(group, segments[0], memberIndex),
  };
}

export function getGroupClipRange(group, totalSeconds = null) {
  const segments = ensureGroupSegments(group);
  const startTime = Math.max(0, Number(group.startTime) || 0);
  const duration = Math.max(0.1, getGroupTotalDuration(group));
  const lastKind = normalizeSegmentKind(segments[segments.length - 1]?.kind);
  const endsWithExit = lastKind === SEGMENT_KIND.exit;
  const timelineCap = Number.isFinite(totalSeconds) ? totalSeconds : 86400;
  const playEnd = endsWithExit ? startTime + duration : timelineCap;
  return {
    startTime,
    duration,
    playEnd,
    endsWithExit,
    hideAfterShow: endsWithExit,
  };
}
