/**
 * Recover group members / segment plans from deployed timeline tracks when
 * groups[] was corrupted (e.g. id collision overwrite) but timeline keys remain.
 */

import * as THREE from 'three';
import { asMotionKeyValue } from '../motion/motionKeyValue.js';
import { computeFormationOffsets } from '../motion/groupFormation.js';
import {
  SEGMENT_KIND,
  getGroupStartFormation,
  getSegmentSpacing,
  newSegmentId,
  normalizeRotYDeg,
  normalizeSegment,
  syncLegacyFieldsFromSegments,
} from '../motion/groupSegments.js';

const TIME_COLLAPSE_EPS = 0.02;
const POS_EPS = 0.08;

/**
 * @param {object} doc
 */
export function repairGroupsFromTracks(doc) {
  if (!doc || !Array.isArray(doc.groups)) return;
  for (const g of doc.groups) {
    resolveDeployedFolderId(g, doc);
    recoverGroupMembersFromTracks(g, doc);
    if (shouldRecoverSegmentsFromTracks(g, doc)) {
      recoverGroupSegmentsFromTracks(g, doc);
    }
    if (g.segments?.length) {
      syncLegacyFieldsFromSegments(g);
      g.startConfigured = true;
    }
  }
}

/**
 * Link group → timeline folder when deployedFolderId was lost but folder/tracks remain.
 * @param {object} g
 * @param {object} doc
 * @returns {string | null}
 */
export function resolveDeployedFolderId(g, doc) {
  if (!g) return null;
  if (g.deployedFolderId) return g.deployedFolderId;

  const folders = doc.folders || [];
  const tracks = doc.tracks || [];

  const byName = folders.find((f) => f?.name && f.name === g.name);
  if (byName?.id && getFolderMotionTracks(doc, byName.id).length) {
    g.deployedFolderId = byName.id;
    return byName.id;
  }

  const prefix = `${g.name} · `;
  const byTrack = tracks.find((t) => {
    const n = String(t?.name || '');
    return n.startsWith(prefix) && t.folderId;
  });
  if (byTrack?.folderId) {
    g.deployedFolderId = byTrack.folderId;
    return byTrack.folderId;
  }

  return null;
}

/**
 * @param {object} g
 * @param {object} doc
 */
function recoverGroupMembersFromTracks(g, doc) {
  if (g.members?.length || !g.deployedFolderId) return;
  const tracks = getFolderMotionTracks(doc, g.deployedFolderId);
  if (!tracks.length) return;

  let seq = 1;
  g.members = tracks.map((t) => {
    const prefix = `${g.name} · `;
    const rawName = String(t.name || '');
    const memName = rawName.startsWith(prefix) ? rawName.slice(prefix.length) : (rawName || `Member ${seq}`);
    const motion = (doc.motions || []).find((m) => m.trackId === t.id || m.id === t.motionId);
    return {
      id: `mem_${seq++}`,
      url: motion?.fileUrl || t.motionMeta?.fileUrl || '',
      name: memName,
      procedural: motion?.procedural || t.motionMeta?.procedural || undefined,
      color: motion?.color ?? t.color ?? null,
      catalogIndex: null,
      deployedMotionId: motion?.id ?? t.motionId ?? null,
    };
  });
}

/**
 * @param {object} g
 * @param {object} doc
 */
function shouldRecoverSegmentsFromTracks(g, doc) {
  if (!g.deployedFolderId) return false;
  const tracks = getFolderMotionTracks(doc, g.deployedFolderId);
  if (!tracks.length) return false;

  const keys = getTrackKeys(tracks[0]);
  if (keys.length < 2) return false;

  if (!g.segments?.length) return true;

  const span = keys[keys.length - 1].timeSec - keys[0].timeSec;
  const totalDur = (g.segments || []).reduce((s, seg) => s + (Number(seg.duration) || 0), 0);

  if (g.segments.length === 1 && span > totalDur + 0.5) return true;
  if (keys.length > g.segments.length + 2 && span > totalDur + 0.5) return true;

  return false;
}

/**
 * @param {object} g
 * @param {object} doc
 */
function recoverGroupSegmentsFromTracks(g, doc) {
  const tracks = getFolderMotionTracks(doc, g.deployedFolderId);
  if (!tracks.length) return false;

  const collapsed = buildGroupKeyTimeline(tracks);
  if (collapsed.length < 2) return false;

  const startForm = getGroupStartFormation(g);
  const endFormation = g.formation || startForm.formation;
  const endSpacing = getSegmentSpacing(g, { formationSpacing: g.formationSpacing });

  const first = collapsed[0];
  const startAnchor = anchorFromTracks(g, tracks, first.t, startForm.formation, startForm.spacing);
  g.startTime = first.t;
  g.fromX = startAnchor.x;
  g.fromZ = startAnchor.z;
  g.fromRotY = startAnchor.rotY;
  g.opacity = clamp01(first.exitOpacity ?? first.bag.opacity ?? 1);

  /** @type {ReturnType<typeof normalizeSegment>[]} */
  const segments = [];

  for (let i = 0; i < collapsed.length - 1; i++) {
    const a = collapsed[i];
    const b = collapsed[i + 1];
    const dur = Math.max(0.1, round(b.t - a.t));
    const anchorB = anchorFromTracks(g, tracks, b.t, endFormation, endSpacing);
    const samePos = membersHoldPosition(tracks, a.t, b.t);
    const isLast = i === collapsed.length - 2;
    const isExit = isLast && (b.exitOpacity <= 0.05 || b.bag.visible === false);

    if (samePos) {
      segments.push(normalizeSegment({
        id: newSegmentId(),
        kind: SEGMENT_KIND.hold,
        duration: dur,
      }, g));
    } else if (isExit) {
      segments.push(normalizeSegment({
        id: newSegmentId(),
        kind: SEGMENT_KIND.exit,
        duration: dur,
        anchorX: anchorB.x,
        anchorZ: anchorB.z,
        toRotY: anchorB.rotY,
        easing: 'smooth',
      }, g));
    } else {
      segments.push(normalizeSegment({
        id: newSegmentId(),
        kind: SEGMENT_KIND.move,
        duration: dur,
        anchorX: anchorB.x,
        anchorZ: anchorB.z,
        toRotY: anchorB.rotY,
        easing: 'smooth',
      }, g));
    }
  }

  if (!segments.length) return false;
  g.segments = segments;
  g.startConfigured = true;
  return true;
}

