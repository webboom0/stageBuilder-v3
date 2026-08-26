import { STAGE_TYPES, normalizeStageType } from '../domain/stage/StageTypes.js';
import { STAGE_PROFILE_PRESETS } from '../domain/stage/StageProfile.js';
import { getProfileLimits } from '../domain/stage/stageFloorLayout.js';
import { checkStageSizeInput, buildStageSizeHelpHtml } from './stageSizeHelp.js';

/**
 * @param {{
 *   stageManager: import('../domain/stage/StageManager.js').StageManager,
 *   onStageTypeChange: (type: import('../domain/stage/StageTypes.js').StageTypeId) => Promise<void>,
 *   onApplyProfile: (widthM: number, depthM: number, extras?: Record<string, unknown>) => void,
 *   onChange?: () => void,
 * }} ctx
 */
export function createStagePanelBody(ctx) {
  const root = document.createElement('div');
  root.className = 'sb-stage-panel sb-panel-body';
  root.innerHTML = `
    <div class="ec-row">
      <label for="sb-stage-type">무대</label>
      <select id="sb-stage-type" class="ec-select">
        <option value="proscenium">${STAGE_TYPES.proscenium.label}</option>
        <option value="arena">${STAGE_TYPES.arena.label}</option>
      </select>
    </div>
    <div class="ec-row">
      <label for="sb-preset">규격</label>
      <select id="sb-preset" class="ec-select">
        ${STAGE_PROFILE_PRESETS.map(
          (p) => `<option value="${p.id}">${p.name} (${p.widthM}×${p.depthM}m)</option>`,
        ).join('')}
        <option value="custom">직접 입력</option>
      </select>
    </div>
    <div class="ec-row">
      <label for="sb-width">W (m)</label>
      <input id="sb-width" class="ec-val" type="number" step="0.5" />
    </div>
    <div class="ec-row">
      <label for="sb-depth">D (m)</label>
      <input id="sb-depth" class="ec-val" type="number" step="0.5" />
    </div>
    <div class="ec-row-actions">
      <button type="button" id="sb-apply-profile" class="sb-dock-btn sb-dock-btn--wide">크기 적용</button>
      <button type="button" id="sb-size-help" class="sb-dock-btn sb-dock-btn--icon" title="무대 크기 한도 설명"><i class="fas fa-question-circle" aria-hidden="true"></i></button>
    </div>
    <div id="sb-stage-warning" class="sb-stage-warning" hidden></div>
    <p class="sb-stage-hint" id="sb-stage-limits-hint"></p>
  `;

  const typeEl = root.querySelector('#sb-stage-type');
  const presetEl = root.querySelector('#sb-preset');
  const widthEl = root.querySelector('#sb-width');
  const depthEl = root.querySelector('#sb-depth');
  const applyBtn = root.querySelector('#sb-apply-profile');
  const helpBtn = root.querySelector('#sb-size-help');
  const warningEl = root.querySelector('#sb-stage-warning');
  const hintEl = root.querySelector('#sb-stage-limits-hint');

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
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
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

  function syncPresetSelect() {
    const { profile } = ctx.stageManager;
    const match = STAGE_PROFILE_PRESETS.find(
      (p) => p.widthM === profile.widthM && p.depthM === profile.depthM,
    );
    presetEl.value = match?.id ?? 'custom';
  }

  function syncFromManager() {
    const { profile, stageType } = ctx.stageManager;
    typeEl.value = stageType;
    widthEl.value = String(profile.widthM);
    depthEl.value = String(profile.depthM);
    updateLimitsHint();
    syncPresetSelect();
    validateInputs();
  }

  function setBusy(busy) {
    [typeEl, presetEl, widthEl, depthEl, applyBtn, helpBtn].forEach((el) => {
      el.disabled = busy;
    });
  }

  typeEl.addEventListener('change', async () => {
    const next = normalizeStageType(typeEl.value);
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

  presetEl.addEventListener('change', () => {
    const id = presetEl.value;
    if (id === 'custom') return;
    const preset = STAGE_PROFILE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    widthEl.value = String(preset.widthM);
    depthEl.value = String(preset.depthM);
    validateInputs();
    ctx.onApplyProfile(preset.widthM, preset.depthM, {
      heightM: preset.heightM,
      prosceniumHeightM: preset.prosceniumHeightM,
      id: preset.id,
      name: preset.name,
      areaM2: preset.areaM2,
    });
    syncFromManager();
    ctx.onChange?.();
  });

  widthEl.addEventListener('input', () => {
    presetEl.value = 'custom';
    validateInputs();
  });
  depthEl.addEventListener('input', () => {
    presetEl.value = 'custom';
    validateInputs();
  });

  applyBtn.addEventListener('click', () => {
    const widthM = Number(widthEl.value);
    const depthM = Number(depthEl.value);
    if (!Number.isFinite(widthM) || !Number.isFinite(depthM) || widthM <= 0 || depthM <= 0) return;

    const check = checkStageSizeInput(widthM, depthM, ctx.stageManager.stageType);
    ctx.onApplyProfile(widthM, depthM);
    syncFromManager();
    ctx.onChange?.();

    if (check.isOver) {
      warningEl.hidden = false;
      warningEl.textContent = `${check.message} — 한도 내 값으로 적용됨`;
    }
  });

  helpBtn.addEventListener('click', () => {
    modalBody.innerHTML = buildStageSizeHelpHtml(ctx.stageManager.stageType);
    modal.hidden = false;
  });

  syncFromManager();

  return { root, syncFromManager, setBusy };
}
