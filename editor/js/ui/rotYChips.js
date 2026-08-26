/** Y-rotation chips — v3 rotYChips (시계/반시계 + 30° steps) */

const ROT_Y_CCW = [0, 30, 60, 90, 120, 150, 180];
const ROT_Y_CW = [0, -30, -60, -90, -120, -150, -180];

export function normalizeRotYDeg(deg) {
  let n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  // keep sign; clamp to ±180
  while (n > 180) n -= 360;
  while (n < -180) n += 360;
  return Math.round(n * 100) / 100;
}

/**
 * @param {HTMLElement} host
 * @param {number} currentDeg
 * @param {(deg: number) => void} onPick
 */
export function mountRotYChips(host, currentDeg, onPick) {
  if (!host) return;
  const curNorm = normalizeRotYDeg(currentDeg);
  let mode = host.dataset.rotMode || (curNorm < 0 ? 'cw' : 'ccw');
  if (mode !== 'cw' && mode !== 'ccw') mode = 'ccw';
  host.dataset.rotMode = mode;
  host.className = 'sb-roty-wrap';
  host.innerHTML = '';

  const dirRow = document.createElement('div');
  dirRow.className = 'sb-roty-dir';
  ['cw', 'ccw'].forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sb-chip${mode === id ? ' on' : ''}`;
    b.textContent = id === 'cw' ? '시계방향' : '반시계방향';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      host.dataset.rotMode = id;
      mountRotYChips(host, currentDeg, onPick);
    });
    dirRow.appendChild(b);
  });
  host.appendChild(dirRow);

  const chips = document.createElement('div');
  chips.className = 'sb-roty-chips';
  const opts = mode === 'cw' ? ROT_Y_CW : ROT_Y_CCW;
  opts.forEach((deg) => {
    const b = document.createElement('button');
    b.type = 'button';
    const norm = normalizeRotYDeg(deg);
    b.className = `sb-chip${curNorm === norm ? ' on' : ''}`;
    b.textContent = deg === 0 ? '0°' : `${deg}°`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(normalizeRotYDeg(deg));
    });
    chips.appendChild(b);
  });
  host.appendChild(chips);
}
