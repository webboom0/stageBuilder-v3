import { UITabbedPanel, UISpan } from "./libs/ui.js";

import { SidebarScene } from "./Sidebar.Scene.js";
import { SidebarProperties } from "./Sidebar.Properties.js";
import { SidebarProject } from "./Sidebar.Project.js";
import { SidebarPanelScene } from "./Sidebar.PanelScene.js";
import { SidebarStageSelector } from "./Sidebar.StageSelector.js";
import { SidebarNanseol } from "./Sidebar.Nanseol.js";
import { SidebarLight } from "./Sidebar.Light.js";
import { SidebarAssets } from "./SidebarAssets.js";

import { createPanel } from "./ui/floatPanel.js";
import { createRightPanelRail } from "./ui/RightPanelRail.js";

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

  const leftPropertiesHost = root.querySelector("#sidebar-properties-host");
  const rail = createRightPanelRail(root);

  const scenePanel = createPanel("Scene", new SidebarPanelScene(editor).dom);
  scenePanel.classList.add("floating-panel-scene-fixed");
  scenePanel.style.overflow = "auto";

  const stagePanel = createPanel("무대", new SidebarStageSelector(editor).dom);
  const nanseolPanel = createPanel("무대연출", new SidebarNanseol(editor).dom);
  const propertiesPanel = createPanel(
    "Object",
    new SidebarProperties(editor).dom,
  );
  propertiesPanel.classList.add("sb-properties-panel");

  if (leftPropertiesHost) {
    leftPropertiesHost.appendChild(propertiesPanel);
  }

  const assetPanels = sidebarAssets.panels || {};

  rail.registerPanel({
    id: "assets",
    icon: "fas fa-folder-open",
    label: "Assets (Motion / Video / Audio + 목록)",
    panelEl: assetPanels.assets,
    defaultOpen: true,
  });

  rail.registerPanel({
    id: "mesh",
    icon: "fas fa-cube",
    label: "Mesh",
    panelEl: assetPanels.mesh,
  });

  rail.registerPanel({
    id: "scene",
    icon: "fas fa-sitemap",
    label: "Scene",
    panelEl: scenePanel,
  });

  rail.registerPanel({
    id: "stage",
    icon: "fas fa-theater-masks",
    label: "무대",
    panelEl: stagePanel,
  });

  rail.registerPanel({
    id: "nanseol",
    icon: "fas fa-magic",
    label: "무대연출",
    panelEl: nanseolPanel,
  });

  return container;
}

export { Sidebar };
