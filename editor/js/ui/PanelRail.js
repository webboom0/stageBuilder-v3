/**
 * 세로 아이콘 레일 + 토글 패널 도크 (좌/우 공용)
 * - left + equal: 열린 패널이 도크 높이를 균등 분할
 * - right + resizable: 패널별 드래그 리사이즈
 */
import { initResizableInSlot } from "./panelResize.js";

export function createPanelRail(root, opts = {}) {
  const side = opts.side || "right";
  const distribution = opts.distribution || (side === "left" ? "equal" : "resizable");

  const dockSel = side === "left" ? "#sidebar-left-dock" : "#sidebar-right-dock";
  const railSel = side === "left" ? "#sidebar-left-rail" : "#sidebar-right-rail";

  const dock = root.querySelector(dockSel);
  const rail = root.querySelector(railSel);

  if (!dock || !rail) {
    console.warn(`PanelRail: dock/rail not found (${side})`);
    return { registerPanel() {}, rebalanceHeights() {} };
  }

  const panels = new Map();

  function rebalanceHeights() {
    if (distribution !== "equal") return;

    const slots = [...dock.querySelectorAll(".sb-rail-panel-slot:not([hidden])")];
    const count = slots.length;
    if (!count) return;

    slots.forEach((slot) => {
      slot.style.flex = "1 1 0";
      slot.style.minHeight = "0";
      slot.style.height = "";

      const panel = slot.querySelector(".floating-panel");
      if (panel) {
        panel.style.flex = "1 1 auto";
        panel.style.height = "100%";
        panel.style.minHeight = "0";
      }
    });
  }

  function registerPanel({ id, icon, label, panelEl, defaultOpen = false }) {
    if (!panelEl) return;

    const slot = document.createElement("div");
    slot.className = "sb-rail-panel-slot";
    slot.dataset.panelId = id;
    slot.hidden = !defaultOpen;
    slot.appendChild(panelEl);
    dock.appendChild(slot);

    if (distribution === "resizable") {
      initResizableInSlot(slot, id);
    }

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

    if (distribution === "equal") {
      requestAnimationFrame(rebalanceHeights);
    }
  }

  function togglePanel(id) {
    const entry = panels.get(id);
    if (!entry) return;
    entry.open = !entry.open;
    entry.slot.hidden = !entry.open;
    entry.btn.classList.toggle("on", entry.open);

    if (distribution === "equal") {
      rebalanceHeights();
    }
  }

  const ro = distribution === "equal" ? new ResizeObserver(() => rebalanceHeights()) : null;
  ro?.observe(dock);

  return { registerPanel, togglePanel, rebalanceHeights };
}
