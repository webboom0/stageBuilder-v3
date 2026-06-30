import { UIPanel, UIRow, UIBreak, UIText } from "./libs/ui.js";

/** 무대 선택 전용 패널 (프로시니엄 / 아레나) */
function SidebarStageSelector(editor) {
  const container = new UIPanel();
  container.setBorderTop("0");

  const stageRow = new UIRow();
  stageRow.setClass("stage-selector");

  const stageLabel = new UIText("무대").setClass("Label");
  stageRow.add(stageLabel);
  stageRow.add(new UIBreak());

  const stageButtonsContainer = document.createElement("div");
  stageButtonsContainer.className = "stage-buttons-container";

  const prosceniumButton = document.createElement("button");
  prosceniumButton.className = "stage-button sb-dock-btn sb-dock-btn--tile active";
  prosceniumButton.dataset.stage = "proscenium";
  prosceniumButton.innerHTML = `
    <i class="ri-building-2-line"></i>
    <span>프로시니엄</span>
  `;

  const arenaButton = document.createElement("button");
  arenaButton.className = "stage-button sb-dock-btn sb-dock-btn--tile";
  arenaButton.dataset.stage = "arena";
  arenaButton.innerHTML = `
    <i class="ri-community-line"></i>
    <span>아레나</span>
  `;

  stageButtonsContainer.appendChild(prosceniumButton);
  stageButtonsContainer.appendChild(arenaButton);

  stageRow.dom.appendChild(stageButtonsContainer);
  container.add(stageRow);

  function onStageButtonClick(e) {
    const button = e.currentTarget;
    const selectedStage = button.dataset.stage;

    prosceniumButton.classList.toggle("active", selectedStage === "proscenium");
    arenaButton.classList.toggle("active", selectedStage === "arena");

    onStageChanged(selectedStage);
  }

  prosceniumButton.addEventListener("click", onStageButtonClick);
  arenaButton.addEventListener("click", onStageButtonClick);

  function onStageChanged(selectedStage) {
    const stageFiles = {
      proscenium: "../files/stage/background.fbx",
      arena: "../files/stage/arena_stage.fbx",
    };

    const stageFile = stageFiles[selectedStage];

    if (editor.videoEdit && editor.videoEdit.background) {
      editor.videoEdit.background.changeStage(selectedStage, stageFile);
      editor.scene.userData.stageType = selectedStage;
    }
  }

  function updateStageButtons(stageType) {
    prosceniumButton.classList.toggle("active", stageType === "proscenium");
    arenaButton.classList.toggle("active", stageType === "arena");
  }

  function refreshUI() {
    const stageType = editor.scene.userData.stageType || "proscenium";
    updateStageButtons(stageType);
  }

  editor.signals.editorCleared.add(refreshUI);
  editor.signals.sceneGraphChanged.add(refreshUI);
  refreshUI();

  return container;
}

export { SidebarStageSelector };
