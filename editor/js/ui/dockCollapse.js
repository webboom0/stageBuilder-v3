/**
 * Left/right dock column collapse (mid-edge chevron tabs).
 * Tabs are overlaid on the editor grid so they stay visible when columns collapse.
 *
 * @param {HTMLElement} root `.wrapper` or element containing `.sb-editor-grid`
 * @returns {{ setLeftCollapsed: (on: boolean) => void, setRightCollapsed: (on: boolean) => void }}
 */
export function mountDockCollapse(root) {
  const grid = /** @type {HTMLElement | null} */ (root.querySelector('.sb-editor-grid'));
  const left = root.querySelector('.sb-left');
  const right = root.querySelector('.sb-right');
  if (!grid || !left || !right) {
    return {
      setLeftCollapsed: () => {},
      setRightCollapsed: () => {},
    };
  }

  if (getComputedStyle(grid).position === 'static') {
    grid.style.position = 'relative';
  }

  const leftBtn = ensureToggle(grid, 'left');
  const rightBtn = ensureToggle(grid, 'right');

  let leftCollapsed = readStored('sb-dock-left-collapsed');
  let rightCollapsed = readStored('sb-dock-right-collapsed');

  function apply() {
    grid.classList.toggle('is-left-collapsed', leftCollapsed);
    grid.classList.toggle('is-right-collapsed', rightCollapsed);
    left.classList.toggle('is-collapsed', leftCollapsed);
    right.classList.toggle('is-collapsed', rightCollapsed);
    syncToggle(leftBtn, 'left', leftCollapsed);
    syncToggle(rightBtn, 'right', rightCollapsed);
    try {
      localStorage.setItem('sb-dock-left-collapsed', leftCollapsed ? '1' : '0');
      localStorage.setItem('sb-dock-right-collapsed', rightCollapsed ? '1' : '0');
    } catch { /* ignore */ }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  leftBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    leftCollapsed = !leftCollapsed;
    apply();
  });
  rightBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    rightCollapsed = !rightCollapsed;
    apply();
  });

  apply();

  return {
    setLeftCollapsed(on) {
      leftCollapsed = !!on;
      apply();
    },
    setRightCollapsed(on) {
      rightCollapsed = !!on;
      apply();
    },
  };
}

/**
 * @param {HTMLElement} grid
 * @param {'left' | 'right'} side
 */
function ensureToggle(grid, side) {
  const existing = /** @type {HTMLButtonElement | null} */ (
    grid.querySelector(`.sb-dock-fold[data-dock="${side}"]`)
  );
  if (existing) return existing;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `sb-dock-fold sb-dock-fold--${side}`;
  btn.dataset.dock = side;
  btn.innerHTML = '<i class="fas" aria-hidden="true"></i>';
  grid.appendChild(btn);
  return btn;
}

/**
 * @param {HTMLButtonElement} btn
 * @param {'left' | 'right'} side
 * @param {boolean} collapsed
 */
function syncToggle(btn, side, collapsed) {
  const icon = btn.querySelector('i');
  if (side === 'left') {
    icon?.classList.toggle('fa-chevron-left', !collapsed);
    icon?.classList.toggle('fa-chevron-right', collapsed);
    const label = collapsed ? '왼쪽 패널 펼치기' : '왼쪽 패널 접기';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  } else {
    // Mock: expanded right panel shows ‹ (fold away). Collapsed shows ›.
    icon?.classList.toggle('fa-chevron-left', !collapsed);
    icon?.classList.toggle('fa-chevron-right', collapsed);
    const label = collapsed ? '오른쪽 패널 펼치기' : '오른쪽 패널 접기';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

/** @param {string} key */
function readStored(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
