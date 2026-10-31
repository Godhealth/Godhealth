/* Public UI only: no lead capture, auth, webhook, email or payment mutations. */
(() => {
  const toggle = document.querySelector('[data-gh-menu-toggle]');
  const nav = document.querySelector('[data-gh-nav]');
  const setMenu = (open) => {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.dataset.open = String(open);
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav?.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.gh-header')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
      document.querySelectorAll('.gh-nav details[open]').forEach((item) => { item.open = false; });
    }
  });
  // Optional marketing attribution is stored and forwarded only after consent.
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid'];
  const current = new URLSearchParams(window.location.search);
  const storeKey = 'godhealth_public_attribution_v1';
  const attributionLinks = Array.from(document.querySelectorAll('a[data-gh-attribution]'));
  const destinations = new Map(attributionLinks.map(link => [link, link.getAttribute('href')]));
  const applyAttribution = () => {
    const accepted = window.GodHealthConsent?.get().marketing === true;
    let saved = {};
    if (accepted) {
      try { saved = JSON.parse(sessionStorage.getItem(storeKey) || '{}'); } catch { saved = {}; }
      allowed.forEach(key => { if (current.has(key)) saved[key] = current.get(key).slice(0,500); });
      try { sessionStorage.setItem(storeKey, JSON.stringify(saved)); } catch { /* Storage may be disabled. */ }
    } else {
      try { sessionStorage.removeItem(storeKey); } catch { /* Optional data stays unused. */ }
    }
    attributionLinks.forEach(link => {
      const destination = new URL(destinations.get(link), location.href);
      if (!['www.godhealth.org', 'godhealth.org', 'blueprint.godhealth.org', 'sales.godhealth.org', 'calendly.com'].includes(destination.hostname)) return;
      if (accepted) allowed.forEach(key => { if (saved[key] && !destination.searchParams.has(key)) destination.searchParams.set(key, saved[key]); });
      link.href = destination.href;
    });
  };
  applyAttribution();
  document.addEventListener('gh:consent-change', applyAttribution);
  // Use an already-installed analytics container, if any. No new pixel or duplicate Lead event.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-gh-event]');
    if (!link || window.GodHealthConsent?.get().analytics !== true || !Array.isArray(window.dataLayer)) return;
    window.dataLayer.push({ event: link.dataset.ghEvent, gh_location: window.location.pathname, gh_cta_label: link.textContent.trim(), gh_section: link.closest('section')?.id || (link.closest('header') ? 'header' : link.closest('footer') ? 'footer' : 'page'), gh_destination: new URL(link.href).origin + new URL(link.href).pathname });
  });
})();
// Subtle viewport reveals; content stays visible without JavaScript.
(() => {
 if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('gh-visible'); observer.unobserve(entry.target); }
 }), {threshold: 0.06});
 document.querySelectorAll('.gh-section-heading,.gh-trinity article,.gh-lifestyle-card,.gh-assessment-panel,.gh-mindset-card').forEach(element => { element.classList.add('gh-reveal'); observer.observe(element); });
})();
