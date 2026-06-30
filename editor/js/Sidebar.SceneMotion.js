import { UIPanel, UIBreak } from "./libs/ui.js";
import { UIOutliner } from "./libs/ui.three.js";

/** 왼쪽 패널 전용: 모션(FBX/OBJ) 객체만 표시 */
function SidebarSceneMotion(editor) {
  const signals = editor.signals;
  const nodeStates = new WeakMap();

  function escapeHTML(html) {
    return String(html)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getObjectType(object) {
    if (object.isScene) return "Scene";
    if (object.isCamera) return "Camera";
    if (object.isLight) return "Light";
    if (object.isMesh) return "Mesh";
    return "Object3D";
  }

  function buildHTML(object) {
    return `<span class="type ${getObjectType(object)}"></span> ${escapeHTML(object.name)}`;
  }

  function buildOption(object, draggable) {
    const option = document.createElement("div");
    option.draggable = draggable;
    option.innerHTML = buildHTML(object);
    option.value = object.id;
    if (draggable) {
      option.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("objectUuid", object.uuid);
        e.dataTransfer.setData("objectId", object.id);
        e.dataTransfer.setData("objectName", object.name);
      });
    }
    if (nodeStates.has(object)) {
      const state = nodeStates.get(object);
      const opener = document.createElement("span");
      opener.classList.add("opener");
      if (object.children.length > 0) opener.classList.add(state ? "open" : "closed");
      opener.addEventListener("click", function () {
        nodeStates.set(object, !nodeStates.get(object));
        refreshUI();
      });
      option.insertBefore(opener, option.firstChild);
    }
    return option;
  }

  let ignoreObjectSelectedSignal = false;
  const outliner = new UIOutliner(editor);
  outliner.setId("outliner-motion");
  outliner.onChange(function () {
    ignoreObjectSelectedSignal = true;
    editor.selectById(parseInt(outliner.getValue()));
    ignoreObjectSelectedSignal = false;
  });
  outliner.onDblClick(function () {
    editor.focusById(parseInt(outliner.getValue()));
  });
  const container = new UIPanel();
  container.setBorderTop("0");
  container.add(outliner);
  container.add(new UIBreak());

  function refreshUI() {
    const options = [];
    const scene = editor.scene;

    function addObjects(objects, pad) {
      for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        if (object.isLight || (object.isGroup && object.name.toLowerCase().includes("light"))) continue;
        if (object.userData.source !== "motion") continue;

        if (nodeStates.has(object) === false) nodeStates.set(object, false);
        const option = buildOption(object, true);
        option.style.paddingLeft = pad * 18 + "px";
        options.push(option);
        if (nodeStates.get(object) === true) addObjects(object.children, pad + 1);
      }
    }
    addObjects(scene.children, 0);
    outliner.setOptions(options);
    if (editor.selected !== null) outliner.setValue(editor.selected.id);
  }

  signals.editorCleared.add(refreshUI);
  signals.sceneGraphChanged.add(refreshUI);
  signals.objectSelected.add(function (object) {
    if (ignoreObjectSelectedSignal) return;
    if (object !== null) outliner.setValue(object.id);
    else outliner.setValue(null);
  });
  refreshUI();
  return container;
}

export { SidebarSceneMotion };
