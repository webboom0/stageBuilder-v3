import * as THREE from "three";

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * 월드 축 정렬 바운딩 박스 크기.
 * 표시 m는 motionDisplayUnits로 환산. 그리드 굵은 칸 = 표시 1m.
 * @param {THREE.Object3D} object
 * @returns {THREE.Vector3}
 */
function getObjectWorldSize(object) {
  if (!object) return new THREE.Vector3();

  _box.setFromObject(object, true);
  return _box.getSize(_size);
}

/**
 * 목표 월드 크기(m)에 맞게 scale 벡터 계산.
 * @param {THREE.Object3D} object
 * @param {THREE.Vector3} targetSize
 * @returns {THREE.Vector3}
 */
function computeScaleForWorldSize(object, targetSize) {
  const current = getObjectWorldSize(object);
  const scale = object.scale.clone();
  const eps = 1e-6;

  if (current.x > eps && Number.isFinite(targetSize.x)) {
    scale.x *= targetSize.x / current.x;
  }
  if (current.y > eps && Number.isFinite(targetSize.y)) {
    scale.y *= targetSize.y / current.y;
  }
  if (current.z > eps && Number.isFinite(targetSize.z)) {
    scale.z *= targetSize.z / current.z;
  }

  return scale;
}

export { getObjectWorldSize, computeScaleForWorldSize };
