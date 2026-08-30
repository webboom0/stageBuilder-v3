import * as THREE from 'three';
import { computeFormationOffsets } from './groupFormation.js';
import {
  ensureGroupSegments,
  normalizeRotYDeg,
  syncHoldSegmentsFromChain,
} from './groupSegments.js';
import { getStageDeckWorldY } from '../stage/stageGridAdaptive.js';
import { resolveHumanWorldHeight } from '../stage/HumanScale.js';
import { clampMotionAboveDeck } from './MotionDirector.js';
import { applyMotionTint, colorForGroup, createWalkLitePerformer } from './walkLitePerformer.js';

/** @type {THREE.Group | null} */
let ghostRoot = null;
/** @type {THREE.Object3D[]} */
const previewPerformerRoots = [];
/** @type {THREE.Group | null} */
let presetMarkerRoot = null;

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

/** @param {THREE.Object3D} root @param {number} opacity */
function applyObjOpacity(root, opacity) {
  const o = clamp01(opacity);
  const fade = o < 0.999;
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.opacity = o;
      mat.transparent = fade;
      mat.depthWrite = !fade;
      mat.depthTest = true;
      mat.needsUpdate = true;
    }
  });
}

/**
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} item
 * @param {number} x
 * @param {number} z
 * @param {number} rotYDeg
 * @param {number} [opacity]
 */
function poseMotionItem(item, x, z, rotYDeg, opacity = 1) {
  if (!item?.object) return;
  const y = item.object.position.y;
  item.object.position.set(Number(x) || 0, y, Number(z) || 0);
  item.object.rotation.set(
    0,
    THREE.MathUtils.degToRad(normalizeRotYDeg(rotYDeg)),
    0,
  );
  item.object.visible = true;
  applyObjOpacity(item.object, opacity);
}

/**
 * @param {import('three').Scene} scene
 */
export function initSegmentPreviewGhosts(scene) {
  if (!scene) return;
  if (!ghostRoot) {
    ghostRoot = new THREE.Group();
    ghostRoot.name = 'SegmentPreviewGhosts';
    ghostRoot.renderOrder = 900;
    scene.add(ghostRoot);
  } else if (ghostRoot.parent !== scene) {
    scene.add(ghostRoot);
  }
}

export function clearSegmentPreviewGhosts() {
  if (!ghostRoot) return;
  ghostRoot.visible = false;
  previewPerformerRoots.forEach((root) => {
    root.visible = false;
  });
}

function ensurePresetMarkerRoot(stageManager) {
  if (presetMarkerRoot || !stageManager?.scene) return presetMarkerRoot;
  presetMarkerRoot = new THREE.Group();
  presetMarkerRoot.name = 'PresetLocationMarker';
  presetMarkerRoot.renderOrder = 950;

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffc840,
    emissive: 0x664400,
    transparent: true,
    opacity: 0.92,
  });
  const poleH = 10;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, poleH, 8), mat);
  pole.position.y = poleH * 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 14), mat.clone());
  head.position.y = poleH + 1.8;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 24), mat.clone());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;

  presetMarkerRoot.add(ring, pole, head);
  stageManager.scene.add(presetMarkerRoot);
  return presetMarkerRoot;
}

export function clearPresetLocationMarker() {
  if (presetMarkerRoot) presetMarkerRoot.visible = false;
}

/**
 * Saved-position preview pin on stage deck.
 *
 * @param {import('../stage/StageManager.js').StageManager | null | undefined} stageManager
 * @param {number} x
 * @param {number} z
 * @param {number} [rotYDeg]
 * @param {number} [opacity]
 */
export function showPresetLocationMarker(stageManager, x, z, rotYDeg = 0, opacity = 1) {
  const root = ensurePresetMarkerRoot(stageManager);
  if (!root) return;
  const deckY = getStageDeckWorldY(stageManager);
  root.position.set(Number(x) || 0, deckY, Number(z) || 0);
  root.rotation.y = THREE.MathUtils.degToRad(normalizeRotYDeg(rotYDeg));
  root.visible = true;
  const o = clamp01(opacity);
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.opacity = o * 0.92;
      mat.transparent = o < 0.999;
      mat.needsUpdate = true;
    }
  });
}

/**
 * @param {number} index
 * @param {import('../stage/StageManager.js').StageManager | null | undefined} stageManager
 * @param {number} color
 */
