/*
 * Checks that the tracking set-up of the main site is complete and consistent.
 * Run with:  node scripts/check-gh-tracking.js
 * Run it after every change to a public page, the page generator or a gh-* file.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
/* Folders that are not part of the public pages of www.godhealth.org. */
const SKIP = new Set(['.git', 'node_modules', 'ads', 'supabase', 'kca', 'docs']);

function htmlFiles(dir, found) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (SKIP.has(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, found);
    else if (entry.name.endsWith('.html')) found.push(full);
  });
  return found;
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const count = (text, part) => text.split(part).length - 1;
const pages = htmlFiles(ROOT, []).map((file) => ({ name: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }));
const shellPages = pages.filter((page) => page.text.includes('/assets/public-preferences.js'));

test('every page with the cookie banner loads the tracking file exactly once, right after it', () => {
  assert.ok(shellPages.length >= 29, 'expected the 29 public pages, found ' + shellPages.length);
  shellPages.forEach((page) => {
    assert.equal(count(page.text, '/assets/gh-tracking.js'), 1, page.name);
    assert.match(page.text, /public-preferences\.js\?v=[^"]+"><\/script><script defer src="\/assets\/gh-tracking\.js\?v=[^"]+" data-gh-site="www"><\/script>/, page.name);
  });
});

test('pages without the cookie banner do not load the tracking file', () => {
  pages.filter((page) => !shellPages.includes(page)).forEach((page) => {
    assert.equal(count(page.text, 'gh-tracking.js'), 0, page.name);
  });
});

test('no page talks to Google or Meta by itself', () => {
  shellPages.forEach((page) => {
    ['googletagmanager.com', 'google-analytics.com', 'connect.facebook.net', 'fbq('].forEach((mark) => {
      assert.equal(count(page.text, mark), 0, page.name + ' contains ' + mark);
    });
  });
});

test('health-topic articles do not pass their address on to the next page', () => {
  const articles = shellPages.filter((page) => /^(guides|topics)\//.test(page.name));
  assert.ok(articles.length >= 12);
  articles.forEach((page) => assert.equal(count(page.text, '<meta name="referrer" content="origin">'), 1, page.name));
});

test('the "not found" page does not pass the missing address on either', () => {
  /* Its address can be anything, so the next page cannot recognise it by its path. */
  assert.equal(count(read('404.html'), '<meta name="referrer" content="origin">'), 1);
});

test('the page generator writes the same tags', () => {
  const generator = read('scripts/build-public-site.mjs');
  assert.equal(count(generator, '/assets/gh-tracking.js'), 1);
  assert.equal(count(generator, '<meta name="referrer" content="origin">'), 1);
  assert.match(generator, /p\.path==='\/404'\?'<meta name="referrer" content="origin">'/);
});

test('every page shows the current cookie text and names its version', async () => {
  /* The version number stands for this exact text. A page with other text must not store a current "yes". */
  const ui = await import(require('node:url').pathToFileURL(path.join(ROOT, 'data/public-ui.mjs')).href);
  const markup = ui.publicPreferences();
  const cookiePart = markup.slice(markup.indexOf('<aside class="ge-cookie-banner"'));
  const version = read('assets/public-preferences.js').match(/CONSENT_VERSION = (\d+)/)[1];
  assert.equal(count(cookiePart, 'data-gh-consent-version="' + version + '"'), 1);
  shellPages.forEach((page) => assert.equal(count(page.text, cookiePart), 1, page.name));
});

test('the consent version is the same everywhere', () => {
  const versions = ['assets/public-preferences.js', 'assets/gh-consent.js', 'assets/gh-tracking.js', 'api/gh-events.js'].map((file) => {
    const match = read(file).match(/CONSENT_VERSION = (\d+)/);
    assert.ok(match, file + ' has no CONSENT_VERSION');
    return match[1];
  });
  assert.equal(new Set(versions).size, 1, 'versions found: ' + versions.join(', '));
});

test('the browser and the server use the same price list', () => {
  const prices = (text) => (text.match(/(nutrition_bundle|biblical_health_pdf_package): \{[^}]*value: (\d+), currency: '([A-Z]{3})'/g) || [])
    .map((entry) => entry.replace(/name: '[^']*', /, '')).sort();
  const browser = prices(read('assets/gh-tracking.js'));
  assert.equal(browser.length, 2);
  assert.deepEqual(browser, prices(read('api/gh-events.js')));
});

/*
 * What the page address and the previous address decide. Runs the tracking
 * file in a minimal stand-in for a browser page (dry run, both choices
 * allowed) and reports which tags were started.
 */
function started(pageUrl, previousUrl) {
  const vm = require('node:vm');
  const page = new URL(pageUrl);
  const consent = encodeURIComponent(JSON.stringify({ version: 2, analytics: true, marketing: true, updatedAt: new Date().toISOString() }));
  const document = {
    currentScript: { getAttribute: (name) => (name === 'data-gh-site' ? 'www' : null) },
    referrer: previousUrl,
    cookie: 'gh_cookie_consent=' + consent,
    visibilityState: 'visible',
    head: { appendChild() {} },
    createElement: () => ({}),
    querySelector: () => null,
    addEventListener() {},
  };
  const location = { hostname: page.hostname, pathname: page.pathname, search: page.search, hash: '', origin: page.origin };
  const window = {
    document,
    location,
    sessionStorage: { getItem: (key) => (key === 'gh_track_test' ? 'dry' : null), setItem() {}, removeItem() {} },
    /* Like a browser: the address bar takes over the new address. */
    history: { state: null, replaceState(state, title, address) { const next = new URL(address, page.origin); location.pathname = next.pathname; location.search = next.search; location.hash = next.hash; } },
    addEventListener() {},
  };
  vm.runInNewContext(read('assets/gh-tracking.js'), { window, document, URL, URLSearchParams, Date, JSON, Math, Object, Array, String, Promise });
  return { google: Array.isArray(window.ghDataLayer), pixel: typeof window.fbq === 'function' };
}

test('Meta stays away from the articles and from a page that receives an article or scan address', () => {
  const site = 'https://www.godhealth.org';
  assert.deepEqual(started(site + '/coaching', ''), { google: true, pixel: true }, 'an offer page');
  assert.deepEqual(started(site + '/guides/christian-fat-loss', ''), { google: true, pixel: false }, 'an article');
  /* The articles pass on only the site name (referrer tag), so the next page is an ordinary page. */
  assert.equal(started(site + '/coaching', site + '/').pixel, true, 'after an article, as browsers report it');
  /* Backstop: a full address still arrives after the scan, or from a browser that ignores the tag. */
  assert.equal(started(site + '/coaching', site + '/guides/christian-fat-loss').pixel, false, 'full article address');
  assert.equal(started(site + '/coaching', site + '/kingdom-vitality-scan.html').pixel, false, 'after the scan');
});

test('another spelling of an address does not get around these rules', () => {
  /* Vercel answers each of these like the plain address, and the browser keeps the spelling. */
  const site = 'https://www.godhealth.org';
  ['/guides%2Fchristian-fat-loss', '/%67uides/christian-fat-loss', '/t%6fpics/christian-weight-loss', '/guides%5Cchristian-fat-loss'].forEach((spelling) => {
    assert.equal(started(site + spelling, '').pixel, false, spelling);
  });
  assert.deepEqual(started(site + '/cl%69ent/today', ''), { google: false, pixel: false }, 'the private app');
  assert.deepEqual(started(site + '/coaching', site + '/cl%69ent/today'), { google: false, pixel: false }, 'reached from the private app');
  assert.equal(started(site + '/coaching', site + '/kingdom-vitality-scan%2Ehtml').pixel, false, 'reached from the scan');
});

test('contact details or identifiers in an address switch everything off', () => {
  const site = 'https://www.godhealth.org';
  assert.deepEqual(started(site + '/coaching?email=someone%40example.com', ''), { google: false, pixel: false }, 'on the page itself');
  assert.deepEqual(started(site + '/coaching', 'https://sales.godhealth.org/thank-you?session_id=cs_live_a1B2c3D4e5F6g7H8'), { google: false, pixel: false }, 'a Stripe session id in the previous address');
  assert.deepEqual(started(site + '/coaching', site + '/?ml_subscriber=123'), { google: false, pixel: false }, 'a subscriber id in the previous address');
  /* On the page itself such an identifier is removed from the address bar before a tag starts. */
  assert.deepEqual(started(site + '/coaching?ml_subscriber=123&utm_source=mail', ''), { google: true, pixel: true }, 'a subscriber id on the page itself');
});
