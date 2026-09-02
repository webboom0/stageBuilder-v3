import {
  SEGMENT_KIND,
  SEGMENT_KIND_LABELS,
  SEGMENT_EASING,
  SEGMENT_EASING_LABELS,
  normalizeRotYDeg,
} from '../domain/motion/groupSegments.js';
import {
  formatPresetLabel,
  formatStartStepSummary,
  formatSegmentStepSummary,
  normalizePositionPreset,
} from '../domain/motion/positionPresets.js';
import { matchPresetByLabel } from '../domain/motion/aiPatternDraft.js';
import {
  loadAiPatternDefaults,
  saveAiPatternDefaults,
} from '../domain/motion/aiPatternDefaults.js';
import { mountRotYChips } from './rotYChips.js';
import { FORMATION_LABELS, FORMATION_TYPES } from '../domain/motion/groupFormation.js';

/** Unified apply button label (track already exists) */
export const KEYFRAME_APPLY_LABEL = '키프레임 적용';
/** First deploy: create timeline tracks then bake keyframes */
export const GROUP_TRACK_DEPLOY_APPLY_LABEL = '트랙 추가 및 키프레임 적용';

/**
 * @typedef {{
 *   startConfigured: boolean,
 *   getStart: () => Record<string, any>,
 *   getSegments: () => any[],
 *   showFormation?: boolean,
 *   getPresetStore?: () => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   subtitle?: string,
 *   onEditStart: (save: (patch: Record<string, any>) => void) => void,
 *   onEditSegment: (segId: string, save: (patch: Record<string, any>) => void) => void,
 *   onAddSegment: (kind: 'move'|'hold'|'exit', atIndex?: number) => string | null | void,
 *   onRemoveSegment: (segId: string) => void,
 *   onMoveSegment?: (segId: string, toIndex: number) => void,
 *   onApply?: () => void | Promise<void>,
 *   applyLabel?: string,
 *   onSyncFromObject?: () => void,
 *   onAiGenerate?: (prompt: string, opt: { apply: boolean }) => void | Promise<void>,
 *   aiEnabled?: boolean,
 *   onPickPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *     onCancelled?: () => void,
 *   }) => void,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreviewStart?: (draft: Record<string, any>) => void,
 *   onPreviewSegment?: (segmentId: string, draft: Record<string, any>) => void,
 *   getPreviewMemberCount?: () => number,
 *   getStagePreviewDeployed?: () => boolean,
 *   onChange?: () => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 * }} SegmentStepListContext
 */

/**
 * Render compact step-based segment editor into container.
 * @param {HTMLElement} container
 * @param {SegmentStepListContext} ctx
 */
export function renderSegmentStepList(container, ctx) {
  const start = ctx.getStart();
  const segments = ctx.getSegments();
  const configured = !!ctx.startConfigured || segments.length > 0;

  let html = '';
  if (ctx.subtitle) {
    html += `<div class="sb-seg-steps-sub">${escapeHtml(ctx.subtitle)}</div>`;
  }

  html += configured
    ? `<button type="button" class="sb-seg-step-btn sb-seg-step-btn--filled sb-seg-step-btn--start sb-seg-step-btn--position" data-step="start">
        <span class="sb-seg-step-kind">시작 위치</span>
        <span class="sb-seg-step-detail">${escapeHtml(formatStartStepSummary(start))}</span>
      </button>`
    : `<button type="button" class="sb-seg-step-btn sb-seg-step-btn--empty sb-seg-step-btn--start sb-seg-step-btn--position" data-step="start">
        <span class="sb-seg-step-kind">시작 위치</span>
        <span class="sb-seg-step-hint">클릭하여 시작 시각·위치 설정</span>
      </button>`;

  if (configured) {
    html += `<button type="button" class="sb-seg-step-insert" data-act="insert-seg" data-at="0"
      title="여기에 구간 삽입">+</button>`;
  }

  segments.forEach((seg, idx) => {
    const kind = seg.kind || 'move';
    const typeClass = kind === 'hold' ? 'sb-seg-step-btn--duration' : 'sb-seg-step-btn--position';
    html += `
      <button type="button" class="sb-seg-step-btn sb-seg-step-btn--filled sb-seg-step-btn--${escapeAttr(kind)} ${typeClass} sb-seg-step-btn--draggable"
        data-step="seg" data-id="${escapeAttr(seg.id)}" data-idx="${idx}" draggable="true"
        title="드래그하여 순서 변경">
        <span class="sb-seg-step-grip" aria-hidden="true">⋮⋮</span>
        <span class="sb-seg-step-kind">${idx + 1}. ${SEGMENT_KIND_LABELS[kind] || kind}</span>
        <span class="sb-seg-step-detail">${escapeHtml(formatSegmentStepSummary(seg))}</span>
        ${segments.length > 1 ? `<span class="sb-seg-step-rm" data-act="rm-seg" data-id="${escapeAttr(seg.id)}" title="삭제">×</span>` : ''}
      </button>`;
    html += `<button type="button" class="sb-seg-step-insert" data-act="insert-seg" data-at="${idx + 1}"
      title="여기에 구간 삽입">+</button>`;
  });

  if (ctx.onAiGenerate && ctx.aiEnabled !== false) {
    html += `<div class="sb-seg-ai" data-role="ai-box">
      <div class="sb-seg-ai-head">
        <span class="sb-seg-ai-title">AI 패턴</span>
        <span class="sb-seg-ai-hint">@위치 · 이동/대기/퇴장 색 표시</span>
        <div class="sb-seg-ai-head-actions">
          <button type="button" class="sb-seg-ai-icon-btn" data-act="ai-defaults" title="기본 Duration">⏱</button>
          <button type="button" class="sb-seg-ai-icon-btn" data-act="ai-help" title="AI 패턴 사용법" aria-label="AI 패턴 사용법">?</button>
        </div>
      </div>
      <div class="sb-seg-ai-input-wrap" data-role="ai-input-wrap">
        <div class="sb-ai-mention-highlight" data-role="ai-highlight" aria-hidden="true"></div>
        <textarea class="sb-seg-ai-input sb-seg-ai-input--overlay" data-role="ai-prompt" rows="3"
          spellcheck="false"
          placeholder="예: @등장에서 @중앙으로 이동, @중앙에서 90도 회전, 1분 30초 대기 후 @퇴장으로 퇴장"></textarea>
      </div>
      <div class="sb-seg-ai-key-preview" data-role="ai-key-preview" hidden></div>
      <div class="sb-seg-ai-actions">
        <button type="button" class="sb-chip" data-act="ai-draft">초안 만들기</button>
        <button type="button" class="sb-chip acc" data-act="ai-apply">초안 만들고 적용</button>
      </div>
      <div class="sb-seg-ai-status" data-role="ai-status" hidden></div>
    </div>`;
  }

  html += `<div class="sb-seg-steps-actions">`;
  if (ctx.onSyncFromObject) {
    html += `<button type="button" class="sb-chip" data-act="sync-start">현재 위치 → 시작</button>`;
  }
  if (ctx.onApply) {
    const applyLabel = ctx.applyLabel ?? KEYFRAME_APPLY_LABEL;
    html += `<button type="button" class="sb-chip acc go" data-act="apply">${escapeHtml(applyLabel)}</button>`;
  }
  html += `</div>`;

  container.innerHTML = html;

  container.querySelector('[data-step="start"]')?.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-act]')) return;
    openStartEditDialog({
      start,
      showFormation: !!ctx.showFormation,
      presetStore: ctx.getPresetStore?.() ?? null,
      onPickPoint: ctx.onPickPoint,
      onSyncFromObject: ctx.onSyncFromObject,
      onPreviewBegin: ctx.onPreviewBegin,
      onPreviewEnd: ctx.onPreviewEnd,
      onPreviewReset: ctx.onPreviewReset,
      onPreview: (draft) => ctx.onPreviewStart?.(draft),
      getPreviewMemberCount: ctx.getPreviewMemberCount,
      getStagePreviewDeployed: ctx.getStagePreviewDeployed,
      onChange: ctx.onChange,
      onPreviewPreset: ctx.onPreviewPreset,
      onPresetUpdated: ctx.onPresetUpdated,
      onPositionPresetsChanged: ctx.onPositionPresetsChanged,
      onPresetRemoved: ctx.onPresetRemoved,
      onSave: (patch) => {
        patch.startConfigured = true;
        ctx.onEditStart((apply) => apply(patch));
        ctx.onChange?.();
      },
    });
  });

  container.querySelectorAll('[data-step="seg"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-act="rm-seg"]')) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const seg = segments.find((s) => s.id === id);
      if (!seg) return;
      openSegmentEditFromCtx(ctx, seg);
    });
  });

  container.querySelectorAll('[data-act="rm-seg"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (id) ctx.onRemoveSegment(id);
      ctx.onChange?.();
    });
  });

  container.querySelectorAll('[data-act="insert-seg"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const at = Number(btn.getAttribute('data-at'));
      if (!Number.isFinite(at)) return;
      openKindPicker((kind) => {
        const segId = ctx.onAddSegment(kind, at);
        ctx.onChange?.();
        if (!segId) return;
        requestAnimationFrame(() => {
          const seg = ctx.getSegments().find((s) => s.id === segId);
          if (seg) openSegmentEditFromCtx(ctx, seg);
        });
      }, '구간 삽입');
    });
  });

  if (ctx.onMoveSegment) {
    wireStepReorder(container, {
      stepSelector: '[data-step="seg"][draggable="true"]',
      onDrop: (fromId, toId) => {
        const list = ctx.getSegments();
        const toIdx = list.findIndex((s) => s.id === toId);
        if (toIdx < 0) return;
        ctx.onMoveSegment?.(fromId, toIdx);
        ctx.onChange?.();
      },
    });
  }

  container.querySelector('[data-act="sync-start"]')?.addEventListener('click', () => {
    ctx.onSyncFromObject?.();
    ctx.onChange?.();
  });

  const applyBtn = container.querySelector('[data-act="apply"]');
  applyBtn?.addEventListener('click', async () => {
    if (!(applyBtn instanceof HTMLButtonElement)) return;
    applyBtn.disabled = true;
    try {
      await ctx.onApply?.();
    } finally {
      applyBtn.disabled = false;
    }
  });

  const aiPrompt = /** @type {HTMLTextAreaElement | null} */ (
    container.querySelector('[data-role="ai-prompt"]')
  );
  const aiStatus = /** @type {HTMLElement | null} */ (
    container.querySelector('[data-role="ai-status"]')
  );
  /** @param {boolean} apply */
  async function runAi(apply) {
    if (!ctx.onAiGenerate || !aiPrompt) return;
    const prompt = aiPrompt.value.trim();
    if (!prompt) {
      if (aiStatus) {
        aiStatus.hidden = false;
        aiStatus.textContent = '설명을 입력하세요.';
      }
      return;
    }
    const draftBtn = container.querySelector('[data-act="ai-draft"]');
    const applyAiBtn = container.querySelector('[data-act="ai-apply"]');
    if (draftBtn instanceof HTMLButtonElement) draftBtn.disabled = true;
    if (applyAiBtn instanceof HTMLButtonElement) applyAiBtn.disabled = true;
    if (aiStatus) {
      aiStatus.hidden = false;
      aiStatus.textContent = apply ? '생성 후 적용 중…' : '초안 생성 중…';
    }
    try {
      await ctx.onAiGenerate(prompt, { apply });
    } catch (err) {
      if (aiStatus) {
        aiStatus.hidden = false;
        aiStatus.textContent = err?.message || '생성 실패';
      }
    } finally {
      if (draftBtn instanceof HTMLButtonElement) draftBtn.disabled = false;
      if (applyAiBtn instanceof HTMLButtonElement) applyAiBtn.disabled = false;
    }
  }
  container.querySelector('[data-act="ai-draft"]')?.addEventListener('click', () => {
    void runAi(false);
  });
  container.querySelector('[data-act="ai-apply"]')?.addEventListener('click', () => {
    void runAi(true);
  });

  const aiBox = container.querySelector('[data-role="ai-box"]');
  if (aiPrompt && aiBox) {
    wireAiPatternInput(aiPrompt, () => ctx.getPresetStore?.() ?? null, aiBox);
  }
  container.querySelector('[data-act="ai-help"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAiPatternHelp(/** @type {HTMLElement} */ (e.currentTarget));
  });
  container.querySelector('[data-act="ai-defaults"]')?.addEventListener('click', () => {
    openAiPatternDefaultsDialog();
  });
}

