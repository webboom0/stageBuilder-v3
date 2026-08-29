import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyCameraPreset, zoomCamera } from '../stage/CameraPresets.js';
import { beginMultiViewOccluder, endMultiViewOccluder } from './multiViewOccluder.js';

/**
 * @typedef {'front' | 'audience' | 'left' | 'right' | 'top'} PresetChoice
 * @typedef {'top' | 'side' | null} OccluderMode
 */

/** @type {ReadonlyArray<{
 *   slotId: string,
 *   label: string,
 *   interactive?: boolean,
 *   occluderMode?: OccluderMode,
 *   choices?: ReadonlyArray<{ id: PresetChoice, label: string }>,
 *   defaultId?: PresetChoice,
 * }>} */
const SLOTS = Object.freeze([
  {
    slotId: 'frontAudience',
    label: '정면/관객',
    choices: Object.freeze([
      { id: 'front', label: '정면' },
      { id: 'audience', label: '관객' },
    ]),
    defaultId: 'audience',
  },
  {
    slotId: 'side',
    label: '좌/우',
    occluderMode: 'side',
    choices: Object.freeze([
      { id: 'left', label: '좌' },
      { id: 'right', label: '우' },
    ]),
    defaultId: 'left',
  },
  {
    slotId: 'top',
    label: '상단',
    defaultId: 'top',
    occluderMode: 'top',
  },
  {
    slotId: 'free',
    label: '자유',
    interactive: true,
  },
]);

const ZOOM_IN = 0.82;
const ZOOM_OUT = 1.22;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;

/**
 * Full-screen modal — 2×2 monitor with selectable presets + free orbit.
 */
export class MultiViewPopup {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   helpers: import('../stage/StageViewportHelpers.js').StageViewportHelpers,
   *   stageManager: import('../stage/StageManager.js').StageManager,
   *   mainCamera: THREE.PerspectiveCamera,
   *   mainControls: import('three/addons/controls/OrbitControls.js').OrbitControls,
   *   timeline: import('../timeline/TimelineEngine.js').TimelineEngine,
   *   videoBg: () => import('../video/VideoBackground.js').VideoBackground | null,
   *   applyTimelineFrame?: () => void,
   *   onClosed?: () => void,
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.helpers = opts.helpers;
    this.stageManager = opts.stageManager;
    this.mainCamera = opts.mainCamera;
    this.mainControls = opts.mainControls;
    this.timeline = opts.timeline;
    this.videoBg = opts.videoBg;
    this.applyTimelineFrame = opts.applyTimelineFrame ?? (() => {});
    this.onClosed = opts.onClosed;

    this._open = false;
    /** @type {HTMLElement | null} */
    this._overlay = null;
    /** @type {HTMLElement | null} */
    this._loadingEl = null;
    /** @type {ResizeObserver | null} */
    this._ro = null;
    /** @type {number} */
    this._raf = 0;
    /** @type {(() => void) | null} */
    this._unsubTimeline = null;

    this._dummyTarget = new THREE.Vector3();
    this._dummyControls = { target: this._dummyTarget, update() {} };

