/**
 * 패널 하단 모서리 드래그로 세로 높이 조절
 */

const STORAGE_PREFIX = "sb-panel-h:";

function defaultHeightFor(slotId, index, title) {
  if (slotId === "assets") return index === 0 ? 240 : 180;
  if (slotId === "mesh") return index === 0 ? 140 : 200;
  if (slotId === "stage") return 200;
  if (slotId === "nanseol") return 180;
  if (slotId === "scene") return 220;
  return 200;
}

export function attachPanelResizeHandle(panel, opts = {}) {
  if (!panel || panel.dataset.resizeAttached === "1") return;

  const {
    minHeight = 72,
    maxHeight = 720,
    defaultHeight = 200,
    storageKey = null,
  } = opts;

  panel.dataset.resizeAttached = "1";
  panel.classList.add("sb-panel-resizable");

  const key = storageKey || panel.dataset.resizeKey;
  let height = defaultHeight;
  if (key) {
    const saved = parseInt(localStorage.getItem(STORAGE_PREFIX + key), 10);
    if (Number.isFinite(saved)) height = saved;
  }
  height = Math.min(maxHeight, Math.max(minHeight, height));
  panel.style.flex = "0 0 auto";
  panel.style.height = `${height}px`;

  const handle = document.createElement("div");
  handle.className = "sb-panel-resize-handle";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "패널 높이 조절");
  handle.innerHTML = '<span class="sb-panel-resize-grip" aria-hidden="true"></span>';
  panel.appendChild(handle);

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startH = panel.offsetHeight;
    panel.classList.add("sb-panel-resizing");
    document.body.classList.add("sb-panel-resize-active");

    const onMove = (ev) => {
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, startH + (ev.clientY - startY)),
      );
      panel.style.height = `${next}px`;
    };

    const onUp = () => {
      panel.classList.remove("sb-panel-resizing");
      document.body.classList.remove("sb-panel-resize-active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (key) {
        localStorage.setItem(STORAGE_PREFIX + key, String(panel.offsetHeight));
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

export function initResizableInSlot(slot, slotId) {
  if (!slot) return;

  const panels = slot.querySelectorAll(".floating-panel");
  panels.forEach((panel, index) => {
    const header = panel.querySelector(".panel-header");
    const title =
      header?.childNodes[0]?.textContent?.trim() ||
      header?.textContent?.trim() ||
      `panel-${index}`;
    const storageKey = `dock-${slotId}-${title.replace(/\s+/g, "-")}`;

    attachPanelResizeHandle(panel, {
      storageKey,
      defaultHeight: defaultHeightFor(slotId, index, title),
    });
  });
}
