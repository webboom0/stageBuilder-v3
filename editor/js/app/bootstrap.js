import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { API_BASE_URL, apiUrl, API } from '../config/app-config.js';
import { DEFAULT_STAGE_PROFILE } from '../domain/stage/StageProfile.js';
import { StageManager } from '../domain/stage/StageManager.js';
import { StageViewportHelpers } from '../domain/stage/StageViewportHelpers.js';
import { STAGE_TYPES } from '../domain/stage/StageTypes.js';
import { applyCameraPreset, applyDefaultStageCamera, mapStageScaledPoint, STAGE_CAMERA_PRESETS, zoomCamera } from '../domain/stage/CameraPresets.js';
import { getClampedProfileFactors, getStagePivot } from '../domain/stage/stageFloorLayout.js';
import { mountEditorShell } from '../ui/EditorShell.js';
import {
  bindViewportStageFocus,
  onStageFocusChange,
} from '../ui/stageFocusMode.js';
import { TimelineEngine } from '../domain/timeline/TimelineEngine.js';
import { mountTimelineShell } from '../ui/timeline/TimelineShell.js';
import { MotionDirector } from '../domain/motion/MotionDirector.js';
import { MotionGroupStore } from '../domain/motion/MotionGroupStore.js';
import { applyGroupSegmentsToMotion } from '../domain/motion/applyGroupSegments.js';
import { applyImportedKeysToTrack, importV3MotionJson } from '../domain/motion/importV3MotionJson.js';
import { applyMotionSegmentsToTrack } from '../domain/motion/applyMotionSegments.js';
import { ensureGroupSegments } from '../domain/motion/groupSegments.js';
import { colorForGroup, recolorGroupDeployedMembers } from '../domain/motion/walkLitePerformer.js';
import { getStageDeckCenter, getStageWorldPerMeter } from '../domain/stage/stageGridAdaptive.js';
import { getHumanFormationSpacingWorld } from '../domain/stage/HumanScale.js';
import { createViewportInteraction } from '../domain/viewport/ViewportInteraction.js';
import { VideoBackground } from '../domain/video/VideoBackground.js';
import { LightDirector } from '../domain/lighting/LightDirector.js';
import { FixtureDirector } from '../domain/lighting/FixtureDirector.js';
import { AudioDirector } from '../domain/audio/AudioDirector.js';
import { setAudioProjectResolver } from '../domain/audio/audioPaths.js';
import { ensureWorkLights } from '../domain/lighting/workLights.js';
import { setWorkLightActive, bindHouseStageManager } from '../domain/lighting/houseStageLights.js';
import { initTooltips } from '../ui/initTooltips.js';
import { runProjectHub } from '../ui/project/ProjectHub.js';
import { showProjectPickerDialog } from '../ui/project/ProjectPickerDialog.js';
import { showProjectManagerDialog } from '../ui/project/ProjectManagerDialog.js';
import { showSceneLoadReportDialog } from '../ui/project/SceneLoadReportDialog.js';
import { showProjectMetaPopup } from '../ui/project/ProjectMetaPopup.js';
import { createProject, exportProjectBundle, exportProjectSnapshot, importProjectBundle, restoreProjectSnapshot, listProjects, probeProjectsApi } from '../domain/project/projectApi.js';
import { ProjectStore } from '../domain/project/ProjectStore.js';
import { createEditorLoadingOverlay } from '../ui/EditorLoadingOverlay.js';
import { MultiViewManager } from '../domain/viewport/MultiViewManager.js';
import { MultiViewPopup } from '../domain/viewport/MultiViewPopup.js';
import {
  bindStageShellXRayContext,
  isStageShellXRayEnabled,
  refreshStageShellXRay,
  setStageShellXRayEnabled,
} from '../domain/viewport/stageShellXRay.js';
import { runRenderStudio } from '../ui/render/RenderStudio.js';
import { showLibraryManagerDialog } from '../ui/library/LibraryManagerDialog.js';

const statusEl = document.getElementById('status');
const viewportEl = document.getElementById('viewport');
const wrapperEl = document.querySelector('.wrapper');
const timelineHost = document.getElementById('timeline');

/** 자동 저장 — 마지막 편집 후 대기 (dirty일 때만 저장) */
const AUTO_SAVE_DEBOUNCE_MS = 45 * 1000;

