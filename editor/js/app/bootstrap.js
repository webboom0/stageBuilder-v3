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
import { applyMotionExitKeys } from '../domain/motion/applyMotionExit.js';
import { applyMotionSegmentsToTrack } from '../domain/motion/applyMotionSegments.js';
import { ensureGroupSegments } from '../domain/motion/groupSegments.js';
import { colorForGroup, recolorGroupDeployedMembers } from '../domain/motion/walkLitePerformer.js';
import { getStageDeckCenter, getStageWorldPerMeter } from '../domain/stage/stageGridAdaptive.js';
import { getHumanFormationSpacingWorld } from '../domain/stage/HumanScale.js';
import { createViewportInteraction } from '../domain/viewport/ViewportInteraction.js';
import { pickMotionFbx } from '../ui/motion/MotionPicker.js';

const statusEl = document.getElementById('status');
const viewportEl = document.getElementById('viewport');
const wrapperEl = document.querySelector('.wrapper');
const timelineHost = document.getElementById('timeline');

const MENU_PHASE_HINTS = {
  'file:new': 'Phase 6 — 프로젝트',
  'file:open': 'Phase 6 — 프로젝트',
  'file:save': 'Phase 6 — 프로젝트',
  'file:saveAs': 'Phase 6 — 프로젝트',
  'file:import:audio': 'Phase 5 — 오디오',
  'file:export:zip': 'Phase 6 — ZIP',
  'file:export:renderScene': 'Phase 7 — 렌더',
  'file:export:renderAll': 'Phase 7 — 렌더',
  'edit:clone': 'Phase 3+',
  'edit:delete': '선택 키는 Del / 타임라인 Del',
  'edit:center': 'Phase 3+',
  'scene:add': 'Phase 6 — 멀티 씬',
  'scene:duplicate': 'Phase 6 — 멀티 씬',
  'scene:delete': 'Phase 6 — 멀티 씬',
  'scene:rename': 'Phase 6 — 멀티 씬',
  'scene:prev': 'Phase 6 — 멀티 씬',
  'scene:next': 'Phase 6 — 멀티 씬',
  'scene:list': 'Phase 6 — 멀티 씬',
  'add:fixture': 'Phase 4 — 조명',
  'add:house': 'Phase 4 — 조명',
  'add:audio': 'Phase 5 — 오디오',
  'add:group': '왼쪽 그룹 패널',
  'show:panel': '왼쪽 그룹 패널 (MVP)',
  'show:go': '그룹 패널 GO',
  'show:standby': 'Phase 7 — Show Control',
  'show:presets': 'Phase 7 — 무대연출',
  'view:skeleton': 'Phase 3 — 모션',
  'help:tutorial': 'docs/사용자_튜토리얼.md',
  'help:qa': 'docs/04_작업단위_테스트_튜토리얼.md',
  'help:about': 'StageBuilder v4 · Phase 3 Motion (1 track)',
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function formatStatus(api, stageManager, extra = '') {
  const { profile, stageType } = stageManager;
  const typeLabel = STAGE_TYPES[stageType]?.label ?? stageType;
  const apiLine = api
    ? `API OK (${API_BASE_URL}) | FBX ${api.fbxCount} · Audio ${api.audioCount}`
    : `API offline — start server: cd server && npm run dev`;

  const parts = [
    apiLine,
    `${typeLabel} ${profile.widthM}×${profile.depthM}m (${Math.round(profile.widthM * profile.depthM)}㎡)`,
    '건물+바닥 연동',
  ];
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
    const [fbxFiles, audioFiles] = await Promise.all([
      fetchJson(API.fbxFiles),
      fetchJson(API.audioFiles),
    ]);
    return { health, fbxCount: fbxFiles.length, audioCount: audioFiles.length };
  } catch (err) {
    console.warn('API check failed:', err);
    return null;
  }
}

/**
 * @param {StageManager} stageManager
 * @param {StageViewportHelpers} helpers
 * @param {{ setGridScaleLabel?: (s: any) => void }} shellRef
 */
function initViewport(stageManager, helpers, shellRef) {
  const scene = stageManager.scene;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
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

  function resize() {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    helpers.update(camera, controls.target, viewportEl.clientHeight);
    shellRef.current?.setGridScaleLabel?.(helpers.viewportGridScale);
    renderer.render(scene, camera);
    if (helpers.shouldRenderOverlay()) {
      renderer.autoClear = false;
      renderer.render(helpers.getOverlayScene(), camera);
      renderer.autoClear = true;
    }
  }
  animate();

  return { camera, renderer, controls, resize };
}

