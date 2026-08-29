import * as THREE from 'three';
import { ViewportStageGrid } from './ViewportStageGrid.js';
import {
  GRID_MODE_FIXED,
  GRID_MODE_ADAPTIVE,
  GRID_MODE_GRID_HELPER,
  normalizeGridMode,
  computeStageGridSizes,
  getStageDeckCenter,
  getStageDeckWorldY,
} from './stageGridAdaptive.js';
import {
  computeStageGridHelperLayout,
  createStageGridHelper,
  disposeStageGridHelper,
} from './stageGridHelper.js';

const STORAGE_KEY_MODE = 'sb-v4-viewport-gridMode-v2';
const STORAGE_KEY_HELPERS = 'sb-v4-viewport-helpers-v2';

const SHADER_GRID_OPACITY = 0.72;
/** GridHelper — root(deckY) 기준 바닥면 살짝 위 */
const GRID_HELPER_LIFT = 0.12;

const _box = new THREE.Box3();

/**
 * v3-style floor grid overlay (별도 렌더 패스):
 * - 자동·1m: depthTest OFF 오버레이 (v3와 동일)
 * - GridHelper: Three.js 기본 격자 (객체에 가려짐)
 */
export class StageViewportHelpers {
  /**
   * @param {THREE.Scene} _scene — reserved (overlay는 별도 Scene)
   * @param {{ stageManager: import('./StageManager.js').StageManager }} ctx
   */
  constructor(scene, ctx) {
    this.stageManager = ctx.stageManager;
    this.mainScene = scene;
    this.gridMode = loadGridMode();
    this.states = loadHelperStates();
    this.viewportGridScale = null;

    this.root = new THREE.Group();
    this.root.name = 'ViewportFloorHelpers';

    this.overlayScene = new THREE.Scene();
    this.overlayScene.add(this.root);

    this.skeletonGroup = new THREE.Group();
    this.skeletonGroup.name = 'SkeletonHelpers';
    this.mainScene.add(this.skeletonGroup);
    /** @type {Map<string, THREE.SkeletonHelper>} */
    this._skeletonHelpers = new Map();
    this._skeletonSyncFrame = 0;

    // GridHelper 톤에 가깝게 (major 밝게, minor 약하게)
    this.stageGrid = new ViewportStageGrid({
      minorColor: 0x444444,
      majorColor: 0x666666,
      opacity: SHADER_GRID_OPACITY,
      minorStrength: 0.2,
    });
    this.stageGrid.applyOverlaySettings();
    this.root.add(this.stageGrid);

    this.gridHelperGroup = new THREE.Group();
    this.gridHelperGroup.name = 'StageGridHelperGroup';
    this.root.add(this.gridHelperGroup);
    /** @type {THREE.GridHelper | null} */
    this.gridHelper = null;
    this._gridHelperKey = '';

    this.guides = createGuideGroup();
    this.root.add(this.guides);

    this._applyVisibility();
    if (this.states.skeletonHelpers) this._syncSkeletonHelpers();
  }

  getGridMode() {
    return this.gridMode;
  }

