import { STAGE_TYPES, normalizeStageType } from '../domain/stage/StageTypes.js';
import { STAGE_PROFILE_PRESETS } from '../domain/stage/StageProfile.js';
import { getProfileLimits } from '../domain/stage/stageFloorLayout.js';
import { checkStageSizeInput, buildStageSizeHelpHtml } from './stageSizeHelp.js';
import { buildStageTypeButtonHtml } from './stageTypeThumbnails.js';

/**
 * @param {import('../domain/stage/StageProfile.js').GRAND_HALL_DEFAULT} profile
 */
function resolveProfileLabel(profile) {
  if (profile?.name) return profile.name;
  const match = STAGE_PROFILE_PRESETS.find(
    (p) => p.widthM === profile.widthM && p.depthM === profile.depthM,
  );
  if (match) return match.name;
  return `직접 입력 (${profile.widthM}×${profile.depthM}m)`;
}

/**
 * @param {import('../domain/stage/StageProfile.js').GRAND_HALL_DEFAULT} profile
 * @param {typeof STAGE_PROFILE_PRESETS[number]} preset
 */
function isPresetActive(profile, preset) {
  if (profile?.id && preset.id) return profile.id === preset.id;
  return profile.widthM === preset.widthM && profile.depthM === preset.depthM;
}

/**
 * @param {{
 *   stageManager: import('../domain/stage/StageManager.js').StageManager,
 *   onStageTypeChange: (type: import('../domain/stage/StageTypes.js').StageTypeId) => Promise<void>,
 *   onApplyProfile: (widthM: number, depthM: number, extras?: Record<string, unknown>) => void | Promise<void>,
 *   onChange?: () => void,
 * }} ctx
 */