async function main() {
  setStatus('Loading stage…');
  const api = await checkApi();
  const stageManager = new StageManager(DEFAULT_STAGE_PROFILE);
  const helpers = new StageViewportHelpers(stageManager.scene, { stageManager });
  const timeline = new TimelineEngine();
  const motion = new MotionDirector({
    scene: stageManager.scene,
    engine: timeline,
    stageManager,
  });
  const groupStore = new MotionGroupStore();

  timeline.subscribe(() => {
    motion.apply(timeline.playheadSec);
  });

  /** @type {{ current: ReturnType<typeof mountEditorShell> | null }} */
  const shellRef = { current: null };
  const viewport = initViewport(stageManager, helpers, shellRef);

  /** @type {ReturnType<typeof createViewportInteraction> | null} */
  let interaction = null;

  if (timelineHost) {
    mountTimelineShell(timelineHost, {
      engine: timeline,
      getMotionKeyValue: (trackId) => motion.keyValueForTrack(trackId),
      onTrackSelect: (trackId, opt) => {
        const m = motion.findByTrackId(trackId);
        if (m) interaction?.selectMotion(m.id, opt);
      },
      onTrackRemove: (trackId) => {
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

  const refreshStatus = (extra = '') => setStatus(formatStatus(api, stageManager, extra));

  async function addMotionEntry(entry, extra = {}) {
    refreshStatus(`모션 로딩: ${entry.name}…`);
    const item = await motion.addFromUrl(entry.url, {
      name: entry.name,
      procedural: entry.procedural,
      color: entry.color,
      ...extra,
    });
    timeline.selectedTrackId = item.trackId;
    const track = timeline.getTrack(item.trackId);
    const firstKey = track?.keys.list()[0];
    if (firstKey) timeline.selectKeyframe(item.trackId, firstKey.id);
    else {
      timeline.selectedKeyframeId = null;
      timeline.emit('selection');
    }
    motion.apply(timeline.playheadSec);
    interaction?.selectMotion(item.id);
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

  async function addMotionFromPicker() {
    const pick = await pickMotionFbx();
    if (!pick?.url) return;
    try {
      const item = await addMotionEntry(pick);
      refreshStatus(`모션 추가: ${item.name}`);
    } catch (err) {
      console.error(err);
      refreshStatus(`모션 로드 실패: ${err.message}`);
    }
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

  const shell = mountEditorShell(wrapperEl, {
    stageManager,
    helpers,
    engine: timeline,
    groupStore,
    getMotion: (trackId) => motion.findByTrackId(trackId),
    onStagePick: (motionId) => interaction?.beginStagePick(motionId),
    onMotionExit: (motionId) => {
      interaction?.beginPointPick((pt) => {
        const item = motion.get(motionId);
        if (!item) return;
        applyMotionExitKeys({
          engine: timeline,
          motionItem: item,
          x: pt.x,
          z: pt.z,
        });
        motion.apply(timeline.playheadSec);
        refreshStatus('퇴장 키 추가 (opacity → 0)');
      }, '퇴장 위치 — 바닥 클릭 (Esc 취소)');
    },
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
    onZoom: (delta) => {
      zoomCamera(viewport.camera, viewport.controls, delta);
    },
    onKeyframeEdited: () => {
      motion.apply(timeline.playheadSec);
    },
    onAddMotion: async (entry) => {
      try {
        const item = await addMotionEntry(entry);
        refreshStatus(`모션 추가: ${item.name}`);
      } catch (err) {
        console.error(err);
        refreshStatus(`모션 로드 실패: ${err.message}`);
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
        refreshStatus(ok ? 'Undo' : 'Undo 없음');
        return;
      }
      if (action === 'edit:redo') {
        const ok = timeline.redo();
        motion.apply(timeline.playheadSec);
        refreshStatus(ok ? 'Redo' : 'Redo 없음');
        return;
      }
      if (action === 'edit:delete') {
        if (timeline.selectedTrackId && timeline.selectedKeyframeId) {
          timeline.removeKeyframe(timeline.selectedTrackId, timeline.selectedKeyframeId);
          refreshStatus('키 삭제');
          return;
        }
        refreshStatus(MENU_PHASE_HINTS[action]);
        return;
      }
      if (action === 'add:motion' || action === 'file:import:fbx') {
        addMotionFromPicker();
        return;
      }
      if (action === 'add:group' || action === 'show:panel') {
        refreshStatus(MENU_PHASE_HINTS[action]);
        return;
      }
      if (action === 'show:go') {
        const g = groupStore.getActive();
        if (g) deployGroup(g.id);
        else refreshStatus('활성 그룹 없음');
        return;
      }
      if (action === 'help:about') {
        refreshStatus(MENU_PHASE_HINTS[action]);
        return;
      }
      const hint = MENU_PHASE_HINTS[action] ?? '준비 중';
      refreshStatus(`메뉴 «${action}» → ${hint}`);
    },
    onApplyProfile: (widthM, depthM, extras = {}) => {
      stageManager.applyProfile({ widthM, depthM, ...extras });
      applyDefaultStageCamera(
        viewport.camera,
        viewport.controls,
        stageManager.stageType,
        stageManager.profile,
        stageManager,
      );
      shell.syncStagePanel();
      refreshStatus();
    },
    onStageTypeChange: async (type) => {
      refreshStatus('Loading…');
      shell.setStageBusy(true);
      try {
        await stageManager.setStageType(type);
        applyDefaultStageCamera(
          viewport.camera,
          viewport.controls,
          stageManager.stageType,
          stageManager.profile,
          stageManager,
        );
        shell.syncStagePanel();
        refreshStatus();
      } catch (err) {
        console.error(err);
        refreshStatus(`Load error: ${err.message}`);
      } finally {
        shell.setStageBusy(false);
      }
    },
    onChange: () => refreshStatus(),
    onStageFocusChange: () => {
      viewport.resize();
    },
  });
  shellRef.current = shell;

  bindViewportStageFocus(viewportEl);
  onStageFocusChange(() => {
    viewport.resize();
  });

  try {
    await stageManager.init();
    applyDefaultStageCamera(
      viewport.camera,
      viewport.controls,
      stageManager.stageType,
      stageManager.profile,
      stageManager,
    );
    shell.syncStagePanel();
    shell.syncHelperUi();
    refreshStatus();
  } catch (err) {
    console.error(err);
    refreshStatus(`Load error: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  setStatus(`Boot error: ${err.message}`);
});