/** @param {SegmentStepListContext} ctx @param {Record<string, any>} seg */
function openSegmentEditFromCtx(ctx, seg) {
  const id = seg.id;
  openSegmentEditDialog({
    segment: seg,
    showFormation: !!ctx.showFormation,
    presetStore: ctx.getPresetStore?.() ?? null,
    onPickPoint: ctx.onPickPoint,
    onPreviewBegin: ctx.onPreviewBegin,
    onPreviewEnd: ctx.onPreviewEnd,
    onPreviewReset: ctx.onPreviewReset,
    onPreview: (draft) => ctx.onPreviewSegment?.(id, draft),
    getPreviewMemberCount: ctx.getPreviewMemberCount,
    getStagePreviewDeployed: ctx.getStagePreviewDeployed,
    onChange: ctx.onChange,
    onPreviewPreset: ctx.onPreviewPreset,
    onPresetUpdated: ctx.onPresetUpdated,
    onPositionPresetsChanged: ctx.onPositionPresetsChanged,
    onPresetRemoved: ctx.onPresetRemoved,
    onSave: (patch) => {
      ctx.onEditSegment(id, (apply) => apply(patch));
      ctx.onChange?.();
    },
  });
}

/**
 * Mount saved-position chips for Properties panel.
 * @param {HTMLElement} host
 * @param {{
 *   presetStore: import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onApplyPreset: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPickStage?: (onPicked: (pt: { x: number, z: number }) => void, onCancelled?: () => void) => void,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onCaptureHint?: () => { x: number, z: number, rotY?: number, opacity?: number } | null,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   onChange?: () => void,
 *   variant?: 'bar' | 'compact' | 'inline',
 *   hideLabel?: boolean,
 *   chipActions?: boolean,
 *   activePresetId?: string | null,
 * }} opts
 */
export function mountPositionPresetBar(host, opts) {
  if (!host) return;
  const store = opts.presetStore;
  const presets = store?.list() ?? [];
  const compact = opts.variant === 'compact';
  const inline = opts.variant === 'inline';
  const hideLabel = !!opts.hideLabel;
  const chipActions = opts.chipActions !== false;
  const activeId = opts.activePresetId ?? null;
  const chipsHtml = renderPresetChipsHtml(presets, { actions: chipActions, activePresetId: activeId });

  host.innerHTML = inline
    ? `
    <div class="sb-pos-preset-chips sb-pos-preset-chips--inline">
      ${chipsHtml}
      <button type="button" class="sb-chip sb-pos-save" data-act="save-pos" title="공통 위치 추가">+</button>
    </div>`
    : compact
    ? `
    <div class="sb-pos-preset-bar sb-pos-preset-bar--compact">
      <span class="sb-pos-preset-label">위치 프리셋</span>
      <div class="sb-pos-preset-chips" data-role="chips">
        ${presets.length ? chipsHtml : '<span class="sb-pos-empty">없음</span>'}
        <button type="button" class="sb-chip sb-pos-save" data-act="save-pos" title="공통 위치 추가">+ 추가</button>
      </div>
    </div>`
    : hideLabel
    ? `
    <div class="sb-pos-preset-bar sb-pos-preset-bar--bare">
      <div class="sb-pos-preset-chips" data-role="chips">
        ${presets.length ? chipsHtml : '<span class="sb-ens-empty sb-pos-empty">프리셋 없음</span>'}
        <button type="button" class="sb-chip sb-pos-save" data-act="save-pos">+ 위치 추가</button>
      </div>
    </div>`
    : `
    <div class="sb-pos-preset-bar">
      <div class="sb-pos-preset-label">위치 프리셋</div>
      <div class="sb-pos-preset-chips" data-role="chips">
        ${presets.length ? chipsHtml : '<span class="sb-ens-empty sb-pos-empty">프리셋 없음</span>'}
        <button type="button" class="sb-chip sb-pos-save" data-act="save-pos">+ 위치 추가</button>
      </div>
    </div>`;

  wirePresetChipEvents(host, store, {
    onApply: (p) => opts.onApplyPreset(p),
    onChange: () => opts.onChange?.(),
    onPositionPresetsChanged: () => opts.onPositionPresetsChanged?.(),
    onPresetRemoved: (id) => opts.onPresetRemoved?.(id),
    onRefresh: () => mountPositionPresetBar(host, opts),
    onPickStage: opts.onPickStage,
    onPickPoint: opts.onPickPoint,
    onCaptureHint: opts.onCaptureHint,
    onPreviewBegin: opts.onPreviewBegin,
    onPreviewEnd: opts.onPreviewEnd,
    onPreviewReset: opts.onPreviewReset,
    onPreview: opts.onPreview,
    onPreviewPreset: opts.onPreviewPreset,
    onPresetUpdated: opts.onPresetUpdated,
  });

  host.querySelector('[data-act="save-pos"]')?.addEventListener('click', () => {
    openPositionPresetEditor({
      store,
      onPickStage: opts.onPickStage,
      onPickPoint: opts.onPickPoint,
      onCaptureHint: opts.onCaptureHint,
      onPreviewBegin: opts.onPreviewBegin,
      onPreviewEnd: opts.onPreviewEnd,
    onPreviewReset: opts.onPreviewReset,
      onPreview: opts.onPreview,
      onPreviewPreset: opts.onPreviewPreset,
      onPresetUpdated: opts.onPresetUpdated,
      onPresetRemoved: opts.onPresetRemoved,
      onSaved: () => {
        opts.onChange?.();
        opts.onPositionPresetsChanged?.();
        mountPositionPresetBar(host, opts);
      },
    });
  });
}

/**
 * @param {import('../domain/motion/positionPresets.js').PositionPreset[]} presets
 * @param {{ actions?: boolean, activePresetId?: string | null }} [options]
 */
function renderPresetChipsHtml(presets, options = {}) {
  const actions = options.actions !== false;
  const activeId = options.activePresetId ?? null;
  return presets.map((p) => {
    const linked = activeId && p.id === activeId;
    const chip = `<button type="button" class="sb-chip sb-pos-chip${linked ? ' on' : ''}" data-preset="${escapeAttr(p.id)}"
        title="${escapeAttr(formatPresetLabel(p))}${linked ? ' · 연결됨' : ''}">${escapeHtml(p.label)}</button>`;
    if (!actions) return chip;
    return `
    <span class="sb-pos-chip-wrap" data-preset-wrap="${escapeAttr(p.id)}">
      ${chip}
      <button type="button" class="sb-pos-chip-act" data-edit-preset="${escapeAttr(p.id)}" title="수정">✎</button>
      <button type="button" class="sb-pos-chip-act del" data-del-preset="${escapeAttr(p.id)}" title="삭제">×</button>
    </span>`;
  }).join('');
}

/**
 * @param {HTMLElement} host
 * @param {import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null} store
 * @param {{
 *   onApply: (p: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onChange?: () => void,
 *   onRefresh: () => void,
 *   onPickStage?: (onPicked: (pt: { x: number, z: number }) => void, onCancelled?: () => void) => void,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 * }} opts
 */
function wirePresetChipEvents(host, store, opts) {
  host.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = store?.get(btn.getAttribute('data-preset'));
      if (p) opts.onApply(p);
    });
  });
  host.querySelectorAll('[data-edit-preset]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-edit-preset');
      const p = id ? store?.get(id) : null;
      if (!p) return;
      openPositionPresetEditor({
        store,
        preset: p,
        onPickStage: opts.onPickStage,
        onPickPoint: opts.onPickPoint,
        onCaptureHint: opts.onCaptureHint,
        onPreviewBegin: opts.onPreviewBegin,
        onPreviewEnd: opts.onPreviewEnd,
        onPreviewReset: opts.onPreviewReset,
        onPreview: opts.onPreview,
        onPreviewPreset: opts.onPreviewPreset,
        onPresetUpdated: opts.onPresetUpdated,
        onPresetRemoved: opts.onPresetRemoved,
        onSaved: () => {
          opts.onChange?.();
          opts.onPositionPresetsChanged?.();
          opts.onRefresh();
        },
      });
    });
  });
  host.querySelectorAll('[data-del-preset]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-del-preset');
      const p = id ? store?.get(id) : null;
      if (!p || !store) return;
      if (!window.confirm(`위치 프리셋 «${p.label}» 삭제?`)) return;
      opts.onPresetRemoved?.(id);
      store.remove(id);
      opts.onChange?.();
      opts.onPositionPresetsChanged?.();
      opts.onRefresh();
    });
  });
}

