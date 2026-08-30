import { mountPositionPresetBar } from './segmentStepUi.js';

/**
 * 프로젝트 공통 위치 프리셋 패널.
 *
 * @param {{
 *   getPresetStore?: () => import('../domain/motion/PositionPresetStore.js').PositionPresetStore | null,
 *   onApplyPreset?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPickPoint?: (onPicked: (pt: { x: number, z: number }) => void, onCancelled?: () => void) => void,
 *   getCaptureHint?: () => { x: number, z: number, rotY?: number, opacity?: number } | null,
 *   getSegmentStagePreview?: () => {
 *     begin: () => void,
 *     end: () => void,
 *     resetPreview: () => void,
 *     previewPresetLocation?: (pose: { x: number, z: number, rotY?: number, opacity?: number }) => void,
 *   } | null,
 *   onPresetUpdated?: (preset: import('../domain/motion/positionPresets.js').PositionPreset) => void,
 *   onPositionPresetsChanged?: () => void,
 *   onPresetRemoved?: (presetId: string) => void,
 * }} opts
 */
export function createPositionPresetsPanelBody(opts) {
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-pos-presets-panel';
  root.innerHTML = `<div data-role="presets"></div>`;

  const host = root.querySelector('[data-role="presets"]');

  function render() {
    if (!host) return;
    const preview = opts.getSegmentStagePreview?.();
    mountPositionPresetBar(host, {
      presetStore: opts.getPresetStore?.() ?? null,
      onApplyPreset: (preset) => opts.onApplyPreset?.(preset),
      onPickStage: (onPicked, onCancelled) => {
        opts.onPickPoint?.(onPicked, onCancelled);
      },
      onCaptureHint: () => opts.getCaptureHint?.() ?? null,
      onPreviewBegin: () => preview?.begin(),
      onPreviewEnd: () => preview?.end(),
      onPreviewReset: () => preview?.resetPreview(),
      onPreviewPreset: (form) => preview?.previewPresetLocation?.({
        x: Number(form.x) || 0,
        z: Number(form.z) || 0,
        rotY: Number(form.rotY) || 0,
        opacity: form.opacity ?? 1,
      }),
      onPresetUpdated: (preset) => opts.onPresetUpdated?.(preset),
      onPositionPresetsChanged: () => opts.onPositionPresetsChanged?.(),
      onPresetRemoved: (id) => opts.onPresetRemoved?.(id),
      onChange: () => render(),
      hideLabel: true,
    });
  }

  render();

  return { root, render };
}
