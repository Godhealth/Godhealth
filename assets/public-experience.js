/* Readable scroll enhancements. No dependencies, tracking, data capture or app changes. */
(() => {
  const root = document.querySelector('.gh-experience');
  if (!root) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const photos = Array.from(root.querySelectorAll('[data-ge-parallax] img'));
  const selectors = '.gw-heading,.gw-focus-card,.gw-foundations article,.gw-offer-list>li,.gh-scripture,.ge-start-card,.ge-schedule-card,.gc-personal-plans article,.gc-heading,.gc-foundations article,.gc-support-grid article,.gc-lifestyle-grid article,.gc-steps article,.gh-section-heading,.gh-resource-card,.gh-route-card,.gh-timeline article,.gh-full-story,.gh-guide-coaching,.gx-hero-stage,.gh-photo-grid figure,.gc-plan-path,.gc-coach-details article';
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
      element.style.setProperty('--ge-delay', `${Math.min(siblings.indexOf(element), 3) * 85}ms`);
      element.classList.add('ge-reveal');
      observer.observe(element);
    });
  }
  // Run CTA sheen only while the action is in view. Never change its destination.
  if ('IntersectionObserver' in window) {
    const actionObserver = new IntersectionObserver(entries => entries.forEach(({target, isIntersecting}) => {
      target.classList.toggle('ge-action-visible', isIntersecting);
    }), {threshold:0.2});
    root.querySelectorAll('.gh-call-button').forEach(button => actionObserver.observe(button));
  }
  const steps = Array.from(root.querySelectorAll('.gw-offer-list>li'));
  let activeStep;
  let scheduled = false;
  const paint = () => {
    scheduled = false;
    let nextStep;
    let distance = Infinity;
    steps.forEach(step => {
      const rect = step.getBoundingClientRect();
      if (rect.top > innerHeight || rect.bottom < 90) return;
      const centerDistance = Math.abs(rect.top + rect.height / 2 - innerHeight * 0.54);
      if (centerDistance < distance) { distance = centerDistance; nextStep = step; }
    });
    if (nextStep !== activeStep) {
      activeStep?.classList.remove('ge-in-focus');
      nextStep?.classList.add('ge-in-focus');
      activeStep = nextStep;
    }
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
  document.addEventListener('visibilitychange', () => root.classList.toggle('ge-page-inactive', document.hidden));
  motion.addEventListener('change', () => {
    if (motion.matches) {
      observer?.disconnect();
      targets.forEach(element => element.classList.remove('ge-reveal', 'ge-visible'));
    }
    schedule();
  });
  paint();
})();
