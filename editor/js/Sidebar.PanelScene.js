import { UITabbedPanel } from "./libs/ui.js";

import { SidebarScene } from "./Sidebar.Scene.js";
import { SidebarLight } from "./Sidebar.Light.js";

function SidebarPanelScene(editor) {
    const strings = editor.strings;

    const container = new UITabbedPanel();
    container.setId("scene");

    container.addTab(
        "sceneTab",
        "Scene",
        new SidebarScene(editor),
    );
    container.addTab(
        "lightTab",
        "Light",
        new SidebarLight(editor),
    );

    container.select("sceneTab");

    function getTabByTabId(tabs, tabId) {
        return tabs.find(function (tab) {
            return tab.dom.id === tabId;
        });
    }

    const sceneTab = getTabByTabId(container.tabs, "sceneTab");
    const lightTab = getTabByTabId(container.tabs, "lightTab");

    function toggleTabs(object) {
        // container.setHidden(object === null);

        // if (object === null) return;

        // sceneTab.setHidden(!object.scene);

        // lightTab.setHidden(!object.light);

        // set active tab

        if (container.selected === "sceneTab") {
            container.select(sceneTab.isHidden() ? "lightTab" : "sceneTab");
        } else if (container.selected === "lightTab") {
            container.select(lightTab.isHidden() ? "sceneTab" : "lightTab");
        }
    }

    editor.signals.objectSelected.add(toggleTabs);

    toggleTabs(editor.selected);

    return container;
}

export { SidebarPanelScene };
