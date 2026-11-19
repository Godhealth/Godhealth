(() => {
  const params = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const campaign = Object.fromEntries(keys.map(key => [key, params.get(key) || '']));
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({event:'blueprint_page_viewed', ...campaign});
  // Carrying campaign details on to the next pages belongs to the "Advertising" choice of the cookie banner.
  const marketingAllowed = () => { try { return !!(window.GodHealthConsent && window.GodHealthConsent.get().marketing === true); } catch (_) { return false; } };
  const form = document.getElementById('blueprint-form');
  const error = document.getElementById('form-error');
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const firstName = form.elements.first_name.value.trim();
    const email = form.elements.email.value.trim();

    if (!firstName || !form.elements.email.validity.valid) {
      error.textContent = 'Please enter your first name and a valid email address.';
      error.hidden = false;
      (firstName ? form.elements.email : form.elements.first_name).focus();
      return;
    }

    const timestamp = new Date().toISOString();
    const lead = {
      name: firstName,
      first_name: firstName,
      email,
      // Keep the established API/webhook schema stable without asking for
      // phone or marketing consent on this lower-friction form.
      phone_number: '',
      phone_full: '',
      consent_data_processing: true,
      consent_phone_contact: false,
      opt_in_marketing: false,
      contact_consent_timestamp: null,
      source: 'blueprint_ads',
      submitted_at: timestamp,
      referrer: document.referrer,
      landing_page: window.GH_LANDING_URL || location.href,
      ...campaign
    };

    button.disabled = true;
    button.firstElementChild.textContent = 'SENDING YOUR BLUEPRINT…';

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify(lead)
      });
      if (!response.ok) throw new Error('Lead registration failed');

      window.dataLayer.push({event:'blueprint_optin', contact_consent:false, ...campaign});
      // Report the sign-up to Google Analytics and Meta, only if the visitor allowed it
      // (assets/gh-tracking.js). It answers within 0.6 s and can never block the redirect.
      try { if (window.GHTrack) await window.GHTrack.lead({type:'blueprint', email, nextPage:true}); } catch (_) {}
      // The campaign note is only kept, and only carried on to the next page, when the visitor allowed advertising cookies.
      try { if (marketingAllowed()) sessionStorage.setItem('godhealth_blueprint_campaign', JSON.stringify(campaign)); } catch (_) {}
      const next = new URL('thank-you.html', location.href);
      if (marketingAllowed()) keys.forEach(key => { if (campaign[key]) next.searchParams.set(key, campaign[key]); });
      location.assign(next.href);
    } catch (_) {
      error.textContent = 'We could not send your details right now. Please try again.';
      error.hidden = false;
      button.disabled = false;
      button.firstElementChild.textContent = 'SEND MY FREE BLUEPRINT';
    }
  });
})();
