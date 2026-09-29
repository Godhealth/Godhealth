(() => {
  window.dataLayer = window.dataLayer || [];
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  let stored = {};
  try { stored = JSON.parse(sessionStorage.getItem('godhealth_blueprint_campaign') || '{}'); } catch (_) {}
  const params = new URLSearchParams(location.search);
  const campaign = Object.fromEntries(keys.map(key => [key, params.get(key) || stored[key] || '']));
  const scan = document.getElementById('scan-cta');
  const scanUrl = new URL(scan.href);
  keys.forEach(key => { if (campaign[key]) scanUrl.searchParams.set(key, campaign[key]); });
  scan.href = scanUrl.href;
  document.getElementById('open-blueprint').addEventListener('click', () => window.dataLayer.push({event:'blueprint_delivered', ...campaign}));
  scan.addEventListener('click', () => window.dataLayer.push({event:'scan_cta_clicked', ...campaign}));
})();
