/**
 * Measure proscenium + arena stage scale limits from v3 FBX vs floor bounds.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

globalThis.document = {
  createElementNS: () => ({
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};

const REF_W = 20;
const REF_D = 22.5;

const STAGES = {
  proscenium: {
    fbx: '../../StageBuilder_v3/files/stage/background.fbx',
    bg: {
      position: [228.340, -125.909, 764.44],
      rotation: [-Math.PI / 2, 0, Math.PI / 2],
      scale: [0.6, 0.6, 0.4],
    },
    floor: {
      type: 'box',
      geometry: [147.446, 1, 111.747],
      position: [74, -4.163, 0],
      scale: [5.5, 6.779, 3.0],
    },
    pivot: [74, 0, 0],
  },
  arena: {
    fbx: '../../StageBuilder_v3/files/stage/arena_stage.fbx',
    bg: {
      position: [-752.465, 318.258, 830.285],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [0.130, 0.130, 0.220],
    },
    floor: {
      type: 'circle',
      geometryRadius: 1,
      position: [0, 0, 0],
      scale: [135.620, 152.327, 1.320],
      rotationX: -Math.PI / 2,
    },
    pivot: [0, 0, 0],
  },
};

function loadFbx(relPath) {
  const fbxPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), relPath);
  const nodeBuffer = fs.readFileSync(fbxPath);
  const arrayBuffer = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength,
  );
  return new FBXLoader().parse(arrayBuffer, fbxPath);
}

function buildFloor(spec) {
  if (spec.type === 'circle') {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(spec.geometryRadius, 96));
    floor.rotation.x = spec.rotationX;
    floor.position.set(...spec.position);
    floor.scale.set(...spec.scale);
    return floor;
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(...spec.geometry));
  floor.position.set(...spec.position);
  floor.scale.set(...spec.scale);
  return floor;
}

function boxOf(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { box, size };
}

function axisMaxFactor(floorBox, shellBox, pivotX, axis) {
  const isX = axis === 'x';
  const floorMin = isX ? floorBox.min.x : floorBox.min.z;
  const floorMax = isX ? floorBox.max.x : floorBox.max.z;
  const shellMin = isX ? shellBox.min.x : shellBox.min.z;
  const shellMax = isX ? shellBox.max.x : shellBox.max.z;
  const floorSize = floorMax - floorMin;
  const floorCenter = (floorMin + floorMax) / 2;
  const marginPos = shellMax - (floorCenter + floorSize / 2);
  const marginNeg = pivotX - floorSize / 2 - shellMin;
  if (axis === 'z') {
    const pivotZ = (floorMin + floorMax) / 2;
    const mPos = shellMax - (pivotZ + floorSize / 2);
    const mNeg = pivotZ - floorSize / 2 - shellMin;
    return 1 + (2 * Math.min(mPos, mNeg)) / floorSize;
  }
  const mPos = shellMax - (pivotX + floorSize / 2);
  const mNeg = pivotX - floorSize / 2 - shellMin;
  return 1 + (2 * Math.min(mPos, mNeg)) / floorSize;
}

function analyzeStage(name, spec) {
  const bg = loadFbx(spec.fbx);
  bg.position.set(...spec.bg.position);
  bg.rotation.set(...spec.bg.rotation);
  bg.scale.set(...spec.bg.scale);
  const floor = buildFloor(spec.floor);
  const bgBox = boxOf(bg).box;
  const floorBox = boxOf(floor).box;
  const pivotX = spec.pivot[0];

  const maxWidthFactor = Math.max(0.85, axisMaxFactor(floorBox, bgBox, pivotX, 'x'));
  const floorCenterZ = (floorBox.min.z + floorBox.max.z) / 2;
  const halfD = (floorBox.max.z - floorBox.min.z) / 2;
  const floorD = floorBox.max.z - floorBox.min.z;
  const marginZPos = bgBox.max.z - (floorCenterZ + halfD);
  const marginZNeg = floorCenterZ - halfD - bgBox.min.z;
  const maxDepthFactor = Math.max(0.85, 1 + (2 * Math.min(marginZPos, marginZNeg)) / floorD);

  const SAFETY = 0.98;
  const minFactor = 0.88;
  const widthMax = Math.min(maxWidthFactor * SAFETY, 1.05);
  const depthMax = Math.min(maxDepthFactor * SAFETY, 1.05);

  return {
    stage: name,
    floorUnits: {
      width: Number((floorBox.max.x - floorBox.min.x).toFixed(1)),
      depth: Number((floorBox.max.z - floorBox.min.z).toFixed(1)),
    },
    rawMaxFactor: {
      width: Number(maxWidthFactor.toFixed(4)),
      depth: Number(maxDepthFactor.toFixed(4)),
    },
    limits: {
      minWidthM: Number((REF_W * minFactor).toFixed(1)),
      maxWidthM: Number((REF_W * widthMax).toFixed(1)),
      minDepthM: Number((REF_D * minFactor).toFixed(1)),
      maxDepthM: Number((REF_D * depthMax).toFixed(1)),
      minWidthFactor: minFactor,
      maxWidthFactor: Number(widthMax.toFixed(3)),
      minDepthFactor: minFactor,
      maxDepthFactor: Number(depthMax.toFixed(3)),
    },
  };
}

const results = Object.entries(STAGES).map(([name, spec]) => analyzeStage(name, spec));
console.log(JSON.stringify(results, null, 2));
