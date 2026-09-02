import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { getStageDeckWorldY } from '../stage/stageGridAdaptive.js';
import { clampMotionAboveDeck, isStageMotionItem } from '../motion/MotionDirector.js';
import { asMotionKeyValue } from '../motion/motionKeyValue.js';
import {
  applyStageTransform,
  previewStageTransform,
  snapshotStageTransformKeys,
} from '../motion/stageTransformSync.js';
import { cloneKeyframeValue } from '../timeline/cloneValue.js';
import { keyframeTimeEps } from '../timeline/KeyframeStore.js';

/**
 * Viewport picking + TransformControls (v3 Viewport.js pattern).
 * Gizmo / stage-pick writes object transform and selected motion key (undoable).
 */
export function createViewportInteraction(opts) {
  const {
    dom,
    camera,
    scene,
    controls: orbit,
    motion,
    engine,
    stageManager,
    onSelectionChange,
  } = opts;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const transform = new TransformControls(camera, dom);
  transform.setSize(0.85);
  const transformHelper = typeof transform.getHelper === 'function'
    ? transform.getHelper()
    : transform;
  scene.add(transformHelper);

  /** @type {string | null} */
  let selectedMotionId = null;
  /** @type {'translate' | 'rotate' | 'scale'} */
  let mode = 'translate';
  let localSpace = false;
  /** Stage pick: motionId waiting for click */
  let pickMotionId = null;
  /** @type {null | ((pt: { x: number, z: number }) => void)} */
  let pickPointCallback = null;

  /** @type {{ motionId: string, before: object, keyId: string | null, trackId: string | null, keyBefore: any, keysBefore?: { id: string, before: any }[], lockY?: boolean, canCommit: boolean } | null} */
  let dragSnap = null;
  let dragging = false;

  /** @param {import('../motion/MotionDirector.js').MotionItem | null} m */
  function isCharacterMotion(m) {
    if (!m) return true;
    if (m.section === 'stage' || m.assetRole === 'stage') return false;
    const track = engine.getTrack(m.trackId);
    return (track?.section || 'motion') === 'motion';
  }

  function updateTranslateYVisibility() {
    const m = selectedMotionId ? motion.get(selectedMotionId) : null;
    const char = isCharacterMotion(m);
    transform.showY = mode !== 'translate' || !char;
  }

  /** @param {import('../timeline/Track.js').Track | null | undefined} track @param {string | null} explicitKeyId */
  function resolveWritableKeyframe(track, explicitKeyId) {
    if (!track?.keys) return null;
    if (explicitKeyId && engine.selectedTrackId === track.id) {
      const selected = track.keys.get(explicitKeyId);
      if (selected) return selected;
    }
    return track.keys.findAtTime(engine.playheadSec, {
      eps: keyframeTimeEps(engine.fps),
    }) ?? null;
  }

  transform.addEventListener('dragging-changed', (ev) => {
    orbit.enabled = !ev.value;
    if (ev.value) {
      const m = motion.get(selectedMotionId);
      if (!m) return;
      const track = engine.getTrack(m.trackId);
      const beforeLocked = snapshotObject(m.object);
      if (track?.locked) {
        applySnapshot(m.object, beforeLocked);
        orbit.enabled = true;
        dragging = false;
        dragSnap = null;
        transform.enabled = false;
        requestAnimationFrame(() => { transform.enabled = true; });
        motion.apply(engine.playheadSec);
        return;
      }
      dragging = true;
      const explicitKeyId = engine.selectedTrackId === m.trackId
        ? engine.selectedKeyframeId
        : null;
      const writable = resolveWritableKeyframe(track, explicitKeyId);
      const stageSync = isStageMotionItem(m, engine);
      const editedKeyId = writable?.id ?? null;
      dragSnap = {
        motionId: m.id,
        before: snapshotObject(m.object),
        keyId: editedKeyId,
        trackId: m.trackId,
        keyBefore: writable ? cloneKeyframeValue(writable.value) : null,
        keysBefore: stageSync && track && editedKeyId
          ? snapshotStageTransformKeys(track, editedKeyId)
          : undefined,
        lockY: isCharacterMotion(m),
        canCommit: !!writable || (stageSync && (track?.keys.list().length ?? 0) > 0),
      };
    } else if (dragSnap) {
      const m = motion.get(dragSnap.motionId);
      if (m) {
        if (dragSnap.canCommit) {
          commitTransform(
            m,
            dragSnap.before,
            dragSnap.trackId,
            dragSnap.keyId,
            dragSnap.keyBefore,
            dragSnap.keysBefore,
          );
        } else {
          motion.apply(engine.playheadSec);
        }
      }
      dragSnap = null;
      dragging = false;
      onSelectionChange?.();
    }
  });

  transform.addEventListener('objectChange', () => {
    if (!selectedMotionId || !dragSnap) return;
    const m = motion.get(selectedMotionId);
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) return;
    // Character translate is XZ only — lock Y to pre-drag height
    if (mode === 'translate' && dragSnap?.lockY !== false) {
      const lockY = dragSnap?.before?.position?.y ?? m.object.position.y;
      if (Number.isFinite(lockY)) m.object.position.y = lockY;
    } else if (isStageMotionItem(m, engine)) {
      clampMotionAboveDeck(m.object, stageManager);
    }
    syncLiveKeyPreview(m);
  });

  function setMode(next) {
    mode = next;
    transform.setMode(next);
    updateTranslateYVisibility();
  }

  function setLocal(on) {
    localSpace = !!on;
    transform.setSpace(localSpace ? 'local' : 'world');
  }

  function clearViewportSelection() {
    selectedMotionId = null;
    transform.detach();
    pickMotionId = null;
    pickPointCallback = null;
    clearPickBanner();
    updateTranslateYVisibility();
    onSelectionChange?.();
  }

  function clearSelection(opt = {}) {
    clearViewportSelection();
    if (!opt.skipEngine) engine.clearSelection();
  }

  /**
   * @param {string | null} motionId
   * @param {{ selectKey?: boolean }} [opt]
   */
  function selectMotion(motionId, opt = {}) {
    selectedMotionId = motionId;
    const m = motionId ? motion.get(motionId) : null;
    if (!m) {
      transform.detach();
      updateTranslateYVisibility();
      onSelectionChange?.();
      return;
    }
    transform.attach(m.object);
    transform.enabled = !engine.getTrack(m.trackId)?.locked;
    updateTranslateYVisibility();
    if (opt.selectKey !== false && !engine.selectedKeyframeId) {
      const track = engine.getTrack(m.trackId);
      const keys = track?.keys.list() || [];
      const at = keys.find(
        (k) => Math.abs(k.timeSec - engine.playheadSec) <= keyframeTimeEps(engine.fps),
      ) || null;
      if (at) engine.selectKeyframe(m.trackId, at.id);
      else engine.selectTracks([m.trackId], { updateKeyTarget: false });
    } else {
      engine.selectTracks([m.trackId], { keepKeys: true, updateKeyTarget: false });
    }
    onSelectionChange?.();
  }

  /** @type {(() => void) | null} */
  let pickPointCancelCallback = null;

  function beginStagePick(motionId) {
    pickPointCallback = null;
    pickPointCancelCallback = null;
    pickMotionId = motionId;
    selectMotion(motionId, { selectKey: false });
    showPickBanner('무대에서 위치 지정 — 바닥을 클릭하세요 (Esc 취소)');
    setPickCursor(true);
  }

  /**
   * Group ensemble path pick — returns xz on deck (no motion move).
   * @param {(pt: { x: number, z: number }) => void} onPicked
   * @param {string} [banner]
   * @param {() => void} [onCancelled]
   */
  function beginPointPick(onPicked, banner, onCancelled) {
    pickMotionId = null;
    pickPointCallback = onPicked;
    pickPointCancelCallback = onCancelled ?? null;
    showPickBanner(banner || '그룹 위치 지정 — 바닥을 클릭하세요 (Esc 취소)');
    setPickCursor(true);
  }

  function cancelStagePick() {
    const cancelCb = pickPointCancelCallback;
    pickMotionId = null;
    pickPointCallback = null;
    pickPointCancelCallback = null;
    clearPickBanner();
    setPickCursor(false);
    cancelCb?.();
  }

  function applyPointPick(e) {
    if (!pickPointCallback) return false;
    ndcFromEvent(e);
    raycaster.setFromCamera(pointer, camera);
    const deckY = getStageDeckWorldY(stageManager);
    groundPlane.constant = -deckY;
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) {
      cancelStagePick();
      return true;
    }
    const cb = pickPointCallback;
    cancelStagePick();
    cb({ x: hit.x, z: hit.z });
    return true;
  }

  function ndcFromEvent(e) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickMotionFromEvent(e) {
    ndcFromEvent(e);
    raycaster.setFromCamera(pointer, camera);
    const roots = motion.list().map((m) => m.object);
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData?.motionId) obj = obj.parent;
    return obj?.userData?.motionId || null;
  }

  function applyStagePick(e) {
    if (!pickMotionId) return false;
    const m = motion.get(pickMotionId);
    if (!m) {
      cancelStagePick();
      return false;
    }
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      cancelStagePick();
      return true;
    }
    ndcFromEvent(e);
    raycaster.setFromCamera(pointer, camera);
    const deckY = getStageDeckWorldY(stageManager);
    groundPlane.constant = -deckY;
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) {
      cancelStagePick();
      return true;
    }
    const before = snapshotObject(m.object);
    m.object.position.x = hit.x;
    m.object.position.z = hit.z;
    // keep current Y (feet)
    commitTransform(m, before, m.trackId, engine.selectedTrackId === m.trackId ? engine.selectedKeyframeId : null, null);
    cancelStagePick();
    onSelectionChange?.();
    return true;
  }

  /**
   * @param {import('../motion/MotionDirector.js').MotionItem} m
   * @param {ReturnType<typeof snapshotObject>} before
   * @param {string | null} trackId
   * @param {string | null} keyId
   * @param {any} keyBeforeSnap
   * @param {{ id: string, before: any }[] | undefined} [keysBefore]
   */
  function commitTransform(m, before, trackId, keyId, keyBeforeSnap, keysBefore) {
    const after = snapshotObject(m.object);
    const track = trackId ? engine.getTrack(trackId) : null;
    if (track?.locked) {
      applySnapshot(m.object, before);
      motion.apply(engine.playheadSec);
      return;
    }

    if (isStageMotionItem(m, engine) && track) {
      const editedKeyId = keyId ?? resolveWritableKeyframe(track, null)?.id ?? null;
      applyStageTransform(engine, m.trackId, {
        position: [after.position.x, after.position.y, after.position.z],
        rotation: [after.rotation.x, after.rotation.y, after.rotation.z],
        scale: [after.scale.x, after.scale.y, after.scale.z],
      }, editedKeyId, {
        label: 'Transform motion',
        keysBefore,
      });
      motion.apply(engine.playheadSec);
      return;
    }

    const target = track ? resolveWritableKeyframe(track, keyId) : null;
    if (!target) {
      motion.apply(engine.playheadSec);
      return;
    }

    const ensuredKeyId = target.id;
    let keyBefore = keyBeforeSnap ?? cloneKeyframeValue(target.value);
    const bag = asMotionKeyValue(target.value);
    bag.position = [after.position.x, after.position.y, after.position.z];
    bag.rotation = [after.rotation.x, after.rotation.y, after.rotation.z];
    bag.scale = [after.scale.x, after.scale.y, after.scale.z];
    const keyAfter = bag;
    track.keys.update(ensuredKeyId, { value: bag });
    if (engine.selectedTrackId === trackId) {
      engine.selectKeyframe(trackId, ensuredKeyId, { updateKeyTarget: false });
    }

    engine.commands.push({
      label: 'Transform motion',
      undo: () => {
        applySnapshot(m.object, before);
        track.keys.update(ensuredKeyId, { value: cloneKeyframeValue(keyBefore) });
        engine.emit('keys');
        motion.apply(engine.playheadSec);
      },
      redo: () => {
        applySnapshot(m.object, after);
        track.keys.update(ensuredKeyId, { value: cloneKeyframeValue(keyAfter) });
        engine.emit('keys');
        motion.apply(engine.playheadSec);
      },
    });
    engine.emit('keys');
    motion.apply(engine.playheadSec);
  }

  function syncLiveKeyPreview(m) {
    if (!dragSnap) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) return;

    if (isStageMotionItem(m, engine)) {
      const editedKeyId = dragSnap.keyId
        ?? (engine.selectedTrackId === m.trackId ? engine.selectedKeyframeId : null)
        ?? resolveWritableKeyframe(track, null)?.id
        ?? null;
      previewStageTransform(engine, m.trackId, {
        position: [m.object.position.x, m.object.position.y, m.object.position.z],
        rotation: [m.object.rotation.x, m.object.rotation.y, m.object.rotation.z],
        scale: [m.object.scale.x, m.object.scale.y, m.object.scale.z],
      }, editedKeyId);
      return;
    }

    if (engine.selectedTrackId !== m.trackId || !engine.selectedKeyframeId) return;
    const kf = track?.keys.get(engine.selectedKeyframeId);
    if (!kf) return;
    const bag = asMotionKeyValue(kf.value);
    bag.position = [m.object.position.x, m.object.position.y, m.object.position.z];
    bag.rotation = [m.object.rotation.x, m.object.rotation.y, m.object.rotation.z];
    bag.scale = [m.object.scale.x, m.object.scale.y, m.object.scale.z];
    // Live preview without history until drag end
    track.keys.update(kf.id, { value: bag });
    engine.emit('keys');
  }

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (transform.axis) return; // gizmo handle
  };

  const onClick = (e) => {
    if (e.button !== 0) return;
    if (dragging) return;
    if (pickPointCallback) {
      applyPointPick(e);
      return;
    }
    if (pickMotionId) {
      applyStagePick(e);
      return;
    }
    // Don't steal clicks from gizmo
    if (transform.dragging) return;
    const id = pickMotionFromEvent(e);
    if (id) selectMotion(id);
    else clearViewportSelection();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && (pickMotionId || pickPointCallback)) {
      cancelStagePick();
      e.preventDefault();
    }
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  setMode('translate');
  setLocal(false);

  return {
    transform,
    getSelectedMotionId: () => selectedMotionId,
    selectMotion,
    clearSelection,
    setMode,
    setLocal,
    beginStagePick,
    beginPointPick,
    cancelStagePick,
    isPicking: () => !!(pickMotionId || pickPointCallback),
    refreshTransformLock() {
      const m = selectedMotionId ? motion.get(selectedMotionId) : null;
      if (!m) return;
      transform.enabled = !engine.getTrack(m.trackId)?.locked;
    },
    destroy() {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      transform.detach();
      scene.remove(transformHelper);
      transform.dispose();
      clearPickBanner();
      setPickCursor(false);
    },
  };
}

function snapshotObject(obj) {
  return {
    position: obj.position.clone(),
    rotation: obj.rotation.clone(),
    scale: obj.scale.clone(),
  };
}

function applySnapshot(obj, snap) {
  obj.position.copy(snap.position);
  obj.rotation.copy(snap.rotation);
  obj.scale.copy(snap.scale);
}

let _banner = null;
function showPickBanner(text) {
  clearPickBanner();
  const el = document.createElement('div');
  el.className = 'sb-stage-pick-banner';
  el.textContent = text;
  document.body.appendChild(el);
  _banner = el;
}
function clearPickBanner() {
  _banner?.remove();
  _banner = null;
}

function setPickCursor(on) {
  document.body.classList.toggle('sb-picking', !!on);
}
