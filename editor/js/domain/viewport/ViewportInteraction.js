import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { getStageDeckWorldY } from '../stage/stageGridAdaptive.js';
import { motionKeyFromObject, asMotionKeyValue } from '../motion/motionKeyValue.js';
import { cloneKeyframeValue } from '../timeline/cloneValue.js';

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

  /** @type {{ motionId: string, before: object, keyId: string | null, trackId: string | null } | null} */
  let dragSnap = null;
  let dragging = false;

  transform.addEventListener('dragging-changed', (ev) => {
    orbit.enabled = !ev.value;
    if (ev.value) {
      const m = motion.get(selectedMotionId);
      if (!m) return;
      const track = engine.getTrack(m.trackId);
      if (track?.locked) {
        // Cancel drag start — leave orbit as-is next frame
        orbit.enabled = true;
        transform.enabled = false;
        requestAnimationFrame(() => { transform.enabled = true; });
        return;
      }
      dragging = true;
      let keyId = engine.selectedTrackId === m.trackId ? engine.selectedKeyframeId : null;
      let keyBefore = null;
      if (keyId && track) {
        const kf = track.keys.get(keyId);
        keyBefore = kf ? cloneKeyframeValue(kf.value) : null;
      }
      dragSnap = {
        motionId: m.id,
        before: snapshotObject(m.object),
        keyId,
        trackId: m.trackId,
        keyBefore,
      };
    } else if (dragSnap) {
      const m = motion.get(dragSnap.motionId);
      if (m) {
        commitTransform(m, dragSnap.before, dragSnap.trackId, dragSnap.keyId, dragSnap.keyBefore);
      }
      dragSnap = null;
      dragging = false;
      onSelectionChange?.();
    }
  });

  transform.addEventListener('objectChange', () => {
    if (!selectedMotionId) return;
    const m = motion.get(selectedMotionId);
    if (!m) return;
    // Motion translate is XZ only — lock Y to pre-drag (or current) height
    if (mode === 'translate') {
      const lockY = dragSnap?.before?.position?.y;
      if (Number.isFinite(lockY)) m.object.position.y = lockY;
    }
    syncLiveKeyPreview(m);
  });

  function setMode(next) {
    mode = next;
    transform.setMode(next);
    // Hide Y arrow in translate; keep Y for rotate/scale
    transform.showY = next !== 'translate';
  }

  function setLocal(on) {
    localSpace = !!on;
    transform.setSpace(localSpace ? 'local' : 'world');
  }

  function clearSelection() {
    selectedMotionId = null;
    transform.detach();
    pickMotionId = null;
    pickPointCallback = null;
    clearPickBanner();
    onSelectionChange?.();
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
      onSelectionChange?.();
      return;
    }
    transform.attach(m.object);
    engine.selectedTrackId = m.trackId;
    if (opt.selectKey !== false && !engine.selectedKeyframeId) {
      // Prefer key at playhead, else first key
      const track = engine.getTrack(m.trackId);
      const keys = track?.keys.list() || [];
      const at = keys.find((k) => Math.abs(k.timeSec - engine.playheadSec) < 1e-3)
        || keys[0]
        || null;
      if (at) engine.selectKeyframe(m.trackId, at.id);
      else {
        engine.selectedKeyframeId = null;
        engine.emit('selection');
      }
    } else {
      engine.emit('selection');
    }
    onSelectionChange?.();
  }

  function beginStagePick(motionId) {
    pickPointCallback = null;
    pickMotionId = motionId;
    selectMotion(motionId, { selectKey: false });
    showPickBanner('무대에서 위치 지정 — 바닥을 클릭하세요 (Esc 취소)');
    setPickCursor(true);
  }

  /**
   * Group ensemble path pick — returns xz on deck (no motion move).
   * @param {(pt: { x: number, z: number }) => void} onPicked
   * @param {string} [banner]
   */
  function beginPointPick(onPicked, banner) {
    pickMotionId = null;
    pickPointCallback = onPicked;
    showPickBanner(banner || '그룹 위치 지정 — 바닥을 클릭하세요 (Esc 취소)');
    setPickCursor(true);
  }

  function cancelStagePick() {
    pickMotionId = null;
    pickPointCallback = null;
    clearPickBanner();
    setPickCursor(false);
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
   */
  function commitTransform(m, before, trackId, keyId, keyBeforeSnap) {
    const after = snapshotObject(m.object);
    let ensuredKeyId = keyId;
    let keyBefore = keyBeforeSnap;
    let keyAfter = null;
    let createdKey = null;

    if (trackId) {
      const track = engine.getTrack(trackId);
      if (track) {
        if (!ensuredKeyId) {
          const existing = track.keys.list().find((k) => Math.abs(k.timeSec - engine.playheadSec) < 1e-3);
          if (existing) {
            ensuredKeyId = existing.id;
            keyBefore = cloneKeyframeValue(existing.value);
          } else {
            const bag = motionKeyFromObject(m.object);
            createdKey = track.keys.add({ timeSec: engine.playheadSec, value: bag });
            ensuredKeyId = createdKey.id;
            keyBefore = null;
            keyAfter = cloneKeyframeValue(bag);
            engine.selectKeyframe(trackId, ensuredKeyId);
          }
        }
        if (ensuredKeyId && !createdKey) {
          const kf = track.keys.get(ensuredKeyId);
          if (kf) {
            if (keyBefore == null) keyBefore = cloneKeyframeValue(kf.value);
            const bag = asMotionKeyValue(kf.value);
            bag.position = [after.position.x, after.position.y, after.position.z];
            bag.rotation = [after.rotation.x, after.rotation.y, after.rotation.z];
            bag.scale = [after.scale.x, after.scale.y, after.scale.z];
            keyAfter = bag;
            track.keys.update(ensuredKeyId, { value: bag });
            engine.selectKeyframe(trackId, ensuredKeyId);
          }
        }
      }
    }

    engine.commands.push({
      label: 'Transform motion',
      undo: () => {
        applySnapshot(m.object, before);
        const track = trackId ? engine.getTrack(trackId) : null;
        if (createdKey && track) {
          track.keys.remove(createdKey.id);
          if (engine.selectedKeyframeId === createdKey.id) engine.clearSelection();
        } else if (track && ensuredKeyId && keyBefore != null) {
          track.keys.update(ensuredKeyId, { value: cloneKeyframeValue(keyBefore) });
        }
        engine.emit('keys');
        motion.apply(engine.playheadSec);
      },
      redo: () => {
        applySnapshot(m.object, after);
        const track = trackId ? engine.getTrack(trackId) : null;
        if (createdKey && track) {
          track.keys.add({
            id: createdKey.id,
            timeSec: createdKey.timeSec,
            value: cloneKeyframeValue(keyAfter ?? createdKey.value),
            interpolation: createdKey.interpolation,
          });
          engine.selectKeyframe(trackId, createdKey.id);
        } else if (track && ensuredKeyId && keyAfter != null) {
          track.keys.update(ensuredKeyId, { value: cloneKeyframeValue(keyAfter) });
        }
        engine.emit('keys');
        motion.apply(engine.playheadSec);
      },
    });
    engine.emit('keys');
  }

  function syncLiveKeyPreview(m) {
    if (engine.selectedTrackId !== m.trackId || !engine.selectedKeyframeId) return;
    const track = engine.getTrack(m.trackId);
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
    else clearSelection();
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
