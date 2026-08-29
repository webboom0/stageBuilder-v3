import {
  GRID_MODE_ADAPTIVE,
  GRID_MODE_FIXED,
  GRID_MODE_GRID_HELPER,
} from '../../domain/stage/stageGridAdaptive.js';

/**
 * Right-side menubar strip: 그리드 · 멀티뷰 (v3 Viewport.Controls).
 *
 * @param {HTMLElement} host
 * @param {{
 *   helpers: import('../../domain/stage/StageViewportHelpers.js').StageViewportHelpers,
 *   onChange?: () => void,
 *   onMultiViewToggle?: (enabled: boolean) => void,
 *   getMultiViewEnabled?: () => boolean,
 * }} ctx
 */
export function mountViewportMenubarControls(host, ctx) {
  host.id = 'viewport-controls';
  host.className = 'menubar-viewport-controls';
  host.innerHTML = `
    <label class="viewport-grid-toggle" title="그리드 표시">
      <input type="checkbox" class="viewport-grid-checkbox" />
      <span class="viewport-grid-label">그리드</span>
    </label>
    <select class="viewport-grid-mode-select" title="격자 종류" aria-label="격자 종류">
      <option value="${GRID_MODE_ADAPTIVE}">격자: 자동</option>
      <option value="${GRID_MODE_FIXED}">격자: 1m 고정</option>
      <option value="${GRID_MODE_GRID_HELPER}">격자: GridHelper</option>
    </select>
    <span class="viewport-grid-scale" aria-live="polite"></span>
    <label class="viewport-grid-toggle viewport-multiview-toggle" title="2×2 멀티뷰 (정면/관객·좌/우·상단·자유)">
      <input type="checkbox" class="viewport-grid-checkbox viewport-multiview-checkbox" />
      <span class="viewport-grid-label">멀티뷰</span>
    </label>
  `;

  const checkbox = /** @type {HTMLInputElement} */ (host.querySelector('.viewport-grid-checkbox:not(.viewport-multiview-checkbox)'));
  const multiCb = /** @type {HTMLInputElement} */ (host.querySelector('.viewport-multiview-checkbox'));
  const modeSelect = /** @type {HTMLSelectElement} */ (host.querySelector('.viewport-grid-mode-select'));
  const scaleEl = /** @type {HTMLElement} */ (host.querySelector('.viewport-grid-scale'));

  function syncFromHelpers() {
    const states = ctx.helpers.getHelperStates();
    checkbox.checked = !!states.gridHelper;
    modeSelect.value = ctx.helpers.getGridMode();
  }

  checkbox.addEventListener('change', () => {
    ctx.helpers.setHelperStates({ gridHelper: checkbox.checked });
    ctx.onChange?.();
  });

  modeSelect.addEventListener('change', () => {
    ctx.helpers.setGridMode(modeSelect.value);
    ctx.onChange?.();
  });

  multiCb.addEventListener('change', () => {
    ctx.onMultiViewToggle?.(multiCb.checked);
  });

  syncFromHelpers();
  syncMultiView();

  function syncMultiView() {
    if (ctx.getMultiViewEnabled) {
      multiCb.checked = !!ctx.getMultiViewEnabled();
    }
  }

  return {
    sync: () => {
      syncFromHelpers();
      syncMultiView();
    },
    syncMultiView,
    /** @param {{ label?: string, mode?: string } | null} scale */
    setScaleLabel(scale) {
      if (scale?.mode === GRID_MODE_GRID_HELPER) {
        scaleEl.textContent = 'GridHelper';
        return;
      }
      scaleEl.textContent = scale?.label ? `칸 ${scale.label}` : '';
    },
  };
}
