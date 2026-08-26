/**
 * 패널 하단 드래그로 세로 높이 조절 (v3 panelResize.js)
 * storageKey 버전 bump 시 짧은 예전 저장값을 무시하고 새 default 적용.
 */
const STORAGE_PREFIX = 'sb-panel-h:';
const STORAGE_VER = 'v3';

function storageFullKey(key) {
  return `${STORAGE_PREFIX}${STORAGE_VER}:${key}`;
}

/**
 * @param {HTMLElement} panel
 * @param {{
 *   minHeight?: number,
 *   maxHeight?: number,
 *   defaultHeight?: number,
 *   storageKey?: string | null,
 * }} [opts]
 */
export function attachPanelResizeHandle(panel, opts = {}) {
  if (!panel || panel.dataset.resizeAttached === '1') return;

  const minHeight = opts.minHeight ?? 120;
  const maxHeight = opts.maxHeight
    ?? Math.max(480, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.82));
  const defaultHeight = opts.defaultHeight ?? 200;
  const storageKey = opts.storageKey ?? null;

  panel.dataset.resizeAttached = '1';
  panel.classList.add('sb-panel-resizable');

  let height = defaultHeight;
  if (storageKey) {
    const saved = parseInt(localStorage.getItem(storageFullKey(storageKey)), 10);
    if (Number.isFinite(saved)) height = saved;
  }
  height = Math.min(maxHeight, Math.max(minHeight, height));
  panel.style.flex = '0 0 auto';
  panel.style.height = `${height}px`;

  const handle = document.createElement('div');
  handle.className = 'sb-panel-resize-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-label', '패널 높이 조절 — 드래그');
  handle.title = '드래그하여 높이 조절';
  handle.innerHTML = '<span class="sb-panel-resize-grip" aria-hidden="true"></span>';
  panel.appendChild(handle);

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startH = panel.offsetHeight;
    const liveMax = Math.max(
      maxHeight,
      Math.floor((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.88),
    );
    panel.classList.add('sb-panel-resizing');
    document.body.classList.add('sb-panel-resize-active');

    const onMove = (ev) => {
      const next = Math.min(liveMax, Math.max(minHeight, startH + (ev.clientY - startY)));
      panel.style.height = `${next}px`;
    };

    const onUp = () => {
      panel.classList.remove('sb-panel-resizing');
      document.body.classList.remove('sb-panel-resize-active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (storageKey) {
        localStorage.setItem(storageFullKey(storageKey), String(panel.offsetHeight));
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function initResizableInSlot(slot, slotId) {
  if (!slot) return;
  slot.querySelectorAll('.floating-panel').forEach((panel, index) => {
    if (panel.dataset.resizeAttached === '1') return;
    const title =
      panel.querySelector('.sb-dock-panel-head-title')?.textContent?.trim() ||
      `panel-${index}`;
    attachPanelResizeHandle(panel, {
      storageKey: `dock-${slotId}-${title.replace(/\s+/g, '-')}`,
      defaultHeight: slotId === 'stage' ? 220 : 280,
    });
  });
}
