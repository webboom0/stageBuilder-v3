/**
 * Fixture type presets (cosmos grandMA3 rig)
 */
export const FIXTURE_REACH = 70;
export const BEAM_REF_ANGLE = 16;

export const FIXTURE_RIG_TYPES = {
  mh: { rig: "mh", label: "Moving Head", reach: 150, beamLen: 66, zoom: 13, max: 175 },
  wash: { rig: "wash", label: "LED Wash", reach: 150, beamLen: 66, zoom: 24, max: 135 },
  spot: { rig: "spot", label: "Profile Spot", reach: 150, beamLen: 66, zoom: 12, max: 165 },
  cyc: { rig: "cyc", label: "Cyc Wash", reach: 150, beamLen: 66, zoom: 34, max: 120 },
};

/** 3 batten rows × 6 columns = 18 fixtures (MVP — cosmos 48는 Phase 2+) */
export const ROW_DEFS = [
  { grp: "mh", type: "Moving Head", rig: "mh", name: "무빙헤드" },
  { grp: "foh", type: "LED Wash", rig: "wash", name: "FOH 워시" },
  { grp: "back", type: "LED Wash", rig: "wash", name: "백 워시" },
];

export const RIG_MATRIX = {
  cols: 6,
  rows: 3,
  battenY: 30,
  spanX: 68.6,
  spanZ: 66,
  zFront: 0.18,
  zBack: -0.32,
};

export function rigFixtureCount() {
  return RIG_MATRIX.cols * RIG_MATRIX.rows;
}

/** grandMA3식 픽스처 번호: 1열 11~16, 2열 21~26, 3열 31~36 */
export function fixtureFidFromRowCol(r, c) {
  return (r + 1) * 10 + (c + 1);
}

/** fitToStage() tuning */
export const RIG_FIT = {
  overheadRatio: 0.055,
  minOverheadWorld: 10,
  ceilingRatio: 0.55,
  spanRatio: 0.82,
  minScale: 0.35,
  maxScale: 6,
};

/**
 * 프로시니엄 연출 영역 — Sidebar.Nanseol.js NANSEOL_* 프리셋 좌표 기준.
 * _Floor mesh(811×335) 전체가 아니라 무대·조명이 실제로 쓰는 범위만 사용.
 */
export const PROSCENIUM_RIG_REF = {
  centerX: 4,
  centerZ: 10,
  /** 트러스 중심을 관객(+Z) 쪽으로 추가 이동 */
  centerZOffset: 16,
  spanX: 172,
  spanZ: 88,
  /** 트러스 바텐 Y — 파랑 조명(111~148) 중간, 앞 스폿(57~67)보다 위 */
  worldBattenY: 122,
  /** 로컬 Z: 관객쪽(+Z) 0.18 / 업스테이지(-Z) -0.32 — 관객석 위 배치 방지 */
  zFront: 0.18,
  zBack: -0.32,
};

/** 씬에 배치된 기본 스폿 이름 (ensureDefaultStageLights) */
export const STAGE_FRONT_SPOT_NAMES = ["_StageFrontSpot_L", "_StageFrontSpot_C", "_StageFrontSpot_R"];

export function mkFixtureAttr(overrides = {}) {
  return Object.assign(
    {
      dim: 0,
      pan: 0,
      tilt: 35,
      zoom: 16,
      focus: 35,
      r: 1,
      g: 1,
      b: 1,
      cto: 0,
      strobe: 0,
      iris: 100,
      prism: 0,
      gobo: 0,
    },
    overrides,
  );
}