/** @param {{ onPreview?: (...args: any[]) => void, onPreviewPreset?: (...args: any[]) => void }} opts */
function stagePreviewEnabled(opts) {
  return !!(opts.onPreview || opts.onPreviewPreset);
}

/**
 * @param {{
 *   store: import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   preset?: import('../domain/motion/positionPresets.js').PositionPreset | null,
 *   initial?: Partial<import('../domain/motion/positionPresets.js').PositionPreset>,
 *   onPickStage?: (onPicked: (pt: { x: number, z: number }) => void, onCancelled?: () => void) => void,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onCaptureHint?: () => { x: number, z: number, rotY?: number, opacity?: number } | null,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   onSaved?: () => void,
 * }} opts
 */
function pickCoord(initial, preset, hint) {
  const n = initial ?? preset ?? hint;
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

function openPositionPresetEditor(opts) {
  const store = opts.store;
  if (!store) return;
  const isEdit = !!opts.preset;
  const hint = opts.onCaptureHint?.();
  const draft = {
    label: opts.initial?.label ?? opts.preset?.label ?? '',
    x: pickCoord(opts.initial?.x, opts.preset?.x, hint?.x),
    z: pickCoord(opts.initial?.z, opts.preset?.z, hint?.z),
    rotY: normalizeRotYDeg(opts.initial?.rotY ?? opts.preset?.rotY ?? hint?.rotY ?? 0),
    opacity: clamp01(opts.initial?.opacity ?? opts.preset?.opacity ?? hint?.opacity ?? 1),
  };

  const dlg = createPresetDialogShell(isEdit ? '위치 프리셋 수정' : '위치 프리셋 추가', {
    showPreview: stagePreviewEnabled(opts),
  });
  const body = dlg.querySelector('.sb-modal-body');
  body.innerHTML = `
    <div class="sb-preset-form">
      <label class="sb-preset-name">이름
        <input type="text" data-f="label" maxlength="32" placeholder="예: 등장, 퇴장, A구역"
          value="${escapeAttr(draft.label)}" />
      </label>
      <div class="sb-seg-pick-row sb-preset-pick-row">
        <div class="sb-preset-pos-line">
          <div class="sb-seg-pick-pos-fields sb-ens-seg-fields">
            <label>X<input type="number" data-f="x" step="0.1" value="${fmt(draft.x)}" /></label>
            <label>Z<input type="number" data-f="z" step="0.1" value="${fmt(draft.z)}" /></label>
          </div>
          <button type="button" class="sb-chip sb-seg-pick-chip" data-act="pick-stage" title="무대에서 직접 지정">◎ 무대</button>
        </div>
      </div>
      <p class="sb-preset-hint">이름과 X/Z를 입력하거나 무대 클릭으로 좌표를 지정한 뒤 저장하세요.</p>
    </div>`;

  body.querySelector('[data-act="pick-stage"]')?.addEventListener('click', () => {
    if (!opts.onPickStage && !opts.onPickPoint) {
      window.alert('무대 지정은 에디터 뷰포트에서 사용할 수 있습니다.');
      return;
    }
    const snap = readPresetEditorForm(body, isEdit ? { rotY: opts.preset?.rotY, opacity: opts.preset?.opacity } : {});
    if (opts.onPickPoint) {
      runStagePointPick(dlg, opts, { mode: 'from' }, (pt) => {
        const initial = { ...snap, x: pt ? roundCoord(pt.x) : snap.x, z: pt ? roundCoord(pt.z) : snap.z };
        return { ...opts, preset: opts.preset, initial };
      }, (resume) => openPositionPresetEditor(resume));
      return;
    }
    runStagePointPick(dlg, {
      onPickPoint: (pick) => {
        opts.onPickStage?.(
          (pt) => pick.onPicked?.(pt),
          () => pick.onCancelled?.(),
        );
      },
    }, { mode: 'from' }, (pt) => {
      const initial = { ...snap, x: pt ? roundCoord(pt.x) : snap.x, z: pt ? roundCoord(pt.z) : snap.z };
      return { ...opts, preset: opts.preset, initial };
    }, (resume) => openPositionPresetEditor(resume));
  });

  const previewCb = opts.onPreviewPreset ?? opts.onPreview;
  const flushPreviewCore = () => {
    const form = readPresetEditorForm(body, { rotY: draft.rotY, opacity: draft.opacity });
    previewCb?.(form);
  };
  const preview = setupStagePreviewControl(dlg, {
    onPreview: previewCb,
    onPreviewBegin: opts.onPreviewBegin,
    onPreviewEnd: opts.onPreviewEnd,
    onPreviewReset: opts.onPreviewReset,
  }, flushPreviewCore);
  const flushPreview = () => preview.flush();
  const endPreview = () => preview.end();
  body.querySelectorAll('[data-f="x"], [data-f="z"]').forEach((input) => {
    input.addEventListener('input', flushPreview);
    input.addEventListener('change', flushPreview);
  });

  const releasePreview = () => {
    endPreview();
    opts.onPreviewReset?.();
  };

  bindDialogSave(dlg, () => {
    const form = readPresetEditorForm(body, { rotY: draft.rotY, opacity: draft.opacity });
    if (!form.label.trim()) {
      window.alert('위치 이름을 입력하세요.');
      return;
    }
    let saved = null;
    if (isEdit && opts.preset) {
      saved = store.update(opts.preset.id, form);
    } else {
      saved = store.add(form);
    }
    closeDialog(dlg);
    if (isEdit && saved) opts.onPresetUpdated?.(saved);
    opts.onSaved?.();
  });

  if (isEdit && opts.preset) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'sb-chip del';
    delBtn.dataset.act = 'delete';
    delBtn.textContent = '삭제';
    dlg.querySelector('.sb-modal-foot')?.prepend(delBtn);
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`위치 프리셋 «${opts.preset.label}» 삭제?`)) return;
      opts.onPresetRemoved?.(opts.preset.id);
      store.remove(opts.preset.id);
      closeDialog(dlg);
      opts.onSaved?.();
    });
  }

  wireDialogActions(dlg);
  mountSegDialogDrag(dlg);
  showDialog(dlg, { onClose: releasePreview });
  flushPreview();
}

/** @param {HTMLElement} body @param {{ rotY?: number, opacity?: number }} [preserve] */
function readPresetEditorForm(body, preserve = {}) {
  const labelEl = body.querySelector('[data-f="label"]');
  const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : '';
  const num = (field) => {
    const el = body.querySelector(`[data-f="${field}"]`);
    return el instanceof HTMLInputElement ? Number(el.value) : NaN;
  };
  return {
    label: label || '위치',
    x: roundCoord(num('x')),
    z: roundCoord(num('z')),
    rotY: normalizeRotYDeg(preserve.rotY ?? 0),
    opacity: clamp01(preserve.opacity ?? 1),
  };
}