const MENU_PHASE_HINTS = {
  'file:new': 'Phase 6 — 프로젝트',
  'file:open': 'Phase 6 — 프로젝트',
  'file:manageProjects': 'Phase 6 — 프로젝트',
  'file:save': 'Phase 6 — 프로젝트',
  'file:saveAs': 'Phase 6 — 프로젝트',
  'file:import:audio': 'Phase 5 — 오디오',
  'file:import:zip': 'Phase 6 — 프로젝트 ZIP (에셋 포함)',
  'file:import:snapshot': 'Phase 6 — 스냅샷 복원',
  'file:export:zip': 'Phase 6 — ZIP',
  'file:export:snapshot': 'Phase 6 — 스냅샷',
  'file:export:renderScene': '렌더',
  'file:export:renderAll': '렌더',
  'view:multiview': '멀티뷰',
  'scene:add': 'Phase 6 — 멀티 씬',
  'scene:duplicate': 'Phase 6 — 멀티 씬',
  'scene:delete': 'Phase 6 — 멀티 씬',
  'scene:rename': 'Phase 6 — 멀티 씬',
  'scene:prev': 'Phase 6 — 멀티 씬',
  'scene:next': 'Phase 6 — 멀티 씬',
  'scene:list': 'Phase 6 — 멀티 씬',
  'show:panel': '왼쪽 그룹 패널 (MVP)',
  'show:go': '그룹 패널 GO',
  'show:standby': 'Phase 7 — Show Control',
  'show:presets': 'Phase 7 — 무대연출',
  'view:skeleton': 'Phase 3 — 모션',
  'help:tutorial': '사용자 튜토리얼 (HTML)',
  'help:qa': 'docs/04_작업단위_테스트_튜토리얼.md',
  'help:about': 'StageBuilder v4 · Phase 5 Audio',
  'library:character': '공용 라이브러리 — 캐릭터',
  'library:stage': '공용 라이브러리 — 스테이지',
  'library:audio': '공용 라이브러리 — 오디오',
  'library:video': '공용 라이브러리 — 비디오',
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function formatStatus(api, stageManager, extra = '', projectStore = null) {
  const { profile, stageType } = stageManager;
  const typeLabel = STAGE_TYPES[stageType]?.label ?? stageType;
  const hasStage = !!stageManager.background;
  const apiLine = api
    ? `Assets API OK (local ${API_BASE_URL}) | FBX ${api.fbxCount} · Audio ${api.audioCount}`
    : `Assets API unavailable (${API_BASE_URL}) — run: node server/server.js`;

  const parts = [];
  if (projectStore?.project) {
    const p = projectStore.project;
    parts.push(`「${p.showName || p.name || projectStore.projectId}」 ${projectStore.sceneName()}${projectStore.dirty ? ' *' : ''}`);
  }
  parts.push(
    apiLine,
    `${typeLabel} ${profile.widthM}×${profile.depthM}m (${Math.round(profile.widthM * profile.depthM)}㎡)`,
    hasStage ? 'Stage shell OK' : 'Stage shell missing — check ../files/stage/*.fbx',
  );
  const eff = stageManager.getEffectiveProfile?.();
  if (eff?.clamped) {
    parts.push(`적용 ${eff.effectiveWidthM}×${eff.effectiveDepthM}m (한도)`);
  }
  if (extra) parts.push(extra);
  return parts.join(' | ');
}

async function fetchJson(path) {
  const res = await fetch(apiUrl(path), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkApi() {
  try {
    const health = await fetchJson(API.health);
    let fbxCount = 0;
    let audioCount = 0;
    let projectsOk = false;
    try {
      projectsOk = await probeProjectsApi();
    } catch { /* ignore */ }
    try {
      const fbxFiles = await fetchJson(API.fbxFiles);
      fbxCount = Array.isArray(fbxFiles) ? fbxFiles.length : 0;
    } catch { /* auth */ }
    try {
      const audioFiles = await fetchJson(API.audioFiles);
      audioCount = Array.isArray(audioFiles) ? audioFiles.length : 0;
    } catch { /* auth */ }
    return { health, fbxCount, audioCount, projectsOk };
  } catch (err) {
    console.warn('Assets API check failed:', err);
    return null;
  }
}

/**
 * @param {StageManager} stageManager
 * @param {StageViewportHelpers} helpers
 * @param {{ setGridScaleLabel?: (s: any) => void }} shellRef
 * @param {{ current: import('../domain/video/VideoBackground.js').VideoBackground | null }} videoBgRef
 */
function initViewport(stageManager, helpers, shellRef, videoBgRef) {
  const scene = stageManager.scene;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x111111);
  viewportEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  /** v3 audience pose (scaled) until stage FBX + applyDefaultStageCamera */
  {
    const factors = getClampedProfileFactors(stageManager.profile, stageManager.stageType);
    const pivot = getStagePivot(stageManager.stageType);
    const preset = STAGE_CAMERA_PRESETS.audience;
    const pos = mapStageScaledPoint(preset.position, pivot, factors);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.rotation.set(preset.rotation[0], preset.rotation[1], preset.rotation[2]);
    const span = 200 * Math.max(factors.widthFactor, factors.depthFactor, factors.heightFactor ?? 1);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, span);
    controls.update();
  }

  const multiView = new MultiViewManager({
    renderer,
    scene,
    helpers,
    mainCamera: camera,
    viewportEl,
  });

  function resize() {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  function renderView() {
    multiView.render();
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    helpers.update(camera, controls.target, viewportEl.clientHeight);
    shellRef.current?.setGridScaleLabel?.(helpers.viewportGridScale);
    videoBgRef.current?.update();
    renderView();
  }
  animate();

  return { camera, renderer, controls, resize, multiView, renderView };
}

async function main(initialProjectStore) {
  let projectStore = initialProjectStore;
  const bootLoading = createEditorLoadingOverlay();
  /** @type {ReturnType<typeof createEditorLoadingOverlay>} */
  const editorLoading = bootLoading;
  bootLoading.show('에디터 준비 중…');

  setAudioProjectResolver(() => projectStore?.projectId ?? null);
  setStatus('Loading stage…');
  const api = await checkApi();
  const stageManager = new StageManager(
    projectStore?.project?.stageProfile || DEFAULT_STAGE_PROFILE,
  );
  bindHouseStageManager(stageManager);
  const helpers = new StageViewportHelpers(stageManager.scene, { stageManager });
  const timeline = new TimelineEngine();
  const motion = new MotionDirector({
    scene: stageManager.scene,
    engine: timeline,
    stageManager,
  });
  const groupStore = new MotionGroupStore();
  const light = new LightDirector({
    scene: stageManager.scene,
    engine: timeline,
    stageManager,
  });
  const fixtures = new FixtureDirector({
    scene: stageManager.scene,
    engine: timeline,
    stageManager,
  });
  const audio = new AudioDirector({ engine: timeline });

  function syncStageFromTimelineSelection() {
    if (!interaction) return;
    const trackId = timeline.selectedTrackId;
    const motionItem = trackId ? motion.findByTrackId(trackId) : null;
    if (motionItem) {
      if (interaction.getSelectedMotionId?.() !== motionItem.id) {
        interaction.selectMotion(motionItem.id, { selectKey: false });
      }
      return;
    }
    if (interaction.getSelectedMotionId?.()) {
      interaction.clearSelection({ skipEngine: true });
    }
  }

  timeline.subscribe((ev) => {
    if (ev.type === 'selection') {
      syncStageFromTimelineSelection();
    }
    if (
      !suppressSceneDirty
      && (ev.type === 'keys' || ev.type === 'tracks' || ev.type === 'duration' || ev.type === 'view')
    ) {
      markSceneDirty();
    }
    if (ev.type === 'play' && timeline.playing) {
      audio.preloadAllClips();
    }
    if (timeline.playing) {
      audio.apply(timeline.playheadSec);
    }
    motion.apply(timeline.playheadSec);
    light.apply(timeline.playheadSec);
    fixtures.apply(timeline.playheadSec);
    if (!timeline.playing) {
      audio.apply(timeline.playheadSec);
    }
  });

  /** @type {{ current: ReturnType<typeof mountEditorShell> | null }} */
  const shellRef = { current: null };
  /** @type {{ current: VideoBackground }} */
  const videoBgRef = { current: new VideoBackground() };
  const viewport = initViewport(stageManager, helpers, shellRef, videoBgRef);
  bindStageShellXRayContext(stageManager, stageManager.scene);

  /** @type {MultiViewPopup} */
  let multiViewPopup = new MultiViewPopup({
    scene: stageManager.scene,
    helpers,
    stageManager,
    mainCamera: viewport.camera,
    mainControls: viewport.controls,
    timeline,
    videoBg: () => videoBgRef.current,
    applyTimelineFrame: () => applyTimelineFrameToStage(),
    onClosed: () => {
      shellRef.current?.syncMultiViewUi?.();
      refreshStatus('멀티뷰 닫음');
    },
  });

  function applyTimelineFrameToStage() {
    motion.apply(timeline.playheadSec);
    light.apply(timeline.playheadSec);
    fixtures.apply(timeline.playheadSec);
    if (timeline.playing) {
      audio.apply(timeline.playheadSec);
    }
  }

  let buildingLocked = false;

  function updateControlsEnabled() {
    viewport.controls.enableRotate = !buildingLocked;
    viewport.controls.enablePan = !buildingLocked;
    viewport.controls.enabled = !buildingLocked;
  }

  function setBuildingLocked(locked) {
    buildingLocked = !!locked;
    updateControlsEnabled();
    return buildingLocked;
  }

  /** @type {ReturnType<typeof createViewportInteraction> | null} */
  let interaction = null;

  if (timelineHost) {
    mountTimelineShell(timelineHost, {
      engine: timeline,
      getMotionKeyValue: (trackId) => motion.keyValueForTrack(trackId),
      getLightKeyValue: (trackId) =>
        light.keyValueForTrack(trackId) ?? fixtures.keyValueForTrack(trackId),
      audio,
      onTrackSelect: (trackId, opt) => {
        const m = motion.findByTrackId(trackId);
        if (m) interaction?.selectMotion(m.id, opt);
        else {
          shellRef.current?.syncKeyframeProps?.();
          shellRef.current?.syncLightingPanel?.();
        }
      },
      onTrackRemove: (trackId) => {
        const tr = timeline.getTrack(trackId);
        if (tr?.kind === 'light') {
          const ok =
            light.removeTrackById(trackId) || fixtures.removeTrackById(trackId);
          if (ok) shellRef.current?.syncLightingPanel?.();
          return ok;
        }
        if (tr?.kind === 'audio') {
          return audio.removeTrack(trackId);
        }
        const removed = motion.removeByTrackId(trackId);
        const selId = interaction?.getSelectedMotionId?.();
        if (selId && !motion.get(selId)) interaction.clearSelection();
        else shellRef.current?.syncKeyframeProps?.();
        return removed;
      },
    });
  }

  interaction = createViewportInteraction({
    dom: viewport.renderer.domElement,
    camera: viewport.camera,
    scene: stageManager.scene,
    controls: viewport.controls,
    motion,
    engine: timeline,
    stageManager,
    onSelectionChange: () => {
      shellRef.current?.syncKeyframeProps?.();
    },
  });

  // Pause key apply while gizmo dragging
  interaction.transform.addEventListener('dragging-changed', (ev) => {
    motion.suspendApply = !!ev.value;
  });

  const refreshStatus = (extra = '') => setStatus(formatStatus(api, stageManager, extra, projectStore));

  /** 씬 load 중 타임라인 emit → dirty 오탐 방지 */
  let suppressSceneDirty = false;

  function markSceneDirty() {
    if (!projectStore || suppressSceneDirty) return;
    const wasDirty = projectStore.dirty;
    projectStore.markDirty();
    refreshStatus();
    if (!wasDirty) shellRef.current?.refreshProjectPanel?.();
    scheduleAutoSave();
  }

  function getSceneCtx() {
    return {
      engine: timeline,
      motion,
      groupStore,
      videoBg: videoBgRef.current,
      audio,
      stageManager,
      light,
      fixtures,
      onStageReload: async () => {
        light.ensureHouseLights();
        fixtures.refit();
        if (videoBgRef.current.currentVideoPath) {
          videoBgRef.current.rebuildForStage(stageManager);
        }
        shellRef.current?.syncStagePanel?.();
      },
      onSceneApplied: () => {
        shellRef.current?.syncKeyframeProps?.();
        shellRef.current?.refreshGroups?.();
        shellRef.current?.syncLightingPanel?.();
        shellRef.current?.refreshProjectPanel?.();
        syncActiveVideoIndicator();
      },
    };
  }

  function afterSceneSwitch() {
    interaction?.clearSelection?.();
    refreshStatus(`씬: ${projectStore?.sceneName?.() ?? ''}`);
  }

  function syncActiveVideoIndicator() {
    const videoPath = videoBgRef.current?.currentVideoPath;
    if (videoPath) {
      const filename = videoPath.split('/').pop() || videoPath;
      shellRef.current?.setActiveVideo?.(filename);
    } else {
      shellRef.current?.setActiveVideo?.(null);
    }
  }

  /** 새/열기 프로젝트 후 패널·UI를 현재 projectStore 기준으로 동기화 */
  function syncPanelsAfterProjectLoad() {
    shellRef.current?.refreshAssets?.();
    shellRef.current?.refreshGroups?.();
    shellRef.current?.syncKeyframeProps?.();
    shellRef.current?.syncLightingPanel?.();
    shellRef.current?.syncHelperUi?.();
    syncActiveVideoIndicator();
  }

  async function addMotionEntry(entry, extra = {}) {
    const assetRole = entry.assetRole || extra.assetRole || 'character';
    refreshStatus(`${assetRole === 'stage' ? 'Stage' : 'Character'} loading: ${entry.name}…`);
    const fileRef = entry.path || entry.url;
    const item = await motion.addFromUrl(fileRef, {
      name: entry.name,
      procedural: entry.procedural,
      color: entry.color,
      assetRole,
      ...extra,
    });
    timeline.selectedTrackId = item.trackId;
    const track = timeline.getTrack(item.trackId);
    const firstKey = track?.keys.list()[0];
    if (firstKey) {
      timeline.selectKeyframe(item.trackId, firstKey.id);
      interaction?.selectMotion(item.id, { selectKey: false });
    } else {
      timeline.selectedKeyframeId = null;
      timeline.emit('selection');
      interaction?.selectMotion(item.id, { selectKey: false });
    }
    motion.apply(timeline.playheadSec);
    return item;
  }

  function syncGroupNameToTimeline(group) {
    if (!group?.deployedFolderId) return;
    timeline.renameFolder(group.deployedFolderId, group.name);
    for (const mem of group.members || []) {
      if (!mem.deployedMotionId) continue;
      const item = motion.get(mem.deployedMotionId);
      if (!item) continue;
      const nextName = `${group.name} · ${mem.name}`;
      item.name = nextName;
      if (item.object) item.object.name = nextName;
      const track = timeline.getTrack(item.trackId);
      if (track) track.name = nextName;
    }
    timeline.emit('tracks');
  }

  function importV3MotionJsonFile() {
    const target = motion.findByTrackId(timeline.selectedTrackId)
      || (interaction?.getSelectedMotionId?.()
        ? motion.get(interaction.getSelectedMotionId())
        : null);
    if (!target) {
      refreshStatus('v3 JSON 가져오기: 먼저 모션을 선택하세요');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = importV3MotionJson(text);
        if (!parsed.ok) {
          refreshStatus(`가져오기 실패: ${parsed.error}`);
          return;
        }
        let trackKeys = parsed.tracks[0];
        if (parsed.tracks.length > 1) {
          const names = parsed.tracks
            .map((t, i) => `${i + 1}:${t.sourceId.slice(0, 8)}(${t.keys.length}키)`)
            .join(' · ');
          const pick = window.prompt(
            `트랙 ${parsed.tracks.length}개 발견. 적용할 번호(1~${parsed.tracks.length})\n${names}`,
            '1',
          );
          const idx = Math.max(0, (Number(pick) || 1) - 1);
          trackKeys = parsed.tracks[Math.min(idx, parsed.tracks.length - 1)];
        }
        const result = applyImportedKeysToTrack({
          engine: timeline,
          trackId: target.trackId,
          keys: trackKeys.keys,
        });
        motion.apply(timeline.playheadSec);
        refreshStatus(
          `v3 모션 JSON → ${target.name}: ${result.added}키 (지움 ${result.cleared}) · src ${trackKeys.sourceId.slice(0, 8)}…`,
        );
      } catch (err) {
        console.error(err);
        refreshStatus(`가져오기 오류: ${err.message || err}`);
      }
    });
    input.click();
  }

  async function deployGroup(groupId) {
    const group = groupStore.get(groupId);
    if (!group?.members?.length) return;
    ensureGroupSegments(group);
    const folder = timeline.ensureFolder({
      id: group.deployedFolderId || undefined,
      name: group.name,
      collapsed: false,
    });
    group.deployedFolderId = folder.id;
    const spacing = group.formationSpacing ?? group.spacing
      ?? Math.round(getHumanFormationSpacingWorld(stageManager));
    const formation = group.fromFormation || group.formation || 'line';
    const offsets = MotionGroupStore.formationOffsets(
      group.members.length,
      spacing,
      formation,
    );
    refreshStatus(`그룹 GO: ${group.name}…`);
    for (let i = 0; i < group.members.length; i++) {
      const mem = group.members[i];
      try {
        // Re-GO: remove previous instance if any
        if (mem.deployedMotionId) {
          motion.remove(mem.deployedMotionId);
          mem.deployedMotionId = null;
        }
        const groupIndex = groupStore.list().findIndex((g) => g.id === group.id);
        const tint = mem.color ?? colorForGroup(group, groupIndex >= 0 ? groupIndex : 0);
        const item = await addMotionEntry(
          {
            url: mem.url,
            name: `${group.name} · ${mem.name}`,
            procedural: mem.procedural,
            color: tint,
          },
          { folderId: folder.id, positionOffset: offsets[i] },
        );
        mem.deployedMotionId = item.id;
        const feetY = item.object.position.y;
        applyGroupSegmentsToMotion({
          engine: timeline,
          motionItem: item,
          group,
          memberIndex: i,
          feetY,
        });
      } catch (err) {
        console.error(err);
        refreshStatus(`그룹 멤버 실패: ${mem.name} — ${err.message}`);
        throw err;
      }
    }
    motion.apply(timeline.playheadSec);
    refreshStatus(
      `그룹 배치: ${group.name} (${group.members.length}) · 구간 ${group.segments?.length || 0}`,
    );
  }

  const applyCam = (presetId) => {
    applyCameraPreset(
      presetId,
      viewport.camera,
      viewport.controls,
      stageManager.stageType,
      stageManager.profile,
      stageManager,
    );
  };

  async function confirmDiscardDirty() {
    if (!projectStore?.dirty) return true;
    return window.confirm('저장하지 않은 변경이 있습니다. 계속할까요?');
  }

  function presentSceneLoadReport(result, sceneName) {
    if (result?.loadReport?.hasIssues?.()) {
      showSceneLoadReportDialog({
        sceneName: sceneName || projectStore?.sceneName?.(),
        warnings: result.loadReport.warnings,
      });
    }
  }

  async function assignProject(store, opts = {}) {
    const skipOverlay = !!opts.skipOverlay;
    const projectName = store?.project?.showName || store?.projectId || '프로젝트';
    if (!skipOverlay) {
      editorLoading.show(`「${projectName}」 불러오는 중…`);
    }

    projectStore = store;
    setAudioProjectResolver(() => projectStore?.projectId ?? null);
    shellRef.current?.clearAssetsStale?.();

    if (store?.project?.stageProfile) {
      stageManager.applyProfile(store.project.stageProfile);
      videoBgRef.current.syncToStage(stageManager);
      light.ensureHouseLights();
      fixtures.refit();
      if (videoBgRef.current.currentVideoPath) {
        videoBgRef.current.rebuildForStage(stageManager);
      }
      applyDefaultStageCamera(
        viewport.camera,
        viewport.controls,
        stageManager.stageType,
        stageManager.profile,
        stageManager,
      );
      multiViewPopup.syncPresetCameras();
      shellRef.current?.syncStagePanel?.();
    }
    suppressSceneDirty = true;
    try {
      shellRef.current?.setStageBusy?.(true);
      if (projectStore) {
        if (!skipOverlay) editorLoading.setMessage('씬 불러오는 중…');
        const result = await projectStore.loadActiveScene(getSceneCtx());
        afterSceneSwitch();
        presentSceneLoadReport(result, projectStore.sceneName());
      }
      syncPanelsAfterProjectLoad();
      shellRef.current?.refreshProjectPanel?.();
      refreshStatus();
    } catch (err) {
      console.error(err);
      refreshStatus(`프로젝트 로드 실패: ${err.message}`);
      window.alert(`프로젝트를 불러오지 못했습니다.\n\n${err.message}`);
    } finally {
      suppressSceneDirty = false;
      shellRef.current?.setStageBusy?.(false);
      if (!skipOverlay) editorLoading.hide();
    }
  }

  async function newProjectFlow() {
    if (!api?.projectsOk) {
      window.alert('프로젝트 API가 필요합니다. server를 실행하세요.');
      return;
    }
    if (!(await confirmDiscardDirty())) return;
    const meta = await showProjectMetaPopup({ mode: 'create' });
    if (!meta) return;
    editorLoading.show('새 프로젝트 만드는 중…');
    try {
      const project = await createProject(meta);
      const store = new ProjectStore(project.id, project);
      editorLoading.setMessage(`「${store.project.showName || store.projectId}」 준비 중…`);
      await assignProject(store, { skipOverlay: true });
      refreshStatus(`새 프로젝트: ${store.project.showName || store.projectId}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`프로젝트 생성 실패: ${err.message}`);
      window.alert(`프로젝트를 만들지 못했습니다.\n\n${err.message}`);
    } finally {
      editorLoading.hide();
    }
  }

  async function openProjectFlow() {
    if (!api?.projectsOk) {
      window.alert('프로젝트 API가 필요합니다. server를 실행하세요.');
      return;
    }
    if (!(await confirmDiscardDirty())) return;
    const projectId = await showProjectPickerDialog();
    if (!projectId) return;
    editorLoading.show('프로젝트 여는 중…');
    try {
      const store = await ProjectStore.open(projectId);
      editorLoading.setMessage(`「${store.project?.showName || projectId}」 불러오는 중…`);
      await assignProject(store, { skipOverlay: true });
    } catch (err) {
      console.error(err);
      refreshStatus(`프로젝트 열기 실패: ${err.message}`);
      window.alert(`프로젝트를 열지 못했습니다.\n\n${err.message}`);
    } finally {
      editorLoading.hide();
    }
  }

  async function manageProjectsFlow() {
    if (!api?.projectsOk) {
      window.alert('프로젝트 API가 필요합니다. server를 실행하세요.');
      return;
    }
    await showProjectManagerDialog({
      activeProjectId: projectStore?.projectId ?? null,
      onEdited: async (projectId, project) => {
        if (projectStore?.projectId === projectId) {
          projectStore.project = project;
          shellRef.current?.refreshProjectPanel?.();
          refreshStatus('프로젝트 정보 수정됨');
        }
      },
      onDeleted: async (projectId) => {
        if (projectStore?.projectId !== projectId) return;
        cancelAutoSaveDebounce();
        const remaining = await listProjects();
        if (!remaining.length) {
          window.alert('모든 프로젝트가 삭제되었습니다. 시작 화면으로 이동합니다.');
          window.location.reload();
          return;
        }
        if (!(await confirmDiscardDirty())) return;
        editorLoading.show('프로젝트 전환 중…');
        try {
          const store = await ProjectStore.open(remaining[0].id);
          await assignProject(store, { skipOverlay: true });
          refreshStatus(`프로젝트 전환: ${store.project.showName || store.projectId}`);
        } catch (err) {
          console.error(err);
          window.alert(`다른 프로젝트를 열지 못했습니다.\n\n${err.message}`);
        } finally {
          editorLoading.hide();
        }
      },
    });
  }

  async function duplicateSceneFlow(sceneId) {
    if (!projectStore) return;
    suppressSceneDirty = true;
    try {
      shellRef.current?.setStageBusy?.(true);
      const dup = await projectStore.duplicateScene(getSceneCtx(), sceneId);
      afterSceneSwitch();
      presentSceneLoadReport(dup, projectStore.sceneName());
      refreshStatus(`씬 복제됨`);
    } catch (err) {
      console.error(err);
      refreshStatus(`씬 복제 실패: ${err.message}`);
      window.alert(err.message || '씬 복제 실패');
    } finally {
      suppressSceneDirty = false;
      shellRef.current?.setStageBusy?.(false);
      shellRef.current?.refreshProjectPanel?.();
    }
  }

  async function deleteSceneFlow(sceneId) {
    if (!projectStore) return;
    const scenes = projectStore.project.scenes || [];
    if (scenes.length <= 1) {
      window.alert('마지막 씬은 삭제할 수 없습니다.');
      return;
    }
    const scene = scenes.find((s) => s.id === sceneId);
    const label = scene?.name || sceneId;
    if (!window.confirm(`씬 «${label}»을(를) 삭제할까요?\n\n되돌릴 수 없습니다.`)) return;
    suppressSceneDirty = true;
    try {
      shellRef.current?.setStageBusy?.(true);
      const loadResult = await projectStore.deleteScene(getSceneCtx(), sceneId);
      afterSceneSwitch();
      if (loadResult) presentSceneLoadReport(loadResult, projectStore.sceneName());
      refreshStatus(`씬 삭제: ${label}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`씬 삭제 실패: ${err.message}`);
      window.alert(err.message || '씬 삭제 실패');
    } finally {
      suppressSceneDirty = false;
      shellRef.current?.setStageBusy?.(false);
      shellRef.current?.refreshProjectPanel?.();
    }
  }

  async function renameActiveSceneFlow() {
    if (!projectStore) return;
    const id = projectStore.activeSceneId;
    const scene = projectStore.project.scenes?.find((s) => s.id === id);
    const next = window.prompt('씬 이름', scene?.name || id);
    if (!next?.trim()) return;
    try {
      await projectStore.renameScene(id, next.trim());
      shellRef.current?.refreshProjectPanel?.();
      refreshStatus(`씬 이름: ${next.trim()}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`이름 변경 실패: ${err.message}`);
    }
  }

  async function saveProjectFlow(opts = {}) {
    const { silent = false, auto = false } = opts;
    if (!projectStore) return false;
    if (!projectStore.dirty) {
      if (!silent) refreshStatus('변경 사항 없음');
      return false;
    }
    try {
      if (!auto) {
        shellRef.current?.setStageBusy?.(true);
        shellRef.current?.setProjectPanelSaving?.(true);
      }
      await projectStore.saveActiveScene(getSceneCtx());
      shellRef.current?.refreshProjectPanel?.();
      cancelAutoSaveDebounce();
      refreshStatus(auto ? '자동 저장됨' : '저장됨');
      return true;
    } catch (err) {
      console.error(err);
      refreshStatus(`저장 실패: ${err.message}`);
      if (auto && projectStore?.dirty) scheduleAutoSave();
      if (!auto) {
        window.alert(`저장하지 못했습니다.\n\n${err.message}`);
      }
      return false;
    } finally {
      if (!auto) {
        shellRef.current?.setProjectPanelSaving?.(false);
        shellRef.current?.setStageBusy?.(false);
      }
    }
  }

  async function exportProjectZipFlow() {
    if (!projectStore) return;
    try {
      shellRef.current?.setStageBusy?.(true);
      if (projectStore.dirty) {
        await projectStore.saveActiveScene(getSceneCtx());
        shellRef.current?.refreshProjectPanel?.();
        refreshStatus('저장 후 ZIP 내보내기…');
      }
      await exportProjectBundle(projectStore.projectId, 'bundle');
      refreshStatus('ZIP 다운로드');
    } catch (err) {
      console.error(err);
      refreshStatus(`ZIP 내보내기 실패: ${err.message}`);
      window.alert(`ZIP을 내보내지 못했습니다.\n\n${err.message}`);
    } finally {
      shellRef.current?.setStageBusy?.(false);
    }
  }

  async function exportSnapshotFlow() {
    if (!projectStore) return;
    try {
      shellRef.current?.setStageBusy?.(true);
      if (projectStore.dirty) {
        await projectStore.saveActiveScene(getSceneCtx());
        shellRef.current?.refreshProjectPanel?.();
        refreshStatus('저장 후 스냅샷…');
      }
      await exportProjectSnapshot(projectStore.projectId);
      refreshStatus('스냅샷 저장됨');
    } catch (err) {
      console.error(err);
      refreshStatus(`스냅샷 저장 실패: ${err.message}`);
      window.alert(`스냅샷을 저장하지 못했습니다.\n\n${err.message}`);
    } finally {
      shellRef.current?.setStageBusy?.(false);
    }
  }

  function restoreSnapshotFlow() {
    if (!projectStore) {
      window.alert('프로젝트를 연 뒤 「스냅샷에서 복원」을 사용하세요.');
      return;
    }
    const ok = window.confirm(
      '현재 프로젝트의 씬·설정이 스냅샷 내용으로 덮어씌워집니다.\n'
      + '에셋(음악·FBX 등)은 그대로 유지됩니다.\n\n'
      + '계속할까요?',
    );
    if (!ok) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          cancelAutoSaveDebounce();
          shellRef.current?.setStageBusy?.(true);
          refreshStatus('스냅샷 복원 중…');
          const data = await restoreProjectSnapshot(projectStore.projectId, file);
          projectStore.project = data.project;
          suppressSceneDirty = true;
          const result = await projectStore.reloadFromServer(getSceneCtx());
          afterSceneSwitch();
          presentSceneLoadReport(result, projectStore.sceneName());
          shellRef.current?.refreshProjectPanel?.();
          refreshStatus('스냅샷에서 복원됨');
        } catch (err) {
          console.error(err);
          refreshStatus(`스냅샷 복원 실패: ${err.message}`);
          window.alert(`스냅샷을 복원하지 못했습니다.\n\n${err.message}`);
        } finally {
          suppressSceneDirty = false;
          shellRef.current?.setStageBusy?.(false);
        }
      })();
    });
    input.click();
  }

  function importProjectZipFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        if (!(await confirmDiscardDirty())) return;
        editorLoading.show('ZIP 가져오는 중…');
        try {
          refreshStatus('ZIP 가져오는 중…');
          const data = await importProjectBundle(file);
          editorLoading.setMessage(`「${data.project?.showName || data.projectId}」 불러오는 중…`);
          const store = await ProjectStore.open(data.projectId);
          await assignProject(store, { skipOverlay: true });
          refreshStatus(`ZIP 가져옴: ${data.project?.showName || data.projectId}`);
        } catch (err) {
          console.error(err);
          refreshStatus(`ZIP 가져오기 실패: ${err.message}`);
          window.alert(`ZIP을 가져오지 못했습니다.\n\n${err.message}`);
        } finally {
          suppressSceneDirty = false;
          editorLoading.hide();
        }
      })();
    });
    input.click();
  }

  let autoSaveDebounceId = null;

  function scheduleAutoSave() {
    if (!projectStore) return;
    cancelAutoSaveDebounce();
    autoSaveDebounceId = window.setTimeout(() => {
      autoSaveDebounceId = null;
      void saveProjectFlow({ silent: true, auto: true });
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  function cancelAutoSaveDebounce() {
    if (autoSaveDebounceId != null) {
      window.clearTimeout(autoSaveDebounceId);
      autoSaveDebounceId = null;
    }
  }

  function applyTimelineFrame(timeSec) {
    motion.apply(timeSec);
    light.apply(timeSec);
    fixtures.apply(timeSec);
    audio.apply(timeSec);
  }

  async function renderSceneExportFlow() {
    if (!projectStore) return;
    const popupWasOpen = multiViewPopup.isOpen();
    await runRenderStudio({
      mode: 'scene',
      sceneName: projectStore.sceneName?.() || '현재 씬',
      durationSec: timeline.durationSec,
      fps: timeline.fps,
      scene: stageManager.scene,
      helpers,
      stageManager,
      timeline,
      applyTimelineFrame,
      videoBg: () => videoBgRef.current,
      audio,
      mainCamera: viewport.camera,
      mainControls: viewport.controls,
      getShowName: () => projectStore.project?.showName || projectStore.project?.name || 'StageBuilder',
      getSceneName: () => projectStore.sceneName?.() || 'scene',
      getScenes: () => projectStore.project?.scenes || [],
      getActiveSceneId: () => projectStore.activeSceneId,
      switchScene: (id) => switchToScene(id),
      prepareMultiView: () => {
        if (popupWasOpen) multiViewPopup.close();
      },
      restoreMultiView: () => {
        if (popupWasOpen) multiViewPopup.open();
        shellRef.current?.syncMultiViewUi?.();
      },
    });
    refreshStatus('렌더 스튜디오 닫음');
  }

  async function renderAllScenesFlow() {
    if (!projectStore) return;
    const scenes = projectStore.project.scenes || [];
    if (!scenes.length) {
      window.alert('렌더할 씬이 없습니다.');
      return;
    }
    const popupWasOpen = multiViewPopup.isOpen();
    await runRenderStudio({
      mode: 'all',
      sceneCount: scenes.length,
      durationSec: timeline.durationSec,
      fps: timeline.fps,
      scene: stageManager.scene,
      helpers,
      stageManager,
      timeline,
      applyTimelineFrame,
      videoBg: () => videoBgRef.current,
      audio,
      mainCamera: viewport.camera,
      mainControls: viewport.controls,
      getShowName: () => projectStore.project?.showName || projectStore.project?.name || 'StageBuilder',
      getSceneName: () => projectStore.sceneName?.() || 'scene',
      getScenes: () => scenes,
      getActiveSceneId: () => projectStore.activeSceneId,
      switchScene: (id) => switchToScene(id),
      prepareMultiView: () => {
        if (popupWasOpen) multiViewPopup.close();
      },
      restoreMultiView: () => {
        if (popupWasOpen) multiViewPopup.open();
        shellRef.current?.syncMultiViewUi?.();
      },
    });
    refreshStatus('렌더 스튜디오 닫음');
  }

  function setMultiViewEnabled(on) {
    if (on) {
      if (!multiViewPopup.isOpen()) multiViewPopup.open();
      refreshStatus('멀티뷰 모니터');
    } else {
      multiViewPopup.close();
    }
    shellRef.current?.syncMultiViewUi?.();
    shellRef.current?.syncHelperUi?.();
  }

  async function switchToScene(sceneId) {
    const scenes = projectStore?.project.scenes || [];
    const target = scenes.find((s) => s.id === sceneId);
    if (!target || !projectStore) return;
    cancelAutoSaveDebounce();
    suppressSceneDirty = true;
    editorLoading.show(`씬 「${target.name}」 불러오는 중…`);
    try {
      shellRef.current?.setStageBusy?.(true);
      const result = await projectStore.switchScene(getSceneCtx(), sceneId);
      afterSceneSwitch();
      presentSceneLoadReport(result, target.name);
      refreshStatus(`씬: ${target.name}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`씬 전환 실패: ${err.message}`);
    } finally {
      suppressSceneDirty = false;
      shellRef.current?.setStageBusy?.(false);
      shellRef.current?.refreshProjectPanel?.();
      editorLoading.hide();
    }
  }

  async function addSceneFlow() {
    if (!projectStore) return;
    const n = (projectStore.project.scenes?.length || 0) + 1;
    const name = window.prompt('새 씬 이름', `${n}막`);
    if (!name?.trim()) return;
    suppressSceneDirty = true;
    try {
      shellRef.current?.setStageBusy?.(true);
      const created = await projectStore.createScene(getSceneCtx(), name.trim());
      afterSceneSwitch();
      presentSceneLoadReport(created, name.trim());
      refreshStatus(`씬 추가: ${name.trim()}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`씬 추가 실패: ${err.message}`);
    } finally {
      suppressSceneDirty = false;
      shellRef.current?.setStageBusy?.(false);
      shellRef.current?.refreshProjectPanel?.();
    }
  }

  async function reorderSceneFlow(sceneId, direction) {
    if (!projectStore) return;
    try {
      await projectStore.reorderScene(sceneId, direction);
      shellRef.current?.refreshProjectPanel?.();
      refreshStatus('씬 순서 변경됨');
    } catch (err) {
      console.error(err);
      refreshStatus(`순서 변경 실패: ${err.message}`);
      window.alert(err.message || '씬 순서 변경 실패');
    }
  }

  bootLoading.setMessage('인터페이스 구성 중…');
  const shell = mountEditorShell(wrapperEl, {
    stageManager,
    helpers,
    engine: timeline,
    groupStore,
    light,
    fixtures,
    getProjectId: () => projectStore?.projectId ?? null,
    getProjectStore: () => projectStore ?? null,
    onSwitchScene: (sceneId) => switchToScene(sceneId),
    onAddScene: () => addSceneFlow(),
    onRenameScene: async (sceneId, name) => {
      if (!projectStore) return;
      try {
        await projectStore.renameScene(sceneId, name);
        shellRef.current?.refreshProjectPanel?.();
        refreshStatus(`씬 이름: ${name}`);
      } catch (err) {
        console.error(err);
        refreshStatus(`이름 변경 실패: ${err.message}`);
      }
    },
    onDuplicateScene: (sceneId) => duplicateSceneFlow(sceneId),
    onDeleteScene: (sceneId) => deleteSceneFlow(sceneId),
    onReorderScene: (sceneId, direction) => reorderSceneFlow(sceneId, direction),
    onSaveProject: () => saveProjectFlow(),
    onUpdateProjectMeta: async (meta) => {
      if (!projectStore) return;
      try {
        projectStore.applyMetaPatch(meta);
        await projectStore.saveMetaOnly();
        shellRef.current?.refreshProjectPanel?.();
        refreshStatus('프로젝트 정보 저장됨');
      } catch (err) {
        console.error(err);
        refreshStatus(`프로젝트 수정 실패: ${err.message}`);
        window.alert(`프로젝트 정보를 저장하지 못했습니다.\n\n${err.message}`);
      }
    },
    getMotion: (trackId) => motion.findByTrackId(trackId),
    getLight: (trackId) => light.findByTrackId(trackId) ?? fixtures.findByTrackId(trackId),
    onWriteLight: (trackId, patch) => {
      if (light.findByTrackId(trackId)) {
        light.writeBagOnSelectedKey(trackId, patch);
        return;
      }
      fixtures.writeBagOnSelectedKey(trackId, patch);
    },
    onStagePick: (motionId) => interaction?.beginStagePick(motionId),
    onPickAnimPoint: (pick) => {
      const label = pick.mode === 'from'
        ? '단일 모션 시작 위치 — 바닥 클릭 (Esc 취소)'
        : '구간 끝 위치 — 바닥 클릭 (Esc 취소)';
      interaction?.beginPointPick((pt) => {
        pick.onPicked?.(pt);
      }, label);
    },
    onApplyMotionAnim: (motionId) => {
      const item = motion.get(motionId);
      if (!item) return;
      const ok = applyMotionSegmentsToTrack({ engine: timeline, motionItem: item });
      motion.apply(timeline.playheadSec);
      refreshStatus(ok
        ? `구간 적용: ${item.name}`
        : `구간 적용 실패: ${item.name}`);
    },
    onTransformMode: (mode) => interaction?.setMode(mode),
    onTransformSpace: (local) => interaction?.setLocal(local),
    onCameraPreset: applyCam,
    onMultiViewToggle: (on) => {
      if (typeof on === 'boolean') setMultiViewEnabled(on);
      else setMultiViewEnabled(!multiViewPopup.isOpen());
    },
    getMultiViewEnabled: () => multiViewPopup.isOpen(),
    onZoom: (delta) => {
      zoomCamera(viewport.camera, viewport.controls, delta);
    },
    onBuildingLockToggle: () => {
      const on = setBuildingLocked(!buildingLocked);
      refreshStatus(on ? '빌딩고정 — 궤도 이동/회전 끔' : '빌딩고정 해제');
      return on;
    },
    onStructureXRayToggle: () => {
      const on = setStageShellXRayEnabled(!isStageShellXRayEnabled());
      shellRef.current?.setStructureXRayActive?.(on);
      refreshStatus(on ? '구조물 투명' : '구조물 불투명');
      return on;
    },
    getStructureXRayEnabled: () => isStageShellXRayEnabled(),
    onKeyframeEdited: () => {
      motion.apply(timeline.playheadSec);
      markSceneDirty();
    },
    onAddCharacter: async (entry) => {
      try {
        const item = await addMotionEntry({ ...entry, assetRole: 'character' });
        refreshStatus(`Character added: ${item.name}`);
      } catch (err) {
        console.error(err);
        refreshStatus(`모션 로드 실패: ${err.message}`);
      }
    },
    onAddProp: async (entry) => {
      try {
        const item = await addMotionEntry({ ...entry, assetRole: 'stage' });
        refreshStatus(`Stage added: ${item.name}`);
      } catch (err) {
        console.error(err);
        refreshStatus(`Stage load failed: ${err.message}`);
      }
    },
    onAddVideo: async (entry) => {
      try {
        const vb = videoBgRef.current;
        if (vb.isPlaying) vb.pauseVideo();
        vb.ensureMesh(stageManager);
        vb.loadVideo(entry.url);
        refreshStatus(`Video: ${entry.name}`);
      } catch (err) {
        console.error(err);
        refreshStatus(`Video load failed: ${err.message}`);
      }
    },
    onRemoveVideo: () => {
      videoBgRef.current.clearFromStage();
      refreshStatus('Video cleared');
    },
    onAddAudio: async (entry) => {
      try {
        let path = entry.path || entry.url;
        const pid = projectStore?.projectId;
        if (pid && path?.startsWith('assets/')) {
          path = `/files/projects/${pid}/${path.replace(/^\/+/, '')}`;
        }
        const { track, clip } = await audio.addFromAsset({
          name: entry.name,
          path,
          filename: entry.filename,
          atSec: timeline.playheadSec,
        });
        audio.apply(timeline.playheadSec);
        refreshStatus(`Audio: ${track.name} · ${clip.durationSec.toFixed(1)}s`);
      } catch (err) {
        console.error(err);
        refreshStatus(`Audio 실패: ${err.message}`);
        window.alert(`오디오를 타임라인에 추가하지 못했습니다.\n\n${err.message}`);
      }
    },
    onDeployGroup: async (groupId) => {
      try {
        await deployGroup(groupId);
        shell.refreshGroups?.();
      } catch (err) {
        console.error(err);
      }
    },
    onGroupRename: (group) => {
      syncGroupNameToTimeline(group);
      refreshStatus(`그룹 이름: ${group.name}`);
    },
    onGroupColor: (group) => {
      const idx = groupStore.list().findIndex((g) => g.id === group.id);
      recolorGroupDeployedMembers(group, (id) => motion.get(id), idx >= 0 ? idx : 0);
    },
    onPickGroupPoint: (pick) => {
      const label = pick.mode === 'from'
        ? '그룹 시작 위치 — 바닥 클릭 (Esc 취소)'
        : '구간 끝 위치 — 바닥 클릭 (Esc 취소)';
      interaction?.beginPointPick((pt) => {
        pick.onPicked?.(pt);
        shell.refreshGroups?.();
      }, label);
    },
    getGroupDefaultSpawn: () => {
      const c = getStageDeckCenter(stageManager);
      return {
        fromX: c.x,
        fromZ: c.z + 50,
        formationSpacing: Math.max(8, Math.round(getHumanFormationSpacingWorld(stageManager))),
      };
    },
    onMenuAction: (action) => {
      if (action === 'edit:undo') {
        const ok = timeline.undo();
        motion.apply(timeline.playheadSec);
        light.apply(timeline.playheadSec);
        fixtures.apply(timeline.playheadSec);
        audio.apply(timeline.playheadSec);
        shellRef.current?.syncLightingPanel?.();
        refreshStatus(ok ? 'Undo' : 'Undo 없음');
        return;
      }
      if (action === 'edit:redo') {
        const ok = timeline.redo();
        motion.apply(timeline.playheadSec);
        light.apply(timeline.playheadSec);
        fixtures.apply(timeline.playheadSec);
        audio.apply(timeline.playheadSec);
        shellRef.current?.syncLightingPanel?.();
        refreshStatus(ok ? 'Redo' : 'Redo 없음');
        return;
      }
      if (action === 'file:new') {
        void newProjectFlow();
        return;
      }
      if (action === 'file:open') {
        void openProjectFlow();
        return;
      }
      if (action === 'file:manageProjects') {
        void manageProjectsFlow();
        return;
      }
      if (action === 'file:import:zip') {
        importProjectZipFlow();
        return;
      }
      if (action === 'file:import:snapshot') {
        restoreSnapshotFlow();
        return;
      }
      if (action === 'file:export:snapshot' && projectStore) {
        void exportSnapshotFlow();
        return;
      }
      if (action === 'show:panel') {
        refreshStatus(MENU_PHASE_HINTS[action]);
        return;
      }
      if (action === 'show:go') {
        const g = groupStore.getActive();
        if (g) deployGroup(g.id);
        else refreshStatus('활성 그룹 없음');
        return;
      }
      if (action === 'file:import:v3motion') {
        importV3MotionJsonFile();
        return;
      }
      if (projectStore && action === 'file:save') {
        void saveProjectFlow();
        return;
      }
      if (projectStore && action === 'scene:add') {
        void addSceneFlow();
        return;
      }
      if (projectStore && action === 'scene:duplicate') {
        void duplicateSceneFlow(projectStore.activeSceneId);
        return;
      }
      if (projectStore && action === 'scene:delete') {
        void deleteSceneFlow(projectStore.activeSceneId);
        return;
      }
      if (projectStore && action === 'scene:rename') {
        void renameActiveSceneFlow();
        return;
      }
      if (projectStore && action === 'scene:list') {
        shellRef.current?.openProjectPanel?.();
        shellRef.current?.refreshProjectPanel?.();
        refreshStatus('프로젝트 패널 — 씬 목록');
        return;
      }
      if (projectStore && (action === 'scene:next' || action === 'scene:prev')) {
        void (async () => {
          const scenes = projectStore.project.scenes || [];
          const idx = scenes.findIndex((s) => s.id === projectStore.activeSceneId);
          const target = action === 'scene:next' ? scenes[idx + 1] : scenes[idx - 1];
          if (!target) {
            refreshStatus(action === 'scene:next' ? '마지막 씬' : '첫 씬');
            return;
          }
          await switchToScene(target.id);
        })();
        return;
      }
      if (action === 'help:tutorial') {
        const url = apiUrl('/stageBuilder/tutorial/');
        window.open(url, '_blank', 'noopener,noreferrer');
        refreshStatus('사용 안내 열림');
        return;
      }
      if (action.startsWith('library:')) {
        const kind = action.slice('library:'.length);
        if (kind === 'character' || kind === 'stage' || kind === 'audio' || kind === 'video') {
          if (!api) {
            window.alert('Assets API가 필요합니다. server를 실행하세요.');
            return;
          }
          void showLibraryManagerDialog(kind, {
            onChanged: () => shellRef.current?.refreshAssets?.(),
          });
          refreshStatus(MENU_PHASE_HINTS[action] ?? '라이브러리');
        }
        return;
      }
      if (action === 'help:qa') {
        const url = apiUrl('/docs/04_%EC%9E%91%EC%97%85%EB%8B%A8%EC%9C%84_%ED%85%8C%EC%8A%A4%ED%8A%B8_%ED%8A%9C%ED%86%A0%EB%A6%AC%EC%96%BC.md');
        window.open(url, '_blank', 'noopener,noreferrer');
        refreshStatus('QA 문서 열림');
        return;
      }
      if (action === 'help:about') {
        refreshStatus(MENU_PHASE_HINTS[action]);
        return;
      }
      if (action.startsWith('file:export:')) {
        if (action === 'file:export:zip' && projectStore) {
          void exportProjectZipFlow();
          return;
        }
        if (action === 'file:export:renderScene') {
          void renderSceneExportFlow();
          return;
        }
        if (action === 'file:export:renderAll' && projectStore) {
          void renderAllScenesFlow();
          return;
        }
        refreshStatus(`내보내기 — ${MENU_PHASE_HINTS[action] ?? '준비 중'}`);
        return;
      }
      if (action === 'view:multiview') {
        setMultiViewEnabled(!multiViewPopup.isOpen());
        return;
      }
      const hint = MENU_PHASE_HINTS[action] ?? '준비 중';
      refreshStatus(`메뉴 «${action}» → ${hint}`);
    },
    onApplyProfile: (widthM, depthM, extras = {}) => {
      stageManager.applyProfile({ widthM, depthM, ...extras });
      videoBgRef.current.syncToStage(stageManager);
      light.ensureHouseLights();
      fixtures.refit();
      applyDefaultStageCamera(
        viewport.camera,
        viewport.controls,
        stageManager.stageType,
        stageManager.profile,
        stageManager,
      );
      multiViewPopup.syncPresetCameras();
      shell.syncStagePanel();
      refreshStatus();
    },
    onStageTypeChange: async (type) => {
      refreshStatus('Loading…');
      shell.setStageBusy(true);
      try {
        await stageManager.setStageType(type);
        refreshStageShellXRay();
        light.ensureHouseLights();
        fixtures.refit();
        if (videoBgRef.current.currentVideoPath) {
          videoBgRef.current.rebuildForStage(stageManager);
        }
        applyDefaultStageCamera(
          viewport.camera,
          viewport.controls,
          stageManager.stageType,
          stageManager.profile,
          stageManager,
        );
        multiViewPopup.syncPresetCameras();
        shell.syncStagePanel();
        refreshStatus();
      } catch (err) {
        console.error(err);
        refreshStatus(`Load error: ${err.message}`);
      } finally {
        shell.setStageBusy(false);
      }
    },
    onChange: () => {
      markSceneDirty();
    },
    onStageFocusChange: () => {
      viewport.resize();
    },
  });
  shellRef.current = shell;

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 's') {
        if (!projectStore) return;
        e.preventDefault();
        void saveProjectFlow();
        return;
      }
      if (e.key === '[' || e.key === ']') {
        if (!projectStore) return;
        e.preventDefault();
        const scenes = projectStore.project.scenes || [];
        const idx = scenes.findIndex((s) => s.id === projectStore.activeSceneId);
        const target = e.key === ']' ? scenes[idx + 1] : scenes[idx - 1];
        if (target) void switchToScene(target.id);
        return;
      }
    }
  });

  bindViewportStageFocus(viewportEl);
  onStageFocusChange(() => {
    viewport.resize();
  });

  try {
    bootLoading.setMessage('무대·건물 불러오는 중…');
    await stageManager.init();
    refreshStageShellXRay();
    ensureWorkLights(stageManager.scene);
    light.ensureHouseLights();
    fixtures.ensureRig();
    // WORK/HOUSE live levels restore from scene JSON when project loads (see applyScene).
    if (!projectStore) {
      setWorkLightActive(stageManager.scene, true);
    }
    applyDefaultStageCamera(
      viewport.camera,
      viewport.controls,
      stageManager.stageType,
      stageManager.profile,
      stageManager,
    );
    multiViewPopup.syncPresetCameras();
    shell.syncStagePanel();
    if (projectStore) {
      try {
        bootLoading.setMessage('씬 불러오는 중…');
        suppressSceneDirty = true;
        const result = await projectStore.loadActiveScene(getSceneCtx());
        cancelAutoSaveDebounce();
        presentSceneLoadReport(result, projectStore.sceneName());
        syncPanelsAfterProjectLoad();
        shellRef.current?.refreshProjectPanel?.();
      } catch (err) {
        console.error(err);
        refreshStatus(`씬 로드 실패: ${err.message}`);
      } finally {
        suppressSceneDirty = false;
      }
    } else {
      motion.apply(timeline.playheadSec);
    }
    shell.syncHelperUi();
    refreshStatus();
  } catch (err) {
    console.error(err);
    refreshStatus(`Load error: ${err.message}`);
  } finally {
    bootLoading.hide();
  }
}

async function entry() {
  initTooltips(document.body);
  const api = await checkApi();
  if (api?.projectsOk) {
    const projectStore = await runProjectHub();
    await main(projectStore);
    return;
  }
  await main(null);
}

entry().catch((err) => {
  console.error(err);
  setStatus(`Boot error: ${err.message}`);
});
