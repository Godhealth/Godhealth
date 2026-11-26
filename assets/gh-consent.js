/*
 * GodHealth cookie choice for pages that do not have the main site's own banner
 * (the sales page and the Blueprint landing pages).
 *
 * The same file is used on all three sites. Keep the copies identical.
 *
 * It is the stand-alone twin of assets/public-preferences.js on www.godhealth.org:
 *   - same cookie:  gh_cookie_consent = {version:2, analytics, marketing, updatedAt}
 *   - same API:     window.GodHealthConsent.get() / .open()
 *   - same event:   "gh:consent-change" on document
 * The cookie is shared by all godhealth.org sites, so a visitor answers once.
 *
 * The version number belongs to the wording below. Whenever the purposes or the
 * companies that receive data change, change the text in both files, raise
 * CONSENT_VERSION everywhere (also in gh-tracking.js and api/gh-events.js) and
 * every visitor is asked again. A choice made under an older text never counts.
 *
 * This file loads nothing from other companies and sets no cookie until the
 * visitor presses a button. Any element with data-gh-cookie-open reopens the
 * preferences; if the page has none, a small link is added to the footer.
 */
(function (window, document) {
  'use strict';
  if (window.GodHealthConsent) return;

  var COOKIE = 'gh_cookie_consent';
  var CONSENT_VERSION = 2;
  var SIX_MONTHS_S = 60 * 60 * 24 * 180;
  var REGISTRABLE_DOMAIN = 'godhealth.org';
  var POLICY_URL = 'https://www.godhealth.org/privacy.html#cookies';

  var TEXT = {
    bannerTitle: 'Your privacy',
    bannerBody: 'We would like to use Google Analytics for statistics and the Meta Pixel to measure our ads. Both stay off unless you agree.',
    preferences: 'Preferences',
    policy: 'Cookie policy',
    reject: 'Reject optional',
    accept: 'Accept cookies',
    dialogTitle: 'Cookie preferences',
    dialogIntro: 'Choose what you allow. You can change this at any time.',
    essentialTitle: 'Essential',
    essentialBody: 'Remembers your cookie choice for six months.',
    alwaysOn: 'Always on',
    analyticsTitle: 'Statistics (Google Analytics)',
    analyticsBody: 'Shows us which pages are visited, which buttons are used and when someone signs up or buys (with the order amount), so we can improve our websites. Your name, email address and answers are never sent.',
    marketingTitle: 'Advertising (Meta: Facebook and Instagram)',
    marketingBody: 'Lets us measure and improve our ads. Meta receives which GodHealth pages you view and actions such as a sign-up or a purchase, with your IP address and browser identifiers, from your browser and from our server, plus a scrambled (hashed) email address when you request the Blueprint or buy. Meta can link this to your Facebook or Instagram account. Because GodHealth is a Christian health service, this can show an interest in faith and health. Campaign details from the link you followed are remembered during your visit and carried to our booking and resource links.',
    acceptAll: 'Accept optional',
    save: 'Save my choices',
    readPolicy: 'Read our cookie policy',
    close: 'Close',
    reopen: 'Cookie preferences',
    saved: 'Your cookie preferences have been saved.'
  };

  var CSS = [
    '*{box-sizing:border-box}',
    '.banner,.dialog{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
    '.banner{position:fixed;left:50%;bottom:calc(14px + var(--gh-offset,0px));transform:translateX(-50%);z-index:2147483000;width:min(1080px,calc(100vw - 24px));display:flex;align-items:center;gap:22px;padding:16px 18px 16px 24px;background:linear-gradient(115deg,#1d1d1d,#101010);border:1px solid rgba(212,175,55,.3);border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.4);color:#d5d5d5;overflow:hidden}',
    '.banner[hidden]{display:none}',
    '.banner::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(#f4dc86,#b98d21)}',
    '.copy{flex:1;min-width:0}',
    '.title{margin:0 0 5px;font-size:11px;line-height:1.5;letter-spacing:.12em;font-weight:800;text-transform:uppercase;color:#dfbd52}',
    '.copy p{margin:0;font-size:13px;line-height:1.6;color:#d5d5d5}',
    '.textlink{font:inherit;color:#e6ce7c;font-weight:700;text-decoration:underline;text-underline-offset:2px;padding:0;border:0;background:none;cursor:pointer}',
    '.actions{display:flex;flex-shrink:0;gap:10px}',
    '.pill{font-family:inherit;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.04);border-radius:999px;color:#e4e4e4;font-size:13px;line-height:1.2;font-weight:800;padding:12px 20px;min-height:44px;white-space:nowrap;cursor:pointer}',
    '.pill.primary{background:linear-gradient(135deg,#f4dc86,#d4af37 48%,#b98d21);border-color:rgba(245,223,141,.95);color:#080808}',
    '.pill:hover{filter:brightness(1.12)}',
    'button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #f4dc86;outline-offset:3px}',
    '.dialog{width:min(540px,calc(100% - 32px));max-height:90vh;padding:28px;border:1px solid rgba(212,175,55,.4);border-radius:16px;background:linear-gradient(125deg,#202020,#101010);color:#eee;box-shadow:0 25px 100px rgba(0,0,0,.55);overflow:auto;overscroll-behavior:contain}',
    '.dialog::backdrop{background:rgba(0,0,0,.55)}',
    /* Browsers without <dialog> (Safari before 15.4, Firefox before 98) do not hide or place it themselves. */
    '.dialog:not([open]){display:none}',
    '.dialog.plain[open]{display:block;position:fixed;left:50%;top:5vh;transform:translateX(-50%);z-index:2147483001}',
    '.dialog h2{margin:0;font-size:24px;line-height:1.3;color:#fff;font-weight:800}',
    '.dialog>p{margin:12px 0 20px;font-size:13px;line-height:1.7;color:#c9c9c9}',
    '.option{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;border-top:1px solid rgba(255,255,255,.12);padding:16px 0;cursor:pointer}',
    '.option strong{display:block;font-size:14px;line-height:1.5;color:#fff}',
    '.option span{display:block;font-size:12px;line-height:1.7;color:#c9c9c9;margin-top:5px}',
    '.option input{width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#d4af37;cursor:pointer}',
    '.fixed{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#dfbd52;white-space:nowrap}',
    '.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}',
    '.row .pill{width:100%;white-space:normal}',
    '.save{display:block;width:100%;margin-top:10px}',
    '.policy{display:block;text-align:center;margin-top:16px;font-size:12px;color:#c9c9c9}',
    '.x{position:absolute;top:10px;right:12px;width:40px;height:40px;border:0;background:none;color:#c9c9c9;font-size:26px;line-height:1;cursor:pointer}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    /* Phones: as low as possible, because the banner sits on top of the page until the visitor answers. */
    '@media(max-width:720px){.banner{flex-direction:column;align-items:stretch;gap:9px;padding:11px 12px 11px 16px;bottom:calc(8px + var(--gh-offset,0px))}.title{display:none}.copy p{font-size:12px;line-height:1.45}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pill{padding:9px 10px;min-height:42px;white-space:normal}.dialog{padding:22px}.dialog h2{font-size:21px}}'
  ].join('');

  var host = window.location.hostname.toLowerCase();
  var shared = host === REGISTRABLE_DOMAIN || host.slice(-REGISTRABLE_DOMAIN.length - 1) === '.' + REGISTRABLE_DOMAIN;
  var consent = null;
  var previousFocus = null;
  var reopenControl = null;

  /*
   * Only a choice made under the current text counts. If the cookie exists
   * more than once, the latest choice wins.
   */
  function readStored() {
    var best = null;
    var bestTime = -Infinity;
    var entries = [];
    try { entries = document.cookie ? document.cookie.split('; ') : []; } catch (error) { entries = []; }
    entries.forEach(function (entry) {
      if (entry.indexOf(COOKIE + '=') !== 0) return;
      try {
        var value = JSON.parse(decodeURIComponent(entry.slice(COOKIE.length + 1)));
        var time = Date.parse(value.updatedAt);
        var valid = value.version === CONSENT_VERSION && typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean' &&
          Date.now() - time < SIX_MONTHS_S * 1000;
        if (valid && time > bestTime) {
          bestTime = time;
          best = value;
        }
      } catch (error) { /* An unreadable copy counts as no choice. */ }
    });
    return best;
  }

  /* On godhealth.org the choice lives in one cookie for all sites; a copy for this host only is removed. */
  function removeHostOnlyCopy() {
    if (!shared) return;
    try { document.cookie = COOKIE + '=; Max-Age=0; Path=/; SameSite=Lax'; } catch (error) { /* Nothing to remove. */ }
  }

  function writeStored(value) {
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    removeHostOnlyCopy();
    try {
      document.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(value)) + '; Max-Age=' + SIX_MONTHS_S +
        '; Path=/; SameSite=Lax' + secure + (shared ? '; Domain=.' + REGISTRABLE_DOMAIN : '');
    } catch (error) { /* The choice still applies to this page if cookies are blocked. */ }
  }

  function current() {
    return {
      version: CONSENT_VERSION,
      essential: true,
      analytics: !!consent && consent.analytics === true,
      marketing: !!consent && consent.marketing === true,
      decided: consent !== null
    };
  }

  removeHostOnlyCopy();
  consent = readStored();

  /* A browser without Shadow DOM cannot keep these styles away from the page: no banner there, so nothing optional is ever switched on. */
  if (!document.createElement('div').attachShadow) {
    window.GodHealthConsent = Object.freeze({ get: current, open: function () {} });
    return;
  }

  /* ---------- interface ---------- */

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(className, text) {
    var node = element('button', className, text);
    node.type = 'button';
    return node;
  }

  var root = element('div');
  root.setAttribute('data-gh-consent-root', '');
  var shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;
  var style = element('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  var banner = element('aside', 'banner');
  banner.setAttribute('aria-label', TEXT.bannerTitle);
  banner.hidden = true;
  var copy = element('div', 'copy');
  copy.appendChild(element('p', 'title', TEXT.bannerTitle));
  var body = element('p', '', TEXT.bannerBody + ' ');
  var openLink = button('textlink', TEXT.preferences);
  var policyLink = element('a', 'textlink', TEXT.policy);
  policyLink.href = POLICY_URL;
  policyLink.target = '_blank';
  policyLink.rel = 'noopener';
  body.appendChild(openLink);
  body.appendChild(document.createTextNode(' · '));
  body.appendChild(policyLink);
  copy.appendChild(body);
  var actions = element('div', 'actions');
  var bannerReject = button('pill', TEXT.reject);
  var bannerAccept = button('pill primary', TEXT.accept);
  actions.appendChild(bannerReject);
  actions.appendChild(bannerAccept);
  banner.appendChild(copy);
  banner.appendChild(actions);

  var dialog = element('dialog', 'dialog');
  if (typeof dialog.showModal !== 'function') dialog.className = 'dialog plain';
  dialog.setAttribute('aria-labelledby', 'gh-consent-title');
  var closeButton = button('x', '×');
  closeButton.setAttribute('aria-label', TEXT.close);
  var heading = element('h2', '', TEXT.dialogTitle);
  heading.id = 'gh-consent-title';
  dialog.appendChild(closeButton);
  dialog.appendChild(heading);
  dialog.appendChild(element('p', '', TEXT.dialogIntro));

  function option(title, description, control) {
    var label = element('label', 'option');
    var text = element('div');
    text.appendChild(element('strong', '', title));
    text.appendChild(element('span', '', description));
    label.appendChild(text);
    label.appendChild(control);
    return label;
  }

  function checkbox() {
    var input = element('input');
    input.type = 'checkbox';
    return input;
  }

  var analyticsBox = checkbox();
  var marketingBox = checkbox();
  dialog.appendChild(option(TEXT.essentialTitle, TEXT.essentialBody, element('span', 'fixed', TEXT.alwaysOn)));
  dialog.appendChild(option(TEXT.analyticsTitle, TEXT.analyticsBody, analyticsBox));
  dialog.appendChild(option(TEXT.marketingTitle, TEXT.marketingBody, marketingBox));
  var row = element('div', 'row');
  var dialogReject = button('pill', TEXT.reject);
  var dialogAccept = button('pill primary', TEXT.acceptAll);
  row.appendChild(dialogReject);
  row.appendChild(dialogAccept);
  dialog.appendChild(row);
  var saveButton = button('pill save', TEXT.save);
  dialog.appendChild(saveButton);
  var dialogPolicy = element('a', 'textlink policy', TEXT.readPolicy);
  dialogPolicy.href = POLICY_URL;
  dialogPolicy.target = '_blank';
  dialogPolicy.rel = 'noopener';
  dialog.appendChild(dialogPolicy);

  var status = element('p', 'sr');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  shadow.appendChild(banner);
  shadow.appendChild(dialog);
  shadow.appendChild(status);

  /*
   * Fixed elements at the bottom of the screen (a buy bar, a sticky button).
   * The banner must never cover them. Known ones are found by name, any other
   * by looking at what sits at the bottom edge.
   */
  function bottomBars() {
    var found = [];
    function consider(node) {
      while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
        if (node !== root && window.getComputedStyle(node).position === 'fixed') {
          if (found.indexOf(node) === -1) found.push(node);
          return;
        }
        node = node.parentElement;
      }
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-gh-consent-avoid], .mobile-buy, .thank-sticky-cta'), consider);
    if (document.elementsFromPoint) {
      [0.25, 0.5, 0.75].forEach(function (share) {
        Array.prototype.forEach.call(document.elementsFromPoint(window.innerWidth * share, window.innerHeight - 16), consider);
      });
    }
    return found;
  }

  /* Lifts the banner above those elements. */
  function updateOffset() {
    var offset = 0;
    try {
      bottomBars().forEach(function (bar) {
        var css = window.getComputedStyle(bar);
        if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return;
        var box = bar.getBoundingClientRect();
        /* On screen, at or just above the bottom edge, and not an overlay that fills the screen. */
        var atBottom = box.bottom >= window.innerHeight - 48 && box.top < window.innerHeight;
        if (box.height > 0 && box.height < window.innerHeight * 0.4 && atBottom) offset = Math.max(offset, window.innerHeight - box.top);
      });
    } catch (error) { offset = 0; }
    banner.style.setProperty('--gh-offset', offset + 'px');
  }

  /* Such a bar can appear while scrolling, so the position is checked again, at most once per frame. */
  var offsetQueued = false;
  function queueOffset() {
    if (banner.hidden || offsetQueued) return;
    offsetQueued = true;
    var measure = function () {
      offsetQueued = false;
      if (!banner.hidden) updateOffset();
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(measure);
    else window.setTimeout(measure, 100);
  }

  function refresh() {
    var state = current();
    banner.hidden = state.decided || dialog.open === true;
    analyticsBox.checked = state.analytics;
    marketingBox.checked = state.marketing;
    if (document.body) {
      document.body.setAttribute('data-gh-cookie-choice', !state.decided ? 'undecided' :
        state.analytics && state.marketing ? 'accepted' : !state.analytics && !state.marketing ? 'rejected' : 'custom');
    }
    if (!banner.hidden) updateOffset();
  }

  function closeDialog() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function save(choice) {
    consent = {
      version: CONSENT_VERSION,
      analytics: choice.analytics === true,
      marketing: choice.marketing === true,
      updatedAt: new Date().toISOString()
    };
    writeStored(consent);
    closeDialog();
    refresh();
    status.textContent = TEXT.saved;
    document.dispatchEvent(new CustomEvent('gh:consent-change', { detail: current() }));
  }

  function open() {
    /* A control inside one of our own shadow trees is reported as its host: look inside for the real one. */
    var active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    previousFocus = active;
    refresh();
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    refresh();
  }

  bannerAccept.addEventListener('click', function () { save({ analytics: true, marketing: true }); });
  dialogAccept.addEventListener('click', function () { save({ analytics: true, marketing: true }); });
  bannerReject.addEventListener('click', function () { save({ analytics: false, marketing: false }); });
  dialogReject.addEventListener('click', function () { save({ analytics: false, marketing: false }); });
  saveButton.addEventListener('click', function () { save({ analytics: analyticsBox.checked, marketing: marketingBox.checked }); });
  openLink.addEventListener('click', open);
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('close', function () {
    refresh();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    /* The control that opened the dialog can be gone (the banner disappears after a choice): go to the reopen control. */
    var scope = previousFocus && previousFocus.getRootNode ? previousFocus.getRootNode() : document;
    if (reopenControl && (!previousFocus || scope.activeElement !== previousFocus)) reopenControl.focus();
  });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });

  window.GodHealthConsent = Object.freeze({ get: current, open: open });

  function mount() {
    document.body.appendChild(root);

    var openers = document.querySelectorAll('[data-gh-cookie-open]');
    if (!openers.length) {
      /* No reopen control on this page: add a quiet link, in the footer when there is one. */
      var holder = element('span');
      holder.setAttribute('data-gh-consent-link', '');
      var holderShadow = holder.attachShadow ? holder.attachShadow({ mode: 'open' }) : holder;
      var linkStyle = element('style');
      linkStyle.textContent = 'button{all:unset;cursor:pointer;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:3px}button:focus-visible{outline:2px solid currentColor;outline-offset:3px}';
      var reopen = button('', TEXT.reopen);
      reopen.addEventListener('click', open);
      holderShadow.appendChild(linkStyle);
      holderShadow.appendChild(reopen);
      reopenControl = reopen;
      var footers = document.querySelectorAll('footer');
      var footer = footers.length ? footers[footers.length - 1] : null;
      var target = footer ? (footer.querySelector('small') || footer.querySelector('.wrap, .gh-container, div') || footer) : null;
      if (target) {
        holder.style.marginLeft = '16px';
        target.appendChild(holder);
      } else {
        holder.style.cssText = 'display:block;text-align:center;padding:18px 12px;font-size:12px;opacity:.75';
        document.body.appendChild(holder);
      }
    } else {
      Array.prototype.forEach.call(openers, function (opener) { opener.addEventListener('click', open); });
      reopenControl = openers[openers.length - 1];
    }

    refresh();
    /* A choice made in another tab or on another GodHealth site, or a page restored from the back/forward cache. */
    var syncFromCookie = function () {
      var stored = readStored();
      if (!stored || (consent && stored.updatedAt === consent.updatedAt)) return;
      consent = stored;
      refresh();
      document.dispatchEvent(new CustomEvent('gh:consent-change', { detail: current() }));
    };
    window.addEventListener('pageshow', function (event) { if (event.persisted) syncFromCookie(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncFromCookie(); });
    window.addEventListener('resize', queueOffset);
    window.addEventListener('scroll', queueOffset, { passive: true });
    window.setTimeout(queueOffset, 400);
    window.setTimeout(queueOffset, 1600);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})(window, document);
