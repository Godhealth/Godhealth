"""Static checks for the public redesign. Never submits forms or touches live data."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from xml.etree import ElementTree
from PIL import Image
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASELINE = '7c5980f12e78951fc0cf980132e456261cab8170'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.json_blocks = []
        self.schema = None
        self.words = []
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.elements.append((tag, a))
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.schema = ''
    def handle_endtag(self, tag):
        if tag == 'script' and self.schema is not None:
            self.json_blocks.append(json.loads(self.schema))
            self.schema = None
    def handle_data(self, value):
        if self.schema is not None:
            self.schema += value
        else:
            self.words.extend(value.split())

def target(path):
    rel = unquote(path).lstrip('/')
    if not rel:
        return ROOT/'index.html'
    p = ROOT/rel
    return p/'index.html' if p.is_dir() else p

def run():
    errors = []
    urls = [n.text for n in ElementTree.parse(ROOT/'sitemap.xml').getroot().iter() if n.tag.endswith('loc')]
    public = [u for u in urls if not u.endswith('kingdom-vitality-scan.html')]
    titles = set()
    descriptions = set()
    checked_images = set()
    links = 0
    for url in public:
        f = target(urlsplit(url).path)
        text = f.read_text()
        p = Page(text)
        if sum(t == 'h1' for t, a in p.elements) != 1:
            errors.append(f'{url}: must have exactly one H1')
        canonical = [a.get('href') for t,a in p.elements if t=='link' and a.get('rel')=='canonical']
        if canonical != [url]:
            errors.append(f'{url}: bad canonical {canonical}')
        import re
        title = re.search(r'<title>(.*?)</title>',text).group(1)
        desc = next((a.get('content') for t,a in p.elements if t=='meta' and a.get('name')=='description'), '')
        if title in titles or desc in descriptions or not desc:
            errors.append(f'{url}: duplicate or absent title/description')
        titles.add(title)
        descriptions.add(desc)
        if not p.json_blocks:
            errors.append(f'{url}: missing structured data')
        ids = [a['id'] for t,a in p.elements if 'id' in a]
        if len(ids) != len(set(ids)):
            errors.append(f'{url}: duplicate IDs')
        for t,a in p.elements:
            if t == 'img':
                if not all(k in a for k in ['alt','width','height']):
                    errors.append(f'{url}: missing image dimensions/alt {a}')
                image_path = target(urlsplit(a['src']).path)
                if image_path not in checked_images:
                    try:
                        with Image.open(image_path) as im:
                            im.verify()
                    except Exception as e:
                        errors.append(f'Invalid image {image_path.name}: {e}')
                    checked_images.add(image_path)
            href = a.get('href') if t in ['a','link'] else a.get('src') if t in ['img','script','source'] else None
            if not href:
                continue
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc:
                continue
            links += 1
            if parsed.path and not target(parsed.path).exists():
                errors.append(f'{url}: missing local target {href}')
            if parsed.fragment:
                destination = target(parsed.path) if parsed.path else f
                if destination.suffix == '.html' and f'id="{parsed.fragment}"' not in destination.read_text():
                    errors.append(f'{url}: broken anchor {href}')
        print(f'OK page {urlsplit(url).path}: title, canonical, schema, links, images')
    # Exact baseline hashes protect functional surfaces, configuration and original shared assets.
    protected = ['client/index.html','coach-dashboard/index.html','kingdom-capacity-assessment/index.html','kingdom-vitality-scan.html','godhealth-config.js','script.js','styles.css','luxury.css','coaching/coaching.js','coaching/coaching.css','vercel.json']
    protected += subprocess.check_output(['git','ls-tree','-r','--name-only',BASELINE,'ads','supabase','kca'],cwd=ROOT,text=True).splitlines()
    for name in protected:
        previous = subprocess.check_output(['git','rev-parse',f'{BASELINE}:{name}'],cwd=ROOT,text=True).strip()
        current = subprocess.check_output(['git','hash-object',str(ROOT/name)],cwd=ROOT,text=True).strip()
        if previous != current:
            errors.append(f'PROTECTED FILE CHANGED: {name}')
    print(f'Checked {len(public)} public pages, {len(checked_images)} unique images, {links} local links and {len(protected)} protected files.')
    if errors:
        for e in errors:
            print('FAIL:',e)
        raise SystemExit(1)
    print('PASS: public site static checks; functional files match production baseline exactly.')

if __name__ == '__main__':
    run()
