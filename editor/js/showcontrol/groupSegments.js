import { computeFormationOffsets } from "./groupFormation.js";

/** 포메이션 전환 시 경계 직전 스냅 (초) */
const BOUNDARY_EPS = 0.05;

export function newSegmentId() {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeSegment(seg, groupDefaults = {}) {
  if (!seg) seg = {};
  return {
    id: seg.id || newSegmentId(),
    duration: Math.max(0.1, Number(seg.duration) || 3),
    formation: seg.formation || groupDefaults.formation || "grid",
    formationSpacing:
      seg.formationSpacing != null
        ? Math.max(0.5, Number(seg.formationSpacing))
        : null,
    anchorX: Number.isFinite(Number(seg.anchorX)) ? Number(seg.anchorX) : Number(groupDefaults.toX) || 0,
    anchorZ: Number.isFinite(Number(seg.anchorZ)) ? Number(seg.anchorZ) : Number(groupDefaults.toZ) || 2,
    toRotY: Number(seg.toRotY) || 0,
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
  group.duration = getGroupTotalDuration(group);
  if (!segments.length) return;
  const first = segments[0];
  const last = segments[segments.length - 1];
  group.formation = first.formation;
  group.toX = last.anchorX;
  group.toZ = last.anchorZ;
  group.toRotY = last.toRotY;
}

export function getSegmentSpacing(group, segment) {
  if (segment?.formationSpacing != null) return segment.formationSpacing;
  return Math.max(0.5, Number(group?.formationSpacing) || 30);
}

function memberOffset(group, segment, memberIndex) {
  const count = group.members?.length || 0;
  const spacing = getSegmentSpacing(group, segment);
  const offsets = computeFormationOffsets(count, segment.formation, spacing);
  return offsets[memberIndex] || { x: 0, z: 0 };
}

/**
 * 멤버별 타임라인 웨이포인트 생성
 * @returns {{ time, x, y, z, rotY }[]}
 */
export function buildMemberWaypoints(group, memberIndex) {
  const segments = ensureGroupSegments(group);
  const startTime = Math.max(0, Number(group.startTime) || 0);
  const fromRotY = Number(group.fromRotY) || 0;
  const waypoints = [];
  let t = startTime;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const off = memberOffset(group, seg, memberIndex);
    const centerStartX = i === 0 ? Number(group.fromX) || 0 : Number(segments[i - 1].anchorX) || 0;
    const centerStartZ = i === 0 ? Number(group.fromZ) || 0 : Number(segments[i - 1].anchorZ) || 0;
    const rotStart = i === 0 ? fromRotY : Number(segments[i - 1].toRotY) || 0;

    if (i === 0) {
      waypoints.push({
        time: t,
        x: centerStartX + off.x,
        y: 0,
        z: centerStartZ + off.z,
        rotY: rotStart,
      });
    } else {
      const prevSeg = segments[i - 1];
      if (prevSeg.formation !== seg.formation) {
        const prevOff = memberOffset(group, prevSeg, memberIndex);
        waypoints.push({
          time: Math.max(startTime, t - BOUNDARY_EPS),
          x: centerStartX + prevOff.x,
          y: 0,
          z: centerStartZ + prevOff.z,
          rotY: Number(prevSeg.toRotY) || 0,
        });
      }
      waypoints.push({
        time: t,
        x: centerStartX + off.x,
        y: 0,
        z: centerStartZ + off.z,
        rotY: rotStart,
      });
    }

    const tEnd = t + seg.duration;
    waypoints.push({
      time: tEnd,
      x: (Number(seg.anchorX) || 0) + off.x,
      y: 0,
      z: (Number(seg.anchorZ) || 0) + off.z,
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

export function getGroupClipRange(group) {
  const startTime = Math.max(0, Number(group.startTime) || 0);
  const duration = Math.max(0.1, getGroupTotalDuration(group));
  return { startTime, duration };
}
