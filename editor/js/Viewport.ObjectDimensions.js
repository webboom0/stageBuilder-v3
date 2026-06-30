import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import { getObjectWorldSize } from "./utils/objectWorldSize.js";
import {
  getDisplayRoot,
  worldSizeToMotionDisplay,
} from "./utils/motionDisplayUnits.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();

function createDimensionLabel() {
  const element = document.createElement("div");
  element.className = "viewport-dimension-label";
  element.textContent = "0 m";

  const label = new CSS2DObject(element);
  label.center.set(0.5, 0.5);
  return label;
}

/**
 * 선택 객체 바운딩 박스에 m 단위 치수 라벨 (줌과 무관하게 숫자로 확인).
 */
class ViewportObjectDimensions {
  constructor(containerDom, editor) {
    this.editor = editor;
    this.target = null;
    this.group = new THREE.Group();
    this.group.name = "ObjectDimensions";
    this.group.visible = false;

    this.labelX = createDimensionLabel();
    this.labelY = createDimensionLabel();
    this.labelZ = createDimensionLabel();
    this.group.add(this.labelX, this.labelY, this.labelZ);

    this.css2d = new CSS2DRenderer();
    const el = this.css2d.domElement;
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "2";
    containerDom.appendChild(el);
  }

  setSize(width, height) {
    this.css2d.setSize(width, height);
  }

  hideLabels() {
    for (const label of [this.labelX, this.labelY, this.labelZ]) {
      label.element.style.display = "none";
    }
  }

  setObject(object) {
    const root = getDisplayRoot(object, this.editor);
    if (object === null || root === null) {
      this.target = null;
      this.group.visible = false;
      this.hideLabels();
      return;
    }

    this.target = root;
    this.group.visible = true;
    this.update();
  }

  update() {
    if (this.target === null) return;

    _box.setFromObject(this.target, true);
    if (_box.isEmpty()) {
      this.group.visible = false;
      return;
    }

    const size = worldSizeToMotionDisplay(
      getObjectWorldSize(this.target),
      this.target,
      this.editor,
    );
    _box.getCenter(_center);

    const fmt = (v) => `${v.toFixed(2)} m`;
    this.labelX.element.textContent = fmt(size.x);
    this.labelY.element.textContent = fmt(size.y);
    this.labelZ.element.textContent = fmt(size.z);

    const margin = Math.max(Math.max(size.x, size.y, size.z) * 0.06, 0.15);

    this.labelX.position.set(_box.max.x + margin, _center.y, _center.z);
    this.labelY.position.set(_center.x, _box.max.y + margin, _center.z);
    this.labelZ.position.set(_center.x, _center.y, _box.max.z + margin);
  }

  render(camera) {
    // 선택 해제 시에도 css2d.render를 호출해야 이전 프레임의 라벨이 DOM에서 사라짐
    this.css2d.render(this.group, camera);
  }

  dispose() {
    if (this.css2d.domElement.parentNode) {
      this.css2d.domElement.parentNode.removeChild(this.css2d.domElement);
    }
  }
}

export { ViewportObjectDimensions };
