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
 *   dataScope?: 'project' | 'scene',
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

  if (opts.dataScope === 'project' || opts.dataScope === 'scene') {
    const badge = document.createElement('span');
    badge.className = `sb-dock-scope-badge is-${opts.dataScope}`;
    badge.textContent = opts.dataScope === 'project' ? '프로젝트' : '씬';
    badge.title = opts.dataScope === 'project'
      ? '프로젝트 공통 — 씬을 바꿔도 목록이 유지됩니다'
      : '씬 전용 — 씬을 바꾸면 내용이 바뀝니다';
    titleWrap.appendChild(badge);
    panel.dataset.dataScope = opts.dataScope;
  }

  /** @type {HTMLButtonElement | null} */
  let helpBtn = null;
  /** @type {HTMLDivElement | null} */
  let helpPop = null;

  header.appendChild(titleWrap);

  if (opts.titleHelp) {
    helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'sb-dock-panel-help';
    helpBtn.setAttribute('aria-label', '패널 설명');
    helpBtn.setAttribute('aria-expanded', 'false');
    helpBtn.innerHTML = '<i class="fas fa-info-circle" aria-hidden="true"></i>';

    // Fixed overlay on body — not clipped by collapsed panel overflow:hidden
    helpPop = document.createElement('div');
    helpPop.className = 'sb-dock-panel-help-pop';
    helpPop.hidden = true;
    helpPop.innerHTML = opts.titleHelp;

    titleWrap.appendChild(helpBtn);
    document.body.appendChild(helpPop);

    function placeHelpPop() {
      if (!helpPop || !helpBtn || helpPop.hidden) return;
      const br = helpBtn.getBoundingClientRect();
      const margin = 8;
      const maxW = Math.min(320, window.innerWidth - margin * 2);
      helpPop.style.width = `${maxW}px`;
      helpPop.style.maxWidth = `${maxW}px`;
      // Measure after temporary show for height
      const ph = helpPop.offsetHeight || 80;
      let top = br.bottom + 6;
      if (top + ph > window.innerHeight - margin) {
        top = Math.max(margin, br.top - ph - 6);
      }
      let left = br.left;
      if (left + maxW > window.innerWidth - margin) {
        left = window.innerWidth - margin - maxW;
      }
      if (left < margin) left = margin;
      helpPop.style.top = `${top}px`;
      helpPop.style.left = `${left}px`;
    }

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
        placeHelpPop();
      }
    });

    document.addEventListener('click', closeHelpPop);
    window.addEventListener('resize', closeHelpPop);
    window.addEventListener('scroll', closeHelpPop, true);
    helpPop.addEventListener('click', (e) => e.stopPropagation());
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
