import {
  ensureMotionAnim,
  getMotionAnimDuration,
  addMotionAnimSegment,
  updateMotionAnimSegment,
  removeMotionAnimSegment,
  syncMotionAnimStartFromObject,
  importTrackKeyframesToMotionAnim,
  moveMotionAnimSegment,
} from '../domain/motion/motionAnim.js';
import {
  applyAiPatternDraftToMotion,
} from '../domain/motion/aiPatternDraft.js';
import { requestAiPatternDraft } from '../domain/motion/requestAiPatternDraft.js';
import { loadAiPatternDefaults } from '../domain/motion/aiPatternDefaults.js';
import { renderSegmentStepList } from './segmentStepUi.js';

/**
 * Solo motion segment editor — step-based UI (시작 위치 → + 구간 → 키프레임 적용).
 *
 * @param {{
 *   getPresetStore?: () => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onPickPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     motionId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   onApply?: (motionId: string) => void | Promise<void>,
 *   getSegmentStagePreview?: () => {
 *     begin: () => void,
 *     end: () => void,
 *     previewMotionStart: (motionId: string, draft: Record<string, any>) => void,
 *     previewMotionSegment: (motionId: string, segmentId: string, draft: Record<string, any>) => void,
 *     previewPresetLocation?: (pose: { x: number, z: number, rotY?: number, opacity?: number }) => void,
 *   } | null,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 *   onChange?: () => void,
 * }} opts
 */
