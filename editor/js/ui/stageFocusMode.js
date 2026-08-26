/**
 * v3 Viewport full-mode — hide chrome, stage fills the window.
 * Enter: toolbar button / 보기→무대 전체 보기 / viewport dblclick
 * Exit: ESC / dblclick again
 */

const NOTIFY_ID = 'fullscreen-notification';

/** @type {boolean} */
let active = false;

/** @type {Set<(active: boolean) => void>} */
const listeners = new Set();

export function isStageFocusActive() {
  return active;
}

/**
 * @param {(active: boolean) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onStageFocusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(active);
    } catch (err) {
      console.warn(err);
    }
  });
}

/**
 * @param {string} message
 */
function showNotification(message) {
  const existing = document.getElementById(NOTIFY_ID);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = NOTIFY_ID;
  el.className = 'sb-fullscreen-notification';
  el.textContent = message;
  document.body.appendChild(el);

  window.setTimeout(() => {
    el.classList.add('is-hiding');
    window.setTimeout(() => el.remove(), 300);
  }, 2800);
}

function onEscapeKey(event) {
  if (event.key === 'Escape' && active) {
    event.preventDefault();
    exitStageFocus();
  }
}

/**
 * @param {{ notify?: boolean }} [opts]
 */
export function enterStageFocus(opts = {}) {
  if (active) return;
  active = true;
  document.body.classList.add('full-mode');
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onEscapeKey);
  if (opts.notify !== false) {
    showNotification('무대 전체 보기 (ESC 또는 더블클릭으로 종료)');
  }
  emit();
  // layout settle then consumers resize WebGL
  requestAnimationFrame(() => {
    requestAnimationFrame(() => emit());
  });
}

/**
 * @param {{ notify?: boolean }} [opts]
 */
export function exitStageFocus(opts = {}) {
  if (!active) return;
  active = false;
  document.body.classList.remove('full-mode');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onEscapeKey);
  if (opts.notify !== false) {
    showNotification('일반 모드로 복원되었습니다');
  }
  emit();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => emit());
  });
}

/**
 * @param {{ notify?: boolean }} [opts]
 */
export function toggleStageFocus(opts = {}) {
  if (active) exitStageFocus(opts);
  else enterStageFocus(opts);
}

/**
 * Double-click on viewport toggles focus (ignore clicks on toolbar/UI).
 * @param {HTMLElement} viewportEl
 */
export function bindViewportStageFocus(viewportEl) {
  if (!viewportEl) return () => {};

  const onDblClick = (event) => {
    if (event.target.closest?.('button, a, input, select, label, .sb-viewport-toolbar')) {
      return;
    }
    toggleStageFocus();
  };

  viewportEl.addEventListener('dblclick', onDblClick);
  return () => viewportEl.removeEventListener('dblclick', onDblClick);
}
