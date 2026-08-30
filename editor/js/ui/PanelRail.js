import { initResizableInSlot } from './panelResize.js';

export function createPanelRail(root, opts = {}) {
  const side = opts.side || 'right';
  const distribution = opts.distribution || (side === 'left' ? 'equal' : 'resizable');
  const collapseMode = opts.collapseMode === true;

  const dockSel = side === 'left' ? '#sidebar-left-dock' : '#sidebar-right-dock';
  const railSel = side === 'left' ? '#sidebar-left-rail' : '#sidebar-right-rail';

  const dock = root.querySelector(dockSel);
  const rail = root.querySelector(railSel);

  if (!dock || !rail) {
    console.warn(`PanelRail: dock/rail not found (${side})`);
    return {
      registerPanel() {},
      registerRailGroup() {},
      togglePanel() {},
      openPanel() {},
      rebalanceHeights() {},
    };
  }

  /** @type {Map<string, {
   *   slot: HTMLElement,
   *   btn: HTMLButtonElement,
   *   open: boolean,
   *   wasOpened: boolean,
   *   panelApi?: { setCollapsed: (v: boolean) => void, isCollapsed: () => boolean },
   * }>} */
  const panels = new Map();

  function rebalanceHeights() {
    if (distribution !== 'equal') return;
    const slots = [...dock.querySelectorAll('.sb-rail-panel-slot:not([hidden])')];
    slots.forEach((slot) => {
      slot.style.flex = '1 1 0';
      slot.style.minHeight = '0';
      slot.style.height = '';
      const panel = slot.querySelector('.floating-panel');
      if (panel) {
        panel.style.flex = '1 1 auto';
        panel.style.height = '100%';
        panel.style.minHeight = '0';
      }
    });
  }

  /** @param {{ slot: HTMLElement, btn: HTMLButtonElement, open: boolean, wasOpened: boolean, panelApi?: { isCollapsed: () => boolean } }} entry */
  function syncRailBtn(entry) {
    const expanded = entry.panelApi ? !entry.panelApi.isCollapsed() : entry.open;
    const inDock = collapseMode ? entry.wasOpened : !entry.slot.hidden;
    entry.btn.classList.toggle('on', inDock);
    entry.btn.classList.toggle('is-expanded', inDock && expanded);
    entry.btn.setAttribute('aria-pressed', inDock && expanded ? 'true' : 'false');
  }

  function syncAllRailBtns() {
    for (const entry of panels.values()) syncRailBtn(entry);
  }

  /** @param {string} exceptId */
  function collapseOthersExcept(exceptId) {
    for (const [pid, entry] of panels) {
      if (pid === exceptId) continue;
      if (entry.slot.hidden) continue;
      entry.panelApi?.setCollapsed(true);
      entry.open = false;
    }
  }

  /**
   * @param {string} id
   * @param {{ collapseOthers?: boolean }} [opt]
   * collapseOthers — 레일 클릭 시: 다른 펼친 패널 접고 이 패널만 펼침
   */
  function expandPanel(id, opt = {}) {
    const entry = panels.get(id);
    if (!entry) return;
    entry.slot.hidden = false;
    entry.wasOpened = true;
    if (opt.collapseOthers) collapseOthersExcept(id);
    entry.panelApi?.setCollapsed(false);
    entry.open = true;
    syncAllRailBtns();
  }

  /**
   * Icon-rail section label (e.g. 프로젝트 / 이 씬). Call before the panels in that group.
   * @param {{ id: string, label: string }} opts
   */
  function registerRailGroup({ id, label }) {
    const group = document.createElement('div');
    group.className = 'sb-rail-group';
    group.dataset.railGroup = id;
    group.setAttribute('role', 'separator');
    group.setAttribute('aria-label', label);
    const text = document.createElement('span');
    text.className = 'sb-rail-group-label';
    text.textContent = label;
    group.appendChild(text);
    rail.appendChild(group);
  }

  function registerPanel({
    id,
    icon,
    label,
    panelEl,
    panelApi,
    defaultOpen = false,
    startCollapsed = false,
  }) {
    if (!panelEl) return;

    const slot = document.createElement('div');
    slot.className = 'sb-rail-panel-slot';
    slot.dataset.panelId = id;
    slot.hidden = !defaultOpen;
    slot.appendChild(panelEl);
    dock.appendChild(slot);

    if (distribution === 'resizable') {
      initResizableInSlot(slot, id);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-rail-btn';
    btn.dataset.tip = label;
    btn.setAttribute('aria-label', label);
    btn.dataset.panelId = id;
    btn.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', () => togglePanel(id));
    rail.appendChild(btn);

    const expanded = defaultOpen && !startCollapsed;
    const entry = {
      slot,
      btn,
      open: expanded,
      wasOpened: defaultOpen,
      panelApi,
    };
    panels.set(id, entry);

    if (panelApi) {
      panelApi.setCollapsed(!expanded);

      if (collapseMode) {
        // 패널 헤더 −/+ — 이 패널만 토글, 다른 패널은 건드리지 않음
        panelEl.addEventListener('dock-collapsed', (e) => {
          const collapsed = !!/** @type {CustomEvent} */ (e).detail?.collapsed;
          entry.slot.hidden = false;
          entry.wasOpened = true;
          entry.open = !collapsed;
          syncAllRailBtns();
        });
      }
    }

    syncRailBtn(entry);

    if (distribution === 'equal') requestAnimationFrame(rebalanceHeights);
  }

  function othersExpandedExcept(exceptId) {
    for (const [pid, entry] of panels) {
      if (pid === exceptId) continue;
      if (!entry.wasOpened || entry.slot.hidden) continue;
      const open = entry.panelApi ? !entry.panelApi.isCollapsed() : entry.open;
      if (open) return true;
    }
    return false;
  }

  function togglePanel(id) {
    const entry = panels.get(id);
    if (!entry) return;

    if (collapseMode) {
      if (entry.slot.hidden || !entry.wasOpened) {
        expandPanel(id, { collapseOthers: true });
        return;
      }

      const selfExpanded = entry.panelApi ? !entry.panelApi.isCollapsed() : entry.open;

      // 레일: 이 패널만 펼쳐진 solo 상태에서 다시 클릭 → 이 패널만 접기
      if (selfExpanded && !othersExpandedExcept(id)) {
        entry.panelApi?.setCollapsed(true);
        entry.open = false;
        syncAllRailBtns();
        return;
      }

      // 레일: 나머지 접고 선택 패널만 펼치기 (이미 펼쳐져 있어도 유지)
      expandPanel(id, { collapseOthers: true });
      return;
    }

    entry.open = !entry.open;
    entry.slot.hidden = !entry.open;
    syncRailBtn(entry);
    if (distribution === 'equal') rebalanceHeights();
  }

  function openPanel(id) {
    if (collapseMode) {
      expandPanel(id, { collapseOthers: true });
      return;
    }
    const entry = panels.get(id);
    if (!entry || entry.open) return;
    togglePanel(id);
  }

  const ro = distribution === 'equal' ? new ResizeObserver(() => rebalanceHeights()) : null;
  ro?.observe(dock);

  return { registerPanel, registerRailGroup, togglePanel, openPanel, rebalanceHeights };
}
