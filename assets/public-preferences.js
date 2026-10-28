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
  try {
    const raw = document.cookie.split('; ').find(item => item.startsWith(`${COOKIE}=`));
    const value = raw ? JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1))) : null;
    if (value?.version === 1 && typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean' && Date.now() - Date.parse(value.updatedAt) < SIX_MONTHS * 1000) consent = value;
  } catch { /* Missing or invalid preferences mean optional features stay off. */ }
  const current = () => ({essential:true, analytics:consent?.analytics === true, marketing:consent?.marketing === true, decided:consent !== null});
  const refresh = () => {
    if (banner) banner.hidden = !!consent || whatsappOpen || !!dialog?.open;
    if (analytics) analytics.checked = current().analytics;
    if (marketing) marketing.checked = current().marketing;
    document.body.dataset.ghCookieChoice = !consent ? 'undecided' : consent.analytics && consent.marketing ? 'accepted' : !consent.analytics && !consent.marketing ? 'rejected' : 'custom';
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
    consent = {version:1, analytics:choices.analytics === true, marketing:choices.marketing === true, updatedAt:new Date().toISOString()};
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    try { document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Path=/; Max-Age=${SIX_MONTHS}; SameSite=Lax${secure}`; } catch { /* Current-page choice still applies if storage is disabled. */ }
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
  refresh();
})();
