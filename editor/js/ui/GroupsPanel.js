import { loadMotionCatalog } from '../domain/motion/motionCatalog.js';
import { loadProjectAssets } from '../domain/project/projectAssets.js';
import {
  ensureGroupSegments,
  getGroupTotalDuration,
  inferGroupStartConfigured,
  normalizeGroupAnimation,
} from '../domain/motion/groupSegments.js';
import {
  renderSegmentStepList,
  KEYFRAME_APPLY_LABEL,
  GROUP_TRACK_DEPLOY_APPLY_LABEL,
} from './segmentStepUi.js';
import { isGroupDeployed } from '../domain/motion/applyGroupKeyframes.js';
import { normalizeColorHex } from '../domain/motion/walkLitePerformer.js';
import { repairGroupFromTimeline } from '../domain/project/sceneGroupRepair.js';

/**
 * Groups / Ensemble panel — v3 segment editor (이동/대기/퇴장 + 무대 픽).
 *
 * @param {{
 *   store: import('../domain/motion/MotionGroupStore.js').MotionGroupStore,
 *   onDeploy?: (groupId: string) => void | Promise<void>,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   onChange?: () => void,
 *   onGroupRename?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupColor?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupPresetApplied?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup, preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPickGroupPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     groupId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   getPresetStore?: () => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   getTimelineSnapshot?: () => object[],
 *   getFoldersSnapshot?: () => object[],
 *   getMotionsSnapshot?: () => object[],
 *   getMotionItem?: (id: string) => { object?: unknown } | null | undefined,
 *   getDefaultSpawn?: () => { fromX: number, fromZ: number, formationSpacing?: number },
 *   getSegmentStagePreview?: () => {
 *     begin: () => void,
 *     end: () => void,
 *     resetPreview: () => void,
 *     previewGroupStart: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup, draft: Record<string, any>) => void,
 *     previewGroupSegment: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup, segmentId: string, draft: Record<string, any>) => void,
 *     previewPosition: (pose: { x: number, z: number, rotY?: number, opacity?: number }) => void,
 *     previewPresetLocation?: (pose: { x: number, z: number, rotY?: number, opacity?: number }) => void,
 *   } | null,
 *   getProjectId?: () => string | null,
 * }} opts
 */
