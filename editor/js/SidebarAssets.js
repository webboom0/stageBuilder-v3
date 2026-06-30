import { UITabbedPanel, UISpan, UIDiv, UIButton, UIInteger, UIBreak, UIText, UISelect } from "./libs/ui.js";
import { createPanel } from './ui/floatPanel.js';
import { createAudioPanel } from './SidebarAssets.audio.js';
import { createMotionPanel } from './SidebarAssets.motion.js';
import { createVideoPanel } from './SidebarAssets.video.js';
import { createMeshPanel } from './SidebarAssets.mesh.js';
import { SidebarSceneMotion } from './Sidebar.SceneMotion.js';
import { SidebarSceneAudio } from './Sidebar.SceneAudio.js';
import { SidebarSceneMesh } from './Sidebar.SceneMesh.js';

function SidebarAssets(editor) {
  const container = new UIDiv();
  container.setId("sidebar-assets");
  container.setClass("sidebar-panel");

  // Assets 패널 헤더
  const header = new UIDiv();
  header.setClass("panel-header");
  header.add(new UIText("Assets"));

  // Assets 컨텐츠 영역
  const content = new UIDiv();
  content.setClass("panel-content");

  // 🎵 오디오 패널 생성
  const audioPanel = createAudioPanel(editor);

  // 🎬 모션 패널 생성
  const motionPanel = createMotionPanel(editor);

  // Mesh 패널 생성 (직육면체, 원통 등 스테이지에 추가)
  const meshPanel = createMeshPanel(editor);

  // Video 패널 추가
  const videoPanel = createVideoPanel(editor);

  // Motion + 비디오 + 오디오를 한 패널에서 탭으로 전환 (Motion이 첫 번째)
  const mediaTabbedWrapper = document.createElement('div');
  mediaTabbedWrapper.className = 'TabbedPanel media-tabbed-panel';

  const mediaTabsDiv = document.createElement('div');
  mediaTabsDiv.className = 'Tabs';

  const tabMotion = document.createElement('div');
  tabMotion.className = 'Tab selected';
  tabMotion.id = 'media-tab-motion';
  tabMotion.textContent = 'Motion';
  const tabVideo = document.createElement('div');
  tabVideo.className = 'Tab';
  tabVideo.id = 'media-tab-video';
  tabVideo.textContent = 'Video';
  const tabAudio = document.createElement('div');
  tabAudio.className = 'Tab';
  tabAudio.id = 'media-tab-audio';
  tabAudio.textContent = 'Audio';

  mediaTabsDiv.appendChild(tabMotion);
  mediaTabsDiv.appendChild(tabVideo);
  mediaTabsDiv.appendChild(tabAudio);

  const mediaPanelsDiv = document.createElement('div');
  mediaPanelsDiv.className = 'Panels';

  const motionPanelWrap = document.createElement('div');
  motionPanelWrap.id = 'media-panel-motion';
  motionPanelWrap.style.display = '';
  motionPanelWrap.appendChild(motionPanel);

  const videoPanelWrap = document.createElement('div');
  videoPanelWrap.id = 'media-panel-video';
  videoPanelWrap.style.display = 'none';
  videoPanelWrap.appendChild(videoPanel);

  const audioPanelWrap = document.createElement('div');
  audioPanelWrap.id = 'media-panel-audio';
  audioPanelWrap.style.display = 'none';
  audioPanelWrap.appendChild(audioPanel);

  mediaPanelsDiv.appendChild(motionPanelWrap);
  mediaPanelsDiv.appendChild(videoPanelWrap);
  mediaPanelsDiv.appendChild(audioPanelWrap);

  mediaTabbedWrapper.appendChild(mediaTabsDiv);
  mediaTabbedWrapper.appendChild(mediaPanelsDiv);

  function selectMediaTab(id) {
    const isMotion = id === 'media-tab-motion';
    const isVideo = id === 'media-tab-video';
    const isAudio = id === 'media-tab-audio';
    tabMotion.classList.toggle('selected', isMotion);
    tabVideo.classList.toggle('selected', isVideo);
    tabAudio.classList.toggle('selected', isAudio);
    motionPanelWrap.style.display = isMotion ? '' : 'none';
    videoPanelWrap.style.display = isVideo ? '' : 'none';
    audioPanelWrap.style.display = isAudio ? '' : 'none';
  }
  tabMotion.addEventListener('click', () => selectMediaTab('media-tab-motion'));
  tabVideo.addEventListener('click', () => selectMediaTab('media-tab-video'));
  tabAudio.addEventListener('click', () => selectMediaTab('media-tab-audio'));

  // CSS — 레이아웃만 (색상·타이포는 premiere-workspace.css .sb-right-dock)
  const style = document.createElement('style');
  style.textContent = `
    .media-tabbed-panel .Tabs, .list-tabbed-panel .Tabs {
      display: flex !important;
      width: 100%;
    }
    .media-tabbed-panel .Tabs .Tab,
    .list-tabbed-panel .Tabs .Tab {
      flex: 1;
      text-align: center;
      cursor: pointer;
      box-sizing: border-box;
    }
    .media-tabbed-panel .Panels,
    .list-tabbed-panel .Panels {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .media-tabbed-panel .Panels > div,
    .list-tabbed-panel .Panels > div {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .mesh-buttons-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 8px;
    }
    .floating-panel .Text {
      display: none !important;
    }
  `;
  document.head.appendChild(style);



  // Mesh 패널을 floatPanel로 생성 (직육면체, 원통 등 추가 버튼)
  const meshFloatPanel = createPanel('Mesh', meshPanel);

  // Motion + Video + Audio 탭 패널을 floatPanel로 생성 (Motion 첫 번째)
  const mediaFloatPanel = createPanel('Assets', mediaTabbedWrapper);

  // Motion / Audio 탭으로 씬 목록 패널 (Motion 목록 + Audio 목록)
  const listTabbedWrapper = document.createElement('div');
  listTabbedWrapper.className = 'TabbedPanel list-tabbed-panel';

  const listTabsDiv = document.createElement('div');
  listTabsDiv.className = 'Tabs';

  const listTabMotion = document.createElement('div');
  listTabMotion.className = 'Tab selected';
  listTabMotion.id = 'list-tab-motion';
  listTabMotion.textContent = 'Motion';
  const listTabAudio = document.createElement('div');
  listTabAudio.className = 'Tab';
  listTabAudio.id = 'list-tab-audio';
  listTabAudio.textContent = 'Audio';

  listTabsDiv.appendChild(listTabMotion);
  listTabsDiv.appendChild(listTabAudio);

  const listPanelsDiv = document.createElement('div');
  listPanelsDiv.className = 'Panels';

  const motionListWrap = document.createElement('div');
  motionListWrap.id = 'list-panel-motion';
  motionListWrap.style.display = '';
  motionListWrap.appendChild(new SidebarSceneMotion(editor).dom);

  const audioListWrap = document.createElement('div');
  audioListWrap.id = 'list-panel-audio';
  audioListWrap.style.display = 'none';
  audioListWrap.appendChild(new SidebarSceneAudio(editor).dom);

  listPanelsDiv.appendChild(motionListWrap);
  listPanelsDiv.appendChild(audioListWrap);

  listTabbedWrapper.appendChild(listTabsDiv);
  listTabbedWrapper.appendChild(listPanelsDiv);

  function selectListTab(id) {
    const isMotion = id === 'list-tab-motion';
    const isAudio = id === 'list-tab-audio';
    listTabMotion.classList.toggle('selected', isMotion);
    listTabAudio.classList.toggle('selected', isAudio);
    motionListWrap.style.display = isMotion ? '' : 'none';
    audioListWrap.style.display = isAudio ? '' : 'none';
  }
  listTabMotion.addEventListener('click', () => selectListTab('list-tab-motion'));
  listTabAudio.addEventListener('click', () => selectListTab('list-tab-audio'));

  const motionAudioListPanel = createPanel('Motion / Audio 목록', listTabbedWrapper);
  const meshScenePanel = createPanel('Mesh 목록', new SidebarSceneMesh(editor).dom);

  const assetsBundle = document.createElement('div');
  assetsBundle.className = 'sb-assets-bundle';
  assetsBundle.appendChild(mediaFloatPanel);
  assetsBundle.appendChild(motionAudioListPanel);

  const meshBundle = document.createElement('div');
  meshBundle.className = 'sb-mesh-bundle';
  meshBundle.appendChild(meshFloatPanel);
  meshBundle.appendChild(meshScenePanel);

  return {
    dom: container,
    panels: {
      assets: assetsBundle,
      sceneList: motionAudioListPanel,
      mesh: meshBundle,
    },
  };
}

export { SidebarAssets };