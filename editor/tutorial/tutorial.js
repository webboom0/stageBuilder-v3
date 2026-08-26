(() => {
  const links = [...document.querySelectorAll('#side-nav a[href^="#"]')];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  function setActive(id) {
    links.forEach((a) => {
      a.classList.toggle('is-on', a.getAttribute('href') === `#${id}`);
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
})();
