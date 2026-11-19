/*
 * GodHealth event relay: browser -> this function -> Meta Conversions API.
 *
 * The same file is used by www.godhealth.org, sales.godhealth.org and
 * blueprint.godhealth.org. Keep the copies identical.
 *
 * It stays dormant until META_CAPI_ACCESS_TOKEN is set in Vercel
 * (Project > Settings > Environment Variables, Production only), followed by a
 * redeploy. Until then every request is answered with "not_configured" and
 * nothing leaves the server.
 *
 * Check the configuration by opening /api/gh-events in a browser: it shows
 * whether forwarding is on and why not, never a secret. "forwarding": true
 * only says that a token is present, not that Meta accepts it. After setting
 * the token, set META_TEST_EVENT_CODE for a moment, trigger one event, look
 * for it under Events Manager > Test events, and remove the code again.
 *
 * Environment variables:
 *   META_CAPI_ACCESS_TOKEN  required to forward. Never commit it.
 *   META_PIXEL_ID           optional, defaults to the GodHealth pixel.
 *   META_API_VERSION        optional, defaults to v27.0.
 *   META_TEST_EVENT_CODE    optional. Only for testing: events sent with a test
 *                           code still count in Meta, so remove it afterwards.
 * A value that is set but malformed switches forwarding off ("bad_config").
 *
 * Anyone can call this address, so it trusts nothing the page sends:
 *   - Same-origin POST only.
 *   - The visitor's cookie choice (current consent version) must allow
 *     marketing. Without it nothing is sent.
 *   - Only a fixed list of conversion events. Prices come from the list in
 *     this file, never from the page.
 *   - Never for the private apps or the health-topic articles.
 *   - The only contact detail accepted is an email address that was hashed
 *     (SHA-256) in the browser, only with a Lead, only on the Blueprint site.
 *   - No request data is written to the logs.
 */
'use strict';

const crypto = require('crypto');
const net = require('net');

const DEFAULT_PIXEL_ID = '4064076763888809';
const DEFAULT_API_VERSION = 'v27.0';
const CONSENT_COOKIE = 'gh_cookie_consent';
/* Belongs to the consent wording. Keep equal to assets/gh-consent.js and gh-tracking.js. */
const CONSENT_VERSION = 2;
const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/* A visitor's clock may run ahead of ours. */
const CONSENT_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 10;
const META_TIMEOUT_MS = 2500;
const MAX_EVENT_AGE_S = 600;

/*
 * Conversions only. Page views and "viewed an offer" are sent by the Pixel in
 * the browser; Purchase is reported by api/gh-purchase.js after a Stripe check.
 */
const ALLOWED_EVENTS = new Set(['Contact', 'Lead', 'InitiateCheckout']);

const ALLOWED_SITE_HOSTS = new Set([
  'www.godhealth.org',
  'sales.godhealth.org',
  'blueprint.godhealth.org',
]);

/*
 * The one site with a sign-up form that reports a Lead. Its form tells the
 * visitor that a hashed email address goes to Meta.
 */
const LEAD_HOSTS = new Set(['blueprint.godhealth.org']);

/* Same lists as assets/gh-tracking.js: private apps, the Vitality Scan and health-topic articles. */
const BLOCKED_PATHS = ['/client', '/coach-dashboard', '/kingdom-capacity-assessment', '/kca', '/kingdom-vitality-scan.html', '/guides', '/topics'];

/* What a started checkout is worth. Keep equal to "products" in assets/gh-tracking.js. */
const PRODUCTS = {
  nutrition_bundle: { value: 17, currency: 'USD' },
  biblical_health_pdf_package: { value: 47, currency: 'USD' },
};

const HEX64 = /^[a-f0-9]{64}$/;
const EVENT_ID = /^[A-Za-z0-9._:-]{6,100}$/;
const FBP = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,20}(\.[A-Za-z0-9_-]{1,16})?$/;
const FBC = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{8,500}(\.[A-Za-z0-9_-]{1,16})?$/;
const CONTENT_KEY = /^[a-z0-9_-]{1,60}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function header(req, name) {
  const value = req.headers ? req.headers[name] : undefined;
  return Array.isArray(value) ? value[0] : value || '';
}

function isProduction(env) {
  return !env.VERCEL_ENV || env.VERCEL_ENV === 'production';
}

