/**
 * 오른쪽 세로 아이콘 레일 + 토글 패널 도크
 */
import { initResizableInSlot } from "./panelResize.js";

export function createRightPanelRail(root) {
  const dock = root.querySelector("#sidebar-right-dock");
  const rail = root.querySelector("#sidebar-right-rail");

  if (!dock || !rail) {
    console.warn("RightPanelRail: dock/rail not found");
    return { registerPanel() {} };
  }

  const panels = new Map();

  function registerPanel({ id, icon, label, panelEl, defaultOpen = false }) {
    if (!panelEl) return;

    const slot = document.createElement("div");
    slot.className = "sb-rail-panel-slot";
    slot.dataset.panelId = id;
    slot.hidden = !defaultOpen;
    slot.appendChild(panelEl);
    dock.appendChild(slot);
    initResizableInSlot(slot, id);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sb-rail-btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.dataset.panelId = id;
    btn.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
    if (defaultOpen) btn.classList.add("on");

    btn.addEventListener("click", () => togglePanel(id));
    rail.appendChild(btn);

    panels.set(id, { slot, btn, open: defaultOpen });
  }

  function togglePanel(id) {
    const entry = panels.get(id);
    if (!entry) return;
    entry.open = !entry.open;
    entry.slot.hidden = !entry.open;
    entry.btn.classList.toggle("on", entry.open);
  }

  return { registerPanel, togglePanel };
}
