import * as THREE from 'three';
import { asMotionKeyValue } from '../domain/motion/motionKeyValue.js';
import { asLightKeyValue } from '../domain/lighting/lightKeyValue.js';
import { applyMotionTint } from '../domain/motion/walkLitePerformer.js';
import { mountRotYChips } from './rotYChips.js';
import { createMotionAnimSection } from './MotionAnimSection.js';

/**
 * Properties — tabs: 속성 (object/key) · 구간 (move/hold/exit, no formation).
 * Exit is only in the 구간 tab (not 속성). HOUSE light tracks edit dim/color/size.
 *
 * @param {{
 *   engine: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   stageManager?: import('../domain/stage/StageManager.js').StageManager | null,
 *   getMotion?: (trackId: string) => import('../domain/motion/MotionDirector.js').MotionItem | null,
 *   getLight?: (trackId: string) => { channel: string, trackId: string, name: string } | null,
 *   onWriteLight?: (trackId: string, patch: { dim?: number, color?: string, size?: number }) => void,
 *   onChange?: () => void,
 *   onStagePick?: (motionId: string) => void,
 *   onObjectEdited?: (motionId: string) => void,
 *   onPickAnimPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     motionId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   onApplyMotionAnim?: (motionId: string) => void | Promise<void>,
 * }} opts
 */
