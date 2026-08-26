/**
 * 아레나 합성 바닥 — v3 arenaStageLayout.js (에디터에서 맞춘 위치·스케일)
 */
export const ARENA_FLOOR_POSITION = { x: 0, y: 0, z: 0 };

export const ARENA_FLOOR_USER_SCALE_X = 135.620;
export const ARENA_FLOOR_USER_SCALE_Y = 1.320;
export const ARENA_FLOOR_USER_SCALE_Z = 152.327;

export const ARENA_VIDEO_CYLINDER_RADIUS = Math.max(
  ARENA_FLOOR_USER_SCALE_X,
  ARENA_FLOOR_USER_SCALE_Z,
);

export const ARENA_VIDEO_CYLINDER_RADIUS_SCALE = 0.82;
export const ARENA_VIDEO_CYLINDER_HEIGHT = 50;
export const ARENA_VIDEO_Y_ABOVE_FLOOR = 100 - 0.163;
export const ARENA_VIDEO_Y_LIFT = 24;

const UNIT_CIRCLE_RADIUS = 1;

/** @param {import('three').Object3D | null | undefined} _bg */
export function arenaFloorLayoutFromBackground(_bg) {
  return {
    geometryRadius: UNIT_CIRCLE_RADIUS,
    x: ARENA_FLOOR_POSITION.x,
    y: ARENA_FLOOR_POSITION.y,
    z: ARENA_FLOOR_POSITION.z,
    scaleX: ARENA_FLOOR_USER_SCALE_X,
    scaleY: ARENA_FLOOR_USER_SCALE_Z,
    scaleZ: ARENA_FLOOR_USER_SCALE_Y,
    videoCylinderRadius: ARENA_VIDEO_CYLINDER_RADIUS * ARENA_VIDEO_CYLINDER_RADIUS_SCALE,
    videoCylinderHeight: ARENA_VIDEO_CYLINDER_HEIGHT,
  };
}
