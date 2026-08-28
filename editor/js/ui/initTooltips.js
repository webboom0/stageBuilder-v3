const TIP_ATTR = 'data-sb-tip';
const BOUND_FLAG = 'data-sb-tip-bound';

/** @type {HTMLElement | null} */
let floatEl = null;
/** @type {HTMLElement | null} */
let activeEl = null;

function ensureFloat() {
  if (floatEl) return floatEl;
  floatEl = document.createElement('div');
  floatEl.id = 'sb-tooltip-float';
  floatEl.setAttribute('role', 'tooltip');
  floatEl.hidden = true;
  document.body.appendChild(floatEl);
  return floatEl;
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement} tip
 */
function positionFloat(el, tip) {
  const r = el.getBoundingClientRect();
  const margin = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipW = tip.offsetWidth;
  const tipH = tip.offsetHeight;

  let left;
  let top;

  if (el.closest('.sb-left-rail, .sb-right-rail')) {
    left = r.right + margin;
    top = r.top + r.height / 2 - tipH / 2;
  } else if (el.closest('.topMenuBar, .menubar, .menubar-viewport-controls')) {
    left = r.left + r.width / 2 - tipW / 2;
    top = r.bottom + margin;
  } else {
    left = r.left + r.width / 2 - tipW / 2;
    top = r.top - tipH - margin;
    if (top < margin) top = r.bottom + margin;
  }

  left = Math.max(margin, Math.min(left, vw - tipW - margin));
  top = Math.max(margin, Math.min(top, vh - tipH - margin));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** @param {HTMLElement} el */
function showTip(el) {
  const text = el.getAttribute(TIP_ATTR)?.trim();
  if (!text) return;

  const tip = ensureFloat();
  activeEl = el;
  tip.textContent = text;
  tip.hidden = false;
  tip.style.visibility = 'hidden';
  positionFloat(el, tip);
  tip.style.visibility = 'visible';
}

function hideTip() {
  activeEl = null;
  if (floatEl) floatEl.hidden = true;
}

/** @param {HTMLElement} el */
function bindElement(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.hasAttribute(BOUND_FLAG)) return;
  el.setAttribute(BOUND_FLAG, '1');

  el.addEventListener('mouseenter', () => showTip(el));
  el.addEventListener('focus', () => showTip(el));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('blur', hideTip);
}

/** @param {HTMLElement} el */
function promoteTitle(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.hasAttribute(TIP_ATTR)) {
    bindElement(el);
    return;
  }
  const text = el.getAttribute('title')?.trim();
  if (!text) return;
  el.setAttribute(TIP_ATTR, text);
  el.removeAttribute('title');
  bindElement(el);
}

/**
 * Move native title → data-sb-tip and show via fixed overlay (avoids panel overflow clip).
 * @param {ParentNode} root
 */
function bindTooltipsIn(root) {
  if (root instanceof HTMLElement) promoteTitle(root);
  root.querySelectorAll?.(`[title]:not([${TIP_ATTR}]), [${TIP_ATTR}]:not([${BOUND_FLAG}])`).forEach(promoteTitle);
}

function onScrollOrResize() {
  if (activeEl && floatEl && !floatEl.hidden) {
    positionFloat(activeEl, floatEl);
  } else {
    hideTip();
  }
}

/**
 * @param {ParentNode} [root]
 * @returns {() => void} disconnect
 */
export function initTooltips(root = document.body) {
  bindTooltipsIn(root);

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) bindTooltipsIn(n);
        });
      } else if (m.type === 'attributes' && m.attributeName === 'title') {
        const el = m.target;
        if (el instanceof HTMLElement && el.hasAttribute('title')) {
          const text = el.getAttribute('title')?.trim();
          if (text) {
            el.setAttribute(TIP_ATTR, text);
            el.removeAttribute('title');
            bindElement(el);
          }
        }
      }
    }
  });

  obs.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title'],
  });

  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return () => {
    obs.disconnect();
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    hideTip();
    floatEl?.remove();
    floatEl = null;
  };
}
