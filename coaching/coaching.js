const revealItems = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.1 });
revealItems.forEach((item) => revealObserver.observe(item));

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.querySelectorAll('[data-overflow-menu]').forEach((menu) => {
  const toggle = menu.querySelector('[data-menu-toggle]');
  const panel = menu.querySelector('[data-menu-panel]');
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    menu.classList.toggle('open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('click', (event) => { if (!menu.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
});

document.querySelectorAll('[data-stories]').forEach((stories) => {
  const tabs = [...stories.querySelectorAll('[data-story]')];
  const panels = [...stories.querySelectorAll('[data-story-panel]')];
  const currentLabel = stories.querySelector('[data-story-current]');
  let current = 0;
  let autoplay;

  const showStory = (index, moveFocus = false) => {
    current = (index + panels.length) % panels.length;
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === current;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      if (selected && moveFocus) tab.focus();
    });
    panels.forEach((panel, panelIndex) => {
      const selected = panelIndex === current;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
    if (currentLabel) currentLabel.textContent = String(current + 1).padStart(2, '0');
  };
  const stopAutoplay = () => window.clearInterval(autoplay);
  const startAutoplay = () => {
    stopAutoplay();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
    autoplay = window.setInterval(() => showStory(current + 1), 15000);
  };

  tabs.forEach((tab, index) => tab.addEventListener('click', () => { showStory(index); startAutoplay(); }));
  stories.querySelector('[data-story-prev]')?.addEventListener('click', () => { showStory(current - 1); startAutoplay(); });
  stories.querySelector('[data-story-next]')?.addEventListener('click', () => { showStory(current + 1); startAutoplay(); });
  stories.addEventListener('mouseenter', stopAutoplay);
  stories.addEventListener('mouseleave', startAutoplay);
  stories.addEventListener('focusin', stopAutoplay);
  stories.addEventListener('focusout', startAutoplay);
  document.addEventListener('visibilitychange', () => document.hidden ? stopAutoplay() : startAutoplay());
  showStory(0);
  startAutoplay();
});

document.querySelectorAll('[data-compare]').forEach((comparison) => {
  const range = comparison.querySelector('[data-compare-range]');
  if (!range) return;

  const updateComparison = () => {
    comparison.style.setProperty('--compare-position', `${range.value}%`);
  };

  range.addEventListener('input', updateComparison);
  range.addEventListener('change', updateComparison);
  updateComparison();
});
