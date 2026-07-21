/** 새 모션 객체를 씬에 넣을 때 무대 앞쪽(Z+) 기본 오프셋 */
export const MOTION_DEFAULT_SPAWN_Z = 50;

export function applyDefaultMotionSpawnPosition(object) {
  if (!object) return;
  object.position.z += MOTION_DEFAULT_SPAWN_Z;
}