export function createGroupsPanelBody(opts) {
  const { store } = opts;
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-ens';
  root.innerHTML = `
    <div class="sb-ens-section sb-ens-section--groups">
      <div class="sb-ens-section-hd">
        <span class="sb-ens-section-title">그룹 등록</span>
        <div class="sb-ens-icon-actions">
          <button type="button" class="sb-ens-icon-btn acc" data-act="new" title="그룹 만들기">
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-ens-icon-btn edit" data-act="rename" title="이름 변경">
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-ens-icon-btn del" data-act="delete" title="삭제">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="sb-ens-groups-grid" data-role="groups"></div>
    </div>

    <div class="sb-ens-step sb-ens-step--reg">
      <div class="sb-ens-step-num">1 · 객체 등록</div>
      <div class="sb-ens-transfer">
        <div class="sb-ens-transfer-col">
          <div class="sb-ens-transfer-label">Characters</div>
          <div class="sb-ens-transfer-list" data-role="catalog" data-drop="unregister"></div>
        </div>
        <div class="sb-ens-transfer-mid">
          <button type="button" class="sb-ens-transfer-btn" data-act="register" title="선택 → 그룹에 등록">
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-ens-transfer-btn" data-act="unregister" title="그룹에서 선택 해제">
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
          </button>
        </div>
        <div class="sb-ens-transfer-col">
          <div class="sb-ens-transfer-label">등록 멤버</div>
          <div class="sb-ens-transfer-list" data-role="members" data-drop="register"></div>
        </div>
      </div>
    </div>

    <div class="sb-ens-step">
      <div class="sb-ens-step-num">2 · 그룹 애니메이션</div>
      <div class="sb-ens-segments" data-role="segments"></div>
    </div>
  `;

  const groupsEl = root.querySelector('[data-role="groups"]');
  const catalogEl = root.querySelector('[data-role="catalog"]');
  const membersEl = root.querySelector('[data-role="members"]');
  const segmentsEl = root.querySelector('[data-role="segments"]');

  /** @type {any[]} */
  let catalog = [];
  let catalogReady = false;
  /** @type {Set<number>} */
  const selectedSlots = new Set();
  /** @type {Set<string>} */
  const selectedMemberIds = new Set();

  async function loadCatalog() {
    const projectId = opts.getProjectId?.() || null;
    catalog = projectId
      ? await loadProjectAssets(projectId, 'character')
      : await loadMotionCatalog();
    catalogReady = true;
    renderCatalog();
  }

  function render() {
    const groups = store.list();
    const active = store.getActive();

    if (!groups.length) {
      groupsEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--grid">그룹 없음 · + 로 추가</span>';
    } else {
      groupsEl.innerHTML = groups.map((g, gi) => {
        const hex = normalizeColorHex(g.color, gi);
        const on = g.id === active?.id ? ' is-on' : '';
        return `
        <div class="sb-ens-group-cell${on}" data-group-wrap="${escapeAttr(g.id)}">
          <input type="color" class="sb-ens-group-color" data-grp-color="${escapeAttr(g.id)}"
            value="${escapeAttr(hex)}" title="그룹 색상" />
          <button type="button" class="sb-ens-tab${on}"
            data-act="select" data-id="${escapeAttr(g.id)}"
            style="--grp-accent:${escapeAttr(hex)}">${escapeHtml(g.name)}</button>
        </div>`;
      }).join('');
    }

    renderCatalog();
    renderMembers();
    if (active) tryRecoverGroupFromTimeline(active);
    renderSegments();
  }

  function tryRecoverGroupFromTimeline(active) {
    const tracks = opts.getTimelineSnapshot?.();
    if (!tracks?.length) return;
    const needsMembers = !active.members?.length;
    const span = (active.segments || []).reduce((s, seg) => s + (Number(seg.duration) || 0), 0);
    const needsSegs = !active.segments?.length
      || (active.segments.length === 1 && span <= 5.1);
    const needsFolder = !active.deployedFolderId;
    if (!needsMembers && !needsSegs && !needsFolder) return;
    const before = JSON.stringify({
      members: active.members,
      segments: active.segments,
      fromX: active.fromX,
      fromZ: active.fromZ,
      deployedFolderId: active.deployedFolderId,
    });
    repairGroupFromTimeline(
      active,
      tracks,
      opts.getMotionsSnapshot?.() || [],
      opts.getFoldersSnapshot?.() || [],
    );
    const after = JSON.stringify({
      members: active.members,
      segments: active.segments,
      fromX: active.fromX,
      fromZ: active.fromZ,
      deployedFolderId: active.deployedFolderId,
    });
    if (before !== after) opts.onChange?.();
  }

  function presetStagePreview(form) {
    const preview = opts.getSegmentStagePreview?.();
    preview?.previewPresetLocation?.({
      x: Number(form.x ?? form.fromX ?? form.anchorX) || 0,
      z: Number(form.z ?? form.fromZ ?? form.anchorZ) || 0,
      rotY: Number(form.rotY ?? form.fromRotY ?? form.toRotY) || 0,
      opacity: form.opacity ?? 1,
    });
  }

  function renderCatalog() {
    if (!catalogReady) {
      catalogEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--inline">불러오는 중…</span>';
      return;
    }
    if (!catalog.length) {
      catalogEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--inline">Characters 에셋 없음</span>';
      return;
    }
    catalogEl.innerHTML = catalog.map((entry, index) => {
      const label = entry.displayName || entry.name || `#${index + 1}`;
      const badge = entry.procedural ? ' *' : '';
      const on = selectedSlots.has(index) ? ' is-on' : '';
      const short = label.length > 14 ? `${label.slice(0, 13)}…` : label;
      return `
        <div class="sb-ens-pick-chip${on}" draggable="true" role="button" tabindex="0"
          data-act="slot" data-i="${index}" data-drag="catalog"
          title="${escapeAttr(label)}">${escapeHtml(short)}${badge}</div>`;
    }).join('');
  }

  function renderMembers() {
    const active = store.getActive();
    if (!active) {
      membersEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--inline">그룹 선택</span>';
      return;
    }
    if (!active.members?.length) {
      membersEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--inline">등록된 멤버 없음</span>';
      return;
    }
    membersEl.innerHTML = active.members.map((m, i) => {
      const on = selectedMemberIds.has(m.id) ? ' is-on' : '';
      const short = m.name.length > 12 ? `${m.name.slice(0, 11)}…` : m.name;
      return `
        <div class="sb-ens-pick-chip sb-ens-pick-chip--mem${on}" draggable="true" role="button" tabindex="0"
          data-act="member" data-id="${escapeAttr(m.id)}" data-drag="member"
          title="${escapeAttr(m.name)}">
          <span class="sb-ens-mem-n">${i + 1}</span>${escapeHtml(short)}
        </div>`;
    }).join('');
  }

  function renderSegments() {
    const active = store.getActive();
    if (!active) {
      segmentsEl.innerHTML = '<div class="sb-ens-empty">그룹을 선택하세요.</div>';
      return;
    }
    normalizeGroupAnimation(active);
    ensureGroupSegments(active);
    const configured = inferGroupStartConfigured(active);
    active.startConfigured = configured;
    const total = getGroupTotalDuration(active);
    const subtitle = configured
      ? `시작 ${Number(active.startTime || 0).toFixed(1)}s · 총 ${total.toFixed(1)}s`
      : '시작 위치를 설정한 뒤 + 로 구간을 추가하세요';

    const stagePreview = opts.getSegmentStagePreview?.();
    const groupHasTrack = opts.getMotionItem
      ? isGroupDeployed(active, (id) => opts.getMotionItem?.(id))
      : !!(active.deployedFolderId && active.members.some((m) => m.deployedMotionId));

    renderSegmentStepList(segmentsEl, {
      startConfigured: configured,
      subtitle,
      showFormation: true,
      applyLabel: groupHasTrack ? KEYFRAME_APPLY_LABEL : GROUP_TRACK_DEPLOY_APPLY_LABEL,
      getStart: () => active,
      getSegments: () => ensureGroupSegments(active),
      getPresetStore: () => opts.getPresetStore?.() ?? null,
      onPreviewBegin: () => stagePreview?.begin(),
      onPreviewEnd: () => stagePreview?.end(),
      onPreviewReset: () => stagePreview?.resetPreview(),
      onPreviewStart: (draft) => {
        const g = store.getActive();
        if (g) stagePreview?.previewGroupStart(g, draft);
      },
      onPreviewSegment: (segId, draft) => {
        const g = store.getActive();
        if (g) stagePreview?.previewGroupSegment(g, segId, draft);
      },
      onPreviewPreset: presetStagePreview,
      onPresetUpdated: (preset) => opts.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => opts.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => opts.onPresetRemoved?.(id),
      getPreviewMemberCount: () => Math.max(store.getActive()?.members?.length || 0, 1),
      getStagePreviewDeployed: () => store.getActive()?.members?.some((m) => m.deployedMotionId) ?? false,
      onEditStart: (commit) => {
        commit((patch) => {
          store.updateGroup(active.id, patch);
          if (patch.startConfigured) active.startConfigured = true;
        });
        renderSegments();
      },
      onEditSegment: (segId, commit) => {
        commit((patch) => store.updateSegment(active.id, segId, patch));
        renderSegments();
      },
      onAddSegment: (kind, atIndex) => {
        const seg = store.addSegment(active.id, kind, atIndex);
        renderSegments();
        return seg?.id ?? null;
      },
      onRemoveSegment: (segId) => {
        store.removeSegment(active.id, segId);
        renderSegments();
      },
      onMoveSegment: (segId, toIndex) => {
        store.moveSegment(active.id, segId, toIndex);
        renderSegments();
      },
      onPickPoint: (pick) => {
        opts.onPickGroupPoint?.({
          mode: pick.mode,
          groupId: active.id,
          segmentId: pick.segmentId,
          onPicked: (pt) => {
            if (pick.mode === 'from') {
              store.updateGroup(active.id, {
                fromX: roundCoord(pt.x),
                fromZ: roundCoord(pt.z),
                fromPresetId: null,
                startConfigured: true,
              });
            } else if (pick.segmentId) {
              store.updateSegment(active.id, pick.segmentId, {
                anchorX: roundCoord(pt.x),
                anchorZ: roundCoord(pt.z),
                anchorPresetId: null,
              });
            }
            pick.onPicked?.(pt);
            renderSegments();
            opts.onChange?.();
          },
          onCancelled: () => pick.onCancelled?.(),
        });
      },
      onChange: () => {
        opts.onChange?.();
      },
      onApply: async () => {
        const g = store.getActive();
        if (!g) {
          window.alert('그룹을 선택하세요.');
          return;
        }
        if (!g.members.length) {
          window.alert('멤버를 등록하세요.');
          return;
        }
        if (!g.startConfigured) {
          window.alert('먼저 시작 위치를 설정하세요.');
          return;
        }
        ensureGroupSegments(g);
        if (!g.segments?.length) {
          window.alert('적용할 구간이 없습니다. + 버튼으로 이동·대기·퇴장을 추가하세요.');
          return;
        }
        await opts.onDeploy?.(g.id);
        render();
      },
    });
  }

  root.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!t.matches?.('[data-grp-color]')) return;
    e.stopPropagation();
    const id = t.getAttribute('data-grp-color');
    const hex = /** @type {HTMLInputElement} */ (t).value;
    if (!id) return;
    store.updateGroup(id, { color: hex });
    const g = store.get(id);
    if (g) opts.onGroupColor?.(g);
    const wrap = groupsEl.querySelector(`[data-group-wrap="${CSS.escape(id)}"]`);
    const tab = wrap?.querySelector('.sb-ens-tab');
    if (tab instanceof HTMLElement) tab.style.setProperty('--grp-accent', hex);
  });

  root.addEventListener('change', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.matches?.('[data-grp-color]')) {
      e.stopPropagation();
      const id = t.getAttribute('data-grp-color');
      const hex = /** @type {HTMLInputElement} */ (t).value;
      if (!id) return;
      store.updateGroup(id, { color: hex });
      const g = store.get(id);
      if (g) opts.onGroupColor?.(g);
      opts.onChange?.();
      return;
    }
    const active = store.getActive();
    if (!active) return;
    if (t.matches?.('[data-grp]')) {
      const key = t.getAttribute('data-grp');
      let val = Number(/** @type {HTMLInputElement} */ (t).value);
      if (!key || !Number.isFinite(val)) return;
      if (key === 'opacity') val = clamp01(val);
      else if (key === 'fromX' || key === 'fromZ' || key === 'startTime') val = roundCoord(val);
      store.updateGroup(active.id, { [key]: val });
      opts.onChange?.();
      return;
    }
    if (t.matches?.('[data-seg]')) {
      const key = t.getAttribute('data-seg');
      const id = t.getAttribute('data-id');
      let val = Number(/** @type {HTMLInputElement} */ (t).value);
      if (!key || !id || !Number.isFinite(val)) return;
      if (key === 'anchorX' || key === 'anchorZ' || key === 'duration' || key === 'formationSpacing') {
        val = roundCoord(val);
      }
      store.updateSegment(active.id, id, { [key]: val });
      opts.onChange?.();
    }
  });

  function registerSlots(indices) {
    const active = store.getActive();
    if (!active) {
      window.alert('먼저 그룹을 선택하거나 만드세요.');
      return;
    }
    indices.forEach((i) => {
      const entry = catalog[i];
      if (entry) {
        store.addMember(active.id, {
          url: entry.url,
          name: entry.displayName || entry.name,
          procedural: entry.procedural,
          color: entry.color,
          catalogIndex: i,
        });
      }
    });
    selectedSlots.clear();
    render();
    opts.onChange?.();
  }

  function unregisterMembers(ids) {
    const active = store.getActive();
    if (!active) return;
    ids.forEach((id) => store.removeMember(active.id, id));
    selectedMemberIds.clear();
    render();
    opts.onChange?.();
  }

  const DND_MIME = 'application/x-sb-ens-dnd';

  /** @param {DragEvent} e */
  function onDragStart(e) {
    const chip = e.target.closest?.('[data-drag]');
    if (!chip || !(chip instanceof HTMLElement)) return;
    e.stopPropagation();
    const kind = chip.dataset.drag;
    let payload = /** @type {{ kind: string, ids: string[] }} */ ({ kind: '', ids: [] });
    if (kind === 'catalog') {
      const i = chip.dataset.i || '';
      const ids = (chip.dataset.i && selectedSlots.has(Number(chip.dataset.i)))
        ? [...selectedSlots].map(String)
        : [i];
      payload = { kind: 'catalog', ids };
    } else if (kind === 'member') {
      const id = chip.dataset.id || '';
      const ids = (id && selectedMemberIds.has(id))
        ? [...selectedMemberIds]
        : [id];
      payload = { kind: 'member', ids: ids.filter(Boolean) };
    } else {
      return;
    }
    const json = JSON.stringify(payload);
    e.dataTransfer?.setData(DND_MIME, json);
    e.dataTransfer?.setData('text/plain', json);
    e.dataTransfer.effectAllowed = 'move';
    chip.classList.add('is-dragging');
  }

  /** @param {DragEvent} e */
  function onDragEnd(e) {
    const chip = e.target.closest?.('[data-drag]');
    chip?.classList.remove('is-dragging');
    catalogEl.classList.remove('is-drag-over');
    membersEl.classList.remove('is-drag-over');
  }

  /** @param {DragEvent} e */
  function onDragOver(e) {
    const list = e.currentTarget;
    if (!(list instanceof HTMLElement) || !list.dataset.drop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.classList.add('is-drag-over');
  }

  /** @param {DragEvent} e */
  function onDragLeave(e) {
    const list = e.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    const related = /** @type {Node | null} */ (e.relatedTarget);
    if (related && list.contains(related)) return;
    list.classList.remove('is-drag-over');
  }

  /** @param {DragEvent} e */
  function onDrop(e) {
    const list = e.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    list.classList.remove('is-drag-over');
    e.preventDefault();
    e.stopPropagation();
    const drop = list.dataset.drop;
    const raw = e.dataTransfer?.getData(DND_MIME) || e.dataTransfer?.getData('text/plain');
    if (!raw || !drop) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (drop === 'register' && payload.kind === 'catalog') {
      registerSlots(payload.ids.map(Number).filter((n) => Number.isFinite(n)));
      return;
    }
    if (drop === 'unregister' && payload.kind === 'member') {
      unregisterMembers(payload.ids.filter(Boolean));
    }
  }

  catalogEl.addEventListener('dragstart', onDragStart);
  membersEl.addEventListener('dragstart', onDragStart);
  catalogEl.addEventListener('dragend', onDragEnd);
  membersEl.addEventListener('dragend', onDragEnd);
  catalogEl.addEventListener('dragover', onDragOver);
  membersEl.addEventListener('dragover', onDragOver);
  catalogEl.addEventListener('dragleave', onDragLeave);
  membersEl.addEventListener('dragleave', onDragLeave);
  catalogEl.addEventListener('drop', onDrop);
  membersEl.addEventListener('drop', onDrop);

  root.addEventListener('keydown', (e) => {
    const chip = e.target.closest?.('.sb-ens-pick-chip[role="button"]');
    if (!chip || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    chip.click();
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'new') {
      const spawn = opts.getDefaultSpawn?.() || { fromX: 0, fromZ: 50 };
      store.create(undefined, spawn);
      selectedSlots.clear();
      selectedMemberIds.clear();
      render();
      opts.onChange?.();
      return;
    }
    if (act === 'select') {
      store.setActive(btn.dataset.id);
      selectedSlots.clear();
      selectedMemberIds.clear();
      render();
      return;
    }
    if (act === 'rename') {
      const active = store.getActive();
      if (!active) return;
      const name = window.prompt('그룹 이름', active.name);
      if (name) {
        active.name = name.trim() || active.name;
        render();
        opts.onGroupRename?.(active);
        opts.onChange?.();
      }
      return;
    }
    if (act === 'delete') {
      const active = store.getActive();
      if (!active) return;
      if (!window.confirm(`그룹 «${active.name}» 삭제?`)) return;
      store.remove(active.id);
      render();
      opts.onChange?.();
      return;
    }
    if (act === 'slot') {
      const i = Number(btn.dataset.i);
      if (selectedSlots.has(i)) selectedSlots.delete(i);
      else selectedSlots.add(i);
      renderCatalog();
      return;
    }
    if (act === 'register') {
      const active = store.getActive();
      if (!active) {
        window.alert('먼저 그룹을 만드세요.');
        return;
      }
      if (!selectedSlots.size) {
        window.alert('캐릭터를 선택하세요.');
        return;
      }
      registerSlots([...selectedSlots].sort((a, b) => a - b));
      return;
    }
    if (act === 'member') {
      const id = btn.dataset.id;
      if (selectedMemberIds.has(id)) selectedMemberIds.delete(id);
      else selectedMemberIds.add(id);
      renderMembers();
      return;
    }
    if (act === 'unregister') {
      const active = store.getActive();
      if (!active) return;
      if (!selectedMemberIds.size) {
        window.alert('해제할 멤버를 선택하세요.');
        return;
      }
      unregisterMembers([...selectedMemberIds]);
      return;
    }
  });

  root.addEventListener('dblclick', (e) => {
    const chip = e.target.closest?.('.sb-ens-pick-chip');
    if (!chip) return;
    if (chip.closest('[data-role="catalog"]')) {
      const i = Number(chip.dataset.i);
      if (Number.isFinite(i)) registerSlots([i]);
    } else if (chip.closest('[data-role="members"]')) {
      const id = chip.dataset.id;
      if (id) unregisterMembers([id]);
    }
  });

  loadCatalog().then(render);
  render();

  return {
    root,
    /** Full panel re-render (keeps selection); optional catalog reload */
    render: (optsReload = {}) => {
      if (optsReload.reloadCatalog !== false) {
        loadCatalog().then(render);
      } else {
        render();
      }
    },
    /** Assets upload/delete — catalog only, no panel wipe if unchanged */
    refreshCatalog: async () => {
      await loadCatalog();
      renderCatalog();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

/** Display / store stage coords without overflowing inputs */
function roundCoord(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function fmtCoord(n) {
  return String(roundCoord(n));
}
