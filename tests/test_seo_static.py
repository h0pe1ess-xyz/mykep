"""Dependency-free SEO/PWA checks. Run: python -m unittest discover -s tests -v."""
import ast
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import unittest
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / 'static'
ORIGIN = 'https://mykep.pp.ua'


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def find(self, tag, **attrs):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]


def page(name):
    return Document((STATIC / name).read_text(encoding='utf-8'))


class SEOStaticTests(unittest.TestCase):
    def test_unique_titles_descriptions_and_canonicals(self):
        titles, descriptions = set(), set()
        for name in ['index.html', 'about.html', 'schedule.html', 'settings.html']:
            with self.subTest(page=name):
                source = (STATIC / name).read_text(encoding='utf-8')
                doc = page(name)
                self.assertEqual(len(doc.find('html', lang='uk')), 1)
                title = re.findall(r'<title>(.*?)</title>', source)
                self.assertEqual(len(title), 1)
                self.assertNotIn(title[0], titles)
                titles.add(title[0])
                meta = doc.find('meta', name='description')
                self.assertEqual(len(meta), 1)
                self.assertNotIn(meta[0]['content'], descriptions)
                descriptions.add(meta[0]['content'])
                canonical = doc.find('link', rel='canonical')
                self.assertEqual(len(canonical), 1)
                expected = ORIGIN + ('/' if name == 'index.html' else '/' + name)
                self.assertEqual(canonical[0]['href'], expected)
                self.assertEqual(doc.find('meta', property='og:url')[0]['content'], expected)

    def test_index_policy_and_sitemap(self):
        root = ET.parse(STATIC / 'sitemap.xml').getroot()
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        urls = [x.text for x in root.findall('s:url/s:loc', ns)]
        self.assertEqual(set(urls), {ORIGIN + '/', ORIGIN + '/about.html'})
        self.assertEqual(len(urls), len(set(urls)))
        for name in ['index.html', 'about.html', 'schedule.html', 'settings.html']:
            robots = page(name).find('meta', name='robots')[0]['content']
            self.assertEqual('noindex' in robots, name in ['schedule.html', 'settings.html'])
        robots = (STATIC / 'robots.txt').read_text(encoding='utf-8')
        self.assertIn('Sitemap: ' + ORIGIN + '/sitemap.xml', robots)
        self.assertNotIn('Disallow:', robots)

    def test_social_metadata_and_image(self):
        for name in ['index.html', 'about.html', 'schedule.html', 'settings.html']:
            doc = page(name)
            for prop in ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt']:
                self.assertEqual(len(doc.find('meta', property=prop)), 1)
            self.assertEqual(doc.find('meta', name='twitter:card')[0]['content'], 'summary_large_image')
            self.assertEqual(doc.find('meta', property='og:image')[0]['content'], ORIGIN + '/images/mykep-social.png')
        data = (STATIC / 'images/mykep-social.png').read_bytes()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        self.assertEqual(struct.unpack('>II', data[16:24]), (1200, 630))
        self.assertLess(len(data), 200_000)

    def test_structured_data_matches_identity(self):
        for name in ['index.html', 'about.html']:
            raw = (STATIC / name).read_text(encoding='utf-8')
            blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', raw, re.S)
            self.assertEqual(len(blocks), 1)
            graph = json.loads(blocks[0])
            self.assertEqual(graph['@context'], 'https://schema.org')
            nodes = {n['@type']: n for n in graph['@graph']}
            self.assertEqual(nodes['WebSite']['name'], 'MyKep')
            self.assertEqual(nodes['WebSite']['url'], ORIGIN + '/')
            self.assertEqual(nodes['WebApplication']['applicationCategory'], 'EducationalApplication')
            self.assertNotIn('aggregateRating', blocks[0])
            self.assertNotIn('review', blocks[0])
            self.assertNotIn('SearchAction', blocks[0])

    def test_public_about_is_readable_without_app_javascript(self):
        doc = page('about.html')
        self.assertEqual(len(doc.find('h1')), 1)
        self.assertFalse([a for a in doc.find('script') if a.get('src')])
        raw = (STATIC / 'about.html').read_text(encoding='utf-8')
        for text in ['незалежний студентський', 'не офіційний', 'https://kep.nung.edu.ua/pages/education/schedule']:
            self.assertIn(text, raw)
        self.assertNotIn('data-nosnippet', raw)


        self.assertNotIn('project-summary', (STATIC / 'index.html').read_text(encoding='utf-8'))
        main = page('index.html').find('div', id='main-app')[0]
        self.assertNotIn('opacity: 0', main.get('style', ''))

    def test_installation_excluded_from_snippets(self):
        self.assertIn('data-nosnippet', page('index.html').find('div', id='onboarding')[0])
        source = (STATIC / 'js/pwa.js').read_text(encoding='utf-8')
        self.assertIn("overlay.setAttribute('data-nosnippet', '')", source)
        self.assertIn("button, input, summary, a[href]", source)

    def test_real_navigation_links(self):
        for name in ['index.html', 'schedule.html', 'settings.html']:
            doc = page(name)
            nav = [a for a in doc.find('a') if 'nav-btn' in a.get('class', '').split()]
            self.assertEqual({a['href'] for a in nav}, {'/', '/schedule.html', '/settings.html'})
            self.assertEqual(len(nav), 3)
            self.assertFalse([a for a in doc.find('button') if 'nav-btn' in a.get('class', '').split()])

    def test_all_local_html_resources_exist(self):
        for source in STATIC.glob('*.html'):
            for tag, attrs in page(source.name).tags:
                for key in ['src', 'href']:
                    url = attrs.get(key)
                    if not url or url.startswith('#'):
                        continue
                    parsed = urlsplit(url)
                    if parsed.netloc and parsed.netloc != 'mykep.pp.ua':
                        continue
                    if parsed.scheme and parsed.scheme not in ['http', 'https']:
                        continue
                    path = parsed.path.lstrip('/') or 'index.html'
                    with self.subTest(page=source.name, url=url):
                        self.assertTrue((STATIC / path).is_file(), path)

    def test_pwa_shell_version_and_resources(self):
        source = (STATIC / 'sw.js').read_text(encoding='utf-8')
        self.assertIn("const CACHE_NAME = 'mykep-cache-v2.6.8'", source)
        shell = json.loads(re.search(r'const APP_SHELL = (\[.*?\]);', source, re.S)[1])
        self.assertEqual(len(shell), len(set(shell)))
        for url in shell:
            parsed = urlsplit(url)
            self.assertTrue((STATIC / (parsed.path.lstrip('/') or 'index.html')).is_file(), url)
            if parsed.path.endswith(('.css', '.js')):
                self.assertEqual(parsed.query, 'v=2.6.8', url)
        for path in list(STATIC.glob('*.html')) + [STATIC / 'style.css']:
            for url in re.findall(r'(?:src|href)="([^"]+)"|url\(\x27([^\x27]+)\x27\)', path.read_text(encoding='utf-8')):
                resource = next(x for x in url if x)
                if '?v=' in resource:
                    self.assertIn('v=2.6.8', resource)
                    self.assertIn('/' + resource.lstrip('/'), shell)

    def test_manifest_preserves_installed_app_identity(self):
        manifest = json.loads((STATIC / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['id'], '/')
        self.assertEqual(manifest['start_url'], '/index.html')
        self.assertEqual(manifest['scope'], '/')
        self.assertEqual(manifest['lang'], 'uk')
        self.assertEqual(next(i for i in manifest['icons'] if i['purpose'] == 'maskable')['src'], 'icons/maskable-orange-512.png')

    def test_llms_files_are_public_facts_with_valid_internal_links(self):
        for name in ['llms.txt', 'llms-full.txt']:
            source = (STATIC / name).read_text(encoding='utf-8')
            self.assertTrue(source.startswith('# MyKep'))
            self.assertIn('незалежний', source.lower())
            self.assertIn('https://mykep.pp.ua/about.html', source)
            self.assertNotIn('rank first', source.lower())

    def test_python_syntax(self):
        for path in ROOT.glob('*.py'):
            ast.parse(path.read_text(encoding='utf-8'), filename=str(path))


if __name__ == '__main__':
    unittest.main()
