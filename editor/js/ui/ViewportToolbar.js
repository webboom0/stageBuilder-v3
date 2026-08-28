import { TRANSFORM_ICONS, VIEWPORT_VIEW_ICONS } from './viewportToolbarIcons.js';

/**
 * v3 Toolbar.js layout:
 * translate/rotate/scale | P / AUD / F / R / L / T | zoom± | stage focus | local
 *
 * @param {HTMLElement} container
 * @param {{
 *   onCameraPreset: (id: import('../domain/stage/CameraPresets.js').CameraPresetId) => void,
 *   onZoom?: (delta: number) => void,
 *   onTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => void,
 *   onStageFocusToggle?: () => void,
 *   onBuildingLockToggle?: () => boolean,
 * }} ctx
 */
export function mountViewportToolbar(container, ctx) {
  container.innerHTML = `
    <button type="button" class="toolbar-btn selected" data-transform="translate" title="이동">
      <span class="toolbar-svg-icon" aria-hidden="true">${TRANSFORM_ICONS.translate}</span>
    </button>
    <button type="button" class="toolbar-btn" data-transform="rotate" title="회전">
      <span class="toolbar-svg-icon" aria-hidden="true">${TRANSFORM_ICONS.rotate}</span>
    </button>
    <button type="button" class="toolbar-btn" data-transform="scale" title="스케일">
      <span class="toolbar-svg-icon" aria-hidden="true">${TRANSFORM_ICONS.scale}</span>
    </button>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="perspective" title="원근 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.perspective}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="audience" title="객석 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.audience}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="front" title="정면 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.front}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="right" title="우측 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.right}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="left" title="좌측 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.left}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-preset="top" title="상단 시점">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.top}</span>
    </button>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-zoom="in" title="확대">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.zoomIn}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-zoom="out" title="축소">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.zoomOut}</span>
    </button>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-stage-focus="1" title="무대 전체 보기" aria-label="무대 전체 보기">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.stageFocus}</span>
    </button>
    <button type="button" class="toolbar-btn toolbar-btn--view" data-building-lock="1" title="빌딩고정" aria-label="빌딩고정">
      <span class="toolbar-svg-icon" aria-hidden="true">${VIEWPORT_VIEW_ICONS.lockBuilding}</span>
    </button>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <label class="toolbar-local-switch" title="로컬">
      <input type="checkbox" id="sb-toolbar-local" />
    </label>
  `;

  const transformBtns = container.querySelectorAll('[data-transform]');
  transformBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-transform');
      transformBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (mode) ctx.onTransformMode?.(/** @type {'translate'|'rotate'|'scale'} */ (mode));
    });
  });

  container.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-preset');
      if (id) ctx.onCameraPreset(/** @type {any} */ (id));
    });
  });

  container.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-zoom');
      ctx.onZoom?.(dir === 'in' ? 10 : -10);
    });
  });

  const focusBtn = container.querySelector('[data-stage-focus]');
  focusBtn?.addEventListener('click', () => {
    ctx.onStageFocusToggle?.();
  });

  const lockBuildingBtn = container.querySelector('[data-building-lock]');
  lockBuildingBtn?.addEventListener('click', () => {
    const on = ctx.onBuildingLockToggle?.();
    if (typeof on === 'boolean') {
      lockBuildingBtn.classList.toggle('selected', on);
    }
  });

  enableToolbarDrag(container);

  return {
    /** @param {boolean} on */
    setStageFocusActive(on) {
      focusBtn?.classList.toggle('selected', on);
    },
    /** @param {boolean} on */
    setBuildingLockActive(on) {
      lockBuildingBtn?.classList.toggle('selected', on);
    },
  };
}

/** v3 Toolbar — drag floating toolbar inside viewport */
function enableToolbarDrag(dom) {
  let dragging = false;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let parentRect = null;

  dom.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || event.target.closest('input') || event.target.closest('label')) {
      return;
    }
    const parent = dom.parentElement;
    if (!parent) return;

    dragging = true;
    parentRect = parent.getBoundingClientRect();
    const rect = dom.getBoundingClientRect();

    dom.style.transform = 'none';
    dom.style.left = `${rect.left - parentRect.left}px`;
    dom.style.top = `${rect.top - parentRect.top}px`;
    dom.style.bottom = 'auto';

    pointerOffsetX = event.clientX - rect.left;
    pointerOffsetY = event.clientY - rect.top;
    dom.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  dom.addEventListener('pointermove', (event) => {
    if (!dragging || !parentRect) return;
    const maxLeft = parentRect.width - dom.offsetWidth;
    const maxTop = parentRect.height - dom.offsetHeight;
    let nextLeft = event.clientX - parentRect.left - pointerOffsetX;
    let nextTop = event.clientY - parentRect.top - pointerOffsetY;
    nextLeft = Math.max(0, Math.min(maxLeft, nextLeft));
    nextTop = Math.max(0, Math.min(maxTop, nextTop));
    dom.style.left = `${nextLeft}px`;
    dom.style.top = `${nextTop}px`;
  });

  const stop = (event) => {
    if (!dragging) return;
    dragging = false;
    try {
      dom.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };
  dom.addEventListener('pointerup', stop);
  dom.addEventListener('pointercancel', stop);
}