function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(host);
}

function parseCookies(cookieHeader) {
  const jar = Object.create(null);
  String(cookieHeader || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 1) return;
    const name = part.slice(0, index).trim();
    if (!(name in jar)) jar[name] = part.slice(index + 1).trim();
  });
  return jar;
}

/*
 * Reads the same cookie the consent banner writes. Returns booleans.
 * Only a choice made under the current consent text counts. If the cookie is
 * present more than once, a "no" in any valid copy wins.
 */
function readConsent(cookieHeader, now) {
  let found = false;
  let analytics = true;
  let marketing = true;
  String(cookieHeader || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 1 || part.slice(0, index).trim() !== CONSENT_COOKIE) return;
    try {
      const value = JSON.parse(decodeURIComponent(part.slice(index + 1).trim()));
      if (!value || value.version !== CONSENT_VERSION) return;
      if (typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') return;
      const updated = Date.parse(value.updatedAt);
      if (!Number.isFinite(updated) || now - updated >= CONSENT_MAX_AGE_MS || updated - now > CONSENT_CLOCK_SKEW_MS) return;
      found = true;
      analytics = analytics && value.analytics;
      marketing = marketing && value.marketing;
    } catch (error) { /* An unreadable copy counts as no choice. */ }
  });
  return found ? { analytics, marketing } : { analytics: false, marketing: false };
}

/*
 * The page that called us must be on the host that serves this function.
 * Browsers send Origin with every POST; Referer is the fallback.
 */
function sameOrigin(req) {
  const host = header(req, 'host').toLowerCase();
  const source = header(req, 'origin') || header(req, 'referer');
  if (!host || !source) return false;
  try {
    return new URL(source).host.toLowerCase() === host;
  } catch (error) {
    return false;
  }
}

function readBody(req) {
  let body = req.body;
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return null;
    try { body = JSON.parse(body); } catch (error) { return null; }
  } else if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return null;
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

function clientIp(req) {
  const forwarded = header(req, 'x-forwarded-for').split(',')[0].trim();
  const candidate = forwarded || header(req, 'x-real-ip').trim();
  return net.isIP(candidate) ? candidate : '';
}

/*
 * Vercel answers /%67uides/x, /guides%2Fx, /guides%5Cx and /%2Fguides/x exactly
 * like /guides/x, and the browser keeps the spelling it was given. So the
 * decoded form is compared. Keep equal to pathMatches() in assets/gh-tracking.js.
 */
function pathBlocked(pathname) {
  let clean = '';
  try {
    clean = decodeURIComponent(String(pathname || '/')).toLowerCase().split(/[?#]/)[0];
  } catch (error) {
    return true; /* cannot be decoded: refuse */
  }
  const parts = [];
  clean.split(/[\\/]/).forEach((part) => {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  });
  clean = '/' + parts.join('/');
  return BLOCKED_PATHS.some((prefix) => clean === prefix || clean.indexOf(prefix + '/') === 0);
}

/* Only origin + path of an allowed page on this host. Query and hash never go to Meta. */
function pageUrl(candidate, req) {
  const host = header(req, 'host').toLowerCase();
  try {
    const url = new URL(String(candidate || ''));
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(host))) return '';
    if (url.host.toLowerCase() !== host) return '';
    if (pathBlocked(url.pathname)) return '';
    return (url.origin + url.pathname).slice(0, 500);
  } catch (error) {
    return '';
  }
}

/*
 * The page only names what the event is about (an offer or a contact
 * channel). For a started checkout, value and currency come from PRODUCTS.
 */
function customData(input, eventName) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  const name = typeof input.content_name === 'string' && CONTENT_KEY.test(input.content_name) ? input.content_name : '';
  if (!name) return out;
  out.content_name = name;
  const product = Object.prototype.hasOwnProperty.call(PRODUCTS, name) ? PRODUCTS[name] : null;
  if (eventName === 'InitiateCheckout' && product) {
    out.value = product.value;
    out.currency = product.currency;
    out.content_ids = [name];
    out.content_type = 'product';
  }
  return out;
}

