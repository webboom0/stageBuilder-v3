import { createPanelRail } from './PanelRail.js';
import { createDockPanel } from './floatPanel.js';
import { createStagePanelBody } from './StagePanel.js';
import { createAssetsPanelBody } from './AssetsPanel.js';
import { createGroupsPanelBody } from './GroupsPanel.js';
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
 *   onApplyProfile: (widthM: number, depthM: number) => void,
 *   onChange?: () => void,
 *   onStageFocusChange?: (active: boolean) => void,
 *   onAddCharacter?: (entry: { url: string, name: string, procedural?: string, color?: number }) => void | Promise<void>,
 *   onAddProp?: (entry: { url: string, name: string, procedural?: string, color?: number }) => void | Promise<void>,
 *   onAddVideo?: (entry: { url: string, name: string, filename?: string }) => void | Promise<void>,
 *   onRemoveVideo?: () => void | Promise<void>,
 *   onDeployGroup?: (groupId: string) => void | Promise<void>,
 *   onGroupRename?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupColor?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onKeyframeEdited?: () => void,
 *   getMotion?: (trackId: string) => import('../domain/motion/MotionDirector.js').MotionItem | null,
 *   getLight?: (trackId: string) => { channel: string, trackId: string, name: string } | null,
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
 * }} ctx
 */
export function mountEditorShell(root, ctx) {
  const leftRail = createPanelRail(root, { side: 'left', distribution: 'resizable' });
  const rightRail = createPanelRail(root, { side: 'right', distribution: 'resizable' });

  const stageUi = createStagePanelBody({
    stageManager: ctx.stageManager,
    onStageTypeChange: ctx.onStageTypeChange,
    onApplyProfile: ctx.onApplyProfile,
    onChange: ctx.onChange,
  });

  const stagePanel = createDockPanel('무대', stageUi.root, {
    storageKey: 'dock-stage-무대',
    defaultHeight: 220,
  });

  leftRail.registerPanel({
    id: 'stage',
    icon: 'fas fa-theater-masks',
    label: '무대',
    panelEl: stagePanel,
    defaultOpen: true,
  });

  let groupsUi = null;

  const assetsUi = createAssetsPanelBody({
    onAddCharacter: (entry) => ctx.onAddCharacter?.(entry),
    onAddProp: (entry) => ctx.onAddProp?.(entry),
    onAddVideo: (entry) => ctx.onAddVideo?.(entry),
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
    panelEl: assetsPanel,
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
      onPickAnimPoint: (pick) => ctx.onPickAnimPoint?.(pick),
      onApplyMotionAnim: (motionId) => ctx.onApplyMotionAnim?.(motionId),
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
    panelEl: propsPanel,
    defaultOpen: true,
  });

  if (ctx.groupStore) {
    groupsUi = createGroupsPanelBody({
      store: ctx.groupStore,
      onDeploy: (groupId) => ctx.onDeployGroup?.(groupId),
      onPickGroupPoint: (pick) => ctx.onPickGroupPoint?.(pick),
      getDefaultSpawn: () => ctx.getGroupDefaultSpawn?.() || { fromX: 0, fromZ: 50 },
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
      panelEl: groupsPanel,
      defaultOpen: false,
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
    ctx.onChange?.();
  };

  const handleStageFocusToggle = () => toggleStageFocus();

  if (menubarEl) {
    menubarApi = mountMenubar(menubarEl, {
      helpers: ctx.helpers,
      onCameraPreset: ctx.onCameraPreset,
      onMenuAction: (action) => ctx.onMenuAction?.(action),
      onHelpersChanged: syncHelperUi,
      onStageFocusToggle: handleStageFocusToggle,
    });
  }

  if (viewportControlsEl) {
    controlsApi = mountViewportMenubarControls(viewportControlsEl, {
      helpers: ctx.helpers,
      onChange: syncHelperUi,
    });
  }

  const toolbarEl = root.querySelector('#toolbar');
  if (toolbarEl) {
    toolbarApi = mountViewportToolbar(toolbarEl, {
      onCameraPreset: ctx.onCameraPreset,
      onZoom: ctx.onZoom,
      onStageFocusToggle: handleStageFocusToggle,
      onTransformMode: (mode) => ctx.onTransformMode?.(mode),
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
    refreshAssets: () => assetsUi.refresh(),
    setActiveVideo: (key) => assetsUi.setActiveVideo?.(key),
    syncKeyframeProps: () => propsUi?.sync(),
    refreshGroups: () => groupsUi?.render(),
    refreshGroupsCatalog: () => groupsUi?.refreshCatalog?.(),
  };
}
