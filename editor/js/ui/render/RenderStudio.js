import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyCameraPreset } from '../../domain/stage/CameraPresets.js';
import { beginMultiViewOccluder, endMultiViewOccluder } from '../../domain/viewport/multiViewOccluder.js';
import {
  downloadBlob,
  renderTimelineToWebM,
  renderProjectToWebM,
  safeFilename,
} from '../../domain/render/SceneRenderer.js';

const EXPORT_W = 1280;
const EXPORT_H = 720;

/** @param {THREE.PerspectiveCamera} from @param {THREE.PerspectiveCamera} to */
function copyCamera(from, to) {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.up.copy(from.up);
  to.fov = from.fov;
  to.near = from.near;
  to.far = from.far;
  to.updateProjectionMatrix();
}

/** @param {string} presetId */
function occluderModeForPreset(presetId) {
  if (presetId === 'top') return 'top';
  if (presetId === 'left' || presetId === 'right') return 'side';
  return null;
}

/**
 * Full-screen render studio — preview, camera setup, blocked recording.
 *
 * @param {{
 *   mode: 'scene' | 'all',
 *   sceneName?: string,
 *   sceneCount?: number,
 *   durationSec?: number,
 *   fps?: number,
 *   scene: THREE.Scene,
 *   helpers: import('../../domain/stage/StageViewportHelpers.js').StageViewportHelpers,
 *   stageManager: import('../../domain/stage/StageManager.js').StageManager,
 *   timeline: import('../../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   applyTimelineFrame: (timeSec: number) => void,
 *   videoBg: () => import('../../domain/video/VideoBackground.js').VideoBackground | null,
 *   mainCamera: THREE.PerspectiveCamera,
 *   mainControls: import('three/addons/controls/OrbitControls.js').OrbitControls,
 *   audio?: import('../../domain/audio/AudioDirector.js').AudioDirector,
 *   getShowName: () => string,
 *   getSceneName: () => string,
 *   getScenes: () => Array<{ id: string, name?: string }>,
 *   getActiveSceneId: () => string,
 *   switchScene: (id: string) => Promise<void>,
 *   prepareMultiView?: () => void,
 *   restoreMultiView?: () => void,
 * }} opts
 */
