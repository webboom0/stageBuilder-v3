import { attachPanelResizeHandle } from './panelResize.js';

/**
 * @param {string} title
 * @param {HTMLElement} contentDom
 * @param {{
 *   storageKey?: string,
 *   defaultHeight?: number,
 *   minHeight?: number,
 *   maxHeight?: number,
 *   titleHelp?: string,
 * }} [opts]
 */
export function createDockPanel(title, contentDom, opts = {}) {
  const panel = document.createElement('div');
  panel.className = 'floating-panel';

  const header = document.createElement('div');
  header.className = 'panel-header sb-dock-panel-head';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'sb-dock-panel-head-title-wrap';

  const titleEl = document.createElement('span');
  titleEl.className = 'sb-dock-section-label sb-dock-panel-head-title';
  titleEl.textContent = title;
  titleWrap.appendChild(titleEl);

  /** @type {HTMLButtonElement | null} */
  let helpBtn = null;
  /** @type {HTMLDivElement | null} */
  let helpPop = null;

  if (opts.titleHelp) {
    helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'sb-dock-panel-help';
    helpBtn.setAttribute('aria-label', '패널 설명');
    helpBtn.setAttribute('aria-expanded', 'false');
    helpBtn.innerHTML = '<i class="fas fa-info-circle" aria-hidden="true"></i>';

    helpPop = document.createElement('div');
    helpPop.className = 'sb-dock-panel-help-pop';
    helpPop.hidden = true;
    helpPop.innerHTML = opts.titleHelp;

    titleWrap.appendChild(helpBtn);
    header.appendChild(titleWrap);
    header.appendChild(helpPop);

    function closeHelpPop() {
      if (!helpPop || helpPop.hidden) return;
      helpPop.hidden = true;
      helpBtn?.classList.remove('is-on');
      helpBtn?.setAttribute('aria-expanded', 'false');
    }

    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = helpPop.hidden;
      closeHelpPop();
      if (willOpen) {
        helpPop.hidden = false;
        helpBtn.classList.add('is-on');
        helpBtn.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', closeHelpPop);
    helpPop.addEventListener('click', (e) => e.stopPropagation());
  } else {
    header.appendChild(titleEl);
  }

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'button-group';

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.textContent = '−';
  collapseBtn.title = '패널 접기/펼치기';
  buttonGroup.appendChild(collapseBtn);

  header.appendChild(buttonGroup);

  panel.appendChild(header);
  panel.appendChild(contentDom);

  let collapsed = false;

  /** @param {boolean} next */
  function setCollapsed(next) {
    collapsed = !!next;
    contentDom.hidden = collapsed;
    collapseBtn.textContent = collapsed ? '+' : '−';
    panel.classList.toggle('is-collapsed', collapsed);
    if (helpPop) helpPop.hidden = true;
    helpBtn?.classList.remove('is-on');
    helpBtn?.setAttribute('aria-expanded', 'false');
    panel.dispatchEvent(new CustomEvent('dock-collapsed', {
      bubbles: true,
      detail: { collapsed },
    }));
  }

  collapseBtn.addEventListener('click', () => setCollapsed(!collapsed));

  attachPanelResizeHandle(panel, {
    storageKey: opts.storageKey,
    defaultHeight: opts.defaultHeight ?? 200,
    minHeight: opts.minHeight,
    maxHeight: opts.maxHeight,
  });

  return {
    el: panel,
    setCollapsed,
    isCollapsed: () => collapsed,
    toggleCollapsed: () => setCollapsed(!collapsed),
  };
}
