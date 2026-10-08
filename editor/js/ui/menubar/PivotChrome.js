import { pivotPortalUrl, IS_LOCAL_DEV } from '../../config/app-config.js';
import { appConfirm } from '../AppDialog.js';

/**
 * Slim app header above the menubar (Pivot PB style, no search).
 * Left: logo + project title · Right: user text · notify · pivot home · avatar
 *
 * @param {HTMLElement} host
 * @param {{ onGoHome?: () => void | Promise<void>, onBrandClick?: () => void }} [opts]
 */
export function mountPivotChrome(host, opts = {}) {
  host.classList.add('sb-app-header');
  host.innerHTML = `
    <div class="sb-app-header__left">
      <a class="sb-app-header__logo" href="javascript:void(0)" data-act="brand" title="StageBuilder" aria-label="StageBuilder">
        <img src="images/stagebuilder-logo.png" width="22" height="22" alt="StageBuilder" draggable="false" />
      </a>
      <div class="sb-app-header__title" id="sb-project-title" data-role="project-title" title="">프로젝트</div>
    </div>
    <div class="sb-app-header__right">
      <div class="sb-app-header__user" data-role="user-block">
        <div class="sb-app-header__user-name" data-role="user-name">—</div>
        <div class="sb-app-header__user-email" data-role="user-email"></div>
      </div>
      <button type="button" class="sb-app-header__icon-btn" data-act="notify" title="알림" aria-label="알림">
        <img class="sb-app-header__icon-img sb-app-header__icon-img--bell" src="images/notify-bell.png" alt="" draggable="false" />
        <span class="sb-app-header__badge" data-role="badge" hidden>0</span>
      </button>
      <button type="button" class="sb-app-header__icon-btn" data-act="home" title="Pivot 메인" aria-label="Pivot 메인으로 이동">
        <img class="sb-app-header__icon-img sb-app-header__icon-img--home" src="images/pivot-home.png" alt="" draggable="false" />
      </button>
      <button type="button" class="sb-app-header__avatar" data-act="profile" title="계정" aria-label="계정" aria-haspopup="true" aria-expanded="false">
        <span class="sb-app-header__avatar-fallback" data-role="initial">?</span>
        <img class="sb-app-header__avatar-img" data-role="avatar-img" alt="" hidden referrerpolicy="no-referrer" />
      </button>
      <div class="sb-app-header__menu" data-role="profile-menu" hidden>
        <div class="sb-app-header__menu-user" data-role="menu-user">로그인 정보 없음</div>
        <a class="sb-app-header__menu-item" data-act="account" href="#">계정 설정</a>
        <button type="button" class="sb-app-header__menu-item" data-act="logout">로그아웃</button>
      </div>
    </div>
  `;

  const titleEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="project-title"]'));
  const badgeEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="badge"]'));
  const nameEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="user-name"]'));
  const emailEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="user-email"]'));
  const menuUserEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="menu-user"]'));
  const initialEl = /** @type {HTMLElement} */ (host.querySelector('[data-role="initial"]'));
  const imgEl = /** @type {HTMLImageElement} */ (host.querySelector('[data-role="avatar-img"]'));
  const menu = /** @type {HTMLElement} */ (host.querySelector('[data-role="profile-menu"]'));
  const profileBtn = /** @type {HTMLButtonElement} */ (host.querySelector('[data-act="profile"]'));

  function closeMenu() {
    menu.hidden = true;
    profileBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menu.hidden = false;
    profileBtn.setAttribute('aria-expanded', 'true');
  }

  /**
   * PB `/pb-api` 응답은 snake_case일 수 있음 — PB 프론트는 keysToCamelCase 후 avatarUrl 사용.
   * @param {any} raw
   */
  function normalizeAccount(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.account_id ?? raw.accountId;
    const name = raw.name ?? raw.display_name ?? raw.displayName;
    const email = raw.email;
    const avatarRaw = [
      raw.avatarUrl,
      raw.avatar_url,
      raw.picture,
      raw.photoURL,
      raw.photoUrl,
      raw.photo,
      raw.imageUrl,
      raw.image_url,
      raw.profileImage,
      raw.profile_image,
      raw.avatar,
    ].find((v) => typeof v === 'string' && String(v).trim());
    /** @type {{ id?: string, name?: string, email?: string, avatarUrl?: string }} */
    const out = {};
    if (id != null) out.id = String(id);
    if (name != null) out.name = String(name);
    if (email != null) out.email = String(email);
    if (avatarRaw) out.avatarUrl = resolveAvatarSrc(String(avatarRaw).trim());
    return out;
  }

  /** PB `uh`: http/data/blob/`/` 절대경로는 유지, 상대경로는 `/pb-api/` 접두 */
  function resolveAvatarSrc(raw) {
    if (!raw) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
    return `/pb-api/${raw.replace(/^\//, '')}`;
  }

  function showAvatarFallback() {
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
    initialEl.hidden = false;
  }

  function showAvatarImage(src) {
    imgEl.onload = () => {
      imgEl.hidden = false;
      initialEl.hidden = true;
    };
    imgEl.onerror = () => {
      showAvatarFallback();
    };
    imgEl.src = src;
    // 캐시 hit 시 onload가 안 올 수 있음
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      imgEl.hidden = false;
      initialEl.hidden = true;
    } else {
      // 로딩 중에도 이니셜은 잠시 보이게 유지
      imgEl.hidden = true;
      initialEl.hidden = false;
    }
  }

  /** @param {null | { id?: string, name?: string, email?: string, avatarUrl?: string }} next */
  function applyAccount(next) {
    const name = String(next?.name || '').trim();
    const email = String(next?.email || '').trim();
    if (name || email) {
      nameEl.textContent = name || '사용자';
      emailEl.textContent = email;
      emailEl.hidden = !email;
      menuUserEl.textContent = name ? (email ? `${name} · ${email}` : name) : email;
      const ch = (name || email).slice(0, 1);
      initialEl.textContent = /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
    } else {
      nameEl.textContent = IS_LOCAL_DEV ? '로컬 개발' : '미로그인';
      emailEl.textContent = IS_LOCAL_DEV ? 'pb 로그인 없음' : '';
      emailEl.hidden = !IS_LOCAL_DEV;
      menuUserEl.textContent = '로그인 정보 없음';
      initialEl.textContent = '?';
    }

    const src = String(next?.avatarUrl || '').trim();
    if (src) showAvatarImage(src);
    else showAvatarFallback();
  }

  async function refreshAccount() {
    try {
      const cached = localStorage.getItem('pb_current_account');
      if (cached) {
        try {
          const normalized = normalizeAccount(JSON.parse(cached));
          if (normalized) applyAccount(normalized);
        } catch { /* ignore */ }
      }
      const token = localStorage.getItem('pb_token');
      if (!token) {
        if (!cached) applyAccount(null);
        return;
      }
      const res = await fetch('/pb-api/accounts/me', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) applyAccount(null);
        return;
      }
      const data = await res.json();
      const raw = data?.account || data;
      const next = normalizeAccount(raw);
      if (next) {
        // PB와 동일 키(avatarUrl)로 캐시해 다른 페이지·재진입과 맞춤
        try {
          const merged = { ...(raw && typeof raw === 'object' ? raw : {}), ...next };
          localStorage.setItem('pb_current_account', JSON.stringify(merged));
        } catch { /* ignore */ }
        applyAccount(next);
        void refreshUnread(next.id);
      }
    } catch {
      // local / no PB API
    }
  }

  async function refreshUnread(accountId) {
    if (!accountId) {
      badgeEl.hidden = true;
      return;
    }
    try {
      const token = localStorage.getItem('pb_token');
      if (!token) return;
      const res = await fetch(`/pb-api/notifications/?to_account_id=${encodeURIComponent(accountId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) return;
      const list = await res.json();
      const items = Array.isArray(list) ? list : (list?.items || list?.notifications || []);
      const unread = items.filter((n) => !n?.read && !n?.isRead).length;
      if (unread > 0) {
        badgeEl.hidden = false;
        badgeEl.textContent = unread > 99 ? '99+' : String(unread);
      } else {
        badgeEl.hidden = true;
      }
    } catch {
      badgeEl.hidden = true;
    }
  }

  host.querySelector('[data-act="brand"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    opts.onBrandClick?.();
  });

  host.querySelector('[data-act="notify"]')?.addEventListener('click', () => {
    closeMenu();
    window.location.href = pivotPortalUrl('pb');
  });

  host.querySelector('[data-act="home"]')?.addEventListener('click', () => {
    closeMenu();
    void (async () => {
      if (opts.onGoHome) {
        await opts.onGoHome();
        return;
      }
      const ok = await appConfirm({
        title: 'Pivot 메인으로 이동할까요?',
        message: '저장하지 않은 작업은 사라질 수 있습니다.',
        confirmLabel: '이동',
        cancelLabel: '취소',
      });
      if (ok) window.location.href = pivotPortalUrl('home');
    })();
  });

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  host.querySelector('[data-act="account"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenu();
    window.location.href = pivotPortalUrl('account');
  });

  host.querySelector('[data-act="logout"]')?.addEventListener('click', () => {
    closeMenu();
    try {
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_current_account');
    } catch { /* ignore */ }
    window.location.href = pivotPortalUrl('logout');
  });

  document.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!host.contains(e.target)) closeMenu();
  });

  void refreshAccount();

  return {
    /** @param {string} [name] */
    setProjectTitle(name) {
      const label = String(name || '').trim() || '프로젝트';
      titleEl.textContent = label;
      titleEl.title = label;
    },
    refreshAccount,
  };
}
