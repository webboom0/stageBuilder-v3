import {
  SEGMENT_KIND,
  ensureGroupSegments,
  normalizeSegment,
  normalizeSegmentKind,
  syncLegacyFieldsFromSegments,
  getGroupTotalDuration,
  normalizeGroupAnimation,
} from './groupSegments.js';
import { computeFormationOffsets } from './groupFormation.js';

let _groupSeq = 1;
let _memberSeq = 1;

/** @param {string | undefined} id @param {RegExp} pattern */
function seqFromId(id, pattern) {
  const m = String(id || '').match(pattern);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

/** @param {import('./MotionGroupStore.js').MotionGroup[]} groups */
function bumpIdSequencesFromGroups(groups) {
  let maxGroup = 0;
  let maxMember = 0;
  for (const g of groups || []) {
    maxGroup = Math.max(maxGroup, seqFromId(g.id, /^grp_(\d+)$/));
    for (const m of g.members || []) {
      maxMember = Math.max(maxMember, seqFromId(m.id, /^mem_(\d+)$/));
    }
  }
  if (maxGroup > 0) _groupSeq = maxGroup + 1;
  if (maxMember > 0) _memberSeq = maxMember + 1;
}

/**
 * Motion ensemble groups (v3 Show Control groups).
 */
export class MotionGroupStore {
  constructor() {
    /** @type {Map<string, MotionGroup>} */
    this.groups = new Map();
    /** @type {string | null} */
    this.activeGroupId = null;
    /** @type {string | null} */
    this.selectedSegmentId = null;
  }

  list() {
    return [...this.groups.values()];
  }

  /** @param {string} id */
  get(id) {
    return this.groups.get(id) ?? null;
  }

  getActive() {
    return this.activeGroupId ? this.groups.get(this.activeGroupId) ?? null : null;
  }

  getSelectedSegment() {
    const g = this.getActive();
    if (!g) return null;
    const segs = ensureGroupSegments(g);
    if (!segs.length) return null;
    return segs.find((s) => s.id === this.selectedSegmentId) || segs[0];
  }

  /**
   * @param {string} [name]
   * @param {{ fromX?: number, fromZ?: number, formationSpacing?: number }} [spawn]
   * @returns {MotionGroup}
   */
  create(name, spawn = {}) {
    let id;
    do {
      id = `grp_${_groupSeq++}`;
    } while (this.groups.has(id));
    const fromX = Number.isFinite(spawn.fromX) ? spawn.fromX : 0;
    const fromZ = Number.isFinite(spawn.fromZ) ? spawn.fromZ : 50;
    /** Default ~0.9m centers when caller passes world spacing; else 36≈0.9m at ~40 u/m */
    const spacing = Number.isFinite(spawn.formationSpacing)
      ? Math.max(8, spawn.formationSpacing)
      : 36;
    /** @type {MotionGroup} */
    const g = {
      id,
      name: name || `Group ${_groupSeq - 1}`,
      members: [],
      segments: [],
      deployedFolderId: null,
      color: '#39d3ff',
      spacing,
      formation: 'line',
      formationSpacing: spacing,
      fromX,
      fromZ,
      fromRotY: 0,
      fromFormation: 'line',
      fromFormationSpacing: spacing,
      startTime: 0,
      toX: fromX,
      toZ: fromZ,
      toRotY: 0,
      duration: 0,
      /** Visible opacity for GO keys (exit end still forces 0) */
      opacity: 1,
      startConfigured: false,
    };
    this.groups.set(id, g);
    this.activeGroupId = id;
    this.selectedSegmentId = null;
    return g;
  }

  /** @param {string} id */
  setActive(id) {
    if (this.groups.has(id)) {
      this.activeGroupId = id;
      this.selectedSegmentId = null;
    }
  }

  /** @param {string | null} segId */
  setSelectedSegmentId(segId) {
    this.selectedSegmentId = segId;
  }

  /**
   * @param {string} groupId
   * @param {{ url: string, name: string, procedural?: string, color?: number, catalogIndex?: number }} entry
   */
  addMember(groupId, entry) {
    const g = this.groups.get(groupId);
    if (!g) return null;
    let memId;
    do {
      memId = `mem_${_memberSeq++}`;
    } while (g.members.some((m) => m.id === memId));
    const member = {
      id: memId,
      url: entry.url,
      name: entry.name,
      procedural: entry.procedural,
      color: entry.color,
      catalogIndex: entry.catalogIndex,
      deployedMotionId: null,
    };
    g.members.push(member);
    return member;
  }

  /**
   * @param {string} groupId
   * @param {string} memberId
   */
  removeMember(groupId, memberId) {
    const g = this.groups.get(groupId);
    if (!g) return;
    g.members = g.members.filter((m) => m.id !== memberId);
  }

  /**
   * @param {string} groupId
   * @param {'move' | 'hold' | 'exit'} kind
   */
  addSegment(groupId, kind) {
    const g = this.groups.get(groupId);
    if (!g) return null;
    const segments = ensureGroupSegments(g);
    const last = segments[segments.length - 1];
    const k = normalizeSegmentKind(kind);
    /** Inherit easing from previous non-hold segment; first/default = smooth */
    const inheritEasing = resolveInheritEasing(segments);
    const base = {
      kind: k,
      formation: last?.formation || g.formation || 'grid',
      formationSpacing: Number(last?.formationSpacing) || g.formationSpacing || 30,
      anchorX: Number(last?.anchorX) || Number(g.fromX) || 0,
      anchorZ: Number(last?.anchorZ) || Number(g.fromZ) || 0,
      toRotY: Number(last?.toRotY) || 0,
    };
    let seg;
    if (k === SEGMENT_KIND.hold) {
      seg = normalizeSegment({ ...base, duration: 3 }, g);
    } else if (k === SEGMENT_KIND.exit) {
      seg = normalizeSegment({
        ...base,
        duration: 4,
        anchorZ: (Number(last?.anchorZ) || 0) + 8,
        easing: inheritEasing,
      }, g);
    } else {
      seg = normalizeSegment({
        ...base,
        duration: 5,
        anchorZ: (Number(last?.anchorZ) || 0) + 5,
        easing: inheritEasing,
      }, g);
    }
    segments.push(seg);
    this.selectedSegmentId = seg.id;
    syncLegacyFieldsFromSegments(g);
    return seg;
  }

  /**
   * @param {string} groupId
   * @param {string} segId
   */
  removeSegment(groupId, segId) {
    const g = this.groups.get(groupId);
    if (!g) return false;
    const segments = ensureGroupSegments(g);
    g.segments = segments.filter((s) => s.id !== segId);
    if (this.selectedSegmentId === segId) {
      this.selectedSegmentId = g.segments[0]?.id || null;
    }
    syncLegacyFieldsFromSegments(g);
    return true;
  }

  /**
   * @param {string} groupId
   * @param {string} segId
   * @param {Record<string, any>} patch
   */
  updateSegment(groupId, segId, patch) {
    const g = this.groups.get(groupId);
    if (!g || !patch) return;
    const seg = ensureGroupSegments(g).find((s) => s.id === segId);
    if (!seg) return;
    Object.assign(seg, patch);
    if (patch.kind != null) seg.kind = normalizeSegmentKind(patch.kind);
    if (patch.duration != null) seg.duration = Math.max(0.1, Number(patch.duration) || 0.1);
    if (patch.formationSpacing != null) {
      seg.formationSpacing = Math.max(0.5, Number(patch.formationSpacing) || 30);
    }
    if (seg.kind === SEGMENT_KIND.hold) seg.easing = 'linear';
    syncLegacyFieldsFromSegments(g);
  }

  /**
   * @param {string} groupId
   * @param {Record<string, any>} patch
   */
  updateGroup(groupId, patch) {
    const g = this.groups.get(groupId);
    if (!g || !patch) return;
    Object.assign(g, patch);
    syncLegacyFieldsFromSegments(g);
  }

  totalDuration(groupId) {
    const g = this.groups.get(groupId);
    return g ? getGroupTotalDuration(g) : 0;
  }

  /** @param {string} id */
  remove(id) {
    this.groups.delete(id);
    if (this.activeGroupId === id) {
      this.activeGroupId = this.groups.keys().next().value ?? null;
    }
    this.selectedSegmentId = null;
  }

  /**
   * Replace all groups (scene load).
   * @param {MotionGroup[]} groups
   * @param {string | null} [activeId]
   */
  replaceAll(groups, activeId = null) {
    this.groups.clear();
    const list = groups || [];
    for (const g of list) {
      normalizeGroupAnimation(g);
      this.groups.set(g.id, g);
    }
    bumpIdSequencesFromGroups(list);
    this.activeGroupId = activeId || list[0]?.id || null;
    this.selectedSegmentId = null;
  }

  /**
   * @param {number} count
   * @param {number} [spacing]
   * @param {string} [formation]
   * @returns {number[][]}
   */
  static formationOffsets(count, spacing = 30, formation = 'line') {
    return computeFormationOffsets(count, formation, spacing).map((o) => [o.x, 0, o.z]);
  }
}

/**
 * Prefer previous move/exit easing (skip hold which is forced linear). Default smooth.
 * @param {any[]} segments
 */
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
 * @typedef {{
 *   id: string,
 *   name: string,
 *   color?: string,
 *   spacing?: number,
 *   formation?: string,
 *   formationSpacing?: number,
 *   fromX?: number,
 *   fromZ?: number,
 *   fromRotY?: number,
 *   fromPresetId?: string | null,
 *   fromFormation?: string,
 *   fromFormationSpacing?: number,
 *   startTime?: number,
 *   toX?: number,
 *   toZ?: number,
 *   toRotY?: number,
 *   duration?: number,
 *   opacity?: number,
 *   members: Array<{
 *     id: string,
 *     url: string,
 *     name: string,
 *     procedural?: string,
 *     color?: number,
 *     catalogIndex?: number,
 *     deployedMotionId: string | null,
 *   }>,
 *   segments: any[],
 *   deployedFolderId: string | null,
 * }} MotionGroup
 */
