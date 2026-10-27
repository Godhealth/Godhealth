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
  document.querySelectorAll('[data-gh-video]').forEach((frame) => {
    const video = frame.querySelector('video');
    const launch = frame.querySelector('[data-gh-video-play]');
    if (!video || !launch) return;
    launch.addEventListener('click', async () => {
      video.controls = true;
      video.muted = false;
      video.volume = 1;
      try { await video.play(); launch.hidden = true; }
      catch { launch.hidden = false; }
    });
    video.addEventListener('ended', () => { launch.hidden = false; });
  });
  // Carry campaign attribution to existing destinations. Never forward email, name or other PII.
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid'];
  const current = new URLSearchParams(window.location.search);
  const storeKey = 'godhealth_public_attribution_v1';
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(storeKey) || '{}'); } catch { saved = {}; }
  allowed.forEach((key) => { if (current.has(key)) saved[key] = current.get(key).slice(0, 500); });
  try { sessionStorage.setItem(storeKey, JSON.stringify(saved)); } catch { /* Storage may be disabled. */ }
  document.querySelectorAll('a[data-gh-attribution]').forEach((link) => {
    const destination = new URL(link.href);
    if (!['www.godhealth.org', 'godhealth.org', 'blueprint.godhealth.org', 'sales.godhealth.org', 'calendly.com'].includes(destination.hostname)) return;
    allowed.forEach((key) => { if (saved[key] && !destination.searchParams.has(key)) destination.searchParams.set(key, saved[key]); });
    link.href = destination.href;
  });
  // Use an already-installed analytics container, if any. No new pixel or duplicate Lead event.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-gh-event]');
    if (!link || !Array.isArray(window.dataLayer)) return;
    window.dataLayer.push({ event: link.dataset.ghEvent, gh_location: window.location.pathname, gh_destination: new URL(link.href).origin + new URL(link.href).pathname });
  });
})();
