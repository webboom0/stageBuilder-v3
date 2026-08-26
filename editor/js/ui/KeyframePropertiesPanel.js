import * as THREE from 'three';
import { asMotionKeyValue } from '../domain/motion/motionKeyValue.js';
import { applyMotionTint } from '../domain/motion/walkLitePerformer.js';
import { mountRotYChips } from './rotYChips.js';
import { createMotionAnimSection } from './MotionAnimSection.js';

/**
 * Properties — tabs: 속성 (object/key) · 구간 (move/hold/exit, no formation).
 *
 * @param {{
 *   engine: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   stageManager?: import('../domain/stage/StageManager.js').StageManager | null,
 *   getMotion?: (trackId: string) => import('../domain/motion/MotionDirector.js').MotionItem | null,
 *   onChange?: () => void,
 *   onStagePick?: (motionId: string) => void,
 *   onMotionExit?: (motionId: string) => void,
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
        title="이동·대기·퇴장 구간 → 키프레임 적용">구간</button>
    </div>
    <div class="sb-kf-props-empty" data-role="empty">
      씬에서 <strong>모션</strong>을 선택하세요.
    </div>
    <div class="sb-kf-props-form" data-role="form" hidden>
      <div class="sb-props-pane is-on" data-pane="props">
        <div class="ec-row"><label>타입</label><span class="ec-val-text" data-role="obj-type">Group</span></div>
        <div class="ec-row">
          <label>이름</label>
          <input type="text" class="sb-props-name" data-role="obj-name" />
        </div>

        <div class="ec-row-group" data-role="pos-group">
          <div class="ec-row-group-label">위치</div>
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

        <button type="button" class="sb-stage-pick-btn sb-exit-pick-btn" data-role="exit-pick"
          title="플레이헤드부터 퇴장 위치로 이동 후 사라짐 (빠른 퇴장)">
          <span class="sb-stage-pick-ico" aria-hidden="true">↗</span>
          <span>
            <strong>빠른 퇴장 (위치 지정)</strong>
            <small>플레이헤드 → 무대 클릭 · opacity 0</small>
          </span>
        </button>

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
  const posGroup = root.querySelector('[data-role="pos-group"]');
  const rotyHost = /** @type {HTMLElement} */ (root.querySelector('[data-role="roty-host"]'));
  const tintEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="tint"]'));
  const pickBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-role="stage-pick"]'));
  const exitBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-role="exit-pick"]'));
  const animHost = root.querySelector('[data-role="anim-host"]');
  const keyBlock = root.querySelector('[data-role="key-block"]');
  const timeEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="time"]'));
  const timeRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="time-range"]'));
  const interpEl = /** @type {HTMLSelectElement} */ (root.querySelector('[data-role="interp"]'));
  const opNum = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="opacity"]'));
  const opRange = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="opacity-range"]'));

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

  const xyz = {
    pos: mountXyzSliders(posGroup, 'pos', { min: -500, max: 500, step: 0.01, precision: 3 }),
  };

  function currentMotion() {
    const trackId = engine.selectedTrackId;
    if (!trackId) return null;
    return opts.getMotion?.(trackId) ?? null;
  }

  function commitTransform() {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    const track = engine.getTrack(m.trackId);
    if (track?.locked) {
      sync();
      return;
    }
    const pos = xyz.pos.read();
    m.object.position.set(pos[0], pos[1], pos[2]);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  }

  function pushObjectToSelectedKey(m) {
    const track = engine.getTrack(m.trackId);
    if (!track) return;
    let keyId = engine.selectedTrackId === m.trackId ? engine.selectedKeyframeId : null;
    if (!keyId) {
      const at = track.keys.list().find((k) => Math.abs(k.timeSec - engine.playheadSec) < 1e-3);
      keyId = at?.id ?? null;
    }
    const bagBase = {
      position: [m.object.position.x, m.object.position.y, m.object.position.z],
      rotation: [m.object.rotation.x, m.object.rotation.y, m.object.rotation.z],
      scale: [m.object.scale.x, m.object.scale.y, m.object.scale.z],
      opacity: Number.isFinite(Number(opNum.value)) ? clamp01(Number(opNum.value)) : 1,
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
    bag.opacity = Number.isFinite(Number(opNum.value)) ? clamp01(Number(opNum.value)) : bag.opacity;
    engine.editKeyframe(m.trackId, keyId, { value: bag });
    engine.selectKeyframe(m.trackId, keyId);
  }

  function sync() {
    const m = currentMotion();
    const track = engine.selectedTrackId ? engine.getTrack(engine.selectedTrackId) : null;
    const kf = track && engine.selectedKeyframeId ? track.keys.get(engine.selectedKeyframeId) : null;

    if (!m || track?.kind !== 'motion') {
      emptyEl.hidden = false;
      formEl.hidden = true;
      emptyEl.style.display = '';
      formEl.style.display = 'none';
      boundAnimMotionId = null;
      animSection.clear();
      return;
    }

    syncing = true;
    emptyEl.hidden = true;
    formEl.hidden = false;
    emptyEl.style.display = 'none';
    formEl.style.display = '';
    typeEl.textContent = m.object.type || 'Group';
    nameEl.value = m.name || m.object.name || '';

    xyz.pos.write([m.object.position.x, m.object.position.y, m.object.position.z]);

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

    const locked = !!engine.getTrack(m.trackId)?.locked;
    formEl.classList.toggle('is-locked', locked);
    formEl.querySelectorAll('input, select, button').forEach((node) => {
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

    const tintHex = m.object.userData?.tintColor ?? m.object.userData?.walkLiteColor;
    if (tintHex != null) {
      try {
        const c = typeof tintHex === 'number'
          ? `#${tintHex.toString(16).padStart(6, '0')}`
          : String(tintHex).startsWith('#') ? String(tintHex) : `#${Number(tintHex).toString(16).padStart(6, '0')}`;
        if (c.length === 7) tintEl.value = c;
      } catch { /* keep */ }
    }

    if (kf) {
      const bag = asMotionKeyValue(kf.value);
      opNum.value = String(bag.opacity);
      opRange.value = String(bag.opacity);
    } else {
      opNum.value = '1';
      opRange.value = '1';
    }

    timeRange.max = String(engine.durationSec || 180);
    if (kf) {
      keyBlock.hidden = false;
      timeEl.value = String(Number(kf.timeSec.toFixed(3)));
      timeRange.value = String(kf.timeSec);
      interpEl.value = String(kf.interpolation ?? 0);
    } else {
      keyBlock.hidden = true;
    }
    syncing = false;
  }

  xyz.pos.onChange(commitTransform);

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
    applyMotionTint(m.object, tintEl.value);
    opts.onChange?.();
  });

  pickBtn.addEventListener('click', () => {
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    opts.onStagePick?.(m.id);
  });

  exitBtn.addEventListener('click', () => {
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    opts.onMotionExit?.(m.id);
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

  const commitOpacity = (raw) => {
    if (syncing) return;
    const m = currentMotion();
    if (!m) return;
    if (engine.getTrack(m.trackId)?.locked) return;
    const n = clamp01(Number(raw));
    opNum.value = String(n);
    opRange.value = String(n);
    pushObjectToSelectedKey(m);
    opts.onObjectEdited?.(m.id);
    opts.onChange?.();
  };
  opNum.addEventListener('change', () => commitOpacity(opNum.value));
  opRange.addEventListener('input', () => commitOpacity(opRange.value));

  const unsub = engine.subscribe((ev) => {
    if (['selection', 'keys', 'change', 'playhead', 'duration', 'tracks'].includes(ev.type)) sync();
  });
  sync();

  return { root, sync, destroy: () => unsub() };
}

function mountXyzSliders(groupEl, prefix, bounds) {
  const axes = ['X', 'Y', 'Z'];
  /** @type {Array<{ range: HTMLInputElement, num: HTMLInputElement }>} */
  const rows = [];
  axes.forEach((axis, i) => {
    const row = document.createElement('div');
    row.className = 'ec-row';
    const unit = bounds.unit ? ` <span class="sb-kf-unit">${bounds.unit}</span>` : '';
    row.innerHTML = `
      <label>${axis}</label>
      <input type="range" class="acc" data-${prefix}-range="${i}"
        min="${bounds.min}" max="${bounds.max}" step="${bounds.step}" value="0" />
      <input type="number" class="Number ec-val" data-${prefix}="${i}"
        step="${bounds.step}" value="0" />${unit}`;
    groupEl.appendChild(row);
    rows.push({
      range: /** @type {HTMLInputElement} */ (row.querySelector(`[data-${prefix}-range="${i}"]`)),
      num: /** @type {HTMLInputElement} */ (row.querySelector(`[data-${prefix}="${i}"]`)),
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
    onChange(fn) {
      rows.forEach((r) => {
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
