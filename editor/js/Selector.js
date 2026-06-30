import * as THREE from "three";

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

class Selector {
  constructor(editor) {
    const signals = editor.signals;

    this.editor = editor;
    this.signals = signals;

    // signals

    signals.intersectionsDetected.add((intersects) => {
      if (intersects.length > 0) {
        const object = intersects[0].object;

        if (object.userData.object !== undefined) {
          // helper

          this.select(object.userData.object);
        } else {
          this.select(object);
        }
      } else {
        this.select(null);
      }
    });
  }

  getIntersects(raycaster) {
    const objects = [];

    this.editor.scene.traverseVisible(function (child) {
      objects.push(child);
    });

    this.editor.sceneHelpers.traverseVisible(function (child) {
      if (child.name === "picker") objects.push(child);
    });

    return raycaster.intersectObjects(objects, false);
  }

  getPointerIntersects(point, camera) {
    mouse.set(point.x * 2 - 1, -(point.y * 2) + 1);

    raycaster.setFromCamera(mouse, camera);

    return this.getIntersects(raycaster);
  }

  select(object) {
    if (object !== null && object !== this.editor.scene) {
      // 최상위 부모 객체 찾기 (scene 바로 아래 객체까지만)
      let topParent = object;
      while (topParent.parent && topParent.parent !== this.editor.scene) {
        topParent = topParent.parent;
      }

      // 이미 같은 객체가 선택되어 있다면 리턴
      if (this.editor.selected === topParent) return;

      let uuid = topParent.uuid;
      this.editor.selected = topParent;
      this.editor.config.setKey("selected", uuid);
    } else {
      this.editor.selected = null;
      this.editor.config.setKey("selected", null);
    }

    this.signals.objectSelected.dispatch(this.editor.selected);
  }

  deselect() {
    this.select(null);
  }
}

export { Selector };