function createPresetDialogShell(title, shellOpts = {}) {
  let backdrop = document.getElementById('sb-preset-edit-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sb-preset-edit-backdrop';
    backdrop.className = 'sb-modal-backdrop sb-modal-backdrop--seg';
    backdrop.innerHTML = `
      <div class="sb-modal sb-seg-edit-modal sb-preset-edit-modal" role="dialog" aria-modal="true">
        <div class="sb-modal-head">
          <strong data-role="title"></strong>
          <button type="button" data-act="cancel" aria-label="닫기">×</button>
        </div>
        <div class="sb-modal-body"></div>
        <div class="sb-modal-foot sb-modal-foot--preset"></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-act="cancel"]')) closeDialog(backdrop);
    });
    backdrop.querySelector('.sb-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }
  backdrop.querySelector('[data-role="title"]').textContent = title;
  updateSegDialogFoot(backdrop, !!shellOpts.showPreview);
  resetSegDialogPosition(backdrop);
  mountSegDialogDrag(backdrop);
  return backdrop;
}

/**
 * @param {{
 *   start: Record<string, any>,
 *   showFormation?: boolean,
 *   presetStore: import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onSyncFromObject?: () => void,
 *   onChange?: () => void,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onSave: (patch: Record<string, any>) => void,
 *   getPreviewMemberCount?: () => number,
 *   getStagePreviewDeployed?: () => boolean,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 * }} opts
 */
export function openStartEditDialog(opts) {
  const draft = {
    startTime: Number(opts.start.startTime ?? 0),
    fromX: Number(opts.start.fromX ?? 0),
    fromZ: Number(opts.start.fromZ ?? 0),
    fromRotY: normalizeRotYDeg(opts.start.fromRotY ?? 0),
    opacity: clamp01(opts.start.opacity ?? 1),
    fromFormation: opts.start.fromFormation || opts.start.formation || 'line',
    fromPresetId: opts.start.fromPresetId || null,
  };

  const dlg = createDialogShell('시작 위치', { showPreview: !!opts.onPreview });
  const body = dlg.querySelector('.sb-modal-body');

  body.innerHTML = buildStartFormHtml(draft, !!opts.showFormation, !!opts.macroMode, !!opts.absolutePattern);

  const flushPreviewCore = () => {
    readFormIntoDraft(body, draft);
    opts.onPreview?.({
      ...draft,
      _previewMemberCount: Math.max(opts.getPreviewMemberCount?.() ?? 0, 1),
    });
  };
  const preview = setupStagePreviewControl(dlg, opts, flushPreviewCore);
  const previewFromForm = (form) => {
    opts.onPreview?.({
      ...draft,
      ...form,
      fromX: form.fromX ?? form.x ?? draft.fromX,
      fromZ: form.fromZ ?? form.z ?? draft.fromZ,
      fromRotY: form.fromRotY ?? form.rotY ?? draft.fromRotY,
      anchorX: form.anchorX ?? form.x ?? draft.anchorX,
      anchorZ: form.anchorZ ?? form.z ?? draft.anchorZ,
      toRotY: form.toRotY ?? form.rotY ?? draft.toRotY,
      opacity: form.opacity ?? draft.opacity,
      _previewMemberCount: Math.max(opts.getPreviewMemberCount?.() ?? 0, 1),
    });
  };
  const pickRowOpts = {
    getActivePresetId: () => draft.fromPresetId,
    onSelect: (p) => {
      draft.fromX = p.x;
      draft.fromZ = p.z;
      draft.fromRotY = p.rotY;
      draft.opacity = p.opacity;
      draft.fromPresetId = p.id;
      syncFormFromDraft(body, draft, true);
      flushPreview();
    },
    onCaptureHint: () => ({
      x: Number(body.querySelector('[data-f="fromX"]')?.value) || 0,
      z: Number(body.querySelector('[data-f="fromZ"]')?.value) || 0,
      rotY: draft.fromRotY,
      opacity: draft.opacity,
    }),
    onPickStage: () => {
      readFormIntoDraft(body, draft);
      runStagePointPick(dlg, opts, { mode: 'from' }, (pt) => {
        const start = { ...opts.start, ...draft, fromPresetId: pt ? null : draft.fromPresetId };
        if (pt) {
          start.fromX = roundCoord(pt.x);
          start.fromZ = roundCoord(pt.z);
        }
        return { ...opts, start };
      }, (resume) => openStartEditDialog(resume));
    },
    onPickPoint: opts.onPickPoint,
    onPresetPickStage: (onPicked) => {
      opts.onPickPoint?.({
        mode: 'from',
        onPicked: (pt) => onPicked(pt),
      });
    },
    onPresetsChanged: () => {
      refreshPickRow();
      opts.onChange?.();
      opts.onPositionPresetsChanged?.();
    },
    onPreviewBegin: opts.onPreviewBegin,
    onPreviewEnd: opts.onPreviewEnd,
    onPreviewReset: opts.onPreviewReset,
    onPreview: previewFromForm,
    onPreviewPreset: opts.onPreviewPreset,
    onPresetUpdated: opts.onPresetUpdated,
    onPresetRemoved: opts.onPresetRemoved,
  };
  const refreshPickRow = () => {
    mountPresetPickRow(body.querySelector('[data-role="pick-row"]'), opts.presetStore, pickRowOpts);
  };
  const flushPreview = () => {
    preview.flush();
    refreshPickRow();
  };
  refreshPickRow();

  if (opts.showFormation) {
    mountRotFormationRow(body.querySelector('[data-role="rot-fmt"]'), {
      rotY: draft.fromRotY,
      formation: draft.fromFormation,
      onRotY: (deg) => { draft.fromRotY = deg; flushPreview(); },
      onFormation: (f) => { draft.fromFormation = f; flushPreview(); },
    });
  } else {
    mountRotYChips(body.querySelector('[data-role="rot-only"]'), draft.fromRotY, (deg) => {
      draft.fromRotY = deg;
      flushPreview();
    }, { compact: true });
  }

  wireNumericFields(body, draft, {
    startTime: 'startTime',
    fromX: 'fromX',
    fromZ: 'fromZ',
  }, flushPreview, 'fromPresetId');
  wireOpacitySlider(body, flushPreview);

  body.querySelector('[data-act="sync-obj"]')?.addEventListener('click', () => {
    opts.onSyncFromObject?.();
    closeDialog(dlg);
  });

  bindDialogSave(dlg, () => {
    readFormIntoDraft(body, draft);
    opts.onSave({ ...draft, startConfigured: true });
    closeDialog(dlg);
  });
  wireDialogActions(dlg);
  mountSegDialogDrag(dlg);
  showDialog(dlg, { onClose: () => { preview.end(); opts.onPreviewReset?.(); } });
  flushPreview();
}

/**
 * @param {{
 *   segment: Record<string, any>,
 *   showFormation?: boolean,
 *   presetStore: import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onChange?: () => void,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onSave: (patch: Record<string, any>) => void,
 *   getPreviewMemberCount?: () => number,
 *   getStagePreviewDeployed?: () => boolean,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 * }} opts
 */
export function openSegmentEditDialog(opts) {
  const seg = opts.segment;
  const kind = seg.kind || 'move';
  const isHold = kind === 'hold';
  const draft = {
    duration: Number(seg.duration ?? 3),
    anchorX: Number(seg.anchorX ?? 0),
    anchorZ: Number(seg.anchorZ ?? 0),
    toRotY: normalizeRotYDeg(seg.toRotY ?? 0),
    easing: seg.easing || 'smooth',
    formation: seg.formation || 'line',
    formationSpacing: Number(seg.formationSpacing ?? 36),
    anchorPresetId: seg.anchorPresetId || null,
    opacity: clamp01(seg.opacity ?? 1),
  };

  const title = `${SEGMENT_KIND_LABELS[kind] || kind} 구간`;
  const dlg = createDialogShell(title, { showPreview: !isHold && !!opts.onPreview });
  const body = dlg.querySelector('.sb-modal-body');

  body.innerHTML = buildSegmentFormHtml(draft, kind, !!opts.showFormation, !!opts.macroMode, !!opts.absolutePattern);
  const flushPreviewCore = () => {
    if (isHold) return;
    readFormIntoDraft(body, draft);
    opts.onPreview?.({
      ...draft,
      _previewMemberCount: Math.max(opts.getPreviewMemberCount?.() ?? 0, 1),
    });
  };
  const preview = setupStagePreviewControl(dlg, opts, flushPreviewCore);
  const previewFromForm = (form) => {
    if (isHold) return;
    opts.onPreview?.({
      ...draft,
      ...form,
      anchorX: form.anchorX ?? form.x ?? draft.anchorX,
      anchorZ: form.anchorZ ?? form.z ?? draft.anchorZ,
      toRotY: form.toRotY ?? form.rotY ?? draft.toRotY,
      _previewMemberCount: Math.max(opts.getPreviewMemberCount?.() ?? 0, 1),
    });
  };

  /** @type {(() => void) | undefined} */
  let flushPreview;

  if (!isHold) {
    const pickRowOpts = {
      getActivePresetId: () => draft.anchorPresetId,
      onSelect: (p) => {
        draft.anchorX = p.x;
        draft.anchorZ = p.z;
        draft.toRotY = p.rotY;
        draft.anchorPresetId = p.id;
        syncFormFromDraft(body, draft, false);
        flushPreview();
      },
      onCaptureHint: () => ({
        x: Number(body.querySelector('[data-f="anchorX"]')?.value) || 0,
        z: Number(body.querySelector('[data-f="anchorZ"]')?.value) || 0,
        rotY: draft.toRotY,
        opacity: 1,
      }),
      onPickStage: () => {
        readFormIntoDraft(body, draft);
        runStagePointPick(dlg, opts, {
          mode: 'segmentAnchor',
          segmentId: seg.id,
        }, (pt) => {
          const nextSeg = { ...seg, ...draft, anchorPresetId: pt ? null : draft.anchorPresetId };
          if (pt) {
            nextSeg.anchorX = roundCoord(pt.x);
            nextSeg.anchorZ = roundCoord(pt.z);
          }
          return { ...opts, segment: nextSeg };
        }, (resume) => openSegmentEditDialog(resume));
      },
      onPickPoint: opts.onPickPoint,
      onPresetPickStage: (onPicked) => {
        opts.onPickPoint?.({
          mode: 'segmentAnchor',
          segmentId: seg.id,
          onPicked: (pt) => onPicked(pt),
        });
      },
      onPresetsChanged: () => {
        refreshPickRow();
        opts.onChange?.();
        opts.onPositionPresetsChanged?.();
      },
      onPreviewBegin: opts.onPreviewBegin,
      onPreviewEnd: opts.onPreviewEnd,
      onPreviewReset: opts.onPreviewReset,
      onPreview: previewFromForm,
      onPreviewPreset: opts.onPreviewPreset,
      onPresetUpdated: opts.onPresetUpdated,
      onPresetRemoved: opts.onPresetRemoved,
    };
    const refreshPickRow = () => {
      mountPresetPickRow(body.querySelector('[data-role="pick-row"]'), opts.presetStore, pickRowOpts);
    };
    flushPreview = () => {
      preview.flush();
      refreshPickRow();
    };
    refreshPickRow();

    if (opts.showFormation) {
      mountRotFormationRow(body.querySelector('[data-role="rot-fmt"]'), {
        rotY: draft.toRotY,
        formation: draft.formation,
        spacing: draft.formationSpacing,
        showSpacing: true,
        onRotY: (deg) => { draft.toRotY = deg; flushPreview(); },
        onFormation: (f) => { draft.formation = f; flushPreview(); },
        onSpacing: (n) => { draft.formationSpacing = n; flushPreview(); },
      });
    } else {
      mountRotYChips(body.querySelector('[data-role="rot-only"]'), draft.toRotY, (deg) => {
        draft.toRotY = deg;
        flushPreview();
      }, { compact: true });
    }

    mountEaseChips(body.querySelector('[data-role="ease"]'), draft.easing, (e) => {
      draft.easing = e;
    });
  }

  if (isHold) {
    wireNumericFields(body, draft, { duration: 'duration' });
  } else {
    wireNumericFields(body, draft, opts.macroMode
      ? { duration: 'duration', anchorX: 'anchorX', anchorZ: 'anchorZ' }
      : {
        duration: 'duration',
        anchorX: 'anchorX',
        anchorZ: 'anchorZ',
        formationSpacing: 'formationSpacing',
      },
    flushPreview, 'anchorPresetId');
    if (kind === 'exit') {
      wireOpacitySlider(body, flushPreview);
    }
  }

  bindDialogSave(dlg, () => {
    readFormIntoDraft(body, draft);
    opts.onSave({ ...draft });
    closeDialog(dlg);
  });
  wireDialogActions(dlg);
  mountSegDialogDrag(dlg);
  if (!isHold) {
    showDialog(dlg, { onClose: () => { preview.end(); opts.onPreviewReset?.(); } });
    flushPreview?.();
  } else {
    showDialog(dlg);
  }
}

/**
 * 단계 버튼 드래그 재정렬.
 * @param {HTMLElement} container
 * @param {{
 *   stepSelector: string,
 *   onDrop: (fromId: string, toId: string) => void,
 * }} opts
 */
export function wireStepReorder(container, opts) {
  /** @type {string | null} */
  let dragId = null;

  container.querySelectorAll(opts.stepSelector).forEach((btn) => {
    btn.addEventListener('dragstart', (e) => {
      if (e.target.closest?.('[data-act="rm-kf"], [data-act="rm-seg"]')) {
        e.preventDefault();
        return;
      }
      dragId = btn.getAttribute('data-id');
      btn.classList.add('is-dragging');
      try {
        e.dataTransfer?.setData('text/plain', dragId || '');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      } catch {
        /* ignore */
      }
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('is-dragging');
      container.querySelectorAll('.sb-seg-step-btn.is-drop-target').forEach((el) => {
        el.classList.remove('is-drop-target');
      });
      dragId = null;
    });
    btn.addEventListener('dragover', (e) => {
      if (!dragId || dragId === btn.getAttribute('data-id')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      btn.classList.add('is-drop-target');
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('is-drop-target');
    });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove('is-drop-target');
      const fromId = dragId || e.dataTransfer?.getData('text/plain') || '';
      const toId = btn.getAttribute('data-id') || '';
      if (!fromId || !toId || fromId === toId) return;
      opts.onDrop(fromId, toId);
    });
  });
}

/** @param {(kind: 'move'|'hold'|'exit') => void} onPick @param {string} [title] */
export function openKindPicker(onPick, title = '구간 추가') {
  const dlg = createDialogShell(title);
  const body = dlg.querySelector('.sb-modal-body');
  body.innerHTML = `
    <p class="sb-seg-kind-hint">추가할 구간 종류를 선택하세요.</p>
    <div class="sb-seg-kind-btns">
      <button type="button" class="sb-chip seg-move sb-seg-kind-btn" data-kind="move">이동</button>
      <button type="button" class="sb-chip seg-hold sb-seg-kind-btn" data-kind="hold">대기</button>
      <button type="button" class="sb-chip seg-exit sb-seg-kind-btn" data-kind="exit">퇴장</button>
    </div>`;
  body.querySelectorAll('[data-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-kind');
      closeDialog(dlg);
      if (k === 'hold' || k === 'exit' || k === 'move') onPick(k);
    });
  });
  wireDialogActions(dlg);
  showDialog(dlg);
}

function buildStartFormHtml(draft, showFormation, _macroMode = false, _absolutePattern = false) {
  // 패턴 · 그룹 · 패턴 라이브러리 동일 레이아웃 (시작 시각 + Opacity → 위치 → 회전)
  return `
    <div class="sb-seg-form">
      ${startTimingRowHtml(draft)}
      <div class="sb-seg-pick-row" data-role="pick-row">
        <div class="sb-preset-pos-line">
          <div class="sb-seg-pick-pos-fields sb-ens-seg-fields">
            <label>X<input type="number" data-f="fromX" step="0.1" value="${fmt(draft.fromX)}" /></label>
            <label>Z<input type="number" data-f="fromZ" step="0.1" value="${fmt(draft.fromZ)}" /></label>
          </div>
          <button type="button" class="sb-chip sb-seg-pick-chip" data-act="pick" title="무대에서 직접 지정">◎ 무대</button>
        </div>
        <div data-role="pick-presets"></div>
      </div>
      ${showFormation
    ? '<div class="sb-seg-rot-fmt-row" data-role="rot-fmt"></div>'
    : '<div class="sb-seg-rot-fmt-row" data-role="rot-only"></div>'}
    </div>`;
}

function opacityRowHtml(draft) {
  const op = clamp01(draft.opacity ?? 1);
  return `
    <div class="sb-ens-seg-row sb-ens-seg-row--inline sb-seg-opacity-row">
      <label class="sb-seg-opacity">Opacity
        <input type="range" data-f="opacity" min="0" max="1" step="0.05" value="${op}" />
        <span data-role="opacity-val">${Math.round(op * 100)}%</span>
      </label>
    </div>`;
}

function exitVisibleNoteHtml() {
  return `
    <div class="sb-ens-seg-row sb-seg-exit-visible-note">
      <span class="sb-seg-exit-visible-label">안 보임</span>
      <span class="sb-seg-exit-visible-hint">퇴장 키 — 자동 적용 (Opacity로 페이드아웃 가능)</span>
    </div>`;
}

function buildSegmentFormHtml(draft, kind, showFormation, _macroMode = false, _absolutePattern = false) {
  const isHold = kind === 'hold';
  const axLbl = kind === 'exit' ? '퇴장 X' : '끝 X';
  const azLbl = kind === 'exit' ? '퇴장 Z' : '끝 Z';
  // 패턴 · 그룹 · 패턴 라이브러리 동일 레이아웃
  return `
    <div class="sb-seg-form">
      <div class="sb-ens-seg-fields sb-ens-seg-fields--duration${isHold ? '' : ' sb-ens-seg-fields--duration-only'}">
        <label>Duration<input type="number" data-f="duration" step="0.1" min="0.1" value="${fmt(draft.duration)}" /></label>
      </div>
      ${isHold ? '<div class="sb-ens-empty sb-seg-hold-hint">직전 위치·자세 유지 (시간만 변경)</div>' : `
        <div class="sb-seg-pick-row" data-role="pick-row">
          <div class="sb-preset-pos-line">
            <div class="sb-seg-pick-pos-fields sb-ens-seg-fields">
              <label>${axLbl}<input type="number" data-f="anchorX" step="0.1" value="${fmt(draft.anchorX)}" /></label>
              <label>${azLbl}<input type="number" data-f="anchorZ" step="0.1" value="${fmt(draft.anchorZ)}" /></label>
            </div>
            <button type="button" class="sb-chip sb-seg-pick-chip" data-act="pick" title="무대에서 직접 지정">◎ 무대</button>
          </div>
          <div data-role="pick-presets"></div>
        </div>
        ${showFormation
    ? '<div class="sb-seg-rot-fmt-row" data-role="rot-fmt"></div>'
    : '<div class="sb-seg-rot-fmt-row" data-role="rot-only"></div>'}
        <div class="sb-ens-seg-row sb-ens-seg-row--inline">
          <div class="sb-ens-subtitle">Easing</div>
          <div data-role="ease"></div>
        </div>
      `}
      ${kind === 'exit' ? `${opacityRowHtml(draft)}${exitVisibleNoteHtml()}` : ''}
    </div>`;
}

/**
 * @param {HTMLElement | null} host
 * @param {import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null} store
 * @param {{
 *   onSelect: (p: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPickStage: () => void,
 *   onPickPoint?: SegmentStepListContext['onPickPoint'],
 *   onPresetPickStage?: (onPicked: (pt: { x: number, z: number }) => void) => void,
 *   onCaptureHint?: () => { x: number, z: number, rotY?: number, opacity?: number } | null,
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   onPresetsChanged?: () => void,
 *   getActivePresetId?: () => string | null,
 *   activePresetId?: string | null,
 * }} opts
 */
function mountPresetPickRow(host, store, opts) {
  if (!host) return;
  const presetsHost = host.querySelector('[data-role="pick-presets"]') ?? host;
  const presets = store?.list() ?? [];
  const activeId = opts.getActivePresetId?.() ?? opts.activePresetId ?? null;
  presetsHost.innerHTML = `
    <div class="sb-seg-pick-presets">
      ${renderPresetChipsHtml(presets, { actions: false, activePresetId: activeId })}
      <button type="button" class="sb-chip sb-pos-save" data-act="save-preset" title="공통 위치 추가">+</button>
    </div>
    ${activeId ? '<p class="sb-preset-link-hint">● 위치 프리셋에 연결됨 — 수정 시 함께 이동</p>' : ''}`;

  const pickBtn = host.querySelector('[data-act="pick"]');
  if (pickBtn instanceof HTMLButtonElement) {
    const wired = pickBtn.cloneNode(true);
    pickBtn.replaceWith(wired);
    wired.addEventListener('click', () => opts.onPickStage());
  }

  wirePresetChipEvents(presetsHost, store, {
    onApply: (p) => opts.onSelect(p),
    onChange: () => opts.onPresetsChanged?.(),
    onRefresh: () => mountPresetPickRow(host, store, opts),
    onPickStage: opts.onPresetPickStage,
    onCaptureHint: opts.onCaptureHint,
    onPreviewBegin: opts.onPreviewBegin,
    onPreviewEnd: opts.onPreviewEnd,
    onPreviewReset: opts.onPreviewReset,
    onPreview: opts.onPreview,
    onPreviewPreset: opts.onPreviewPreset,
    onPresetUpdated: opts.onPresetUpdated,
    onPresetRemoved: opts.onPresetRemoved,
  });

  presetsHost.querySelector('[data-act="save-preset"]')?.addEventListener('click', () => {
    openPositionPresetEditor({
      store,
      onPickStage: opts.onPresetPickStage,
      onPickPoint: opts.onPickPoint,
      onCaptureHint: opts.onCaptureHint,
      onPreviewBegin: opts.onPreviewBegin,
      onPreviewEnd: opts.onPreviewEnd,
      onPreviewReset: opts.onPreviewReset,
      onPreview: opts.onPreview,
      onPreviewPreset: opts.onPreviewPreset,
      onPresetUpdated: opts.onPresetUpdated,
      onPresetRemoved: opts.onPresetRemoved,
      onSaved: () => opts.onPresetsChanged?.(),
    });
  });
}

/**
 * @param {HTMLElement | null} host
 * @param {{
 *   rotY: number,
 *   formation?: string,
 *   spacing?: number,
 *   showSpacing?: boolean,
 *   onRotY: (deg: number) => void,
 *   onFormation?: (f: string) => void,
 *   onSpacing?: (n: number) => void,
 * }} opts
 */
function mountRotFormationRow(host, opts) {
  if (!host) return;
  host.innerHTML = `
    <span class="sb-seg-inline-label">Y°</span>
    <div data-role="rot"></div>
    <span class="sb-seg-inline-label">포메이션</span>
    <div data-role="fmt"></div>
    ${opts.showSpacing ? `
      <label class="sb-seg-spacing-inline">간격
        <input type="number" data-f="formationSpacing" step="1" min="0.5" value="${fmt(opts.spacing ?? 36)}" />
      </label>` : ''}`;

  mountRotYChips(host.querySelector('[data-role="rot"]'), opts.rotY, (deg) => {
    opts.onRotY(deg);
  }, { compact: true });

  if (opts.onFormation) {
    mountFormationChips(host.querySelector('[data-role="fmt"]'), opts.formation || 'line', (f) => {
      opts.onFormation?.(f);
    });
  }

  const spacingInput = host.querySelector('[data-f="formationSpacing"]');
  const applySpacing = () => {
    const val = Number(/** @type {HTMLInputElement} */ (spacingInput).value);
    if (Number.isFinite(val)) opts.onSpacing?.(roundCoord(val));
  };
  spacingInput?.addEventListener('change', applySpacing);
  spacingInput?.addEventListener('input', applySpacing);
}

/** @param {Record<string, any>} draft @param {Record<string, string>} map @param {(() => void) | undefined} [onFlush] @param {string | null} [clearPresetKey] */
function wireNumericFields(body, draft, map, onFlush, clearPresetKey = null) {
  const coordKeys = new Set(['fromX', 'fromZ', 'anchorX', 'anchorZ']);
  Object.entries(map).forEach(([field, key]) => {
    const input = body.querySelector(`[data-f="${field}"]`);
    const apply = () => {
      let val = Number(/** @type {HTMLInputElement} */ (input).value);
      if (!Number.isFinite(val)) return;
      if (key === 'opacity') val = clamp01(val);
      else val = roundCoord(val);
      draft[key] = val;
      if (clearPresetKey && coordKeys.has(key)) draft[clearPresetKey] = null;
      onFlush?.();
    };
    input?.addEventListener('change', apply);
    input?.addEventListener('input', apply);
  });
}

function readFormIntoDraft(body, draft) {
  body.querySelectorAll('[data-f]').forEach((input) => {
    if (input instanceof HTMLInputElement && input.type === 'checkbox') return;
    const field = input.getAttribute('data-f');
    if (!field) return;
    let val = Number(/** @type {HTMLInputElement} */ (input).value);
    if (!Number.isFinite(val)) return;
    if (field === 'opacity') val = clamp01(val);
    else val = roundCoord(val);
    draft[field] = val;
  });
}

function syncFormFromDraft(body, draft, isStart) {
  const map = isStart
    ? { startTime: 'startTime', fromX: 'fromX', fromZ: 'fromZ', opacity: 'opacity' }
    : { duration: 'duration', anchorX: 'anchorX', anchorZ: 'anchorZ' };
  Object.entries(map).forEach(([field, key]) => {
    if (field === 'opacity') {
      setOpacityField(body, draft[key], field);
      return;
    }
    const input = body.querySelector(`[data-f="${field}"]`);
    if (input instanceof HTMLInputElement) input.value = String(draft[key] ?? 0);
  });
}

function opacitySliderHtml(value, field = 'opacity') {
  const v = clamp01(value);
  return `
    <div class="sb-seg-opacity-row ec-row sb-seg-opacity-row--compact">
      <label>Opacity</label>
      <input type="range" data-f="${field}" min="0" max="1" step="0.01" class="acc" value="${v}" />
      <span class="ec-val-text sb-opacity-pct" data-role="${field}-pct">${opacityPct(v)}</span>
    </div>`;
}

function startTimingRowHtml(draft) {
  const v = clamp01(draft.opacity);
  return `
    <div class="sb-seg-timing-row">
      <label class="sb-seg-timing-start">시작 시각
        <input type="number" data-f="startTime" step="0.1" min="0" value="${fmt(draft.startTime)}" />
      </label>
      <label class="sb-seg-opacity-compact">Opacity
        <span class="sb-seg-opacity-compact-inner">
          <input type="range" data-f="opacity" min="0" max="1" step="0.01" class="acc" value="${v}" />
          <span class="ec-val-text sb-opacity-pct" data-role="opacity-pct">${opacityPct(v)}</span>
        </span>
      </label>
    </div>`;
}

function updateSegDialogFoot(backdrop, showPreview) {
  const foot = backdrop.querySelector('.sb-modal-foot');
  if (!foot) return;
  foot.innerHTML = showPreview
    ? `<label class="sb-seg-preview-toggle">
        <input type="checkbox" data-act="stage-preview" checked />
        <span>무대 미리보기</span>
      </label>
      <div class="sb-modal-foot-actions">
        <button type="button" class="sb-chip" data-act="cancel">취소</button>
        <button type="button" class="sb-chip acc" data-act="save">저장</button>
      </div>`
    : `<div class="sb-modal-foot-actions sb-modal-foot-actions--end">
        <button type="button" class="sb-chip" data-act="cancel">취소</button>
        <button type="button" class="sb-chip acc" data-act="save">저장</button>
      </div>`;
  foot.classList.toggle('sb-modal-foot--with-preview', !!showPreview);
}

/**
 * @param {HTMLElement} dlg
 * @param {{
 *   onPreview?: (draft: Record<string, any>) => void,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 * }} opts
 * @param {() => void} flushCore
 */
function setupStagePreviewControl(dlg, opts, flushCore) {
  let sessionActive = false;
  const toggle = dlg.querySelector('[data-act="stage-preview"]');
  const hasPreview = () => !!(opts.onPreview || opts.onPreviewPreset);

  const isOn = () => !toggle || toggle.checked;

  const begin = () => {
    if (!hasPreview() || !isOn() || sessionActive) return;
    opts.onPreviewBegin?.();
    sessionActive = true;
  };
  const end = () => {
    if (!sessionActive) return;
    opts.onPreviewEnd?.();
    sessionActive = false;
  };
  const flush = () => {
    if (!hasPreview() || !isOn()) return;
    begin();
    flushCore();
  };

  toggle?.addEventListener('change', () => {
    if (isOn()) {
      begin();
      flushCore();
    } else {
      end();
    }
  });

  return { begin, end, flush };
}

/**
 * @param {HTMLElement} dlg
 * @param {{ onPickPoint?: SegmentStepListContext['onPickPoint'] }} opts
 * @param {Record<string, any>} pickArgs
 * @param {(pt: { x: number, z: number } | null) => any} buildResumeOpts
 * @param {(resume: any) => void} reopen
 */
function runStagePointPick(dlg, opts, pickArgs, buildResumeOpts, reopen) {
  if (!opts.onPickPoint) return;
  closeDialog(dlg);
  opts.onPickPoint({
    ...pickArgs,
    onPicked: (pt) => reopen(buildResumeOpts(pt)),
    onCancelled: () => reopen(buildResumeOpts(null)),
  });
}

function mountSegDialogDrag(backdrop) {
  const modal = backdrop.querySelector('.sb-modal');
  const head = backdrop.querySelector('.sb-modal-head');
  if (!modal || !head || head.dataset.dragWired === '1') return;
  head.dataset.dragWired = '1';
  head.classList.add('sb-modal-head--draggable');

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onMove = (e) => {
    if (!dragging) return;
    const left = originLeft + e.clientX - startX;
    const top = originTop + e.clientY - startY;
    modal.style.left = `${Math.max(8, Math.min(window.innerWidth - modal.offsetWidth - 8, left))}px`;
    modal.style.top = `${Math.max(8, Math.min(window.innerHeight - modal.offsetHeight - 8, top))}px`;
  };

  const onUp = () => {
    dragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  head.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = modal.getBoundingClientRect();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    modal.classList.add('is-dragged');
    modal.style.position = 'fixed';
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    modal.style.right = 'auto';
    modal.style.margin = '0';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

function opacityPct(n) {
  return `${Math.round(clamp01(n) * 100)}%`;
}

function updateOpacityPctLabel(body, field = 'opacity') {
  const el = body.querySelector(`[data-f="${field}"]`);
  const label = body.querySelector(`[data-role="${field}-pct"]`);
  if (el instanceof HTMLInputElement && label) {
    label.textContent = opacityPct(Number(el.value));
  }
}

function setOpacityField(body, value, field = 'opacity') {
  const el = body.querySelector(`[data-f="${field}"]`);
  if (el instanceof HTMLInputElement) el.value = String(clamp01(value));
  updateOpacityPctLabel(body, field);
}

function wireOpacitySlider(body, onFlush, field = 'opacity') {
  const el = body.querySelector(`[data-f="${field}"]`);
  const apply = () => {
    updateOpacityPctLabel(body, field);
    onFlush?.();
  };
  el?.addEventListener('input', apply);
  el?.addEventListener('change', apply);
}

function resetSegDialogPosition(backdrop) {
  const modal = backdrop?.querySelector('.sb-modal');
  if (!modal) return;
  modal.classList.remove('is-dragged');
  modal.style.position = '';
  modal.style.left = '';
  modal.style.top = '';
  modal.style.right = '';
  modal.style.margin = '';
}

function createDialogShell(title, shellOpts = {}) {
  let backdrop = document.getElementById('sb-seg-edit-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sb-seg-edit-backdrop';
    backdrop.className = 'sb-modal-backdrop sb-modal-backdrop--seg';
    backdrop.innerHTML = `
      <div class="sb-modal sb-seg-edit-modal" role="dialog" aria-modal="true">
        <div class="sb-modal-head">
          <strong data-role="title"></strong>
          <button type="button" data-act="cancel" aria-label="닫기">×</button>
        </div>
        <div class="sb-modal-body"></div>
        <div class="sb-modal-foot"></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-act="cancel"]')) closeDialog(backdrop);
    });
    backdrop.querySelector('.sb-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }
  backdrop.querySelector('[data-role="title"]').textContent = title;
  updateSegDialogFoot(backdrop, !!shellOpts.showPreview);
  resetSegDialogPosition(backdrop);
  mountSegDialogDrag(backdrop);
  return backdrop;
}

