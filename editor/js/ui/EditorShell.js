import { createPanelRail } from './PanelRail.js';
import { createDockPanel } from './floatPanel.js';
import { createProjectPanelBody } from './project/ProjectPanel.js';
import { createStagePanelBody } from './StagePanel.js';
import { createAssetsPanelBody } from './AssetsPanel.js';
import { createGroupsPanelBody } from './GroupsPanel.js';
import { createMotionTemplatesPanelBody } from './MotionTemplatesPanel.js';
import { createPositionPresetsPanelBody } from './PositionPresetsPanel.js';
import { createLightingPanelBody } from './LightingPanel.js';
import { createKeyframePropertiesPanel } from './KeyframePropertiesPanel.js';
import { mountViewportToolbar } from './ViewportToolbar.js';
import { mountMenubar } from './menubar/Menubar.js';
import { mountViewportMenubarControls } from './menubar/ViewportMenubarControls.js';
import {
  toggleStageFocus,
  onStageFocusChange,
  isStageFocusActive,
} from './stageFocusMode.js';

/**
 * @param {HTMLElement} root — .wrapper
 * @param {{
 *   stageManager: import('../domain/stage/StageManager.js').StageManager,
 *   helpers: import('../domain/stage/StageViewportHelpers.js').StageViewportHelpers,
 *   engine?: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   groupStore?: import('../domain/motion/MotionGroupStore.js').MotionGroupStore,
 *   onCameraPreset: (id: import('../domain/stage/CameraPresets.js').CameraPresetId) => void,
 *   onZoom?: (delta: number) => void,
 *   onMenuAction?: (action: string) => void,
 *   onStageTypeChange: (type: import('../domain/stage/StageTypes.js').StageTypeId) => Promise<void>,
 *   onApplyProfile: (widthM: number, depthM: number) => void | Promise<void>,
 *   onChange?: () => void,
 *   onStageFocusChange?: (active: boolean) => void,
 *   onBuildingLockToggle?: () => boolean,
 *   onAddCharacter?: (entry: { url: string, name: string, procedural?: string, color?: number }) => void | Promise<void>,
 *   onAddProp?: (entry: { url: string, name: string, procedural?: string, color?: number }) => void | Promise<void>,
 *   onAddVideo?: (entry: { url: string, name: string, filename?: string }) => void | Promise<void>,
 *   onAddAudio?: (entry: { url: string, path: string, name: string, filename?: string }) => void | Promise<void>,
 *   onRemoveVideo?: () => void | Promise<void>,
 *   onDeployGroup?: (groupId: string) => void | Promise<void>,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   motionTemplateStore?: import('../domain/motion/MotionTemplateStore.js').MotionTemplateStore | null,
 *   motion?: import('../domain/motion/MotionDirector.js').MotionDirector,
 *   onSaveMotionTemplate?: () => void | Promise<void>,
 *   onApplyMotionTemplate?: (result: { motions: number }) => void,
 *   applyMotionTemplate?: (
 *     motionId: string,
 *     templateId: string,
 *     pose: { fromX: number, fromZ: number, fromRotY?: number, startTime?: number },
 *   ) => boolean | Promise<boolean>,
 *   onGroupRename?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupColor?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onKeyframeEdited?: () => void,
 *   onRenameMotion?: (motionId: string, name: string) => boolean | void,
 *   getMotion?: (trackId: string) => import('../domain/motion/MotionDirector.js').MotionItem | null,
 *   getLight?: (trackId: string) => {
 *     kind?: 'house' | 'fixture',
 *     channel?: string,
 *     fid?: number,
 *     trackId: string,
 *     name: string,
 *   } | null,
 *   onWriteLight?: (trackId: string, patch: Record<string, number | string>) => void,
 *   light?: import('../domain/lighting/LightDirector.js').LightDirector,
 *   fixtures?: import('../domain/lighting/FixtureDirector.js').FixtureDirector,
 *   onStagePick?: (motionId: string) => void,
 *   onPickAnimPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     motionId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   onApplyMotionAnim?: (motionId: string) => void | Promise<void>,
 *   onTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => void,
 *   onTransformSpace?: (local: boolean) => void,
 *   getProjectId?: () => string | null,
 *   getProjectStore?: () => import('../domain/project/ProjectStore.js').ProjectStore | null,
 *   onSwitchScene?: (sceneId: string) => void | Promise<void>,
 *   onAddScene?: () => void | Promise<void>,
 *   onRenameScene?: (sceneId: string, name: string) => void | Promise<void>,
 *   onDuplicateScene?: (sceneId: string) => void | Promise<void>,
 *   onDeleteScene?: (sceneId: string) => void | Promise<void>,
 *   onReorderScene?: (sceneId: string, direction: 'up' | 'down') => void | Promise<void>,
 *   onSaveProject?: () => void | Promise<void>,
 *   onUpdateProjectMeta?: (meta: object) => void | Promise<void>,
 * }} ctx
 */
