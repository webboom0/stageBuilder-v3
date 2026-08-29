import { DEFAULT_STAGE_PROFILE } from '../../domain/stage/StageProfile.js';

/**
 * @param {{
 *   mode?: 'create' | 'edit',
 *   initial?: Record<string, string | undefined>,
 *   title?: string,
 *   subtitle?: string,
 *   submitLabel?: string,
 * }} [opts]
 * @returns {Promise<object | null>}
 */
export function showProjectMetaPopup(opts = {}) {
  const mode = opts.mode || 'create';
  const initial = opts.initial || {};
  const title = opts.title || (mode === 'edit' ? '프로젝트 수정' : '새 프로젝트 설정');
  const subtitle = opts.subtitle || (mode === 'edit'
    ? '공연 정보를 수정합니다'
    : '공연 기본 정보를 입력해주세요');
  const submitLabel = opts.submitLabel || (mode === 'edit' ? '저장' : '프로젝트 시작');

  return new Promise((resolve) => {
    document.querySelector('.sb-project-setup-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sb-project-setup-overlay';

    const popup = document.createElement('div');
    popup.className = 'sb-project-setup-popup';
    popup.innerHTML = `
      <h2 class="sb-project-setup__title">${escapeHtml(title)}</h2>
      <p class="sb-project-setup__subtitle">${escapeHtml(subtitle)}</p>
      <form class="sb-project-setup__form" novalidate>
        ${field('공연명', 'showName', 'text', '예: 로미오와 줄리엣', true, initial.showName || initial.name || '')}
        ${field('장르', 'genre', 'text', '예: 뮤지컬, 연극', false, initial.genre || '')}
        <div class="sb-project-field">
          <label class="sb-project-label">공연기간</label>
          <div class="sb-project-period">
            <input class="sb-project-input" type="date" name="startDate" value="${escapeAttr(initial.startDate || '')}" />
            <span class="sb-project-period__sep">~</span>
            <input class="sb-project-input" type="date" name="endDate" value="${escapeAttr(initial.endDate || '')}" />
          </div>
        </div>
        ${field('공연장소/규모', 'venue', 'text', '예: 예술의전당/대극장', false, initial.venue || '')}
        ${field('연출', 'director', 'text', '예: 홍길동', false, initial.director || '')}
        <div class="sb-project-setup__actions">
          <button type="button" class="sb-project-btn sb-project-btn--cancel">취소</button>
          <button type="submit" class="sb-project-btn sb-project-btn--submit">${escapeHtml(submitLabel)}</button>
        </div>
      </form>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const form = /** @type {HTMLFormElement} */ (popup.querySelector('form'));
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    popup.querySelector('.sb-project-btn--cancel')?.addEventListener('click', () => close(null));
    popup.addEventListener('click', (e) => e.stopPropagation());

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const showName = String(fd.get('showName') || '').trim();
      if (!showName) {
        window.alert('공연명을 입력해주세요.');
        return;
      }
      const startDate = String(fd.get('startDate') || '');
      const endDate = String(fd.get('endDate') || '');
      const meta = {
        showName,
        genre: String(fd.get('genre') || '').trim(),
        startDate,
        endDate,
        showPeriod: startDate && endDate ? `${startDate} ~ ${endDate}` : '',
        venue: String(fd.get('venue') || '').trim(),
        director: String(fd.get('director') || '').trim(),
      };
      if (mode === 'create') {
        meta.stageProfile = { ...DEFAULT_STAGE_PROFILE };
      }
      close(meta);
    });
  });
}

function field(label, name, type, placeholder, required = false, value = '') {
  const req = required ? ' required' : '';
  return `
    <div class="sb-project-field">
      <label class="sb-project-label">${label}</label>
      <input class="sb-project-input" type="${type}" name="${name}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}"${req} />
    </div>`;
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