export function createMotionAnimSection(opts = {}) {
  const root = document.createElement('div');
  root.className = 'sb-motion-anim';
  root.innerHTML = `<div data-role="steps"></div>`;

  const stepsEl = root.querySelector('[data-role="steps"]');

  /** @type {import('../domain/motion/MotionDirector.js').MotionItem | null} */
  let motion = null;

  /**
   * @param {import('../domain/motion/MotionDirector.js').MotionItem} item
   * @param {{
   *   track?: import('../domain/timeline/Track.js').Track | null,
   *   importFromTrack?: boolean,
   *   fallbackStartSec?: number,
   * }} [bindOpts]
   */
  function presetRefs() {
    return (opts.getPresetStore?.()?.list() || []).map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
    }));
  }

  function bind(item, bindOpts) {
    motion = item;
    if (bindOpts?.track && bindOpts.importFromTrack !== false) {
      importTrackKeyframesToMotionAnim(
        bindOpts.track,
        item,
        bindOpts.fallbackStartSec ?? 0,
        { presets: presetRefs() },
      );
    }
    render();
  }

  function refreshFromTrack(track, fallbackStartSec = 0) {
    if (!motion || !track) return;
    importTrackKeyframesToMotionAnim(track, motion, fallbackStartSec, {
      presets: presetRefs(),
    });
    render();
  }

  function clear() {
    motion = null;
    if (stepsEl) stepsEl.innerHTML = '';
  }

  function render() {
    if (!motion || !stepsEl) {
      if (stepsEl) stepsEl.innerHTML = '';
      return;
    }
    const anim = ensureMotionAnim(motion);
    const configured = anim.segments?.length > 0
      ? true
      : !!anim.startConfigured;
    anim.startConfigured = configured;
    const total = getMotionAnimDuration(anim);
    const subtitle = configured
      ? `시작 ${Number(anim.startTime || 0).toFixed(1)}s · 총 ${total.toFixed(1)}s`
      : '시작 위치를 설정한 뒤 + 로 키를 추가하세요';

    const stagePreview = opts.getSegmentStagePreview?.();
    const presetStagePreview = (form) => {
      stagePreview?.previewPresetLocation?.({
        x: Number(form.x ?? form.fromX ?? form.anchorX) || 0,
        z: Number(form.z ?? form.fromZ ?? form.anchorZ) || 0,
        rotY: Number(form.rotY ?? form.fromRotY ?? form.toRotY) || 0,
        opacity: form.opacity ?? 1,
      });
    };

    renderSegmentStepList(stepsEl, {
      startConfigured: configured,
      subtitle,
      getStart: () => anim,
      getSegments: () => anim.segments,
      getPresetStore: () => opts.getPresetStore?.() ?? null,
      onPreviewBegin: () => stagePreview?.begin(),
      onPreviewEnd: () => stagePreview?.end(),
      onPreviewReset: () => stagePreview?.resetPreview(),
      onPreviewStart: (draft) => stagePreview?.previewMotionStart(motion.id, draft),
      onPreviewSegment: (segId, draft) => stagePreview?.previewMotionSegment(motion.id, segId, draft),
      onPreviewPreset: presetStagePreview,
      onPresetUpdated: (preset) => opts.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => opts.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => opts.onPresetRemoved?.(id),
      onEditStart: (commit) => {
        commit((patch) => {
          Object.assign(anim, patch);
          if (patch.fromFormation != null) anim.fromFormation = patch.fromFormation;
        });
        render();
      },
      onEditSegment: (segId, commit) => {
        commit((patch) => updateMotionAnimSegment(anim, segId, patch));
        render();
      },
      onAddSegment: (kind, atIndex) => {
        const seg = addMotionAnimSegment(anim, kind, atIndex);
        render();
        return seg.id;
      },
      onRemoveSegment: (segId) => {
        removeMotionAnimSegment(anim, segId);
        render();
      },
      onMoveSegment: (segId, toIndex) => {
        moveMotionAnimSegment(anim, segId, toIndex);
        render();
      },
      onSyncFromObject: () => {
        syncMotionAnimStartFromObject(motion);
        render();
      },
      onPickPoint: (pick) => {
        opts.onPickPoint?.({
          ...pick,
          motionId: motion.id,
        });
      },
      onApply: async () => {
        if (!anim.startConfigured) {
          window.alert('먼저 시작 위치를 설정하세요.');
          return;
        }
        if (!anim.segments.length) {
          window.alert('적용할 구간이 없습니다. + 버튼으로 이동·대기·퇴장을 추가하세요.');
          return;
        }
        await opts.onApply?.(motion.id);
      },
      onAiGenerate: async (prompt, opt) => {
        const presets = (opts.getPresetStore?.()?.list() || []).map((p) => ({
          id: p.id,
          label: p.label,
          x: p.x,
          z: p.z,
          rotY: p.rotY,
          opacity: p.opacity,
        }));
        const obj = motion.object;
        const result = await requestAiPatternDraft(prompt, {
          presets,
          defaultDurations: loadAiPatternDefaults(),
          pattern: anim.startConfigured ? {
            startConfigured: true,
            startTime: anim.startTime,
            fromX: anim.fromX,
            fromZ: anim.fromZ,
            fromRotY: anim.fromRotY,
            fromPresetId: anim.fromPresetId ?? null,
            opacity: anim.opacity,
          } : null,
          current: {
            x: obj?.position?.x ?? anim.fromX,
            z: obj?.position?.z ?? anim.fromZ,
            rotY: obj
              ? (obj.rotation.y * 180) / Math.PI
              : anim.fromRotY,
            opacity: anim.opacity,
            startTime: anim.startTime,
          },
        });
        if (!result.ok) {
          window.alert(result.error || '생성 실패');
          return;
        }
        applyAiPatternDraftToMotion(motion, result.draft);
        opts.onChange?.();
        render();
        const status = stepsEl?.querySelector('[data-role="ai-status"]');
        if (status instanceof HTMLElement) {
          status.hidden = false;
          const src = result.source === 'llm' ? 'AI' : '로컬';
          status.textContent = `${src}: ${result.summary}`;
        }
        if (opt.apply) {
          await opts.onApply?.(motion.id);
        }
      },
      onChange: () => {
        opts.onChange?.();
        render();
      },
    });
  }

  return { root, bind, clear, render, refreshFromTrack };
}
