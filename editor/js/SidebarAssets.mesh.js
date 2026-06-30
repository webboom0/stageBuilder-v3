import * as THREE from "three";
import { UIButton } from "./libs/ui.js";
import { AddObjectCommand } from "./commands/AddObjectCommand.js";
import { getNextNumberedObjectName } from "./utils/uniqueNumberedName.js";

export function createMeshPanel(editor) {
  const meshPanel = document.createElement("div");
  meshPanel.className = "mesh-panel";

  const panelContent = document.createElement("div");
  panelContent.className = "panel-content";

  // 버튼 그리드 컨테이너 (직육면체, 원통)
  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "mesh-buttons-container";

  // 직육면체 (Box) 버튼
  const boxBtn = new UIButton("");
  boxBtn.setInnerHTML("<i class='fas fa-cube'></i> 직육면체");
  boxBtn.dom.classList.add("mesh-add-btn", "sb-dock-btn", "sb-dock-btn--tile");
  boxBtn.onClick(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = getNextNumberedObjectName(editor.scene, "Box");
    mesh.scale.set(20, 20, 20);
    mesh.position.set(0, 0, 0);
    mesh.userData.source = "mesh";
    editor.execute(new AddObjectCommand(editor, mesh));
  });
  buttonsContainer.appendChild(boxBtn.dom);

  // 원통 (Cylinder) 버튼
  const cylinderBtn = new UIButton("");
  cylinderBtn.setInnerHTML("<i class='fas fa-database'></i> 원통");
  cylinderBtn.dom.classList.add("mesh-add-btn", "sb-dock-btn", "sb-dock-btn--tile");
  cylinderBtn.onClick(() => {
    const geometry = new THREE.CylinderGeometry(
      1,
      1,
      1,
      32,
      1,
      false,
      0,
      Math.PI * 2
    );
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = getNextNumberedObjectName(editor.scene, "Cylinder");
    mesh.scale.set(12, 12, 12);
    mesh.position.set(0, 0, 0);
    mesh.userData.source = "mesh";
    editor.execute(new AddObjectCommand(editor, mesh));
  });
  buttonsContainer.appendChild(cylinderBtn.dom);

  panelContent.appendChild(buttonsContainer);
  meshPanel.appendChild(panelContent);

  return meshPanel;
}
