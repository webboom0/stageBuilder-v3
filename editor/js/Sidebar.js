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
import { createRightPanelRail } from "./ui/RightPanelRail.js";
import { createLeftPanelRail } from "./ui/LeftPanelRail.js";

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

  const leftRail = createLeftPanelRail(root);
  const rightRail = createRightPanelRail(root);

  const scenePanel = createPanel("Scene", new SidebarPanelScene(editor).dom);
  scenePanel.classList.add("floating-panel-scene-fixed");
  scenePanel.style.overflow = "auto";

  const stagePanel = createPanel("무대", new SidebarStageSelector(editor).dom);
  const nanseolPanel = createPanel("무대연출", new SidebarNanseol(editor).dom);
  const propertiesPanel = createPanel(
    "Properties",
    new SidebarProperties(editor).dom,
  );
  propertiesPanel.classList.add("sb-properties-panel");

  const scCuesPanel = createPanel("QLab · Cues", createShowControlSection(editor, "cues"));
  const scGroupsPanel = createPanel("QLab · Groups", createShowControlSection(editor, "groups"));
  const scTargetsPanel = createPanel("QLab · Targets", createShowControlSection(editor, "targets"));
  const scMaPanel = createPanel("MA Lighting", createShowControlSection(editor, "ma"));

  leftRail.registerPanel({
    id: "properties",
    icon: "fas fa-sliders-h",
    label: "Properties (객체 속성)",
    panelEl: propertiesPanel,
    defaultOpen: true,
  });

  leftRail.registerPanel({
    id: "sc-cues",
    icon: "fas fa-play",
    label: "QLab · 큐 스택",
    panelEl: scCuesPanel,
  });

  leftRail.registerPanel({
    id: "sc-groups",
    icon: "fas fa-users",
    label: "QLab · 그룹 / Ensemble",
    panelEl: scGroupsPanel,
  });

  leftRail.registerPanel({
    id: "sc-targets",
    icon: "fas fa-crosshairs",
    label: "QLab · Control Targets",
    panelEl: scTargetsPanel,
  });

  leftRail.registerPanel({
    id: "sc-ma",
    icon: "fas fa-lightbulb",
    label: "grandMA · 조명",
    panelEl: scMaPanel,
  });

  const assetPanels = sidebarAssets.panels || {};

  rightRail.registerPanel({
    id: "assets",
    icon: "fas fa-folder-open",
    label: "Assets (Motion / Video / Audio + 목록)",
    panelEl: assetPanels.assets,
    defaultOpen: true,
  });

  rightRail.registerPanel({
    id: "mesh",
    icon: "fas fa-cube",
    label: "Mesh",
    panelEl: assetPanels.mesh,
  });

  rightRail.registerPanel({
    id: "scene",
    icon: "fas fa-sitemap",
    label: "Scene",
    panelEl: scenePanel,
  });

  rightRail.registerPanel({
    id: "stage",
    icon: "fas fa-theater-masks",
    label: "무대",
    panelEl: stagePanel,
  });

  rightRail.registerPanel({
    id: "nanseol",
    icon: "fas fa-magic",
    label: "무대연출",
    panelEl: nanseolPanel,
  });

  requestAnimationFrame(() => leftRail.rebalanceHeights?.());

  return container;
}

export { Sidebar };
