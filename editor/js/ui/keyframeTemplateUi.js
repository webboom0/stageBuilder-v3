import { SEGMENT_KIND_LABELS, normalizeRotYDeg } from '../domain/motion/groupSegments.js';
import { formatSegmentStepSummary, formatStartStepSummary } from '../domain/motion/positionPresets.js';
import { normalizeMotionTemplate } from '../domain/motion/motionTemplates.js';
import {
  KEYFRAME_APPLY_LABEL,
  openKindPicker,
  openSegmentEditDialog,
  openStartEditDialog,
  wireStepReorder,
} from './segmentStepUi.js';

let _kfSeq = 1;

/** @returns {string} */
function newDraftKeyframeId() {
  return `kfd_${Date.now().toString(36)}_${(_kfSeq++).toString(36)}`;
}

/**
 * @typedef {{
 *   id: string,
 *   kind?: 'move' | 'hold' | 'exit',
 *   timeOffset: number,
 *   offsetX: number,
 *   offsetZ: number,
 *   deltaRotY: number,
 *   opacity: number,
 *   visible: boolean,
 *   presetId?: string | null,
 * }} DraftKeyframe
 */

/** @returns {{ label: string, keyframes: DraftKeyframe[] }} */
export function createEmptyKeyframeDraft() {
  return {
    label: '',
    keyframes: [makeOriginKeyframe()],
  };
}

/** @returns {DraftKeyframe} */
function makeOriginKeyframe() {
  return {
    id: newDraftKeyframeId(),
    timeOffset: 0,
    offsetX: 0,
    offsetZ: 0,
    deltaRotY: 0,
    opacity: 1,
    visible: true,
    presetId: null,
  };
}

/**
 * @param {import('../domain/motion/motionTemplates.js').MotionTemplate} tpl
 * @returns {{ label: string, keyframes: DraftKeyframe[] }}
 */
export function templateToDraft(tpl) {
  const keys = tpl?.keyframes ?? [];
  if (!keys.length) return createEmptyKeyframeDraft();
  /** @type {DraftKeyframe[]} */
  const keyframes = keys.map((kf, i) => {
    const prev = keys[i - 1];
    const dx = i > 0 ? Math.abs((Number(kf.offsetX) || 0) - (Number(prev?.offsetX) || 0)) : 0;
    const dz = i > 0 ? Math.abs((Number(kf.offsetZ) || 0) - (Number(prev?.offsetZ) || 0)) : 0;
    let kind = /** @type {'move'|'hold'|'exit'} */ ('move');
    if (i === 0) kind = 'move';
    else if (kf.visible === false || kf.opacity === 0) kind = 'exit';
    else if (dx < 0.01 && dz < 0.01) kind = 'hold';
    return {
      id: newDraftKeyframeId(),
      kind,
      timeOffset: i === 0 ? 0 : Math.max(0.1, (Number(kf.timeOffset) || 0) - (Number(prev?.timeOffset) || 0)),
      offsetX: Number(kf.offsetX) || 0,
      offsetZ: Number(kf.offsetZ) || 0,
      deltaRotY: normalizeRotYDeg(kf.deltaRotY ?? 0),
      opacity: Number.isFinite(Number(kf.opacity)) ? Number(kf.opacity) : 1,
      visible: kf.visible !== false,
      presetId: kf.presetId ?? null,
    };
  });
  return { label: tpl.label || '', keyframes };
}

/** @param {DraftKeyframe[]} keys */
function draftTotalSec(keys) {
  let t = 0;
  for (let i = 1; i < keys.length; i++) {
    t += Math.max(0.1, Number(keys[i].timeOffset) || 0);
  }
  return t;
}

/**
 * @param {DraftKeyframe} kf
 * @param {number} [startTimeSec]
 * @param {import('../domain/motion/positionPresets.js').PositionPreset | null} [linked]
 */
function formatMacroStartSummary(kf, startTimeSec = 0, linked = null) {
  if (linked) {
    const t = Number(startTimeSec ?? 0);
    return `${t.toFixed(1)}s · @${linked.label} · X ${roundDisp(linked.x)} · Z ${roundDisp(linked.z)}`;
  }
  return formatStartStepSummary({
    startTime: startTimeSec,
    fromX: kf.offsetX,
    fromZ: kf.offsetZ,
    fromRotY: kf.deltaRotY,
    opacity: kf.opacity,
  });
}

/**
 * @param {DraftKeyframe} kf
 * @param {import('../domain/motion/positionPresets.js').PositionPreset | null} [linked]
 */
