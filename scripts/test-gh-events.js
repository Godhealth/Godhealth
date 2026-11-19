/*
 * Tests for api/gh-events.js (the Meta Conversions API relay).
 * Run with:  node scripts/test-gh-events.js
 * No dependencies and no network: the call to Meta is replaced by a recorder.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const handler = require(path.join(__dirname, '..', 'api', 'gh-events.js'));

const HOST = 'www.godhealth.org';
const BLUEPRINT = { host: 'blueprint.godhealth.org', origin: 'https://blueprint.godhealth.org' };
const AGENT = 'Mozilla/5.0 (test)';
const HASH = 'a'.repeat(64);

function consentCookie(overrides) {
  const value = Object.assign({ version: 2, analytics: true, marketing: true, updatedAt: new Date().toISOString() }, overrides);
  return 'gh_cookie_consent=' + encodeURIComponent(JSON.stringify(value));
}

function request(options) {
  const settings = options || {};
  const headers = Object.assign({
    host: HOST,
    origin: 'https://' + HOST,
    'user-agent': AGENT,
    'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    'x-vercel-ip-country': 'NL',
    cookie: consentCookie() + '; _fbp=fb.1.1700000000000.1234567890',
  }, settings.headers);
  Object.keys(headers).forEach((key) => { if (headers[key] === null) delete headers[key]; });
  return { method: settings.method || 'POST', headers, body: settings.body };
}

function response() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

/* A click on a booking link on the main site. */
function event(overrides) {
  return Object.assign({ name: 'Contact', id: 'gh.abc123.def456', time: Math.floor(Date.now() / 1000), url: 'https://' + HOST + '/coaching?utm_source=x#top' }, overrides);
}

/* A Blueprint sign-up, as the Blueprint site sends it. */
function lead(overrides) {
  return event(Object.assign({ name: 'Lead', url: 'https://blueprint.godhealth.org/' }, overrides));
}

/*
 * Runs the handler with a fake Meta and a chosen environment.
 * meta: what Meta answers, per call. A status number, 'down' (no answer) or
 * 'empty' (200 without events_received). The last entry repeats.
 */
async function run(req, env, meta) {
  const calls = [];
  const answers = Array.isArray(meta) ? meta.slice() : [meta || 200];
  const realFetch = global.fetch;
  const realEnv = process.env;
  const realError = console.error;
  const errors = [];
  process.env = Object.assign({}, env);
  console.error = (...args) => { errors.push(args.join(' ')); };
  global.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer === 'down') throw new Error('network');
    if (answer === 'empty') return { ok: true, status: 200, json: async () => ({ events_received: 0 }) };
    return {
      ok: answer >= 200 && answer < 300,
      status: answer,
      json: async () => (answer === 200 ? { events_received: 1, fbtrace_id: 'TRACEOK' } :
        { error: { code: 190, error_subcode: 460, fbtrace_id: 'TRACE123', message: 'secret detail that must not leak' } }),
    };
  };
  const res = response();
  try {
    await handler(req, res);
  } finally {
    global.fetch = realFetch;
    process.env = realEnv;
    console.error = realError;
  }
  return { res, calls, errors };
}

const LIVE = { META_CAPI_ACCESS_TOKEN: 'test-token', VERCEL_ENV: 'production' };

test('stays silent while no token is configured', async () => {
  const { res, calls } = await run(request({ body: { events: [event()] } }), { VERCEL_ENV: 'production' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, forwarded: 0, reason: 'not_configured', dormant: true });
  assert.equal(calls.length, 0);
});

