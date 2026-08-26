import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import {
  getStageDeckCenter,
  getStageDeckWorldY,
  getStageWorldPerMeter,
} from '../stage/stageGridAdaptive.js';
import { DEFAULT_HUMAN_HEIGHT_M, resolveHumanWorldHeight } from '../stage/HumanScale.js';
import { loadMotionFbx } from './loadMotionFbx.js';
import { sampleMotionBag } from './sampleTracks.js';
import { motionKeyFromObject } from './motionKeyValue.js';
import { createWalkLitePerformer, WALK_LITE_PROCEDURAL_ID, applyMotionTint } from './walkLitePerformer.js';

/** v3 MOTION_DEFAULT_SPAWN_Z ≈ 50 world units forward of deck center */
export const MOTION_SPAWN_FORWARD_WORLD = 50;

const TRACK_PALETTE = [
  '#3d7a5a',
  '#4a8f6a',
  '#2e6b4f',
  '#5a9e78',
  '#3a6e55',
  '#68a888',
];

let _seq = 1;
let _colorSeq = 0;

/**
 * MotionDirector — v3-aligned:
 * - 1 object = 1 timeline track (kind: motion)
 * - compound keys edited in Properties
 * - FBX or procedural samples
 */
export class MotionDirector {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
   *   stageManager?: import('../stage/StageManager.js').StageManager | null,
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.engine = opts.engine;
    this.stageManager = opts.stageManager ?? null;
    /** @type {Map<string, MotionItem>} */
    this.motions = new Map();
    /** Skip apply overwrite while gizmo dragging (set by viewport) */
    this.suspendApply = false;

    this.root = new THREE.Group();
    this.root.name = 'Motions';
    this.scene.add(this.root);
  }

  list() {
    return [...this.motions.values()];
  }

  /** @param {string} id */
  get(id) {
    return this.motions.get(id) ?? null;
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    for (const m of this.motions.values()) {
      if (m.trackId === trackId) return m;
    }
    return null;
  }

  /**
   * @param {string} urlOrProcedural
   * @param {{
   *   name?: string,
   *   folderId?: string | null,
   *   positionOffset?: number[],
   *   procedural?: string,
   *   color?: number,
   * }} [opts]
   */
  async addFromUrl(urlOrProcedural, opts = {}) {
    const name = opts.name || guessName(urlOrProcedural);
    // Stage size → world units/m → 170cm adult height on that stage
    const humanM = this.stageManager?.profile?.humanHeightM ?? DEFAULT_HUMAN_HEIGHT_M;
    const worldPerM = getStageWorldPerMeter(this.stageManager);
    const targetWorldHeight = resolveHumanWorldHeight(this.stageManager, humanM);

    let root;
    let animations = [];
    let animDuration = 2;

    if (
      opts.procedural === WALK_LITE_PROCEDURAL_ID
      || String(urlOrProcedural).includes('walk-lite')
      || String(urlOrProcedural).startsWith('procedural://')
    ) {
      root = createWalkLitePerformer({
        displayName: name,
        color: opts.color,
        targetWorldHeight,
      });
      animations = root.animations?.slice() || [];
      animDuration = animations[0]?.duration > 0 ? animations[0].duration : 0.7;
    } else {
      const loaded = await loadMotionFbx(urlOrProcedural, {
        name,
        targetWorldHeight,
      });
      root = loaded.root;
      animations = loaded.animations;
      animDuration = loaded.animDuration;
    }

    if (!root.userData) root.userData = {};
    root.userData.humanHeightM = humanM;
    root.userData.spawnWorldHeight = targetWorldHeight;
    root.userData.worldPerMeter = worldPerM;
    if (opts.color != null && opts.color !== '') {
      applyMotionTint(root, opts.color);
    }

    return this._registerObject(root, {
      name,
      animations,
      animDuration,
      folderId: opts.folderId ?? null,
      positionOffset: opts.positionOffset,
      fileUrl: urlOrProcedural,
    });
  }

  /**
   * @param {THREE.Object3D} root
   * @param {{
   *   name: string,
   *   animations?: THREE.AnimationClip[],
   *   animDuration?: number,
   *   folderId?: string | null,
   *   positionOffset?: number[],
   *   fileUrl?: string,
   * }} meta
   */
  _registerObject(root, meta) {
    const id = `mot_${_seq++}`;
    root.userData.motionId = id;
    root.userData.source = 'motion';
    root.userData.fileUrl = meta.fileUrl || '';

    placeOnStage(root, this.stageManager, meta.positionOffset);

    const mixer = new THREE.AnimationMixer(root);
    let action = null;
    const animations = meta.animations || [];
    if (animations[0]) {
      action = mixer.clipAction(animations[0]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.enabled = true;
      action.play();
      mixer.setTime(0);
    }

    const color = TRACK_PALETTE[_colorSeq++ % TRACK_PALETTE.length];
    const track = this.engine.addTrack({
      name: meta.name,
      kind: 'motion',
      group: `motion:${id}`,
      section: 'motion',
      folderId: meta.folderId ?? null,
      motionId: id,
      color,
    });

    const keyValue = motionKeyFromObject(root);
    this.engine.addKeyframe(track.id, 0, keyValue, INTERPOLATION.LINEAR);

    ensureMaterialsForOpacity(root);
    disableMotionFrustumCull(root);
    this.root.add(root);

    /** @type {MotionItem} */
    const item = {
      id,
      name: meta.name,
      object: root,
      mixer,
      action,
      animDuration: meta.animDuration ?? 2,
      trackId: track.id,
      folderId: meta.folderId ?? null,
      fileUrl: meta.fileUrl || '',
      color,
    };
    this.motions.set(id, item);
    this.engine.emit('tracks');
    this.apply(this.engine.playheadSec);
    return item;
  }

  /**
   * @param {string} trackId
   */
  keyValueForTrack(trackId) {
    const m = this.findByTrackId(trackId);
    if (!m) return null;
    const track = this.engine.getTrack(trackId);
    if (!track) return motionKeyFromObject(m.object);
    const sampled = sampleMotionBag(
      track.keys,
      this.engine.playheadSec,
      motionKeyFromObject(m.object),
    );
    return motionKeyFromObject(m.object, {
      opacity: sampled.opacity,
      visible: sampled.visible,
    });
  }

  /**
   * Apply presence + transform + FBX pose.
   * @param {number} timeSec
   */
  apply(timeSec) {
    if (this.suspendApply) return;
    for (const m of this.motions.values()) {
      const track = this.engine.getTrack(m.trackId);
      const bag = track
        ? sampleMotionBag(track.keys, timeSec, motionKeyFromObject(m.object))
        : motionKeyFromObject(m.object);

      // Track-head eye (hidden) wins over keyframe visible
      m.object.visible = !(track?.hidden) && bag.visible !== false;
      applyOpacity(m.object, bag.opacity);
      m.object.position.set(bag.position[0], bag.position[1], bag.position[2]);
      m.object.rotation.set(bag.rotation[0], bag.rotation[1], bag.rotation[2]);
      m.object.scale.set(bag.scale[0], bag.scale[1], bag.scale[2]);
      // Keep cull disabled (skinned bind-pose / hot-reload edge cases)
      if (m.object.frustumCulled) disableMotionFrustumCull(m.object);

      if (!m.mixer || !m.action) continue;
      const span = Math.max(m.animDuration, 0.001);
      m.mixer.setTime(((timeSec % span) + span) % span);
    }
  }

  /** @param {string} id */
  remove(id) {
    const m = this.motions.get(id);
    if (!m) return;
    this.engine.removeTrack(m.trackId);
    this.root.remove(m.object);
    m.mixer?.stopAllAction();
    disposeObject(m.object);
    this.motions.delete(id);
    this.engine.emit('tracks');
  }

  /** Remove scene object for a timeline track (track row deleted separately). */
  removeByTrackId(trackId) {
    const m = this.findByTrackId(trackId);
    if (!m) return false;
    this.root.remove(m.object);
    m.mixer?.stopAllAction();
    disposeObject(m.object);
    this.motions.delete(m.id);
    return true;
  }
}

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   object: THREE.Object3D,
 *   mixer: THREE.AnimationMixer,
 *   action: THREE.AnimationAction | null,
 *   animDuration: number,
 *   trackId: string,
 *   folderId: string | null,
 *   fileUrl: string,
 *   color?: string,
 *   anim?: import('./motionAnim.js').MotionAnim,
 * }} MotionItem
 */

