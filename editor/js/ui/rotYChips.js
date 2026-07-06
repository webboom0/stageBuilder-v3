import {
  GROUP_ROT_Y_OPTIONS,
  normalizeRotYDeg,
} from "../showcontrol/groupSegments.js";

/** 그룹·속성 패널 공통 — Y축 30° 회전 칩 */
export function mountRotYChips(host, currentDeg, onPick) {
  if (!host) return;
  host.innerHTML = "";
  const cur = normalizeRotYDeg(currentDeg);
  GROUP_ROT_Y_OPTIONS.forEach((deg) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sb-chip" + (cur === deg ? " on cy" : "");
    b.textContent = `${deg}°`;
    b.style.cssText =
      "min-width:38px;padding:3px 6px;font-size:10px;justify-content:center";
    b.onclick = (e) => {
      e.stopPropagation();
      onPick(deg);
    };
    host.appendChild(b);
  });
}