export function createStagePanelBody(ctx) {
  const root = document.createElement('div');
  root.className = 'sb-stage-panel sb-panel-body';
  root.innerHTML = `
    <div class="sb-stage-type-grid" role="group" aria-label="무대 타입">
      <button type="button" class="sb-stage-type-btn" data-stage-type="proscenium" title="${STAGE_TYPES.proscenium.description}">${buildStageTypeButtonHtml('proscenium', STAGE_TYPES.proscenium.label)}</button>
      <button type="button" class="sb-stage-type-btn" data-stage-type="arena" title="${STAGE_TYPES.arena.description}">${buildStageTypeButtonHtml('arena', STAGE_TYPES.arena.label)}</button>
    </div>
    <div class="sb-stage-profile-row">
      <span class="sb-stage-profile-name" data-role="profile-name" title="">—</span>
      <button type="button" class="sb-stage-profile-change" data-act="change-profile">변경</button>
    </div>
  `;

  const typeBtns = root.querySelectorAll('[data-stage-type]');
  const profileNameEl = root.querySelector('[data-role="profile-name"]');
  const changeBtn = root.querySelector('[data-act="change-profile"]');

  const pickerOverlay = document.createElement('div');
  pickerOverlay.className = 'sb-stage-picker-overlay';
  pickerOverlay.hidden = true;
  pickerOverlay.innerHTML = `
    <div class="sb-stage-picker-dlg" role="dialog" aria-modal="true" aria-label="무대 규격">
      <div class="sb-stage-picker-view" data-view="list">
        <div class="sb-stage-picker-head">
          <strong>무대 규격 선택</strong>
          <button type="button" class="sb-tl-help-close" data-act="close-picker" aria-label="닫기">×</button>
        </div>
        <div class="sb-stage-picker-list" data-role="preset-list"></div>
        <div class="sb-stage-picker-foot">
          <button type="button" class="sb-tl-btn" data-act="custom-profile">직접 입력</button>
        </div>
      </div>
      <div class="sb-stage-picker-view" data-view="custom" hidden>
        <div class="sb-stage-picker-head">
          <strong>직접 입력</strong>
          <button type="button" class="sb-tl-help-close" data-act="close-picker" aria-label="닫기">×</button>
        </div>
        <div class="sb-stage-custom-form">
          <p class="sb-stage-hint" id="sb-stage-limits-hint"></p>
          <div class="sb-stage-custom-help" data-role="custom-help" aria-label="규격 제한 설명"></div>
          <div class="ec-row">
            <label for="sb-width">W (m)</label>
            <input id="sb-width" class="ec-val" type="number" step="0.5" />
          </div>
          <div class="ec-row">
            <label for="sb-depth">D (m)</label>
            <input id="sb-depth" class="ec-val" type="number" step="0.5" />
          </div>
          <div id="sb-stage-warning" class="sb-stage-warning" hidden></div>
          <div class="ec-row-actions">
            <button type="button" id="sb-apply-profile" class="sb-dock-btn sb-dock-btn--wide">저장</button>
            <button type="button" id="sb-size-help" class="sb-dock-btn sb-dock-btn--icon" title="무대 크기 한도 설명"><i class="fas fa-question-circle" aria-hidden="true"></i></button>
          </div>
          <div class="sb-stage-picker-foot">
            <button type="button" class="sb-tl-btn" data-act="back-list">목록으로</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(pickerOverlay);

  const listView = pickerOverlay.querySelector('[data-view="list"]');
  const customView = pickerOverlay.querySelector('[data-view="custom"]');
  const presetListEl = pickerOverlay.querySelector('[data-role="preset-list"]');
  const widthEl = /** @type {HTMLInputElement} */ (pickerOverlay.querySelector('#sb-width'));
  const depthEl = /** @type {HTMLInputElement} */ (pickerOverlay.querySelector('#sb-depth'));
  const applyBtn = pickerOverlay.querySelector('#sb-apply-profile');
  const helpBtn = pickerOverlay.querySelector('#sb-size-help');
  const warningEl = pickerOverlay.querySelector('#sb-stage-warning');
  const hintEl = pickerOverlay.querySelector('#sb-stage-limits-hint');
  const customHelpEl = pickerOverlay.querySelector('[data-role="custom-help"]');
  const pickerDlg = pickerOverlay.querySelector('.sb-stage-picker-dlg');

  const modal = document.createElement('div');
  modal.className = 'sb-modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="sb-modal" role="dialog" aria-labelledby="sb-size-help-title">
      <div class="sb-modal-head">
        <span id="sb-size-help-title">무대 크기 한도</span>
        <button type="button" id="sb-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="sb-modal-body" id="sb-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalBody = modal.querySelector('#sb-modal-body');
  modal.querySelector('#sb-modal-close').addEventListener('click', () => {
    modal.hidden = true;
    modal.classList.remove('sb-modal-backdrop--above-picker');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.hidden = true;
      modal.classList.remove('sb-modal-backdrop--above-picker');
    }
  });

  function updateLimitsHint() {
    const limits = getProfileLimits(ctx.stageManager.stageType);
    hintEl.textContent = `한도: W ${limits.minWidthM}–${limits.maxWidthM}m · D ${limits.minDepthM}–${limits.maxDepthM}m (건물+바닥 연동)`;
    widthEl.min = String(limits.minWidthM);
    widthEl.max = String(limits.maxWidthM);
    depthEl.min = String(limits.minDepthM);
    depthEl.max = String(limits.maxDepthM);
  }

  function validateInputs() {
    const widthM = Number(widthEl.value);
    const depthM = Number(depthEl.value);
    const check = checkStageSizeInput(widthM, depthM, ctx.stageManager.stageType);

    widthEl.classList.toggle('ec-invalid', check.overWidth || check.underWidth);
    depthEl.classList.toggle('ec-invalid', check.overDepth || check.underDepth);

    if (check.isOutOfRange && Number.isFinite(widthM) && Number.isFinite(depthM)) {
      warningEl.hidden = false;
      warningEl.textContent = check.message;
    } else {
      warningEl.hidden = true;
      warningEl.textContent = '';
    }
    return check;
  }

  function syncTypeButtons() {
    const { stageType } = ctx.stageManager;
    typeBtns.forEach((btn) => {
      const id = normalizeStageType(btn.dataset.stageType);
      btn.classList.toggle('is-on', id === stageType);
      btn.setAttribute('aria-pressed', id === stageType ? 'true' : 'false');
    });
  }

  function syncProfileName() {
    const { profile } = ctx.stageManager;
    const label = resolveProfileLabel(profile);
    profileNameEl.textContent = label;
    profileNameEl.title = `${label} · ${profile.widthM}×${profile.depthM}m`;
  }

  function renderPresetList() {
    const { profile } = ctx.stageManager;
    presetListEl.innerHTML = STAGE_PROFILE_PRESETS.map((preset) => {
      const sel = isPresetActive(profile, preset) ? ' is-selected' : '';
      return `
        <button type="button" class="sb-stage-picker-item${sel}" data-preset-id="${preset.id}">
          <span class="sb-stage-picker-item-name">${preset.name}</span>
          <span class="sb-stage-picker-item-size">${preset.widthM}×${preset.depthM}m</span>
        </button>`;
    }).join('');
  }

  function showPickerView(view) {
    const isList = view === 'list';
    listView.hidden = !isList;
    customView.hidden = isList;
    pickerDlg?.classList.toggle('is-custom-view', !isList);
    if (isList) {
      renderPresetList();
    } else {
      const { profile } = ctx.stageManager;
      widthEl.value = String(profile.widthM);
      depthEl.value = String(profile.depthM);
      updateLimitsHint();
      if (customHelpEl) {
        customHelpEl.innerHTML = buildStageSizeHelpHtml(ctx.stageManager.stageType);
      }
      validateInputs();
    }
  }

  function openPickerList() {
    showPickerView('list');
    pickerOverlay.hidden = false;
  }

  function openPickerCustom() {
    showPickerView('custom');
    pickerOverlay.hidden = false;
  }

  function closePicker() {
    pickerOverlay.hidden = true;
  }

  function syncFromManager() {
    syncTypeButtons();
    syncProfileName();
    if (!pickerOverlay.hidden && customView.hidden === false) {
      updateLimitsHint();
      if (customHelpEl) {
        customHelpEl.innerHTML = buildStageSizeHelpHtml(ctx.stageManager.stageType);
      }
      const { profile } = ctx.stageManager;
      widthEl.value = String(profile.widthM);
      depthEl.value = String(profile.depthM);
      validateInputs();
    }
  }

  function setBusy(busy) {
    typeBtns.forEach((btn) => { btn.disabled = busy; });
    changeBtn.disabled = busy;
    applyBtn.disabled = busy;
    helpBtn.disabled = busy;
    widthEl.disabled = busy;
    depthEl.disabled = busy;
    presetListEl.querySelectorAll('button').forEach((btn) => { btn.disabled = busy; });
  }

  async function applyPreset(preset) {
    setBusy(true);
    try {
      await ctx.onApplyProfile(preset.widthM, preset.depthM, {
        heightM: preset.heightM,
        prosceniumHeightM: preset.prosceniumHeightM,
        id: preset.id,
        name: preset.name,
        areaM2: preset.areaM2,
      });
      syncFromManager();
      ctx.onChange?.();
    } finally {
      setBusy(false);
    }
  }

  typeBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = normalizeStageType(btn.dataset.stageType);
      if (next === ctx.stageManager.stageType) return;
      setBusy(true);
      try {
        await ctx.onStageTypeChange(next);
        syncFromManager();
        ctx.onChange?.();
      } finally {
        setBusy(false);
      }
    });
  });

  changeBtn.addEventListener('click', () => {
    openPickerList();
  });

  pickerOverlay.querySelectorAll('[data-act="close-picker"]').forEach((btn) => {
    btn.addEventListener('click', closePicker);
  });
  pickerOverlay.addEventListener('click', (e) => {
    if (e.target === pickerOverlay) closePicker();
  });

  pickerOverlay.querySelector('[data-act="custom-profile"]')?.addEventListener('click', () => {
    openPickerCustom();
  });

  pickerOverlay.querySelector('[data-act="back-list"]')?.addEventListener('click', () => {
    showPickerView('list');
  });

  presetListEl.addEventListener('click', (e) => {
    const item = e.target.closest?.('.sb-stage-picker-item');
    if (!item || item.disabled) return;
    const preset = STAGE_PROFILE_PRESETS.find((p) => p.id === item.dataset.presetId);
    if (!preset) return;
    void applyPreset(preset).then(() => closePicker());
  });

  widthEl.addEventListener('input', validateInputs);
  depthEl.addEventListener('input', validateInputs);

  applyBtn.addEventListener('click', () => {
    const widthM = Number(widthEl.value);
    const depthM = Number(depthEl.value);
    if (!Number.isFinite(widthM) || !Number.isFinite(depthM) || widthM <= 0 || depthM <= 0) return;

    setBusy(true);
    void (async () => {
      try {
        await ctx.onApplyProfile(widthM, depthM, {
          id: 'custom',
          name: '',
          areaM2: widthM * depthM,
        });
        syncFromManager();
        ctx.onChange?.();
        closePicker();
      } finally {
        setBusy(false);
      }
    })();
  });

  helpBtn.addEventListener('click', () => {
    modalBody.innerHTML = buildStageSizeHelpHtml(ctx.stageManager.stageType);
    modal.classList.add('sb-modal-backdrop--above-picker');
    modal.hidden = false;
  });

  syncFromManager();

  return {
    root,
    syncFromManager,
    setBusy,
    destroy() {
      closePicker();
      pickerOverlay.remove();
      modal.remove();
    },
  };
}