function ensurePreviewPerformer(index, stageManager, color) {
  initSegmentPreviewGhosts(stageManager?.scene ?? null);
  if (!ghostRoot) return null;
  ghostRoot.visible = true;
  const targetWorldHeight = resolveHumanWorldHeight(stageManager);
  while (previewPerformerRoots.length <= index) {
    const root = createWalkLitePerformer({
      displayName: `PreviewMember_${previewPerformerRoots.length + 1}`,
      color,
      targetWorldHeight,
    });
    root.userData.isSegmentPreview = true;
    ghostRoot.add(root);
    clampMotionAboveDeck(root, stageManager);
    previewPerformerRoots.push(root);
  }
  const root = previewPerformerRoots[index];
  applyMotionTint(root, color);
  return root;
}

function posePreviewPerformer(root, x, z, rotYDeg, opacity, stageManager) {
  if (!root) return;
  root.position.x = Number(x) || 0;
  root.position.z = Number(z) || 0;
  root.rotation.set(0, THREE.MathUtils.degToRad(normalizeRotYDeg(rotYDeg)), 0);
  clampMotionAboveDeck(root, stageManager);
  root.visible = true;
  applyObjOpacity(root, clamp01(opacity) * 0.88);
}

function hideExtraPreviewPerformers(usedCount) {
  for (let i = usedCount; i < previewPerformerRoots.length; i++) {
    previewPerformerRoots[i].visible = false;
  }
}

/** @param {import('./MotionGroupStore.js').MotionGroup} group @param {number} index @param {number} groupIndex */
function previewTintForMember(group, index, groupIndex) {
  const mem = group.members?.[index];
  if (mem?.color != null && mem.color !== '') {
    try {
      return new THREE.Color(mem.color).getHex();
    } catch { /* fall through */ }
  }
  return colorForGroup(group, groupIndex);
}

/**
 * @param {import('./MotionGroupStore.js').MotionGroup} group
 * @param {Record<string, any>} patch
 * @param {(id: string) => import('./MotionDirector.js').MotionItem | null | undefined} getMotionItem
 * @param {import('../stage/StageManager.js').StageManager | null | undefined} [stageManager]
 * @param {{ memberCount?: number, groupIndex?: number }} [options]
 */
export function previewGroupStartPose(group, patch, getMotionItem, stageManager = null, options = {}) {
  const members = group?.members || [];
  const memberCount = Math.max(members.length, options.memberCount ?? 0);
  if (memberCount === 0) return;
  const g = { ...group, ...patch };
  const formation = g.fromFormation || g.formation || 'line';
  const spacing = Math.max(
    0.5,
    Number(g.fromFormationSpacing ?? g.formationSpacing) || 30,
  );
  const offsets = computeFormationOffsets(memberCount, formation, spacing);
  const cx = Number(g.fromX) || 0;
  const cz = Number(g.fromZ) || 0;
  const rotY = g.fromRotY ?? 0;
  const opacity = clamp01(g.opacity ?? 1);
  const groupIndex = options.groupIndex ?? 0;

  for (let i = 0; i < memberCount; i++) {
    const mem = members[i];
    const item = mem?.deployedMotionId ? getMotionItem(mem.deployedMotionId) : null;
    const off = offsets[i] || { x: 0, z: 0 };
    const wx = cx + off.x;
    const wz = cz + off.z;
    if (item) {
      poseMotionItem(item, wx, wz, rotY, opacity);
    } else {
      const tint = previewTintForMember(g, i, groupIndex);
      posePreviewPerformer(
        ensurePreviewPerformer(i, stageManager, tint),
        wx,
        wz,
        rotY,
        opacity,
        stageManager,
      );
    }
  }
  hideExtraPreviewPerformers(memberCount);
}

/**
 * @param {import('./MotionGroupStore.js').MotionGroup} group
 * @param {string} segmentId
 * @param {Record<string, any>} patch
 * @param {(id: string) => import('./MotionDirector.js').MotionItem | null | undefined} getMotionItem
 * @param {import('../stage/StageManager.js').StageManager | null | undefined} [stageManager]
 * @param {{ memberCount?: number, groupIndex?: number }} [options]
 */
