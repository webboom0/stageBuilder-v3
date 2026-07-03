import * as THREE from "three";
import { beamRefRad, buildFixtureMatrix, aimPanTilt } from "./fixtureRig.js";
import { mkFixtureAttr, PROSCENIUM_RIG_REF, RIG_FIT, RIG_MATRIX, STAGE_FRONT_SPOT_NAMES } from "./fixtureTypes.js";

const STORAGE_KEY = "fixtureEngine";
const BEAM_REF = beamRefRad();

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export class FixtureEngine {
  constructor(editor) {
    this.editor = editor;
    this.fixtures = [];
    this.fmap = {};
    this.root = null;
    this.built = false;
    this.lightScale = 1;

    this.fixtureBus = 1;
    this.blackout = false;
    this.highlight = false;
    this.timelinePriority = false;
    this.isPlaying = false;
  }

  ensureRig() {
    if (this.built && this.root?.parent) return this.fixtures;

    const scene = this.editor?.scene;
    if (!scene) return [];

    const savedSel = this.getSelectionIds();

    this.disposeRig();

    this.root = new THREE.Group();
    this.root.name = "_FixtureRig";
    this.root.userData.isFixtureRig = true;
    this.root.userData.notSelectable = true;
    this.root.userData.excludeFromTimeline = true;

    this.fixtures = buildFixtureMatrix(this.root);
    this.fixtures.forEach((f) => {
      this.fmap[f.fid] = f;
    });

    scene.add(this.root);
    this.built = true;

    this.loadFromSceneUserData();
    if (!this.getSelectionIds().length && savedSel.length) {
      this.setSelection(savedSel);
    }
    this.fixtures.forEach((f) => {
      if (Number(f.attr?.dim) <= 0) f.attr.dim = 0;
    });
    const savedFe = this.editor?.scene?.userData?.[STORAGE_KEY];
    if (savedFe?.fixtureBus != null) this.fixtureBus = savedFe.fixtureBus;
    else if (savedFe?.gm != null) this.fixtureBus = savedFe.gm;
    this.fitToStage();
    this.update();
    this.persistToSceneUserData();

    if (this.editor?.signals?.sceneGraphChanged) {
      this.editor.signals.sceneGraphChanged.dispatch();
    }

    console.log(`✅ FixtureEngine: ${this.fixtures.length} fixtures rigged`);
    return this.fixtures;
  }

  disposeRig() {
    if (this.root?.parent) {
      this.root.parent.remove(this.root);
    }
    this.root?.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this.root = null;
    this.fixtures = [];
    this.fmap = {};
    this.built = false;
  }

  /** Position / scale rig to match stage floor in world space */
  fitToStage() {
    if (!this.root || !this.editor?.scene) return;

    const scene = this.editor.scene;
    const stage = scene.children.find((c) => c.name === "Stage");
    if (!stage) {
      this._applyRigTransform(new THREE.Vector3(0, 48, 0), 1);
      return;
    }

    stage.updateWorldMatrix(true, true);

    const floor = stage.children.find((c) => c.name === "_Floor");
    const background = stage.children.find((c) => c.name === "_Background");

    const floorBox = new THREE.Box3();
    const bgBox = new THREE.Box3();
    if (floor) floorBox.setFromObject(floor);
    if (background) bgBox.setFromObject(background);

    const hasFloor = floor && !floorBox.isEmpty();
    const hasBg = background && !bgBox.isEmpty();

    if (!hasFloor && !hasBg) {
      const stageBox = new THREE.Box3().setFromObject(stage);
      if (stageBox.isEmpty()) {
        this._applyRigTransform(new THREE.Vector3(0, 48, 0), 1);
        return;
      }
      this._fitFromBox(stageBox, stageBox, null);
      return;
    }

    const refBox = hasFloor ? floorBox : bgBox;
    const stageType = scene.userData?.stageType || "proscenium";
    if (stageType !== "arena") {
      this._fitProscenium(refBox, floorBox, bgBox);
      return;
    }
    this._fitFromBox(refBox, floorBox, bgBox);
  }

  /** 프로시니엄: NANSEOL 프리셋·기본 스폿 좌표 기준 (바닥 mesh 전체 span 사용 안 함) */
  _fitProscenium(refBox, floorBox, bgBox) {
    const scene = this.editor.scene;
    const deckTopY = floorBox.max.y || refBox.max.y;
    const ref = PROSCENIUM_RIG_REF;
    const center = new THREE.Vector3(ref.centerX, 0, ref.centerZ);
    let spanX = ref.spanX;
    let spanZ = ref.spanZ;
    let worldBattenY = ref.worldBattenY;

    const spots = STAGE_FRONT_SPOT_NAMES.map((n) => scene.getObjectByName(n)).filter(Boolean);
    if (spots.length >= 2) {
      const xs = spots.map((s) => s.position.x);
      const ys = spots.map((s) => s.position.y);
      spanX = Math.max(...xs) - Math.min(...xs);
      center.x = (Math.max(...xs) + Math.min(...xs)) / 2;
      worldBattenY = ys.reduce((a, b) => a + b, 0) / ys.length + 52;
      const targets = STAGE_FRONT_SPOT_NAMES.map((n) => scene.getObjectByName(n.replace("Spot", "SpotTarget"))).filter(Boolean);
      if (targets.length) {
        const zs = targets.map((t) => t.position.z);
        center.z = (Math.max(...zs) + Math.min(...zs)) / 2 + 8;
        spanZ = Math.min(ref.spanZ, Math.max(72, (Math.max(...zs) - Math.min(...zs)) + 48));
      }
    }

    center.z += ref.centerZOffset ?? 0;

    const span = Math.max(spanX, spanZ);
    const scale = THREE.MathUtils.clamp(span / RIG_MATRIX.spanX, RIG_FIT.minScale, RIG_FIT.maxScale);

    if (bgBox && !bgBox.isEmpty()) {
      const roomH = Math.max(bgBox.max.y - deckTopY, 40);
      const ceilingCapY = deckTopY + roomH * RIG_FIT.ceilingRatio;
      worldBattenY = Math.min(worldBattenY, ceilingCapY);
    }
    worldBattenY = Math.max(worldBattenY, deckTopY + 48);

    const rootY = worldBattenY - RIG_MATRIX.battenY * scale;
    this._fitMeta = { overheadLocal: (worldBattenY - deckTopY) / scale, deckLocalY: -RIG_MATRIX.battenY };
    this._applyRigTransform(new THREE.Vector3(center.x, rootY, center.z), scale);
    this.reaimHomes();
  }

  _fitFromBox(refBox, floorBox, bgBox) {
    const floorSize = floorBox.getSize(new THREE.Vector3());
    const floorCenter = floorBox.getCenter(new THREE.Vector3());

    // XZ·span은 항상 연출 바닥(_Floor) 기준 — _Background 건물 mesh 중심 사용 금지
    const center = floorCenter.clone();
    let spanX = floorSize.x;
    let spanZ = floorSize.z;

    if ((!spanX || !spanZ) && bgBox && !bgBox.isEmpty()) {
      const bgSize = bgBox.getSize(new THREE.Vector3());
      spanX = spanX || bgSize.x * 0.35;
      spanZ = spanZ || bgSize.z * 0.35;
      if (refBox.isEmpty()) center.copy(bgBox.getCenter(new THREE.Vector3()));
    }

    const span = Math.max(spanX, spanZ) * RIG_FIT.spanRatio;
    const scale = THREE.MathUtils.clamp(
      span / RIG_MATRIX.spanX,
      RIG_FIT.minScale,
      RIG_FIT.maxScale,
    );

    const deckTopY = floorBox.max.y || refBox.max.y;

    const overheadWorld = Math.max(span * RIG_FIT.overheadRatio, RIG_FIT.minOverheadWorld);

    let worldBattenY = deckTopY + overheadWorld;
    if (bgBox && !bgBox.isEmpty()) {
      const roomH = Math.max(bgBox.max.y - deckTopY, overheadWorld * 2);
      const ceilingCapY = deckTopY + roomH * RIG_FIT.ceilingRatio;
      worldBattenY = Math.min(worldBattenY, ceilingCapY);
    }

    const rootY = worldBattenY - RIG_MATRIX.battenY * scale;

    this._fitMeta = { overheadLocal: overheadWorld / scale, deckLocalY: -RIG_MATRIX.battenY };

    this._applyRigTransform(new THREE.Vector3(center.x, rootY, center.z), scale);
    this.reaimHomes();
  }

  /** Recompute pan/tilt home angles (after rig move or rebuild) */
  reaimHomes() {
    const spanZ = RIG_MATRIX.spanZ;
    const deckY = this._fitMeta?.deckLocalY ?? -RIG_MATRIX.battenY;
    this.fixtures.forEach((f) => {
      const x = f.obj.grp.position.x;
      const z = f.obj.grp.position.z;
      const y = f.obj.grp.position.y;
      const pos = [x, y, z];
      // 다운스테이지(관객 쪽 +Z) 중앙 바닥을 향함
      const target =
        f.grp === "cyc"
          ? [x, deckY + 4, -spanZ * 0.42]
          : [x * 0.35, deckY, Math.max(-spanZ * 0.08, z * 0.15)];
      const aim = aimPanTilt(pos, target);
      f.home.pan = aim.pan;
      f.home.tilt = aim.tilt;
      if (!f.prog?.pan && !f.prog?.tilt) {
        f.attr.pan = aim.pan;
        f.attr.tilt = aim.tilt;
      }
    });
    this.update();
  }

  _applyRigTransform(position, scale) {
    this.root.position.copy(position);
    this.root.scale.setScalar(scale);
    this.lightScale = scale;
    this.persistToSceneUserData();
  }

  getFixture(fid) {
    return this.fmap[fid] || null;
  }

  getFixtures() {
    return this.fixtures;
  }

  /** 키프레임에 저장할 편집 값 (attr + prog, Bus/Blackout 미적용) */
  getFixtureCaptureState(fid) {
    const f = this.fmap[fid];
    if (!f) return null;
    const out = Object.assign({}, f.home, f.attr);
    const p = f.prog || {};
    for (const k of Object.keys(p)) {
      if (k === "dim" && p.dim != null) out.dim = p.dim;
      else if (p[k] != null) out[k] = p[k];
    }
    return out;
  }

  /** prog 임시값을 attr에 반영 (키프레임 추가 직후) */
  commitFixtureEditToAttr(fid) {
    const f = this.fmap[fid];
    const cap = this.getFixtureCaptureState(fid);
    if (!f || !cap) return;
    for (const k of ["dim", "pan", "tilt", "zoom", "focus", "r", "g", "b"]) {
      if (cap[k] != null) f.attr[k] = cap[k];
    }
    f.prog = {};
    this.persistToSceneUserData();
  }

  setFixtureBus(v) {
    this.fixtureBus = Math.max(0, Math.min(1, Number(v) || 0));
    this.persistToSceneUserData();
    this.update();
    if (this.editor?.signals?.rendererUpdated) {
      this.editor.signals.rendererUpdated.dispatch();
    }
  }

  /** @deprecated GRAND는 픽스처가 아닌 applyStageGrand() 사용 */
  setGlobalMaster(v) {
    this.setFixtureBus(v);
  }

  get gm() {
    return this.fixtureBus;
  }

  set gm(v) {
    this.fixtureBus = v;
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

  setAllDim(dim) {
    const d = Math.max(0, Math.min(100, Number(dim) || 0));
    this.fixtures.forEach((f) => {
      f.attr = Object.assign(mkFixtureAttr(), f.attr, { dim: d });
      f.prog = {};
    });
    this.persistToSceneUserData();
    this.update();
    if (this.editor?.signals?.rendererUpdated) {
      this.editor.signals.rendererUpdated.dispatch();
    }
  }

  clearProgrammer() {
    this.fixtures.forEach((f) => {
      f.prog = {};
    });
    this.highlight = false;
    this.persistToSceneUserData();
    this.update();
  }

  setProgAttr(fid, attr, val) {
    const f = this.fmap[fid];
    if (!f || val == null) return;
    if (!f.prog) f.prog = {};
    if (attr === "dim") f.prog.dim = Math.max(0, Math.min(100, val));
    else if (attr === "pan") f.prog.pan = Math.max(-270, Math.min(270, val));
    else if (attr === "tilt") f.prog.tilt = Math.max(-120, Math.min(120, val));
    else if (attr === "zoom") f.prog.zoom = Math.max(5, Math.min(50, val));
    else if (attr === "focus") f.prog.focus = Math.max(0, Math.min(100, val));
    else if (attr === "r" || attr === "g" || attr === "b") f.prog[attr] = clamp01(val);
    else f.prog[attr] = val;
    this.persistToSceneUserData();
    this.update();
  }

  setSelection(ids) {
    const set = new Set((ids || []).map(Number).filter((n) => this.fmap[n]));
    this.fixtures.forEach((f) => {
      f.sel = set.has(f.fid);
    });
    this.persistToSceneUserData();
    this.update();
    this.editor?.signals?.rendererUpdated?.dispatch?.();
  }

  getSelectionIds() {
    return this.fixtures.filter((f) => f.sel).map((f) => f.fid);
  }

  toggleSelection(fid) {
    const f = this.fmap[fid];
    if (!f) return;
    f.sel = !f.sel;
    this.persistToSceneUserData();
    this.update();
    this.editor?.signals?.rendererUpdated?.dispatch?.();
  }

  setHighlight(on) {
    this.highlight = !!on;
    this.persistToSceneUserData();
    this.update();
  }

  setProgColor(fid, color) {
    if (!color) return;
    this.setProgAttr(fid, "r", color.r);
    this.setProgAttr(fid, "g", color.g);
    this.setProgAttr(fid, "b", color.b);
  }

  applyProgToSelection(attr, val) {
    this.getSelectionIds().forEach((id) => this.setProgAttr(id, attr, val));
  }

  /** 선택 픽스처 attr.dim (개별 밝기, Clear 후에도 유지) */
  setSelectionDim(dim) {
    const d = Math.max(0, Math.min(100, Number(dim) || 0));
    const ids = this.getSelectionIds();
    if (!ids.length) return false;
    ids.forEach((id) => {
      const f = this.fmap[id];
      if (!f) return;
      f.attr.dim = d;
      if (f.prog?.dim != null) delete f.prog.dim;
      f.enabled = true;
    });
    this.persistToSceneUserData();
    this.update();
    if (this.editor?.signals?.rendererUpdated) {
      this.editor.signals.rendererUpdated.dispatch();
    }
    return true;
  }

  setSelectionColor(r, g, b) {
    const ids = this.getSelectionIds();
    if (!ids.length) return false;
    ids.forEach((id) => {
      this.setProgAttr(id, "r", r);
      this.setProgAttr(id, "g", g);
      this.setProgAttr(id, "b", b);
    });
    return true;
  }

  setAllEnabled(on) {
    this.fixtures.forEach((f) => {
      f.enabled = !!on;
    });
    this.persistToSceneUserData();
    this.update();
  }

  /** Push timeline override to all moving heads (Phase 4 hook) */
  setTimelineOverride(attrs) {
    if (!attrs) {
      this.fixtures.forEach((f) => {
        f.tl = null;
      });
    } else {
      this.fixtures
        .filter((f) => f.grp === "mh")
        .forEach((f, i, arr) => {
          f.tl = Object.assign({}, attrs);
          f.fanOff = (i - (arr.length - 1) / 2) * (attrs.fan || 0);
        });
    }
    this.update();
  }

  update(nowSec) {
    if (!this.built || !this.fixtures.length) return;
    const tsec = nowSec != null ? nowSec : performance.now() / 1000;
    this.renderFixtures(tsec);
  }

  renderFixtures(tsec) {
    const playing = !!this.isPlaying;
    this.fixtures.forEach((f) => {
      const out = Object.assign({}, f.home, f.attr);

      // 재생 중 · 비선택 · (타임라인 우선이고 prog 편집 없음) → 타임라인 프리뷰
      // prog가 있으면 선택 픽스처는 인코더 편집값 우선
      const progActive = f.prog && Object.keys(f.prog).length > 0;
      const useTimelineLayer =
        f.tl &&
        (playing || !f.sel || (this.timelinePriority && !progActive));
      if (useTimelineLayer) {
        out.dim = f.tl.dim ?? out.dim;
        out.pan = f.tl.pan ?? out.pan;
        out.tilt = f.tl.tilt ?? out.tilt;
        out.zoom = f.tl.zoom ?? out.zoom;
        out.focus = f.tl.focus ?? out.focus;
        out.r = f.tl.r ?? out.r;
        out.g = f.tl.g ?? out.g;
        out.b = f.tl.b ?? out.b;
        out.strobe = 0;
      }

      const p = f.prog || {};
      for (const k of Object.keys(p)) {
        if (playing && this.timelinePriority && f.tl && f.tl[k] != null) continue;
        if (k === "dim" && p.dim != null) out.dim = p.dim;
        else out[k] = p[k];
      }

      if (this.highlight && f.sel) {
        out.dim = 100;
        out.r = out.g = out.b = 1;
        out.strobe = 0;
      }
      if (f.enabled === false) out.dim = 0;
      if (this.blackout) out.dim = 0;
      else out.dim = (Number(out.dim) || 0) * this.fixtureBus;

      if (out.strobe > 0 && out.dim > 0) {
        const fr = 2 + (out.strobe / 100) * 16;
        out.dim *= Math.sin(tsec * fr * Math.PI * 2) > 0 ? 1 : 0;
      }

      const I = clamp01(out.dim / 100);
      const col = new THREE.Color(out.r, out.g, out.b);

      const { spot, beam, aim } = f.obj;
      spot.color.copy(col);
      spot.intensity = I * f.max * this.lightScale;
      const ang = THREE.MathUtils.degToRad(out.zoom);
      spot.angle = ang;
      spot.penumbra = 0.1 + (out.focus / 100) * 0.85;

      beam.material.color.copy(col);
      beam.material.opacity = out.dim > 0.4 ? (0.015 + I * 0.085) * (out.iris / 100) : 0;
      const bs = (Math.tan(ang) / Math.tan(BEAM_REF)) * (0.4 + (out.iris / 100) * 0.6);
      beam.scale.x = beam.scale.z = Math.max(0.15, bs);

      aim.rotation.y = THREE.MathUtils.degToRad(out.pan + (f.fanOff || 0));
      aim.rotation.x = THREE.MathUtils.degToRad(out.tilt);

      f.live = out;
    });
  }

  persistToSceneUserData() {
    const scene = this.editor?.scene;
    if (!scene) return;
    if (!scene.userData) scene.userData = {};
    scene.userData[STORAGE_KEY] = {
      version: 1,
      fixtureBus: this.fixtureBus,
      gm: this.fixtureBus,
      blackout: this.blackout,
      built: this.built,
      selection: this.getSelectionIds(),
      overrides: this.fixtures.map((f) => ({
        fid: f.fid,
        enabled: f.enabled,
        prog: f.prog,
        attr: f.attr,
      })),
    };
  }

  loadFromSceneUserData() {
    const data = this.editor?.scene?.userData?.[STORAGE_KEY];
    if (!data) return;
    if (data.fixtureBus != null) this.fixtureBus = data.fixtureBus;
    else if (data.gm != null) this.fixtureBus = data.gm;
    this.blackout = !!data.blackout;
    if (Array.isArray(data.overrides)) {
      data.overrides.forEach((row) => {
        const f = this.fmap[row.fid];
        if (!f) return;
        if (row.enabled != null) f.enabled = row.enabled;
        if (row.prog) f.prog = Object.assign({}, row.prog);
        if (row.attr) f.attr = Object.assign(mkFixtureAttr(), row.attr);
      });
    }
    if (Array.isArray(data.selection) && data.selection.length) {
      this.setSelection(data.selection);
    }
  }
}

export function getFixtureEngine(editor) {
  if (!editor.fixtureEngine) {
    editor.fixtureEngine = new FixtureEngine(editor);
  }
  return editor.fixtureEngine;
}
