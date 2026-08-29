import { loadMotionCatalog } from '../domain/motion/motionCatalog.js';
import { loadProjectAssets } from '../domain/project/projectAssets.js';
import {
  SEGMENT_KIND_LABELS,
  SEGMENT_EASING,
  SEGMENT_EASING_LABELS,
  ensureGroupSegments,
  getGroupTotalDuration,
  normalizeRotYDeg,
} from '../domain/motion/groupSegments.js';
import { FORMATION_LABELS, FORMATION_TYPES } from '../domain/motion/groupFormation.js';
import { normalizeColorHex } from '../domain/motion/walkLitePerformer.js';

/**
 * Groups / Ensemble panel — v3 segment editor (이동/대기/퇴장 + 무대 픽).
 *
 * @param {{
 *   store: import('../domain/motion/MotionGroupStore.js').MotionGroupStore,
 *   onDeploy?: (groupId: string) => void | Promise<void>,
 *   onChange?: () => void,
 *   onGroupRename?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onGroupColor?: (group: import('../domain/motion/MotionGroupStore.js').MotionGroup) => void,
 *   onPickGroupPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     groupId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   getDefaultSpawn?: () => { fromX: number, fromZ: number, formationSpacing?: number },
 *   getProjectId?: () => string | null,
 * }} opts
 */
