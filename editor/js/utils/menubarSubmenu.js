const HIDE_DELAY_MS = 150;

function positionSubmenu(title, submenu) {
  const { top, right } = title.dom.getBoundingClientRect();
  const { paddingTop } = getComputedStyle(title.dom);
  submenu.setLeft(`${right - 4}px`);
  submenu.setTop(`${top - parseFloat(paddingTop)}px`);
  submenu.setStyle("max-height", [`calc(100vh - ${top}px)`]);
}

/**
 * 1차 메뉴 항목 → 2차 서브메뉴 hover 연결 (갭·mouseout 깜빡임 방지)
 */
export function bindMenubarSubmenu(title, submenu, menuContainer) {
  let hideTimer = null;

  const show = () => {
    clearTimeout(hideTimer);
    menuContainer?.addClass("submenu-active");
    positionSubmenu(title, submenu);
    submenu.setDisplay("block");
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      submenu.setDisplay("none");
      menuContainer?.removeClass("submenu-active");
    }, HIDE_DELAY_MS);
  };

  title.dom.addEventListener("mouseenter", show);
  title.dom.addEventListener("mouseleave", scheduleHide);
  submenu.dom.addEventListener("mouseenter", show);
  submenu.dom.addEventListener("mouseleave", scheduleHide);
}
