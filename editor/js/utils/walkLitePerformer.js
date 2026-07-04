/**
 * cosmos-stage-twin 스타일 경량 퍼포머 (캡슐 인형 + walk 사이클).
 * 실제 FBX 없이 그룹 GO / 모션 트랙 부하 테스트용.
 */
import * as THREE from "three";

export const WALK_LITE_FILENAME = "WalkLite.fbx";
export const WALK_LITE_PROCEDURAL_ID = "walk-lite";

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

/** 그룹에 배치된 모든 모션 멤버 색 갱신 */
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
      obj.userData?.type === "actor";
    if (isMotion) applyGroupMotionColor(obj, color);
  });
  editor.signals?.rendererUpdated?.dispatch?.();
  editor.signals?.materialChanged?.dispatch?.(null, 0);
}

/** @deprecated recolorGroupMotionMembers 사용 */
export function recolorWalkLiteMembersInGroup(editor, group) {
  recolorGroupMotionMembers(editor, group);
}

/** 3D 왼쪽 상단 "테스터" 뱃지 스프라이트 */
function createTesterBadgeSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  const r = 10;
  ctx.fillStyle = "rgba(255, 170, 40, 0.95)";
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.arcTo(156, 4, 156, 44, r);
  ctx.arcTo(156, 44, 4, 44, r);
  ctx.arcTo(4, 44, 4, 4, r);
  ctx.arcTo(4, 4, 156, 4, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1a1208";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("테스터", 80, 26);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = "testerBadge";
  sprite.userData.isTesterBadge = true;
  // body 로컬: 머리 왼쪽 위
  sprite.position.set(-1.35, 5.9, 0.2);
  sprite.scale.set(2.4, 0.72, 1);
  return sprite;
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

  const badge = createTesterBadgeSprite();
  body.add(badge);

  root.userData.armL = armL;
  root.userData.armR = armR;
  root.userData.legL = legL;
  root.userData.legR = legR;
  root.userData.body = body;
  root.userData.testerBadge = badge;
  root.userData.procedural = WALK_LITE_PROCEDURAL_ID;
  root.userData.source = "motion";
  root.userData.fileName = WALK_LITE_FILENAME;
  root.userData.filePath = `procedural://${WALK_LITE_PROCEDURAL_ID}`;
  root.userData.displayName = displayName;
  root.userData.walkLiteColor = color;
  root.userData.isTesterMotion = true;

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
