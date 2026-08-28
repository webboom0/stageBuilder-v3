import * as THREE from 'three';
import {
  beamRefRad,
  buildFixtureMatrix,
  aimPanTilt,
  deckAimTarget,
  layoutFixtureMatrixLocal,
} from './fixtureRig.js';
import {
  mkFixtureAttr,
  FIXTURE_RIG_TYPES,
  PROSCENIUM_RIG_REF,
  RIG_FIT,
  RIG_MATRIX,
  STAGE_FRONT_SPOT_NAMES,
  rigLocalZExtent,
  rigRowLocalZ,
} from './fixtureTypes.js';
import {
  getStageDeckCenter,
  getStageDeckWorldY,
  getStageWorldPerMeter,
} from '../stage/stageGridAdaptive.js';

const BEAM_REF = beamRefRad();
const _wp = new THREE.Vector3();

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Stage acting zone: width = floor, depth anchored at FOH aim (not house).
 * @param {import('../stage/StageManager.js').StageManager} sm
 */
function resolveActingZone(sm) {
  const factors = sm.getEffectiveProfile?.() || {
    widthFactor: 1,
    depthFactor: 1,
  };
  const wf = Number(factors.widthFactor) || 1;
  const df = Number(factors.depthFactor) || 1;
  const ref = PROSCENIUM_RIG_REF;
  const floor = sm.floor;

  let floorMinX = -ref.spanX * 0.5;
  let floorMaxX = ref.spanX * 0.5;
  let floorMinZ = -ref.spanZ;
  let floorMaxZ = ref.spanZ;
  let floorMidX = ref.centerX;
  let floorW = ref.spanX;
  if (floor) {
    floor.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(floor);
    if (!box.isEmpty()) {
      floorMinX = box.min.x;
      floorMaxX = box.max.x;
      floorMinZ = box.min.z;
      floorMaxZ = box.max.z;
      floorMidX = (floorMinX + floorMaxX) / 2;
      floorW = Math.max(floorMaxX - floorMinX, 1);
    }
  }
  const floorD = Math.max(floorMaxZ - floorMinZ, 1);

  /** @type {THREE.Vector3[]} */
  const targets = [];
  /** @type {number[]} */
  const fohXs = [];
  const root = sm.stageGroup;
  if (root) {
    root.updateWorldMatrix(true, true);
    for (const name of STAGE_FRONT_SPOT_NAMES) {
      const spot = root.getObjectByName(name);
      if (spot) {
        spot.getWorldPosition(_wp);
        fohXs.push(_wp.x);
      }
      const tgt = root.getObjectByName(name.replace('Spot', 'SpotTarget'));
      if (tgt) {
        tgt.getWorldPosition(_wp);
        targets.push(_wp.clone());
      }
    }
  }

  // v3 _fitProscenium — lateral center/span from FOH row, not full _Floor plate
  let centerX = ref.centerX;
  let spanX = ref.spanX;
  if (fohXs.length >= 2) {
    centerX = (Math.min(...fohXs) + Math.max(...fohXs)) / 2;
    spanX = Math.max(...fohXs) - Math.min(...fohXs);
  } else {
    centerX = floorMidX;
    spanX = floorW * (RIG_FIT.widthRatio ?? 0.55);
  }
  // Slightly wider than FOH spread so edge battens cover stage wings
  spanX = Math.max(spanX * 1.1, ref.spanX * (RIG_FIT.widthRatio ?? 0.55));

  // Depth: around FOH aim, mostly toward upstage (−Z), stay out of house (+Z)
  let aimZ = ref.centerZ + (ref.centerZOffset || 0);
  if (targets.length) {
    aimZ = targets.reduce((s, p) => s + p.z, 0) / targets.length;
  }
  const depth = Math.max(
    floorD * (RIG_FIT.depthRatio ?? 0.48),
    ref.spanZ * df * 0.85,
  );
  // 70% of zone upstage of aim, 30% slightly downstage (still on deck)
  let downstageZ = aimZ + depth * 0.28;
  let upstageZ = aimZ - depth * 0.72;
  // Keep clear of audience half of the floor plate
  const houseCut = floorMinZ + floorD * 0.62; // don't cross into house-side 38%
  downstageZ = Math.min(downstageZ, houseCut);
  upstageZ = Math.max(upstageZ, floorMinZ + floorD * 0.06);
  if (downstageZ - upstageZ < depth * 0.5) {
    upstageZ = downstageZ - depth * 0.5;
  }
  const spanZ = Math.max(downstageZ - upstageZ, RIG_FIT.minOverheadWorld * 2);
  const centerZ = (downstageZ + upstageZ) / 2;

  return {
    centerX,
    centerZ,
    spanX,
    spanZ,
    downstageZ,
    upstageZ,
    source: targets.length ? 'floor+foh' : 'floor+ref',
    wf,
    df,
  };
}