function bindDialogSave(dlg, handler) {
  const save = dlg.querySelector('.sb-modal-foot [data-act="save"]');
  if (!save) return;
  const clone = save.cloneNode(true);
  save.replaceWith(clone);
  clone.addEventListener('click', handler);
}

/** @param {HTMLElement} dlg */
function wireDialogActions(dlg) {
  dlg.querySelectorAll('[data-act="cancel"]').forEach((btn) => {
    btn.replaceWith(btn.cloneNode(true));
  });
  dlg.querySelectorAll('[data-act="cancel"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDialog(dlg);
    });
  });
}

function showDialog(backdrop, opts = {}) {
  backdrop._onClose = opts.onClose ?? null;
  backdrop.hidden = false;
}

function closeDialog(backdrop) {
  if (!backdrop) return;
  const onClose = backdrop._onClose;
  backdrop._onClose = null;
  backdrop.hidden = true;
  onClose?.();
}

function mountFormationChips(host, current, onPick) {
  if (!host) return;
  host.className = 'sb-seg-fmt-chips';
  const kinds = FORMATION_TYPES || ['line', 'grid', 'circle'];
  host.innerHTML = kinds.map((k) => `
    <button type="button" class="sb-chip sb-fmt-chip${k === current ? ' on' : ''}" data-fmt="${k}">${FORMATION_LABELS[k] || k}</button>
  `).join('');
  host.querySelectorAll('[data-fmt]').forEach((b) => {
    b.addEventListener('click', () => {
      const f = b.getAttribute('data-fmt');
      if (!f) return;
      onPick(f);
      mountFormationChips(host, f, onPick);
    });
  });
}

