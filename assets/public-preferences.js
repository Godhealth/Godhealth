/* First-party preference storage and a user-initiated WhatsApp link. No SDKs. */
(() => {
  const COOKIE = 'gh_cookie_consent';
  const SIX_MONTHS = 60 * 60 * 24 * 180;
  const banner = document.querySelector('[data-gh-cookie-banner]');
  const dialog = document.querySelector('#gh-cookie-dialog');
  const analytics = document.querySelector('[data-gh-cookie-analytics]');
  const marketing = document.querySelector('[data-gh-cookie-marketing]');
  const status = document.querySelector('[data-gh-cookie-status]');
  const whatsapp = document.querySelector('[data-gh-whatsapp]');
  const whatsappToggle = document.querySelector('[data-gh-whatsapp-toggle]');
  const whatsappPanel = document.querySelector('#gh-whatsapp-panel');
  let whatsappOpen = false;
  let previousFocus;
  let consent = null;
  const updateCookieHeight = () => document.body.style.setProperty('--gh-cookie-height', `${banner && !banner.hidden ? banner.getBoundingClientRect().height : 0}px`);
  // The version belongs to the wording in data/public-ui.mjs. When the purposes or the companies that
  // receive data change, change the text and raise this number here, in gh-consent.js, in gh-tracking.js
  // and in api/gh-events.js: choices made under an older text then no longer count and everyone is asked again.
  const CONSENT_VERSION = 2;
  // The wording a page shows names its own version (data-gh-consent-version on the banner). A choice is stored
  // under that version, so a page that still shows an older text can never produce a current "yes".
  const TEXT_VERSION = Number(banner?.dataset.ghConsentVersion) || 1;
  // The choice is shared by all GodHealth sites (www, blueprint, sales), so a visitor answers once.
  const SHARED_DOMAIN = /(^|\.)godhealth\.org$/.test(location.hostname) ? '; Domain=.godhealth.org' : '';
  const removeHostOnlyCopy = () => { if (SHARED_DOMAIN) document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; };
  const writeCookie = (value) => {
    removeHostOnlyCopy();
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${SIX_MONTHS}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${SHARED_DOMAIN}`;
  };
  // The latest valid choice in the cookie, or null. If the cookie still exists more than once, the latest wins.
  const readCookie = () => {
    let found = null;
    try {
      document.cookie.split('; ').filter(item => item.startsWith(`${COOKIE}=`)).forEach(item => {
        try {
          const value = JSON.parse(decodeURIComponent(item.slice(COOKIE.length + 1)));
          const valid = value?.version === CONSENT_VERSION && typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean' && Date.now() - Date.parse(value.updatedAt) < SIX_MONTHS * 1000;
          if (valid && (!found || Date.parse(value.updatedAt) > Date.parse(found.updatedAt))) found = value;
        } catch { /* An unreadable copy counts as no choice. */ }
      });
    } catch { /* Missing or invalid preferences mean optional features stay off. */ }
    return found;
  };
  // A copy stored for this host only dates from before the shared cookie and the current text: remove it.
  try { removeHostOnlyCopy(); } catch { /* Nothing to remove. */ }
  consent = readCookie();
  // "version" is the version of the text the choice was made under, so the tracking file can tell an old text apart.
  const current = () => ({version:consent ? consent.version : CONSENT_VERSION, essential:true, analytics:consent?.analytics === true, marketing:consent?.marketing === true, decided:consent !== null});
  const refresh = () => {
    if (banner) banner.hidden = !!consent || whatsappOpen || !!dialog?.open;
    if (analytics) analytics.checked = current().analytics;
    if (marketing) marketing.checked = current().marketing;
    document.body.dataset.ghCookieChoice = !consent ? 'undecided' : consent.analytics && consent.marketing ? 'accepted' : !consent.analytics && !consent.marketing ? 'rejected' : 'custom';
    updateCookieHeight();
  };
  const setWhatsApp = (open, returnFocus = true) => {
    whatsappOpen = open;
    if (whatsappPanel) whatsappPanel.hidden = !open;
    whatsappToggle?.setAttribute('aria-expanded', String(open));
    refresh();
    if (open) whatsappPanel?.querySelector('button')?.focus();
    else if (returnFocus) whatsappToggle?.focus();
  };
  const openPreferences = () => {
    if (!dialog) return;
    previousFocus = document.activeElement;
    setWhatsApp(false, false);
    refresh();
    if (!dialog.open) dialog.showModal();
    refresh();
  };
  const save = (choices) => {
    consent = {version:TEXT_VERSION, analytics:choices.analytics === true, marketing:choices.marketing === true, updatedAt:new Date().toISOString()};
    try { writeCookie(consent); } catch { /* Current-page choice still applies if storage is disabled. */ }
    dialog?.close();
    refresh();
    if (status) status.textContent = 'Your cookie preferences have been saved.';
    document.dispatchEvent(new CustomEvent('gh:consent-change', {detail:current()}));
  };
  window.GodHealthConsent = Object.freeze({get:current, open:openPreferences});
  document.querySelectorAll('[data-gh-cookie-open]').forEach(button => button.addEventListener('click', openPreferences));
  document.querySelectorAll('[data-gh-cookie-accept]').forEach(button => button.addEventListener('click', () => save({analytics:true,marketing:true})));
  document.querySelectorAll('[data-gh-cookie-reject]').forEach(button => button.addEventListener('click', () => save({analytics:false,marketing:false})));
  document.querySelector('[data-gh-cookie-save]')?.addEventListener('click', () => save({analytics:analytics?.checked,marketing:marketing?.checked}));
  document.querySelector('[data-gh-cookie-close]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('close', () => { refresh(); previousFocus?.focus(); });
  whatsappToggle?.addEventListener('click', () => setWhatsApp(!whatsappOpen));
  document.querySelector('[data-gh-whatsapp-close]')?.addEventListener('click', () => setWhatsApp(false));
  document.addEventListener('click', event => { if (whatsappOpen && !whatsapp?.contains(event.target)) setWhatsApp(false, false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && whatsappOpen) setWhatsApp(false); });
  if (banner && 'ResizeObserver' in window) new ResizeObserver(updateCookieHeight).observe(banner);
  // A choice made in another tab or on another GodHealth site, or a page restored from the back/forward cache.
  const syncFromCookie = () => {
    const stored = readCookie();
    if (!stored || stored.updatedAt === consent?.updatedAt) return;
    consent = stored;
    refresh();
    document.dispatchEvent(new CustomEvent('gh:consent-change', {detail:current()}));
  };
  window.addEventListener('pageshow', event => { if (event.persisted) syncFromCookie(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncFromCookie(); });
  refresh();
})();
