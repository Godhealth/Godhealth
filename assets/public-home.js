/* Homepage-only client story carousel. No tracking, lead, account or payment writes. */
(() => {
  document.querySelectorAll('[data-gh-story-carousel]').forEach((root) => {
    const viewport = root.querySelector('[data-gh-story-viewport]');
    const track = root.querySelector('[data-gh-story-track]');
    const pause = root.querySelector('[data-gh-story-pause]');
    const left = root.querySelector('[data-gh-story-left]');
    const right = root.querySelector('[data-gh-story-right]');
    if (!viewport || !track || !pause || !left || !right || track.children.length < 2) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = motion.matches;
    let hovered = false;
    let focused = false;
    let visible = false;
    let moving = false;
    let finishTimer;
    root.classList.add('is-enhanced');
    const updatePause = () => {
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = paused ? 'Resume stories' : 'Pause stories';
    };
    updatePause();
    const hasOpenStory = () => Boolean(root.querySelector('.gw-story-card details[open]'));
    const step = () => track.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0);
    const move = (direction, manual = false) => {
      if (moving || hasOpenStory()) return;
      if (!manual && (paused || hovered || focused || !visible || document.hidden)) return;
      moving = true;
      left.disabled = true;
      right.disabled = true;
      viewport.scrollLeft = 0;
      const distance = step();
      const duration = motion.matches ? 0 : 850;
      // One temporary inert card keeps the row filled during the circular move.
      const clone = (direction === 'right' ? track.lastElementChild : track.firstElementChild).cloneNode(true);
      clone.removeAttribute('data-gh-story');
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(finishTimer);
        track.removeEventListener('transitionend', onEnd);
        track.style.transition = 'none';
        if (direction === 'left') track.append(track.firstElementChild);
        else track.prepend(track.lastElementChild);
        clone.remove();
        track.style.transform = 'translateX(0)';
        moving = false;
        left.disabled = hasOpenStory();
        right.disabled = hasOpenStory();
      };
      const onEnd = (event) => { if (event.target === track && event.propertyName === 'transform') finish(); };
      track.style.transition = 'none';
      if (direction === 'right') {
        track.prepend(clone);
        track.style.transform = `translateX(-${distance}px)`;
      } else track.append(clone);
      // Establish the starting frame before applying the transition.
      track.getBoundingClientRect();
      track.addEventListener('transitionend', onEnd);
      track.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1)`;
      track.style.transform = direction === 'right' ? 'translateX(0)' : `translateX(-${distance}px)`;
      finishTimer = setTimeout(finish, duration + 100);
    };
    pause.addEventListener('click', () => { paused = !paused; updatePause(); });
    left.addEventListener('click', () => move('left', true));
    right.addEventListener('click', () => move('right', true));
    viewport.addEventListener('mouseenter', () => { hovered = true; });
    viewport.addEventListener('mouseleave', () => { hovered = false; });
    viewport.addEventListener('focusin', () => { focused = true; });
    viewport.addEventListener('focusout', (event) => { focused = viewport.contains(event.relatedTarget); });
    viewport.addEventListener('toggle', () => { if (!moving) { left.disabled = hasOpenStory(); right.disabled = hasOpenStory(); } }, true);
    viewport.addEventListener('keydown', (event) => {
      if (event.target.closest('summary,button,a')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? 'left' : 'right', true);
      }
    });
    motion.addEventListener('change', () => { paused = motion.matches; updatePause(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, {threshold: 0.15}).observe(viewport);
    } else visible = true;
    setInterval(() => move('right'), 6500);
  });
})();