export function previewGroupSegmentPose(group, segmentId, patch, getMotionItem, stageManager = null, options = {}) {
  const members = group?.members || [];
  const memberCount = Math.max(members.length, options.memberCount ?? 0);
  if (memberCount === 0) return;
  const baseSegs = ensureGroupSegments({ ...group });
  const idx = baseSegs.findIndex((s) => s.id === segmentId);
  if (idx < 0) return;

  const g = {
    ...group,
    segments: baseSegs.map((s) => (s.id === segmentId ? { ...s, ...patch } : { ...s })),
  };
  syncHoldSegmentsFromChain(g);
  const seg = g.segments[idx];
  if (!seg || seg.kind === 'hold') return;

  const center = {
    x: Number(seg.anchorX) || 0,
    z: Number(seg.anchorZ) || 0,
    rotY: Number(seg.toRotY) || 0,
  };
  const spacing = Math.max(0.5, Number(seg.formationSpacing ?? g.formationSpacing) || 30);
  const offsets = computeFormationOffsets(
    memberCount,
    seg.formation || g.formation || 'grid',
    spacing,
  );
  const opacity = clamp01(g.opacity ?? 1);
  const groupIndex = options.groupIndex ?? 0;

  for (let i = 0; i < memberCount; i++) {
    const mem = members[i];
    const item = mem?.deployedMotionId ? getMotionItem(mem.deployedMotionId) : null;
    const off = offsets[i] || { x: 0, z: 0 };
    const wx = center.x + off.x;
    const wz = center.z + off.z;
    if (item) {
      poseMotionItem(item, wx, wz, center.rotY, opacity);
    } else {
      const tint = previewTintForMember(g, i, groupIndex);
      posePreviewPerformer(
        ensurePreviewPerformer(i, stageManager, tint),
        wx,
        wz,
        center.rotY,
        opacity,
        stageManager,
      );
    }
  }
  hideExtraPreviewPerformers(memberCount);
}

/**
 * @param {import('./MotionDirector.js').MotionItem} item
 * @param {Record<string, any>} patch
 */
export function previewSoloMotionStartPose(item, patch) {
  const anim = item?.anim || {};
  poseMotionItem(
    item,
    patch.fromX ?? anim.fromX ?? 0,
    patch.fromZ ?? anim.fromZ ?? 0,
    patch.fromRotY ?? anim.fromRotY ?? 0,
    patch.opacity ?? anim.opacity ?? 1,
  );
}

/**
 * @param {import('./MotionDirector.js').MotionItem} item
 * @param {string} segmentId
 * @param {Record<string, any>} patch
 */
export function previewSoloMotionSegmentPose(item, segmentId, patch) {
  const anim = item?.anim || {};
  const seg = anim.segments?.find((s) => s.id === segmentId);
  if (!seg || seg.kind === 'hold') return;
  const merged = { ...seg, ...patch };
  poseMotionItem(
    item,
    merged.anchorX,
    merged.anchorZ,
    merged.toRotY,
    anim.opacity ?? 1,
  );
}

/**
 * @param {{ x: number, z: number, rotY?: number, opacity?: number }} pose
 * @param {{
 *   groupStore?: { getActive: () => import('./MotionGroupStore.js').MotionGroup | null },
 *   getMotion: (id: string) => import('./MotionDirector.js').MotionItem | null | undefined,
 *   getSelectedMotionId: () => string | null,
 * }} ctx
 */
export function previewPositionOnStage(pose, ctx) {
  const active = ctx.groupStore?.getActive?.();
  const memberCount = Math.max(active?.members?.length || 0, 1);
  if (active && memberCount > 0) {
    const groups = ctx.groupStore?.list?.() || [];
    const groupIndex = groups.findIndex((g) => g.id === active.id);
    previewGroupStartPose(
      active,
      {
        fromX: pose.x,
        fromZ: pose.z,
        fromRotY: pose.rotY ?? active.fromRotY ?? 0,
        opacity: pose.opacity ?? active.opacity ?? 1,
      },
      (id) => ctx.getMotion(id),
      ctx.stageManager ?? null,
      {
        memberCount,
        groupIndex: groupIndex >= 0 ? groupIndex : 0,
      },
    );
    return;
  }
  const selId = ctx.getSelectedMotionId?.();
  const item = selId ? ctx.getMotion(selId) : null;
  if (item?.object) {
    poseMotionItem(item, pose.x, pose.z, pose.rotY ?? 0, pose.opacity ?? 1);
  }
}