export function createGroupsPanelBody(opts) {
  const { store } = opts;
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-ens';
  root.innerHTML = `
    <div class="sb-ens-toolbar">
      <button type="button" class="sb-chip acc" data-act="new">+ 그룹 만들기</button>
      <button type="button" class="sb-chip" data-act="rename">이름 변경</button>
      <button type="button" class="sb-chip del" data-act="delete">삭제</button>
    </div>
    <div class="sb-ens-groups" data-role="groups"></div>

    <div class="sb-ens-step">
      <div class="sb-ens-step-num">1 · 객체 등록</div>
      <div class="sb-ens-subtitle" data-role="reg-sub">FBX 선택 → [그룹에 등록]</div>
      <div class="sb-ens-list" data-role="catalog"></div>
      <div class="sb-ens-actions">
        <button type="button" class="sb-chip acc" data-act="register">선택 → 그룹에 등록</button>
      </div>
      <div class="sb-ens-subtitle">등록된 멤버 · 클릭 선택</div>
      <div class="sb-ens-list sb-ens-members" data-role="members"></div>
      <div class="sb-ens-actions">
        <button type="button" class="sb-chip del" data-act="unregister">선택 해제 (그룹 밖으로)</button>
      </div>
    </div>

    <div class="sb-ens-step">
      <div class="sb-ens-step-num">2 · 그룹 애니메이션 (구간)</div>
      <div class="sb-ens-subtitle" data-role="seg-sub">이동·대기·퇴장 구간 · 무대 클릭으로 위치</div>
      <div class="sb-ens-segments" data-role="segments"></div>
      <div class="sb-ens-actions">
        <button type="button" class="sb-chip seg-move" data-act="seg-move">+ 이동</button>
        <button type="button" class="sb-chip seg-hold" data-act="seg-hold">+ 대기</button>
        <button type="button" class="sb-chip seg-exit" data-act="seg-exit">+ 퇴장</button>
      </div>
    </div>

    <div class="sb-ens-step">
      <div class="sb-ens-step-num">3 · 배치</div>
      <div class="sb-ens-actions">
        <button type="button" class="sb-chip acc go" data-act="go">그룹 GO (스테이지 배치)</button>
      </div>
    </div>
  `;

  const groupsEl = root.querySelector('[data-role="groups"]');
  const catalogEl = root.querySelector('[data-role="catalog"]');
  const membersEl = root.querySelector('[data-role="members"]');
  const segmentsEl = root.querySelector('[data-role="segments"]');
  const regSub = root.querySelector('[data-role="reg-sub"]');
  const segSub = root.querySelector('[data-role="seg-sub"]');

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
      groupsEl.innerHTML = '<span class="sb-ens-empty">그룹이 없습니다. [+ 그룹 만들기]를 누르세요.</span>';
    } else {
      groupsEl.innerHTML = groups.map((g, gi) => {
        const hex = normalizeColorHex(g.color, gi);
        const on = g.id === active?.id ? ' is-on' : '';
        return `
        <div class="sb-ens-group-tab-wrap${on}" data-group-wrap="${escapeAttr(g.id)}">
          <input type="color" class="sb-ens-group-color" data-grp-color="${escapeAttr(g.id)}"
            value="${escapeAttr(hex)}" title="그룹 모션 객체 색상" />
          <button type="button" class="sb-ens-tab${on}"
            data-act="select" data-id="${escapeAttr(g.id)}"
            style="border-color:${escapeAttr(hex)}">${escapeHtml(g.name)}</button>
        </div>`;
      }).join('');
    }

    regSub.textContent = active
      ? `FBX 선택 → [그룹에 등록] · ${active.name}`
      : 'FBX 선택 → [그룹에 등록] · 그룹 선택';

    if (active) {
      const total = getGroupTotalDuration(active);
      segSub.textContent = `시작 ${Number(active.startTime || 0).toFixed(1)}s · 총 ${total.toFixed(1)}s · 무대 클릭으로 위치`;
    } else {
      segSub.textContent = '이동·대기·퇴장 구간 · 무대 클릭으로 위치';
    }

    renderCatalog();
    renderMembers();
    renderSegments();
  }

  function renderCatalog() {
    if (!catalogReady) {
      catalogEl.innerHTML = '<div class="sb-ens-empty">목록 불러오는 중…</div>';
      return;
    }
    if (!catalog.length) {
      catalogEl.innerHTML = '<div class="sb-ens-empty">Characters 에셋이 없습니다.</div>';
      return;
    }
    catalogEl.innerHTML = catalog.map((entry, index) => {
      const num = index + 1;
      const label = entry.displayName || entry.name || `#${num}`;
      const badge = entry.procedural ? '<span class="sb-ens-badge">테스터</span>' : '';
      const on = selectedSlots.has(index) ? ' is-on' : '';
      return `
        <button type="button" class="sb-ens-row${on}" data-act="slot" data-i="${index}">
          <span class="sb-ens-row-num">${num}</span>
          <span class="sb-ens-row-name">${escapeHtml(label)}${badge}</span>
          <span class="sb-ens-row-st">OPEN</span>
        </button>`;
    }).join('');
  }

  function renderMembers() {
    const active = store.getActive();
    if (!active?.members?.length) {
      membersEl.innerHTML = '<div class="sb-ens-empty">그룹을 만든 뒤 FBX를 선택하고 [그룹에 등록]하세요.</div>';
      return;
    }
    membersEl.innerHTML = active.members.map((m, i) => {
      const on = selectedMemberIds.has(m.id) ? ' is-on' : '';
      return `
        <button type="button" class="sb-ens-row${on}" data-act="member" data-id="${escapeAttr(m.id)}">
          <span class="sb-ens-row-num">${i + 1}</span>
          <span class="sb-ens-row-name">${escapeHtml(m.name)}</span>
          <span class="sb-ens-row-st">MEMBER</span>
        </button>`;
    }).join('');
  }

  function renderSegments() {
    const active = store.getActive();
    if (!active) {
      segmentsEl.innerHTML = '<div class="sb-ens-empty">그룹을 선택하세요.</div>';
      return;
    }
    const segs = ensureGroupSegments(active);
    const selId = store.selectedSegmentId || segs[0]?.id;

    let html = `
      <div class="sb-ens-seg-card sb-ens-seg-start">
        <div class="sb-ens-seg-hd"><strong>시작 위치</strong></div>
        <div class="sb-ens-seg-body">
          <div class="sb-ens-seg-fields">
            <label>시작 시각<input type="number" data-grp="startTime" step="0.1" min="0" value="${fmtCoord(active.startTime || 0)}" /></label>
            <label>From X<input type="number" data-grp="fromX" step="0.1" value="${fmtCoord(active.fromX || 0)}" /></label>
            <label>From Z<input type="number" data-grp="fromZ" step="0.1" value="${fmtCoord(active.fromZ || 0)}" /></label>
            <label>Opacity<input type="number" data-grp="opacity" min="0" max="1" step="0.01" value="${clamp01(active.opacity ?? 1)}" title="GO 시 멤버 키 opacity (퇴장 끝은 0)" /></label>
          </div>
          <button type="button" class="sb-stage-pick-btn sb-ens-pick" data-act="pick-from">
            <span class="sb-stage-pick-ico">◎</span>
            <span><strong>시작 위치 (무대 클릭)</strong><small>버튼을 누른 뒤 무대 클릭</small></span>
          </button>
          <div class="sb-ens-seg-row">
            <div class="sb-ens-subtitle">포메이션</div>
            <div class="sb-ens-seg-fmt" data-role="from-fmt"></div>
          </div>
          <div class="sb-ens-seg-row">
            <div class="sb-ens-subtitle">Y 회전</div>
            <div class="sb-ens-seg-rot" data-role="from-rot"></div>
          </div>
        </div>
      </div>
    `;

    segs.forEach((seg, idx) => {
      const kind = seg.kind || 'move';
      const isHold = kind === 'hold';
      const isExit = kind === 'exit';
      const isSel = seg.id === selId;
      const selected = isSel ? ' is-selected' : ' is-collapsed';
      const axLbl = isExit ? '퇴장 X' : '끝 X';
      const azLbl = isExit ? '퇴장 Z' : '끝 Z';
      const pickLbl = isExit ? '퇴장 위치' : '끝 위치';
      const summary = isHold
        ? `${fmtCoord(seg.duration || 0)}s · 대기`
        : `${fmtCoord(seg.duration || 0)}s · X ${fmtCoord(seg.anchorX || 0)} · Z ${fmtCoord(seg.anchorZ || 0)}`;

      html += `
        <div class="sb-ens-seg-card sb-ens-seg--${escapeAttr(kind)}${selected}" data-seg-card="${escapeAttr(seg.id)}">
          <div class="sb-ens-seg-hd">
            <strong>${idx + 1}. ${SEGMENT_KIND_LABELS[kind] || kind}</strong>
            <span class="sb-chip sb-seg-kind ${escapeAttr(kind)}">${SEGMENT_KIND_LABELS[kind] || kind}</span>
            <span class="sb-ens-seg-meta">${FORMATION_LABELS[seg.formation] || seg.formation || ''}</span>
            ${segs.length > 1 ? `<button type="button" class="sb-chip del" data-act="seg-rm" data-id="${escapeAttr(seg.id)}">삭제</button>` : ''}
          </div>
          <div class="sb-ens-seg-summary">${summary}</div>
          <div class="sb-ens-seg-body">
            <div class="sb-ens-seg-fields">
              <label>Duration<input type="number" data-seg="duration" data-id="${escapeAttr(seg.id)}" step="0.1" min="0.1" value="${fmtCoord(seg.duration || 3)}" /></label>
              ${isHold ? '' : `
                <label>${axLbl}<input type="number" data-seg="anchorX" data-id="${escapeAttr(seg.id)}" step="0.1" value="${fmtCoord(seg.anchorX || 0)}" /></label>
                <label>${azLbl}<input type="number" data-seg="anchorZ" data-id="${escapeAttr(seg.id)}" step="0.1" value="${fmtCoord(seg.anchorZ || 0)}" /></label>
              `}
            </div>
            ${isHold ? '<div class="sb-ens-empty">자세 유지 (직전 위치·포메이션)</div>' : `
              <button type="button" class="sb-stage-pick-btn sb-ens-pick" data-act="pick-seg" data-id="${escapeAttr(seg.id)}">
                <span class="sb-stage-pick-ico">◎</span>
                <span><strong>${pickLbl} (무대 클릭)</strong><small>버튼을 누른 뒤 무대 클릭</small></span>
              </button>
              <div class="sb-ens-seg-row">
                <div class="sb-ens-subtitle">포메이션</div>
                <div class="sb-ens-seg-fmt" data-fmt="${escapeAttr(seg.id)}"></div>
              </div>
              <div class="sb-ens-seg-row sb-ens-seg-row--inline">
                <label class="sb-ens-inline-field">간격
                  <input type="number" data-seg="formationSpacing" data-id="${escapeAttr(seg.id)}" step="1" min="0.5" value="${fmtCoord(seg.formationSpacing || 36)}" title="멤버 중심 간격 · 포메이션과 함께 적용" />
                </label>
              </div>
              <div class="sb-ens-seg-row">
                <div class="sb-ens-subtitle">Y 회전</div>
                <div class="sb-ens-seg-rot" data-rot="${escapeAttr(seg.id)}"></div>
              </div>
              <div class="sb-ens-seg-row">
                <div class="sb-ens-subtitle">Easing</div>
                <div class="sb-ens-seg-ease" data-ease="${escapeAttr(seg.id)}"></div>
              </div>
            `}
          </div>
        </div>`;
    });

    segmentsEl.innerHTML = html;

    // formation / rot / ease chips
    mountFormationChips(
      segmentsEl.querySelector('[data-role="from-fmt"]'),
      active.fromFormation || active.formation || 'grid',
      (fmt) => {
        store.updateGroup(active.id, { fromFormation: fmt, formation: fmt });
        render();
        opts.onChange?.();
      },
    );
    mountRotChips(
      segmentsEl.querySelector('[data-role="from-rot"]'),
      active.fromRotY || 0,
      (deg) => {
        store.updateGroup(active.id, { fromRotY: deg });
        render();
        opts.onChange?.();
      },
    );

    segs.forEach((seg) => {
      if (seg.kind === 'hold') return;
      mountFormationChips(
        segmentsEl.querySelector(`[data-fmt="${CSS.escape(seg.id)}"]`),
        seg.formation || 'grid',
        (fmt) => {
          store.updateSegment(active.id, seg.id, { formation: fmt });
          render();
          opts.onChange?.();
        },
      );
      mountRotChips(
        segmentsEl.querySelector(`[data-rot="${CSS.escape(seg.id)}"]`),
        seg.toRotY || 0,
        (deg) => {
          store.updateSegment(active.id, seg.id, { toRotY: deg });
          render();
          opts.onChange?.();
        },
      );
      mountEaseChips(
        segmentsEl.querySelector(`[data-ease="${CSS.escape(seg.id)}"]`),
        seg.easing || 'smooth',
        (ease) => {
          store.updateSegment(active.id, seg.id, { easing: ease });
          render();
          opts.onChange?.();
        },
      );
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
    if (tab instanceof HTMLElement) tab.style.borderColor = hex;
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
        window.alert('FBX를 선택하세요.');
        return;
      }
      [...selectedSlots].sort((a, b) => a - b).forEach((i) => {
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
      [...selectedMemberIds].forEach((id) => store.removeMember(active.id, id));
      selectedMemberIds.clear();
      render();
      opts.onChange?.();
      return;
    }
    if (act === 'seg-move' || act === 'seg-hold' || act === 'seg-exit') {
      const active = store.getActive();
      if (!active) {
        window.alert('그룹을 선택하세요.');
        return;
      }
      const kind = act === 'seg-move' ? 'move' : act === 'seg-hold' ? 'hold' : 'exit';
      store.addSegment(active.id, kind);
      render();
      opts.onChange?.();
      return;
    }
    if (act === 'seg-rm') {
      const active = store.getActive();
      if (!active || !btn.dataset.id) return;
      store.removeSegment(active.id, btn.dataset.id);
      render();
      opts.onChange?.();
      return;
    }
    if (act === 'pick-from') {
      const active = store.getActive();
      if (!active) return;
      opts.onPickGroupPoint?.({
        mode: 'from',
        groupId: active.id,
        onPicked: (pt) => {
          store.updateGroup(active.id, { fromX: roundCoord(pt.x), fromZ: roundCoord(pt.z) });
          render();
          opts.onChange?.();
        },
      });
      return;
    }
    if (act === 'pick-seg') {
      const active = store.getActive();
      const segId = btn.dataset.id;
      if (!active || !segId) return;
      store.setSelectedSegmentId(segId);
      opts.onPickGroupPoint?.({
        mode: 'segmentAnchor',
        groupId: active.id,
        segmentId: segId,
        onPicked: (pt) => {
          store.updateSegment(active.id, segId, { anchorX: roundCoord(pt.x), anchorZ: roundCoord(pt.z) });
          render();
          opts.onChange?.();
        },
      });
      return;
    }
    if (act === 'go') {
      const active = store.getActive();
      if (!active) {
        window.alert('그룹을 선택하세요.');
        return;
      }
      if (!active.members.length) {
        window.alert('멤버를 등록하세요.');
        return;
      }
      ensureGroupSegments(active);
      btn.disabled = true;
      try {
        await opts.onDeploy?.(active.id);
      } finally {
        btn.disabled = false;
        render();
      }
    }
  });

  // select segment card
  segmentsEl.addEventListener('click', (e) => {
    const card = e.target.closest?.('[data-seg-card]');
    if (!card || e.target.closest?.('[data-act], input, button')) return;
    store.setSelectedSegmentId(card.getAttribute('data-seg-card'));
    renderSegments();
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

function mountFormationChips(host, current, onPick) {
  if (!host) return;
  host.innerHTML = FORMATION_TYPES.map((t) => `
    <button type="button" class="sb-chip${t === current ? ' on' : ''}" data-fmt-pick="${t}">${FORMATION_LABELS[t]}</button>
  `).join('');
  host.querySelectorAll('[data-fmt-pick]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(b.getAttribute('data-fmt-pick'));
    });
  });
}

function mountRotChips(host, currentDeg, onPick) {
  if (!host) return;
  const cur = normalizeRotYDeg(currentDeg);
  const opts = [0, 30, 60, 90, 120, 150, 180, -30, -60, -90];
  host.innerHTML = opts.map((d) => `
    <button type="button" class="sb-chip${normalizeRotYDeg(d) === cur ? ' on' : ''}" data-rot-pick="${d}">${d}°</button>
  `).join('');
  host.querySelectorAll('[data-rot-pick]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(normalizeRotYDeg(Number(b.getAttribute('data-rot-pick'))));
    });
  });
}

function mountEaseChips(host, current, onPick) {
  if (!host) return;
  const kinds = [SEGMENT_EASING.smooth, SEGMENT_EASING.linear];
  host.innerHTML = kinds.map((k) => `
    <button type="button" class="sb-chip${k === current ? ' on' : ''}" data-ease-pick="${k}">${SEGMENT_EASING_LABELS[k]}</button>
  `).join('');
  host.querySelectorAll('[data-ease-pick]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(b.getAttribute('data-ease-pick'));
    });
  });
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
