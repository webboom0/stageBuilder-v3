import * as THREE from 'three';
import { applyCameraPreset } from '../stage/CameraPresets.js';

/**
 * @param {boolean} [withAudio]
 * @returns {string}
 */
export function pickWebMMimeType(withAudio = false) {
  const types = withAudio
    ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ]
    : [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} base
 * @param {string} [suffix]
 */
export function safeFilename(base, suffix = '.webm') {
  const clean = String(base || 'render')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${clean}${suffix}`;
}

/** @param {THREE.PerspectiveCamera} camera @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls */
function snapshotCamera(camera, controls) {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    target: controls.target.clone(),
  };
}

/** @param {ReturnType<typeof snapshotCamera>} snap @param {THREE.PerspectiveCamera} camera @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls */
function restoreCamera(snap, camera, controls) {
  camera.position.copy(snap.position);
  camera.quaternion.copy(snap.quaternion);
  camera.up.copy(snap.up);
  camera.fov = snap.fov;
  camera.near = snap.near;
  camera.far = snap.far;
  camera.updateProjectionMatrix();
  controls.target.copy(snap.target);
  controls.update();
}

/**
 * @param {{
 *   timeline: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   applyFrame: (timeSec: number) => void,
 *   renderView: () => void,
 *   pushCaptureFrame: () => void,
 *   durationSec: number,
 *   isCancelled?: () => boolean,
 *   onProgress?: (pct: number, timeSec: number) => void,
 * }} opts
 */
function awaitTimelinePlayback(opts) {
  const {
    timeline,
    applyFrame,
    renderView,
    pushCaptureFrame,
    durationSec,
    isCancelled,
    onProgress,
  } = opts;

  return new Promise((resolve) => {
    /** @type {(() => void) | null} */
    let unsub = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    let cancelPoll = null;
    let settled = false;
    let cancelled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      unsub?.();
      if (cancelPoll) clearInterval(cancelPoll);
      resolve({ cancelled });
    };

    const markCancelled = () => {
      if (cancelled) return;
      cancelled = true;
      timeline.pause();
    };

    const checkCancel = () => {
      if (isCancelled?.()) {
        markCancelled();
        finish();
      }
    };

    unsub = timeline.subscribe((ev) => {
      checkCancel();
      if (settled) return;
      if (ev.type === 'playhead') {
        applyFrame(timeline.playheadSec);
        renderView();
        pushCaptureFrame();
        const pct = Math.min(100, (timeline.playheadSec / durationSec) * 100);
        onProgress?.(pct, timeline.playheadSec);
      }
      if (ev.type === 'play' && !timeline.playing) {
        finish();
      }
    });
    cancelPoll = setInterval(checkCancel, 50);
    timeline.setPlayhead(0);
    applyFrame(0);
    renderView();
    pushCaptureFrame();
    checkCancel();
    if (!settled) timeline.play();
  });
}

/**
 * Play timeline while recording the WebGL canvas to WebM.
 *
 * @param {{
 *   timeline: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   applyFrame: (timeSec: number) => void,
 *   renderView: () => void,
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').PerspectiveCamera,
 *   controls: import('three/addons/controls/OrbitControls.js').OrbitControls,
 *   stageManager: import('../stage/StageManager.js').StageManager,
 *   cameraPresetId?: string,
 *   filename?: string,
 *   onProgress?: (pct: number, timeSec: number) => void,
 *   onStatus?: (msg: string) => void,
 *   isCancelled?: () => boolean,
 *   beginAudioCapture?: () => Promise<MediaStream | null> | MediaStream | null,
 *   endAudioCapture?: () => void,
 *   prepareMultiView?: () => void,
 *   restoreMultiView?: () => void,
 * }} opts
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function renderTimelineToWebM(opts) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('이 브라우저는 MediaRecorder를 지원하지 않습니다.');
  }

  const {
    timeline,
    applyFrame,
    renderView,
    renderer,
    camera,
    controls,
    stageManager,
    cameraPresetId = 'active',
    filename = safeFilename('scene-render'),
    onProgress,
    onStatus,
    isCancelled,
    beginAudioCapture,
    endAudioCapture,
    prepareMultiView,
    restoreMultiView,
  } = opts;

  const wasPlaying = timeline.playing;
  const savedPlayhead = timeline.playheadSec;
  const camSnap = snapshotCamera(camera, controls);
  let audioCaptureStarted = false;
  let editorRestored = false;

  const restoreEditorState = () => {
    if (editorRestored) return;
    editorRestored = true;
    timeline.pause();
    timeline.setPlayhead(savedPlayhead);
    applyFrame(savedPlayhead);
    restoreCamera(camSnap, camera, controls);
    restoreMultiView?.();
    renderView();
  };

  try {
  timeline.pause();
  timeline.setPlayhead(0);

  if (cameraPresetId && cameraPresetId !== 'active') {
    applyCameraPreset(
      /** @type {import('../stage/CameraPresets.js').CameraPresetId} */ (cameraPresetId),
      camera,
      controls,
      stageManager.stageType,
      stageManager.profile,
      stageManager,
    );
  }

  prepareMultiView?.();

  applyFrame(0);
  renderView();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (isCancelled?.()) {
    restoreEditorState();
    throw new Error('렌더가 취소되었습니다.');
  }

  const fps = Math.max(1, timeline.fps || 30);
  const durationSec = Math.max(0.05, timeline.durationSec);
  const canvas = renderer.domElement;
  if (canvas.width < 2 || canvas.height < 2) {
    restoreEditorState();
    throw new Error('렌더 캔버스 크기가 0입니다. 미리보기 창을 닫았다 다시 시도하세요.');
  }
  const stream = canvas.captureStream(fps);
  const videoTrack = stream.getVideoTracks()[0] ?? null;

  const audioStream = beginAudioCapture ? await beginAudioCapture() : null;
  if (audioStream?.getAudioTracks().length) {
    for (const track of audioStream.getAudioTracks()) {
      stream.addTrack(track);
    }
    audioCaptureStarted = true;
  }

  const hasAudio = stream.getAudioTracks().length > 0;
  const mimeType = pickWebMMimeType(hasAudio);

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    ...(hasAudio ? { audioBitsPerSecond: 192_000 } : {}),
  });

  /** @type {BlobPart[]} */
  const chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data?.size) chunks.push(ev.data);
  };

  let recorderError = null;
  const blobPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      if (recorderError) reject(recorderError);
      else resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => {
      recorderError = recorder.error || new Error('MediaRecorder failed');
    };
  });

  onStatus?.(hasAudio ? '렌더 녹화 중… (영상+오디오)' : '렌더 녹화 중…');
  onProgress?.(0, 0);

  const pushCaptureFrame = () => {
    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
      videoTrack.requestFrame();
    }
  };

  pushCaptureFrame();
  recorder.start(1000);

  let cancelled = false;
  const markCancelled = () => {
    if (cancelled) return;
    cancelled = true;
    timeline.pause();
  };
  if (isCancelled?.()) markCancelled();

  const playback = await awaitTimelinePlayback({
    timeline,
    applyFrame,
    renderView,
    pushCaptureFrame,
    durationSec,
    isCancelled,
    onProgress,
  });
  if (playback.cancelled) cancelled = true;

  if (recorder.state !== 'inactive') {
    if (typeof recorder.requestData === 'function') recorder.requestData();
    await new Promise((r) => setTimeout(r, cancelled ? 80 : 200));
    pushCaptureFrame();
    if (recorder.state !== 'inactive') recorder.stop();
  }

  timeline.pause();
  restoreEditorState();

  if (cancelled || isCancelled?.()) {
    throw new Error('렌더가 취소되었습니다.');
  }

  if (wasPlaying) timeline.play();
  else renderView();

  const blob = await Promise.race([
    blobPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('렌더 녹화 종료 시간이 초과되었습니다.')), 15000);
    }),
  ]);
  if (!blob.size) {
    throw new Error('렌더 결과가 비어 있습니다. 타임라인 길이와 뷰포트를 확인하세요.');
  }

  return { blob, filename };
  } catch (err) {
    restoreEditorState();
    throw err;
  } finally {
    if (audioCaptureStarted) {
      endAudioCapture?.();
    }
  }
}

/**
 * All project scenes → one continuous WebM (single MediaRecorder session).
 *
 * @param {{
 *   scenes: Array<{ id: string, name?: string }>,
 *   switchToScene: (sceneId: string) => Promise<void>,
 *   onSceneStart?: (scene: { id: string, name?: string }, index: number, total: number) => void,
 *   refreshAudioCapture?: () => void,
 *   timeline: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   applyFrame: (timeSec: number) => void,
 *   renderView: () => void,
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').PerspectiveCamera,
 *   controls: import('three/addons/controls/OrbitControls.js').OrbitControls,
 *   stageManager: import('../stage/StageManager.js').StageManager,
 *   filename?: string,
 *   onProgress?: (pct: number, detail?: string) => void,
 *   onStatus?: (msg: string) => void,
 *   isCancelled?: () => boolean,
 *   beginAudioCapture?: () => Promise<MediaStream | null> | MediaStream | null,
 *   endAudioCapture?: () => void,
 *   prepareMultiView?: () => void,
 *   restoreMultiView?: () => void,
 * }} opts
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function renderProjectToWebM(opts) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('이 브라우저는 MediaRecorder를 지원하지 않습니다.');
  }

  const {
    scenes,
    switchToScene,
    onSceneStart,
    refreshAudioCapture,
    timeline,
    applyFrame,
    renderView,
    renderer,
    camera,
    controls,
    filename = safeFilename('project-render'),
    onProgress,
    onStatus,
    isCancelled,
    beginAudioCapture,
    endAudioCapture,
    prepareMultiView,
    restoreMultiView,
  } = opts;

  if (!scenes.length) {
    throw new Error('렌더할 씬이 없습니다.');
  }

  const wasPlaying = timeline.playing;
  const savedPlayhead = timeline.playheadSec;
  const camSnap = snapshotCamera(camera, controls);
  let audioCaptureStarted = false;
  let cancelled = false;
  let editorRestored = false;

  const restoreEditorState = () => {
    if (editorRestored) return;
    editorRestored = true;
    timeline.pause();
    timeline.setPlayhead(savedPlayhead);
    applyFrame(savedPlayhead);
    restoreCamera(camSnap, camera, controls);
    restoreMultiView?.();
    renderView();
  };

  try {
    timeline.pause();
    prepareMultiView?.();

    const fps = Math.max(1, timeline.fps || 30);
    const canvas = renderer.domElement;
    if (canvas.width < 2 || canvas.height < 2) {
      restoreEditorState();
      throw new Error('렌더 캔버스 크기가 0입니다.');
    }

    await switchToScene(scenes[0].id);
    refreshAudioCapture?.();
    applyFrame(0);
    renderView();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    if (isCancelled?.()) {
      restoreEditorState();
      throw new Error('렌더가 취소되었습니다.');
    }

    const stream = canvas.captureStream(fps);
    const videoTrack = stream.getVideoTracks()[0] ?? null;

    const audioStream = beginAudioCapture ? await beginAudioCapture() : null;
    if (audioStream?.getAudioTracks().length) {
      for (const track of audioStream.getAudioTracks()) {
        stream.addTrack(track);
      }
      audioCaptureStarted = true;
    }

    const hasAudio = stream.getAudioTracks().length > 0;
    const mimeType = pickWebMMimeType(hasAudio);

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
      ...(hasAudio ? { audioBitsPerSecond: 192_000 } : {}),
    });

    /** @type {BlobPart[]} */
    const chunks = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) chunks.push(ev.data);
    };

    let recorderError = null;
    const blobPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        if (recorderError) reject(recorderError);
        else resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => {
        recorderError = recorder.error || new Error('MediaRecorder failed');
      };
    });

    const pushCaptureFrame = () => {
      if (videoTrack && typeof videoTrack.requestFrame === 'function') {
        videoTrack.requestFrame();
      }
    };

    onStatus?.(hasAudio ? '전체 씬 녹화 중… (영상+오디오)' : '전체 씬 녹화 중…');
    onProgress?.(0, '시작…');
    pushCaptureFrame();
    recorder.start(1000);

    for (let i = 0; i < scenes.length; i++) {
      if (isCancelled?.()) {
        cancelled = true;
        timeline.pause();
        break;
      }

      const sceneMeta = scenes[i];
      if (i > 0) {
        await switchToScene(sceneMeta.id);
        refreshAudioCapture?.();
      }

      onSceneStart?.(sceneMeta, i, scenes.length);

      timeline.pause();
      const durationSec = Math.max(0.05, timeline.durationSec);

      const playback = await awaitTimelinePlayback({
        timeline,
        applyFrame,
        renderView,
        pushCaptureFrame,
        durationSec,
        isCancelled,
        onProgress: (pct, t) => {
          const total = ((i + pct / 100) / scenes.length) * 100;
          onProgress?.(total, `${sceneMeta.name || sceneMeta.id} · ${Math.round(pct)}% · ${t.toFixed(1)}s`);
        },
      });

      if (playback.cancelled || isCancelled?.()) {
        cancelled = true;
        break;
      }
    }

    if (recorder.state !== 'inactive') {
      if (typeof recorder.requestData === 'function') recorder.requestData();
      await new Promise((r) => setTimeout(r, cancelled ? 80 : 200));
      pushCaptureFrame();
      if (recorder.state !== 'inactive') recorder.stop();
    }

    timeline.pause();
    restoreEditorState();

    if (cancelled || isCancelled?.()) {
      throw new Error('렌더가 취소되었습니다.');
    }

    if (wasPlaying) timeline.play();
    else renderView();

    const blob = await Promise.race([
      blobPromise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('렌더 녹화 종료 시간이 초과되었습니다.')), 30000);
      }),
    ]);
    if (!blob.size) {
      throw new Error('렌더 결과가 비어 있습니다.');
    }

    return { blob, filename };
  } catch (err) {
    restoreEditorState();
    throw err;
  } finally {
    if (audioCaptureStarted) {
      endAudioCapture?.();
    }
  }
}