export async function runRenderStudio(opts) {
  document.querySelector('.sb-render-studio-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'sb-project-setup-overlay sb-render-studio-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const mode = opts.mode || 'scene';
  const title = mode === 'all' ? '전체 씬 렌더' : '현재 씬 렌더';
  const dur = Number.isFinite(opts.durationSec) ? opts.durationSec : 0;
  const fps = Number.isFinite(opts.fps) ? opts.fps : 30;
  const durLine = dur > 0 ? `${dur.toFixed(0)}초 · ${fps} fps` : '';

  overlay.innerHTML = `
    <div class="sb-render-studio">
      <header class="sb-render-studio__header">
        <div class="sb-render-studio__header-text">
          <h2 class="sb-render-studio__title">${escapeHtml(title)}</h2>
          <p class="sb-render-studio__subtitle">
            ${mode === 'all'
    ? `총 ${opts.sceneCount ?? 0}개 씬 · WebM 1개${durLine ? ` · ${durLine}/씬` : ''}`
    : `「${escapeHtml(opts.sceneName || '현재 씬')}」${durLine ? ` · ${durLine}` : ''}`}
          </p>
        </div>
        <button type="button" class="sb-render-studio__close" data-action="close" aria-label="닫기">닫기</button>
      </header>
      <div class="sb-render-studio__preview-wrap">
        <canvas class="sb-render-studio__canvas" aria-label="렌더 미리보기"></canvas>
        <p class="sb-render-studio__preview-hint sb-render-studio-setup-only">카메라를 선택하고 미리보기를 확인한 뒤 렌더를 시작하세요. 「현재 시점」은 미리보기에서 드래그한 각도 그대로 녹화됩니다.</p>
      </div>
      <div class="sb-render-studio__panel sb-render-studio-setup-only">
        <label class="sb-project-label" for="sb-render-studio-camera">카메라</label>
        <select class="sb-project-input" id="sb-render-studio-camera">
          <option value="active">현재 시점 (자유)</option>
          <option value="audience">객석</option>
          <option value="front">정면</option>
          <option value="left">좌측</option>
          <option value="right">우측</option>
          <option value="top">상단</option>
          <option value="perspective">원근</option>
        </select>
        <p class="sb-render-note">상단·좌/우는 구조물을 자동 처리합니다. 타임라인 오디오 클립은 영상에 함께 녹음됩니다.</p>
        <div class="sb-render-studio__actions">
          <button type="button" class="sb-project-btn sb-project-btn--submit" data-action="start">렌더 시작</button>
        </div>
      </div>
      <div class="sb-render-studio__panel sb-render-studio-recording-only" hidden>
        <p class="sb-render-progress-status" aria-live="polite">준비 중…</p>
        <div class="sb-render-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="sb-render-progress-fill"></div>
        </div>
        <p class="sb-render-note">렌더가 끝날 때까지 에디터 작업은 잠시 중단됩니다.</p>
        <div class="sb-render-studio__actions">
          <button type="button" class="sb-project-btn sb-project-btn--cancel" data-action="cancel-record">취소</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = /** @type {HTMLCanvasElement} */ (overlay.querySelector('.sb-render-studio__canvas'));
  const cameraSelect = /** @type {HTMLSelectElement} */ (overlay.querySelector('#sb-render-studio-camera'));
  const statusEl = /** @type {HTMLElement} */ (overlay.querySelector('.sb-render-progress-status'));
  const fillEl = /** @type {HTMLElement} */ (overlay.querySelector('.sb-render-progress-fill'));
  const setupEls = overlay.querySelectorAll('.sb-render-studio-setup-only');
  const recordingPanel = /** @type {HTMLElement} */ (overlay.querySelector('.sb-render-studio-recording-only'));

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(EXPORT_W, EXPORT_H, false);
  renderer.setClearColor(0x111111);

  const camera = new THREE.PerspectiveCamera(50, EXPORT_W / EXPORT_H, 0.05, 20000);
  const lookTarget = new THREE.Vector3();
  const dummyControls = { target: lookTarget, update() {} };
  /** @type {OrbitControls | null} */
  let orbitControls = null;

  copyCamera(opts.mainCamera, camera);
  lookTarget.copy(opts.mainControls.target);

  /** @type {'top' | 'side' | null} */
  let occluderMode = null;
  let previewRaf = 0;
  let recording = false;
  let cancelled = false;

  const syncOrbitControls = () => {
    if (orbitControls) {
      orbitControls.dispose();
      orbitControls = null;
    }
    if (cameraSelect.value === 'active') {
      orbitControls = new OrbitControls(camera, canvas);
      orbitControls.target.copy(lookTarget);
      orbitControls.enableDamping = true;
      orbitControls.update();
    }
  };

  const applySelectedCamera = () => {
    const presetId = cameraSelect.value || 'active';
    occluderMode = occluderModeForPreset(presetId);
    if (presetId === 'active') {
      copyCamera(opts.mainCamera, camera);
      lookTarget.copy(opts.mainControls.target);
    } else {
      applyCameraPreset(
        /** @type {import('../../domain/stage/CameraPresets.js').CameraPresetId} */ (presetId),
        camera,
        dummyControls,
        opts.stageManager.stageType,
        opts.stageManager.profile,
        opts.stageManager,
      );
      lookTarget.copy(dummyControls.target);
    }
    syncOrbitControls();
  };

  /** 미리보기에서 조정한 자유 시점·타깃을 렌더용으로 고정 */
  const capturePreviewCameraState = () => {
    if (orbitControls) {
      lookTarget.copy(orbitControls.target);
    }
  };

  const renderPreviewFrame = () => {
    opts.applyTimelineFrame(opts.timeline.playheadSec);
    opts.helpers.update(camera, lookTarget, EXPORT_H);
    opts.videoBg()?.update();
    if (occluderMode) {
      beginMultiViewOccluder(occluderMode, opts.stageManager, opts.scene, camera);
    }
    try {
      camera.aspect = EXPORT_W / EXPORT_H;
      camera.updateProjectionMatrix();
      renderer.setScissorTest(false);
      renderer.render(opts.scene, camera);
    } finally {
      if (occluderMode) endMultiViewOccluder();
    }
  };

  const previewLoop = () => {
    if (!overlay.isConnected || recording) return;
    orbitControls?.update();
    renderPreviewFrame();
    previewRaf = requestAnimationFrame(previewLoop);
  };

  const setRecordingUi = (on) => {
    recording = on;
    for (const el of setupEls) {
      el.hidden = on;
    }
    recordingPanel.hidden = !on;
    cameraSelect.disabled = on;
    if (orbitControls) orbitControls.enabled = !on;
  };

  const renderExportFrame = () => {
    orbitControls?.update();
    opts.helpers.update(camera, lookTarget, EXPORT_H);
    opts.videoBg()?.update();
    if (occluderMode) {
      beginMultiViewOccluder(occluderMode, opts.stageManager, opts.scene, camera);
    }
    try {
      camera.aspect = EXPORT_W / EXPORT_H;
      camera.updateProjectionMatrix();
      renderer.setScissorTest(false);
      renderer.render(opts.scene, camera);
    } finally {
      if (occluderMode) endMultiViewOccluder();
    }
  };

  return new Promise((resolve) => {
    const finish = () => {
      cancelAnimationFrame(previewRaf);
      orbitControls?.dispose();
      renderer.dispose();
      overlay.remove();
      resolve();
    };

    const requestClose = () => {
      if (recording) {
        if (cancelled) return;
        cancelled = true;
        statusEl.textContent = '취소 중…';
        const cancelBtn = overlay.querySelector('[data-action="cancel-record"]');
        if (cancelBtn instanceof HTMLButtonElement) {
          cancelBtn.disabled = true;
          cancelBtn.textContent = '취소 중…';
        }
        const closeBtn = overlay.querySelector('[data-action="close"]');
        if (closeBtn instanceof HTMLButtonElement) {
          closeBtn.disabled = true;
          closeBtn.textContent = '취소 중…';
        }
        opts.timeline.pause();
        return;
      }
      finish();
    };

    cameraSelect.addEventListener('change', () => {
      applySelectedCamera();
      renderPreviewFrame();
    });

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', requestClose);

    overlay.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
      if (recording) return;

      const presetId = cameraSelect.value || 'active';
      if (presetId === 'active') {
        capturePreviewCameraState();
        occluderMode = null;
      } else {
        applySelectedCamera();
      }

      setRecordingUi(true);
      cancelled = false;
      cancelAnimationFrame(previewRaf);

      opts.prepareMultiView?.();

      const savedPlayhead = opts.timeline.playheadSec;
      const showName = opts.getShowName();
      const audioHooks = opts.audio
        ? {
          beginAudioCapture: () => opts.audio.beginExportCapture(),
          endAudioCapture: () => opts.audio.endExportCapture(),
          refreshAudioCapture: () => opts.audio.refreshExportCaptureWiring(),
        }
        : {};
      const setProgress = (pct, detail = '') => {
        const p = Math.max(0, Math.min(100, pct));
        fillEl.style.width = `${p}%`;
        overlay.querySelector('.sb-render-progress-bar')?.setAttribute('aria-valuenow', String(Math.round(p)));
        if (detail) statusEl.textContent = detail;
      };

      try {
        if (mode === 'scene') {
          const sceneName = opts.getSceneName();
          const { blob, filename } = await renderTimelineToWebM({
            timeline: opts.timeline,
            applyFrame: opts.applyTimelineFrame,
            renderView: renderExportFrame,
            renderer,
            camera,
            controls: orbitControls ?? dummyControls,
            stageManager: opts.stageManager,
            cameraPresetId: 'active',
            filename: safeFilename(`${showName}_${sceneName}`),
            isCancelled: () => cancelled,
            onProgress: (pct, t) => setProgress(pct, `녹화 ${Math.round(pct)}% · ${t.toFixed(1)}s`),
            onStatus: (msg) => { statusEl.textContent = msg; },
            ...audioHooks,
          });
          if (!cancelled) downloadBlob(blob, filename);
        } else {
          const scenes = opts.getScenes();
          const originalSceneId = opts.getActiveSceneId();
          try {
          const { blob, filename } = await renderProjectToWebM({
            scenes,
            switchToScene: (id) => opts.switchScene(id),
            onSceneStart: (sceneMeta, i, total) => {
              statusEl.textContent = `씬 ${i + 1}/${total}: ${sceneMeta.name || sceneMeta.id}`;
              if (cameraSelect.value !== 'active') {
                applySelectedCamera();
              }
            },
            timeline: opts.timeline,
            applyFrame: opts.applyTimelineFrame,
            renderView: renderExportFrame,
            renderer,
            camera,
            controls: orbitControls ?? dummyControls,
            stageManager: opts.stageManager,
            filename: safeFilename(`${showName}_all_scenes`),
            isCancelled: () => cancelled,
            onProgress: (pct, detail) => setProgress(pct, detail || ''),
            onStatus: (msg) => { statusEl.textContent = msg; },
            ...audioHooks,
          });
          if (!cancelled) downloadBlob(blob, filename);
          if (!cancelled) setProgress(100, '완료');
          } finally {
            if (originalSceneId && opts.getActiveSceneId() !== originalSceneId) {
              await opts.switchScene(originalSceneId);
            }
            opts.timeline.setPlayhead(savedPlayhead);
            opts.applyTimelineFrame(savedPlayhead);
          }
        }
      } catch (err) {
        if (!String(err?.message || err).includes('취소')) {
          console.error(err);
          window.alert(`렌더에 실패했습니다.\n\n${err.message}`);
        }
      } finally {
        opts.restoreMultiView?.();
        finish();
      }
    });

    overlay.querySelector('[data-action="cancel-record"]')?.addEventListener('click', requestClose);

    overlay.addEventListener('click', (e) => e.stopPropagation());
    applySelectedCamera();
    opts.applyTimelineFrame(opts.timeline.playheadSec);
    previewLoop();
  });
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
