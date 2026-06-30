const HIDE_DELAY_MS = 150;

function positionSubmenu(title, submenu) {
  const { top, right } = title.dom.getBoundingClientRect();
  const { paddingTop } = getComputedStyle(title.dom);
  submenu.setLeft(`${right - 4}px`);
  submenu.setTop(`${top - parseFloat(paddingTop)}px`);
  submenu.setStyle("max-height", [`calc(100vh - ${top}px)`]);
}

function hideSiblingSubmenus(menuContainer, activeSubmenu) {
  if (!menuContainer) return;
  menuContainer.dom.querySelectorAll(".options--submenu").forEach((el) => {
    if (el !== activeSubmenu.dom) {
      el.style.display = "none";
    }
  });
}

function hasVisibleSubmenu(menuContainer) {
  if (!menuContainer) return false;
  return Array.from(menuContainer.dom.querySelectorAll(".options--submenu")).some(
    (el) => getComputedStyle(el).display !== "none",
  );
}

/**
 * 2차 항목 → 3차 서브메뉴 hover 연결 (갭·mouseout 깜빡임 방지)
 */
export function bindMenubarSubmenu(title, submenu, menuContainer) {
  let hideTimer = null;

  const show = () => {
    clearTimeout(hideTimer);
    hideSiblingSubmenus(menuContainer, submenu);
    menuContainer?.addClass("submenu-active");
    positionSubmenu(title, submenu);
    submenu.setDisplay("block");
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      submenu.setDisplay("none");
      if (!hasVisibleSubmenu(menuContainer)) {
        menuContainer?.removeClass("submenu-active");
      }
    }, HIDE_DELAY_MS);
  };

  title.dom.addEventListener("mouseenter", show);
  title.dom.addEventListener("mouseleave", scheduleHide);
  submenu.dom.addEventListener("mouseenter", show);
  submenu.dom.addEventListener("mouseleave", scheduleHide);
}
