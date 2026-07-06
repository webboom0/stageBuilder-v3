import { UITabbedPanel, UISpan } from "./libs/ui.js";

import { SidebarScene } from "./Sidebar.Scene.js";
import { SidebarProperties } from "./Sidebar.Properties.js";
import { SidebarProject } from "./Sidebar.Project.js";
import { SidebarPanelScene } from "./Sidebar.PanelScene.js";
import { SidebarStageSelector } from "./Sidebar.StageSelector.js";
import { SidebarNanseol } from "./Sidebar.Nanseol.js";
import { SidebarLight } from "./Sidebar.Light.js";
import { SidebarAssets } from "./SidebarAssets.js";
import { createShowControlSection } from "./panels/ShowControlPanel.js";

import { createPanel } from "./ui/floatPanel.js";
import { createPanelRail } from "./ui/PanelRail.js";

function Sidebar(editor) {
  const root = editor.tabRoot || document.querySelector(".editorTab.active");
  if (!root) {
    console.warn("Sidebar: tab root not found");
    return new UITabbedPanel();
  }

  const container = new UITabbedPanel();
  container.setId("sidebar");

  new SidebarProject(editor);

  const sidebarLight = new SidebarLight(editor);
  const sidebarAssets = new SidebarAssets(editor);

  const scene = new UISpan().add(new SidebarScene(editor));
  container.addTab("scene", "Scene", scene);
  container.addTab("light", "Light", sidebarLight);
  container.select("scene");

  const leftRail = createPanelRail(root, { side: "left", distribution: "resizable" });
  const rightRail = createPanelRail(root, { side: "right", distribution: "equal" });

  const scenePanel = createPanel("Scene", new SidebarPanelScene(editor).dom);
  scenePanel.classList.add("floating-panel-scene-fixed");
  scenePanel.style.overflow = "auto";

  const stagePanel = createPanel("무대", new SidebarStageSelector(editor).dom);
  const nanseolPanel = createPanel("무대연출", new SidebarNanseol(editor).dom);
  const propertiesPanel = createPanel(
    "Properties",
    (() => {
      const body = document.createElement("div");
      body.className = "sb-properties-body";
      body.appendChild(new SidebarProperties(editor).dom);
      return body;
    })(),
  );
  propertiesPanel.classList.add("sb-properties-panel");

  const propertiesEmpty = document.createElement("div");
  propertiesEmpty.className = "sb-properties-empty";
  propertiesEmpty.textContent = "씬에서 객체를 선택하세요";
  const propertiesBody = propertiesPanel.querySelector(".sb-properties-body");
  if (propertiesBody) {
    propertiesPanel.insertBefore(propertiesEmpty, propertiesBody);
  } else {
    propertiesPanel.appendChild(propertiesEmpty);
  }

  const syncPropertiesPanel = (object) => {
    const body = propertiesPanel.querySelector(".sb-properties-body");
    const hasSelection = object !== null;
    if (body) body.hidden = !hasSelection;
    propertiesEmpty.hidden = hasSelection;
    propertiesPanel.classList.toggle("sb-properties-no-selection", !hasSelection);
  };
  editor.signals.objectSelected.add(syncPropertiesPanel);
  syncPropertiesPanel(editor.selected);

  const kfHost = document.createElement("div");
  kfHost.id = "keyframe-property-panel";
  kfHost.className = "sb-kf-panel-host";
  kfHost.hidden = true;
  propertiesPanel.appendChild(kfHost);

  const scGroupsPanel = createPanel("그룹 / Ensemble", createShowControlSection(editor, "groups"));
  const scMaPanel = createPanel("조명", createShowControlSection(editor, "ma"));

  const assetPanels = sidebarAssets.panels || {};

  leftRail.registerPanel({
    id: "assets",
    icon: "fas fa-folder-open",
    label: "Assets (Motion / Video / Audio + 목록)",
    panelEl: assetPanels.assets,
    defaultOpen: true,
  });

  leftRail.registerPanel({
    id: "mesh",
    icon: "fas fa-cube",
    label: "Mesh",
    panelEl: assetPanels.mesh,
  });

  leftRail.registerPanel({
    id: "scene",
    icon: "fas fa-sitemap",
    label: "Scene",
    panelEl: scenePanel,
  });

  leftRail.registerPanel({
    id: "stage",
    icon: "fas fa-theater-masks",
    label: "무대",
    panelEl: stagePanel,
  });

  leftRail.registerPanel({
    id: "nanseol",
    icon: "fas fa-magic",
    label: "무대연출",
    panelEl: nanseolPanel,
  });

  rightRail.registerPanel({
    id: "properties",
    icon: "fas fa-sliders-h",
    label: "Properties (객체 속성)",
    panelEl: propertiesPanel,
    defaultOpen: true,
  });

  rightRail.registerPanel({
    id: "sc-groups",
    icon: "fas fa-users",
    label: "그룹 / Ensemble",
    panelEl: scGroupsPanel,
  });

  rightRail.registerPanel({
    id: "sc-ma",
    icon: "fas fa-lightbulb",
    label: "조명",
    panelEl: scMaPanel,
  });

  requestAnimationFrame(() => rightRail.rebalanceHeights?.());

  return container;
}

export { Sidebar };