export function createKeyframePropertiesPanel(opts) {
  const { engine } = opts;
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-kf-props';
  root.innerHTML = `
    <div class="sb-props-tabs" role="tablist">
      <button type="button" class="sb-props-tab is-on" data-tab="props" role="tab" aria-selected="true">속성</button>
      <button type="button" class="sb-props-tab" data-tab="segments" role="tab" aria-selected="false"
        data-role="segments-tab"
        title="이동·대기·퇴장 구간 → 키프레임 적용">구간</button>
    </div>
    <div class="sb-kf-props-empty" data-role="empty">
      씬에서 <strong>모션</strong>을 선택하거나, 타임라인에서 <strong>HOUSE</strong> 트랙을 선택하세요.
    </div>
    <div class="sb-kf-props-form" data-role="form" hidden>
      <div class="sb-props-pane is-on" data-pane="props">
        <div class="ec-row"><label>타입</label><span class="ec-val-text" data-role="obj-type">Group</span></div>
        <div class="ec-row">
          <label>이름</label>
          <input type="text" class="sb-props-name" data-role="obj-name" />
        </div>

        <div data-role="light-props" hidden>
          <div class="ec-row">
            <label>Dim</label>
            <input type="range" data-role="light-dim-range" min="0" max="1" step="0.01" class="acc" />
            <input type="number" class="Number ec-val" data-role="light-dim" min="0" max="100" step="1" title="0–100%" />
          </div>
          <div class="ec-row">
            <label>색상</label>
            <input type="color" data-role="light-color" value="#ffffff" />
          </div>
          <div class="ec-row" data-role="light-size-row">
            <label>Size</label>
            <input type="range" data-role="light-size-range" min="0" max="1" step="0.01" class="acc" />
            <input type="number" class="Number ec-val" data-role="light-size" min="0" max="100" step="1" title="빔 각도 0–100%" />
          </div>
        </div>

        <div data-role="char-props">
          <div class="ec-row-group" data-role="pos-group">
            <div class="ec-row-group-label">위치 <span class="sb-props-hint">Y 고정</span></div>
          </div>
          <button type="button" class="sb-stage-pick-btn" data-role="stage-pick">
            <span class="sb-stage-pick-ico" aria-hidden="true">◎</span>
            <span>
              <strong>무대에서 위치 지정</strong>
              <small>버튼을 누른 뒤 무대 클릭</small>
            </span>
          </button>

          <div class="ec-row-group-label">회전</div>
          <div data-role="roty-host"></div>

          <div class="ec-row">
            <label>틴트 색상</label>
            <input type="color" data-role="tint" value="#d9c08a" />
          </div>

          <div class="ec-row">
            <label>Opacity</label>
            <input type="range" data-role="opacity-range" min="0" max="1" step="0.01" class="acc" />
            <input type="number" class="Number ec-val" data-role="opacity" min="0" max="1" step="0.01" />
          </div>
        </div>

        <div data-role="stage-props" hidden>
          <div class="ec-row-group" data-role="stage-pos-group">
            <div class="ec-row-group-label">위치</div>
          </div>
          <button type="button" class="sb-stage-pick-btn" data-role="stage-pick-stage">
            <span class="sb-stage-pick-ico" aria-hidden="true">◎</span>
            <span>
              <strong>무대에서 위치 지정</strong>
              <small>버튼을 누른 뒤 무대 클릭</small>
            </span>
          </button>

          <div class="ec-row-group" data-role="stage-rot-group">
            <div class="ec-row-group-label">회전</div>
          </div>

          <div class="ec-row-group" data-role="stage-scale-group">
            <div class="ec-row-group-label">크기</div>
          </div>

          <div class="ec-row">
            <label>색상</label>
            <input type="color" data-role="stage-tint" value="#aaaaaa" />
          </div>

          <div class="ec-row">
            <label>Opacity</label>
            <input type="range" data-role="stage-opacity-range" min="0" max="1" step="0.01" class="acc" />
            <input type="number" class="Number ec-val" data-role="stage-opacity" min="0" max="1" step="0.01" />
          </div>
        </div>

        <div class="sb-kf-key-block" data-role="key-block" hidden>
          <div class="sb-dock-section-label">선택 키</div>
          <div class="ec-row">
            <label>시간</label>
            <input type="range" data-role="time-range" min="0" max="180" step="0.01" class="acc" />
            <input type="number" class="Number ec-val" data-role="time" step="0.01" min="0" />
          </div>
          <div class="ec-row">
            <label>Easing</label>
            <select data-role="interp">
              <option value="0">Linear</option>
              <option value="1">Step</option>
              <option value="2">Smooth</option>
            </select>
          </div>
        </div>
      </div>

      <div class="sb-props-pane" data-pane="segments" hidden>
        <p class="sb-ens-subtitle sb-props-pane-hint">
          그룹과 같은 <strong>이동·대기·퇴장</strong> 설계 · 포메이션 없음 · 적용 시 키 생성
        </p>
        <div data-role="anim-host"></div>
      </div>
    </div>
  `;

  const emptyEl = root.querySelector('[data-role="empty"]');
  const formEl = root.querySelector('[data-role="form"]');
  const typeEl = root.querySelector('[data-role="obj-type"]');
  const nameEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="obj-name"]'));
  const charProps = root.querySelector('[data-role="char-props"]');
  const stageProps = root.querySelector('[data-role="stage-props"]');
  const lightProps = root.querySelector('[data-role="light-props"]');
  const lightSizeRow = root.querySelector('[data-role="light-size-row"]');
  const lightDimRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="light-dim-range"]'));
  const lightDim = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="light-dim"]'));
  const lightColor = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="light-color"]'));
  const lightSizeRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="light-size-range"]'));
  const lightSize = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="light-size"]'));
  const posGroup = root.querySelector('[data-role="pos-group"]');
  const rotyHost = /** @type {HTMLElement} */ (root.querySelector('[data-role="roty-host"]'));
  const stagePosGroup = root.querySelector('[data-role="stage-pos-group"]');
  const stageRotGroup = root.querySelector('[data-role="stage-rot-group"]');
  const stageScaleGroup = root.querySelector('[data-role="stage-scale-group"]');
  const segmentsTab = root.querySelector('[data-role="segments-tab"]');
  const tintEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="tint"]'));
  const pickBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-role="stage-pick"]'));
  const pickBtnStage = /** @type {HTMLButtonElement} */ (root.querySelector('[data-role="stage-pick-stage"]'));
  const animHost = root.querySelector('[data-role="anim-host"]');
  const keyBlock = root.querySelector('[data-role="key-block"]');
  const timeEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="time"]'));
  const timeRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="time-range"]'));
  const interpEl = /** @type {HTMLSelectElement} */ (root.querySelector('[data-role="interp"]'));
  const opNum = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="opacity"]'));
  const opRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="opacity-range"]'));
  const stageOpNum = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="stage-opacity"]'));
  const stageOpRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="stage-opacity-range"]'));
  const stageTintEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="stage-tint"]'));

  const animSection = createMotionAnimSection({
    onPickPoint: (pick) => opts.onPickAnimPoint?.(pick),
    onApply: (motionId) => opts.onApplyMotionAnim?.(motionId),
    onChange: () => opts.onChange?.(),
  });
  animHost.appendChild(animSection.root);

  /** @type {'props' | 'segments'} */
  let activeTab = 'props';

  function setTab(tab) {
    activeTab = tab === 'segments' ? 'segments' : 'props';
    root.querySelectorAll('.sb-props-tab').forEach((b) => {
      const on = b.dataset.tab === activeTab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelectorAll('[data-pane]').forEach((pane) => {
      const on = pane.getAttribute('data-pane') === activeTab;
      pane.classList.toggle('is-on', on);
      /** @type {HTMLElement} */ (pane).hidden = !on;
    });
  }

  root.querySelectorAll('.sb-props-tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(/** @type {any} */ (btn.dataset.tab)));
  });

  let syncing = false;
  /** @type {string | null} */
  let boundAnimMotionId = null;

  const charXyz = {
    pos: mountXyzSliders(posGroup, 'pos', {
      min: -500,
      max: 500,
      step: 0.01,
      precision: 3,
      disabledAxes: [1], // Y locked — stage floor only
    }),
  };

  const stageXyz = {
    pos: mountXyzSliders(stagePosGroup, 'st-pos', {
      min: -500,
      max: 500,
      step: 0.01,
      precision: 3,
    }),
    rot: mountXyzSliders(stageRotGroup, 'st-rot', {
      min: -180,
      max: 180,
      step: 0.1,
      precision: 1,
      unit: '°',
    }),
    scale: mountXyzSliders(stageScaleGroup, 'st-scale', {
      min: 0.001,
      max: 100,
      step: 0.001,
      precision: 3,
    }),
  };

  function currentMotion() {
    const trackId = engine.selectedTrackId;
    if (!trackId) return null;
    return opts.getMotion?.(trackId) ?? null;
  }

  function currentLight() {
    const trackId = engine.selectedTrackId;
    if (!trackId) return null;
    return opts.getLight?.(trackId) ?? null;
  }

  function commitLightFromUi() {
    if (syncing) return;
    const ch = currentLight();
    if (!ch) return;
    const track = engine.getTrack(ch.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const dimPct = Number(lightDim.value);
    const sizePct = Number(lightSize.value);
    opts.onWriteLight?.(ch.trackId, {
      dim: Number.isFinite(dimPct) ? dimPct / 100 : Number(lightDimRange.value) || 0,
      color: lightColor.value,
      size: Number.isFinite(sizePct) ? sizePct / 100 : Number(lightSizeRange.value) || 0.5,
    });
    opts.onChange?.();
    sync();
  }

  function isStageItem(m, track) {
    if (!m) return false;
    return m.assetRole === 'stage' || m.section === 'stage' || track?.section === 'stage';
  }

  function commitCharTransform() {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const pos = charXyz.pos.read();
    m.object.position.set(pos[0], m.object.position.y, pos[2]);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  }

  function commitStageTransform() {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const pos = stageXyz.pos.read();
    m.object.position.set(pos[0], pos[1], pos[2]);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  }

  function commitStageRotation() {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const rot = stageXyz.rot.read();
    m.object.rotation.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2]),
    );
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  }

  function commitStageScale() {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const sc = stageXyz.scale.read().map((v) => Math.max(1e-6, v));
    m.object.scale.set(sc[0], sc[1], sc[2]);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  }

  function opacityInputs(m, track) {
    return isStageItem(m, track)
      ? { num: stageOpNum, range: stageOpRange }
      : { num: opNum, range: opRange };
  }

  function readOpacityValue(m, track) {
    const { num } = opacityInputs(m, track);
    return Number.isFinite(Number(num.value)) ? clamp01(Number(num.value)) : 1;
  }

  function writeOpacityValue(m, track, value) {
    const { num, range } = opacityInputs(m, track);
    const n = clamp01(Number(value));
    num.value = String(n);
    range.value = String(n);
  }

  function pushObjectToSelectedKey(m) {
    const track = engine.getTrack(m.trackId);
    if (!track) return;
    let keyId = engine.selectedTrackId === m.trackId ? engine.selectedKeyframeId : null;
    if (!keyId) {
      const at = track.keys.list().find((k) => Math.abs(k.timeSec - engine.playheadSec) < 1e-3);
      keyId = at?.id ?? null;
    }
    const opacity = readOpacityValue(m, track);
    const bagBase = {
      position: [m.object.position.x, m.object.position.y, m.object.position.z],
      rotation: [m.object.rotation.x, m.object.rotation.y, m.object.rotation.z],
      scale: [m.object.scale.x, m.object.scale.y, m.object.scale.z],
      opacity,
      visible: m.object.visible !== false,
    };
    if (!keyId) {
      engine.addKeyframe(m.trackId, engine.playheadSec, bagBase);
      return;
    }
    const kf = track.keys.get(keyId);
    if (!kf) return;
    const bag = asMotionKeyValue(kf.value);
    Object.assign(bag, bagBase);
    bag.opacity = opacity;
    engine.editKeyframe(m.trackId, keyId, { value: bag });
    engine.selectKeyframe(m.trackId, keyId);
  }

  function sync() {
    const track = engine.selectedTrackId ? engine.getTrack(engine.selectedTrackId) : null;
    const kf = track && engine.selectedKeyframeId ? track.keys.get(engine.selectedKeyframeId) : null;
    const lightCh = currentLight();

    if (track?.kind === 'light' && lightCh) {
      syncing = true;
      emptyEl.hidden = true;
      formEl.hidden = false;
      emptyEl.style.display = 'none';
      formEl.style.display = '';
      if (charProps) /** @type {HTMLElement} */ (charProps).hidden = true;
      if (stageProps) /** @type {HTMLElement} */ (stageProps).hidden = true;
      if (lightProps) /** @type {HTMLElement} */ (lightProps).hidden = false;
      if (segmentsTab) /** @type {HTMLElement} */ (segmentsTab).hidden = true;
      if (activeTab === 'segments') setTab('props');
      boundAnimMotionId = null;
      animSection.clear();

      typeEl.textContent = 'HOUSE';
      nameEl.value = lightCh.name;
      nameEl.readOnly = true;

      let live = asLightKeyValue({ dim: 0, color: '#ffffff', size: 0.5 });
      if (kf) live = asLightKeyValue(kf.value);
      else {
        const keys = track.keys.list();
        if (keys.length) live = asLightKeyValue(keys[0].value);
      }

      lightDimRange.value = String(live.dim);
      lightDim.value = String(Math.round(live.dim * 100));
      lightColor.value = live.color.startsWith('#') ? live.color : '#ffffff';
      lightSizeRange.value = String(live.size);
      lightSize.value = String(Math.round(live.size * 100));
      if (lightSizeRow) {
        /** @type {HTMLElement} */ (lightSizeRow).hidden = lightCh.channel === 'fill';
      }

      const locked = !!track.locked;
      formEl.classList.toggle('is-locked', locked);
      formEl.querySelectorAll('input, select, button').forEach((node) => {
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLButtonElement} */ (node).disabled = locked;
      });
      nameEl.disabled = true;

      if (kf) {
        keyBlock.hidden = false;
        timeEl.value = String(Number(kf.timeSec.toFixed(3)));
        timeRange.value = String(kf.timeSec);
        interpEl.value = String(kf.interpolation ?? 0);
      } else {
        keyBlock.hidden = true;
      }
      timeRange.max = String(engine.durationSec || 180);
      syncing = false;
      return;
    }

    const m = currentMotion();

    if (!m || track?.kind !== 'motion') {
      emptyEl.hidden = false;
      formEl.hidden = true;
      emptyEl.style.display = '';
      formEl.style.display = 'none';
      boundAnimMotionId = null;
      animSection.clear();
      nameEl.readOnly = false;
      return;
    }

    syncing = true;
    emptyEl.hidden = true;
    formEl.hidden = false;
    emptyEl.style.display = 'none';
    formEl.style.display = '';
    nameEl.readOnly = false;
    nameEl.disabled = false;
    if (lightProps) /** @type {HTMLElement} */ (lightProps).hidden = true;
    typeEl.textContent = m.object.type || 'Group';
    nameEl.value = m.name || m.object.name || '';

    const isStage = isStageItem(m, track);
    if (charProps) /** @type {HTMLElement} */ (charProps).hidden = isStage;
    if (stageProps) /** @type {HTMLElement} */ (stageProps).hidden = !isStage;
    if (segmentsTab) /** @type {HTMLElement} */ (segmentsTab).hidden = isStage;
    if (isStage && activeTab === 'segments') setTab('props');

    if (isStage) {
      stageXyz.pos.write([m.object.position.x, m.object.position.y, m.object.position.z]);
      stageXyz.rot.write([
        THREE.MathUtils.radToDeg(m.object.rotation.x),
        THREE.MathUtils.radToDeg(m.object.rotation.y),
        THREE.MathUtils.radToDeg(m.object.rotation.z),
      ]);
      stageXyz.scale.write([m.object.scale.x, m.object.scale.y, m.object.scale.z]);
      boundAnimMotionId = null;
      animSection.clear();
    } else {
      charXyz.pos.write([m.object.position.x, m.object.position.y, m.object.position.z]);

      mountRotYChips(rotyHost, THREE.MathUtils.radToDeg(m.object.rotation.y), (deg) => {
        if (engine.getTrack(m.trackId)?.locked) return;
        m.object.rotation.y = THREE.MathUtils.degToRad(deg);
        pushObjectToSelectedKey(m);
        opts.onObjectEdited?.(m.id);
        opts.onChange?.();
        sync();
      });

      if (boundAnimMotionId !== m.id) {
        boundAnimMotionId = m.id;
        animSection.bind(m);
      }
    }

    const locked = !!engine.getTrack(m.trackId)?.locked;
    formEl.classList.toggle('is-locked', locked);
    formEl.querySelectorAll('input, select, button').forEach((node) => {
      if (node.closest?.('.is-axis-disabled')) {
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLButtonElement} */ (node).disabled = true;
        return;
      }
      if (node.closest?.('[data-role="anim-host"]')) {
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLButtonElement} */ (node).disabled = locked;
        return;
      }
      if (node.closest?.('[data-role="key-block"]')) {
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLButtonElement} */ (node).disabled = locked;
        return;
      }
      if (node.matches?.('input, select')) {
        /** @type {HTMLInputElement|HTMLSelectElement} */ (node).disabled = locked;
      }
      if (node.matches?.('button.sb-chip, button.sb-stage-pick-btn')) {
        /** @type {HTMLButtonElement} */ (node).disabled = locked;
      }
    });

    const tintHex = isStage
      ? (m.object.userData?.tintColor ?? m.object.userData?.walkLiteColor)
      : (m.object.userData?.tintColor ?? m.object.userData?.walkLiteColor);
    if (tintHex != null) {
      try {
        const c = typeof tintHex === 'number'
          ? `#${tintHex.toString(16).padStart(6, '0')}`
          : String(tintHex).startsWith('#') ? String(tintHex) : `#${Number(tintHex).toString(16).padStart(6, '0')}`;
        if (c.length === 7) {
          if (isStage) stageTintEl.value = c;
          else tintEl.value = c;
        }
      } catch { /* keep */ }
    } else if (isStage) {
      stageTintEl.value = '#aaaaaa';
    }

    if (kf) {
      const bag = asMotionKeyValue(kf.value);
      writeOpacityValue(m, track, bag.opacity);
      keyBlock.hidden = false;
      timeEl.value = String(Number(kf.timeSec.toFixed(3)));
      timeRange.value = String(kf.timeSec);
      interpEl.value = String(kf.interpolation ?? 0);
    } else {
      writeOpacityValue(m, track, 1);
      keyBlock.hidden = true;
    }
    timeRange.max = String(engine.durationSec || 180);
    syncing = false;
  }

  charXyz.pos.onChange(commitCharTransform);
  stageXyz.pos.onChange(commitStageTransform);
  stageXyz.rot.onChange(commitStageRotation);
  stageXyz.scale.onChange(commitStageScale);

  lightDimRange.addEventListener('input', () => {
    if (syncing) return;
    lightDim.value = String(Math.round(Number(lightDimRange.value) * 100));
    commitLightFromUi();
  });
  lightDim.addEventListener('change', () => {
    if (syncing) return;
    const pct = Math.max(0, Math.min(100, Number(lightDim.value) || 0));
    lightDim.value = String(pct);
    lightDimRange.value = String(pct / 100);
    commitLightFromUi();
  });
  lightColor.addEventListener('input', () => {
    if (syncing) return;
    commitLightFromUi();
  });
  lightSizeRange.addEventListener('input', () => {
    if (syncing) return;
    lightSize.value = String(Math.round(Number(lightSizeRange.value) * 100));
    commitLightFromUi();
  });
  lightSize.addEventListener('change', () => {
    if (syncing) return;
    const pct = Math.max(0, Math.min(100, Number(lightSize.value) || 0));
    lightSize.value = String(pct);
    lightSizeRange.value = String(pct / 100);
    commitLightFromUi();
  });

  nameEl.addEventListener('change', () => {
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) {
      sync();
      return;
    }
    m.name = nameEl.value.trim() || m.name;
    m.object.name = m.name;
    const track = engine.getTrack(m.trackId);
    if (track) {
      track.name = m.name;
      engine.emit('tracks');
    }
    opts.onChange?.();
  });

  tintEl.addEventListener('input', () => {
    const m = currentMotion();
    if (!m || syncing) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    if (isStageItem(m, engine.getTrack(m.trackId))) return;
    applyMotionTint(m.object, tintEl.value);
    opts.onChange?.();
  });

  stageTintEl.addEventListener('input', () => {
    const m = currentMotion();
    if (!m || syncing) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) return;
    if (!isStageItem(m, track)) return;
    applyMotionTint(m.object, stageTintEl.value);
    opts.onChange?.();
  });

  pickBtn.addEventListener('click', () => {
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    opts.onStagePick?.(m.id);
  });

  pickBtnStage.addEventListener('click', () => {
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    opts.onStagePick?.(m.id);
  });

  const setTime = (raw) => {
    if (!engine.selectedTrackId || !engine.selectedKeyframeId || syncing) return;
    const t = Number(raw);
    if (!Number.isFinite(t) || t < 0) return;
    timeEl.value = String(t);
    timeRange.value = String(t);
    engine.moveKeyframe(engine.selectedTrackId, engine.selectedKeyframeId, t);
    opts.onChange?.();
  };
  timeEl.addEventListener('change', () => setTime(timeEl.value));
  timeRange.addEventListener('input', () => setTime(timeRange.value));

  interpEl.addEventListener('change', () => {
    if (!engine.selectedTrackId || !engine.selectedKeyframeId) return;
    engine.editKeyframe(engine.selectedTrackId, engine.selectedKeyframeId, {
      interpolation: Number(interpEl.value),
    });
    opts.onChange?.();
  });

  const commitOpacity = (raw, which) => {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) return;
    const isStage = isStageItem(m, track);
    if (which === 'stage' && !isStage) return;
    if (which === 'char' && isStage) return;
    const n = clamp01(Number(raw));
    writeOpacityValue(m, track, n);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  };
  opNum.addEventListener('change', () => commitOpacity(opNum.value, 'char'));
  opRange.addEventListener('input', () => commitOpacity(opRange.value, 'char'));
  stageOpNum.addEventListener('change', () => commitOpacity(stageOpNum.value, 'stage'));
  stageOpRange.addEventListener('input', () => commitOpacity(stageOpRange.value, 'stage'));

  const unsub = engine.subscribe((ev) => {
    if (['selection', 'keys', 'change', 'playhead', 'duration', 'tracks'].includes(ev.type)) sync();
  });
  sync();

  return { root, sync, destroy: () => unsub() };
}

