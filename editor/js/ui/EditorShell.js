import { createPanelRail } from './PanelRail.js';
import { createDockPanel } from './floatPanel.js';
import { createProjectPanelBody } from './project/ProjectPanel.js';
import { createStagePanelBody } from './StagePanel.js';
import { createAssetsPanelBody } from './AssetsPanel.js';
import { createGroupsPanelBody } from './GroupsPanel.js';
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
 *   onGroupRename?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupColor?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onKeyframeEdited?: () => void,
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

  const propsPanel = createDockPanel('Properties', propsBody, {
    storageKey: 'dock-properties',
    defaultHeight: 780,
    minHeight: 200,
  });

  rightRail.registerPanel({
    id: 'properties',
    icon: 'fas fa-sliders-h',
    label: '속성',
    panelEl: propsPanel.el,
    panelApi: propsPanel,
    defaultOpen: true,
  });

  if (ctx.groupStore) {
    groupsUi = createGroupsPanelBody({
      store: ctx.groupStore,
      getProjectId: () => ctx.getProjectId?.() ?? null,
      getPresetStore: () => ctx.positionPresetStore ?? null,
      getTimelineSnapshot: () => ctx.engine?.listTracks?.().map((t) => t.snapshot()) ?? [],
      getFoldersSnapshot: () => ctx.engine?.listFolders?.().map((f) => ({ ...f })) ?? [],
      getMotionsSnapshot: () => ctx.getMotionSnapshot?.() ?? [],
      onDeploy: (groupId) => ctx.onDeployGroup?.(groupId),
      onPresetUpdated: (preset) => ctx.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
      onPickGroupPoint: (pick) => ctx.onPickGroupPoint?.(pick),
      onGroupPresetApplied: (group, preset) => ctx.onGroupPresetApplied?.(group, preset),
      getDefaultSpawn: () => ctx.getGroupDefaultSpawn?.() || { fromX: 0, fromZ: 50 },
      getSegmentStagePreview: () => ctx.segmentStagePreview ?? null,
      onGroupRename: (group) => ctx.onGroupRename?.(group),
      onGroupColor: (group) => ctx.onGroupColor?.(group),
      onChange: () => ctx.onChange?.(),
    });
    const groupsPanel = createDockPanel('그룹 / Ensemble', groupsUi.root, {
      storageKey: 'dock-groups',
      defaultHeight: 720,
      minHeight: 200,
    });
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

  let lightingUi = null;
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
    const lightingPanel = createDockPanel('조명', lightingUi.root, {
      storageKey: 'dock-lighting',
      defaultHeight: 520,
      minHeight: 200,
    });
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
