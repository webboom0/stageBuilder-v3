/**
 * 오른쪽 세로 아이콘 레일 + 토글 패널 도크
 */
import { createPanelRail } from "./PanelRail.js";

export function createRightPanelRail(root) {
  return createPanelRail(root, { side: "right", distribution: "resizable" });
}
