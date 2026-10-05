(() => {
  window.dataLayer = window.dataLayer || [];

  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem('godhealth_blueprint_campaign') || '{}');
  } catch (_) {}

  const params = new URLSearchParams(window.location.search);
  const campaign = Object.fromEntries(keys.map((key) => [key, params.get(key) || stored[key] || '']));
  const cta = document.getElementById('complete-system-cta');
  if (!cta) return;

  const salesUrl = new URL(cta.href);
  keys.forEach((key) => {
    if (campaign[key]) salesUrl.searchParams.set(key, campaign[key]);
  });
  cta.href = salesUrl.toString();

  cta.addEventListener('click', () => {
    window.dataLayer.push({
      event: 'thank_you_sales_click',
      destination: 'sales.godhealth.org',
      ...campaign,
    });
  });
})();
