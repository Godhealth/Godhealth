/* Readable scroll enhancements. No dependencies, tracking, data capture or app changes. */
(() => {
  const root = document.querySelector('.gh-experience');
  if (!root) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const progress = root.querySelector('[data-ge-progress]');
  const photos = Array.from(root.querySelectorAll('[data-ge-parallax] img'));
  const selectors = '.gw-heading,.gw-focus-card,.gw-foundations article,.gw-offer-list>li,.gh-scripture,.gw-offer-aside figure,.gc-heading,.gc-support-grid article,.gc-lifestyle-grid article,.gc-steps article';
  const targets = Array.from(root.querySelectorAll(selectors));
  let observer;
  if ('IntersectionObserver' in window && !motion.matches) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach(({target, isIntersecting}) => {
        if (!isIntersecting) return;
        target.classList.add('ge-visible');
        observer.unobserve(target);
      });
    }, {threshold:0.06, rootMargin:'0px 0px -18px 0px'});
    targets.forEach((element) => {
      // Do not delay content already in view or a direct anchor destination.
      if (element.getBoundingClientRect().top < innerHeight - 20) return;
      const siblings = Array.from(element.parentElement.children);
      element.style.setProperty('--ge-delay', `${Math.min(siblings.indexOf(element), 3) * 65}ms`);
      element.classList.add('ge-reveal');
      observer.observe(element);
    });
  }
  let scheduled = false;
  const paint = () => {
    scheduled = false;
    const height = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${height > 0 ? Math.max(0, Math.min(1, scrollY / height)) : 0})`;
    photos.forEach((image) => {
      if (motion.matches || innerWidth < 900) { image.style.removeProperty('object-position'); return; }
      const rect = image.parentElement.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > innerHeight + 100) return;
      const offset = Math.max(-18, Math.min(18, (innerHeight / 2 - rect.top - rect.height / 2) * 0.045));
      image.style.objectPosition = `50% calc(50% + ${offset.toFixed(1)}px)`;
    });
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } };
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  motion.addEventListener('change', () => {
    if (motion.matches) {
      observer?.disconnect();
      targets.forEach(element => element.classList.remove('ge-reveal', 'ge-visible'));
    }
    schedule();
  });
  paint();
})();
