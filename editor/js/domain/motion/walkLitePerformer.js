/**
 * WalkLite — v3 cosmos-style lightweight performer (capsule + Walk clip).
 * Color is set in Properties (tint), not by multiple catalog entries.
 * Spawn height = stage-relative 170cm via `targetWorldHeight` (HumanScale).
 */
import * as THREE from 'three';
import { scaleToHumanHeight } from '../stage/HumanScale.js';

export const WALK_LITE_FILENAME = 'WalkLite.fbx';
export const WALK_LITE_PROCEDURAL_ID = 'walk-lite';

export const WALK_LITE_DEFAULT_COLOR = 0xd9c08a;

/** Default palette when group.color is unset (v3 WALK_LITE_GROUP_COLORS) */
export const GROUP_TINT_PALETTE = [
  0xd9c08a,
  0x8a9ad9,
  0x7dcea0,
  0xe8a0bf,
  0xf0c27a,
  0x85c1e9,
  0xd7bde2,
  0xf5b7b1,
];

/** #rrggbb or number → #rrggbb */
export function normalizeColorHex(color, fallbackIndex = 0) {
  try {
    if (color != null && color !== '') {
      return `#${new THREE.Color(color).getHexString()}`;
    }
  } catch { /* fall through */ }
  const i = Math.max(0, fallbackIndex) % GROUP_TINT_PALETTE.length;
  return `#${new THREE.Color(GROUP_TINT_PALETTE[i]).getHexString()}`;
}

/** group.color picker first, else palette by index */
export function colorForGroup(group, groupIndex = 0) {
  if (group?.color != null && group.color !== '') {
    try {
      return new THREE.Color(group.color).getHex();
    } catch { /* fall through */ }
  }
  return GROUP_TINT_PALETTE[Math.max(0, groupIndex) % GROUP_TINT_PALETTE.length];
}

/** Apply tint to all meshes; stores userData.tintColor */
export function applyMotionTint(object, color) {
  if (!object) return;
  let c;
  try {
    c = new THREE.Color(color);
  } catch {
    return;
  }
  const hex = c.getHex();
  object.traverse((o) => {
    if (!o.isMesh || o.userData?.isTesterBadge) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (mat?.color && typeof mat.color.setHex === 'function') {
        mat.color.setHex(hex);
        mat.needsUpdate = true;
      }
    });
  });
  if (!object.userData) object.userData = {};
  object.userData.tintable = true;
  object.userData.tintColor = hex;
  object.userData.walkLiteColor = hex;
}

/**
 * Recolor deployed group members (v3 recolorGroupMotionMembers).
 * Member tintColor wins over group color.
 *
 * @param {import('./MotionGroupStore.js').MotionGroup} group
 * @param {(id: string) => import('./MotionDirector.js').MotionItem | null} getMotion
 * @param {number} [groupIndex]
 * @param {() => import('./MotionDirector.js').MotionItem[]} [listFolderMotions]
 */
export function recolorGroupDeployedMembers(group, getMotion, groupIndex = 0, listFolderMotions) {
  if (!group || typeof getMotion !== 'function') return;
  const groupColor = colorForGroup(group, groupIndex);
  /** @type {Set<string>} */
  const tinted = new Set();

  /** @param {import('./MotionDirector.js').MotionItem | null | undefined} item @param {object} [member] */
  const tintItem = (item, member) => {
    if (!item?.object || tinted.has(item.id)) return;
    tinted.add(item.id);
    const obj = item.object;
    if (member?.tintColor != null && member.tintColor !== '') {
      applyMotionTint(obj, member.tintColor);
      obj.userData.scCustomTint = true;
      return;
    }
    delete obj.userData.scCustomTint;
    applyMotionTint(obj, groupColor);
  };

  const members = group.members || [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (m?.deployedMotionId) tintItem(getMotion(m.deployedMotionId), m);
  }

  // Folder sweep — fixes duplicate deployedMotionId / stale relink (same catalog name members)
  if (typeof listFolderMotions === 'function') {
    const folderItems = listFolderMotions();
    for (let i = 0; i < folderItems.length; i++) {
      tintItem(folderItems[i], members[i]);
    }
  }
}