/* Browser identifiers every forwarded event carries. Shared with api/gh-purchase.js. */
function browserData(req, cookies, body) {
  const data = {};
  const ip = clientIp(req);
  const agent = header(req, 'user-agent').slice(0, 500);
  if (ip) data.client_ip_address = ip;
  if (agent) data.client_user_agent = agent;
  /* Prefer the cookies of this request; the body only carries a click id the Pixel has not stored yet. */
  const fbp = cookies._fbp;
  const fbc = cookies._fbc || (body && body.fbc);
  if (typeof fbp === 'string' && FBP.test(fbp)) data.fbp = fbp;
  if (typeof fbc === 'string' && FBC.test(fbc)) data.fbc = fbc;
  return data;
}

/* A Lead, and the hashed email that may come with it, only from the sign-up site. */
function leadAllowed(req, env) {
  return LEAD_HOSTS.has(header(req, 'host').toLowerCase()) || !isProduction(env);
}

function userData(event, body, req, cookies, env) {
  const data = browserData(req, cookies, body);
  const user = event.user && typeof event.user === 'object' ? event.user : {};
  if (event.name === 'Lead' && leadAllowed(req, env) && typeof user.em === 'string' && HEX64.test(user.em)) {
    data.em = [user.em];
  }
  return data;
}

function buildEvents(body, req, cookies, nowSeconds, env) {
  const list = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const events = [];
  list.forEach((event) => {
    if (!event || typeof event !== 'object') return;
    if (typeof event.name !== 'string' || !ALLOWED_EVENTS.has(event.name)) return;
    if (event.name === 'Lead' && !leadAllowed(req, env)) return;
    if (typeof event.id !== 'string' || !EVENT_ID.test(event.id)) return;
    const url = pageUrl(event.url, req);
    if (!url) return;
    const user = userData(event, body, req, cookies, env);
    /* Meta rejects events that carry a user agent and nothing else. */
    if (!user.client_user_agent || !(user.client_ip_address || user.fbp || user.fbc || user.em)) return;
    const age = typeof event.time === 'number' ? nowSeconds - Math.floor(event.time) : 0;
    const item = {
      event_name: event.name,
      event_time: age >= 0 && age <= MAX_EVENT_AGE_S ? nowSeconds - age : nowSeconds,
      event_id: event.id,
      action_source: 'website',
      event_source_url: url,
      user_data: user,
    };
    const custom = customData(event.custom, event.name);
    if (Object.keys(custom).length) item.custom_data = custom;
    events.push(item);
  });
  return events;
}

/* The Meta settings of this deployment, or null when a value is set but malformed. */
function metaConfig(env) {
  const pixelId = String(env.META_PIXEL_ID || '').trim();
  const version = String(env.META_API_VERSION || '').trim();
  const testCode = String(env.META_TEST_EVENT_CODE || '').trim();
  if (pixelId && !/^[0-9]{6,20}$/.test(pixelId)) return null;
  if (version && !/^v[0-9]{1,3}\.[0-9]$/.test(version)) return null;
  if (testCode && !/^[A-Za-z0-9_-]{1,60}$/.test(testCode)) return null;
  return {
    token: String(env.META_CAPI_ACCESS_TOKEN || '').trim(),
    pixelId: pixelId || DEFAULT_PIXEL_ID,
    version: version || DEFAULT_API_VERSION,
    testCode,
  };
}

async function postToMeta(url, payload, timeoutMs) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let answer = null;
    try { answer = await response.json(); } catch (error) { answer = null; }
    const failure = (answer && answer.error) || {};
    const received = answer && Number(answer.events_received) > 0;
    return {
      ok: response.ok && received,
      status: response.status,
      code: Number(failure.code) || 0,
      subcode: Number(failure.error_subcode) || 0,
      trace: typeof (answer && answer.fbtrace_id) === 'string' ? answer.fbtrace_id.slice(0, 40) :
        typeof failure.fbtrace_id === 'string' ? failure.fbtrace_id.slice(0, 40) : '',
    };
  } catch (error) {
    return { ok: false, status: 0, code: 0, subcode: 0, trace: '' };
  }
}

/*
 * Shared with api/gh-purchase.js. Returns { ok, status, code, subcode, trace }. Never throws.
 * budgetMs: the longest the caller wants to wait in total (default: two full attempts).
 */
