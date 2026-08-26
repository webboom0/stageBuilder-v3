import * as THREE from 'three';

/**
 * Lightweight sample performer (v3 WalkLite-style stand-in).
 * Used when catalog entry is procedural and no FBX is available.
 * @param {{ name?: string, color?: number, height?: number }} [opts]
 */
export function createSamplePerformer(opts = {}) {
  const height = opts.height ?? 45;
  const color = opts.color ?? 0x6ec6ff;
  const root = new THREE.Group();
  root.name = opts.name || 'Sample';

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 1,
  });

  const bodyH = height * 0.45;
  const legH = height * 0.35;
  const headR = height * 0.08;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(height * 0.09, bodyH, 4, 8), mat);
  torso.position.y = legH + bodyH * 0.5;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), mat.clone());
  head.position.y = legH + bodyH + headR * 1.2;
  root.add(head);

  const legGeo = new THREE.CapsuleGeometry(height * 0.04, legH * 0.7, 3, 6);
  const left = new THREE.Mesh(legGeo, mat.clone());
  left.position.set(-height * 0.05, legH * 0.45, 0);
  const right = new THREE.Mesh(legGeo, mat.clone());
  right.position.set(height * 0.05, legH * 0.45, 0);
  root.add(left, right);

  root.userData.source = 'motion';
  root.userData.procedural = 'sample';
  root.userData.tintColor = `#${color.toString(16).padStart(6, '0')}`;
  return root;
}

export const SAMPLE_COLORS = [
  0x6ec6ff,
  0xffb74d,
  0x81c784,
  0xce93d8,
  0xef9a9a,
  0xfff176,
];
