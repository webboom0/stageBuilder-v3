/**
 * Show load warnings after scene open (only when issues exist).
 * @param {{ sceneName?: string, warnings: Array<{ kind: string, label: string, detail?: string }> }} report
 */
export function showSceneLoadReportDialog(report) {
  const warnings = report.warnings || [];
  if (!warnings.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'sb-project-hub-overlay sb-scene-load-report-overlay';

  const panel = document.createElement('div');
  panel.className = 'sb-project-hub sb-scene-load-report';
  const title = report.sceneName ? `씬 로드 경고 — ${report.sceneName}` : '씬 로드 경고';

  panel.innerHTML = `
    <div class="sb-project-hub__header">
      <h2 class="sb-project-picker__title">${escapeHtml(title)}</h2>
      <p class="sb-project-hub__subtitle">일부 항목을 복원하지 못했거나 파일이 없습니다. 씬은 열렸습니다.</p>
    </div>
    <div class="sb-project-hub__body sb-scene-load-report__body">
      <ul class="sb-scene-load-report__list" data-role="list"></ul>
    </div>
    <div class="sb-project-picker__foot">
      <button type="button" class="sb-project-hub__btn sb-project-hub__btn--primary" data-act="ok">확인</button>
    </div>
  `;

  const listEl = panel.querySelector('[data-role="list"]');
  listEl.innerHTML = warnings.map((w) => `
    <li class="sb-scene-load-report__item">
      <span class="sb-scene-load-report__kind">${escapeHtml(kindLabel(w.kind))}</span>
      <span class="sb-scene-load-report__label">${escapeHtml(w.label)}</span>
      ${w.detail ? `<span class="sb-scene-load-report__detail">${escapeHtml(w.detail)}</span>` : ''}
    </li>
  `).join('');

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  panel.querySelector('[data-act="ok"]')?.addEventListener('click', close);
  panel.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      close();
    }
  });
}

/** @param {string} kind */
function kindLabel(kind) {
  if (kind === 'motion') return '모션';
  if (kind === 'audio') return '오디오';
  if (kind === 'video') return '비디오';
  if (kind === 'asset') return '에셋';
  return kind;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
