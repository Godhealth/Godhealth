(() => {
  const params = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const campaign = Object.fromEntries(keys.map(key => [key, params.get(key) || '']));
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({event:'blueprint_page_viewed', ...campaign});
  const form = document.getElementById('blueprint-form');
  const error = document.getElementById('form-error');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const firstName = form.elements.first_name.value.trim();
    const email = form.elements.email.value.trim();
    const phone = form.elements.phone.value.trim();
    if (!firstName || !form.elements.email.validity.valid || !phone || phone.replace(/\D/g,'').length < 7) {
      error.textContent = 'Please enter your first name, a valid email address and phone number.';
      error.hidden = false;
      (firstName ? (form.elements.email.validity.valid ? form.elements.phone : form.elements.email) : form.elements.first_name).focus();
      return;
    }
    const contactConsent = document.getElementById('contact-consent').checked;
    const timestamp = new Date().toISOString();
    const lead = {
      name: firstName, email, phone_number: phone, phone_full: phone,
      consent_data_processing: true, consent_phone_contact: contactConsent,
      opt_in_marketing: contactConsent, contact_consent_timestamp: contactConsent ? timestamp : null,
      source: 'blueprint_ads', submitted_at: timestamp,
      referrer: document.referrer, landing_page: location.href, ...campaign
    };
    button.disabled = true;
    button.firstElementChild.textContent = 'SENDING YOUR BLUEPRINT…';
    try {
      const cfg = window.GODHEALTH_CONFIG?.supabase;
      if (!cfg?.url || !cfg?.anonKey) throw new Error('Lead service unavailable');
      const response = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/gh_register_interest', {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'Accept':'application/json', 'apikey':cfg.anonKey, 'Authorization':'Bearer ' + cfg.anonKey},
        body: JSON.stringify({p_first_name:firstName, p_email:email, p_source:'blueprint_ads'})
      });
      if (!response.ok) throw new Error('Lead registration failed');
      // The established GodHealth lead webhook also receives the phone, consent and campaign context.
      // Delivery of the workbook never depends on a marketing follow-up webhook.
      fetch('https://godhealth.app.n8n.cloud/webhook/2a3fa0cd-62f8-4467-9948-817589483072', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lead), keepalive:true
      }).catch(() => {});
      window.dataLayer.push({event:'blueprint_optin', contact_consent:contactConsent, ...campaign});
      try { sessionStorage.setItem('godhealth_blueprint_campaign', JSON.stringify(campaign)); } catch (_) {}
      const next = new URL('thank-you.html', location.href);
      keys.forEach(key => { if (campaign[key]) next.searchParams.set(key, campaign[key]); });
      location.assign(next.href);
    } catch (_) {
      error.textContent = 'We could not send your details right now. Please try again.';
      error.hidden = false;
      button.disabled = false;
      button.firstElementChild.textContent = 'SEND MY FREE BLUEPRINT';
    }
  });
})();