function mountEaseChips(host, current, onPick) {
  if (!host) return;
  const kinds = [SEGMENT_EASING.smooth, SEGMENT_EASING.linear];
  host.innerHTML = kinds.map((k) => `
    <button type="button" class="sb-chip${k === current ? ' on' : ''}" data-ease="${k}">${SEGMENT_EASING_LABELS[k]}</button>
  `).join('');
  host.querySelectorAll('[data-ease]').forEach((b) => {
    b.addEventListener('click', () => onPick(b.getAttribute('data-ease')));
  });
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

function roundCoord(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function fmt(n) {
  return String(roundCoord(n));
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

/**
 * AI 구간 키워드 — 하이라이트·자동 태그·키 예정 미리보기용
 * (긴 패턴 우선)
 */
const AI_ACTION_DEFS = [
  {
    kind: 'hold',
    label: '대기',
    /** 동의어 → 입력 시 [대기] 자동 삽입 */
    autoTagRe: /(머무르(?:다|고|며|면)?|머물(?:다|고|며|면)?|기다리(?:다|고)?)(?!\[대기\])$/u,
    matchRe: /머무르(?:다|고|며|면)?\[대기\]|머물(?:다|고|며|면)?\[대기\]|기다리(?:다|고)?\[대기\]|\[대기\]|머무르(?:다|고|며|면)?|머물(?:다|고|며|면)?|대기|홀드|hold|기다리(?:다|고)?/giu,
  },
  {
    kind: 'exit',
    label: '퇴장',
    autoTagRe: /(나가(?:가|서|다|고)?|사라(?:지다|져|지고)?)(?!\[퇴장\])$/u,
    matchRe: /나가(?:가|서|다|고)?\[퇴장\]|사라(?:지다|져|지고)?\[퇴장\]|\[퇴장\]|퇴장(?:위치|해)?|나가(?:가|서|다|고)?|exit|사라(?:지다|져|지고)?/giu,
  },
  {
    kind: 'move',
    label: '이동',
    autoTagRe: /(걸어(?:가다|와서|가|와|서)?|walk)(?!\[이동\])$/iu,
    matchRe: /걸어(?:가다|와서|가|와|서)?\[이동\]|\[이동\]|이동|걸어(?:가다|와서|가|와|서)?|walk|move/giu,
  },
  {
    kind: 'rotate',
    label: '회전',
    autoTagRe: /(돌아(?:가다|서|다|고)?|돌려(?:서|다)?)(?!\[회전\])$/u,
    matchRe: /돌아(?:가다|서|다|고)?\[회전\]|돌려(?:서|다)?\[회전\]|\[회전\]|회전|돌아(?:가다|서|다|고)?|돌려(?:서|다)?|rotate|turn/giu,
  },
];

/**
 * AI 패턴 입력 — @ 멘션 + 이동/대기/퇴장 하이라이트 + 동의어 자동 태그
 * @param {HTMLTextAreaElement} textarea
 * @param {() => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null} getPresetStore
 * @param {HTMLElement} host
 */
function wireAiPatternInput(textarea, getPresetStore, host) {
  const highlight = host.querySelector('[data-role="ai-highlight"]');
  const keyPreview = host.querySelector('[data-role="ai-key-preview"]');

  function syncHighlight() {
    if (highlight instanceof HTMLElement) {
      const presets = getPresetStore()?.list() || [];
      highlight.innerHTML = buildAiMentionHighlightHtml(textarea.value, presets);
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
    syncAiKeyPreview(keyPreview, textarea.value);
  }

  textarea.addEventListener('input', () => {
    if (tryAutoTagAiSynonym(textarea)) {
      /* value/cursor updated */
    }
    syncHighlight();
  });
  textarea.addEventListener('scroll', syncHighlight);
  syncHighlight();

  wireAiPresetMentions(textarea, getPresetStore, host, syncHighlight);
}

/**
 * 동의어 뒤에 구분자가 오면 [대기] 등 태그 자동 삽입 (캐럿 정렬 유지)
 * @param {HTMLTextAreaElement} textarea
 */
function tryAutoTagAiSynonym(textarea) {
  const v = textarea.value;
  const pos = textarea.selectionStart;
  if (!Number.isFinite(pos) || pos < 1) return false;
  if (textarea.selectionEnd !== pos) return false;
  const delim = v[pos - 1];
  if (!/[\s,.\n!?]/.test(delim)) return false;
  const head = v.slice(0, pos - 1);
  for (const def of AI_ACTION_DEFS) {
    if (!def.autoTagRe) continue;
    const m = head.match(def.autoTagRe);
    if (!m) continue;
    const tag = `[${def.label}]`;
    const insertAt = head.length;
    textarea.value = `${v.slice(0, insertAt)}${tag}${v.slice(insertAt)}`;
    const next = insertAt + tag.length + 1; // after tag + delimiter
    textarea.setSelectionRange(next, next);
    return true;
  }
  return false;
}

/**
 * @param {HTMLElement | null} el
 * @param {string} text
 */
function syncAiKeyPreview(el, text) {
  if (!(el instanceof HTMLElement)) return;
  const kinds = collectAiActionKindsInOrder(text);
  if (!kinds.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const labels = { move: '이동', hold: '대기', rotate: '회전', exit: '퇴장' };
  el.innerHTML = `<span class="sb-seg-ai-key-preview-label">키 예정</span>${
    kinds.map((k) => `<span class="sb-seg-ai-key-chip is-${k}">${labels[k] || k}</span>`).join('')
  }`;
}

/** @param {string} text @returns {Array<'move'|'hold'|'rotate'|'exit'>} */
function collectAiActionKindsInOrder(text) {
  /** @type {{ start: number, kind: string }[]} */
  const hits = [];
  for (const def of AI_ACTION_DEFS) {
    const re = new RegExp(def.matchRe.source, def.matchRe.flags);
    let m;
    while ((m = re.exec(text))) {
      hits.push({ start: m.index, kind: def.kind });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  /** @type {Array<'move'|'hold'|'rotate'|'exit'>} */
  const out = [];
  for (const h of hits) {
    const k = /** @type {'move'|'hold'|'rotate'|'exit'} */ (h.kind);
    if (!out.includes(k)) out.push(k);
  }
  // 등장만 있고 이동 키워드 없어도 @…으로 이동이 생기면 move는 파서가 넣을 수 있음 — 미리보기는 명시 키워드만
  return out;
}

/** @param {string} text @param {import('../domain/motion/positionPresets.js').PositionPreset[]} presets */
function buildAiMentionHighlightHtml(text, presets) {
  if (!text) return '<br>';

  /** @type {{ start: number, end: number, html: string }[]} */
  const ranges = [];

  const atRe = /@([^\s@.,]+)/g;
  let m;
  while ((m = atRe.exec(text))) {
    const label = m[1];
    const linked = matchPresetByLabel(presets, label);
    const cls = linked ? 'sb-ai-mention-token is-linked' : 'sb-ai-mention-token is-unknown';
    const title = linked
      ? `X ${linked.x.toFixed(1)} · Z ${linked.z.toFixed(1)}`
      : '저장된 위치 프리셋 없음';
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<span class="${cls}" title="${escapeAttr(title)}">${escapeHtml(m[0])}</span>`,
    });
  }

  for (const def of AI_ACTION_DEFS) {
    const re = new RegExp(def.matchRe.source, def.matchRe.flags);
    while ((m = re.exec(text))) {
      const raw = m[0];
      // 「퇴장위치」는 위치 프리셋 맥락 — 구간 키워드로만 표시하되 퇴장 색
      const title = `${def.label} 키 구간으로 인식`;
      const inner = formatAiActionHighlightInner(raw, def);
      ranges.push({
        start: m.index,
        end: m.index + raw.length,
        html: `<span class="sb-ai-action-token is-${def.kind}" title="${escapeAttr(title)}">${inner}</span>`,
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  /** @type {{ start: number, end: number, html: string }[]} */
  const picked = [];
  for (const r of ranges) {
    if (picked.some((p) => !(r.end <= p.start || r.start >= p.end))) continue;
    picked.push(r);
  }
  picked.sort((a, b) => a.start - b.start);

  let out = '';
  let last = 0;
  for (const r of picked) {
    out += escapeHtml(text.slice(last, r.start));
    out += r.html;
    last = r.end;
  }
  out += escapeHtml(text.slice(last));
  return out.replace(/\n/g, '<br>') || '<br>';
}

/**
 * @param {string} raw
 * @param {{ kind: string, label: string }} def
 */
function formatAiActionHighlightInner(raw, def) {
  const tag = `[${def.label}]`;
  const idx = raw.lastIndexOf(tag);
  if (idx >= 0) {
    const head = raw.slice(0, idx);
    const rest = raw.slice(idx);
    return `${escapeHtml(head)}<span class="sb-ai-action-tag">${escapeHtml(rest)}</span>`;
  }
  // 동의어(태그 전) — 밑줄만; 정식 키워드도 동일
  return escapeHtml(raw);
}

/** @param {HTMLElement} anchor */
function toggleAiPatternHelp(anchor) {
  let pop = document.querySelector('[data-role="ai-help-pop"]');
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'sb-seg-ai-help-pop';
    pop.dataset.role = 'ai-help-pop';
    document.body.appendChild(pop);
  }
  // 규칙 갱신 시 매번 최신 설명 반영
  pop.innerHTML = `
      <p class="sb-seg-ai-help-lead">자연어 + <strong>@위치프리셋</strong>으로 이동·대기·퇴장 초안을 만듭니다.</p>

      <p class="sb-seg-ai-help-h">1. @ 위치</p>
      <ul class="sb-seg-ai-help-list">
        <li><code>@</code> 입력 → 저장된 위치 목록 · 보라색 = 연결됨</li>
        <li>예: <code>@등장</code> <code>@중앙</code> <code>@퇴장</code> <code>@왼쪽</code></li>
        <li>연결되면 키프레임에도 저장위치가 연결됩니다</li>
      </ul>

      <p class="sb-seg-ai-help-h">2. 키워드 미리보기 (색·밑줄)</p>
      <ul class="sb-seg-ai-help-list">
        <li><span class="sb-seg-ai-help-swatch is-move">이동</span>
          <span class="sb-seg-ai-help-swatch is-hold">대기</span>
          <span class="sb-seg-ai-help-swatch is-exit">퇴장</span>
          <span class="sb-seg-ai-help-swatch is-rotate">회전</span>
          → 해당 키가 생긴다는 표시</li>
        <li>동의어: <code>머무르다</code>/<code>기다리다</code> → 자동 <code>[대기]</code> ·
          <code>걸어가다</code> → <code>[이동]</code> · <code>나가다</code> → <code>[퇴장]</code></li>
        <li>아래 <strong>키 예정</strong> 칩으로도 확인</li>
      </ul>

      <p class="sb-seg-ai-help-h">3. Duration(구간 길이) vs 절대 시각(타임라인 시각)</p>
      <table class="sb-seg-ai-help-table">
        <thead><tr><th>말하고 싶은 것</th><th>쓰는 말</th><th>결과</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Duration</strong><br>그 동작이 몇 초 걸리는지</td>
            <td><code>3초 이동</code><br><code>10초 대기</code><br><code>1분 대기</code><br><code>1분 30초 대기</code></td>
            <td>이동 3초 · 대기 10초/60초/90초<br>(그 구간의 길이)</td>
          </tr>
          <tr>
            <td><strong>절대 시각</strong><br>타임라인 몇 분·몇 초 시점까지</td>
            <td><code>1분까지 대기</code><br><code>90초까지 대기</code></td>
            <td>시작+이동 뒤 → <strong>그 시각까지</strong> 남은 시간만큼 대기<br>
              예: 시작 0 + 이동 3초 + 「1분까지 대기」→ 대기 <strong>57초</strong></td>
          </tr>
          <tr>
            <td><strong>시작 시각</strong></td>
            <td><code>시작 10초</code><br><code>1분부터</code><br><code>30초에 시작</code></td>
            <td>패턴 시작 시각 (startTime)</td>
          </tr>
        </tbody>
      </table>
      <p class="sb-seg-ai-help-note">⚠ <code>이동하고 1분까지 대기</code> → 이동은 기본 Duration(3초), 「1분」은 대기의 절대 시각입니다.
        (<code>이동</code>에 60초가 붙지 않음)</p>

      <p class="sb-seg-ai-help-h">4. 기본 Duration (⏱)</p>
      <ul class="sb-seg-ai-help-list">
        <li>초·분을 안 쓰면 이동·퇴장 <strong>3초</strong>, 대기 <strong>10초</strong> (⏱에서 변경)</li>
        <li>시간 단위: <code>초</code> · <code>분</code> · <code>분+초</code> (내부는 모두 초로 계산)</li>
      </ul>

      <p class="sb-seg-ai-help-h">5. 예시</p>
      <p class="sb-seg-ai-help-example">
        <strong>기본 흐름</strong><br>
        <code>@등장에서 @중앙으로 이동, 10초 대기 후 @퇴장으로 퇴장</code><br>
        → 시작(등장) · 이동 3초 · 대기 10초 · 퇴장
      </p>
      <p class="sb-seg-ai-help-example">
        <strong>Duration으로 대기</strong><br>
        <code>@왼쪽에서 @중앙으로 이동하고 1분 대기 후 @퇴장으로 퇴장</code><br>
        → 이동 3초 · 대기 <strong>60초</strong> · 퇴장
      </p>
      <p class="sb-seg-ai-help-example">
        <strong>절대 시각까지 대기</strong><br>
        <code>@왼쪽에서 @중앙으로 이동하고 1분까지 대기하고 있다가 @퇴장으로 퇴장</code><br>
        → 이동 3초 · 대기 <strong>57초</strong>(타임라인 1:00까지) · 퇴장
      </p>
      <p class="sb-seg-ai-help-example">
        <strong>회전 · 시작 시각</strong><br>
        <code>시작 5초부터 @등장에서 @중앙으로 이동, @중앙에서 90도 회전, 3초 대기 후 퇴장</code>
      </p>

      <p class="sb-seg-ai-help-note">초안 만들기 → 구간·저장위치 연결 확인 ·
        초안 만들고 적용 → 타임라인 키 반영 (솔로 Character 패턴 탭)</p>`;
  const open = pop.hidden;
  document.querySelectorAll('[data-role="ai-help-pop"]').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('[data-act="ai-help"]').forEach((el) => {
    el.classList.toggle('is-on', false);
  });
  if (!open) {
    pop.hidden = false;
    anchor.classList.add('is-on');
    const r = anchor.getBoundingClientRect();
    const w = Math.min(420, window.innerWidth - 16);
    pop.style.width = `${w}px`;
    let top = r.bottom + 6;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    requestAnimationFrame(() => {
      if (top + pop.offsetHeight > window.innerHeight - 8) {
        top = Math.max(8, r.top - pop.offsetHeight - 6);
        pop.style.top = `${top}px`;
      }
      const maxH = window.innerHeight - 16;
      if (pop.offsetHeight > maxH) {
        pop.style.maxHeight = `${maxH}px`;
        pop.style.overflowY = 'auto';
        pop.style.top = '8px';
      }
    });
  }
}

function openAiPatternDefaultsDialog() {
  const defs = loadAiPatternDefaults();
  const dlg = createDialogShell('AI 패턴 기본 Duration');
  const body = dlg.querySelector('.sb-modal-body');
  if (!body) return;
  body.innerHTML = `
    <p class="sb-seg-ai-defaults-hint">문장에 시간(초·분)을 적지 않으면 아래 Duration(구간 길이)이 쓰입니다.
      「1분까지 대기」같은 절대 시각과는 별개입니다.</p>
    <div class="sb-seg-ai-defaults-grid">
      <label>이동<input type="number" data-dur="move" min="0.5" max="120" step="0.5" value="${defs.move}" /></label>
      <label>대기<input type="number" data-dur="hold" min="0.5" max="120" step="0.5" value="${defs.hold}" /></label>
      <label>퇴장<input type="number" data-dur="exit" min="0.5" max="120" step="0.5" value="${defs.exit}" /></label>
    </div>`;
  bindDialogSave(dlg, () => {
    /** @type {Partial<import('../domain/motion/aiPatternDefaults.js').AiPatternDefaults>} */
    const next = {};
    body.querySelectorAll('[data-dur]').forEach((el) => {
      const key = el.getAttribute('data-dur');
      const val = Number(/** @type {HTMLInputElement} */ (el).value);
      if (key && Number.isFinite(val)) next[/** @type {'move'|'hold'|'exit'} */ (key)] = val;
    });
    saveAiPatternDefaults(next);
    closeDialog(dlg);
  });
  wireDialogActions(dlg);
  showDialog(dlg);
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {() => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null} getPresetStore
 * @param {HTMLElement} host
 * @param {() => void} [onChange]
 */
function wireAiPresetMentions(textarea, getPresetStore, host, onChange) {
  const wrap = host.querySelector('[data-role="ai-input-wrap"]') || host;
  const menu = document.createElement('div');
  menu.className = 'sb-ai-mention-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  wrap.appendChild(menu);

  /** @type {import('../domain/motion/positionPresets.js').PositionPreset[]} */
  let items = [];
  let activeIdx = 0;

  function getAtQuery() {
    const pos = textarea.selectionStart ?? 0;
    const before = textarea.value.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    const query = before.slice(at + 1);
    if (/[\s@]/.test(query)) return null;
    return { at, query, pos };
  }

  function renderMenu(query) {
    const presets = getPresetStore()?.list() || [];
    const q = (query || '').toLowerCase();
    items = presets.filter((p) => !q || p.label.toLowerCase().includes(q));
    if (!items.length) {
      menu.hidden = true;
      return;
    }
    activeIdx = Math.min(activeIdx, items.length - 1);
    menu.innerHTML = items.map((p, i) => `
      <button type="button" class="sb-ai-mention-item${i === activeIdx ? ' is-active' : ''}"
        data-i="${i}" role="option">
        <span class="sb-ai-mention-label">@${escapeHtml(p.label)}</span>
        <span class="sb-ai-mention-meta">X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)} · Y° ${p.rotY}</span>
      </button>`).join('');
    menu.hidden = false;
  }

  /** @param {import('../domain/motion/positionPresets.js').PositionPreset} preset */
  function insertMention(preset) {
    const ctx = getAtQuery();
    if (!ctx) return;
    const insert = `@${preset.label} `;
    const val = textarea.value;
    textarea.value = val.slice(0, ctx.at) + insert + val.slice(ctx.pos);
    const caret = ctx.at + insert.length;
    textarea.selectionStart = caret;
    textarea.selectionEnd = caret;
    menu.hidden = true;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    onChange?.();
  }

  textarea.addEventListener('input', () => {
    const ctx = getAtQuery();
    if (!ctx) {
      menu.hidden = true;
      onChange?.();
      return;
    }
    activeIdx = 0;
    renderMenu(ctx.query);
    onChange?.();
  });

  textarea.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      renderMenu(getAtQuery()?.query || '');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderMenu(getAtQuery()?.query || '');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (items[activeIdx]) insertMention(items[activeIdx]);
    } else if (e.key === 'Escape') {
      menu.hidden = true;
    }
  });

  menu.addEventListener('mousedown', (e) => {
    const btn = e.target.closest?.('.sb-ai-mention-item');
    if (!btn) return;
    e.preventDefault();
    const i = Number(btn.getAttribute('data-i'));
    if (items[i]) insertMention(items[i]);
  });

  document.addEventListener('mousedown', (e) => {
    if (!host.contains(/** @type {Node} */ (e.target))) menu.hidden = true;
    const helpPop = document.querySelector('[data-role="ai-help-pop"]');
    const helpBtn = host.querySelector('[data-act="ai-help"]');
    if (helpPop && !helpPop.hidden
      && !helpPop.contains(/** @type {Node} */ (e.target))
      && !helpBtn?.contains(/** @type {Node} */ (e.target))) {
      helpPop.hidden = true;
      helpBtn?.classList.remove('is-on');
    }
  });
}
