// Run with: node scripts/health-library-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const errors = [];
const warnings = [];
const fileFor = pathname => {
  const cleaned = decodeURIComponent(pathname).replace(/^\//, '');
  if (!cleaned) return 'index.html';
  if (/\.(html|xml|txt)$/.test(cleaned)) return cleaned;
  return path.posix.join(cleaned, 'index.html');
};
const pages = [];
for (const url of urls) {
  const u = new URL(url);
  if (u.hostname !== 'www.godhealth.org') continue;
  const file = fileFor(u.pathname);
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { errors.push('Missing sitemap target: ' + file); continue; }
  if (!file.endsWith('.html')) continue;
  const html = fs.readFileSync(full, 'utf8');
  pages.push({file,html,url});
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  if (!canonical) warnings.push(file + ': missing canonical');
  else if (canonical !== url) warnings.push(file + ': canonical differs from sitemap URL (' + canonical + ')');
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(file + ': missing title');
  if (!/<meta name="description" content="[^"]+"/.test(html)) warnings.push(file + ': missing meta description');
  if (/<span>\(NIV\)<\/span>|bible\.com\/bible\/111\//.test(html)) warnings.push(file + ': NIV reference remains; review against KJV editorial requirement');
  for (const match of html.matchAll(/href="(\/[^"#?]+)(?:[?#][^"]*)?"/g)) {
    const link = match[1];
    if (/^\/\//.test(link) || link.startsWith('/assets/')) continue;
    const target = path.join(root, fileFor(link));
    if (!fs.existsSync(target)) warnings.push(file + ': internal link target missing: ' + link);
  }
}
const library = fs.readFileSync(path.join(root, 'resources/index.html'), 'utf8');
if (!library.includes('data-library-search')) errors.push('Library search form missing');
if (!library.includes('id="health-topics"') || !library.includes('id="practical-guides"')) errors.push('Library topic or guide section missing');
if (!fs.existsSync(path.join(root,'assets/health-library-search.js'))) errors.push('Library search script missing');
console.log('GodHealth Health Library audit');
console.log('Sitemap URLs:',urls.length,'HTML pages checked:',pages.length);
for (const e of errors) console.error('ERROR:',e);
for (const w of [...new Set(warnings)]) console.warn('WARN:',w);
console.log('Errors:',errors.length,'Warnings:',new Set(warnings).size);
process.exitCode = errors.length ? 1 : 0;
