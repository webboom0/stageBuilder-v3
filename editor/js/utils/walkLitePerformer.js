/**
 * cosmos-stage-twin 스타일 경량 퍼포머 (캡슐 인형 + walk 사이클).
 * 실제 FBX 없이 그룹 GO / 모션 트랙 부하 테스트용.
 */
import * as THREE from "three";
import { applyDefaultMotionSpawnPosition } from "./motionSpawnDefaults.js";

export const WALK_LITE_FILENAME = "WalkLite.fbx";
export const WALK_LITE_PROCEDURAL_ID = "walk-lite";
export const CHEONROK_FILENAME = "CheonrokLite.fbx";
export const CHEONROK_PROCEDURAL_ID = "cheonrok-lite";
export const KKEKKORI_FILENAME = "KkekkoriLite.fbx";
export const KKEKKORI_PROCEDURAL_ID = "kkekkori-lite";

/** 그룹별 구분 색 (cosmos HTML 톤 + 추가 팔레트) */
export const WALK_LITE_GROUP_COLORS = [
  0xd9c08a, // 샌드
  0x8a9ad9, // 블루
  0x7dcea0, // 그린
  0xe8a0bf, // 핑크
  0xf0c27a, // 골드
  0x85c1e9, // 스카이
  0xd7bde2, // 라벤더
  0xf5b7b1, // 코랄
];

/** #rrggbb 또는 number → #rrggbb */
export function normalizeColorHex(color, fallbackIndex = 0) {
  try {
    if (color != null && color !== "") {
      const c = new THREE.Color(color);
      return `#${c.getHexString()}`;
    }
  } catch (_) {
    /* noop */
  }
  const i = Math.max(0, fallbackIndex) % WALK_LITE_GROUP_COLORS.length;
  return `#${new THREE.Color(WALK_LITE_GROUP_COLORS[i]).getHexString()}`;
}

/** 그룹.color(픽커) 우선, 없으면 목록 순서 팔레트 */
export function colorForWalkLiteGroup(editor, group) {
  if (group?.color != null && group.color !== "") {
    try {
      return new THREE.Color(group.color).getHex();
    } catch (_) {
      /* fall through */
    }
  }
  const groups = editor?.showControl?.ensureGroups?.() || [];
  const idx = groups.findIndex((g) => g?.id === group?.id);
  const i = idx >= 0 ? idx : 0;
  return WALK_LITE_GROUP_COLORS[i % WALK_LITE_GROUP_COLORS.length];
}

/**
 * 그룹 모션 객체 색 적용 (WalkLite·일반 FBX 공통).
 * 테스터 뱃지 스프라이트는 제외. tintColor에도 저장해 속성 패널과 맞춤.
 */
