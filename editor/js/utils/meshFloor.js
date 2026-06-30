/**
 * 로컬 바운딩 기준 Y 방향 반높이(월드). 회전 없는 직육면체/원통 등 바닥 맞춤용.
 */
export function getMeshWorldHalfHeightY(mesh) {
  if (!mesh || !mesh.isMesh || !mesh.geometry) return 0;
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return 0;
  const localHalfY = (bb.max.y - bb.min.y) * 0.5;
  return Math.abs(localHalfY * mesh.scale.y);
}
