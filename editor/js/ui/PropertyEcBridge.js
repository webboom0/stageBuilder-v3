/**
 * Wraps property .Row elements with ec-row range sliders
 * synced to existing UINumber inputs (vertical drag still works on the number).
 *
 * Layout:
 * - Single value:  [Label] [slider] [input]  (one row)
 * - XYZ group:     [Group label]
 *                  [X] [slider] [input]      (stacked rows)
 *                  [Y] [slider] [input]
 *                  [Z] [slider] [input]
 */
function parseBounds(input) {
  let min = parseFloat(input.getAttribute("data-ec-min"));
  let max = parseFloat(input.getAttribute("data-ec-max"));
  if (!Number.isFinite(min)) min = -100;
  if (!Number.isFinite(max)) max = 100;

  const val = parseFloat(input.value);
  if (Number.isFinite(val)) {
    if (val < min) min = val - Math.abs(val) * 0.5 - 10;
    if (val > max) max = val + Math.abs(val) * 0.5 + 10;
  }
  return { min, max };
}

function syncRangeToNumber(range, input) {
  const v = parseFloat(input.value);
  if (!Number.isFinite(v)) return;
  const { min, max } = parseBounds(input);
  range.min = String(min);
  range.max = String(max);
  range.value = String(Math.min(max, Math.max(min, v)));
}

const rangeByInput = new WeakMap();

function getRangeForInput(input) {
  const linked = rangeByInput.get(input);
  if (linked && linked.isConnected) return linked;

  const row = input.closest(".ec-row");
  if (row) {
    const range = row.querySelector("input[data-ec-range]");
    if (range) return range;
  }

  return null;
}

export function syncEcRanges(root) {
  if (!root) return;
  root.querySelectorAll("input.Number").forEach((input) => {
    const range = getRangeForInput(input);
    if (range) syncRangeToNumber(range, input);
  });
}

function createRange(input) {
  const range = document.createElement("input");
  range.type = "range";
  range.className = "acc";
  range.setAttribute("data-ec-range", "1");
  const step = parseFloat(input.step) || 0.01;
  range.step = String(step);
  syncRangeToNumber(range, input);
  return range;
}

function bindRange(range, input) {
  rangeByInput.set(input, range);
  range.addEventListener("input", () => {
    input.value = range.value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.addEventListener("change", () => syncRangeToNumber(range, input));
  input.addEventListener("input", () => syncRangeToNumber(range, input));
}

function getRowLabel(row) {
  return row.querySelector(".Text, .Label");
}

function unenhanceRow(row) {
  row.querySelectorAll("input[data-ec-range]").forEach((r) => r.remove());
  row.querySelectorAll(".ec-axis").forEach((axis) => {
    const input = axis.querySelector("input.Number");
    if (input) row.appendChild(input);
    axis.remove();
  });
  row.querySelectorAll(".ec-row").forEach((sub) => {
    const input = sub.querySelector("input.Number");
    if (input) row.appendChild(input);
    sub.remove();
  });
  row.classList.remove("ec-row", "ec-row-group", "ec-row-xyz");
  row.querySelectorAll(".ec-row-title, .ec-row-group-label").forEach((el) => {
    el.classList.remove("ec-row-title", "ec-row-group-label");
  });
  row.querySelectorAll("input.Number").forEach((input) => {
    input.classList.remove("ec-val");
    input.style.width = "";
    input.style.minWidth = "";
  });
  delete row.dataset.ecEnhanced;
}

function enhanceRow(row) {
  if (row.dataset.ecEnhanced === "3") return;
  if (row.dataset.ecEnhanced) {
    unenhanceRow(row);
  }

  const numbers = [...row.querySelectorAll("input.Number")];
  if (!numbers.length) return;

  row.dataset.ecEnhanced = "3";
  const label = getRowLabel(row);
  const axes = ["X", "Y", "Z", "W"];

  if (numbers.length === 1) {
    const input = numbers[0];
    row.classList.add("ec-row");
    const range = createRange(input);
    input.classList.add("ec-val");
    if (label) {
      const lbl = document.createElement("label");
      lbl.textContent = label.textContent;
      label.replaceWith(lbl);
    }
    row.insertBefore(range, input);
    bindRange(range, input);
    return;
  }

  row.classList.add("ec-row-group");
  if (label) {
    label.classList.add("ec-row-group-label");
  }

  numbers.forEach((input, i) => {
    const sub = document.createElement("div");
    sub.className = "ec-row";
    const subLabel = document.createElement("label");
    subLabel.textContent = axes[i] || String(i + 1);
    const range = createRange(input);
    input.classList.add("ec-val");
    input.style.width = "";
    input.style.minWidth = "";
    sub.appendChild(subLabel);
    sub.appendChild(range);
    sub.appendChild(input);
    bindRange(range, input);
    row.appendChild(sub);
  });
}

function scan(root) {
  if (!root) return;
  root.querySelectorAll(".Row").forEach(enhanceRow);
}

export function initPropertyEcBridge(root, editor) {
  if (!root) return;

  const resync = () => syncEcRanges(root);

  scan(root);
  resync();

  const observer = new MutationObserver(() => {
    scan(root);
    resync();
  });
  observer.observe(root, { childList: true, subtree: true });

  if (editor?.signals) {
    editor.signals.objectChanged?.add(resync);
    editor.signals.objectSelected?.add(resync);
    editor.signals.refreshSidebarObject3D?.add(resync);
  }

  return observer;
}
