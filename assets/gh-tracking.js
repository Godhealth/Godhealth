/*
 * GodHealth tracking. The only file that talks to Google Analytics 4 and Meta.
 *
 * The same file is used by www.godhealth.org, sales.godhealth.org and
 * blueprint.godhealth.org. Keep the copies identical.
 *
 * What it does
 *   - Loads the Google tag only after the visitor allows "analytics".
 *   - Loads the Meta Pixel only after the visitor allows "marketing", and only
 *     then also reports conversions to /api/gh-events (the relay to the Meta
 *     Conversions API, which stays silent until its token is configured).
 *   - Sends a small, fixed set of events. See EVENTS below.
 *
 * What it never does
 *   - Nothing is loaded, stored or sent before the matching choice is made.
 *     An action taken before that choice is not measured, also not afterwards.
 *     The one exception is a paid order: it is reported when the visitor
 *     agrees while still on the thank-you page.
 *   - It does not run on the private apps, or on pages reached with a login
 *     token or contact details in the URL.
 *   - On every page view the address bar is tidied first: only campaign and
 *     click-id parameters stay, so nothing else can travel along in a page
 *     address or as the previous address of the next page.
 *   - This code never sends page content, form answers, scores or free text to
 *     Google or Meta. Meta gets an event name, a value and a neutral offer key.
 *   - Meta gets nothing from the health-topic articles or the "not found" page.
 *   - When a visitor withdraws a choice, the page reloads once, so a tag that
 *     was already loaded cannot send anything more.
 *
 * The Vitality Scan (kingdom-vitality-scan.html) does not load this file.
 *
 * Public interface
 *   GHTrack.track(name, params)   send one event from EVENTS now
 *   GHTrack.lead(details)         report a lead; returns a promise (max 0.6 s)
 * Page code must treat both as optional: wrap the call in try/catch and never
 * make a form or a redirect depend on it.
 *
 * Testing
 *   ?gh_track_test=dry   shows in the browser console what would be sent, and
 *                        sends nothing to Google or Meta. Safe everywhere.
 *   ?gh_track_test=1     really sends, also on localhost and preview links.
 *                        The page view and the events of this file are marked
 *                        as debug traffic for Google.
 *   ?gh_track_test=0     back to normal.
 * The switch is remembered for the browser tab. The cookie choice still applies.
 */