/**
 * @param {{ displayName?: string, color?: number, targetWorldHeight?: number }} [options]
 */
export function createWalkLitePerformer(options = {}) {
  const displayName = options.displayName || 'WalkLite';
  const color = options.color ?? WALK_LITE_DEFAULT_COLOR;
  /** World-unit height for 170cm on current stage. */
  const targetWorldHeight = options.targetWorldHeight ?? 45;

  const root = new THREE.Group();
  root.name = displayName;

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.4, 3, 7), skin);
  torso.name = 'torso';
  torso.position.y = 3.3;
  body.add(torso);

  const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.4, 3, 7), skin);
  hip.name = 'hip';
  hip.position.y = 1.95;
  body.add(hip);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 9), skin);
  head.name = 'head';
  head.position.y = 5.15;
  body.add(head);

  const legL = new THREE.Group();
  legL.name = 'legL';
  const legLm = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 2.0, 3, 6), skin);
  legLm.position.y = -1.1;
  legL.add(legLm);
  legL.position.set(-0.32, 1.95, 0);
  body.add(legL);

  const legR = new THREE.Group();
  legR.name = 'legR';
  const legRm = legLm.clone();
  legR.add(legRm);
  legR.position.set(0.32, 1.95, 0);
  body.add(legR);

  const armL = new THREE.Group();
  armL.name = 'armL';
  const armLm = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 2.0, 3, 6), skin);
  armLm.position.y = -1.0;
  armL.add(armLm);
  armL.position.set(-0.78, 4.2, 0);
  body.add(armL);

  const armR = new THREE.Group();
  armR.name = 'armR';
  const armRm = armLm.clone();
  armR.add(armRm);
  armR.position.set(0.78, 4.2, 0);
  body.add(armR);

  root.userData.armL = armL;
  root.userData.armR = armR;
  root.userData.legL = legL;
  root.userData.legR = legR;
  root.userData.body = body;
  root.userData.procedural = WALK_LITE_PROCEDURAL_ID;
  root.userData.source = 'motion';
  root.userData.fileName = WALK_LITE_FILENAME;
  root.userData.filePath = `procedural://${WALK_LITE_PROCEDURAL_ID}`;
  root.userData.displayName = displayName;
  root.userData.walkLiteColor = color;
  root.userData.isTesterMotion = true;
  root.userData.tintable = true;
  root.userData.tintColor = color;

  scaleToHumanHeight(root, targetWorldHeight);
  root.animations = [buildWalkClip()];

  return root;
}

/** Walk cycle — limbs swing (v3 buildWalkClip) */
function buildWalkClip() {
  const duration = 0.7;
  const times = [0, 0.175, 0.35, 0.525, 0.7];
  const legAmp = 0.55;
  const armAmp = 0.5;
  const bobAmp = 0.06;
  const s = [0, 1, 0, -1, 0];

  const legL = s.map((v) => v * legAmp);
  const legR = s.map((v) => -v * legAmp);
  const armL = s.map((v) => -v * armAmp);
  const armR = s.map((v) => v * armAmp);
  const armZL = s.map(() => -0.12);
  const armZR = s.map(() => 0.12);
  const bob = s.map((v) => Math.abs(v) * bobAmp);

  const tracks = [
    new THREE.NumberKeyframeTrack('body/legL.rotation[x]', times, legL),
    new THREE.NumberKeyframeTrack('body/legR.rotation[x]', times, legR),
    new THREE.NumberKeyframeTrack('body/armL.rotation[x]', times, armL),
    new THREE.NumberKeyframeTrack('body/armR.rotation[x]', times, armR),
    new THREE.NumberKeyframeTrack('body/armL.rotation[z]', times, armZL),
    new THREE.NumberKeyframeTrack('body/armR.rotation[z]', times, armZR),
    new THREE.NumberKeyframeTrack('body.position[y]', times, bob),
  ];

  return new THREE.AnimationClip('Walk', duration, tracks);
}