    this.freeCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);
    /** @type {import('three/addons/controls/OrbitControls.js').OrbitControls | null} */
    this.freeControls = null;
    /** @type {((e: WheelEvent) => void) | null} */
    this._onKeyDown = null;
    /** @type {Array<(e: WheelEvent) => void>} */
    this._wheelHandlers = [];

    /**
     * @type {Array<{
     *   slotId: string,
     *   presetId: PresetChoice | 'top',
     *   cellEl: HTMLElement,
     *   canvas: HTMLCanvasElement,
     *   renderer: THREE.WebGLRenderer | null,
     *   camera: THREE.PerspectiveCamera,
     *   interactive: boolean,
     *   occluderMode: OccluderMode,
     *   zoomFactor: number,
     *   basePosition: THREE.Vector3,
     *   lookTarget: THREE.Vector3,
     *   labelEl?: HTMLElement,
     *   presetSelect?: HTMLSelectElement,
     *   _onWheel?: (e: WheelEvent) => void,
     * }>}
     */
    this._views = [];

    /** @type {Record<string, PresetChoice | 'top'>} */
    this._slotPresets = {
      frontAudience: 'audience',
      side: 'left',
      top: 'top',
    };
  }

  isOpen() {
    return this._open;
  }

  open() {
    if (this._open) return;
    this._open = true;
    this._slotPresets = { frontAudience: 'audience', side: 'left', top: 'top' };
    this._copyCamera(this.mainCamera, this.freeCamera);
    this._buildDomShell();
    this._showLoading(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this._open) return;
        try {
          this._initViewRenderers();
          this.syncPresetCameras();
          this._resizeViews();
          for (const v of this._views) {
            if (v.renderer) this._renderView(v);
          }
        } finally {
          this._showLoading(false);
          this._startLoop();
        }
      });
    });

    this._unsubTimeline = this.timeline.subscribe((ev) => {
      if (ev.type === 'playhead' || ev.type === 'play') {
        this.applyTimelineFrame();
        this._syncTransport();
      }
    });
    this._syncTransport();
  }

  close() {
    if (!this._open) return;
    endMultiViewOccluder();
    this._open = false;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._unsubTimeline?.();
    this._unsubTimeline = null;
    this._ro?.disconnect();
    this._ro = null;

    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown, true);
      this._onKeyDown = null;
    }
    for (const v of this._views) {
      if (v._onWheel) {
        v.canvas.removeEventListener('wheel', v._onWheel);
        v.cellEl.removeEventListener('wheel', v._onWheel);
      }
    }
    this._wheelHandlers = [];

    const freeTarget = this.freeControls?.target?.clone?.() ?? this.mainControls.target.clone();
    this._copyCamera(this.freeCamera, this.mainCamera);
    if (this.freeCamera.up.y >= 0.5) {
      this.mainCamera.up.set(0, 1, 0);
    }
    this.mainControls.target.copy(freeTarget);
    this.mainControls.update();

    if (this.freeControls) {
      this.freeControls.dispose();
      this.freeControls = null;
    }

    for (const v of this._views) {
      v.renderer?.dispose();
    }
    this._views = [];

    this._overlay?.remove();
    this._overlay = null;
    this._loadingEl = null;

    this.onClosed?.();
  }

  syncPresetCameras() {
    for (const v of this._views) {
      if (v.interactive) continue;
      applyCameraPreset(
        v.presetId,
        v.camera,
        this._dummyControls,
        this.stageManager.stageType,
        this.stageManager.profile,
        this.stageManager,
      );
      this._captureViewBasis(v);
      this._applyViewZoom(v);
      if (v.presetSelect) v.presetSelect.value = v.presetId;
    }
  }

  /** @param {THREE.PerspectiveCamera} from @param {THREE.PerspectiveCamera} to */
  _copyCamera(from, to) {
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    to.up.copy(from.up);
    to.fov = from.fov;
    to.near = from.near;
    to.far = from.far;
    to.aspect = from.aspect;
    to.updateProjectionMatrix();
  }

  /** @param {typeof this._views[0]} view */
  _captureViewBasis(view) {
    view.basePosition.copy(view.camera.position);
    view.lookTarget.copy(this._dummyTarget);
    view.zoomFactor = 1;
  }

  /** @param {typeof this._views[0]} view */
  _applyViewZoom(view) {
    if (view.interactive) return;
    const offset = view.basePosition.clone().sub(view.lookTarget);
    view.camera.position.copy(view.lookTarget).addScaledVector(offset, view.zoomFactor);
    view.camera.lookAt(view.lookTarget);
    if (view.presetId === 'top') {
      view.camera.up.set(0, 0, -1);
    } else {
      view.camera.up.set(0, 1, 0);
    }
    view.camera.updateMatrixWorld(true);
  }

  /** @param {typeof this._views[0]} view @param {number} mult */
  _zoomView(view, mult) {
    view.zoomFactor = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoomFactor * mult));
    if (view.interactive && this.freeControls) {
      zoomCamera(view.camera, this.freeControls, mult < 1 ? 14 : -14);
      return;
    }
    this._applyViewZoom(view);
  }

  /**
   * @param {typeof this._views[0]} view
   * @param {PresetChoice | 'top'} presetId
   */
  _setSlotPreset(view, presetId) {
    view.presetId = presetId;
    this._slotPresets[view.slotId] = presetId;
    applyCameraPreset(
      presetId,
      view.camera,
      this._dummyControls,
      this.stageManager.stageType,
      this.stageManager.profile,
      this.stageManager,
    );
    this._captureViewBasis(view);
    this._applyViewZoom(view);
  }

  _buildDomShell() {
    document.querySelector('.sb-multiview-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sb-project-setup-overlay sb-multiview-overlay';
    overlay.innerHTML = `
      <div class="sb-multiview-panel" role="dialog" aria-label="멀티뷰 모니터">
        <header class="sb-multiview-header">
          <h2 class="sb-multiview-title">멀티뷰 모니터</h2>
          <button type="button" class="sb-multiview-close" title="닫기 (Esc)" aria-label="닫기">✕</button>
        </header>
        <div class="sb-multiview-body">
          <div class="sb-multiview-loading" aria-live="polite">
            <div class="sb-multiview-loading__spinner" aria-hidden="true"></div>
            <p class="sb-multiview-loading__msg">멀티뷰 준비 중…</p>
          </div>
          <div class="sb-multiview-grid"></div>
        </div>
        <footer class="sb-multiview-transport">
          <button type="button" class="sb-multiview-btn sb-multiview-play" title="재생/일시정지 (Space)">▶</button>
          <button type="button" class="sb-multiview-btn" data-act="rewind" title="처음으로">⏮</button>
          <span class="sb-multiview-time" aria-live="polite">0.00 / 0s</span>
          <span class="sb-multiview-hint">Space 재생 · 휠/± 확대 · 상단/좌우 구조물 자동 · 하단 툴 투명 토글</span>
        </footer>
      </div>
    `;

    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._loadingEl = overlay.querySelector('.sb-multiview-loading');

    overlay.querySelector('.sb-multiview-close')?.addEventListener('click', () => this.close());

    overlay.querySelector('.sb-multiview-play')?.addEventListener('click', () => {
      this._togglePlayback();
    });

    overlay.querySelector('[data-act="rewind"]')?.addEventListener('click', () => {
      this.timeline.pause();
      this.timeline.setPlayhead(0);
      this.applyTimelineFrame();
      this._syncTransport();
    });

    this._onKeyDown = this._onKeyDownHandler.bind(this);
    window.addEventListener('keydown', this._onKeyDown, true);

    const grid = /** @type {HTMLElement} */ (overlay.querySelector('.sb-multiview-grid'));

    for (const slot of SLOTS) {
      const cellEl = document.createElement('div');
      cellEl.className = 'sb-multiview-cell';
      if (slot.interactive) cellEl.classList.add('is-free');
      if (slot.occluderMode === 'top') cellEl.classList.add('is-top');
      if (slot.occluderMode === 'side') cellEl.classList.add('is-side');

      const head = document.createElement('div');
      head.className = 'sb-multiview-cell-head';

      const label = document.createElement('span');
      label.className = 'sb-multiview-label';
      label.textContent = slot.label;
      head.appendChild(label);

      /** @type {HTMLSelectElement | undefined} */
      let presetSelect;
      if (slot.choices?.length) {
        presetSelect = document.createElement('select');
        presetSelect.className = 'sb-multiview-preset-select';
        presetSelect.title = `${slot.label} 시점 선택`;
        presetSelect.setAttribute('aria-label', `${slot.label} 시점`);
        for (const ch of slot.choices) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.label;
          presetSelect.appendChild(opt);
        }
        presetSelect.value = slot.defaultId || slot.choices[0].id;
        head.appendChild(presetSelect);
      }

      const zoomBar = document.createElement('div');
      zoomBar.className = 'sb-multiview-zoom';
      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'sb-multiview-zoom-btn';
      zoomOutBtn.title = '축소';
      zoomOutBtn.textContent = '−';
      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'sb-multiview-zoom-btn';
      zoomInBtn.title = '확대';
      zoomInBtn.textContent = '+';
      zoomBar.append(zoomOutBtn, zoomInBtn);
      head.appendChild(zoomBar);
      cellEl.appendChild(head);

      const canvas = document.createElement('canvas');
      canvas.className = 'sb-multiview-canvas';
      cellEl.appendChild(canvas);

      const camera = slot.interactive
        ? this.freeCamera
        : new THREE.PerspectiveCamera(50, 1, 0.05, 20000);

      const presetId = slot.interactive
        ? 'top'
        : /** @type {PresetChoice | 'top'} */ (presetSelect?.value || slot.defaultId || 'audience');

      const view = {
        slotId: slot.slotId,
        presetId,
        cellEl,
        canvas,
        renderer: null,
        camera,
        interactive: !!slot.interactive,
        occluderMode: slot.occluderMode ?? null,
        zoomFactor: 1,
        basePosition: new THREE.Vector3(),
        lookTarget: new THREE.Vector3(),
        labelEl: label,
        presetSelect,
      };

      presetSelect?.addEventListener('change', () => {
        const id = /** @type {PresetChoice} */ (presetSelect.value);
        this._setSlotPreset(view, id);
      });

      zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._zoomView(view, ZOOM_IN);
      });
      zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._zoomView(view, ZOOM_OUT);
      });

      this._bindViewWheel(view);

      grid.appendChild(cellEl);
      this._views.push(view);
    }

    this._ro = new ResizeObserver(() => this._resizeViews());
    this._ro.observe(grid);
  }

  _initViewRenderers() {
    for (const v of this._views) {
      const renderer = new THREE.WebGLRenderer({ canvas: v.canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x111111);
      v.renderer = renderer;

      if (v.interactive) {
        this.freeControls = new OrbitControls(this.freeCamera, v.canvas);
        this.freeControls.enableDamping = true;
        this.freeControls.enableZoom = true;
        this.freeControls.target.copy(this.mainControls.target);
        this.freeControls.update();
      }
    }
  }

  /** @param {typeof this._views[0]} view */
  _bindViewWheel(view) {
    if (view.interactive) return;
    /** @param {WheelEvent} e */
    const onWheel = (e) => {
      if (!this._open) return;
      e.preventDefault();
      e.stopPropagation();
      const mult = e.deltaY > 0 ? ZOOM_OUT : ZOOM_IN;
      this._zoomView(view, mult);
    };
    view._onWheel = onWheel;
    view.canvas.addEventListener('wheel', onWheel, { passive: false });
    view.cellEl.addEventListener('wheel', onWheel, { passive: false });
    this._wheelHandlers.push(onWheel);
  }

  /** @param {boolean} on */
  _showLoading(on) {
    this._loadingEl?.classList.toggle('is-active', on);
    this._overlay?.classList.toggle('is-loading', on);
  }

  _togglePlayback() {
    this.timeline.togglePlay();
    this.applyTimelineFrame();
    this._syncTransport();
  }

  /** @param {KeyboardEvent} e */
  _onKeyDownHandler(e) {
    if (!this._open) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
      return;
    }
    if (e.code === 'Space' && !this._isTypingTarget(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._togglePlayback();
    }
  }

  /** @param {EventTarget | null} t */
  _isTypingTarget(t) {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  _syncTransport() {
    if (!this._overlay) return;
    const playBtn = this._overlay.querySelector('.sb-multiview-play');
    const timeEl = this._overlay.querySelector('.sb-multiview-time');
    if (playBtn) playBtn.textContent = this.timeline.playing ? '⏸' : '▶';
    if (timeEl) {
      timeEl.textContent = `${this.timeline.playheadSec.toFixed(2)} / ${this.timeline.durationSec.toFixed(0)}s`;
    }
  }

  _resizeViews() {
    for (const v of this._views) {
      if (!v.renderer) continue;
      const canvas = v.canvas;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) continue;
      v.renderer.setSize(w, h, false);
      v.camera.aspect = w / h;
      v.camera.updateProjectionMatrix();
    }
  }

  /** @param {typeof this._views[0]} view */
  _beginViewOcclusion(view) {
    if (view.occluderMode) {
      beginMultiViewOccluder(view.occluderMode, this.stageManager, this.scene, view.camera);
    }
  }

  /** @param {typeof this._views[0]} view */
  _endViewOcclusion(view) {
    if (view.occluderMode) {
      endMultiViewOccluder();
    }
  }

  /** @param {typeof this._views[0]} view */
  _renderView(view) {
    if (!view.renderer) return;
    this._beginViewOcclusion(view);
    try {
      view.renderer.render(this.scene, view.camera);
      if (this.helpers.shouldRenderOverlay()) {
        view.renderer.autoClear = false;
        view.renderer.render(this.helpers.getOverlayScene(), view.camera);
        view.renderer.autoClear = true;
      }
    } finally {
      this._endViewOcclusion(view);
    }
  }

  _startLoop() {
    const tick = () => {
      if (!this._open) return;
      if (this.timeline.playing) {
        this.applyTimelineFrame();
      }
      this.freeControls?.update();
      this.videoBg()?.update();
      for (const v of this._views) {
        this._renderView(v);
      }
      this._syncTransport();
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
