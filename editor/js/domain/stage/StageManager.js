import * as THREE from 'three';
import { validateStageProfile, createStageProfile } from './StageProfile.js';
import { normalizeStageType } from './StageTypes.js';
import { arenaFloorLayoutFromBackground } from './arenaStageLayout.js';
import {
  disposeObject3D,
  loadStageBackgroundFbx,
} from './StageBackgroundLoader.js';
import {
  V3_PROSCENIUM_FLOOR,
  getClampedProfileFactors,
  getProfileLimits,
  getStagePivot,
  worldToPivotLocal,
} from './stageFloorLayout.js';

/**
 * v3 building FBX + floor inside a scaled group — size changes scale shell and floor together.
 */
export class StageManager {
  /**
   * @param {import('./StageProfile.js').GRAND_HALL_DEFAULT} profile
   */
  constructor(profile) {
    this.profile = validateStageProfile(profile);
    this.stageType = 'proscenium';
    this._loading = false;
    this._scaleClamped = false;

    this.scene = new THREE.Scene();

    this.stageGroup = new THREE.Group();
    this.stageGroup.name = 'Stage';
    this.stageGroup.userData.isBackground = true;
    this.stageGroup.userData.notSelectable = true;
    this.scene.add(this.stageGroup);

    this.stagePivot = new THREE.Group();
    this.stagePivot.name = 'StagePivot';
    this.stageGroup.add(this.stagePivot);

    this.scaledContent = new THREE.Group();
    this.scaledContent.name = 'StageScaled';
    this.stagePivot.add(this.scaledContent);

    this.background = null;
    this.floor = null;
    /** Optional editor base lights — intensity driven by WORK (see workLights.js). */
    this._baseAmb = null;
    this._baseDir = null;

    this._buildLights();
  }

  /**
   * Named base lights start at 0. WORK button raises them for rehearsal;
   * without this they used to stay at 0.45/0.85 and blocked true blackout.
   */
  _buildLights() {
    const amb = new THREE.AmbientLight(0xffffff, 0);
    amb.name = '_EditorBaseAmb';
    amb.userData.excludeFromTimeline = true;
    amb.userData.notSelectable = true;
    const dir = new THREE.DirectionalLight(0xffffff, 0);
    dir.name = '_EditorBaseDir';
    dir.position.set(5, 15, 10);
    dir.userData.excludeFromTimeline = true;
    dir.userData.notSelectable = true;
    this.scene.add(amb, dir);
    this._baseAmb = amb;
    this._baseDir = dir;
  }

  /**
   * @param {number} level01 0 = blackout base, 1 = full editor fill
   */
  setBaseLightLevel(level01) {
    const v = Math.max(0, Math.min(1, Number(level01) || 0));
    if (this._baseAmb) this._baseAmb.intensity = 0.45 * v;
    if (this._baseDir) this._baseDir.intensity = 0.85 * v;
  }

  _clearScaledContent() {
    this._removeBackground();
    this._removeFloor();
  }

  _removeBackground() {
    if (!this.background) return;
    this.scaledContent.remove(this.background);
    disposeObject3D(this.background);
    this.background = null;
  }

  _removeFloor() {
    if (this.floor) {
      this.scaledContent.remove(this.floor);
      this.floor.geometry?.dispose();
      this.floor.material?.dispose();
      this.floor = null;
    }
  }

  _applyPivot(stageType) {
    const pivot = getStagePivot(stageType);
    this.stagePivot.position.set(pivot.x, pivot.y, pivot.z);
  }

  _applyProfileScale() {
    const factors = getClampedProfileFactors(this.profile, this.stageType);
    this._scaleClamped = factors.clamped;
    this.scaledContent.scale.set(
      factors.widthFactor,
      factors.heightFactor,
      factors.depthFactor,
    );
    return factors;
  }

  /**
   * @param {import('./StageTypes.js').StageTypeId} stageType
   */
  _createFloor(stageType) {
    this._removeFloor();

    const type = normalizeStageType(stageType);
    const pivot = getStagePivot(type);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      roughness: 0.5,
      metalness: 0.0,
    });

    let floor;

    if (type === 'arena') {
      const layout = arenaFloorLayoutFromBackground(this.background);
      const floorGeometry = new THREE.CircleGeometry(layout.geometryRadius, 96);
      floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(layout.x, layout.y, layout.z);
      floor.scale.set(layout.scaleX, layout.scaleY, layout.scaleZ);
    } else {
      const [gw, gh, gd] = V3_PROSCENIUM_FLOOR.geometry;
      const [px, py, pz] = V3_PROSCENIUM_FLOOR.position;
      const [sx, sy, sz] = V3_PROSCENIUM_FLOOR.scale;
      const [lx, ly, lz] = worldToPivotLocal([px, py, pz], pivot);
      const floorGeometry = new THREE.BoxGeometry(gw, gh, gd);
      floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(lx, ly, lz);
      floor.scale.set(sx, sy, sz);
    }

    floor.name = '_Floor';
    floor.renderOrder = -500;
    floor.material.depthWrite = true;
    floor.raycast = () => {};
    this.scaledContent.add(floor);
    this.floor = floor;
  }

  _localizeBackgroundToPivot(background, stageType) {
    const pivot = getStagePivot(stageType);
    background.position.x -= pivot.x;
    background.position.y -= pivot.y;
    background.position.z -= pivot.z;
  }

  /**
   * @param {Partial<import('./StageProfile.js').GRAND_HALL_DEFAULT>} overrides
   */
  applyProfile(overrides) {
    this.profile = validateStageProfile(createStageProfile({ ...this.profile, ...overrides }));
    if (!this.background) return getClampedProfileFactors(this.profile, this.stageType);
    return this._applyProfileScale();
  }

  /**
   * @param {import('./StageTypes.js').StageTypeId} type
   */
  async setStageType(type) {
    const next = normalizeStageType(type);
    if (this._loading) return;
    if (this.stageType === next && this.background) return;

    this._loading = true;
    try {
      this._clearScaledContent();
      this._applyPivot(next);
      this.background = await loadStageBackgroundFbx(next);
      this._localizeBackgroundToPivot(this.background, next);
      this.scaledContent.add(this.background);
      this.stageType = next;
      this._createFloor(next);
      this._applyProfileScale();
    } finally {
      this._loading = false;
    }
  }

  async init() {
    await this.setStageType(this.stageType);
  }

  get isLoading() {
    return this._loading;
  }

  get scaleClamped() {
    return this._scaleClamped;
  }

  getEffectiveProfile() {
    return getClampedProfileFactors(this.profile, this.stageType);
  }

  getProfileLimitsForType() {
    return getProfileLimits(this.stageType);
  }

  getBounds() {
    const eff = getClampedProfileFactors(this.profile, this.stageType);
    return {
      minX: -eff.effectiveWidthM / 2,
      maxX: eff.effectiveWidthM / 2,
      minZ: -eff.effectiveDepthM / 2,
      maxZ: eff.effectiveDepthM / 2,
    };
  }
}
