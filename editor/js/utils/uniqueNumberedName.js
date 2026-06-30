/**
 * Scene 트리에서 baseName / baseName<N> 을 스캔해 다음 유일 이름 반환 (예: Box1, Box2).
 * 기존 숫자 없는 "Box"는 1번으로 간주해 번호가 겹치지 않게 함.
 * @param {import('three').Object3D | null | undefined} root
 * @param {string} baseName
 */
export function getNextNumberedObjectName(root, baseName) {
  if (!root) return `${baseName}1`;
  let max = 0;
  const esc = String(baseName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reNum = new RegExp(`^${esc}(\\d+)$`);
  root.traverse((obj) => {
    const n = obj.name;
    if (n === baseName) max = Math.max(max, 1);
    const m = n.match(reNum);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${baseName}${max + 1}`;
}
