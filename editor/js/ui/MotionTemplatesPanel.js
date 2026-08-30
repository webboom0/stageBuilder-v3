import { snapKeyframeTimeSec } from '../domain/timeline/KeyframeStore.js';
import {
  draftToMotionTemplate,
  renderKeyframeTemplateSteps,
  templateToDraft,
} from './keyframeTemplateUi.js';

/**
 * 패턴 라이브러리 패널 — 패턴별 저장·편집, 선택 트랙에 적용.
 */
export function createMotionTemplatesPanelBody(opts) {
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-ens';
  root.innerHTML = `
    <div class="sb-ens-section sb-ens-section--groups">
      <div class="sb-ens-section-hd">
        <span class="sb-ens-section-title">패턴 등록</span>
        <div class="sb-ens-icon-actions">
          <button type="button" class="sb-ens-icon-btn acc" data-act="new" title="패턴 만들기">
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-ens-icon-btn edit" data-act="rename" title="이름 변경">
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-ens-icon-btn del" data-act="delete-macro" title="삭제">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="sb-ens-groups-grid" data-role="macros"></div>
    </div>

    <div class="sb-ens-step">
      <div class="sb-ens-step-num">1 · 키프레임 패턴</div>
      <div class="sb-ens-track-hint" data-role="apply-hint"></div>
      <div class="sb-ens-segments" data-role="steps"></div>
    </div>`;

  const macrosEl = root.querySelector('[data-role="macros"]');
  const stepsEl = root.querySelector('[data-role="steps"]');
  const applyHintEl = root.querySelector('[data-role="apply-hint"]');

  /** @type {{ label: string, startTimeSec?: number, keyframes: import('./keyframeTemplateUi.js').DraftKeyframe[] } | null} */
  let draft = null;

  function getStore() {
    return opts.getTemplateStore();
  }

  function loadActiveDraft() {
    const store = getStore();
    const active = store?.getActive();
    if (!active) {
      draft = null;
      return;
    }
    draft = templateToDraft(active);
    draft.label = active.label || draft.label || '';
    draft.startTimeSec = 0;
  }

  async function persistDraft() {
    if (!draft) return;
    const store = getStore();
    const active = store?.getActive();
    if (!active) return;
    const tpl = draftToMotionTemplate({ ...draft, label: draft.label || active.label });
    if (!tpl) {
      store.update(active.id, {
        label: draft.label || active.label,
        keyframes: draft.keyframes.length ? [{
          timeOffset: 0,
          offsetX: draft.keyframes[0].offsetX,
          offsetZ: draft.keyframes[0].offsetZ,
          deltaRotY: draft.keyframes[0].deltaRotY,
          opacity: draft.keyframes[0].opacity,
          visible: draft.keyframes[0].visible !== false,
        }] : active.keyframes,
      });
    } else {
      store.update(active.id, tpl);
    }
    await opts.onSaveTemplate?.();
  }

  function getSelectedApplyTarget() {
    const trackId = opts.engine.selectedTrackId;
    if (!trackId) return null;
    const track = opts.engine.getTrack(trackId);
    if (!track || track.kind === 'light' || track.kind === 'audio') return null;
    const item = opts.motion.findByTrackId(trackId);
    if (!item) return null;
    return { track, item };
  }

  function renderApplyHint() {
    if (!applyHintEl) return;
    const sel = getSelectedApplyTarget();
    if (!sel) {
      applyHintEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--inline">적용할 Character / Stage 트랙을 선택하세요</span>';
      return;
    }
    const locked = sel.track.locked ? ' · 잠김' : '';
    applyHintEl.innerHTML = `<span class="sb-seg-steps-sub">적용 대상 · ${escapeHtml(sel.track.name || '트랙')}${locked}</span>`;
  }

  function renderMacros() {
    if (!macrosEl) return;
    const store = getStore();
    const items = store?.list() ?? [];
    const active = store?.getActive();
    if (!items.length) {
      macrosEl.innerHTML = '<span class="sb-ens-empty sb-ens-empty--grid">패턴 없음 · + 로 추가</span>';
      return;
    }
    macrosEl.innerHTML = items.map((t) => {
      const on = t.id === active?.id ? ' is-on' : '';
      const short = t.label.length > 10 ? `${t.label.slice(0, 9)}…` : t.label;
      return `
        <button type="button" class="sb-ens-tab${on}" data-act="select-macro" data-id="${escapeAttr(t.id)}"
          title="${escapeAttr(t.label)}">${escapeHtml(short)}</button>`;
    }).join('');
  }

  function renderSteps() {
    if (!stepsEl) return;
    const store = getStore();
    const active = store?.getActive();
    if (!active) {
      stepsEl.innerHTML = '<div class="sb-ens-empty">패턴을 선택하거나 + 로 추가하세요.</div>';
      return;
    }
    renderKeyframeTemplateSteps(stepsEl, {
      getDraft: () => draft,
      macroLibraryMode: true,
      onChange: () => renderSteps(),
      onPersist: () => persistDraft(),
      onApply: () => applyActiveMacro(),
      getPresetStore: opts.getPresetStore,
      onPickPoint: opts.onPickPoint,
      onPresetUpdated: opts.onPresetUpdated,
      onPositionPresetsChanged: opts.onPositionPresetsChanged,
      onPresetRemoved: opts.onPresetRemoved,
    });
  }

  function resolveStartPose(motionItem) {
    const obj = motionItem.object;
    return {
      fromX: obj.position.x,
      fromZ: obj.position.z,
      fromRotY: (obj.rotation.y * 180) / Math.PI,
    };
  }

  function selectedMotionTargets() {
    const ids = new Set();
    const selTracks = opts.engine.selectedTrackIds?.size
      ? [...opts.engine.selectedTrackIds]
      : (opts.engine.selectedTrackId ? [opts.engine.selectedTrackId] : []);
    for (const trackId of selTracks) {
      const track = opts.engine.getTrack(trackId);
      if (!track || track.kind === 'light' || track.kind === 'audio') continue;
      const item = opts.motion.findByTrackId(trackId);
      if (item) ids.add(item.id);
    }
    if (!ids.size && opts.engine.selectedTrackId) {
      const item = opts.motion.findByTrackId(opts.engine.selectedTrackId);
      if (item) ids.add(item.id);
    }
    return [...ids];
  }

  async function applyActiveMacro() {
    const store = getStore();
    const active = store?.getActive();
    if (!active || !draft) {
      window.alert('먼저 패턴을 선택하거나 + 로 만드세요.');
      return;
    }
    await persistDraft();
    const tpl = store.get(active.id);
    if (!tpl || (tpl.keyframes?.length ?? 0) < 2) {
      window.alert('적용할 키가 없습니다.\n+ 로 이동·대기·퇴장 키를 추가하세요.');
      return;
    }

    const motionIds = selectedMotionTargets();
    if (!motionIds.length) {
      window.alert('적용할 Character / Stage 트랙을 선택하세요.');
      return;
    }

    let motions = 0;
    const startTime = snapKeyframeTimeSec(opts.engine.playheadSec, opts.engine.fps);

    for (const motionId of motionIds) {
      const item = opts.motion.get(motionId);
      if (!item?.object) continue;
      const pose = { ...resolveStartPose(item), startTime };
      const ok = await opts.applyToMotion?.(motionId, active.id, pose);
      if (ok) motions += 1;
    }

    if (!motions) {
      window.alert('적용에 실패했습니다. 트랙이 잠겨 있지 않은지 확인하세요.');
      return;
    }

    opts.onApplyTemplate?.({ motions });
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-act]');
    if (!btn) return;
    const store = getStore();
    if (!store) return;

    if (btn.dataset.act === 'new') {
      const n = store.list().length + 1;
      const name = window.prompt('패턴 이름', `패턴 ${n}`);
      if (name === null) return;
      const label = name.trim() || `패턴 ${n}`;
      store.create(label);
      loadActiveDraft();
      void opts.onSaveTemplate?.();
      render();
      return;
    }

    if (btn.dataset.act === 'select-macro' && btn.dataset.id) {
      store.setActive(btn.dataset.id);
      loadActiveDraft();
      render();
      return;
    }

    if (btn.dataset.act === 'rename') {
      const active = store.getActive();
      if (!active) {
        window.alert('이름을 바꿀 패턴을 선택하세요.');
        return;
      }
      const name = window.prompt('패턴 이름', active.label);
      if (name === null) return;
      const label = name.trim() || active.label;
      store.update(active.id, { label });
      if (draft) draft.label = label;
      void opts.onSaveTemplate?.();
      render();
      return;
    }

    if (btn.dataset.act === 'delete-macro') {
      const active = store.getActive();
      if (!active) {
        window.alert('삭제할 패턴을 선택하세요.');
        return;
      }
      if (!window.confirm(`패턴 «${active.label}» 삭제?`)) return;
      store.remove(active.id);
      loadActiveDraft();
      void opts.onSaveTemplate?.();
      render();
    }
  });

  opts.engine.subscribe?.((ev) => {
    if (ev.type === 'selection') {
      renderApplyHint();
    }
  });

  function render() {
    loadActiveDraft();
    renderApplyHint();
    renderMacros();
    renderSteps();
  }

  /** @param {string} id */
  function selectPattern(id) {
    const store = getStore();
    if (!store?.get(id)) return;
    store.setActive(id);
    loadActiveDraft();
    render();
  }

  render();

  return {
    root,
    render: () => { loadActiveDraft(); render(); },
    selectPattern,
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