  /** @param {string} mode */
  setGridMode(mode) {
    this.gridMode = normalizeGridMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY_MODE, this.gridMode);
    } catch {
      /* ignore */
    }
    this._applyVisibility();
  }

  getHelperStates() {
    return { ...this.states };
  }

  /** @param {Partial<typeof this.states>} next */
  setHelperStates(next) {
    Object.assign(this.states, next);
    this._persistHelpers();
    this._applyVisibility();
  }

  toggleGrid() {
    this.setHelperStates({ gridHelper: !this.states.gridHelper });
  }

  toggleGuide() {
    this.setHelperStates({ guideHelper: !this.states.guideHelper });
  }

  toggleSkeleton() {
    const on = !this.states.skeletonHelpers;
    this.setHelperStates({ skeletonHelpers: on });
    if (on) this._syncSkeletonHelpers();
    else this._clearSkeletonHelpers();
  }

  getOverlayScene() {
    return this.overlayScene;
  }

  shouldRenderOverlay() {
    return !!(this.states.gridHelper || this.states.guideHelper);
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} lookTarget
   * @param {number} viewportHeight
   */
  update(camera, lookTarget, viewportHeight) {
    if (this.states.skeletonHelpers) {
      this._skeletonSyncFrame += 1;
      if (this._skeletonSyncFrame % 30 === 0) this._syncSkeletonHelpers();
    }

    if (!this.states.gridHelper && !this.states.guideHelper) {
      this.viewportGridScale = null;
      return;
    }

    const deckY = getStageDeckWorldY(this.stageManager);
    const center = getStageDeckCenter(this.stageManager);
    this.root.position.set(0, deckY, 0);
    this.guides.position.set(center.x, 0, center.z);

    if (this.states.gridHelper) {
      const sizes = computeStageGridSizes({
        stageManager: this.stageManager,
        camera,
        lookTarget,
        viewportHeight,
        mode: this.gridMode,
      });
      if (this.gridMode === GRID_MODE_GRID_HELPER) {
        this._updateGridHelper(deckY);
        this.viewportGridScale = sizes;
      } else {
        this.stageGrid.setCellSizes(sizes.minorWorld, sizes.majorWorld);
        this.stageGrid.setMinorStrength(this.gridMode === GRID_MODE_ADAPTIVE ? 0.14 : 0.22);
        this._updateFloorBounds();
        this.viewportGridScale = sizes;
      }
    } else {
      this.viewportGridScale = null;
    }
  }

  _updateGridHelper(_deckY) {
    const layout = computeStageGridHelperLayout(this.stageManager);
    const key = `${layout.size.toFixed(2)}:${layout.divisions}`;
    if (key !== this._gridHelperKey) {
      this._disposeGridHelper();
      this.gridHelper = createStageGridHelper(layout.size, layout.divisions);
      this.gridHelperGroup.add(this.gridHelper);
      this._gridHelperKey = key;
    }
    // root가 이미 deckY — local Y만 올림 (deckY 이중 적용 시 관객석 높이에 격자가 뜸)
    this.gridHelperGroup.position.set(layout.centerX, GRID_HELPER_LIFT, layout.centerZ);
  }

  _disposeGridHelper() {
    if (this.gridHelper) {
      this.gridHelperGroup.remove(this.gridHelper);
      disposeStageGridHelper(this.gridHelper);
      this.gridHelper = null;
    }
    this._gridHelperKey = '';
  }

  _updateFloorBounds() {
    const floor = this.stageManager?.floor;
    if (!floor) {
      this.stageGrid.setFloorBounds(0, 0, 0, 0);
      return;
    }
    floor.updateWorldMatrix(true, true);
    _box.setFromObject(floor);
    if (_box.isEmpty()) {
      this.stageGrid.setFloorBounds(0, 0, 0, 0);
      return;
    }
    const pad = 0.5;
    this.stageGrid.setFloorBounds(
      _box.min.x - pad,
      _box.max.x + pad,
      _box.min.z - pad,
      _box.max.z + pad,
    );
  }

  _applyVisibility() {
    const gridOn = !!this.states.gridHelper;
    if (this.gridMode === GRID_MODE_GRID_HELPER) {
      this.stageGrid.visible = false;
      this.gridHelperGroup.visible = gridOn;
    } else {
      this.stageGrid.visible = gridOn;
      this.gridHelperGroup.visible = false;
    }
    this.guides.visible = !!this.states.guideHelper;
    this.skeletonGroup.visible = !!this.states.skeletonHelpers;
  }

  _syncSkeletonHelpers() {
    /** @type {Set<string>} */
    const seen = new Set();
    this.mainScene.traverse((obj) => {
      if (!obj.isSkinnedMesh || !obj.skeleton) return;
      seen.add(obj.uuid);
      if (this._skeletonHelpers.has(obj.uuid)) return;
      const helper = new THREE.SkeletonHelper(obj);
      this.skeletonGroup.add(helper);
      this._skeletonHelpers.set(obj.uuid, helper);
    });
    for (const [uuid, helper] of this._skeletonHelpers) {
      if (seen.has(uuid)) continue;
      this.skeletonGroup.remove(helper);
      helper.dispose?.();
      this._skeletonHelpers.delete(uuid);
    }
  }

  _clearSkeletonHelpers() {
    for (const helper of this._skeletonHelpers.values()) {
      this.skeletonGroup.remove(helper);
      helper.dispose?.();
    }
    this._skeletonHelpers.clear();
  }

  _persistHelpers() {
    try {
      localStorage.setItem(STORAGE_KEY_HELPERS, JSON.stringify(this.states));
    } catch {
      /* ignore */
    }
  }
}

function createGuideGroup() {
  const guides = new THREE.Group();
  guides.name = 'StageGuides';

  const applyMat = (mat) => {
    // 가이드도 각도 소실 방지
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.transparent = true;
  };

  const xGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-500, 0, 0),
    new THREE.Vector3(500, 0, 0),
  ]);
  const xMat = new THREE.LineBasicMaterial({ color: 0xff4444, opacity: 0.85 });
  applyMat(xMat);
  const xLine = new THREE.Line(xGeom, xMat);
  xLine.renderOrder = 1002;
  guides.add(xLine);

  const zGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -500),
    new THREE.Vector3(0, 0, 500),
  ]);
  const zMat = new THREE.LineBasicMaterial({ color: 0x4488ff, opacity: 0.85 });
  applyMat(zMat);
  const zLine = new THREE.Line(zGeom, zMat);
  zLine.renderOrder = 1002;
  guides.add(zLine);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.9, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.renderOrder = 1003;
  guides.add(ring);

  return guides;
}

function loadGridMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MODE);
    if (
      v === GRID_MODE_ADAPTIVE ||
      v === GRID_MODE_FIXED ||
      v === GRID_MODE_GRID_HELPER
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return GRID_MODE_ADAPTIVE;
}

function loadHelperStates() {
  const defaults = {
    gridHelper: true,
    guideHelper: false,
    skeletonHelpers: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HELPERS);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}
