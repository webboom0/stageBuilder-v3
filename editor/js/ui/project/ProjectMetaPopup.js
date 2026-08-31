import {
  DEFAULT_STAGE_PROFILE,
  SHOW_GENRES,
  formatProjectVenueLabel,
  getProjectScalesForVenue,
  getProjectVenueNames,
  getStageProfileForVenueScale,
  resolveProjectVenueInitial,
} from '../../domain/stage/StageProfile.js';

/**
 * @param {{
 *   mode?: 'create' | 'edit',
 *   initial?: Record<string, string | undefined> & { stageProfile?: { id?: string } | null },
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

  const venueInit = resolveProjectVenueInitial({
    stageProfile: initial.stageProfile,
    venue: initial.venue || '',
  });

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
        ${genreSelect(initial.genre || '')}
        <div class="sb-project-field">
          <label class="sb-project-label">공연기간</label>
          <div class="sb-project-period">
            <input class="sb-project-input sb-project-input--date" type="date" name="startDate" value="${escapeAttr(initial.startDate || '')}" />
            <span class="sb-project-period__sep">~</span>
            <input class="sb-project-input sb-project-input--date" type="date" name="endDate" value="${escapeAttr(initial.endDate || '')}" />
          </div>
        </div>
        ${venueSelect(venueInit.venue)}
        ${scaleSelect(venueInit.venue, venueInit.scale)}
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
    const venueSelectEl = /** @type {HTMLSelectElement} */ (popup.querySelector('[name="venueName"]'));
    const scaleSelectEl = /** @type {HTMLSelectElement} */ (popup.querySelector('[name="venueScale"]'));

    venueSelectEl?.addEventListener('change', () => {
      const scales = getProjectScalesForVenue(venueSelectEl.value);
      const prev = scaleSelectEl.value;
      scaleSelectEl.innerHTML = renderScaleOptions(venueSelectEl.value, scales.some((s) => s.scale === prev) ? prev : scales[0]?.scale);
    });

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
      const venueName = String(fd.get('venueName') || '');
      const venueScale = String(fd.get('venueScale') || '');
      const meta = {
        showName,
        genre: String(fd.get('genre') || '').trim(),
        startDate,
        endDate,
        showPeriod: startDate && endDate ? `${startDate} ~ ${endDate}` : '',
        venue: formatProjectVenueLabel(venueName, venueScale),
        director: String(fd.get('director') || '').trim(),
        stageProfile: getStageProfileForVenueScale(venueName, venueScale),
      };
      if (mode === 'create' && !meta.stageProfile) {
        meta.stageProfile = { ...DEFAULT_STAGE_PROFILE };
      }
      close(meta);
    });
  });
}

function genreSelect(selected) {
  const options = [
    { value: '', label: '선택하세요' },
    ...SHOW_GENRES.map((g) => ({ value: g, label: g })),
  ];
  return selectField('장르', 'genre', options, selected || '');
}

function venueSelect(selectedVenue) {
  const options = getProjectVenueNames().map((v) => ({ value: v, label: v }));
  return selectField('공연장소', 'venueName', options, selectedVenue);
}

function scaleSelect(venue, selectedScale) {
  const options = getProjectScalesForVenue(venue).map((g) => ({
    value: g.scale,
    label: g.scale,
  }));
  return `
    <div class="sb-project-field">
      <label class="sb-project-label">규모</label>
      <select class="sb-project-select" name="venueScale">
        ${renderScaleOptions(venue, selectedScale)}
      </select>
    </div>`;
}

/** @param {string} venue @param {string} [selectedScale] */
function renderScaleOptions(venue, selectedScale) {
  return getProjectScalesForVenue(venue).map((g) => {
    const sel = g.scale === selectedScale ? ' selected' : '';
    return `<option value="${escapeAttr(g.scale)}"${sel}>${escapeHtml(g.scale)}</option>`;
  }).join('');
}

function field(label, name, type, placeholder, required = false, value = '') {
  const req = required ? ' required' : '';
  return `
    <div class="sb-project-field">
      <label class="sb-project-label">${label}</label>
      <input class="sb-project-input" type="${type}" name="${name}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}"${req} />
    </div>`;
}

/** @param {string} label @param {string} name @param {{ value: string, label: string }[]} options @param {string} selected */
function selectField(label, name, options, selected) {
  const opts = options.map((o) => {
    const sel = o.value === selected ? ' selected' : '';
    return `<option value="${escapeAttr(o.value)}"${sel}>${escapeHtml(o.label)}</option>`;
  }).join('');
  return `
    <div class="sb-project-field">
      <label class="sb-project-label">${label}</label>
      <select class="sb-project-select" name="${escapeAttr(name)}">${opts}</select>
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
