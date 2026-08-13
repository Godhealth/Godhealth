(function(){
  const RATE_KEY = "godhealth_blueprint_last_submit_v1";
  const path = window.location.pathname.toLowerCase();
  const isBlockedPage = path.includes("kingdom-vitality-scan") || path.includes("thank");
  let popup;
  let lastFocus;

  function config(){
    return (window.GODHEALTH_CONFIG && window.GODHEALTH_CONFIG.supabase) || {};
  }

  async function supabaseRpc(functionName,payload){
    const cfg = config();
    if(!cfg.url || !cfg.anonKey || cfg.url.includes("TODO") || cfg.anonKey.includes("TODO")){
      throw new Error("Supabase is not configured yet.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        cfg.url.replace(/\/$/,"") + "/rest/v1/rpc/" + encodeURIComponent(functionName),
        {
          method:"POST",
          signal:controller.signal,
          headers:{
            "Content-Type":"application/json",
            "Accept":"application/json",
            "apikey":cfg.anonKey,
            "Authorization":"Bearer " + cfg.anonKey
          },
          body:JSON.stringify(payload)
        }
      );
      const body = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(body.message || body.error || "Supabase request failed.");
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  function emailValid(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function formMarkup(source){
    const prefix = "blueprint-" + source;
    return `
      <form class="blueprint-form" data-blueprint-form data-blueprint-source="${source}" novalidate>
        <div class="blueprint-fields">
          <label class="blueprint-field" for="${prefix}-first-name">First name
            <input id="${prefix}-first-name" name="first_name" type="text" autocomplete="given-name" required placeholder="First name">
          </label>
          <label class="blueprint-field" for="${prefix}-email">Email
            <input id="${prefix}-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
          </label>
        </div>
        <label class="blueprint-hp" aria-hidden="true">Company
          <input name="company" type="text" tabindex="-1" autocomplete="off">
        </label>
        <div class="blueprint-insider">
          <strong class="blueprint-insider-title">Join the GodHealth Insider</strong>
          <label class="blueprint-check">
            <input name="newsletter_consent" type="checkbox" value="true">
            <span>Yes! Send me Biblical &amp; science-based health insights, free resources and special offers from GodHealth.</span>
          </label>
          <p class="blueprint-muted">Unsubscribe anytime.</p>
        </div>
        <p class="blueprint-error" data-blueprint-error role="alert"></p>
        <button class="btn btn-gold" type="submit">Send Me The Free Blueprint</button>
        ${source === "section" ? '<p class="blueprint-microcopy">Free · Delivered to your inbox</p>' : ""}
        <p class="blueprint-privacy">By downloading you agree to our <a href="/privacy.html">Privacy Policy</a></p>
      </form>`;
  }

  function successMarkup(){
    return `
      <div class="blueprint-success" tabindex="-1">
        <h3>Your Transformation Blueprint is on its way to your inbox!</h3>
        <p>And we have another gift for you: the FREE 6-minute Kingdom Vitality Scan. This scan reveals exactly where your Body, Soul or Spirit is holding you back — and gives you a personalized 7-day Biblical roadmap to more energy, fat loss and a deeper walk with God.</p>
        <a class="btn btn-gold" href="/kingdom-vitality-scan.html">Yes! I Want My Free Personalized Roadmap.</a>
      </div>`;
  }

  function showError(form,message){
    const error = form.querySelector("[data-blueprint-error]");
    if(!error) return;
    error.textContent = message;
    error.classList.add("show");
  }

  function clearError(form){
    const error = form.querySelector("[data-blueprint-error]");
    if(error){
      error.textContent = "";
      error.classList.remove("show");
    }
  }

  async function saveBlueprintLead(payload){
    return supabaseRpc("gh_register_interest", {
      p_first_name: payload.p_first_name,
      p_email: payload.p_email,
      p_source: payload.p_source === "popup" ? "blueprint_popup" : "blueprint_section"
    });
  }

  async function submitBlueprint(form){
    clearError(form);
    const data = new FormData(form);
    const firstName = String(data.get("first_name") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    const honeypot = String(data.get("company") || "").trim();
    const newsletterConsent = data.get("newsletter_consent") === "true";
    const source = form.getAttribute("data-blueprint-source") === "popup" ? "popup" : "section";

    if(honeypot) return;
    if(!firstName){ showError(form,"Please enter your first name."); return; }
    if(!emailValid(email)){ showError(form,"Please enter a valid email address."); return; }

    const lastSubmit = Number(localStorage.getItem(RATE_KEY) || 0);
    if(Date.now() - lastSubmit < 30000){
      showError(form,"Please wait a moment before submitting again.");
      return;
    }

    const button = form.querySelector("button[type='submit']");
    const label = button ? button.textContent : "";
    if(button){ button.disabled = true; button.textContent = "Sending securely…"; }

    try {
      const payload = {
        p_first_name:firstName,
        p_email:email,
        p_newsletter_consent:newsletterConsent,
        p_source:source,
        p_user_agent:navigator.userAgent || null
      };
      await saveBlueprintLead(payload);
      localStorage.setItem(RATE_KEY, String(Date.now()));
      const holder = form.closest("[data-blueprint-holder]") || form.parentElement;
      const popupDialog = form.closest(".blueprint-popup");
      if(source === "popup" && popupDialog){
        popupDialog.classList.add("blueprint-popup-success");
        popupDialog.innerHTML = `
          <button class="blueprint-popup-close" type="button" data-blueprint-close aria-label="Close blueprint popup">×</button>
          ${successMarkup()}`;
        popupDialog.querySelector("[data-blueprint-close]").addEventListener("click", closePopup);
        const success = popupDialog.querySelector(".blueprint-success");
        if(success) success.focus({preventScroll:true});
      } else if(holder){
        holder.innerHTML = successMarkup();
        const success = holder.querySelector(".blueprint-success");
        if(success) success.focus({preventScroll:true});
      }
    } catch(error) {
      console.error("Blueprint submission failed:", error);
      showError(form,"Something went wrong — please try again");
      if(button){ button.disabled = false; button.textContent = label; }
    }
  }

  function bindForms(root){
    (root || document).querySelectorAll("[data-blueprint-form]").forEach(form=>{
      if(form.dataset.bound) return;
      form.dataset.bound = "true";
      form.addEventListener("submit", event=>{
        event.preventDefault();
        submitBlueprint(form);
      });
    });
  }

  function buildPopup(){
    if(isBlockedPage || popup) return popup;
    const overlay = document.createElement("div");
    overlay.className = "blueprint-popup-overlay";
    overlay.setAttribute("data-blueprint-popup","");
    overlay.innerHTML = `
      <div class="blueprint-popup" role="dialog" aria-modal="true" aria-labelledby="blueprint-popup-title" aria-describedby="blueprint-popup-copy">
        <button class="blueprint-popup-close" type="button" data-blueprint-close aria-label="Close blueprint popup">×</button>
        <p class="eyebrow">Free Download</p>
        <h2 id="blueprint-popup-title">Download the FREE GodHealth 7-Day Transformation Blueprint.</h2>
        <p class="lead" id="blueprint-popup-copy">A Biblical and science based Blueprint to more energy, fat loss, better sleep and a deeper walk with God in 7 days.</p>
        <figure class="blueprint-popup-visual"><img src="/assets/godhealth-7-day-blueprint.jpg" alt="GodHealth 7-Day Transformation Blueprint cover"></figure>
        <div class="blueprint-card" data-blueprint-holder>${formMarkup("popup")}<p class="blueprint-microcopy" style="margin-top:12px">Free · Delivered to your inbox · Built on the Bible &amp; modern science</p></div>
      </div>`;
    document.body.appendChild(overlay);
    bindForms(overlay);
    popup = overlay;

    overlay.addEventListener("click", event=>{
      if(event.target === overlay) closePopup();
    });
    overlay.querySelector("[data-blueprint-close]").addEventListener("click", closePopup);
    return overlay;
  }

  function focusable(container){
    return [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(el=>el.offsetParent !== null || el === document.activeElement);
  }

  function trapFocus(event){
    if(!popup || !popup.classList.contains("is-open") || event.key !== "Tab") return;
    const items = focusable(popup);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if(event.shiftKey && document.activeElement === first){
      event.preventDefault();
      last.focus();
    } else if(!event.shiftKey && document.activeElement === last){
      event.preventDefault();
      first.focus();
    }
  }

  function openPopup(){
    if(isBlockedPage) return;
    if(popup && popup.classList.contains("is-open")) return;
    const overlay = buildPopup();
    if(!overlay) return;
    lastFocus = document.activeElement;
    overlay.classList.add("is-open");
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if(scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + "px";
    document.body.classList.add("blueprint-lock");
    const first = focusable(overlay)[0];
    if(first) first.focus({preventScroll:true});
  }

  function closePopup(){
    if(!popup) return;
    popup.classList.remove("is-open");
    document.body.classList.remove("blueprint-lock");
    document.body.style.paddingRight = "";
    if(lastFocus && typeof lastFocus.focus === "function"){
      try{ lastFocus.focus({preventScroll:true}); }catch(e){}
    }
  }

  function initPopupTriggers(){
    if(isBlockedPage) return;
    window.setTimeout(openPopup, 30000);
  }

  function bootBlueprint(){
    document.querySelectorAll("[data-blueprint-section-form]").forEach(holder=>{
      if(!holder.innerHTML.trim()) holder.innerHTML = formMarkup("section");
    });
    bindForms(document);
    initPopupTriggers();
  }

  document.addEventListener("keydown", event=>{
    if(event.key === "Escape" && popup && popup.classList.contains("is-open")) closePopup();
    trapFocus(event);
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootBlueprint, {once:true});
  } else {
    bootBlueprint();
  }
})();
