/**
 * 아레나 합성 바닥 — 에디터에서 맞춘 위치·스케일(Stage 그룹 로컬).
 * CircleGeometry(r=1) + rotation X -90° 후 mesh.scale.
 *
 * 외부 에디터 스케일 표기 (X, Y, Z) = (135.620, 1.320, 152.327).
 * Three.js 원판은 XY에 있고 Rx(-90°) 뒤 수평면이 XZ가 되므로,
 * 로컬 scale (X,Y,Z) ← (사용자 X, 사용자 Z, 사용자 Y) 로 매핑한다.
 */
export const ARENA_FLOOR_POSITION = { x: 0, y: 0, z: 0};

export const ARENA_FLOOR_USER_SCALE_X = 135.620;
export const ARENA_FLOOR_USER_SCALE_Y = 1.320;
export const ARENA_FLOOR_USER_SCALE_Z = 152.327;

/** 원통 스크린 반지름(기준): 바닥 수평 두 축 중 큰 값 — 실제 메시는 × SCALE */
export const ARENA_VIDEO_CYLINDER_RADIUS = Math.max(
  ARENA_FLOOR_USER_SCALE_X,
  ARENA_FLOOR_USER_SCALE_Z,
);

/** 비디오 원통 반지름 = 기준 × 이 비율 */
export const ARENA_VIDEO_CYLINDER_RADIUS_SCALE = 0.82;

/** 비디오 원통 높이 */
export const ARENA_VIDEO_CYLINDER_HEIGHT = 50;

/** 바닥 면 대비 원통 스크린 중심 높이 오프셋 */
export const ARENA_VIDEO_Y_ABOVE_FLOOR = 100 - 0.163;

/** 원통 스크린을 그 위로 더 올림 (Stage 로컬 Y+) */
export const ARENA_VIDEO_Y_LIFT = 24;

const UNIT_CIRCLE_RADIUS = 1;

/**
 * @returns {{
 *   geometryRadius: number,
 *   x: number, y: number, z: number,
 *   scaleX: number, scaleY: number, scaleZ: number,
 *   videoCylinderRadius: number,
 *   videoCylinderHeight: number,
 * }}
 */
export function arenaFloorLayoutFromBackground(_bg) {
  return {
    geometryRadius: UNIT_CIRCLE_RADIUS,
    x: ARENA_FLOOR_POSITION.x,
    y: ARENA_FLOOR_POSITION.y,
    z: ARENA_FLOOR_POSITION.z,
    scaleX: ARENA_FLOOR_USER_SCALE_X,
    scaleY: ARENA_FLOOR_USER_SCALE_Z,
    scaleZ: ARENA_FLOOR_USER_SCALE_Y,
    videoCylinderRadius:
      ARENA_VIDEO_CYLINDER_RADIUS * ARENA_VIDEO_CYLINDER_RADIUS_SCALE,
    videoCylinderHeight: ARENA_VIDEO_CYLINDER_HEIGHT,
  };
}