export function applyGroupMotionColor(object, color) {
  if (!object) return;
  let c;
  try {
    c = new THREE.Color(color);
  } catch (_) {
    return;
  }
  const hex = c.getHex();
  object.traverse((o) => {
    if (!o.isMesh || o.userData?.isTesterBadge) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (mat?.color && typeof mat.color.setHex === "function") {
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

/** @deprecated applyGroupMotionColor 사용 */
export function applyWalkLiteColor(object, color) {
  applyGroupMotionColor(object, color);
}

/** 그룹에 배치된 모든 모션 멤버 색 갱신 (멤버별 tintColor / scCustomTint 있으면 유지) */
export function recolorGroupMotionMembers(editor, group) {
  if (!editor?.scene || !group) return;
  const color = colorForWalkLiteGroup(editor, group);
  (group.members || []).forEach((m) => {
    const uuid = m?.deployedUuid;
    if (!uuid) return;
    const obj = editor.scene.getObjectByProperty?.("uuid", uuid);
    if (!obj) return;
    const isMotion =
      obj.userData?.source === "motion" ||
      obj.userData?.procedural === WALK_LITE_PROCEDURAL_ID ||
      obj.userData?.procedural === CHEONROK_PROCEDURAL_ID ||
      obj.userData?.procedural === KKEKKORI_PROCEDURAL_ID ||
      obj.userData?.type === "actor";
    if (!isMotion) return;

    if (m.tintColor != null && m.tintColor !== "") {
      applyGroupMotionColor(obj, m.tintColor);
      obj.userData.scCustomTint = true;
      return;
    }
    if (obj.userData?.scCustomTint) return;

    applyGroupMotionColor(obj, color);
  });
  editor.signals?.rendererUpdated?.dispatch?.();
  editor.signals?.materialChanged?.dispatch?.(null, 0);
}

/** @deprecated recolorGroupMotionMembers 사용 */
export function recolorWalkLiteMembersInGroup(editor, group) {
  recolorGroupMotionMembers(editor, group);
}

/** 기존 씬에 남아 있는 3D 테스터 뱃지 제거 */
export function stripTesterBadgesFromScene(editor) {
  const scene = editor?.scene;
  if (!scene) return;
  const toRemove = [];
  scene.traverse((o) => {
    if (o.userData?.isTesterBadge || o.name === "testerBadge") {
      toRemove.push(o);
    }
  });
  for (const sprite of toRemove) {
    sprite.parent?.remove(sprite);
    sprite.material?.map?.dispose?.();
    sprite.material?.dispose?.();
  }
  scene.traverse((o) => {
    if (o.userData?.testerBadge != null) delete o.userData.testerBadge;
  });
}

/** @returns {boolean} */
export function isWalkLiteCatalogEntry(entry) {
  if (!entry) return false;
  if (entry.procedural === WALK_LITE_PROCEDURAL_ID) return true;
  const key = String(entry.filename || entry.name || entry.path || "").toLowerCase();
  return (
    key === "walklite.fbx" ||
    key === "walklite" ||
    key.includes("procedural://walk-lite") ||
    key.includes("walk-lite")
  );
}

/** @returns {boolean} */
export function isCheonrokCatalogEntry(entry) {
  if (!entry) return false;
  if (entry.procedural === CHEONROK_PROCEDURAL_ID) return true;
  const key = String(entry.filename || entry.name || entry.path || "").toLowerCase();
  return (
    key === "cheonroklite.fbx" ||
    key === "cheonrok" ||
    key === "cheonroklite" ||
    key.includes("procedural://cheonrok-lite") ||
    key.includes("cheonrok-lite")
  );
}

/** WalkLite / 천록 / 꾀꼬리 등 경량 프로시저럴 */
export function isKkekkoriCatalogEntry(entry) {
  if (!entry) return false;
  if (entry.procedural === KKEKKORI_PROCEDURAL_ID) return true;
  const key = String(entry.filename || entry.name || entry.path || "").toLowerCase();
  return (
    key === "kkekkorilite.fbx" ||
    key === "kkekkori" ||
    key.includes("procedural://kkekkori-lite") ||
    key.includes("kkekkori-lite")
  );
}

export function isLiteProceduralCatalogEntry(entry) {
  return (
    isWalkLiteCatalogEntry(entry) ||
    isCheonrokCatalogEntry(entry) ||
    isKkekkoriCatalogEntry(entry)
  );
}

/**
 * HTML makePerformer 와 동일한 계층: torso/hip/head + legL/R + armL/R
 * + THREE.AnimationClip("Walk") — MotionTimeline mixer 호환
 */
/** Loader.autoScaleObject 와 동일 — FBX 모션 기본 목표 크기(최대 치수 30) */
const MOTION_TARGET_SIZE = 30;

function autoScaleLikeFbxMotion(object, targetSize = MOTION_TARGET_SIZE) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!(maxDimension > 0)) {
    object.position.set(0, 0, 0);
    return 1;
  }

  let adaptiveTargetSize = targetSize;
  if (maxDimension < 1) adaptiveTargetSize = targetSize * 2;
  else if (maxDimension > 1000) adaptiveTargetSize = targetSize * 0.8;
  else if (maxDimension > 100) adaptiveTargetSize = targetSize * 0.9;

  const scale = adaptiveTargetSize / maxDimension;
  object.scale.setScalar(scale);
  object.position.set(0, 0, 0);
  object.userData.originalSize = {
    x: size.x,
    y: size.y,
    z: size.z,
    maxDimension,
  };
  object.userData.autoScale = scale;
  object.userData.adaptiveTargetSize = adaptiveTargetSize;
  object.userData.minYPosition = 0;
  object.updateMatrixWorld(true);

  // 발이 바닥에 오도록 (스케일 후 바운딩 min.y → 0)
  const box2 = new THREE.Box3().setFromObject(object);
  if (Number.isFinite(box2.min.y)) {
    object.position.y -= box2.min.y;
  }
  applyDefaultMotionSpawnPosition(object);
  return scale;
}

export function createWalkLitePerformer(options = {}) {
  const displayName = options.displayName || "WalkLite";
  const color = options.color ?? 0xd9c08a;
  const targetSize = options.targetSize ?? MOTION_TARGET_SIZE;

  const root = new THREE.Group();
  root.name = displayName;

  // bob은 body에만 적용 — root.position.y(바닥 정렬)를 덮어쓰지 않음
  const body = new THREE.Group();
  body.name = "body";
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.4, 3, 7), skin);
  torso.name = "torso";
  torso.position.y = 3.3;
  torso.castShadow = true;
  body.add(torso);

  const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.4, 3, 7), skin);
  hip.name = "hip";
  hip.position.y = 1.95;
  hip.castShadow = true;
  body.add(hip);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 9), skin);
  head.name = "head";
  head.position.y = 5.15;
  head.castShadow = true;
  body.add(head);

  const legL = new THREE.Group();
  legL.name = "legL";
  const legLm = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 2.0, 3, 6), skin);
  legLm.position.y = -1.1;
  legLm.castShadow = true;
  legL.add(legLm);
  legL.position.set(-0.32, 1.95, 0);
  body.add(legL);

  const legR = new THREE.Group();
  legR.name = "legR";
  const legRm = legLm.clone();
  legR.add(legRm);
  legR.position.set(0.32, 1.95, 0);
  body.add(legR);

  const armL = new THREE.Group();
  armL.name = "armL";
  const armLm = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 2.0, 3, 6), skin);
  armLm.position.y = -1.0;
  armLm.castShadow = true;
  armL.add(armLm);
  armL.position.set(-0.78, 4.2, 0);
  body.add(armL);

  const armR = new THREE.Group();
  armR.name = "armR";
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
  root.userData.source = "motion";
  root.userData.fileName = WALK_LITE_FILENAME;
  root.userData.filePath = `procedural://${WALK_LITE_PROCEDURAL_ID}`;
  root.userData.displayName = displayName;
  root.userData.walkLiteColor = color;
  root.userData.isTesterMotion = true;
  root.userData.tintable = true;
  root.userData.tintColor = color;

  // FBX 모션과 동일: 최대 치수 → 30
  autoScaleLikeFbxMotion(root, targetSize);
  // body.position.y bob은 로컬 단위 — root.scale에 비례해 보임
  root.animations = [buildWalkClip()];

  return root;
}

