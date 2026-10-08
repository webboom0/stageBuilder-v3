import {
  DEFAULT_STAGE_PROFILE,
  SHOW_GENRES,
  formatProjectVenueLabel,
  getProjectScalesForVenue,
  getProjectVenueNames,
  getStageProfileForVenueScale,
  resolveProjectVenueInitial,
} from '../../domain/stage/StageProfile.js';
import { appAlert } from '../AppDialog.js';

const CAL_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm12 8H5v10h14V10zm-2-5H7v1a1 1 0 0 1-2 0V5H5v3h14V5h-1v1a1 1 0 1 1-2 0V5z"/>
</svg>`;

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
    : '프로젝트 기본 정보를 입력해 주세요');
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
      <div class="sb-project-setup__header">
        <h2 class="sb-project-setup__title">${escapeHtml(title)}</h2>
        <p class="sb-project-setup__subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <form class="sb-project-setup__form" novalidate>
        ${field('공연명', 'showName', 'text', '예 : 로미오와 줄리엣', true, initial.showName || initial.name || '')}
        ${genreSelect(initial.genre || '')}
        <div class="sb-project-field">
          <label class="sb-project-label">공연기간</label>
          <div class="sb-project-period">
            ${dateField('startDate', initial.startDate || '')}
            <span class="sb-project-period__sep">-</span>
            ${dateField('endDate', initial.endDate || '')}
          </div>
        </div>
        ${venueSelect(venueInit.venue)}
        ${scaleSelect(venueInit.venue, venueInit.scale)}
        ${field('연출', 'director', 'text', '예 : 홍길동', false, initial.director || '')}
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

    wireDateFields(popup);

    venueSelectEl?.addEventListener('change', () => {
      const scales = getProjectScalesForVenue(venueSelectEl.value);
      const prev = scaleSelectEl.value;
      scaleSelectEl.innerHTML = renderScaleOptions(venueSelectEl.value, scales.some((s) => s.scale === prev) ? prev : scales[0]?.scale);
    });

    const close = (result) => {
      closeOpenCalendar();
      overlay.remove();
      resolve(result);
    };

    popup.querySelector('.sb-project-btn--cancel')?.addEventListener('click', () => close(null));
    popup.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const showName = String(fd.get('showName') || '').trim();
      if (!showName) {
        await appAlert({ title: '입력 필요', message: '공연명을 입력해주세요.' });
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

/** @type {HTMLElement | null} */
let openCal = null;

function closeOpenCalendar() {
  openCal?.remove();
  openCal = null;
}

/** @param {string} name @param {string} value */
function dateField(name, value) {
  const display = value || '';
  return `
    <div class="sb-project-date" data-date-field="${escapeAttr(name)}">
      <input type="hidden" name="${escapeAttr(name)}" value="${escapeAttr(value)}" data-role="date-value" />
      <button type="button" class="sb-project-date__display" data-role="date-open" aria-label="날짜 선택">
        <span class="sb-project-date__text${display ? '' : ' is-empty'}" data-role="date-text">${display ? escapeHtml(display) : 'YYYY-MM-DD'}</span>
        <span class="sb-project-date__icon">${CAL_ICON}</span>
      </button>
    </div>`;
}

/** @param {HTMLElement} root */
function wireDateFields(root) {
  root.querySelectorAll('[data-date-field]').forEach((wrap) => {
    const openBtn = /** @type {HTMLElement | null} */ (wrap.querySelector('[data-role="date-open"]'));
    const hidden = /** @type {HTMLInputElement | null} */ (wrap.querySelector('[data-role="date-value"]'));
    const textEl = wrap.querySelector('[data-role="date-text"]');
    openBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = hidden?.value || '';
      openCalendar(openBtn, current, (iso) => {
        if (hidden) hidden.value = iso;
        if (textEl) {
          textEl.textContent = iso;
          textEl.classList.remove('is-empty');
        }
      });
    });
  });
}

/**
 * @param {HTMLElement} anchor
 * @param {string} valueIso
 * @param {(iso: string) => void} onPick
 */
function openCalendar(anchor, valueIso, onPick) {
  closeOpenCalendar();

  const selected = parseIso(valueIso) || new Date();
  let viewYear = selected.getFullYear();
  let viewMonth = selected.getMonth();
  let selectedIso = valueIso && /^\d{4}-\d{2}-\d{2}$/.test(valueIso) ? valueIso : '';

  const cal = document.createElement('div');
  cal.className = 'sb-project-cal';
  cal.setAttribute('role', 'dialog');
  cal.setAttribute('aria-label', '날짜 선택');

  const render = () => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    const title = `${viewYear}. ${String(viewMonth + 1).padStart(2, '0')}. ${selectedIso ? selectedIso.slice(8, 10) : String(Math.min(selected.getDate(), daysInMonth)).padStart(2, '0')}`;

    /** @type {string[]} */
    const cells = [];
    for (let i = 0; i < startPad; i += 1) {
      const d = prevDays - startPad + i + 1;
      cells.push(`<button type="button" class="sb-project-cal__day is-out" disabled>${d}</button>`);
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const on = iso === selectedIso ? ' is-selected' : '';
      cells.push(`<button type="button" class="sb-project-cal__day${on}" data-iso="${iso}">${d}</button>`);
    }
    while (cells.length % 7 !== 0) {
      const nextD = cells.length - (startPad + daysInMonth) + 1;
      cells.push(`<button type="button" class="sb-project-cal__day is-out" disabled>${nextD}</button>`);
    }

    cal.innerHTML = `
      <div class="sb-project-cal__head">
        <button type="button" class="sb-project-cal__nav" data-act="prev" aria-label="이전 달">‹</button>
        <div class="sb-project-cal__title">${escapeHtml(title)}</div>
        <button type="button" class="sb-project-cal__nav" data-act="next" aria-label="다음 달">›</button>
      </div>
      <div class="sb-project-cal__dow">
        <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
      </div>
      <div class="sb-project-cal__grid">${cells.join('')}</div>
    `;

    cal.querySelector('[data-act="prev"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      render();
    });
    cal.querySelector('[data-act="next"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      render();
    });
    cal.querySelectorAll('[data-iso]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const iso = btn.getAttribute('data-iso') || '';
        if (!iso) return;
        selectedIso = iso;
        onPick(iso);
        closeOpenCalendar();
      });
    });
  };

  render();
  document.body.appendChild(cal);
  openCal = cal;

  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const w = 260;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  if (top + 300 > window.innerHeight - pad) top = Math.max(pad, rect.top - 306);
  cal.style.left = `${Math.max(pad, left)}px`;
  cal.style.top = `${top}px`;

  const onDoc = (e) => {
    if (!(e.target instanceof Node)) return;
    if (cal.contains(e.target) || anchor.contains(e.target)) return;
    closeOpenCalendar();
    document.removeEventListener('mousedown', onDoc, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);
}

/** @param {string} iso */
function parseIso(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
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
  return `
    <div class="sb-project-field">
      <label class="sb-project-label">규모</label>
      <div class="sb-project-select-wrap">
        <select class="sb-project-select" name="venueScale">
          ${renderScaleOptions(venue, selectedScale)}
        </select>
      </div>
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
      <div class="sb-project-select-wrap">
        <select class="sb-project-select" name="${escapeAttr(name)}">${opts}</select>
      </div>
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