/**
 * FixtureEngine — 18-unit overhead SpotLight rig fitted to StageProfile.
 * Timeline values arrive via `setTimelineBag` → merge home→attr→tl → render.
 */
export class FixtureEngine {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   stageManager: import('../stage/StageManager.js').StageManager,
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.stageManager = opts.stageManager;
    /** @type {any[]} */
    this.fixtures = [];
    /** @type {Record<number, any>} */
    this.fmap = {};
    /** @type {import('three').Object3D[]} */
    this.battens = [];
    this.root = null;
    this.built = false;
    this.lightScale = 1;
    this.fixtureBus = 1;
    this.blackout = false;
    this.isPlaying = false;
    /** @type {{ overheadLocal: number, deckLocalY: number } | null} */
    this._fitMeta = null;
  }

  ensureRig() {
    if (this.built && this.root?.parent) {
      this.fitToStage();
      return this.fixtures;
    }

    this.disposeRig();

    this.root = new THREE.Group();
    this.root.name = '_FixtureRig';
    this.root.userData.isFixtureRig = true;
    this.root.userData.notSelectable = true;
    this.root.userData.excludeFromTimeline = true;

    const built = buildFixtureMatrix(this.root);
    this.fixtures = built.fixtures;
    this.battens = built.battens;
    this.fmap = {};
    this.fixtures.forEach((f) => {
      this.fmap[f.fid] = f;
    });

    this.scene.add(this.root);
    this.built = true;
    this.fitToStage();
    this.update();
    return this.fixtures;
  }

  disposeRig() {
    if (this.root?.parent) this.root.parent.remove(this.root);
    this.root?.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this.root = null;
    this.fixtures = [];
    this.battens = [];
    this.fmap = {};
    this.built = false;
  }

  /**
   * Fit battens: wide across stage, deep enough for 3 rows, low enough to hit deck.
   * Uses non-uniform X/Z scale so depth fit no longer crushes fixture spacing.
   */
  fitToStage() {
    if (!this.root || !this.stageManager) return;

    layoutFixtureMatrixLocal(this.fixtures, this.battens);

    const sm = this.stageManager;
    const floor = sm.floor;
    const deckTopY = floor ? getStageDeckWorldY(sm) - 0.02 : 0;
    const wpm = getStageWorldPerMeter(sm) || 1;
    const isArena = (sm.stageType || 'proscenium') === 'arena';

    let zone;
    if (isArena) {
      const center = getStageDeckCenter(sm, new THREE.Vector3());
      let spanX = 16 * wpm;
      let spanZ = 13.5 * wpm;
      if (floor) {
        floor.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(floor);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          spanX = size.x * (RIG_FIT.widthRatio ?? 0.55);
          spanZ = size.z * 0.75;
          center.x = (box.min.x + box.max.x) / 2;
          center.z = (box.min.z + box.max.z) / 2;
        }
      }
      zone = {
        centerX: center.x,
        centerZ: center.z,
        spanX,
        spanZ,
        source: 'arena-floor',
      };
    } else {
      zone = resolveActingZone(sm);
    }

    const usableW = Math.max(zone.spanX, RIG_FIT.minOverheadWorld * 2);
    const usableD = Math.max(zone.spanZ, RIG_FIT.minOverheadWorld * 2);

    const localZSpan = Math.max(rigLocalZExtent(RIG_MATRIX), 1);
    const scaleX = THREE.MathUtils.clamp(
      usableW / RIG_MATRIX.spanX,
      RIG_FIT.minScale,
      RIG_FIT.maxScale,
    );
    const scaleZ = THREE.MathUtils.clamp(
      usableD / localZSpan,
      RIG_FIT.minScale,
      RIG_FIT.maxScale,
    );
    const scaleY = (scaleX + scaleZ) * 0.5;

    const heightM = Number(sm.profile?.heightM) || 9.5;
    const roomH = Math.max(heightM * wpm, RIG_FIT.minOverheadWorld * 2);
    const preferred = roomH * RIG_FIT.battenHeightRatio;
    const minH = Math.max(roomH * RIG_FIT.minBattenHeightRatio, RIG_FIT.minOverheadWorld);
    const maxH = roomH * RIG_FIT.ceilingRatio;
    const overheadWorld = THREE.MathUtils.clamp(preferred, minH, maxH);
    const worldBattenY = deckTopY + overheadWorld;
    const rootY = worldBattenY - RIG_MATRIX.battenY * scaleY;

    const localZMid = (rigRowLocalZ(0) + rigRowLocalZ(RIG_MATRIX.rows - 1)) / 2;
    const rootX = zone.centerX;
    const rootZ = zone.centerZ - localZMid * scaleZ;

    this._fitMeta = {
      overheadLocal: overheadWorld / scaleY,
      deckLocalY: -RIG_MATRIX.battenY,
      usableW,
      usableD,
      zone,
      scaleX,
      scaleY,
      scaleZ,
    };
    this._applyRigTransform(
      new THREE.Vector3(rootX, rootY, rootZ),
      new THREE.Vector3(scaleX, scaleY, scaleZ),
    );
    this.reaimHomes();
  }

  reaimHomes() {
    const spanZ = RIG_MATRIX.spanZ;
    const deckY = this._fitMeta?.deckLocalY ?? -RIG_MATRIX.battenY;
    this.fixtures.forEach((f) => {
      const x = f.obj.grp.position.x;
      const z = f.obj.grp.position.z;
      const y = f.obj.grp.position.y;
      const pos = [x, y, z];
      const target = deckAimTarget(x, z, deckY, spanZ, f.grp);
      const aim = aimPanTilt(pos, target);
      f.home.pan = aim.pan;
      f.home.tilt = aim.tilt;
      const typeZoom = FIXTURE_RIG_TYPES[f.rig]?.zoom;
      if (typeZoom != null) f.home.zoom = typeZoom;
      if (!f.tl) {
        f.attr.pan = aim.pan;
        f.attr.tilt = aim.tilt;
        if (typeZoom != null) f.attr.zoom = typeZoom;
      }
    });
    this.update();
  }

  /**
   * @param {THREE.Vector3} position
   * @param {number | THREE.Vector3} scale
   */
  _applyRigTransform(position, scale) {
    this.root.position.copy(position);
    if (typeof scale === 'number') {
      this.root.scale.setScalar(scale);
      // v3 calibrated intensity against uniform layout scale (~2–3)
      this.lightScale = THREE.MathUtils.clamp(scale * 0.72, 0.85, 2.6);
    } else {
      this.root.scale.copy(scale);
      // Anisotropic fit can inflate mean scale; keep Spot gain near v3 feel
      const mean = (scale.x + scale.y + scale.z) / 3;
      this.lightScale = THREE.MathUtils.clamp(mean * 0.72, 0.85, 2.6);
    }
  }

  getFixture(fid) {
    return this.fmap[fid] || null;
  }

  getFixtures() {
    return this.fixtures;
  }

  /**
   * @param {number} fid
   * @param {Partial<ReturnType<typeof mkFixtureAttr>> | null} attrs
   */
  setTimelineBag(fid, attrs) {
    const f = this.fmap[fid];
    if (!f) return;
    f.tl = attrs ? Object.assign({}, attrs) : null;
  }

  clearAllTimelineBags() {
    this.fixtures.forEach((f) => {
      f.tl = null;
    });
  }

  /** @param {number} fid */
  captureAttr(fid) {
    const f = this.fmap[fid];
    if (!f) return mkFixtureAttr();
    return Object.assign({}, f.home, f.attr);
  }

  /** Live programmer snapshot for +key (home + attr + prog, no timeline). */
  getFixtureCaptureState(fid) {
    const f = this.fmap[fid];
    if (!f) return null;
    const out = Object.assign({}, f.home, f.attr);
    const p = f.prog || {};
    for (const k of Object.keys(p)) {
      if (k === 'dim' && p.dim != null) out.dim = p.dim;
      else if (p[k] != null) out[k] = p[k];
    }
    return out;
  }

  /** Merge prog into attr after key record (v3 commitFixtureEditToAttr). */
  commitFixtureEditToAttr(fid) {
    const f = this.fmap[fid];
    const cap = this.getFixtureCaptureState(fid);
    if (!f || !cap) return;
    for (const k of ['dim', 'pan', 'tilt', 'zoom', 'focus', 'r', 'g', 'b']) {
      if (cap[k] != null) f.attr[k] = cap[k];
    }
    f.prog = {};
    this.update();
  }

  setFixtureBus(v) {
    this.fixtureBus = Math.max(0, Math.min(1, Number(v) || 0));
    this.update();
  }

  /** Undo/redo snapshot — fixture programmer + bus (v3 parity). */
  captureHistoryState() {
    return {
      built: this.built,
      fixtureBus: this.fixtureBus,
      blackout: this.blackout,
      selection: [...this.getSelectionIds()],
      fixtures: this.fixtures.map((f) => ({
        fid: f.fid,
        enabled: f.enabled,
        prog: JSON.parse(JSON.stringify(f.prog || {})),
        attr: JSON.parse(JSON.stringify(f.attr || {})),
      })),
    };
  }

  /** @param {ReturnType<FixtureEngine['captureHistoryState']>} state */
  applyHistoryState(state) {
    if (!state) return;

    if (state.built === false && this.built) {
      this.disposeRig();
    }

    this.fixtureBus = state.fixtureBus ?? 1;
    this.blackout = !!state.blackout;

    this.fixtures.forEach((f) => {
      f.sel = false;
    });

    state.fixtures?.forEach((row) => {
      const f = this.fmap[row.fid];
      if (!f) return;
      f.enabled = row.enabled !== false;
      f.prog = { ...(row.prog || {}) };
      f.attr = Object.assign(mkFixtureAttr(), row.attr || {});
    });

    const sel = (state.selection || [])
      .map(Number)
      .filter((id) => this.fmap[id]);
    this.setSelection(sel);
    this.update();
  }

  setBlackout(on) {
    this.blackout = !!on;
    this.update();
  }

  setFixtureEnabled(fid, enabled) {
    const f = this.fmap[fid];
    if (!f) return;
    f.enabled = enabled !== false;
    this.update();
  }

  setSelection(ids) {
    const set = new Set((ids || []).map(Number).filter((n) => this.fmap[n]));
    this.fixtures.forEach((f) => {
      f.sel = set.has(f.fid);
    });
    this.update();
  }

  getSelectionIds() {
    return this.fixtures.filter((f) => f.sel).map((f) => f.fid);
  }

  toggleSelection(fid) {
    const f = this.fmap[fid];
    if (!f) return;
    f.sel = !f.sel;
    this.update();
  }

  clearProgrammer() {
    this.fixtures.forEach((f) => {
      f.prog = {};
    });
    this.update();
  }

  setProgAttr(fid, attr, val) {
    const f = this.fmap[fid];
    if (!f || val == null) return;
    if (!f.prog) f.prog = {};
    if (attr === 'dim') f.prog.dim = Math.max(0, Math.min(100, val));
    else if (attr === 'pan') f.prog.pan = Math.max(-270, Math.min(270, val));
    else if (attr === 'tilt') f.prog.tilt = Math.max(-120, Math.min(120, val));
    else if (attr === 'zoom') f.prog.zoom = Math.max(5, Math.min(50, val));
    else if (attr === 'focus') f.prog.focus = Math.max(0, Math.min(100, val));
    else if (attr === 'r' || attr === 'g' || attr === 'b') f.prog[attr] = clamp01(val);
    else f.prog[attr] = val;

    if (f.sel) {
      if (attr === 'dim' && f.prog.dim != null) f.attr.dim = f.prog.dim;
      else if (attr === 'pan' && f.prog.pan != null) f.attr.pan = f.prog.pan;
      else if (attr === 'tilt' && f.prog.tilt != null) f.attr.tilt = f.prog.tilt;
      else if (attr === 'zoom' && f.prog.zoom != null) f.attr.zoom = f.prog.zoom;
      else if (attr === 'focus' && f.prog.focus != null) f.attr.focus = f.prog.focus;
      else if (attr === 'r' || attr === 'g' || attr === 'b') f.attr[attr] = f.prog[attr];
      else if (f.prog[attr] != null) f.attr[attr] = f.prog[attr];
    }
    this.update();
  }

  applyProgToSelection(attr, val) {
    this.getSelectionIds().forEach((id) => this.setProgAttr(id, attr, val));
  }

  setSelectionDim(dim) {
    const d = Math.max(0, Math.min(100, Number(dim) || 0));
    const ids = this.getSelectionIds();
    if (!ids.length) return false;
    ids.forEach((id) => {
      const f = this.fmap[id];
      if (!f) return;
      f.attr.dim = d;
      if (!f.prog) f.prog = {};
      f.prog.dim = d;
      f.enabled = true;
    });
    this.update();
    return true;
  }

  setSelectionColor(r, g, b) {
    const ids = this.getSelectionIds();
    if (!ids.length) return false;
    ids.forEach((id) => {
      this.setProgAttr(id, 'r', r);
      this.setProgAttr(id, 'g', g);
      this.setProgAttr(id, 'b', b);
    });
    return true;
  }

  /** Apply UI bag patch to live programmer (attr + prog). */
  applyLiveBag(fid, engAttr) {
    const f = this.fmap[fid];
    if (!f || !engAttr) return;
    for (const k of ['dim', 'pan', 'tilt', 'zoom', 'focus', 'r', 'g', 'b']) {
      if (engAttr[k] == null) continue;
      f.attr[k] = engAttr[k];
      if (!f.prog) f.prog = {};
      f.prog[k] = engAttr[k];
    }
    f.enabled = true;
    this.update();
  }

  update() {
    if (!this.built || !this.fixtures.length) return;
    this.renderFixtures();
  }

  renderFixtures() {
    const playing = !!this.isPlaying;
    this.fixtures.forEach((f) => {
      const out = Object.assign({}, f.home, f.attr);

      const hasPanelEdit = f.prog && Object.keys(f.prog).length > 0;
      const useTimelineLayer = f.tl && (playing || !hasPanelEdit);
      if (useTimelineLayer) {
        out.dim = f.tl.dim ?? out.dim;
        out.pan = f.tl.pan ?? out.pan;
        out.tilt = f.tl.tilt ?? out.tilt;
        out.zoom = f.tl.zoom ?? out.zoom;
        out.focus = f.tl.focus ?? out.focus;
        out.r = f.tl.r ?? out.r;
        out.g = f.tl.g ?? out.g;
        out.b = f.tl.b ?? out.b;
      }

      const p = f.prog || {};
      for (const k of Object.keys(p)) {
        if (k === 'dim' && p.dim != null) out.dim = p.dim;
        else if (p[k] != null) out[k] = p[k];
      }

      if (f.enabled === false) out.dim = 0;
      if (this.blackout) out.dim = 0;
      else out.dim = (Number(out.dim) || 0) * this.fixtureBus;

      const I = clamp01(out.dim / 100);
      const col = new THREE.Color(out.r, out.g, out.b);

      const { spot, beam, aim } = f.obj;
      // v3: decay 1.1 on the SpotLight; intensity = I × max × lightScale
      if (spot.decay == null || spot.decay === 0) spot.decay = 1.1;
      spot.color.copy(col);
      spot.intensity = I * f.max * this.lightScale;
      const ang = THREE.MathUtils.degToRad(out.zoom);
      spot.angle = ang;
      spot.penumbra = 0.1 + (out.focus / 100) * 0.85;

      const iris = out.iris != null ? Number(out.iris) / 100 : 1;
      beam.material.color.copy(col);
      beam.material.opacity = out.dim > 0.4 ? (0.015 + I * 0.085) * iris : 0;
      const bs = (Math.tan(ang) / Math.tan(BEAM_REF)) * (0.4 + iris * 0.6);
      beam.scale.x = beam.scale.z = Math.max(0.15, bs);

      aim.rotation.y = THREE.MathUtils.degToRad(out.pan + (f.fanOff || 0));
      aim.rotation.x = THREE.MathUtils.degToRad(out.tilt);

      f.live = out;
    });
  }
}
