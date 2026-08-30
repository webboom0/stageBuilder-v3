import { showProjectMetaPopup } from './ProjectMetaPopup.js';



/**

 * Left dock — project summary + scene list.

 *

 * @param {{

 *   getStore: () => import('../../domain/project/ProjectStore.js').ProjectStore | null,

 *   onSwitchScene: (sceneId: string) => void | Promise<void>,

 *   onAddScene: () => void | Promise<void>,

 *   onRenameScene: (sceneId: string, name: string) => void | Promise<void>,

 *   onDuplicateScene?: (sceneId: string) => void | Promise<void>,

 *   onDeleteScene?: (sceneId: string) => void | Promise<void>,
 *   onReorderScene?: (sceneId: string, direction: 'up' | 'down') => void | Promise<void>,
 *   onSave?: () => void | Promise<void>,

 *   onUpdateMeta?: (meta: object) => void | Promise<void>,

 * }} opts

 */

export function createProjectPanelBody(opts) {

  const root = document.createElement('div');

  root.className = 'sb-panel-body sb-project-panel';



  root.innerHTML = `
    <div class="sb-project-panel__main">
      <div class="sb-project-panel__scenes-head">
        <div class="sb-project-panel__scenes-lead">
          <span class="sb-project-panel__scenes-title">씬 (막)</span>
          <span class="sb-project-panel__dirty" data-role="dirty" hidden>저장 안 됨</span>
        </div>
        <div class="sb-project-panel__scenes-ctrls">
          <button type="button" class="sb-dock-btn sb-dock-btn--icon" data-act="save" title="씬 저장">
            <i class="fas fa-save" aria-hidden="true"></i>
          </button>
          <button type="button" class="sb-dock-btn sb-dock-btn--icon" data-act="add-scene" title="씬 추가">+</button>
        </div>
      </div>
      <ul class="sb-project-scene-list" data-role="scenes"></ul>
      <p class="sb-project-panel__hint">클릭 전환 · ↑↓ 순서 · 더블클릭 이름 · 복제/삭제</p>
    </div>
    <div class="sb-project-panel__footer">
      <div class="sb-project-panel__summary" data-role="summary">
        <button type="button" class="sb-project-panel__edit" data-act="edit" title="프로젝트 정보 수정">수정</button>
        <div class="sb-project-panel__name" data-role="name">—</div>
        <div class="sb-project-panel__detail" data-role="detail"></div>
      </div>
    </div>
  `;



  const nameEl = root.querySelector('[data-role="name"]');

  const detailEl = root.querySelector('[data-role="detail"]');

  const dirtyEl = root.querySelector('[data-role="dirty"]');

  const listEl = root.querySelector('[data-role="scenes"]');

  const saveBtn = root.querySelector('[data-act="save"]');

  const editBtn = root.querySelector('[data-act="edit"]');



  function projectInitialMeta(store) {

    const p = store.project;

    return {

      showName: p.showName || p.name || '',

      genre: p.genre || '',

      startDate: p.startDate || '',

      endDate: p.endDate || '',

      venue: p.venue || '',

      director: p.director || '',

    };

  }



  function renderSummary(store) {

    const p = store.project;

    nameEl.textContent = p.showName || p.name || store.projectId;

    const bits = [];

    if (p.venue) bits.push(p.venue);

    if (p.genre) bits.push(p.genre);

    if (p.director) bits.push(`연출 ${p.director}`);

    if (p.showPeriod || (p.startDate && p.endDate)) {

      bits.push(p.showPeriod || `${p.startDate} ~ ${p.endDate}`);

    }

    detailEl.textContent = bits.length ? bits.join(' · ') : '수정에서 정보 입력';

  }



  function render() {

    const store = opts.getStore();

    if (!store) {

      nameEl.textContent = '프로젝트 없음';

      detailEl.textContent = '';

      dirtyEl.hidden = true;

      listEl.innerHTML = '';

      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;

      if (editBtn instanceof HTMLButtonElement) editBtn.disabled = true;

      return;

    }



    renderSummary(store);

    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;

    if (editBtn instanceof HTMLButtonElement) editBtn.disabled = false;

    dirtyEl.hidden = !store.dirty;



    const scenes = [...(store.project.scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const activeId = store.activeSceneId;

    const canDelete = scenes.length > 1;



    if (!scenes.length) {

      listEl.innerHTML = '<li class="sb-project-scene-empty">씬 없음</li>';

      return;

    }



    listEl.innerHTML = scenes.map((s, i) => {

      const active = s.id === activeId;

      return `

        <li class="sb-project-scene-item${active ? ' is-active' : ''}"

          data-id="${escapeAttr(s.id)}" title="클릭: 전환 · 더블클릭: 이름">

          <span class="sb-project-scene-item__order">${i + 1}</span>

          <span class="sb-project-scene-item__name">${escapeHtml(s.name || s.id)}</span>

          ${active ? '<span class="sb-project-scene-item__badge">편집 중</span>' : ''}

          <span class="sb-project-scene-item__actions">

            <button type="button" class="sb-project-scene-act" data-act="up" data-id="${escapeAttr(s.id)}"

              title="위로" ${i === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up" aria-hidden="true"></i></button>

            <button type="button" class="sb-project-scene-act" data-act="down" data-id="${escapeAttr(s.id)}"

              title="아래로" ${i === scenes.length - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down" aria-hidden="true"></i></button>

            <button type="button" class="sb-project-scene-act" data-act="dup" data-id="${escapeAttr(s.id)}"

              title="씬 복제"><i class="fas fa-copy" aria-hidden="true"></i></button>

            <button type="button" class="sb-project-scene-act del" data-act="del" data-id="${escapeAttr(s.id)}"

              title="씬 삭제" ${canDelete ? '' : 'disabled'}><i class="fas fa-trash" aria-hidden="true"></i></button>

          </span>

        </li>`;

    }).join('');

  }



  function setSaving(busy) {

    if (saveBtn instanceof HTMLButtonElement) {

      saveBtn.disabled = busy || !opts.getStore();

      saveBtn.classList.toggle('is-busy', busy);

    }

    if (editBtn instanceof HTMLButtonElement) {

      editBtn.disabled = busy || !opts.getStore();

    }

  }



  saveBtn?.addEventListener('click', () => {

    void opts.onSave?.();

  });



  editBtn?.addEventListener('click', () => {

    const store = opts.getStore();

    if (!store) return;

    void (async () => {

      const meta = await showProjectMetaPopup({

        mode: 'edit',

        initial: projectInitialMeta(store),

      });

      if (!meta) return;

      await opts.onUpdateMeta?.(meta);

      render();

    })();

  });



  listEl.addEventListener('click', (e) => {

    const actBtn = e.target.closest?.('[data-act="dup"], [data-act="del"], [data-act="up"], [data-act="down"]');

    if (actBtn?.dataset.id) {

      e.stopPropagation();

      const id = actBtn.dataset.id;

      if (actBtn.dataset.act === 'up' && !actBtn.disabled) {
        void opts.onReorderScene?.(id, 'up');
        return;
      }

      if (actBtn.dataset.act === 'down' && !actBtn.disabled) {
        void opts.onReorderScene?.(id, 'down');
        return;
      }

      if (actBtn.dataset.act === 'dup') {

        void opts.onDuplicateScene?.(id);

        return;

      }

      if (actBtn.dataset.act === 'del' && !actBtn.disabled) {

        void opts.onDeleteScene?.(id);

      }

      return;

    }

    const row = e.target.closest?.('.sb-project-scene-item');

    if (!row?.dataset.id) return;

    const store = opts.getStore();

    if (!store || row.dataset.id === store.activeSceneId) return;

    void opts.onSwitchScene(row.dataset.id);

  });



  listEl.addEventListener('dblclick', (e) => {

    if (e.target.closest?.('.sb-project-scene-act')) return;

    const row = e.target.closest?.('.sb-project-scene-item');

    if (!row?.dataset.id) return;

    const store = opts.getStore();

    const scene = store?.project.scenes?.find((s) => s.id === row.dataset.id);

    const next = window.prompt('씬 이름', scene?.name || `${row.dataset.id}`);

    if (!next?.trim()) return;

    void opts.onRenameScene(row.dataset.id, next.trim());

  });



  root.querySelector('[data-act="add-scene"]')?.addEventListener('click', () => {

    void opts.onAddScene();

  });



  return { root, render, setSaving };

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


