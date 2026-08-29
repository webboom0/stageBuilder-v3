import { listProjects } from '../../domain/project/projectApi.js';

/**
 * Modal — pick a saved project to open.
 * @returns {Promise<string | null>} project id or null if cancelled
 */
export function showProjectPickerDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sb-project-hub-overlay sb-project-picker-overlay';

    const panel = document.createElement('div');
    panel.className = 'sb-project-hub sb-project-picker';
    panel.innerHTML = `
      <div class="sb-project-hub__header">
        <h2 class="sb-project-picker__title">프로젝트 열기</h2>
        <p class="sb-project-hub__subtitle">열 프로젝트를 선택하세요</p>
      </div>
      <div class="sb-project-hub__body">
        <ul class="sb-project-list" data-role="list"></ul>
      </div>
      <div class="sb-project-picker__foot">
        <button type="button" class="sb-project-hub__btn" data-act="cancel">취소</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const listEl = panel.querySelector('[data-role="list"]');
    let settled = false;

    function finish(projectId) {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(projectId);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    panel.querySelector('[data-act="cancel"]')?.addEventListener('click', () => finish(null));
    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        finish(null);
      }
    });

    async function renderList() {
      listEl.innerHTML = '<li class="sb-project-empty">불러오는 중…</li>';
      try {
        const projects = await listProjects();
        if (!projects.length) {
          listEl.innerHTML = '<li class="sb-project-empty">저장된 프로젝트가 없습니다.</li>';
          return;
        }
        listEl.innerHTML = projects.map((p) => {
          const date = p.updatedAt ? new Date(p.updatedAt).toLocaleString('ko-KR') : '—';
          return `
            <li class="sb-project-list__item" data-id="${escapeAttr(p.id)}" role="button" tabindex="0">
              <div class="sb-project-list__main">
                <div class="sb-project-list__name">${escapeHtml(p.name)}</div>
                <div class="sb-project-list__meta">씬 ${p.sceneCount || 0}개</div>
              </div>
              <div class="sb-project-list__aside">
                <div class="sb-project-list__meta">${escapeHtml(date)}</div>
              </div>
            </li>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<li class="sb-project-empty">${escapeHtml(err.message || '목록 실패')}</li>`;
      }
    }

    listEl.addEventListener('click', (e) => {
      const row = e.target.closest?.('.sb-project-list__item');
      if (!row?.dataset.id) return;
      finish(row.dataset.id);
    });
    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('.sb-project-list__item');
      if (!row?.dataset.id) return;
      e.preventDefault();
      finish(row.dataset.id);
    });

    renderList();
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