function formatMacroKeySummary(kf, linked = null) {
  const kind = kf.kind || 'move';
  if (linked && kind !== 'hold') {
    const dur = Number(kf.timeOffset) || 0;
    const kindLabel = kind === 'exit' ? '퇴장' : '이동';
    return `${dur.toFixed(1)}s · ${kindLabel} · @${linked.label} · X ${roundDisp(linked.x)} · Z ${roundDisp(linked.z)}`;
  }
  return formatSegmentStepSummary({
    kind,
    duration: kf.timeOffset,
    anchorX: kf.offsetX,
    anchorZ: kf.offsetZ,
    toRotY: kf.deltaRotY,
  });
}

/** @param {number} n */
function roundDisp(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v * 100) / 100);
}

/**
 * @param {{ label: string, keyframes: DraftKeyframe[] }} draft
 * @returns {import('../domain/motion/motionTemplates.js').MotionTemplate | null}
 */
export function draftToMotionTemplate(draft) {
  const label = String(draft.label || '').trim();
  if (!label) return null;
  if (!draft.keyframes?.length) return null;

  const keyframes = draft.keyframes.map((kf, i) => ({
    timeOffset: i === 0 ? 0 : Math.max(0.1, Number(kf.timeOffset) || 0),
    offsetX: Number(kf.offsetX) || 0,
    offsetZ: Number(kf.offsetZ) || 0,
    deltaRotY: normalizeRotYDeg(kf.deltaRotY ?? 0),
    opacity: kf.kind === 'exit' ? 0 : (Number.isFinite(Number(kf.opacity)) ? Number(kf.opacity) : 1),
    visible: kf.kind === 'exit' ? false : kf.visible !== false,
    presetId: kf.presetId ?? null,
  }));

  let cumulative = 0;
  const normalized = keyframes.map((kf, i) => {
    if (i === 0) return { ...kf, timeOffset: 0 };
    cumulative += kf.timeOffset;
    return { ...kf, timeOffset: cumulative };
  });

  return normalizeMotionTemplate({
    label,
    opacity: normalized[0]?.opacity ?? 1,
    keyframes: normalized,
  });
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   getDraft: () => { label: string, keyframes: DraftKeyframe[] } | null,
 *   onChange?: () => void,
 *   onPersist?: () => void | Promise<void>,
 *   onApply?: () => void | Promise<void>,
 *   getPresetStore?: () => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onPickPoint?: (pick: {
 *     mode: string,
 *     segmentId?: string,
 *     onPicked?: (pt: { x: number, z: number }) => void,
 *     onCancelled?: () => void,
 *   }) => void,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   macroLibraryMode?: boolean,
 *   getPlayheadSec?: () => number,
 *   onPreviewBegin?: () => void,
 *   onPreviewEnd?: () => void,
 *   onPreviewReset?: () => void,
 *   onPreviewStart?: (draft: Record<string, any>) => void,
 *   onPreviewSegment?: (segmentId: string, draft: Record<string, any>) => void,
 *   onPreviewPreset?: (draft: Record<string, any>) => void,
 * }} ctx
 */
