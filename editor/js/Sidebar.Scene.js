import * as THREE from "three";

import {
  UIPanel,
  UIBreak,
  UIRow,
  UIColor,
  UISelect,
  UIText,
  UINumber,
} from "./libs/ui.js";
import { UIOutliner, UITexture } from "./libs/ui.three.js";

function SidebarScene(editor) {
  const signals = editor.signals;
  const strings = editor.strings;

  const container = new UIPanel();
  container.setBorderTop("0");
  // container.setPaddingTop("20px");

  // outliner

  const nodeStates = new WeakMap();

  function buildOption(object, draggable) {
    const option = document.createElement("div");
    option.draggable = draggable;
    option.innerHTML = buildHTML(object);
    option.value = object.id;

    // === 드래그 이벤트 추가 ===
    if (draggable) {
      option.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("objectUuid", object.uuid);
        e.dataTransfer.setData("objectId", object.id);
        e.dataTransfer.setData("objectName", object.name);
        // 디버깅용
        console.log("dragstart", object.uuid, object.id, object.name);
      });
    }

    // opener
    if (nodeStates.has(object)) {
      // fbx 객체는 opener 생성/삽입을 건너뜀
      console.log("opener");
      console.log(object.children.filter(child => child.isMesh));
      if (object.children.filter(child => child.isMesh).length <= 0) {
        const state = nodeStates.get(object);

        const opener = document.createElement("span");
        opener.classList.add("opener");

        if (object.children.length > 0) {
          opener.classList.add(state ? "open" : "closed");
        }

        opener.addEventListener("click", function () {
          nodeStates.set(object, nodeStates.get(object) === false); // toggle
          refreshUI();
        });

        option.insertBefore(opener, option.firstChild);
      }
    }
    return option;
  }

  function getMaterialName(material) {
    if (Array.isArray(material)) {
      const array = [];

      for (let i = 0; i < material.length; i++) {
        array.push(material[i].name);
      }

      return array.join(",");
    }

    return material.name;
  }

  function escapeHTML(html) {
    return html
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
    if (object.isLine) return "Line";
    if (object.isPoints) return "Points";

    return "Object3D";
  }

  function buildHTML(object) {
    let html = `<span class="type ${getObjectType(
      object
    )}"></span> ${escapeHTML(object.name)}`;

    if (object.isMesh) {
      const geometry = object.geometry;
      const material = object.material;

      html += ` <span class="type Geometry"></span> ${escapeHTML(
        geometry.name
      )}`;
      html += ` <span class="type Material"></span> ${escapeHTML(
        getMaterialName(material)
      )}`;
    }

    html += getScript(object.uuid);

    return html;
  }

  function getScript(uuid) {
    if (editor.scripts[uuid] === undefined) return "";

    if (editor.scripts[uuid].length === 0) return "";

    return ' <span class="type Script"></span>';
  }

  let ignoreObjectSelectedSignal = false;

  const outliner = new UIOutliner(editor);
  outliner.setId("outliner");
  outliner.onChange(function () {
    ignoreObjectSelectedSignal = true;

    editor.selectById(parseInt(outliner.getValue()));

    ignoreObjectSelectedSignal = false;
  });
  outliner.onDblClick(function () {
    editor.focusById(parseInt(outliner.getValue()));
  });
  container.add(outliner);
  container.add(new UIBreak());

  // environment

  const environmentRow = new UIRow();

  const environmentType = new UISelect()
    .setOptions({
      None: "",
      Background: "Background",
      Equirectangular: "Equirect",
      ModelViewer: "ModelViewer",
    })
    .setWidth("150px");
  environmentType.setValue("None");
  environmentType.onChange(function () {
    onEnvironmentChanged();
    refreshEnvironmentUI();
  });

  environmentRow.add(
    new UIText(strings.getKey("sidebar/scene/environment")).setClass("Label")
  );
  environmentRow.add(environmentType);

  const environmentEquirectangularTexture = new UITexture(editor)
    .setMarginLeft("8px")
    .onChange(onEnvironmentChanged);
  environmentEquirectangularTexture.setDisplay("none");
  environmentRow.add(environmentEquirectangularTexture);

  // container.add(environmentRow);

  function onEnvironmentChanged() {
    signals.sceneEnvironmentChanged.dispatch(
      environmentType.getValue(),
      environmentEquirectangularTexture.getValue()
    );
  }

  function refreshEnvironmentUI() {
    const type = environmentType.getValue();

    environmentType.setWidth(type !== "Equirectangular" ? "150px" : "110px");
    environmentEquirectangularTexture.setDisplay(
      type === "Equirectangular" ? "" : "none"
    );
  }

  // fog

  function onFogChanged() {
    signals.sceneFogChanged.dispatch(
      fogType.getValue(),
      fogColor.getHexValue(),
      fogNear.getValue(),
      fogFar.getValue(),
      fogDensity.getValue()
    );
  }

  function onFogSettingsChanged() {
    signals.sceneFogSettingsChanged.dispatch(
      fogType.getValue(),
      fogColor.getHexValue(),
      fogNear.getValue(),
      fogFar.getValue(),
      fogDensity.getValue()
    );
  }

  const fogTypeRow = new UIRow();
  const fogType = new UISelect()
    .setOptions({
      None: "",
      Fog: "Linear",
      FogExp2: "Exponential",
    })
    .setWidth("150px");
  fogType.onChange(function () {
    onFogChanged();
    refreshFogUI();
  });

  fogTypeRow.add(
    new UIText(strings.getKey("sidebar/scene/fog")).setClass("Label")
  );
  fogTypeRow.add(fogType);

  // container.add(fogTypeRow);

  // fog color

  const fogPropertiesRow = new UIRow();
  fogPropertiesRow.setDisplay("none");
  fogPropertiesRow.setMarginLeft("120px");
  container.add(fogPropertiesRow);

  const fogColor = new UIColor().setValue("#aaaaaa");
  fogColor.onInput(onFogSettingsChanged);
  fogPropertiesRow.add(fogColor);

  // fog near

  const fogNear = new UINumber(0.1)
    .setWidth("40px")
    .setRange(0, Infinity)
    .onChange(onFogSettingsChanged);
  fogPropertiesRow.add(fogNear);

  // fog far

  const fogFar = new UINumber(50)
    .setWidth("40px")
    .setRange(0, Infinity)
    .onChange(onFogSettingsChanged);
  fogPropertiesRow.add(fogFar);

  // fog density

  const fogDensity = new UINumber(0.05)
    .setWidth("40px")
    .setRange(0, 0.1)
    .setStep(0.001)
    .setPrecision(3)
    .onChange(onFogSettingsChanged);
  fogPropertiesRow.add(fogDensity);

  //

  function refreshUI() {
    const camera = editor.camera;
    const scene = editor.scene;

    const options = [];

    options.push(buildOption(camera, false));
    options.push(buildOption(scene, false));

    (function addObjects(objects, pad) {
      for (let i = 0, l = objects.length; i < l; i++) {
        const object = objects[i];

        // 라이트 및 라이트 그룹 제외
        if (object.isLight || (object.isGroup && object.name.toLowerCase().includes('light'))) continue;

        if (nodeStates.has(object) === false) {
          nodeStates.set(object, false);
        }

        const option = buildOption(object, true);
        option.style.paddingLeft = pad * 18 + "px";
        options.push(option);

        if (nodeStates.get(object) === true) {
          addObjects(object.children, pad + 1);
        }
      }
    })(scene.children, 0);

    outliner.setOptions(options);

    if (editor.selected !== null) {
      outliner.setValue(editor.selected.id);
    }

    if (scene.environment) {
      if (
        scene.background &&
        scene.background.isTexture &&
        scene.background.uuid === scene.environment.uuid
      ) {
        environmentType.setValue("Background");
      } else if (
        scene.environment.mapping === THREE.EquirectangularReflectionMapping
      ) {
        environmentType.setValue("Equirectangular");
        environmentEquirectangularTexture.setValue(scene.environment);
      } else if (scene.environment.isRenderTargetTexture === true) {
        environmentType.setValue("ModelViewer");
      }
    } else {
      environmentType.setValue("None");
      environmentEquirectangularTexture.setValue(null);
    }

    if (scene.fog) {
      fogColor.setHexValue(scene.fog.color.getHex());

      if (scene.fog.isFog) {
        fogType.setValue("Fog");
        fogNear.setValue(scene.fog.near);
        fogFar.setValue(scene.fog.far);
      } else if (scene.fog.isFogExp2) {
        fogType.setValue("FogExp2");
        fogDensity.setValue(scene.fog.density);
      }
    } else {
      fogType.setValue("None");
    }

    refreshEnvironmentUI();
    refreshFogUI();
  }

  function refreshFogUI() {
    const type = fogType.getValue();

    fogPropertiesRow.setDisplay(type === "None" ? "none" : "");
    fogNear.setDisplay(type === "Fog" ? "" : "none");
    fogFar.setDisplay(type === "Fog" ? "" : "none");
    fogDensity.setDisplay(type === "FogExp2" ? "" : "none");
  }

  refreshUI();

  // events

  signals.editorCleared.add(refreshUI);

  signals.sceneGraphChanged.add(refreshUI);

  signals.refreshSidebarEnvironment.add(refreshUI);

  signals.objectChanged.add(function (object) {
    const options = outliner.options;

    for (let i = 0; i < options.length; i++) {
      const option = options[i];

      if (option.value === object.id) {
        const openerElement = option.querySelector(":scope > .opener");

        const openerHTML = openerElement ? openerElement.outerHTML : "";

        option.innerHTML = openerHTML + buildHTML(object);

        return;
      }
    }
  });

  signals.scriptAdded.add(function () {
    if (editor.selected !== null)
      signals.objectChanged.dispatch(editor.selected);
  });

  signals.scriptRemoved.add(function () {
    if (editor.selected !== null)
      signals.objectChanged.dispatch(editor.selected);
  });

  signals.objectSelected.add(function (object) {
    if (ignoreObjectSelectedSignal === true) return;

    if (object !== null && object.parent !== null) {
      let needsRefresh = false;
      let parent = object.parent;

      while (parent !== editor.scene) {
        if (nodeStates.get(parent) !== true) {
          nodeStates.set(parent, true);
          needsRefresh = true;
        }

        parent = parent.parent;
      }

      if (needsRefresh) refreshUI();

      outliner.setValue(object.id);
    } else {
      outliner.setValue(null);
    }
  });

  return container;
}

export { SidebarScene };
