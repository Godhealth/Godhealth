(() => {
  window.dataLayer = window.dataLayer || [];

  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem('godhealth_blueprint_campaign') || '{}');
  } catch (_) {}

  // Campaign details belong to the "Advertising" choice of the cookie banner: without it they are not carried on.
  let allowed = false;
  try { allowed = !!(window.GodHealthConsent && window.GodHealthConsent.get().marketing === true); } catch (_) {}
  const params = new URLSearchParams(window.location.search);
  const campaign = Object.fromEntries(keys.map((key) => [key, allowed ? (params.get(key) || stored[key] || '') : '']));
  const ctas = [...document.querySelectorAll('#complete-system-cta, #sticky-system-cta, #bottom-system-cta')];
  if (!ctas.length) return;

  ctas.forEach((cta) => {
    const salesUrl = new URL(cta.href);
    keys.forEach((key) => {
      if (campaign[key]) salesUrl.searchParams.set(key, campaign[key]);
    });
    cta.href = salesUrl.toString();
    cta.addEventListener('click', () => {
      window.dataLayer.push({
        event: 'thank_you_sales_click',
        destination: 'sales.godhealth.org',
        placement: cta.id === 'sticky-system-cta' ? 'sticky' : cta.id === 'bottom-system-cta' ? 'bottom' : 'main',
        ...campaign,
      });
    });
  });
})();