export function mountEditorShell(root, ctx) {
  const leftRail = createPanelRail(root, { side: 'left', distribution: 'resizable', collapseMode: true });
  const rightRail = createPanelRail(root, { side: 'right', distribution: 'resizable', collapseMode: true });

  let projectPanelUi = null;
  if (ctx.getProjectStore) {
    projectPanelUi = createProjectPanelBody({
      getStore: () => ctx.getProjectStore?.() ?? null,
      onSwitchScene: (sceneId) => ctx.onSwitchScene?.(sceneId),
      onAddScene: () => ctx.onAddScene?.(),
      onRenameScene: (sceneId, name) => ctx.onRenameScene?.(sceneId, name),
      onDuplicateScene: (sceneId) => ctx.onDuplicateScene?.(sceneId),
      onDeleteScene: (sceneId) => ctx.onDeleteScene?.(sceneId),
      onReorderScene: (sceneId, direction) => ctx.onReorderScene?.(sceneId, direction),
      onSave: () => ctx.onSaveProject?.(),
      onUpdateMeta: (meta) => ctx.onUpdateProjectMeta?.(meta),
    });
    const projectPanel = createDockPanel('프로젝트', projectPanelUi.root, {
      storageKey: 'dock-project',
      defaultHeight: 260,
      minHeight: 180,
      dataScope: 'project',
      titleHelp: '<strong>프로젝트 공통</strong> — 공연 정보·씬 목록. 씬을 바꿔도 프로젝트 자체는 같습니다.',
    });
    leftRail.registerPanel({
      id: 'project',
      icon: 'fas fa-film',
      label: '프로젝트',
      panelEl: projectPanel.el,
      panelApi: projectPanel,
      defaultOpen: true,
    });
  }

  const stageUi = createStagePanelBody({
    stageManager: ctx.stageManager,
    onStageTypeChange: ctx.onStageTypeChange,
    onApplyProfile: ctx.onApplyProfile,
    onChange: ctx.onChange,
  });

  const stagePanel = createDockPanel('무대', stageUi.root, {
    storageKey: 'dock-stage-무대',
    defaultHeight: 300,
    dataScope: 'scene',
    titleHelp: '<strong>씬 전용</strong> — 무대 타입·규격은 지금 씬에 저장됩니다.',
  });

  leftRail.registerPanel({
    id: 'stage',
    icon: 'fas fa-theater-masks',
    label: '무대',
    panelEl: stagePanel.el,
    panelApi: stagePanel,
    defaultOpen: true,
  });

  let groupsUi = null;
  let motionTemplatesUi = null;
  let positionPresetsUi = null;

  const assetsUi = createAssetsPanelBody({
    getProjectId: () => ctx.getProjectId?.() ?? null,
    onAddCharacter: (entry) => ctx.onAddCharacter?.(entry),
    onAddProp: (entry) => ctx.onAddProp?.(entry),
    onAddVideo: (entry) => ctx.onAddVideo?.(entry),
    onAddAudio: (entry) => ctx.onAddAudio?.(entry),
    onRemoveVideo: () => ctx.onRemoveVideo?.(),
    onCatalogChanged: () => {
      groupsUi?.refreshCatalog?.();
    },
  });
  const assetsPanel = createDockPanel('Assets', assetsUi.root, {
    storageKey: 'dock-assets',
    defaultHeight: 320,
    dataScope: 'project',
    titleHelp:
      '<strong>프로젝트 공통</strong> — 파일 목록은 프로젝트 폴더에 있습니다.<br>'
      + '<strong>+</strong>로 무대에 올린 객체·트랙은 <strong>현재 씬</strong>에만 남습니다.',
  });
  leftRail.registerPanel({
    id: 'assets',
    icon: 'fas fa-folder-open',
    label: 'Assets',
    panelEl: assetsPanel.el,
    panelApi: assetsPanel,
    defaultOpen: true,
  });

  let propsUi = null;
  let propsBody;
  let lightingUi = null;

  /** @type {ReturnType<typeof createDockPanel> | null} */
  let posPresetsPanel = null;
  /** @type {ReturnType<typeof createDockPanel> | null} */
  let tplPanel = null;
  /** @type {ReturnType<typeof createDockPanel> | null} */
  let propsPanel = null;
  /** @type {ReturnType<typeof createDockPanel> | null} */
  let groupsPanel = null;
  /** @type {ReturnType<typeof createDockPanel> | null} */
  let lightingPanel = null;

  if (ctx.positionPresetStore) {
    positionPresetsUi = createPositionPresetsPanelBody({
      getPresetStore: () => ctx.positionPresetStore ?? null,
      onApplyPreset: (preset) => ctx.onApplyPositionPreset?.(preset),
      onPickPoint: (onPicked, onCancelled) => ctx.onPickPoint?.(onPicked, onCancelled),
      getCaptureHint: () => ctx.getPositionPresetCaptureHint?.() ?? null,
      getSegmentStagePreview: () => ctx.segmentStagePreview ?? null,
      onPresetUpdated: (preset) => ctx.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
    });
    posPresetsPanel = createDockPanel('위치 프리셋', positionPresetsUi.root, {
      storageKey: 'dock-position-presets',
      defaultHeight: 240,
      minHeight: 120,
      dataScope: 'project',
      titleHelp:
        '<strong>프로젝트 공통</strong> — 씬을 바꿔도 등장·퇴장 지점 목록은 같습니다.<br>'
        + '칩 클릭 시 미리보기 및 <strong>선택 트랙</strong> 또는 <strong>활성 그룹</strong> 시작 위치에 적용',
    });
  }

  if (ctx.engine && ctx.motionTemplateStore) {
    motionTemplatesUi = createMotionTemplatesPanelBody({
      engine: ctx.engine,
      motion: ctx.motion,
      getTemplateStore: () => ctx.motionTemplateStore ?? null,
      getPresetStore: () => ctx.positionPresetStore ?? null,
      getSegmentStagePreview: () => ctx.segmentStagePreview ?? null,
      onPickPoint: (pick) => ctx.onPickMacroPoint?.(pick),
      onPresetUpdated: (p) => ctx.onPresetUpdated?.(p),
      onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
      onSaveTemplate: () => ctx.onSaveMotionTemplate?.(),
      onApplyTemplate: (result) => ctx.onApplyMotionTemplate?.(result),
      applyToMotion: (motionId, templateId, pose) =>
        ctx.applyMotionTemplate?.(motionId, templateId, pose) ?? false,
    });
    tplPanel = createDockPanel('패턴 라이브러리', motionTemplatesUi.root, {
      storageKey: 'dock-keyframe-macros',
      defaultHeight: 420,
      minHeight: 200,
      dataScope: 'project',
      titleHelp:
        '<strong>프로젝트 공통</strong> — 저장한 패턴은 모든 씬에서 적용할 수 있습니다.<br>'
        + 'Properties <strong>패턴</strong>은 선택 트랙 1개 편집, 여기는 <strong>여러 패턴 보관함</strong>',
    });
  }

  if (ctx.engine) {
    propsUi = createKeyframePropertiesPanel({
      engine: ctx.engine,
      stageManager: ctx.stageManager,
      getMotion: (trackId) => ctx.getMotion?.(trackId) ?? null,
      getLight: (trackId) => ctx.getLight?.(trackId) ?? null,
      onWriteLight: (trackId, patch) => ctx.onWriteLight?.(trackId, patch),
      onStagePick: (motionId) => ctx.onStagePick?.(motionId),
      onPickPoint: (onPicked) => ctx.onPickPoint?.(onPicked),
      onPickAnimPoint: (pick) => ctx.onPickAnimPoint?.(pick),
      onApplyMotionAnim: (motionId) => ctx.onApplyMotionAnim?.(motionId),
      onPresetUpdated: (preset) => ctx.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
      onRenameMotion: (motionId, name) => ctx.onRenameMotion?.(motionId, name),
      getPresetStore: () => ctx.positionPresetStore ?? null,
      getSegmentStagePreview: () => ctx.segmentStagePreview ?? null,
      onChange: () => ctx.onKeyframeEdited?.(),
      onObjectEdited: () => ctx.onKeyframeEdited?.(),
    });
    propsBody = propsUi.root;
  } else {
    propsBody = document.createElement('div');
    propsBody.className = 'sb-panel-body sb-panel-placeholder';
    propsBody.textContent = 'Properties — 객체 선택 시 편집';
  }

  propsPanel = createDockPanel('Properties', propsBody, {
    storageKey: 'dock-properties',
    defaultHeight: 780,
    minHeight: 200,
    dataScope: 'scene',
    titleHelp:
      '<strong>씬 전용</strong> — 선택한 트랙·키는 지금 씬 타임라인에 속합니다.<br>'
      + 'Character·Stage는 <strong>패턴 · 속성</strong> 탭으로 나뉩니다',
  });

  if (ctx.groupStore) {
    groupsUi = createGroupsPanelBody({
      store: ctx.groupStore,
      getProjectId: () => ctx.getProjectId?.() ?? null,
      getPresetStore: () => ctx.positionPresetStore ?? null,
      getTimelineSnapshot: () => ctx.engine?.listTracks?.().map((t) => t.snapshot()) ?? [],
      getFoldersSnapshot: () => ctx.engine?.listFolders?.().map((f) => ({ ...f })) ?? [],
      getMotionsSnapshot: () => ctx.getMotionSnapshot?.() ?? [],
      getMotionItem: (id) => ctx.motion?.get?.(id) ?? null,
      onDeploy: (groupId) => ctx.onDeployGroup?.(groupId),
      onPresetUpdated: (preset) => ctx.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
      onPickGroupPoint: (pick) => ctx.onPickGroupPoint?.(pick),
      onGroupPresetApplied: (group, preset) => ctx.onGroupPresetApplied?.(group, preset),
      getDefaultSpawn: () => ctx.getGroupDefaultSpawn?.() || { fromX: 0, fromZ: 50 },
      getSegmentStagePreview: () => ctx.segmentStagePreview ?? null,
      onGroupRename: (group) => ctx.onGroupRename?.(group),
      onGroupDelete: (groupId) => ctx.onGroupDelete?.(groupId),
      getGroupTimelineUsage: (group) => ctx.getGroupTimelineUsage?.(group) ?? { onTimeline: false, trackCount: 0 },
      onGroupColor: (group) => ctx.onGroupColor?.(group),
      onChange: () => ctx.onChange?.(),
    });
    groupsPanel = createDockPanel('그룹 / Ensemble', groupsUi.root, {
      storageKey: 'dock-groups',
      defaultHeight: 720,
      minHeight: 200,
      dataScope: 'scene',
      titleHelp:
        '<strong>씬 전용</strong> — 씬마다 그룹·멤버·애니메이션을 따로 둡니다.<br>'
        + '여러 Characters를 묶어 포메이션·키프레임을 한 번에 적용',
    });
  }

  if (ctx.engine && ctx.light && ctx.fixtures) {
    lightingUi = createLightingPanelBody({
      engine: ctx.engine,
      light: ctx.light,
      fixtures: ctx.fixtures,
      scene: ctx.stageManager?.scene,
      onChange: () => {
        ctx.onKeyframeEdited?.();
        propsUi?.sync();
      },
    });
    lightingPanel = createDockPanel('조명', lightingUi.root, {
      storageKey: 'dock-lighting',
      defaultHeight: 520,
      minHeight: 200,
      dataScope: 'scene',
      titleHelp:
        '<strong>씬 전용</strong> — HOUSE/Fixture 트랙·키는 씬마다 다릅니다.<br>'
        + '슬라이더는 <strong>라이브</strong> · 기록은 <strong>+ 키</strong>',
    });
  }

  // Right dock order: 속성 → 그룹 → 패턴 라이브러리 → 위치 프리셋 → 조명
  if (propsPanel) {
    rightRail.registerPanel({
      id: 'properties',
      icon: 'fas fa-sliders-h',
      label: '속성',
      panelEl: propsPanel.el,
      panelApi: propsPanel,
      defaultOpen: true,
    });
  }
  if (groupsPanel) {
    rightRail.registerPanel({
      id: 'sc-groups',
      icon: 'fas fa-users',
      label: '그룹',
      panelEl: groupsPanel.el,
      panelApi: groupsPanel,
      defaultOpen: true,
      startCollapsed: true,
    });
  }
  if (tplPanel) {
    rightRail.registerPanel({
      id: 'keyframe-macros',
      icon: 'fas fa-layer-group',
      label: '패턴 라이브러리',
      panelEl: tplPanel.el,
      panelApi: tplPanel,
      defaultOpen: true,
      startCollapsed: true,
    });
  }
  if (posPresetsPanel) {
    rightRail.registerPanel({
      id: 'position-presets',
      icon: 'fas fa-map-marker-alt',
      label: '위치 프리셋',
      panelEl: posPresetsPanel.el,
      panelApi: posPresetsPanel,
      defaultOpen: true,
      startCollapsed: true,
    });
  }
  if (lightingPanel) {
    rightRail.registerPanel({
      id: 'sc-lighting',
      icon: 'fas fa-lightbulb',
      label: '조명',
      panelEl: lightingPanel.el,
      panelApi: lightingPanel,
      defaultOpen: true,
      startCollapsed: true,
    });
  }

  const menubarEl = root.querySelector('#menubar');
  const viewportControlsEl = root.querySelector('#viewport-controls');

  let menubarApi = null;
  let controlsApi = null;
  let toolbarApi = null;

  const syncHelperUi = () => {
    menubarApi?.syncViewToggles();
    controlsApi?.sync();
  };

  const handleStageFocusToggle = () => toggleStageFocus();

  if (menubarEl) {
    menubarApi = mountMenubar(menubarEl, {
      helpers: ctx.helpers,
      onCameraPreset: ctx.onCameraPreset,
      onMenuAction: (action) => ctx.onMenuAction?.(action),
      onHelpersChanged: syncHelperUi,
      onStageFocusToggle: handleStageFocusToggle,
      getMultiViewEnabled: ctx.getMultiViewEnabled,
    });
  }

  if (viewportControlsEl) {
    controlsApi = mountViewportMenubarControls(viewportControlsEl, {
      helpers: ctx.helpers,
      onChange: syncHelperUi,
      onMultiViewToggle: (on) => ctx.onMultiViewToggle?.(on),
      getMultiViewEnabled: () => ctx.getMultiViewEnabled?.() ?? false,
    });
  }

  const toolbarEl = root.querySelector('#toolbar');
  if (toolbarEl) {
    toolbarApi = mountViewportToolbar(toolbarEl, {
      onCameraPreset: ctx.onCameraPreset,
      onZoom: ctx.onZoom,
      onStageFocusToggle: handleStageFocusToggle,
      onBuildingLockToggle: ctx.onBuildingLockToggle,
      onStructureXRayToggle: ctx.onStructureXRayToggle,
      getStructureXRayEnabled: () => ctx.getStructureXRayEnabled?.() ?? false,
      onTransformMode: (mode) => ctx.onTransformMode?.(mode),
      onMultiViewToggle: () => ctx.onMultiViewToggle?.(),
      getMultiViewEnabled: () => ctx.getMultiViewEnabled?.() ?? false,
    });
    const localCb = toolbarEl.querySelector('#sb-toolbar-local');
    localCb?.addEventListener('change', () => {
      ctx.onTransformSpace?.(!!/** @type {HTMLInputElement} */ (localCb).checked);
    });
  }

  onStageFocusChange((active) => {
    toolbarApi?.setStageFocusActive(active);
    ctx.onStageFocusChange?.(active);
  });
  toolbarApi?.setStageFocusActive(isStageFocusActive());

  return {
    syncStagePanel: () => stageUi.syncFromManager(),
    setStageBusy: (busy) => stageUi.setBusy(busy),
    /** @param {{ label?: string } | null} scale */
    setGridScaleLabel: (scale) => controlsApi?.setScaleLabel(scale),
    syncHelperUi,
    syncMultiViewUi: () => {
      controlsApi?.syncMultiView?.();
      toolbarApi?.setMultiViewActive?.(!!ctx.getMultiViewEnabled?.());
    },
    /** @param {boolean} on */
    setStructureXRayActive: (on) => toolbarApi?.setStructureXRayActive?.(on),
    clearAssetsStale: () => assetsUi.clearStale?.(),
    refreshAssets: () => {
      assetsUi.clearStale?.();
      return assetsUi.refresh();
    },
    setActiveVideo: (key) => assetsUi.setActiveVideo?.(key),
    syncKeyframeProps: () => propsUi?.sync(),
    syncLightingPanel: () => lightingUi?.sync(),
    refreshGroups: () => groupsUi?.render(),
    refreshMotionTemplates: () => motionTemplatesUi?.render(),
    /** @param {string} id */
    selectPatternLibraryEntry: (id) => motionTemplatesUi?.selectPattern?.(id),
    openPatternLibraryPanel: () => rightRail.openPanel('keyframe-macros'),
    openPositionPresetsPanel: () => rightRail.openPanel('position-presets'),
    refreshPositionPresets: () => positionPresetsUi?.render(),
    refreshGroupsCatalog: () => groupsUi?.refreshCatalog?.(),
    refreshProjectPanel: () => projectPanelUi?.render(),
    openProjectPanel: () => leftRail.openPanel('project'),
    openAssetsPanel: () => leftRail.openPanel('assets'),
    /** @param {'character' | 'stage' | 'video' | 'audio'} tab */
    focusAssetsTab: (tab) => assetsUi.focusTab(tab),
    /** @param {'character' | 'stage' | 'video' | 'audio'} tab @param {{ elevated?: boolean, hintFilename?: string }} [dialogOpts] */
    assetsPickUpload: (tab) => assetsUi.pickUpload(tab),
    /** @param {'character' | 'stage' | 'video' | 'audio'} tab @param {{ elevated?: boolean, hintFilename?: string }} [dialogOpts] */
    assetsPickLibrary: (tab, dialogOpts) => assetsUi.pickLibrary(tab, dialogOpts),
    setProjectPanelSaving: (busy) => projectPanelUi?.setSaving?.(busy),
  };
}
