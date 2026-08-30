import { SEGMENT_KIND_LABELS, normalizeRotYDeg } from '../domain/motion/groupSegments.js';
import { formatSegmentStepSummary, formatStartStepSummary } from '../domain/motion/positionPresets.js';
import { normalizeMotionTemplate } from '../domain/motion/motionTemplates.js';
import {
  KEYFRAME_APPLY_LABEL,
  openKindPicker,
  openSegmentEditDialog,
  openStartEditDialog,
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

/** @param {DraftKeyframe} kf @param {number} [startTimeSec] */
function formatMacroStartSummary(kf, startTimeSec = 0) {
  return formatStartStepSummary({
    startTime: startTimeSec,
    fromX: kf.offsetX,
    fromZ: kf.offsetZ,
    fromRotY: kf.deltaRotY,
    opacity: kf.opacity,
  });
}

/** @param {DraftKeyframe} kf */
function formatMacroKeySummary(kf) {
  const kind = kf.kind || 'move';
  return formatSegmentStepSummary({
    kind,
    duration: kf.timeOffset,
    anchorX: kf.offsetX,
    anchorZ: kf.offsetZ,
    toRotY: kf.deltaRotY,
  });
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
    html += `
      <button type="button" class="sb-seg-step-btn sb-seg-step-btn--filled sb-seg-step-btn--${kindClass} ${typeClass}"
        data-step="kf" data-id="${escapeAttr(kf.id)}" data-idx="${idx}">
        <span class="sb-seg-step-kind">${kindLabel}</span>
        <span class="sb-seg-step-detail">${escapeHtml(isStart ? formatMacroStartSummary(kf, startT) : formatMacroKeySummary(kf))}</span>
        ${!isStart && keys.length > 1 ? `<span class="sb-seg-step-rm" data-act="rm-kf" data-id="${escapeAttr(kf.id)}" title="삭제">×</span>` : ''}
      </button>`;
  });

  html += `<button type="button" class="sb-seg-step-add" data-act="add-kf" title="키 추가">+</button>`;
  html += `<div class="sb-seg-steps-actions">`;
  if (ctx.onApply) {
    html += `<button type="button" class="sb-chip acc go" data-act="apply-macro">${KEYFRAME_APPLY_LABEL}</button>`;
  }
  html += `</div>`;

  container.innerHTML = html;

  const presetDialogOpts = {
    presetStore: ctx.getPresetStore?.() ?? null,
    onPickPoint: (pick) => ctx.onPickPoint?.(pick),
    onPresetUpdated: (p) => ctx.onPresetUpdated?.(p),
    onPositionPresetsChanged: () => ctx.onPositionPresetsChanged?.(),
    onPresetRemoved: (id) => ctx.onPresetRemoved?.(id),
  };

  /** @param {DraftKeyframe} kf @param {number} idx */
  function openDraftKeyframeEdit(kf, idx) {
    if (idx === 0) {
      openStartEditDialog({
        macroMode: true,
        absolutePattern: !macroLib,
        showFormation: false,
        ...presetDialogOpts,
        start: {
          startTime: startT,
          fromX: kf.offsetX,
          fromZ: kf.offsetZ,
          fromRotY: kf.deltaRotY,
          opacity: kf.opacity,
        },
        onSave: (patch) => {
          Object.assign(kf, {
            offsetX: patch.fromX,
            offsetZ: patch.fromZ,
            deltaRotY: patch.fromRotY,
            opacity: patch.opacity,
          });
          ctx.onChange?.();
          void ctx.onPersist?.();
        },
      });
      return;
    }
    openSegmentEditDialog({
      macroMode: true,
      absolutePattern: !macroLib,
      showFormation: false,
      ...presetDialogOpts,
      segment: {
        id: kf.id,
        kind: kf.kind || 'move',
        duration: kf.timeOffset,
        anchorX: kf.offsetX,
        anchorZ: kf.offsetZ,
        toRotY: kf.deltaRotY,
        easing: 'smooth',
      },
      onSave: (patch) => {
        Object.assign(kf, {
          kind: kf.kind || 'move',
          timeOffset: patch.duration,
          offsetX: patch.anchorX,
          offsetZ: patch.anchorZ,
          deltaRotY: patch.toRotY,
          opacity: kf.kind === 'exit' ? 0 : kf.opacity,
          visible: kf.kind !== 'exit',
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

  container.querySelector('[data-act="add-kf"]')?.addEventListener('click', () => {
    openKindPicker((kind) => {
      const draftRef = ctx.getDraft();
      if (!draftRef) return;
      const last = draftRef.keyframes[draftRef.keyframes.length - 1];
      const newKf = {
        id: newDraftKeyframeId(),
        kind,
        timeOffset: 3,
        offsetX: last?.offsetX ?? 0,
        offsetZ: last?.offsetZ ?? 0,
        deltaRotY: last?.deltaRotY ?? 0,
        opacity: kind === 'exit' ? 0 : (last?.opacity ?? 1),
        visible: kind !== 'exit',
      };
      draftRef.keyframes.push(newKf);
      const newIdx = draftRef.keyframes.length - 1;
      ctx.onChange?.();
      void ctx.onPersist?.();
      requestAnimationFrame(() => {
        openDraftKeyframeEdit(newKf, newIdx);
      });
    }, '키 추가');
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
