import { attachPanelResizeHandle } from './panelResize.js';

/**
 * @param {string} title
 * @param {HTMLElement} contentDom
 * @param {{ storageKey?: string, defaultHeight?: number, minHeight?: number, maxHeight?: number }} [opts]
 */
export function createDockPanel(title, contentDom, opts = {}) {
  const panel = document.createElement('div');
  panel.className = 'floating-panel';

  const header = document.createElement('div');
  header.className = 'panel-header sb-dock-panel-head';

  const titleEl = document.createElement('span');
  titleEl.className = 'sb-dock-section-label sb-dock-panel-head-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

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
  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    contentDom.hidden = collapsed;
    collapseBtn.textContent = collapsed ? '+' : '−';
    panel.classList.toggle('is-collapsed', collapsed);
  });

  attachPanelResizeHandle(panel, {
    storageKey: opts.storageKey,
    defaultHeight: opts.defaultHeight ?? 200,
    minHeight: opts.minHeight,
    maxHeight: opts.maxHeight,
  });

  return panel;
}
