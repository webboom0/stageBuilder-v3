import {
  listProjects,
  fetchProject,
  saveProjectMeta,
  deleteProject,
} from '../../domain/project/projectApi.js';
import { showProjectMetaPopup } from './ProjectMetaPopup.js';

/**
 * Modal — project list with edit / delete (파일 → 프로젝트 편집).
 * @param {{
 *   activeProjectId?: string | null,
 *   onEdited?: (projectId: string, project: object) => void | Promise<void>,
 *   onDeleted?: (projectId: string) => void | Promise<void>,
 * }} [opts]
 * @returns {Promise<void>}
 */
export function showProjectManagerDialog(opts = {}) {
  const { activeProjectId = null, onEdited, onDeleted } = opts;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sb-project-hub-overlay sb-project-manager-overlay';

    const panel = document.createElement('div');
    panel.className = 'sb-project-hub sb-project-manager';
    panel.innerHTML = `
      <div class="sb-project-hub__header">
        <h2 class="sb-project-picker__title">프로젝트 편집</h2>
        <p class="sb-project-hub__subtitle">목록에서 수정·삭제할 프로젝트를 고르세요</p>
      </div>
      <div class="sb-project-hub__body">
        <div class="sb-project-hub__actions">
          <button type="button" class="sb-project-hub__btn" data-act="refresh">↻ 새로고침</button>
        </div>
        <ul class="sb-project-list sb-project-list--manage" data-role="list"></ul>
      </div>
      <div class="sb-project-picker__foot">
        <button type="button" class="sb-project-hub__btn" data-act="close">닫기</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const listEl = panel.querySelector('[data-role="list"]');
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve();
    }

    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('[data-act="close"]')?.addEventListener('click', () => close());
    panel.querySelector('[data-act="refresh"]')?.addEventListener('click', () => renderList());

    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        close();
      }
    });

    async function editProject(projectId) {
      try {
        const project = await fetchProject(projectId);
        const meta = await showProjectMetaPopup({
          mode: 'edit',
          initial: {
            showName: project.showName || project.name || '',
            genre: project.genre || '',
            startDate: project.startDate || '',
            endDate: project.endDate || '',
            venue: project.venue || '',
            director: project.director || '',
            stageProfile: project.stageProfile || null,
          },
        });
        if (!meta) return;

        const next = { ...project };
        const showName = String(meta.showName || '').trim();
        if (!showName) {
          window.alert('공연명을 입력해주세요.');
          return;
        }
        next.showName = showName;
        next.name = showName;
        next.genre = String(meta.genre ?? '').trim();
        next.venue = String(meta.venue ?? '').trim();
        next.director = String(meta.director ?? '').trim();
        next.startDate = String(meta.startDate ?? '').trim();
        next.endDate = String(meta.endDate ?? '').trim();
        if (meta.stageProfile) next.stageProfile = { ...meta.stageProfile };
        next.showPeriod = next.startDate && next.endDate
          ? `${next.startDate} ~ ${next.endDate}`
          : (next.showPeriod || '');
        next.updatedAt = new Date().toISOString();

        const saved = await saveProjectMeta(projectId, next);
        await onEdited?.(projectId, saved);
        await renderList();
      } catch (err) {
        window.alert(`프로젝트 수정 실패\n\n${err.message || err}`);
      }
    }

    async function removeProject(projectId, displayName) {
      const label = displayName || projectId;
      if (projectId === activeProjectId) {
        if (!window.confirm(
          `현재 편집 중인 프로젝트 «${label}»을(를) 삭제할까요?\n\n씬·에셋이 모두 지워지며 되돌릴 수 없습니다.`,
        )) return;
      } else if (!window.confirm(
        `프로젝트 «${label}»을(를) 삭제할까요?\n\n씬·에셋이 모두 지워지며 되돌릴 수 없습니다.`,
      )) return;

      try {
        await deleteProject(projectId);
        await onDeleted?.(projectId);
        await renderList();
      } catch (err) {
        window.alert(`삭제 실패\n\n${err.message || err}`);
      }
    }

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
          const isActive = p.id === activeProjectId;
          const activeBadge = isActive ? '<span class="sb-project-list__badge">편집 중</span>' : '';
          return `
            <li class="sb-project-list__item sb-project-list__item--manage${isActive ? ' is-active' : ''}" data-id="${escapeAttr(p.id)}" data-name="${escapeAttr(p.name)}">
              <div class="sb-project-list__main">
                <div class="sb-project-list__name">${escapeHtml(p.name)}${activeBadge}</div>
                <div class="sb-project-list__meta">씬 ${p.sceneCount || 0}개 · ${escapeHtml(date)}</div>
              </div>
              <div class="sb-project-list__actions">
                <button type="button" class="sb-project-list__edit" data-act="edit" data-id="${escapeAttr(p.id)}">수정</button>
                <button type="button" class="sb-project-list__del" data-act="delete" data-id="${escapeAttr(p.id)}">삭제</button>
              </div>
            </li>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<li class="sb-project-empty">${escapeHtml(err.message || '목록 실패')}</li>`;
      }
    }

    listEl.addEventListener('click', (e) => {
      const editBtn = e.target.closest?.('[data-act="edit"]');
      if (editBtn?.dataset.id) {
        e.stopPropagation();
        void editProject(editBtn.dataset.id);
        return;
      }
      const delBtn = e.target.closest?.('[data-act="delete"]');
      if (delBtn?.dataset.id) {
        e.stopPropagation();
        const name = delBtn.closest('.sb-project-list__item')?.dataset.name;
        void removeProject(delBtn.dataset.id, name);
      }
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