export function renderKeyframeTemplateSteps(container, ctx) {
  const draft = ctx.getDraft();
  if (!draft) {
    container.innerHTML = ctx.macroLibraryMode
      ? '<div class="sb-ens-empty">패턴을 선택하거나 + 로 추가하세요.</div>'
      : '<div class="sb-ens-empty">Character / Stage 트랙을 선택하세요.</div>';
    return;
  }

  const macroLib = !!ctx.macroLibraryMode;
  const presetStore = ctx.getPresetStore?.() ?? null;
  /** @param {string | null | undefined} id */
  const lookupPreset = (id) => (id && presetStore?.get?.(id)) || null;

  const keys = draft.keyframes || [];
  const startT = Number.isFinite(Number(draft.startTimeSec)) ? Number(draft.startTimeSec) : 0;
  const total = draftTotalSec(keys);
  const subtitle = keys.length >= 2
    ? `시작 ${startT.toFixed(1)}s · 총 ${total.toFixed(1)}s`
    : keys.length === 1
      ? `시작 ${startT.toFixed(1)}s · + 로 키를 추가하세요`
      : '시작 위치를 설정한 뒤 + 로 키를 추가하세요';

  let html = `<div class="sb-seg-steps-sub">${escapeHtml(subtitle)}</div>`;

  keys.forEach((kf, idx) => {
    const isStart = idx === 0;
    const kind = kf.kind || (isStart ? 'move' : 'move');
    const kindClass = isStart ? 'start' : kind;
    const kindLabel = isStart ? '시작 위치' : `${idx}. ${SEGMENT_KIND_LABELS[kind] || kind}`;
    const typeClass = isStart || kind === 'move' || kind === 'exit'
      ? 'sb-seg-step-btn--position'
      : 'sb-seg-step-btn--duration';
    const dragAttr = !isStart ? ' draggable="true"' : '';
    const linked = macroLib ? lookupPreset(kf.presetId) : null;
    const detail = isStart
      ? formatMacroStartSummary(kf, startT, linked)
      : formatMacroKeySummary(kf, linked);
    html += `
      <button type="button" class="sb-seg-step-btn sb-seg-step-btn--filled sb-seg-step-btn--${kindClass} ${typeClass}${!isStart ? ' sb-seg-step-btn--draggable' : ''}"
        data-step="kf" data-id="${escapeAttr(kf.id)}" data-idx="${idx}"${dragAttr}
        title="${isStart ? '' : '드래그하여 순서 변경'}">
        ${!isStart ? '<span class="sb-seg-step-grip" aria-hidden="true">⋮⋮</span>' : ''}
        <span class="sb-seg-step-kind">${kindLabel}</span>
        <span class="sb-seg-step-detail">${escapeHtml(detail)}</span>
        ${!isStart && keys.length > 1 ? `<span class="sb-seg-step-rm" data-act="rm-kf" data-id="${escapeAttr(kf.id)}" title="삭제">×</span>` : ''}
      </button>`;
    // 시작·각 키 뒤 — 그 위치에 삽입 (마지막 뒤 = 맨 끝 추가)
    html += `<button type="button" class="sb-seg-step-insert" data-act="insert-kf" data-at="${idx + 1}"
      title="여기에 키 삽입">+</button>`;
  });

  html += `<div class="sb-seg-steps-actions">`;
  if (ctx.onApply) {
    html += `<button type="button" class="sb-chip acc go" data-act="apply-macro">${KEYFRAME_APPLY_LABEL}</button>`;
  }
  html += `</div>`;

  container.innerHTML = html;

  const presetDialogOpts = {
    presetStore,
    onPickPoint: (pick) => ctx.onPickPoint?.(pick),
    onPresetUpdated: (p) => ctx.onPresetUpdated?.(p),
    onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
    onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
    onPreviewBegin: () => ctx.onPreviewBegin?.(),
    onPreviewEnd: () => ctx.onPreviewEnd?.(),
    onPreviewReset: () => ctx.onPreviewReset?.(),
    onPreviewPreset: (form) => ctx.onPreviewPreset?.(form),
  };

  /** 상대좌표 패턴: 시작 프리셋 기준 원점 */
  function relativeOriginAbs() {
    const draftRef = ctx.getDraft();
    const startKf = draftRef?.keyframes?.[0];
    const startP = lookupPreset(startKf?.presetId);
    if (startP) return { x: Number(startP.x) || 0, z: Number(startP.z) || 0 };
    return { x: 0, z: 0 };
  }

  /** @param {DraftKeyframe} kf @param {number} idx */
  function openDraftKeyframeEdit(kf, idx) {
    if (idx === 0) {
      const linked = macroLib ? lookupPreset(kf.presetId) : null;
      const playhead = Number(ctx.getPlayheadSec?.()) || 0;
      const startTimeVal = macroLib
        ? (Number.isFinite(Number(draft.startTimeSec)) && Number(draft.startTimeSec) > 0
          ? Number(draft.startTimeSec)
          : playhead)
        : startT;
      openStartEditDialog({
        showFormation: false,
        ...presetDialogOpts,
        onPreview: (form) => ctx.onPreviewStart?.(form),
        start: {
          startTime: startTimeVal,
          fromX: linked ? Number(linked.x) || 0 : kf.offsetX,
          fromZ: linked ? Number(linked.z) || 0 : kf.offsetZ,
          fromRotY: linked ? normalizeRotYDeg(linked.rotY ?? 0) : kf.deltaRotY,
          opacity: linked
            ? (Number.isFinite(Number(linked.opacity)) ? Number(linked.opacity) : kf.opacity)
            : kf.opacity,
          fromPresetId: kf.presetId ?? null,
        },
        onSave: (patch) => {
          const draftRef = ctx.getDraft();
          if (draftRef && Number.isFinite(Number(patch.startTime))) {
            draftRef.startTimeSec = Math.max(0, Number(patch.startTime) || 0);
          }
          // 패턴 라이브러리: 프리셋 연결 시 시작은 상대원점 (0,0), opacity·회전·링크 유지
          if (macroLib && patch.fromPresetId) {
            Object.assign(kf, {
              offsetX: 0,
              offsetZ: 0,
              deltaRotY: patch.fromRotY,
              opacity: patch.opacity,
              presetId: patch.fromPresetId,
            });
          } else {
            Object.assign(kf, {
              offsetX: patch.fromX,
              offsetZ: patch.fromZ,
              deltaRotY: patch.fromRotY,
              opacity: patch.opacity,
              presetId: patch.fromPresetId ?? null,
            });
          }
          ctx.onChange?.();
          void ctx.onPersist?.();
        },
      });
      return;
    }
    const linked = macroLib ? lookupPreset(kf.presetId) : null;
    openSegmentEditDialog({
      showFormation: false,
      ...presetDialogOpts,
      onPreview: (form) => ctx.onPreviewSegment?.(kf.id, form),
      segment: {
        id: kf.id,
        kind: kf.kind || 'move',
        duration: kf.timeOffset,
        anchorX: linked ? Number(linked.x) || 0 : kf.offsetX,
        anchorZ: linked ? Number(linked.z) || 0 : kf.offsetZ,
        toRotY: linked ? normalizeRotYDeg(linked.rotY ?? kf.deltaRotY) : kf.deltaRotY,
        easing: 'smooth',
        anchorPresetId: kf.presetId ?? null,
      },
      onSave: (patch) => {
        let offsetX = patch.anchorX;
        let offsetZ = patch.anchorZ;
        const presetId = patch.anchorPresetId ?? null;
        // 프리셋 연결 시 절대좌표 → 시작(프리셋) 기준 상대좌표로 저장
        if (macroLib && presetId) {
          const p = lookupPreset(presetId);
          const origin = relativeOriginAbs();
          if (p) {
            offsetX = (Number(p.x) || 0) - origin.x;
            offsetZ = (Number(p.z) || 0) - origin.z;
          } else {
            offsetX = Number(patch.anchorX) - origin.x;
            offsetZ = Number(patch.anchorZ) - origin.z;
          }
        }
        Object.assign(kf, {
          kind: kf.kind || 'move',
          timeOffset: patch.duration,
          offsetX,
          offsetZ,
          deltaRotY: patch.toRotY,
          opacity: kf.kind === 'exit' ? 0 : kf.opacity,
          visible: kf.kind !== 'exit',
          presetId,
        });
        ctx.onChange?.();
        void ctx.onPersist?.();
      },
    });
  }

  container.querySelectorAll('[data-step="kf"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-act="rm-kf"]')) return;
      const id = btn.getAttribute('data-id');
      const idx = Number(btn.getAttribute('data-idx'));
      const kf = keys.find((k) => k.id === id);
      if (!kf) return;
      openDraftKeyframeEdit(kf, idx);
    });
  });

  container.querySelectorAll('[data-act="rm-kf"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const draftRef = ctx.getDraft();
      if (!draftRef || draftRef.keyframes.length <= 1) return;
      draftRef.keyframes = draftRef.keyframes.filter((k) => k.id !== id);
      ctx.onChange?.();
      void ctx.onPersist?.();
    });
  });

  /**
   * @param {number} atIndex — draft.keyframes 삽입 인덱스 (0=시작 고정, 보통 ≥1)
   */
  function insertKeyframeAt(atIndex) {
    openKindPicker((kind) => {
      const draftRef = ctx.getDraft();
      if (!draftRef) return;
      const at = Math.max(1, Math.min(atIndex, draftRef.keyframes.length));
      const prev = draftRef.keyframes[at - 1];
      const newKf = {
        id: newDraftKeyframeId(),
        kind,
        timeOffset: 3,
        offsetX: prev?.offsetX ?? 0,
        offsetZ: prev?.offsetZ ?? 0,
        deltaRotY: prev?.deltaRotY ?? 0,
        opacity: kind === 'exit' ? 0 : (prev?.opacity ?? 1),
        visible: kind !== 'exit',
        presetId: null,
      };
      draftRef.keyframes.splice(at, 0, newKf);
      ctx.onChange?.();
      void ctx.onPersist?.();
      requestAnimationFrame(() => {
        openDraftKeyframeEdit(newKf, at);
      });
    }, '키 삽입');
  }

  container.querySelectorAll('[data-act="insert-kf"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const at = Number(btn.getAttribute('data-at'));
      if (!Number.isFinite(at)) return;
      insertKeyframeAt(at);
    });
  });

  wireStepReorder(container, {
    stepSelector: '[data-step="kf"][draggable="true"]',
    onDrop: (fromId, toId) => {
      const draftRef = ctx.getDraft();
      if (!draftRef) return;
      const list = draftRef.keyframes;
      const from = list.findIndex((k) => k.id === fromId);
      const to = list.findIndex((k) => k.id === toId);
      if (from < 1 || to < 1 || from === to) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      ctx.onChange?.();
      void ctx.onPersist?.();
    },
  });

  container.querySelector('[data-act="apply-macro"]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-act="apply-macro"]');
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.disabled = true;
    try {
      await ctx.onApply?.();
    } finally {
      btn.disabled = false;
    }
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