function mountXyzSliders(groupEl, prefix, bounds) {
  const axes = ['X', 'Y', 'Z'];
  const disabled = new Set(bounds.disabledAxes || []);
  /** @type {Array<{ range: HTMLInputElement, num: HTMLInputElement, disabled: boolean }>} */
  const rows = [];
  axes.forEach((axis, i) => {
    const row = document.createElement('div');
    row.className = 'ec-row';
    const isOff = disabled.has(i);
    if (isOff) row.classList.add('is-axis-disabled');
    const unit = bounds.unit ? ` <span class="sb-kf-unit">${bounds.unit}</span>` : '';
    row.innerHTML = `
      <label>${axis}</label>
      <input type="range" class="acc" data-${prefix}-range="${i}"
        min="${bounds.min}" max="${bounds.max}" step="${bounds.step}" value="0"
        ${isOff ? 'disabled' : ''} />
      <input type="number" class="Number ec-val" data-${prefix}="${i}"
        step="${bounds.step}" value="0" ${isOff ? 'disabled' : ''} />${unit}`;
    groupEl.appendChild(row);
    rows.push({
      range: /** @type {HTMLInputElement} */ (row.querySelector(`[data-${prefix}-range="${i}"]`)),
      num: /** @type {HTMLInputElement} */ (row.querySelector(`[data-${prefix}="${i}"]`)),
      disabled: isOff,
    });
  });

  const prec = bounds.precision ?? 2;

  function expand(range, num, v) {
    let min = Number(range.min);
    let max = Number(range.max);
    if (v < min) min = v - Math.abs(v) * 0.5 - 10;
    if (v > max) max = v + Math.abs(v) * 0.5 + 10;
    range.min = String(min);
    range.max = String(max);
    range.value = String(v);
    num.value = String(Number(v.toFixed(prec)));
  }

  return {
    write(values) {
      rows.forEach((r, i) => expand(r.range, r.num, Number(values[i]) || 0));
    },
    read() {
      return rows.map((r) => Number(r.num.value) || 0);
    },
    setAxisDisabled(axisIndex, disabled) {
      const r = rows[axisIndex];
      if (!r || r.disabled === disabled) return;
      r.disabled = disabled;
      r.range.disabled = disabled;
      r.num.disabled = disabled;
      const rowEl = r.range.closest('.ec-row');
      rowEl?.classList.toggle('is-axis-disabled', disabled);
    },
    onChange(fn) {
      rows.forEach((r) => {
        if (r.disabled) return;
        r.range.addEventListener('input', () => {
          r.num.value = r.range.value;
          fn();
        });
        r.num.addEventListener('change', () => {
          expand(r.range, r.num, Number(r.num.value) || 0);
          fn();
        });
      });
    },
  };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
