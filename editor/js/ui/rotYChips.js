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
 * @param {{ compact?: boolean }} [opts]
 */
export function mountRotYChips(host, currentDeg, onPick, opts = {}) {
  if (!host) return;
  if (opts.compact) {
    mountRotYChipsCompact(host, currentDeg, onPick);
    return;
  }
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
  const degOpts = mode === 'cw' ? ROT_Y_CW : ROT_Y_CCW;
  degOpts.forEach((deg) => {
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

/** Compact single-row Y rotation chips for modals */
function mountRotYChipsCompact(host, currentDeg, onPick) {
  const curNorm = normalizeRotYDeg(currentDeg);
  let mode = host.dataset.rotMode || (curNorm < 0 ? 'cw' : 'ccw');
  if (mode !== 'cw' && mode !== 'ccw') mode = 'ccw';
  host.dataset.rotMode = mode;
  host.className = 'sb-roty-wrap sb-roty-wrap--compact';
  host.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'sb-roty-compact-row';

  ['cw', 'ccw'].forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sb-chip sb-roty-dir-chip${mode === id ? ' on' : ''}`;
    b.textContent = id === 'cw' ? '↻' : '↺';
    b.title = id === 'cw' ? '시계방향' : '반시계방향';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      host.dataset.rotMode = id;
      mountRotYChipsCompact(host, currentDeg, onPick);
    });
    row.appendChild(b);
  });

  const optsDeg = mode === 'cw' ? ROT_Y_CW : ROT_Y_CCW;
  optsDeg.forEach((deg) => {
    const b = document.createElement('button');
    b.type = 'button';
    const norm = normalizeRotYDeg(deg);
    b.className = `sb-chip sb-roty-deg-chip${curNorm === norm ? ' on' : ''}`;
    b.textContent = deg === 0 ? '0°' : `${deg}°`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(normalizeRotYDeg(deg));
      mountRotYChipsCompact(host, normalizeRotYDeg(deg), onPick);
    });
    row.appendChild(b);
  });

  host.appendChild(row);
}
