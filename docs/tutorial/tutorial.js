(() => {
  const links = [...document.querySelectorAll('#side-nav a[href^="#"]')];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  /** 3차 섹션 → 2차 개요 섹션 */
  const CHILD_TO_PARENT = {
    'char-track': 'timeline-characters',
    'char-props': 'timeline-characters',
    'char-segments': 'timeline-characters',
    'char-group': 'timeline-characters',
    'stage-track': 'timeline-stage',
    'stage-props': 'timeline-stage',
    'light-track': 'timeline-light',
    'light-props': 'timeline-light',
    'audio-track': 'timeline-audio',
  };

  function setActive(id) {
    const parentId = CHILD_TO_PARENT[id];
    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').slice(1);
      a.classList.toggle('is-on', href === id);
      a.classList.toggle('is-parent', !!parentId && href === parentId && href !== id);
    });
  }

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]?.target?.id) setActive(visible[0].target.id);
    },
    { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.4, 0.7] },
  );
  sections.forEach((el) => io.observe(el));

  links.forEach((a) => {
    a.addEventListener('click', () => {
      const id = (a.getAttribute('href') || '').slice(1);
      if (id) setActive(id);
    });
  });

  if (location.hash) setActive(location.hash.slice(1));
  else if (sections[0]) setActive(sections[0].id);

  document.querySelectorAll('.tutorial-figure').forEach((fig) => {
    const img = fig.querySelector('img');
    if (!img) return;
    const markMissing = () => fig.classList.add('is-missing');
    img.addEventListener('error', markMissing);
    if (img.complete && img.naturalWidth === 0) markMissing();
  });

  const layout = document.querySelector('.layout');
  const foldBtn = document.getElementById('side-fold');
  if (layout && foldBtn) {
    const icon = foldBtn.querySelector('i');
    const applyFold = (collapsed) => {
      layout.classList.toggle('is-side-collapsed', collapsed);
      icon?.classList.toggle('fa-chevron-left', !collapsed);
      icon?.classList.toggle('fa-chevron-right', collapsed);
      const label = collapsed ? '목차 펼치기' : '목차 접기';
      foldBtn.title = label;
      foldBtn.setAttribute('aria-label', label);
      foldBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      try {
        localStorage.setItem('sb-tutorial-side-collapsed', collapsed ? '1' : '0');
      } catch { /* ignore */ }
    };
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('sb-tutorial-side-collapsed') === '1';
    } catch { /* ignore */ }
    applyFold(collapsed);
    foldBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      applyFold(collapsed);
    });
  }
})();