async function sendToMeta(events, env, budgetMs) {
  const deadline = Date.now() + (budgetMs || 2 * META_TIMEOUT_MS);
  const config = metaConfig(env);
  if (!config || !config.token) return { ok: false, status: 0, code: 0, subcode: 0, trace: '' };
  const payload = { data: events, access_token: config.token };
  if (config.testCode) payload.test_event_code = config.testCode;
  const url = 'https://graph.facebook.com/' + config.version + '/' + config.pixelId + '/events';
  let result = await postToMeta(url, payload, Math.min(META_TIMEOUT_MS, deadline - Date.now()));
  /* One more try after a timeout or a server error, if time is left. Meta counts an event id once, so this cannot double count. */
  const left = deadline - Date.now();
  if (!result.ok && (result.status === 0 || result.status >= 500) && left >= 250) {
    result = await postToMeta(url, payload, Math.min(META_TIMEOUT_MS, left));
  }
  return result;
}

/*
 * Why nothing may be forwarded from this deployment, or '' when it may.
 * Production forwards for the three GodHealth hosts only. Preview and
 * development deployments forward only when a test code is set, so a preview
 * link never sends anything by accident.
 */
function forwardingBlocked(env, host) {
  const config = metaConfig(env);
  if (!config) return 'bad_config';
  if (!config.token) return 'not_configured';
  if (isProduction(env)) return ALLOWED_SITE_HOSTS.has(host) ? '' : 'unknown_host';
  return config.testCode ? '' : 'preview_without_test_code';
}

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(status).json(body);
}

/* What a GET shows: the state of the configuration, never a secret. */
function relayStatus(env, host) {
  const config = metaConfig(env);
  const blocked = forwardingBlocked(env, host);
  return {
    forwarding: !blocked,
    reason: blocked,
    environment: env.VERCEL_ENV || 'not set',
    pixel_id: config ? config.pixelId : '',
    api_version: config ? config.version : '',
    test_code_set: Boolean(config && config.testCode),
  };
}

async function handle(req, res) {
  const host = header(req, 'host').toLowerCase();
  if (req.method === 'GET') {
    return reply(res, 200, Object.assign({ ok: true, service: 'gh-events' }, relayStatus(process.env, host)));
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return reply(res, 405, { ok: false, reason: 'method_not_allowed' });
  }
  if (!sameOrigin(req)) return reply(res, 403, { ok: false, reason: 'cross_origin' });

  let body = null;
  try { body = readBody(req); } catch (error) { body = null; }
  if (!body) return reply(res, 400, { ok: false, reason: 'bad_request' });

  const now = Date.now();
  const cookieHeader = header(req, 'cookie');
  if (!readConsent(cookieHeader, now).marketing) return reply(res, 200, { ok: true, forwarded: 0, reason: 'no_consent' });

  /* "dormant" tells the page not to call again during this page view. */
  const blocked = forwardingBlocked(process.env, host);
  if (blocked) return reply(res, 200, { ok: true, forwarded: 0, reason: blocked, dormant: true });

  const events = buildEvents(body, req, parseCookies(cookieHeader), Math.floor(now / 1000), process.env);
  if (!events.length) return reply(res, 200, { ok: true, forwarded: 0, reason: 'no_valid_events' });

  const result = await sendToMeta(events, process.env);
  if (!result.ok) {
    console.error('gh-events: Meta did not accept the events', JSON.stringify({
      status: result.status, code: result.code, subcode: result.subcode, trace: result.trace, count: events.length,
    }));
    return reply(res, 200, { ok: false, forwarded: 0, reason: 'meta_error' });
  }
  return reply(res, 200, { ok: true, forwarded: events.length });
}

async function handler(req, res) {
  try {
    return await handle(req, res);
  } catch (error) {
    console.error('gh-events: unexpected error', error && error.name);
    return reply(res, 200, { ok: false, forwarded: 0, reason: 'error' });
  }
}

module.exports = handler;
/* Exposed for api/gh-purchase.js and for the tests. Not part of the HTTP interface. */
module.exports.internals = {
  sha256, parseCookies, readConsent, sameOrigin, readBody, clientIp, pageUrl, pathBlocked, isProduction,
  customData, browserData, userData, buildEvents, metaConfig, sendToMeta, forwardingBlocked, relayStatus,
  header, reply, ALLOWED_EVENTS, CONSENT_VERSION, PRODUCTS,
};
