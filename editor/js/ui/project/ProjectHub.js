import { listProjects, createProject, deleteProject, importProjectBundle } from '../../domain/project/projectApi.js';
import { ProjectStore } from '../../domain/project/ProjectStore.js';
import { showProjectMetaPopup } from './ProjectMetaPopup.js';

/**
 * Project hub — list saved projects or create new (v3 setup fields).
 * @returns {Promise<ProjectStore>}
 */
export function runProjectHub() {
  document.body.classList.add('sb-editor--hub-hidden');

  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'sb-project-hub-overlay';

    const panel = document.createElement('div');
    panel.className = 'sb-project-hub';
    panel.innerHTML = `
      <div class="sb-project-hub__header">
        <h1 class="sb-project-hub__title">StageBuilder</h1>
        <p class="sb-project-hub__subtitle">프로젝트를 선택하거나 새 공연을 만드세요</p>
      </div>
      <div class="sb-project-hub__body">
        <div class="sb-project-hub__actions">
          <button type="button" class="sb-project-hub__btn sb-project-hub__btn--primary" data-act="new">+ 새 프로젝트</button>
          <button type="button" class="sb-project-hub__btn" data-act="import">ZIP 가져오기 (에셋 포함)</button>
          <button type="button" class="sb-project-hub__btn" data-act="refresh">↻ 새로고침</button>
        </div>
        <ul class="sb-project-list" data-role="list"></ul>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const listEl = panel.querySelector('[data-role="list"]');

    function closeHub() {
      overlay.remove();
      document.body.classList.remove('sb-editor--hub-hidden');
    }

    async function openProject(projectId) {
      try {
        const store = await ProjectStore.open(projectId);
        closeHub();
        resolve(store);
      } catch (err) {
        window.alert(`프로젝트를 열지 못했습니다.\n\n${err.message || err}`);
      }
    }

    async function renderList() {
      listEl.innerHTML = '<li class="sb-project-empty">불러오는 중…</li>';
      try {
        const projects = await listProjects();
        if (!projects.length) {
          listEl.innerHTML = '<li class="sb-project-empty">저장된 프로젝트가 없습니다.<br/>「새 프로젝트」로 시작하세요.</li>';
          return;
        }
        listEl.innerHTML = projects.map((p) => {
          const date = p.updatedAt ? new Date(p.updatedAt).toLocaleString('ko-KR') : '—';
          return `
            <li class="sb-project-list__item" data-id="${escapeAttr(p.id)}">
              <div class="sb-project-list__main">
                <div class="sb-project-list__name">${escapeHtml(p.name)}</div>
                <div class="sb-project-list__meta">씬 ${p.sceneCount || 0}개</div>
              </div>
              <div class="sb-project-list__aside">
                <div class="sb-project-list__meta">${escapeHtml(date)}</div>
                <button type="button" class="sb-project-list__del" data-act="delete" data-id="${escapeAttr(p.id)}"
                  title="프로젝트 삭제">🗑</button>
              </div>
            </li>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<li class="sb-project-empty">${escapeHtml(err.message || '목록 실패')}</li>`;
      }
    }

    listEl.addEventListener('click', (e) => {
      const delBtn = e.target.closest?.('[data-act="delete"]');
      if (delBtn?.dataset.id) {
        e.stopPropagation();
        void (async () => {
          const id = delBtn.dataset.id;
          const name = delBtn.closest('.sb-project-list__item')?.querySelector('.sb-project-list__name')?.textContent || id;
          if (!window.confirm(`프로젝트 «${name}»을(를) 삭제할까요?\n\n씬·에셋이 모두 지워지며 되돌릴 수 없습니다.`)) return;
          try {
            delBtn.disabled = true;
            await deleteProject(id);
            await renderList();
          } catch (err) {
            window.alert(`삭제 실패\n\n${err.message || err}`);
            delBtn.disabled = false;
          }
        })();
        return;
      }
      const row = e.target.closest?.('.sb-project-list__item');
      if (!row?.dataset.id) return;
      openProject(row.dataset.id);
    });

    panel.querySelector('[data-act="refresh"]')?.addEventListener('click', () => renderList());

    panel.querySelector('[data-act="import"]')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        void (async () => {
          try {
            listEl.innerHTML = '<li class="sb-project-empty">ZIP 가져오는 중…</li>';
            const data = await importProjectBundle(file);
            await renderList();
            if (data.projectId && window.confirm(`프로젝트 «${data.project?.showName || data.projectId}»을(를) 바로 열까요?`)) {
              await openProject(data.projectId);
            }
          } catch (err) {
            window.alert(`ZIP 가져오기 실패\n\n${err.message || err}`);
            await renderList();
          }
        })();
      });
      input.click();
    });

    panel.querySelector('[data-act="new"]')?.addEventListener('click', () => {
      void (async () => {
        const meta = await showProjectMetaPopup({ mode: 'create' });
        if (!meta) return;
        try {
          const project = await createProject(meta);
          const store = new ProjectStore(project.id, project);
          closeHub();
          resolve(store);
        } catch (err) {
          window.alert(`프로젝트 생성 실패\n\n${err.message || err}`);
        }
      })();
    });

    renderList().catch(reject);
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
