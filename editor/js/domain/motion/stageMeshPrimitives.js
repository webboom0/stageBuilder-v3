/**
 * Stage mesh primitives — v3 Mesh panel (직육면체 · 원통).
 * Procedural entries in Assets → Stage tab; tint in Properties.
 */
import * as THREE from 'three';
import { getDefaultWorldPerMeter, getStageWorldPerMeter } from '../stage/stageGridAdaptive.js';
import { applyMotionTint } from './walkLitePerformer.js';

export const STAGE_BOX_PROCEDURAL_ID = 'stage-box';
export const STAGE_CYLINDER_PROCEDURAL_ID = 'stage-cylinder';

export const STAGE_PRIMITIVE_DEFAULT_COLOR = 0xaaaaaa;

/** @type {ReadonlyArray<{
 *   path: string,
 *   name: string,
 *   displayName: string,
 *   filename: string,
 *   procedural: string,
 *   color: number,
 * }>} */
export const DEFAULT_STAGE_MESH_SAMPLES = Object.freeze([
  {
    path: `procedural://${STAGE_BOX_PROCEDURAL_ID}`,
    name: '직육면체',
    displayName: '직육면체',
    filename: 'Box.primitive',
    procedural: STAGE_BOX_PROCEDURAL_ID,
    color: STAGE_PRIMITIVE_DEFAULT_COLOR,
  },
  {
    path: `procedural://${STAGE_CYLINDER_PROCEDURAL_ID}`,
    name: '원통',
    displayName: '원통',
    filename: 'Cylinder.primitive',
    procedural: STAGE_CYLINDER_PROCEDURAL_ID,
    color: STAGE_PRIMITIVE_DEFAULT_COLOR,
  },
]);

/**
 * @param {string} proceduralId
 * @param {{
 *   name?: string,
 *   color?: number | string,
 *   stageManager?: import('../stage/StageManager.js').StageManager | null,
 * }} [opts]
 */
export function createStagePrimitive(proceduralId, opts = {}) {
  const wpm = getStageWorldPerMeter(opts.stageManager) || getDefaultWorldPerMeter();
  const color = opts.color ?? STAGE_PRIMITIVE_DEFAULT_COLOR;
  if (proceduralId === STAGE_BOX_PROCEDURAL_ID) {
    return buildBox({ name: opts.name, color, worldPerMeter: wpm, proceduralId });
  }
  if (proceduralId === STAGE_CYLINDER_PROCEDURAL_ID) {
    return buildCylinder({ name: opts.name, color, worldPerMeter: wpm, proceduralId });
  }
  throw new Error(`Unknown stage primitive: ${proceduralId}`);
}

/**
 * @param {{
 *   name?: string,
 *   color?: number | string,
 *   worldPerMeter: number,
 *   proceduralId: string,
 * }} opts
 */
function buildBox(opts) {
  const sizeM = 2;
  const s = sizeM * opts.worldPerMeter;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: STAGE_PRIMITIVE_DEFAULT_COLOR });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Box';

  const root = new THREE.Group();
  root.name = opts.name || '직육면체';
  root.add(mesh);
  root.scale.set(s, s, s);
  tagPrimitiveRoot(root, opts.proceduralId, opts.name || '직육면체');
  applyMotionTint(root, opts.color ?? STAGE_PRIMITIVE_DEFAULT_COLOR);

  return { root, animations: [], animDuration: 2 };
}

/**
 * @param {{
 *   name?: string,
 *   color?: number | string,
 *   worldPerMeter: number,
 *   proceduralId: string,
 * }} opts
 */
function buildCylinder(opts) {
  const radiusM = 1;
  const heightM = 2;
  const wpm = opts.worldPerMeter;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 32, 1, false);
  const material = new THREE.MeshStandardMaterial({ color: STAGE_PRIMITIVE_DEFAULT_COLOR });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Cylinder';

  const root = new THREE.Group();
  root.name = opts.name || '원통';
  root.add(mesh);
  root.scale.set(radiusM * wpm, heightM * wpm, radiusM * wpm);
  tagPrimitiveRoot(root, opts.proceduralId, opts.name || '원통');
  applyMotionTint(root, opts.color ?? STAGE_PRIMITIVE_DEFAULT_COLOR);

  return { root, animations: [], animDuration: 2 };
}

/**
 * @param {THREE.Object3D} root
 * @param {string} proceduralId
 * @param {string} displayName
 */
function tagPrimitiveRoot(root, proceduralId, displayName) {
  if (!root.userData) root.userData = {};
  root.userData.source = 'stage-prop';
  root.userData.procedural = proceduralId;
  root.userData.fileUrl = `procedural://${proceduralId}`;
  root.userData.stagePrimitive = proceduralId;
  root.userData.tintable = true;
}

/** @param {string} urlOrId */
export function resolveStageProceduralId(urlOrId) {
  const raw = String(urlOrId || '');
  const id = raw.startsWith('procedural://') ? raw.slice('procedural://'.length) : raw;
  if (id === STAGE_BOX_PROCEDURAL_ID || id === STAGE_CYLINDER_PROCEDURAL_ID) return id;
  return null;
}