/**
 * @param {THREE.Object3D} root
 * @param {import('../stage/StageManager.js').StageManager | null} stageManager
 * @param {number[] | undefined} positionOffset
 */
function placeOnStage(root, stageManager, positionOffset) {
  const center = getStageDeckCenter(stageManager);
  const deckY = getStageDeckWorldY(stageManager);

  const ox = positionOffset?.[0] ?? 0;
  const oz = positionOffset?.[2] ?? 0;
  const oy = positionOffset?.[1] ?? 0;

  root.position.x = center.x + ox;
  root.position.z = center.z + MOTION_SPAWN_FORWARD_WORLD + oz;
  root.position.y += oy;

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    root.position.y += deckY - box.min.y;
  }
}

function guessName(url) {
  try {
    const part = decodeURIComponent(String(url).split('/').pop() || 'Motion');
    return part.replace(/\.fbx$/i, '').replace(/^procedural:/, '') || 'Motion';
  } catch {
    return 'Motion';
  }
}

/** Clone shared materials so opacity edits don't leak across instances. */
function ensureMaterialsForOpacity(root) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => (m ? m.clone() : m));
    } else if (child.material) {
      child.material = child.material.clone();
    }
  });
}

/**
 * Skinned FBX bind-pose bounds + transparent sorting both cause "pop" on orbit.
 * Always draw motion meshes (no frustum cull).
 * @param {THREE.Object3D} root
 */
function disableMotionFrustumCull(root) {
  root.traverse((child) => {
    child.frustumCulled = false;
    if ((child.isSkinnedMesh || child.isMesh) && child.geometry) {
      try {
        child.geometry.computeBoundingSphere?.();
        const bs = child.geometry.boundingSphere;
        if (bs && Number.isFinite(bs.radius)) {
          // Inflate so any residual cull stays generous
          bs.radius = Math.max(bs.radius * 8, 80);
        }
      } catch { /* ignore */ }
    }
  });
}

/**
 * Opacity 1 → opaque (depthWrite on). Only use transparent path when fading.
 * Forcing transparent=true at opacity 1 causes angle-dependent disappear vs floor/building.
 * @param {THREE.Object3D} root
 * @param {number} opacity
 */
function applyOpacity(root, opacity) {
  const o = Math.min(1, Math.max(0, opacity));
  const fade = o < 0.999;
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.opacity = o;
      mat.transparent = fade;
      mat.depthWrite = !fade;
      mat.depthTest = true;
      mat.needsUpdate = true;
    }
  });
}

/** @param {THREE.Object3D} obj */
function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.();
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
    else mat?.dispose?.();
  });
}