/** cosmos walk: sin(t*9) → period ≈ 0.698s */
function buildWalkClip() {
  const duration = 0.7;
  const times = [0, 0.175, 0.35, 0.525, 0.7];
  // legS = s*0.55, arm = ±s*0.5, bob = |s|*0.06 (body 로컬 — root scale에 비례)
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
    new THREE.NumberKeyframeTrack("body/legL.rotation[x]", times, legL),
    new THREE.NumberKeyframeTrack("body/legR.rotation[x]", times, legR),
    new THREE.NumberKeyframeTrack("body/armL.rotation[x]", times, armL),
    new THREE.NumberKeyframeTrack("body/armR.rotation[x]", times, armR),
    new THREE.NumberKeyframeTrack("body/armL.rotation[z]", times, armZL),
    new THREE.NumberKeyframeTrack("body/armR.rotation[z]", times, armZR),
    new THREE.NumberKeyframeTrack("body.position[y]", times, bob),
  ];

  return new THREE.AnimationClip("Walk", duration, tracks);
}

/** 천록 — WalkLite와 같은 경량 프로시저럴 4족 */

export function createCheonrokLite(options = {}) {
  const displayName = options.displayName || "천록";
  const color = options.color ?? 0xc4a574;
  const targetSize = options.targetSize ?? MOTION_TARGET_SIZE;

  const root = new THREE.Group();
  root.name = displayName;

  const body = new THREE.Group();
  body.name = "body";
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
  });
  const hornSkin = new THREE.MeshStandardMaterial({
    color: 0xe8dcc8,
    roughness: 0.4,
    metalness: 0.05,
  });

  // 가로로 누운 몸통 (캡슐)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 3, 8), skin);
  torso.name = "torso";
  torso.rotation.z = Math.PI / 2;
  torso.position.set(0, 1.55, 0);
  torso.castShadow = true;
  body.add(torso);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 3, 6), skin);
  neck.name = "neck";
  neck.position.set(0, 2.05, 1.15);
  neck.rotation.x = -0.55;
  neck.castShadow = true;
  body.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), skin);
  head.name = "head";
  head.position.set(0, 2.35, 1.65);
  head.scale.set(1, 0.9, 1.15);
  head.castShadow = true;
  body.add(head);

  [-0.18, 0.18].forEach((x, i) => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 6), hornSkin);
    horn.name = i === 0 ? "hornL" : "hornR";
    horn.position.set(x, 2.7, 1.55);
    horn.rotation.x = -0.4;
    horn.castShadow = true;
    body.add(horn);
  });

  const makeLeg = (name, x, z) => {
    const leg = new THREE.Group();
    leg.name = name;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.15, 3, 6), skin);
    mesh.position.y = -0.65;
    mesh.castShadow = true;
    leg.add(mesh);
    leg.position.set(x, 1.35, z);
    body.add(leg);
    return leg;
  };

  const legFL = makeLeg("legFL", -0.38, 0.75);
  const legFR = makeLeg("legFR", 0.38, 0.75);
  const legBL = makeLeg("legBL", -0.38, -0.75);
  const legBR = makeLeg("legBR", 0.38, -0.75);

  root.userData.body = body;
  root.userData.legFL = legFL;
  root.userData.legFR = legFR;
  root.userData.legBL = legBL;
  root.userData.legBR = legBR;
  root.userData.procedural = CHEONROK_PROCEDURAL_ID;
  root.userData.source = "motion";
  root.userData.fileName = "CheonrokLite";
  root.userData.filePath = `procedural://${CHEONROK_PROCEDURAL_ID}`;
  root.userData.displayName = displayName;
  root.userData.dreamCheonrok = true;
  root.userData.isTesterMotion = true;
  root.userData.tintable = true;
  root.userData.tintColor = color;

  autoScaleLikeFbxMotion(root, targetSize);
  root.animations = [buildCheonrokWalkClip()];

  return root;
}

