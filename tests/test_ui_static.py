"""2.6.8 dependency-free HTML regression checks (not a browser renderer)."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
ROOT = Path(__file__).resolve().parents[1] / 'static'
class Tags(HTMLParser):
    def __init__(self, source):
        super().__init__(); self.tags=[]; self.feed(source)
    def handle_starttag(self, tag, attrs): self.tags.append((tag,dict(attrs)))
class UIFixes(unittest.TestCase):
    def test_one_h1_per_page(self):
        for p in ROOT.glob('*.html'):
            source=p.read_text(encoding='utf-8');tags=Tags(source).tags
            self.assertEqual(sum(t=='h1' for t,a in tags),1,p.name)
            # A noscript heading is not an active heading when scripting is on.
            no_script=re.findall(r'<noscript>(.*?)</noscript>',source,re.S)
            self.assertFalse(any('<h1' in x for x in no_script),p.name)
    def test_home_keeps_full_heading_before_h2_and_brand_styling(self):
        text=(ROOT/'index.html').read_text(encoding='utf-8')
        self.assertIn('<h1 class="sr-only page-heading">MyKep - розклад пар КЕП ІФНТУНГ</h1>',text)
        self.assertIn('<h2 class="app-title">MyKep</h2>',text)
        self.assertLess(text.index('<h1'),text.index('<h2'))
        self.assertNotIn('display: none', re.search(r'\.sr-only\s*\{([^}]+)',(ROOT/'css/base.css').read_text(encoding='utf-8')).group(1))
    def test_requested_legacy_viewport_and_capable_metadata(self):
        for p in ROOT.glob('*.html'):
            tags=Tags(p.read_text(encoding='utf-8')).tags;meta={a.get('name'):a.get('content') for t,a in tags if t=='meta'}
            viewport=meta['viewport']
            if p.name != 'about.html':
                self.assertIn('maximum-scale=1.0',viewport)
                self.assertIn('minimum-scale=1.0',viewport)
                self.assertIn('user-scalable=no',viewport)
            else:
                self.assertNotIn('maximum-scale',viewport)
            if p.name!='about.html':
                self.assertEqual(meta['mobile-web-app-capable'],'yes')
                self.assertEqual(meta['apple-mobile-web-app-capable'],'yes')
    def test_all_html_images_have_dimensions_loading_and_title(self):
        sources=[p.read_text(encoding='utf-8') for p in ROOT.glob('*.html')]+[(ROOT/'js/pwa.js').read_text(encoding='utf-8')]
        for source in sources:
            for tag,a in Tags(source).tags:
                if tag!='img':continue
                self.assertGreater(int(a['width']),0);self.assertGreater(int(a['height']),0)
                self.assertIn(a['loading'],['lazy','eager']);self.assertTrue(a['title']);self.assertIn('alt',a)
                if a['src']=='pfp/1.png':self.assertEqual((a['width'],a['height']),('460','460'))
                if a['src']=='pfp/2.gif':self.assertEqual((a['width'],a['height']),('184','184'))
if __name__=='__main__': unittest.main()