(function (window, document) {
  'use strict';
  if (window.GHTrack) return;

  var CONFIG = {
    ga4Id: 'G-6SWE12FJQ7',
    metaPixelId: '4064076763888809',
    relayUrl: '/api/gh-events',
    purchaseUrl: '/api/gh-purchase',
    registrableDomain: 'godhealth.org',
    sites: {
      'www.godhealth.org': 'www',
      'sales.godhealth.org': 'sales',
      'blueprint.godhealth.org': 'blueprint'
    },
    /*
     * Google's advertising signals stay denied. Switch this on only when a
     * Google Ads account is linked, and then also change the consent text and
     * raise the consent version, because visitors must be asked again.
     */
    googleAdSignals: false,
    /*
     * Send a hashed email address to Meta with the Blueprint sign-up, so Meta
     * can match the lead to an ad. The consent text and the form mention this.
     */
    hashedEmail: true,
    /* Private, signed-in parts of the main site. Tracking never runs here. */
    blockedPaths: ['/client', '/coach-dashboard', '/kingdom-capacity-assessment', '/kca'],
    /* A URL with one of these keys can hold a login token or contact details: no tags at all. */
    sensitiveKeys: ['code', 'token', 'access_token', 'refresh_token', 'error_description', 'email',
      'first_name', 'last_name', 'name', 'phone', 'invitee_email', 'invitee_first_name', 'invitee_last_name',
      'invitee_full_name', 'text_reminder_number'],
    /*
     * Identifiers that are only a problem inside the PREVIOUS address, because
     * the tags pass that on: a Stripe session id, a mailing-list subscriber id.
     * On the page itself they leave the address bar before a tag loads, like
     * every key that is not allowed below.
     */
    referrerOnlyKeys: ['session_id', 'ml_subscriber', 'ml_subscriber_hash', 'mc_eid', '_hsenc'],
    /* Every other query key is removed from the address bar on every page view. */
    allowedKeys: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
      'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
      'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', '_gl'],
    /*
     * Meta runs on pages that present a GodHealth offer (something to book,
     * request or buy). It gets nothing from editorial articles about health
     * topics or from the Vitality Scan. Their address must not reach Meta as
     * the previous page either, and the Pixel passes the previous address on.
     * The articles and the "not found" page therefore carry
     * <meta name="referrer" content="origin">: the next page only learns the
     * site name and loads the Pixel as usual. When a full address of one of
     * these pages does arrive (after the Vitality Scan, or from a browser that
     * ignores the tag), the Pixel is left out on that page view.
     * api/gh-events.js enforces the same list on the server.
     */
    metaExcludedPaths: ['/guides', '/topics', '/kingdom-vitality-scan.html'],
    /* Marks the "page not found" page of the main site. Meta gets nothing from it. */
    notFoundSelector: '.gh-not-found',
    /* Campaign notes that page scripts keep in session storage under the advertising choice. Removed without it. */
    marketingSessionKeys: ['godhealth_blueprint_campaign', 'godhealth_public_attribution_v1'],
    /* Pages that count as "looked at an offer" for Meta (ViewContent). */
    offers: [
      { site: 'sales', path: /^\/(index\.html)?$/, key: 'nutrition_bundle', value: 17, currency: 'USD' },
      { site: 'sales', path: /^\/products\//, key: 'nutrition_bundle', value: 17, currency: 'USD' },
      { site: 'blueprint', path: /^\/(index\.html)?$/, key: 'blueprint' },
      { site: 'www', path: /^\/personal-training$/, key: 'personal_training' },
      { site: 'www', path: /^\/coaching(\/.*)?$/, key: 'coaching' },
      { site: 'www', path: /^\/nutrition-bundle$/, key: 'nutrition_bundle' },
      { site: 'www', path: /^\/blueprint$/, key: 'blueprint' }
    ],
    /* What is for sale. Keep the prices equal to PRODUCTS in api/gh-events.js. */
    products: {
      nutrition_bundle: { name: 'GodHealth Biblical Nutrition Bundle', value: 17, currency: 'USD' },
      biblical_health_pdf_package: { name: 'Biblical Health PDF Package', value: 47, currency: 'USD' }
    },
    /* Stripe Payment Links by the code at the end of their URL, and the product each one sells. */
    stripeLinks: {
      '28EeVf8W6atb02i3Lb9bO03': 'nutrition_bundle',
      '28EbJ0gAc2855mq6k6bwk02': 'biblical_health_pdf_package'
    }
  };

  /*
   * The complete event list. "ga" is the Google Analytics 4 event name, "meta"
   * the Meta standard event. Only standard Meta events are used, because
   * custom ones need manual approval in Events Manager before ads can use them.
   * "relay" marks conversions that also go to Meta from our server.
   * Purchase is reported to Meta's server side by api/gh-purchase.js itself.
   * Phone and email links are counted in Google Analytics only: they also sit
   * in every footer and in the privacy policy, so they say little about ads.
   */
  var EVENTS = {
    lead: { ga: 'generate_lead', meta: 'Lead', relay: true },
    begin_checkout: { ga: 'begin_checkout', meta: 'InitiateCheckout', relay: true },
    strategy_call_clicked: { ga: 'strategy_call_clicked', meta: 'Contact', relay: true },
    whatsapp_click: { ga: 'whatsapp_click', meta: 'Contact', relay: true },
    phone_click: { ga: 'phone_click', meta: null },
    email_click: { ga: 'email_click', meta: null },
    purchase: { ga: 'purchase', meta: 'Purchase' },
    view_offer: { ga: null, meta: 'ViewContent' },
    blueprint_cta_clicked: { ga: 'blueprint_cta_clicked', meta: null },
    bundle_cta_clicked: { ga: 'bundle_cta_clicked', meta: null },
    scan_cta_clicked: { ga: 'scan_cta_clicked', meta: null },
    thank_you_sales_click: { ga: 'thank_you_sales_click', meta: null }
  };

  var CONSENT_COOKIE = 'gh_cookie_consent';
  var CONSENT_VERSION = 2;
  var CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  var DATA_LAYER = 'ghDataLayer';
  var PENDING_KEY = 'gh_track_pending';
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  var TEST_KEY = 'gh_track_test';
  var SCAN_PATH = '/kingdom-vitality-scan.html';
  /* Waiting times before the purchase check is repeated when Stripe did not answer. */
  var PURCHASE_RETRY_MS = [1500, 4000];

  var host = window.location.hostname.toLowerCase();
  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  var scriptTag = document.currentScript;
  var site = (scriptTag && scriptTag.getAttribute('data-gh-site')) || CONFIG.sites[host] || 'www';
  var pageKind = (scriptTag && scriptTag.getAttribute('data-gh-page')) || '';
  var production = Object.prototype.hasOwnProperty.call(CONFIG.sites, host);

  /* ---------- small helpers ---------- */

  function safe(fn, fallback) {
    try { return fn(); } catch (error) { return fallback; }
  }

  function sessionGet(key) {
    return safe(function () { return window.sessionStorage.getItem(key); }, null);
  }

  function sessionSet(key, value) {
    return safe(function () { window.sessionStorage.setItem(key, value); return true; }, false);
  }

  function sessionRemove(key) {
    safe(function () { window.sessionStorage.removeItem(key); });
  }

  function cookieEntries() {
    return safe(function () { return document.cookie ? document.cookie.split('; ') : []; }, []);
  }

  function readCookie(name) {
    var entries = cookieEntries();
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i].indexOf(name + '=') === 0) return entries[i].slice(name.length + 1);
    }
    return '';
  }

  function onOwnDomain(candidate) {
    var domain = CONFIG.registrableDomain;
    return candidate === domain || candidate.slice(-domain.length - 1) === '.' + domain;
  }

  function expireCookie(name) {
    var base = name + '=; Path=/; Max-Age=0; SameSite=Lax';
    safe(function () {
      document.cookie = base;
      if (onOwnDomain(host)) document.cookie = base + '; Domain=.' + CONFIG.registrableDomain;
    });
  }

  /* Removes every cookie whose name starts with one of the prefixes. */
  function expireCookiesStartingWith(prefixes) {
    cookieEntries().forEach(function (entry) {
      var name = entry.split('=')[0];
      if (prefixes.some(function (prefix) { return name.indexOf(prefix) === 0; })) expireCookie(name);
    });
  }

  function uid() {
    var random = safe(function () {
      var bytes = new Uint8Array(12);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }, '');
    if (!random) random = (Math.random().toString(16) + Math.random().toString(16)).replace(/[^a-f0-9]/g, '');
    return 'gh.' + Date.now().toString(36) + '.' + random.slice(0, 24);
  }

  function clip(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 100);
  }

  function pageUrl() {
    return window.location.origin + window.location.pathname;
  }

  /*
   * True for the listed paths themselves and for everything below them.
   * Vercel answers /%67uides/x, /guides%2Fx and /guides%5Cx like /guides/x and
   * the browser keeps the spelling it was given, so the decoded form is
   * compared. Keep equal to pathBlocked() in api/gh-events.js.
   */
  function pathMatches(candidate, prefixes) {
    var decoded = safe(function () { return decodeURIComponent(String(candidate || '/')).toLowerCase().split(/[?#]/)[0]; }, null);
    if (decoded === null) return true;
    var parts = [];
    decoded.split(/[\\/]/).forEach(function (part) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    });
    var clean = '/' + parts.join('/');
    return prefixes.some(function (prefix) {
      var base = prefix.replace(/\/+$/, '');
      return clean === base || clean.indexOf(base + '/') === 0;
    });
  }

  function queryKeys(text) {
    return safe(function () {
      var found = [];
      new URLSearchParams(String(text || '').replace(/^[?#]/, '')).forEach(function (value, key) { found.push(key.toLowerCase()); });
      return found;
    }, []);
  }

  function hasSensitiveKey(text, inPreviousAddress) {
    return queryKeys(text).some(function (key) {
      return CONFIG.sensitiveKeys.indexOf(key) !== -1 || (inPreviousAddress === true && CONFIG.referrerOnlyKeys.indexOf(key) !== -1);
    });
  }

  /* ---------- test switch (set by the visitor's own URL) ---------- */

  var query = safe(function () { return new URLSearchParams(window.location.search); }, null);
  var testParam = query ? query.get(TEST_KEY) : null;
  if (testParam === '1' || testParam === 'dry') sessionSet(TEST_KEY, testParam);
  if (testParam === '0') sessionRemove(TEST_KEY);
  /* The address decides for this page view; storage only remembers it for the next pages. */
  var testChoice = testParam === '1' || testParam === 'dry' ? testParam : testParam === '0' ? null : sessionGet(TEST_KEY);
  var dryRun = testChoice === 'dry';
  var testMode = dryRun || testChoice === '1';
  var testLog = testMode ? (window.__ghTrackLog = window.__ghTrackLog || []) : null;

  function log() {
    if (!testMode) return;
    var args = Array.prototype.slice.call(arguments);
    testLog.push(args);
    if (window.console) window.console.log.apply(window.console, [dryRun ? '[GHTrack dry run]' : '[GHTrack]'].concat(args));
  }

  if (testMode && sessionGet(TEST_KEY) !== testChoice) {
    log('this browser cannot remember the test switch: it only applies to this page view, add it to every address');
  }

  /* ---------- where tracking may run ---------- */

  /* The page someone came from, as a URL object, or null. Google and Meta receive it too. */
  var cameFrom = safe(function () { return document.referrer ? new URL(document.referrer) : null; }, null);

  function referrerBlocked() {
    if (!cameFrom) return false;
    if (hasSensitiveKey(cameFrom.search, true) || hasSensitiveKey(cameFrom.hash, true)) return true;
    return cameFrom.hostname.toLowerCase() === host && pathMatches(cameFrom.pathname, CONFIG.blockedPaths);
  }

  function pageBlocked() {
    return pathMatches(path, CONFIG.blockedPaths) || hasSensitiveKey(window.location.search) ||
      hasSensitiveKey(window.location.hash) || referrerBlocked();
  }

  /*
   * 'off'    Meta gets nothing from this page.
   * 'relay'  no Pixel on this page view; conversions still go through our server,
   *          which passes on this page's address only, never the previous one.
   * 'full'   Pixel and server.
   */
  function metaMode() {
    if (pathMatches(path, CONFIG.metaExcludedPaths)) return 'off';
    if (safe(function () { return !!document.querySelector(CONFIG.notFoundSelector); }, false)) return 'off';
    var fromOwnSite = cameFrom && (cameFrom.hostname.toLowerCase() === host || onOwnDomain(cameFrom.hostname.toLowerCase()));
    if (fromOwnSite && pathMatches(cameFrom.pathname, CONFIG.metaExcludedPaths)) return 'relay';
    return 'full';
  }

  /* ---------- purchase page: remember the Stripe session id, it leaves the address bar below ---------- */

  var purchaseSessionId = '';
  if (pageKind === 'purchase' && query) {
    var candidate = query.get('session_id') || '';
    if (/^cs_(live|test)_[A-Za-z0-9]{10,120}$/.test(candidate)) purchaseSessionId = candidate;
  }

  /*
   * The address bar keeps only campaign and click-id parameters (nothing at
   * all on the purchase page). Anything else, such as a session id or a
   * newsletter subscriber id, would otherwise travel to Google and Meta inside
   * the page URL, or one page later as the previous address. Returns false
   * when that did not work; then no tag is loaded on this page.
   */
  var addressState = '';
  function addressIsClean() {
    return safe(function () {
      var keys = queryKeys(window.location.search);
      for (var i = 0; i < keys.length; i += 1) {
        if (pageKind === 'purchase' || CONFIG.allowedKeys.indexOf(keys[i]) === -1) return false;
      }
      return window.location.hash.indexOf('=') === -1;
    }, false);
  }

  function cleanAddressBar() {
    if (addressState) return addressState === 'clean';
    safe(function () {
      /* The parts that stay are kept exactly as they were written, so campaign names do not change. */
      var kept = window.location.search.replace(/^\?/, '').split('&').filter(function (part) {
        var key = safe(function () { return decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')); }, '');
        return part && pageKind !== 'purchase' && CONFIG.allowedKeys.indexOf(key.toLowerCase()) !== -1;
      });
      var hash = window.location.hash.indexOf('=') === -1 ? window.location.hash : '';
      var rest = kept.join('&');
      var target = window.location.pathname + (rest ? '?' + rest : '') + hash;
      if (target !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(window.history.state, '', target);
      }
    });
    addressState = addressIsClean() ? 'clean' : 'failed';
    return addressState === 'clean';
  }

  var enabled = (production || testMode) && !pageBlocked();

  /* ---------- consent ---------- */

  /* The newest valid choice in the cookie, or null when there is none. */
  function cookieConsent() {
    var best = null;
    var bestTime = -Infinity;
    cookieEntries().forEach(function (entry) {
      if (entry.indexOf(CONSENT_COOKIE + '=') !== 0) return;
      safe(function () {
        var value = JSON.parse(decodeURIComponent(entry.slice(CONSENT_COOKIE.length + 1)));
        var time = Date.parse(value.updatedAt);
        if (value.version !== CONSENT_VERSION || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') return;
        if (!(Date.now() - time < CONSENT_MAX_AGE_MS) || !(time > bestTime)) return;
        bestTime = time;
        best = value;
      });
    });
    return best ? { analytics: best.analytics, marketing: best.marketing, decided: true } : null;
  }

  /*
   * The cookie is leading, because it also reflects a choice made in another
   * tab. Without a cookie (blocked cookies) the choice made on this page counts.
   * Choices stored under an older consent text (version 1) never count.
   */
  function readConsent() {
    var stored = cookieConsent();
    if (stored) return stored;
    /* A consent cookie that exists but does not count here (newer text, unreadable) is a "no", whatever this page remembers. */
    if (readCookie(CONSENT_COOKIE)) return { analytics: false, marketing: false, decided: false };
    var api = window.GodHealthConsent;
    var state = api && typeof api.get === 'function' ? safe(function () { return api.get(); }, null) : null;
    if (state && state.version === CONSENT_VERSION && state.decided === true) {
      return { analytics: state.analytics === true, marketing: state.marketing === true, decided: true };
    }
    return { analytics: false, marketing: false, decided: false };
  }

  var consent = { analytics: false, marketing: false, decided: false };

  /* ---------- Google tag ---------- */

  var googleLoaded = false;
  var googleActive = false;
  var googleConsentSent = '';

  /* Must push the real arguments object: the Google tag ignores plain arrays. */
  function gtag() { window[DATA_LAYER].push(arguments); }

  function syncGoogleConsent() {
    var ads = CONFIG.googleAdSignals && consent.marketing ? 'granted' : 'denied';
    var state = {
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads
    };
    var signature = state.analytics_storage + '/' + ads;
    if (signature === googleConsentSent) return;
    googleConsentSent = signature;
    gtag('consent', 'update', state);
  }

  function enableGoogle() {
    window['ga-disable-' + CONFIG.ga4Id] = false;
    if (!googleLoaded) {
      /* A data layer of our own, so older dataLayer.push() calls on these sites never reach the tag. */
      window[DATA_LAYER] = [];
      gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500
      });
      syncGoogleConsent();
      /*
       * gtag('set', {debug_mode}) does not reach Analytics hits. In test mode
       * the automatic page view is therefore replaced by one that carries the
       * flag. Google's own scroll, outbound-click and engagement events of
       * that visit stay unflagged.
       */
      if (testMode) gtag('set', { send_page_view: false });
      gtag('js', new Date());
      if (testMode) gtag('event', 'page_view', { debug_mode: true });
      if (!dryRun) {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CONFIG.ga4Id) + '&l=' + DATA_LAYER;
        document.head.appendChild(script);
      }
      googleLoaded = true;
      log('Google tag loaded', CONFIG.ga4Id);
    }
    googleActive = true;
  }

  /* Tell the tag consent is gone, block further hits, remove its cookies. The page reload in apply() does the rest. */
  function disableGoogle() {
    googleActive = false;
    if (googleLoaded) syncGoogleConsent();
    window['ga-disable-' + CONFIG.ga4Id] = true;
    expireCookiesStartingWith(['_ga', '_gcl_', '_gac_']);
    log('Google Analytics switched off');
  }

  function sendGoogle(name, params) {
    if (!googleActive || !name) return;
    var payload = {};
    Object.keys(params || {}).forEach(function (key) { payload[key] = params[key]; });
    if (testMode) payload.debug_mode = true;
    gtag('event', name, payload);
    log('GA4', name, payload);
  }

  /* ---------- Meta Pixel and relay ---------- */

  var pixelLoaded = false;
  var pixelActive = false;
  var relayActive = false;
  var relayDormant = false;

  function fbq() { return window.fbq.apply(window, arguments); }

  function loadPixel(firstInitUser) {
    if (!window.fbq) {
      var stub = window.fbq = function () {
        if (stub.callMethod) stub.callMethod.apply(stub, arguments);
        else stub.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = stub;
      stub.push = stub;
      stub.loaded = true;
      stub.version = '2.0';
      stub.queue = [];
      if (!dryRun) {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        document.head.appendChild(script);
      }
    }
    /*
     * These are ordinary pages. Without this flag the Pixel sends a PageView of
     * its own whenever only the #fragment changes (an in-page link). The
     * library reads it from window.fbq when its first event is sent.
     */
    window.fbq.disablePushState = true;
    /* No automatic button or form capture: only the events in this file are sent. */
    fbq('set', 'autoConfig', false, CONFIG.metaPixelId);
    if (firstInitUser && firstInitUser.em) fbq('init', CONFIG.metaPixelId, { em: firstInitUser.em });
    else fbq('init', CONFIG.metaPixelId);
    fbq('track', 'PageView', {}, { eventID: uid() });
    pixelLoaded = true;
    log('Meta Pixel loaded', CONFIG.metaPixelId);
  }

  function enableMeta(firstInitUser) {
    var mode = metaMode();
    if (mode === 'off') return;
    relayActive = true;
    if (mode !== 'full') return;
    if (!pixelLoaded) loadPixel(firstInitUser);
    else if (!pixelActive) fbq('consent', 'grant');
    pixelActive = true;
  }

  function disableMeta() {
    if (pixelLoaded && pixelActive) fbq('consent', 'revoke');
    pixelActive = false;
    relayActive = false;
    sessionRemove(PENDING_KEY);
    expireCookiesStartingWith(['_fb']);
    log('Meta switched off');
  }

  function metaCustomData(params) {
    var out = {};
    if (!params) return out;
    if (typeof params.value === 'number' && params.currency) {
      out.value = params.value;
      out.currency = params.currency;
    }
    if (params.offer) {
      out.content_name = params.offer;
      out.content_ids = [params.offer];
      out.content_type = 'product';
    } else if (params.contact_method) {
      out.content_name = params.contact_method;
    }
    return out;
  }

  /* When the Pixel has not written _fbc yet, build it from the ad click id in the URL. */
  var landingClickId = (function () {
    var fbclid = query ? query.get('fbclid') : '';
    return fbclid && /^[A-Za-z0-9_-]{8,500}$/.test(fbclid) ? 'fb.1.' + Date.now() + '.' + fbclid : '';
  })();

  /*
   * Conversions also go to our own server, which passes them to Meta once the
   * Conversions API token exists. While it answers "dormant" no further
   * requests are made on this page. The server takes prices from its own list
   * and ignores the ones sent here.
   */
  function relay(events) {
    if (!relayActive || relayDormant || !events.length) return;
    var now = Math.floor(Date.now() / 1000);
    var body = { v: 1, site: site, events: events.map(function (event) {
      var item = { name: event.name, id: event.id, time: now, url: pageUrl() };
      if (event.custom && Object.keys(event.custom).length) item.custom = event.custom;
      if (event.user && event.user.em) item.user = { em: event.user.em };
      return item;
    }) };
    if (landingClickId && !readCookie('_fbc')) body.fbc = landingClickId;
    log('relay', body);
    if (dryRun) return;
    var text = JSON.stringify(body);
    var started = safe(function () {
      window.fetch(CONFIG.relayUrl, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: text
      }).then(function (response) { return response.json(); }).then(function (answer) {
        if (answer && answer.dormant === true) relayDormant = true;
      }).catch(function () {});
      return true;
    }, false);
    if (!started) {
      safe(function () { window.navigator.sendBeacon(CONFIG.relayUrl, new Blob([text], { type: 'application/json' })); });
    }
  }

  function sendMeta(definition, params, id, options) {
    if (!definition.meta) return;
    var custom = metaCustomData(params);
    if (pixelActive && options.pixel) {
      fbq('track', definition.meta, custom, { eventID: id });
      log('Meta', definition.meta, custom, id);
    }
    if (definition.relay && options.relay) relay([{ name: definition.meta, id: id, custom: custom, user: options.user }]);
  }

  /* ---------- the one way to send an event ---------- */

  function analyticsParams(params) {
    var out = {};
    Object.keys(params || {}).forEach(function (key) {
      if (key === 'offer' || key === 'offer_name') return;
      out[key] = typeof params[key] === 'string' ? clip(params[key], 100) : params[key];
    });
    if (params && params.offer && typeof params.value === 'number') {
      out.items = [{ item_id: params.offer, item_name: params.offer_name || params.offer, price: params.value, quantity: 1 }];
    }
    return out;
  }

  /* options: { id, google: false, pixel: false, relay: false, user } */
  function track(name, params, options) {
    var definition = EVENTS[name];
    var settings = options || {};
    if (!enabled || !definition) return '';
    var id = settings.id || uid();
    safe(function () {
      if (settings.google !== false) sendGoogle(definition.ga, analyticsParams(params));
      sendMeta(definition, params, id, { pixel: settings.pixel !== false, relay: settings.relay !== false, user: settings.user });
    });
    return id;
  }

  /* ---------- leads: hand over to the next page ---------- */

  function sha256(text) {
    return window.crypto.subtle.digest('SHA-256', new window.TextEncoder().encode(text)).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  /* The hash is made in the browser. The plain email never goes to our server or to Meta. */
  function hashedUser(details) {
    if (!CONFIG.hashedEmail || !details || !relayActive || !window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve({});
    var email = clip(details.email, 254).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Promise.resolve({});
    return sha256(email).then(function (hash) { return { em: hash }; }).catch(function () { return {}; });
  }

  /*
   * details: { type, email, nextPage }
   * With nextPage (the form redirects to a thank-you page) the browser part of
   * the event is sent on that next page, where the Pixel can start with the
   * hashed email. The server part goes out right away, so it is not lost if
   * the next page never loads. The promise settles within 0.6 s in every case,
   * so a form can safely wait for it before redirecting.
   */
  function lead(details) {
    var info = details || {};
    var params = { lead_type: clip(info.type || 'unknown', 40) };
    recheckConsent();
    if (!enabled || (!googleActive && !relayActive)) return Promise.resolve('');
    var id = uid();
    if (!info.nextPage) {
      track('lead', params, { id: id });
      return Promise.resolve(id);
    }
    /*
     * The note for the next page is written first, before anything that takes
     * time. Each part is only sent there if it was allowed now and still is then.
     */
    var entry = { v: 1, time: Date.now(), name: 'lead', id: id, params: params, google: googleActive, meta: pixelActive, user: {} };
    var stored = sessionSet(PENDING_KEY, JSON.stringify(entry));
    /* No storage available: send the browser part here instead. */
    if (!stored) track('lead', params, { id: id, relay: false });
    var work = hashedUser(info).then(function (user) {
      relay([{ name: EVENTS.lead.meta, id: id, user: user }]);
      if (stored && entry.meta && user.em) {
        entry.user = user;
        sessionSet(PENDING_KEY, JSON.stringify(entry));
      }
      return id;
    });
    var timeout = new Promise(function (resolve) { window.setTimeout(function () { resolve(id); }, 600); });
    return Promise.race([work, timeout]).catch(function () { return id; });
  }

  function takePending() {
    var raw = sessionGet(PENDING_KEY);
    if (!raw) return null;
    sessionRemove(PENDING_KEY);
    return safe(function () {
      var entry = JSON.parse(raw);
      if (!entry || entry.v !== 1 || !EVENTS[entry.name] || !(Date.now() - entry.time < PENDING_MAX_AGE_MS)) return null;
      return entry;
    }, null);
  }

  /* ---------- clicks ---------- */

  function labelOf(element) {
    var parts = [];
    var walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return clip(parts.join(' '), 100);
  }

  function sectionOf(element) {
    var section = element.closest('section[id]');
    if (section) return section.id;
    if (element.closest('header')) return 'header';
    if (element.closest('footer')) return 'footer';
    return 'page';
  }

  /*
   * Which event a link stands for, judged by where it leads. Every link to
   * that destination counts, also in the navigation and the footer;
   * cta_section tells them apart in the reports.
   */
  function clickEvent(link) {
    /* Browsers ignore spaces around an address, so ' tel:...' still dials. */
    var raw = (link.getAttribute('href') || '').trim();
    if (/^tel:/i.test(raw)) return { name: 'phone_click', params: { contact_method: 'phone' } };
    if (/^mailto:/i.test(raw)) return { name: 'email_click', params: { contact_method: 'email' } };
    var url = safe(function () { return new URL(link.href); }, null);
    if (!url || !/^https?:$/.test(url.protocol)) return null;
    var targetHost = url.hostname.toLowerCase();
    var targetPath = url.pathname.replace(/\/+$/, '') || '/';
    var linkUrl = clip(url.origin + url.pathname, 100);

    if (targetHost === 'calendly.com' || targetHost.slice(-13) === '.calendly.com') {
      return { name: 'strategy_call_clicked', params: { contact_method: 'calendly', link_url: linkUrl } };
    }
    if (targetHost === 'wa.me' || targetHost === 'api.whatsapp.com') {
      return { name: 'whatsapp_click', params: { contact_method: 'whatsapp' } };
    }
    if (targetHost === 'buy.stripe.com') {
      var key = CONFIG.stripeLinks[targetPath.split('/').pop()];
      var product = key ? CONFIG.products[key] : null;
      var params = { link_url: linkUrl };
      if (product) {
        params.offer = key;
        params.offer_name = product.name;
        params.value = product.value;
        params.currency = product.currency;
      }
      return { name: 'begin_checkout', params: params };
    }
    if (targetHost === 'sales.godhealth.org' && host !== targetHost) {
      return { name: site === 'blueprint' ? 'thank_you_sales_click' : 'bundle_cta_clicked', params: { link_url: linkUrl } };
    }
    if (targetHost === 'blueprint.godhealth.org' && host !== targetHost) {
      return { name: 'blueprint_cta_clicked', params: { link_url: linkUrl } };
    }
    if (targetPath === SCAN_PATH && path !== targetPath) {
      return { name: 'scan_cta_clicked', params: { link_url: linkUrl } };
    }
    return null;
  }

  function onClick(event) {
    recheckConsent();
    if (!enabled || (!googleActive && !relayActive)) return;
    safe(function () {
      var target = event.target;
      var link = target && target.closest ? target.closest('a[href]') : null;
      if (!link) return;
      var found = clickEvent(link);
      if (!found) return;
      found.params.cta_label = labelOf(link);
      found.params.cta_section = clip(sectionOf(link), 40);
      track(found.name, found.params);
    });
  }

  /* ---------- page level events ---------- */

  function viewOffer() {
    var offer = null;
    CONFIG.offers.forEach(function (candidate) {
      if (!offer && candidate.site === site && candidate.path.test(path)) offer = candidate;
    });
    if (!offer) return;
    var params = { offer: offer.key };
    if (typeof offer.value === 'number') {
      params.value = offer.value;
      params.currency = offer.currency;
    }
    track('view_offer', params);
  }

  /* ---------- purchase page ---------- */

  var purchase = { busy: false, closed: false, data: null, askedWithMarketing: false, google: false, pixel: false, retries: 0 };

  /*
   * Only an order that Stripe confirmed as paid is reported, with the amount
   * Stripe gives. A reload sends nothing again, because the session id is no
   * longer in the address bar by then.
   */
  function reportPurchase() {
    var data = purchase.data;
    if (!data || data.ok !== true || data.verified !== true || typeof data.value !== 'number' || !data.currency || !data.id) return;
    var product = CONFIG.products[data.product];
    var params = {
      transaction_id: data.id,
      value: data.value,
      currency: data.currency,
      offer: product ? data.product : 'godhealth_order',
      offer_name: product ? product.name : 'GodHealth order'
    };
    if (typeof data.tax === 'number' && data.tax > 0) params.tax = data.tax;
    if (googleActive && !purchase.google) {
      purchase.google = true;
      track('purchase', params, { id: data.id, pixel: false, relay: false });
    }
    if (pixelActive && !purchase.pixel) {
      purchase.pixel = true;
      track('purchase', params, { id: data.id, google: false, relay: false });
    }
  }

  function retryPurchase() {
    if (purchase.retries >= PURCHASE_RETRY_MS.length) return;
    var wait = PURCHASE_RETRY_MS[purchase.retries];
    purchase.retries += 1;
    window.setTimeout(function () { safe(checkPurchase); }, wait);
  }

  /*
   * Asks our server whether the Stripe session is a paid order. The server also
   * reports a confirmed order to Meta when marketing is allowed, so the request
   * is repeated once if that permission arrives later on the same page.
   */
  function checkPurchase() {
    if (!purchaseSessionId || purchase.busy || purchase.closed || (!googleActive && !relayActive)) return;
    if (purchase.data && (purchase.askedWithMarketing || !relayActive)) return reportPurchase();
    purchase.busy = true;
    var withMarketing = relayActive;
    var request = { session_id: purchaseSessionId };
    if (dryRun) request.dry = true;
    var started = safe(function () {
      window.fetch(CONFIG.purchaseUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }).then(function (response) { return response.json(); }).then(function (data) {
        purchase.busy = false;
        log('purchase check', data);
        if (data && data.ok === true) {
          purchase.data = data;
          purchase.askedWithMarketing = withMarketing;
          reportPurchase();
          /* Marketing was allowed while this request was under way: ask once more, so the server reports to Meta too. */
          if (relayActive && !withMarketing) checkPurchase();
        } else if (data && data.retry === true) {
          retryPurchase();
        } else {
          /* Not a paid order, or the check is not set up yet: nothing is reported. */
          purchase.closed = true;
        }
      }).catch(function () {
        purchase.busy = false;
        retryPurchase();
      });
      return true;
    }, false);
    if (!started) purchase.busy = false;
  }

  /* ---------- start and consent changes ---------- */

  var pending = null;
  var done = { pendingGoogle: false, pendingPixel: false, offer: false };

  /* A withdrawal found while the visitor was busy on the page: the reload still has to come. */
  var reloadDue = false;

  /*
   * quiet: called from a click, a form or a window that gets the focus. A
   * withdrawal then silences the tags at once, but the reload waits until the
   * page is next shown, so it cannot cut off what the visitor is doing (a
   * reload during a click stops a form that is being sent).
   */
  function apply(quiet) {
    if (!enabled) return;
    var next = readConsent();
    if ((next.analytics || next.marketing) && !cleanAddressBar()) {
      log('the address bar could not be cleaned, so nothing is loaded on this page');
      return;
    }
    var previous = consent;
    consent = next;
    if (!consent.marketing) CONFIG.marketingSessionKeys.forEach(sessionRemove);
    /*
     * An answered "no" also removes cookies left from an earlier "yes": a
     * choice that lapsed, or one withdrawn on a page where this file does not
     * run. As long as the visitor has not answered, nothing is touched.
     */
    if (consent.decided && !consent.analytics && !previous.analytics) expireCookiesStartingWith(['_ga', '_gcl_', '_gac_']);
    if (consent.decided && !consent.marketing && !previous.marketing) expireCookiesStartingWith(['_fb']);
    /* A tag that is already on the page keeps running after a "no", so the page is reloaded without it. */
    var withdrawn = reloadDue || (previous.analytics && !consent.analytics && googleLoaded) ||
      (previous.marketing && !consent.marketing && pixelLoaded);

    if (consent.analytics) enableGoogle();
    else if (previous.analytics) disableGoogle();
    if (googleLoaded) syncGoogleConsent();

    if (consent.marketing) enableMeta(pending && pending.meta ? pending.user : null);
    else if (previous.marketing) disableMeta();

    if (withdrawn) {
      if (quiet === true) {
        reloadDue = true;
        log('choice withdrawn in another window: tags silenced, the reload follows when the page is next shown');
        return;
      }
      reloadDue = false;
      log('page reload after a withdrawn choice');
      if (!dryRun) window.location.reload();
      return;
    }

    if (pending && pending.google && googleActive && !done.pendingGoogle) {
      done.pendingGoogle = true;
      track(pending.name, pending.params, { id: pending.id, pixel: false, relay: false });
    }
    if (pending && pending.meta && pixelActive && !done.pendingPixel) {
      done.pendingPixel = true;
      track(pending.name, pending.params, { id: pending.id, google: false, relay: false });
    }
    if (pixelActive && !done.offer) {
      done.offer = true;
      viewOffer();
    }
    if (pageKind === 'purchase') checkPurchase();
  }

  /*
   * Another window may have changed the choice while this page stayed in view,
   * so the cookie is read again before anything is sent.
   */
  function recheckConsent() {
    if (!enabled) return;
    var now = readConsent();
    if (now.analytics !== consent.analytics || now.marketing !== consent.marketing || now.decided !== consent.decided) {
      safe(function () { apply(true); });
    }
  }

  window.GHTrack = Object.freeze({
    version: '1.3.0',
    track: function (name, params) { recheckConsent(); return track(name, params); },
    lead: lead
  });

  if (!enabled) {
    log('inactive on this page');
    return;
  }

  pending = takePending();
  /*
   * The address bar is tidied as soon as this file runs, also without a cookie
   * choice. Otherwise a key that is not on the list still reaches Google and
   * Meta one page later, as the previous address. The purchase page keeps its
   * session id until a choice exists (it has to survive a reload); that page
   * carries <meta name="referrer" content="origin"> instead.
   */
  if (pageKind !== 'purchase') cleanAddressBar();
  document.addEventListener('click', onClick, true);
  document.addEventListener('gh:consent-change', function () { safe(apply); });
  /* A choice changed in another tab, or a page restored from the back/forward cache. */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') safe(apply); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) safe(apply); });
  /* A second window that stays visible gets no visibilitychange: look again when this one is used. */
  window.addEventListener('focus', function () { safe(recheckConsent); });
  safe(apply);
})(window, document);