/** 4족 간단 워킹 클립 */
function buildCheonrokWalkClip() {
  const duration = 0.7;
  const times = [0, 0.175, 0.35, 0.525, 0.7];
  const amp = 0.45;
  const s = [0, 1, 0, -1, 0];
  const fl = s.map((v) => v * amp);
  const fr = s.map((v) => -v * amp);
  const bl = s.map((v) => -v * amp);
  const br = s.map((v) => v * amp);
  const bob = s.map((v) => Math.abs(v) * 0.04);

  return new THREE.AnimationClip("Walk", duration, [
    new THREE.NumberKeyframeTrack("body/legFL.rotation[x]", times, fl),
    new THREE.NumberKeyframeTrack("body/legFR.rotation[x]", times, fr),
    new THREE.NumberKeyframeTrack("body/legBL.rotation[x]", times, bl),
    new THREE.NumberKeyframeTrack("body/legBR.rotation[x]", times, br),
    new THREE.NumberKeyframeTrack("body.position[y]", times, bob),
  ]);
}

/** 꾀꼬리 — 간단 새 실루엣 + 날개짓 */
export function createKkekkoriLite(options = {}) {
  const displayName = options.displayName || "꾀꼬리";
  const color = options.color ?? 0xffcc33;
  const targetSize = options.targetSize ?? 10;

  const root = new THREE.Group();
  root.name = displayName;

  const body = new THREE.Group();
  body.name = "body";
  root.add(body);

  const feather = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.08,
  });
  const beakMat = new THREE.MeshStandardMaterial({
    color: 0xff8844,
    roughness: 0.45,
    metalness: 0.05,
  });

  // 몸통
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), feather);
  torso.name = "torso";
  torso.scale.set(1.1, 0.85, 1.35);
  torso.position.set(0, 0.55, 0);
  torso.castShadow = true;
  body.add(torso);

  // 머리
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), feather);
  head.name = "head";
  head.position.set(0, 0.95, 0.55);
  head.castShadow = true;
  body.add(head);

  // 부리
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), beakMat);
  beak.name = "beak";
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.9, 0.9);
  body.add(beak);

  // 꼬리
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 6), feather);
  tail.name = "tail";
  tail.rotation.x = -Math.PI / 2.4;
  tail.position.set(0, 0.45, -0.85);
  body.add(tail);

  const makeWing = (name, xSign) => {
    const wing = new THREE.Group();
    wing.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.45), feather);
    mesh.position.x = xSign * 0.45;
    mesh.castShadow = true;
    wing.add(mesh);
    wing.position.set(xSign * 0.35, 0.6, 0);
    body.add(wing);
    return wing;
  };

  const wingL = makeWing("wingL", -1);
  const wingR = makeWing("wingR", 1);

  root.userData.body = body;
  root.userData.wingL = wingL;
  root.userData.wingR = wingR;
  root.userData.procedural = KKEKKORI_PROCEDURAL_ID;
  root.userData.source = "motion";
  root.userData.fileName = KKEKKORI_FILENAME;
  root.userData.filePath = `procedural://${KKEKKORI_PROCEDURAL_ID}`;
  root.userData.displayName = displayName;
  root.userData.isTesterMotion = true;
  root.userData.tintable = true;
  root.userData.tintColor = color;

  autoScaleLikeFbxMotion(root, targetSize);
  root.animations = [buildKkekkoriFlapClip()];

  return root;
}

function buildKkekkoriFlapClip() {
  const duration = 0.45;
  const times = [0, 0.1125, 0.225, 0.3375, 0.45];
  const amp = 0.85;
  const s = [0, 1, 0, -1, 0];
  const wL = s.map((v) => v * amp);
  const wR = s.map((v) => -v * amp);
  const bob = s.map((v) => Math.abs(v) * 0.08);

  return new THREE.AnimationClip("Flap", duration, [
    new THREE.NumberKeyframeTrack("body/wingL.rotation[z]", times, wL),
    new THREE.NumberKeyframeTrack("body/wingR.rotation[z]", times, wR),
    new THREE.NumberKeyframeTrack("body.position[y]", times, bob),
  ]);
}
