/** grandMA3-style rotary encoder (pointer drag) */
export function mountMaKnob(host, opts = {}) {
  const {
    label = "",
    min = 0,
    max = 100,
    value = 0,
    unit = "",
    disabled = false,
    onInput,
    onDragStart,
    onDragEnd,
    onChange,
  } = opts;

  const wrap = document.createElement("div");
  wrap.className = "sb-ma-knob" + (disabled ? " off" : "");
  wrap.innerHTML = `
    <div class="sb-ma-knob-dial" tabindex="0">
      <svg viewBox="0 0 64 64" class="sb-ma-knob-svg" aria-hidden="true">
        <circle cx="32" cy="32" r="28" class="sb-ma-knob-ring"/>
        <line x1="32" y1="32" x2="32" y2="10" class="sb-ma-knob-needle"/>
      </svg>
    </div>
    <div class="sb-ma-knob-lbl">${label}</div>
    <div class="sb-ma-knob-val">—</div>
  `;
  host.appendChild(wrap);

  const dial = wrap.querySelector(".sb-ma-knob-dial");
  const needle = wrap.querySelector(".sb-ma-knob-needle");
  const valEl = wrap.querySelector(".sb-ma-knob-val");

  let cur = Number(value) || 0;
  let isDisabled = !!disabled;
  let dragging = false;
  let startY = 0;
  let startVal = 0;
  let wheelCommitTimer = null;

  function clamp(v) {
    return Math.max(min, Math.min(max, v));
  }

  function paint() {
    const t = max === min ? 0 : (cur - min) / (max - min);
    const deg = -135 + t * 270;
    needle.setAttribute("transform", `rotate(${deg} 32 32)`);
    const suffix = unit === "%" ? "%" : unit === "°" ? "°" : unit ? ` ${unit}` : "";
    valEl.textContent = isDisabled ? "—" : `${Math.round(cur)}${suffix}`;
  }

  function setValue(v, fire = true) {
    cur = clamp(Number(v) || 0);
    paint();
    if (fire) {
      onInput?.(cur);
      onChange?.(cur);
    }
  }

  function commitGesture() {
    onDragEnd?.(cur);
    onChange?.(cur);
  }

  function onPointerDown(ev) {
    if (isDisabled) return;
    dragging = true;
    startY = ev.clientY;
    startVal = cur;
    onDragStart?.();
    dial.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const span = max - min || 1;
    const delta = (startY - ev.clientY) * (span / 120);
    cur = clamp(startVal + delta);
    paint();
    onInput?.(cur);
  }

  function onPointerUp(ev) {
    if (!dragging) return;
    dragging = false;
    try {
      dial.releasePointerCapture(ev.pointerId);
    } catch (_) { /* noop */ }
    commitGesture();
  }

  dial.addEventListener("pointerdown", onPointerDown);
  dial.addEventListener("pointermove", onPointerMove);
  dial.addEventListener("pointerup", onPointerUp);
  dial.addEventListener("pointercancel", onPointerUp);
  dial.addEventListener("wheel", (ev) => {
    if (isDisabled) return;
    ev.preventDefault();
    if (!wheelCommitTimer) onDragStart?.();
    const step = (max - min) / 100 || 1;
    cur = clamp(cur + (ev.deltaY < 0 ? step : -step));
    paint();
    onInput?.(cur);
    clearTimeout(wheelCommitTimer);
    wheelCommitTimer = setTimeout(() => {
      wheelCommitTimer = null;
      commitGesture();
    }, 400);
  }, { passive: false });

  paint();

  return {
    setValue(v, fire = false) {
      setValue(v, fire);
    },
    setDisabled(on) {
      isDisabled = !!on;
      wrap.classList.toggle("off", isDisabled);
      paint();
    },
    isDragging() {
      return dragging;
    },
    getValue() {
      return cur;
    },
  };
}
