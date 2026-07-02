/**
 * 왼쪽 세로 아이콘 레일 + 균등 높이 패널 도크
 */
import { createPanelRail } from "./PanelRail.js";

export function createLeftPanelRail(root) {
  return createPanelRail(root, { side: "left", distribution: "equal" });
}
