/**
 * Lightweight menubar DOM helpers (v3 Menubar look, no UIPanel dependency).
 */

/**
 * @param {string} label
 * @returns {{ root: HTMLElement, options: HTMLElement }}
 */
export function createMenu(label) {
  const root = document.createElement('div');
  root.className = 'menu';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = label;
  root.appendChild(title);

  const options = document.createElement('div');
  options.className = 'options';
  root.appendChild(options);

  return { root, options };
}

/**
 * @param {HTMLElement} parent
 * @param {{
 *   label: string,
 *   onClick?: () => void,
 *   disabled?: boolean,
 *   toggle?: boolean,
 *   toggleOn?: boolean,
 *   shortcut?: string,
 *   submenu?: boolean,
 * }} opts
 */
export function addOption(parent, opts) {
  const row = document.createElement('div');
  row.className = 'option';
  if (opts.submenu) row.classList.add('submenu-title');
  if (opts.toggle) row.classList.add('toggle');
  if (opts.toggle && opts.toggleOn) row.classList.add('toggle-on');
  if (opts.disabled) row.classList.add('inactive');

  const label = document.createElement('span');
  label.className = 'option-label';
  label.textContent = opts.label;
  row.appendChild(label);

  if (opts.shortcut) {
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = opts.shortcut;
    row.appendChild(key);
  }

  if (opts.disabled) {
    row.setAttribute('aria-disabled', 'true');
  } else if (opts.onClick) {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onClick?.();
      closeAllMenus();
    });
  }

  parent.appendChild(row);
  return row;
}

/** @param {HTMLElement} parent */
export function addSeparator(parent) {
  const hr = document.createElement('hr');
  parent.appendChild(hr);
  return hr;
}

/**
 * @param {HTMLElement} titleRow
 * @param {HTMLElement} menuRoot
 * @returns {HTMLElement} submenu panel
 */
export function createSubmenu(titleRow, menuRoot) {
  const submenu = document.createElement('div');
  submenu.className = 'options options--submenu';
  submenu.style.display = 'none';
  menuRoot.appendChild(submenu);

  let hideTimer = null;

  const show = () => {
    clearTimeout(hideTimer);
    menuRoot.querySelectorAll('.options--submenu').forEach((el) => {
      if (el !== submenu) el.style.display = 'none';
    });
    menuRoot.classList.add('submenu-active');
    const rect = titleRow.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(titleRow).paddingTop) || 0;
    submenu.style.left = `${rect.right - 4}px`;
    submenu.style.top = `${rect.top - pad}px`;
    submenu.style.maxHeight = `calc(100vh - ${rect.top}px)`;
    submenu.style.display = 'block';
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      submenu.style.display = 'none';
      const anyOpen = Array.from(menuRoot.querySelectorAll('.options--submenu')).some(
        (el) => getComputedStyle(el).display !== 'none',
      );
      if (!anyOpen) menuRoot.classList.remove('submenu-active');
    }, 150);
  };

  titleRow.addEventListener('mouseenter', show);
  titleRow.addEventListener('mouseleave', scheduleHide);
  submenu.addEventListener('mouseenter', show);
  submenu.addEventListener('mouseleave', scheduleHide);

  return submenu;
}

export function closeAllMenus() {
  document.querySelectorAll('#menubar .options--submenu').forEach((el) => {
    el.style.display = 'none';
  });
  document.querySelectorAll('#menubar .menu.submenu-active').forEach((el) => {
    el.classList.remove('submenu-active');
  });
}

/**
 * @param {HTMLElement} row
 * @param {boolean} on
 */
export function setToggleOn(row, on) {
  row.classList.toggle('toggle-on', on);
}