test('forwards a valid event once the token exists', async () => {
  const { res, calls } = await run(request({ body: { events: [event({ custom: { content_name: 'calendly' } })] } }), LIVE);
  assert.deepEqual(res.body, { ok: true, forwarded: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v27.0/4064076763888809/events');
  assert.equal(calls[0].body.access_token, 'test-token');
  assert.equal(calls[0].body.test_event_code, undefined);
  const sent = calls[0].body.data[0];
  assert.equal(sent.event_name, 'Contact');
  assert.equal(sent.event_id, 'gh.abc123.def456');
  assert.equal(sent.action_source, 'website');
  assert.equal(sent.event_source_url, 'https://www.godhealth.org/coaching', 'query and hash are dropped');
  assert.equal(sent.user_data.client_ip_address, '203.0.113.7');
  assert.equal(sent.user_data.client_user_agent, AGENT);
  assert.equal(sent.user_data.fbp, 'fb.1.1700000000000.1234567890');
  assert.deepEqual(Object.keys(sent.user_data).sort(), ['client_ip_address', 'client_user_agent', 'fbp'], 'nothing but browser identifiers');
  assert.deepEqual(sent.custom_data, { content_name: 'calendly' });
});

test('the token is sent in the body, never in the URL', async () => {
  const { calls } = await run(request({ body: { events: [event()] } }), LIVE);
  assert.ok(!calls[0].url.includes('test-token'));
});

test('sends nothing without the marketing choice', async () => {
  for (const cookie of [
    '',
    consentCookie({ marketing: false }),
    consentCookie({ updatedAt: new Date(Date.now() - 181 * 86400000).toISOString() }),
    consentCookie({ updatedAt: new Date(Date.now() + 2 * 86400000).toISOString() }),
    consentCookie({ version: 1 }),
    consentCookie({ version: 3 }),
    'gh_cookie_consent=not-json',
  ]) {
    const { res, calls } = await run(request({ headers: { cookie }, body: { events: [event()] } }), LIVE);
    assert.deepEqual(res.body, { ok: true, forwarded: 0, reason: 'no_consent' });
    assert.equal(calls.length, 0);
  }
});

test('a visitor whose clock runs a few hours ahead still counts', async () => {
  const ahead = consentCookie({ updatedAt: new Date(Date.now() + 2 * 3600000).toISOString() });
  const { res } = await run(request({ headers: { cookie: ahead }, body: { events: [event()] } }), LIVE);
  assert.equal(res.body.forwarded, 1);
});

test('when the cookie exists twice, a "no" in either copy wins', async () => {
  const older = new Date(Date.now() - 86400000).toISOString();
  const newer = new Date().toISOString();
  const pairs = [
    consentCookie({ updatedAt: older }) + '; ' + consentCookie({ marketing: false, updatedAt: newer }),
    consentCookie({ marketing: false, updatedAt: older }) + '; ' + consentCookie({ updatedAt: newer }),
  ];
  for (const cookie of pairs) {
    const { res, calls } = await run(request({ headers: { cookie }, body: { events: [event()] } }), LIVE);
    assert.equal(res.body.reason, 'no_consent');
    assert.equal(calls.length, 0);
  }
  const oldTextIgnored = consentCookie({ version: 1, marketing: false }) + '; ' + consentCookie();
  const valid = await run(request({ headers: { cookie: oldTextIgnored }, body: { events: [event()] } }), LIVE);
  assert.equal(valid.res.body.forwarded, 1, 'a leftover cookie from the old consent text is ignored');
});

test('refuses other origins and other methods', async () => {
  const cross = await run(request({ headers: { origin: 'https://evil.example' }, body: { events: [event()] } }), LIVE);
  assert.equal(cross.res.statusCode, 403);
  assert.equal(cross.calls.length, 0);
  const noOrigin = await run(request({ headers: { origin: null }, body: { events: [event()] } }), LIVE);
  assert.equal(noOrigin.res.statusCode, 403);
  const viaReferer = await run(request({ headers: { origin: null, referer: 'https://' + HOST + '/coaching' }, body: { events: [event()] } }), LIVE);
  assert.equal(viaReferer.res.body.forwarded, 1);
  const put = await run(request({ method: 'PUT', body: { events: [event()] } }), LIVE);
  assert.equal(put.res.statusCode, 405);
  assert.equal(put.calls.length, 0);
});

test('a GET shows the configuration and never a secret', async () => {
  const on = await run(request({ method: 'GET' }), Object.assign({}, LIVE, { META_TEST_EVENT_CODE: 'TEST123' }));
  assert.equal(on.res.statusCode, 200);
  assert.deepEqual(on.res.body, {
    ok: true, service: 'gh-events', forwarding: true, reason: '', environment: 'production',
    pixel_id: '4064076763888809', api_version: 'v27.0', test_code_set: true,
  });
  assert.ok(!JSON.stringify(on.res.body).includes('test-token'));
  assert.ok(!JSON.stringify(on.res.body).includes('TEST123'));
  assert.equal(on.calls.length, 0);
  const off = await run(request({ method: 'GET' }), { VERCEL_ENV: 'production' });
  assert.equal(off.res.body.forwarding, false);
  assert.equal(off.res.body.reason, 'not_configured');
});

test('accepts a body that arrives as text (sendBeacon) and rejects rubbish', async () => {
  const asText = await run(request({ body: JSON.stringify({ events: [event()] }) }), LIVE);
  assert.equal(asText.res.body.forwarded, 1);
  for (const body of [undefined, 'not json', '[]', 'x'.repeat(20000), { events: 'nope' }]) {
    const { res, calls } = await run(request({ body }), LIVE);
    assert.ok(res.statusCode === 400 || res.body.reason === 'no_valid_events');
    assert.equal(calls.length, 0);
  }
});

test('only the three conversion events pass; page views, custom events and Purchase do not', async () => {
  const names = ['Purchase', 'PageView', 'ViewContent', 'Schedule', 'CompleteRegistration', 'SubmitApplication', 'MyCustomEvent', 'Contact', 'Lead', 'InitiateCheckout'];
  const events = names.map((name, index) => lead({ name, id: 'gh.allow.' + String(index).padStart(6, '0') }));
  const { res, calls } = await run(request({ headers: BLUEPRINT, body: { events } }), LIVE);
  assert.equal(res.body.forwarded, 3);
  assert.deepEqual(calls[0].body.data.map((item) => item.event_name), ['Contact', 'Lead', 'InitiateCheckout']);
});

test('a Lead is only accepted from the Blueprint site', async () => {
  const www = await run(request({ body: { events: [event({ name: 'Lead' })] } }), LIVE);
  assert.equal(www.res.body.reason, 'no_valid_events');
  assert.equal(www.calls.length, 0);
  const sales = { host: 'sales.godhealth.org', origin: 'https://sales.godhealth.org' };
  const other = await run(request({ headers: sales, body: { events: [event({ name: 'Lead', url: 'https://sales.godhealth.org/' })] } }), LIVE);
  assert.equal(other.calls.length, 0);
  const blueprint = await run(request({ headers: BLUEPRINT, body: { events: [lead()] } }), LIVE);
  assert.equal(blueprint.res.body.forwarded, 1);
});

test('private apps, the scan and health-topic articles are refused on the server too', async () => {
  const urls = ['/client', '/client/today', '/coach-dashboard', '/kingdom-capacity-assessment', '/kca/config-v2.json',
    '/guides/emotional-eating-as-a-christian', '/topics/christian-weight-loss', '/kingdom-vitality-scan.html'];
  const { res, calls } = await run(request({ body: { events: urls.map((pagePath, index) => event({ url: 'https://' + HOST + pagePath, id: 'gh.block.' + String(index).padStart(6, '0') })) } }), LIVE);
  assert.equal(res.body.reason, 'no_valid_events');
  assert.equal(calls.length, 0);
  const allowed = await run(request({ body: { events: [event({ url: 'https://' + HOST + '/client-stories' })] } }), LIVE);
  assert.equal(allowed.res.body.forwarded, 1, '/client-stories is a public page, not the private /client app');
});

test('drops events for pages on another host, plain http pages and events without a usable id', async () => {
  const { res, calls } = await run(request({ body: { events: [
    event({ url: 'https://evil.example/' }),
    event({ url: 'http://' + HOST + '/coaching' }),
    event({ url: 'javascript:alert(1)' }),
    event({ id: 'short' }),
    event({ id: 'has spaces in it!' }),
  ] } }), LIVE);
  assert.equal(res.body.reason, 'no_valid_events');
  assert.equal(calls.length, 0);
});

test('a hashed email is accepted only with a Lead on the Blueprint site', async () => {
  const accepted = await run(request({ headers: BLUEPRINT, body: { events: [lead({ user: { em: HASH } })] } }), LIVE);
  assert.deepEqual(accepted.calls[0].body.data[0].user_data.em, [HASH]);

  const plain = await run(request({ headers: BLUEPRINT, body: { events: [lead({ user: { em: 'someone@example.com', fn: HASH, ph: HASH } })] } }), LIVE);
  const user = plain.calls[0].body.data[0].user_data;
  assert.equal(user.em, undefined, 'a plain email address is never forwarded');
  assert.equal(user.fn, undefined);
  assert.equal(user.ph, undefined);

  const otherEvent = await run(request({ headers: BLUEPRINT, body: { events: [lead({ name: 'Contact', user: { em: HASH } })] } }), LIVE);
  assert.equal(otherEvent.calls[0].body.data[0].user_data.em, undefined, 'not with other events');

  const otherSite = await run(request({ body: { events: [event({ user: { em: HASH } })] } }), LIVE);
  assert.equal(otherSite.calls[0].body.data[0].user_data.em, undefined, 'not on the main site');
});

test('the value of a checkout comes from the price list, never from the page', async () => {
  const checkout = (custom) => event({ name: 'InitiateCheckout', custom });
  const known = await run(request({ body: { events: [checkout({ value: 99999.99, currency: 'EUR', content_name: 'nutrition_bundle' })] } }), LIVE);
  assert.deepEqual(known.calls[0].body.data[0].custom_data, { content_name: 'nutrition_bundle', value: 17, currency: 'USD', content_ids: ['nutrition_bundle'], content_type: 'product' });
  const unknown = await run(request({ body: { events: [checkout({ value: 500, currency: 'USD', content_name: 'something_else' })] } }), LIVE);
  assert.deepEqual(unknown.calls[0].body.data[0].custom_data, { content_name: 'something_else' }, 'no value for a product that is not on the list');
  const contact = await run(request({ body: { events: [event({ custom: { value: 17, currency: 'USD', content_name: 'nutrition_bundle' } })] } }), LIVE);
  assert.deepEqual(contact.calls[0].body.data[0].custom_data, { content_name: 'nutrition_bundle' }, 'a value only belongs to a started checkout');
});

test('only standard parameters reach Meta', async () => {
  const { calls } = await run(request({ body: { events: [event({ custom: { value: 17, currency: 'usd', content_name: 'Weight loss answers!', answers: ['x'], score: 80, content_type: 'article' } })] } }), LIVE);
  assert.equal(calls[0].body.data[0].custom_data, undefined, 'an unsafe name and unknown keys are all dropped');
});

test('click id cookies are passed on unchanged, malformed ones are ignored', async () => {
  const good = await run(request({ headers: { cookie: consentCookie() + '; _fbp=fb.1.1700000000000.42; _fbc=fb.1.1700000000001.IwAR0AbC_dEf-123456' }, body: { events: [event()] } }), LIVE);
  assert.equal(good.calls[0].body.data[0].user_data.fbc, 'fb.1.1700000000001.IwAR0AbC_dEf-123456');
  const fromBody = await run(request({ headers: { cookie: consentCookie() }, body: { fbc: 'fb.1.1700000000001.IwAR0AbC_dEf-123456', events: [event()] } }), LIVE);
  assert.equal(fromBody.calls[0].body.data[0].user_data.fbc, 'fb.1.1700000000001.IwAR0AbC_dEf-123456');
  const bad = await run(request({ headers: { cookie: consentCookie() + '; _fbp=<script>; _fbc=nope' }, body: { fbp: 'fb.1.1700000000000.42', events: [event()] } }), LIVE);
  assert.equal(bad.calls[0].body.data[0].user_data.fbp, undefined, 'the browser id only comes from the cookie');
  assert.equal(bad.calls[0].body.data[0].user_data.fbc, undefined);
});

test('an address that is not an IP address is not passed on', async () => {
  const { calls } = await run(request({ headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.1' }, body: { events: [event()] } }), LIVE);
  assert.equal(calls[0].body.data[0].user_data.client_ip_address, undefined);
  const v6 = await run(request({ headers: { 'x-forwarded-for': '2001:db8::7' }, body: { events: [event()] } }), LIVE);
  assert.equal(v6.calls[0].body.data[0].user_data.client_ip_address, '2001:db8::7');
});

test('event time: recent client time is kept, anything else becomes now', async () => {
  const now = Math.floor(Date.now() / 1000);
  const { calls } = await run(request({ body: { events: [
    event({ id: 'gh.time.recent1', time: now - 120 }),
    event({ id: 'gh.time.oldold1', time: now - 86400 }),
    event({ id: 'gh.time.future1', time: now + 9999 }),
  ] } }), LIVE);
  const times = calls[0].body.data.map((item) => item.event_time);
  assert.ok(Math.abs(times[0] - (now - 120)) <= 2);
  assert.ok(Math.abs(times[1] - now) <= 2);
  assert.ok(Math.abs(times[2] - now) <= 2);
});

test('at most ten events per request', async () => {
  const events = Array.from({ length: 25 }, (unused, index) => event({ id: 'gh.many.' + String(index).padStart(6, '0') }));
  const { res } = await run(request({ body: { events } }), LIVE);
  assert.equal(res.body.forwarded, 10);
});

test('preview deployments forward only with a test code', async () => {
  const silent = await run(request({ body: { events: [event()] } }), { META_CAPI_ACCESS_TOKEN: 't', VERCEL_ENV: 'preview' });
  assert.deepEqual(silent.res.body, { ok: true, forwarded: 0, reason: 'preview_without_test_code', dormant: true });
  assert.equal(silent.calls.length, 0);
  const preview = { host: 'godhealth-abc.vercel.app', origin: 'https://godhealth-abc.vercel.app' };
  const testing = await run(request({ headers: preview, body: { events: [lead({ url: 'https://godhealth-abc.vercel.app/' })] } }), { META_CAPI_ACCESS_TOKEN: 't', VERCEL_ENV: 'preview', META_TEST_EVENT_CODE: 'TEST123' });
  assert.equal(testing.res.body.forwarded, 1, 'a sign-up can be tested on a preview of the Blueprint site');
  assert.equal(testing.calls[0].body.test_event_code, 'TEST123');
});

test('production only serves the three GodHealth hosts, with or without a test code', async () => {
  const other = { host: 'other.example', origin: 'https://other.example' };
  for (const env of [LIVE, Object.assign({}, LIVE, { META_TEST_EVENT_CODE: 'TEST123' }), { META_CAPI_ACCESS_TOKEN: 'test-token' }]) {
    const { res, calls } = await run(request({ headers: other, body: { events: [event({ url: 'https://other.example/' })] } }), env);
    assert.equal(res.body.reason, 'unknown_host');
    assert.equal(calls.length, 0);
  }
});

test('a Meta error is reported without leaking details', async () => {
  const { res, calls, errors } = await run(request({ body: { events: [event()] } }), LIVE, 400);
  assert.deepEqual(res.body, { ok: false, forwarded: 0, reason: 'meta_error' });
  assert.equal(calls.length, 1, 'a refused request is not repeated');
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('secret detail'));
  assert.ok(!errors[0].includes('test-token'));
  assert.ok(errors[0].includes('"code":190'));
  assert.ok(errors[0].includes('"subcode":460'));
  assert.ok(errors[0].includes('TRACE123'));
});

test('one more try after a timeout or a server error, then it gives up', async () => {
  const recovered = await run(request({ body: { events: [event()] } }), LIVE, [500, 200]);
  assert.equal(recovered.res.body.forwarded, 1);
  assert.equal(recovered.calls.length, 2);
  assert.equal(recovered.calls[0].body.data[0].event_id, recovered.calls[1].body.data[0].event_id, 'same id, so Meta counts it once');
  const timeout = await run(request({ body: { events: [event()] } }), LIVE, ['down', 200]);
  assert.equal(timeout.res.body.forwarded, 1);
  const failed = await run(request({ body: { events: [event()] } }), LIVE, [500, 500, 200]);
  assert.equal(failed.res.body.reason, 'meta_error');
  assert.equal(failed.calls.length, 2);
});

test('an answer from Meta without received events counts as a failure', async () => {
  const { res } = await run(request({ body: { events: [event()] } }), LIVE, 'empty');
  assert.equal(res.body.reason, 'meta_error');
});

test('pixel id and API version can be overridden; a malformed value switches forwarding off', async () => {
  const custom = await run(request({ body: { events: [event()] } }), Object.assign({}, LIVE, { META_PIXEL_ID: ' 123456789012345 ', META_API_VERSION: 'v28.0' }));
  assert.equal(custom.calls[0].url, 'https://graph.facebook.com/v28.0/123456789012345/events', 'stray spaces are removed');
  for (const wrong of [{ META_PIXEL_ID: '../evil' }, { META_API_VERSION: 'latest' }, { META_TEST_EVENT_CODE: 'TEST 123!' }]) {
    const bad = await run(request({ body: { events: [event()] } }), Object.assign({}, LIVE, wrong));
    assert.deepEqual(bad.res.body, { ok: true, forwarded: 0, reason: 'bad_config', dormant: true });
    assert.equal(bad.calls.length, 0, 'never falls back to the real pixel');
  }
});

test('an unexpected fault is answered calmly and without details', async () => {
  const broken = request({ body: { events: [event()] } });
  Object.defineProperty(broken, 'headers', { get() { throw new Error('boom with secret'); } });
  const { res, errors } = await run(broken, LIVE);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: false, forwarded: 0, reason: 'error' });
  assert.ok(!errors.join(' ').includes('secret'));
});

test('a very long page address costs no noticeable time', async () => {
  const started = Date.now();
  await run(request({ body: { events: [event({ url: 'https://' + HOST + '/' + '/'.repeat(15000) + 'a' })] } }), LIVE);
  assert.ok(Date.now() - started < 150, 'took ' + (Date.now() - started) + ' ms');
});

test('responses are never cached or indexed', async () => {
  const { res } = await run(request({ body: { events: [event()] } }), LIVE);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-robots-tag'], 'noindex');
});

test('a blocked page is also refused under another spelling of its address', async () => {
  /* Vercel answers each of these exactly like the plain address. One request each: the relay reads at most ten events. */
  const spellings = ['/guides%2Femotional-eating-as-a-christian', '/guides%5Cemotional-eating-as-a-christian', '/%67uides/emotional-eating-as-a-christian',
    '/%2Fguides/emotional-eating-as-a-christian', '/t%6fpics/christian-weight-loss', '/topics%2Fchristian-weight-loss',
    '/kingdom-vitality-scan%2Ehtml', '/cl%69ent', '/kca%2Fconfig-v2.json', '/%E0%A4%A'];
  for (const pagePath of spellings) {
    const { res, calls } = await run(request({ body: { events: [event({ url: 'https://' + HOST + pagePath })] } }), LIVE);
    assert.equal(res.body.reason, 'no_valid_events', pagePath);
    assert.equal(calls.length, 0, pagePath);
  }
  const allowed = await run(request({ body: { events: [event({ url: 'https://' + HOST + '/co%61ching' })] } }), LIVE);
  assert.equal(allowed.res.body.forwarded, 1, 'an unusual spelling of a public page still counts');
});

test('a body over 16 KB is refused, also when it is valid JSON', async () => {
  const big = { events: [event()], pad: 'x'.repeat(20000) };
  for (const body of [big, JSON.stringify(big), Buffer.from(JSON.stringify(big))]) {
    const { res, calls } = await run(request({ body }), LIVE);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.length, 0);
  }
  const small = await run(request({ body: Buffer.from(JSON.stringify({ events: [event()] })) }), LIVE);
  assert.equal(small.res.body.forwarded, 1, 'a body that arrives as bytes is read');
});

test('an event that would carry a user agent and nothing else is not sent', async () => {
  const bare = { cookie: consentCookie(), 'x-forwarded-for': null };
  const { res, calls } = await run(request({ headers: bare, body: { events: [event()] } }), LIVE);
  assert.equal(res.body.reason, 'no_valid_events');
  assert.equal(calls.length, 0);
});

test('a Meta failure writes no request data to the log', async () => {
  const { errors } = await run(request({ headers: BLUEPRINT, body: { events: [lead({ user: { em: HASH } })] } }), LIVE, 400);
  assert.equal(errors.length, 1);
  for (const part of [HASH, '203.0.113.7', AGENT, 'fb.1.1700000000000.1234567890', 'gh.abc123.def456', 'blueprint.godhealth.org']) {
    assert.ok(!errors[0].includes(part), part);
  }
});

test('the call to Meta carries a time limit', async () => {
  const { calls } = await run(request({ body: { events: [event()] } }), LIVE);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});
