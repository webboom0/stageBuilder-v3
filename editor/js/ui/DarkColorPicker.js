/**
 * Dark-mode color picker — replaces the native (always-light) type=color popup.
 */

/** @type {HTMLElement | null} */
let openRoot = null;

/**
 * Bind all `input[type=color]` under root to open the dark picker.
 * @param {ParentNode} root
 */
export function bindDarkColorInputs(root) {
  root.querySelectorAll?.('input[type="color"]').forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    if (el.dataset.darkColorBound === '1') return;
    el.dataset.darkColorBound = '1';
    bindDarkColorInput(el);
  });
}

/**
 * @param {HTMLInputElement} input
 */
export function bindDarkColorInput(input) {
  input.classList.add('sb-color-input--dark');
  input.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDarkColorPicker({
      anchor: input,
      color: input.value || '#ffffff',
      onChange: (hex) => {
        input.value = hex;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      onCommit: (hex) => {
        input.value = hex;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
  }, true);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  // Chromium may call showPicker() — redirect to our UI
  try {
    Object.defineProperty(input, 'showPicker', {
      configurable: true,
      value() {
        input.click();
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   anchor: HTMLElement,
 *   color?: string,
 *   onChange?: (hex: string) => void,
 *   onCommit?: (hex: string) => void,
 * }} opts
 */
export function openDarkColorPicker(opts) {
  closeDarkColorPicker();

  const initial = normalizeHex(opts.color || '#ffffff');
  let hsv = hexToHsv(initial);
  let liveHex = initial;

  const root = document.createElement('div');
  root.className = 'sb-dark-color-picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '색상 선택');
  root.innerHTML = `
    <div class="sb-dark-color-picker__sv" data-role="sv">
      <div class="sb-dark-color-picker__sv-white"></div>
      <div class="sb-dark-color-picker__sv-black"></div>
      <div class="sb-dark-color-picker__cursor" data-role="sv-cursor"></div>
    </div>
    <div class="sb-dark-color-picker__row">
      <button type="button" class="sb-dark-color-picker__eye" data-role="eye" title="화면에서 색 추출" aria-label="스포이드">
        <i class="fas fa-eye-dropper" aria-hidden="true"></i>
      </button>
      <div class="sb-dark-color-picker__preview" data-role="preview"></div>
      <div class="sb-dark-color-picker__hue" data-role="hue">
        <div class="sb-dark-color-picker__hue-thumb" data-role="hue-thumb"></div>
      </div>
    </div>
    <div class="sb-dark-color-picker__rgb">
      <label><input type="number" data-role="r" min="0" max="255" step="1" /><span>R</span></label>
      <label><input type="number" data-role="g" min="0" max="255" step="1" /><span>G</span></label>
      <label><input type="number" data-role="b" min="0" max="255" step="1" /><span>B</span></label>
    </div>
  `;

  document.body.appendChild(root);
  openRoot = root;

  const sv = /** @type {HTMLElement} */ (root.querySelector('[data-role="sv"]'));
  const svCursor = /** @type {HTMLElement} */ (root.querySelector('[data-role="sv-cursor"]'));
  const hueEl = /** @type {HTMLElement} */ (root.querySelector('[data-role="hue"]'));
  const hueThumb = /** @type {HTMLElement} */ (root.querySelector('[data-role="hue-thumb"]'));
  const preview = /** @type {HTMLElement} */ (root.querySelector('[data-role="preview"]'));
  const rIn = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="r"]'));
  const gIn = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="g"]'));
  const bIn = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="b"]'));
  const eyeBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-role="eye"]'));

  function paint() {
    const hex = hsvToHex(hsv);
    liveHex = hex;
    const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    sv.style.backgroundColor = hueColor;
    svCursor.style.left = `${hsv.s * 100}%`;
    svCursor.style.top = `${(1 - hsv.v) * 100}%`;
    hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
    preview.style.background = hex;
    const rgb = hexToRgb(hex);
    if (document.activeElement !== rIn) rIn.value = String(rgb.r);
    if (document.activeElement !== gIn) gIn.value = String(rgb.g);
    if (document.activeElement !== bIn) bIn.value = String(rgb.b);
    opts.onChange?.(hex);
  }

  function place() {
    const r = opts.anchor.getBoundingClientRect();
    const w = 240;
    const h = 280;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    root.style.left = `${Math.max(8, left)}px`;
    root.style.top = `${top}px`;
  }

  paint();
  place();

  /** @param {HTMLElement} el @param {(nx: number, ny: number) => void} fn */
  function bindDrag(el, fn) {
    const move = (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      fn(nx, ny);
      paint();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      move(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      move(e.clientX, e.clientY);
    });
  }

  bindDrag(sv, (nx, ny) => {
    hsv = { ...hsv, s: nx, v: 1 - ny };
  });
  bindDrag(hueEl, (nx) => {
    hsv = { ...hsv, h: nx * 360 };
  });

  const onRgbInput = () => {
    const r = clampByte(Number(rIn.value));
    const g = clampByte(Number(gIn.value));
    const b = clampByte(Number(bIn.value));
    hsv = hexToHsv(rgbToHex(r, g, b));
    paint();
  };
  rIn.addEventListener('input', onRgbInput);
  gIn.addEventListener('input', onRgbInput);
  bIn.addEventListener('input', onRgbInput);

  if (!window.EyeDropper) {
    eyeBtn.hidden = true;
  } else {
    eyeBtn.addEventListener('click', async () => {
      try {
        const dropper = new window.EyeDropper();
        const result = await dropper.open();
        hsv = hexToHsv(result.sRGBHex);
        paint();
      } catch {
        /* cancelled */
      }
    });
  }

  const onDoc = (e) => {
    if (!(e.target instanceof Node)) return;
    if (root.contains(e.target) || opts.anchor.contains(e.target)) return;
    opts.onCommit?.(liveHex);
    closeDarkColorPicker();
    document.removeEventListener('mousedown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onCommit?.(liveHex);
      closeDarkColorPicker();
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);

  root.addEventListener('mousedown', (e) => e.stopPropagation());
}

export function closeDarkColorPicker() {
  openRoot?.remove();
  openRoot = null;
}

function clampByte(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function normalizeHex(raw) {
  let s = String(raw || '#ffffff').trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return '#ffffff';
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const to = (n) => clampByte(n).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToHex({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return rgbToHex((rp + m) * 255, (gp + m) * 255, (bp + m) * 255);
}
