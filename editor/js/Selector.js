import * as THREE from "three";

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function isViewportSelectionBlocked(object, sceneRoot) {
  let o = object;
  while (o && o !== sceneRoot) {
    const ud = o.userData || {};
    if (ud.notSelectable || ud.isFixtureRig || ud.isFixture) return true;
    if (o.name === "_FixtureRig") return true;
    if (o.isLight === true) return true;
    const name = o.name;
    if (
      typeof name === "string" &&
      (name.startsWith("_StageFrontSpot") || name.startsWith("_Light"))
    ) {
      return true;
    }
    o = o.parent;
  }
  return false;
}

function pickSelectableIntersect(intersects, sceneRoot) {
  for (let i = 0; i < intersects.length; i++) {
    if (!isViewportSelectionBlocked(intersects[i].object, sceneRoot)) {
      return intersects[i];
    }
  }
  return null;
}

class Selector {
  constructor(editor) {
    const signals = editor.signals;

    this.editor = editor;
    this.signals = signals;

    // signals

    signals.intersectionsDetected.add((intersects) => {
      const hit = pickSelectableIntersect(intersects, this.editor.scene);
      if (hit) {
        const object = hit.object;

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
    let topParent = null;

    if (object !== null && object !== this.editor.scene) {
      topParent = object;
      while (topParent.parent && topParent.parent !== this.editor.scene) {
        topParent = topParent.parent;
      }

      if (isViewportSelectionBlocked(topParent, this.editor.scene)) {
        topParent = null;
      }
    }

    if (topParent !== null) {
      if (this.editor.selected === topParent) return;

      const uuid = topParent.uuid;
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