/** @param {object[]} tracks */
function buildGroupKeyTimeline(tracks) {
  /** @type {Set<number>} */
  const times = new Set();
  for (const t of tracks) {
    for (const k of getTrackKeys(t)) times.add(k.timeSec);
  }
  const refIdx = referenceMemberIndex(tracks.length);
  const refTrack = tracks[refIdx] || tracks[0];
  return [...times]
    .sort((a, b) => a - b)
    .map((timeSec) => {
      const bag = bagAtTime(refTrack, timeSec);
      const exitOpacity = minOpacityAtTime(tracks, timeSec);
      return { t: timeSec, bag, exitOpacity };
    })
    .filter((p) => p.bag);
}

/** @param {number} count */
function referenceMemberIndex(count) {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(1, Math.floor(count / 2)));
}

/** @param {object} track @param {number} timeSec */
function bagAtTime(track, timeSec) {
  const k = getTrackKeys(track).find((key) => Math.abs(key.timeSec - timeSec) < TIME_COLLAPSE_EPS);
  return k ? asMotionKeyValue(k.value) : null;
}

/** @param {object[]} tracks @param {number} timeSec */
function minOpacityAtTime(tracks, timeSec) {
  let min = 1;
  for (const t of tracks) {
    const bag = bagAtTime(t, timeSec);
    if (bag) min = Math.min(min, clamp01(bag.opacity ?? 1));
  }
  return min;
}

/** @param {object[]} tracks @param {number} tA @param {number} tB */
function membersHoldPosition(tracks, tA, tB) {
  if (!tracks.length) return false;
  let same = 0;
  for (const t of tracks) {
    const a = bagAtTime(t, tA);
    const b = bagAtTime(t, tB);
    if (a && b && posNear(a, b)) same++;
  }
  return same >= Math.ceil(tracks.length * 0.75);
}

/**
 * @param {object} group
 * @param {object[]} tracks
 * @param {number} timeSec
 * @param {string} [formation]
 * @param {number} [spacing]
 */
function anchorFromTracks(group, tracks, timeSec, formation, spacing) {
  const refIdx = referenceMemberIndex(tracks.length);
  const bag = bagAtTime(tracks[refIdx], timeSec);
  if (!bag) return { x: 0, z: 0, rotY: 0 };
  return keyToAnchor(group, bag, formation, spacing, refIdx);
}

/**
 * In-memory repair for already-loaded scenes (group store + timeline snapshots).
 * @param {object} group
 * @param {object[]} trackSnapshots
 * @param {object[]} [motions]
 * @param {object[]} [folders]
 */
export function repairGroupFromTimeline(group, trackSnapshots, motions = [], folders = []) {
  if (!group) return group;
  const doc = {
    groups: [group],
    tracks: trackSnapshots || [],
    motions: motions || [],
    folders: folders || [],
  };
  repairGroupsFromTracks(doc);
  return group;
}

/** @param {object} doc @param {string} folderId */
function getFolderMotionTracks(doc, folderId) {
  return (doc.tracks || []).filter((t) => {
    if (!t || t.folderId !== folderId) return false;
    if (t.kind === 'motion') return true;
    if (t.section === 'motion' || t.section === 'characters') return true;
    return !!(t.motionId || t.motionMeta);
  });
}

/** @param {object} track */
function getTrackKeys(track) {
  const raw = track?.keys;
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((k) => ({
      timeSec: Number(k.timeSec) || 0,
      value: k.value,
    }))
    .sort((a, b) => a.timeSec - b.timeSec);
}

/** @param {ReturnType<typeof asMotionKeyValue>} a @param {ReturnType<typeof asMotionKeyValue>} b */
function posNear(a, b) {
  return Math.abs(a.position[0] - b.position[0]) < POS_EPS
    && Math.abs(a.position[2] - b.position[2]) < POS_EPS;
}

/**
 * Member world key → group anchor (stage pick coords).
 * @param {object} group
 * @param {ReturnType<typeof asMotionKeyValue>} bag
 * @param {string} [formation]
 * @param {number} [spacing]
 * @param {number} [memberIndex]
 */
function keyToAnchor(group, bag, formation, spacing, memberIndex = 0) {
  const count = Math.max(1, group.members?.length || 1);
  const form = formation || group.fromFormation || group.formation || 'line';
  const space = Math.max(0.5, Number(spacing ?? group.fromFormationSpacing ?? group.formationSpacing) || 30);
  const offsets = computeFormationOffsets(count, form, space);
  const off = offsets[memberIndex] || { x: 0, z: 0 };
  return {
    x: round(bag.position[0] - off.x),
    z: round(bag.position[2] - off.z),
    rotY: normalizeRotYDeg(THREE.MathUtils.radToDeg(bag.rotation[1] || 0)),
  };
}

function round(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}
