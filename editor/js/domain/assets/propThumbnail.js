import * as THREE from 'three';
import { loadPropAsset } from '../motion/loadPropAsset.js';
import { loadMotionFbx } from '../motion/loadMotionFbx.js';
import { createStagePrimitive } from '../motion/stageMeshPrimitives.js';
import {
  createWalkLitePerformer,
  WALK_LITE_PROCEDURAL_ID,
} from '../motion/walkLitePerformer.js';

const THUMB_SIZE = 72;
const MAX_CONCURRENT = 2;

/** @type {Map<string, string>} */
const cache = new Map();
/** @type {Map<string, Promise<string | null>>} */
const inflight = new Map();

/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;

/** @type {Array<{ run: () => Promise<void>, resolve: (v: string | null) => void }>} */
const queue = [];
let activeJobs = 0;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.02, 500);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(1.4, 2.2, 1.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9d4ff, 0.35);
  fill.position.set(-1.2, 0.6, -1);
  scene.add(fill);
}

/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 */
/** @param {'character' | 'stage'} kind */
function thumbKey(entry, kind) {
  if (entry.procedural) return `${kind}:proc:${entry.procedural}:${entry.color ?? ''}`;
  return `${kind}:file:${entry.url || entry.filename || entry.name || ''}`;
}

/** @param {THREE.Object3D} root */
function frameObject(root) {
  if (!camera) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) {
    camera.position.set(1.2, 1, 1.2);
    camera.lookAt(0, 0.25, 0);
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.05);
  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const offset = dist * 1.15;
  camera.position.set(center.x + offset * 0.75, center.y + offset * 0.55, center.z + offset * 0.85);
  camera.lookAt(center.x, center.y + size.y * 0.08, center.z);
  camera.updateProjectionMatrix();
}

/** @param {THREE.Object3D} root */
function disposeObject(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
    else mat?.dispose?.();
  });
}

/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @param {'character' | 'stage'} kind
 * @returns {Promise<string | null>} data URL (PNG)
 */
async function renderThumb(entry, kind) {
  ensureRenderer();
  if (!renderer || !scene || !camera) return null;

  let root;
  try {
    if (kind === 'character') {
      if (
        entry.procedural === WALK_LITE_PROCEDURAL_ID
        || String(entry.url || '').includes('walk-lite')
        || String(entry.url || '').startsWith('procedural://')
      ) {
        root = createWalkLitePerformer({
          displayName: entry.name,
          color: entry.color,
        });
      } else if (entry.url) {
        ({ root } = await loadMotionFbx(entry.url, { name: entry.name }));
      } else {
        return null;
      }
    } else if (entry.procedural) {
      ({ root } = createStagePrimitive(entry.procedural, {
        name: entry.name,
        color: entry.color,
      }));
    } else if (entry.url) {
      ({ root } = await loadPropAsset(entry.url, { name: entry.name, maxSizeM: 2.5 }));
    } else {
      return null;
    }

    scene.add(root);
    frameObject(root);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    scene.remove(root);
    disposeObject(root);
    return dataUrl;
  } catch (err) {
    console.warn('[propThumbnail]', entry.filename || entry.procedural || entry.url, err);
    return null;
  }
}

/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {Promise<string | null>}
 */
/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @param {'character' | 'stage'} kind
 * @returns {Promise<string | null>}
 */
function getAssetThumbnailDataUrl(entry, kind) {
  const key = thumbKey(entry, kind);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const running = inflight.get(key);
  if (running) return running;

  const promise = new Promise((resolve) => {
    queue.push({
      run: async () => {
        const dataUrl = await renderThumb(entry, kind);
        if (dataUrl) cache.set(key, dataUrl);
        resolve(dataUrl);
        inflight.delete(key);
      },
      resolve,
    });
    pumpQueue();
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {Promise<string | null>}
 */
export function getPropThumbnailDataUrl(entry) {
  return getAssetThumbnailDataUrl(entry, 'stage');
}

/**
 * @param {{
 *   url?: string,
 *   filename?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {Promise<string | null>}
 */
export function getCharacterThumbnailDataUrl(entry) {
  return getAssetThumbnailDataUrl(entry, 'character');
}

function pumpQueue() {
  while (activeJobs < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    if (!job) break;
    activeJobs += 1;
    job.run()
      .catch(() => job.resolve(null))
      .finally(() => {
        activeJobs -= 1;
        pumpQueue();
      });
  }
}

/** Drop cached thumbnails (e.g. after large asset purge). */
export function clearPropThumbnailCache() {
  cache.clear();
}
