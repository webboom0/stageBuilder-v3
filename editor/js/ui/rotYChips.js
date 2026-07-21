import {
  normalizeRotYDeg,
} from "../showcontrol/groupSegments.js";

/** 반시계(양수): 0 → 180 */
const ROT_Y_CCW = [0, 30, 60, 90, 120, 150, 180];
/** 시계(음수): 0 → −180 — 키프레임 보간이 같은 방향으로 돌지 않도록 부호 유지 */
const ROT_Y_CW = [0, -30, -60, -90, -120, -150, -180];

function injectRotYChipStyles() {
  if (document.getElementById("sb-roty-chips-css")) return;
  const style = document.createElement("style");
  style.id = "sb-roty-chips-css";
  style.textContent = `
    .sb-roty-wrap{ display:flex; flex-direction:column; gap:6px; width:100%; }
    .sb-roty-dir{ display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
    .sb-roty-dir .sb-chip{ min-width:72px; padding:3px 8px; font-size:10px; justify-content:center; }
    .sb-roty-dir .sb-chip.on{ font-weight:700; }
    .sb-roty-chips{ display:flex; flex-wrap:wrap; gap:4px; }
    .sb-roty-chips .sb-chip{ min-width:42px; padding:3px 6px; font-size:10px; justify-content:center; }
  `;
  document.head.appendChild(style);
}

function inferModeFromDeg(deg) {
  const n = normalizeRotYDeg(deg);
  return n < 0 ? "cw" : "ccw";
}

function optionsForMode(mode) {
  return mode === "cw" ? ROT_Y_CW : ROT_Y_CCW;
}

/** 칩 라벨 */
export function formatRotYChipLabel(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n) || n === 0) return "0°";
  return `${n}°`;
}

/**
 * 그룹·속성 패널 공통 — Y축 30° 회전 칩
 * 시계/반시계로 부호가 다른 각도를 고름 (보간 방향이 반대로 보이게 −30을 330으로 바꾸지 않음)
 */
export function mountRotYChips(host, currentDeg, onPick) {
  if (!host) return;
  injectRotYChipStyles();

  const curNorm = normalizeRotYDeg(currentDeg);
  let mode = host.dataset.rotMode || inferModeFromDeg(currentDeg);
  if (mode !== "cw" && mode !== "ccw") {
    mode = inferModeFromDeg(currentDeg);
  }
  // 구버전 pos/neg 호환
  if (mode === "pos") mode = "ccw";
  if (mode === "neg") mode = "cw";
  host.dataset.rotMode = mode;

  host.innerHTML = "";
  host.classList.add("sb-roty-wrap");

  const dirRow = document.createElement("div");
  dirRow.className = "sb-roty-dir";

  const mkDirBtn = (id, label, title) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sb-chip" + (mode === id ? " on cy" : "");
    b.textContent = label;
    b.title = title;
    b.onclick = (e) => {
      e.stopPropagation();
      host.dataset.rotMode = id;
      mountRotYChips(host, currentDeg, onPick);
    };
    return b;
  };

  dirRow.append(
    mkDirBtn("cw", "시계방향", "위에서 볼 때 시계 (0 → −180°)"),
    mkDirBtn("ccw", "반시계방향", "위에서 볼 때 반시계 (0 → 180°)"),
  );
  host.appendChild(dirRow);

  const chipsRow = document.createElement("div");
  chipsRow.className = "sb-roty-chips";

  optionsForMode(mode).forEach((deg) => {
    const b = document.createElement("button");
    b.type = "button";
    const norm = normalizeRotYDeg(deg);
    b.className = "sb-chip" + (curNorm === norm ? " on cy" : "");
    b.textContent = formatRotYChipLabel(deg);
    b.onclick = (e) => {
      e.stopPropagation();
      host.dataset.rotMode = mode;
      // 부호 유지 (−30). 0~360으로 바꾸면 보간이 같은 방향으로 돎
      onPick(normalizeRotYDeg(deg));
    };
    chipsRow.appendChild(b);
  });

  host.appendChild(chipsRow);
}
