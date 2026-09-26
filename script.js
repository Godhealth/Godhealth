const heroSection = document.querySelector('.hero');
const proofSection = document.querySelector('#proof');
if (heroSection && proofSection) heroSection.insertAdjacentElement('afterend', proofSection);

const items = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
items.forEach((item) => observer.observe(item));

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
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    toggle.focus();
  });
});

document.querySelectorAll('[data-hero-video]').forEach((frame) => {
  const video = frame.querySelector('[data-video]');
  const unmute = frame.querySelector('[data-video-unmute]');
  const play = frame.querySelector('[data-video-play]');
  const fullscreen = frame.querySelector('[data-video-fullscreen]');
  const progress = frame.querySelector('[data-video-progress]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!video) return;

  const syncPlayback = () => {
    frame.classList.toggle('video-paused', video.paused);
    if (play) {
      play.textContent = video.paused ? '▶' : 'Ⅱ';
      play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
    }
  };

  const syncProgress = () => {
    if (!progress || !Number.isFinite(video.duration) || video.duration <= 0) return;
    progress.style.transform = `scaleX(${Math.min(video.currentTime / video.duration, 1)})`;
  };

  const tryPlay = () => {
    const promise = video.play();
    if (promise?.catch) promise.catch(() => syncPlayback());
  };

  video.defaultMuted = true;
  video.muted = true;
  video.volume = 1;
  if (!reduceMotion) tryPlay();

  unmute?.addEventListener('click', () => {
    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;
    frame.classList.add('sound-enabled');
    tryPlay();
  });

  play?.addEventListener('click', () => {
    if (video.paused) tryPlay();
    else video.pause();
  });

  fullscreen?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frame.requestFullscreen) await frame.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch (error) {
      video.controls = true;
    }
  });

  video.addEventListener('click', () => {
    if (video.paused) tryPlay();
    else video.pause();
  });
  video.addEventListener('play', syncPlayback);
  video.addEventListener('pause', syncPlayback);
  video.addEventListener('timeupdate', syncProgress);
  video.addEventListener('loadedmetadata', syncProgress);
  syncPlayback();
});

document.querySelectorAll('[data-stories]').forEach((stories) => {
  const tabs = [...stories.querySelectorAll('[data-story]')];
  const panels = [...stories.querySelectorAll('[data-story-panel]')];
  const currentLabel = stories.querySelector('[data-story-current]');
  const previous = stories.querySelector('[data-story-prev]');
  const next = stories.querySelector('[data-story-next]');
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

  const stopAutoplay = () => {
    if (autoplay) window.clearInterval(autoplay);
  };

  const startAutoplay = () => {
    stopAutoplay();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
    autoplay = window.setInterval(() => showStory(current + 1), 15000);
  };

  const selectStory = (index, moveFocus = false) => {
    showStory(index, moveFocus);
    startAutoplay();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStory(index));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      selectStory(current + (event.key === 'ArrowRight' ? 1 : -1), true);
    });
  });

  previous?.addEventListener('click', () => selectStory(current - 1));
  next?.addEventListener('click', () => selectStory(current + 1));
  stories.addEventListener('mouseenter', stopAutoplay);
  stories.addEventListener('mouseleave', startAutoplay);
  stories.addEventListener('focusin', stopAutoplay);
  stories.addEventListener('focusout', (event) => {
    if (!stories.contains(event.relatedTarget)) startAutoplay();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else startAutoplay();
  });
  showStory(0);
  startAutoplay();
});
