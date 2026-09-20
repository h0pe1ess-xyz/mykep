"""Real FastAPI route tests; no lifespan, bot, DB writes or upstream requests.
Install requirements-dev.txt first. Missing dependencies are reported as SKIP.
"""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
DEPENDENCIES = all(importlib.util.find_spec(name) for name in ['fastapi', 'httpx', 'aiosqlite', 'dotenv'])


@unittest.skipUnless(DEPENDENCIES, 'Install requirements-dev.txt to test real FastAPI HTTP responses')
class SEOHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import httpx
        from main import app
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://localhost')

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_public_pages_and_indexability(self):
        for path in ['/', '/about.html']:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn('text/html', response.headers['content-type'])
            self.assertNotIn('noindex', response.headers.get('x-robots-tag', ''))
            self.assertIn('name="description"', response.text)
            self.assertEqual(response.headers['cache-control'], 'no-cache')

    async def test_canonical_redirect_and_launch_arguments(self):
        for method in ['get', 'head']:
            response = await getattr(self.client, method)('/index.html?source=pwa')
            self.assertEqual(response.status_code, 308)
            self.assertEqual(response.headers['location'], '/?source=pwa')
        response = await self.client.get('/index.html', follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.url.path, '/')

    async def test_crawler_resources_and_mime_types(self):
        for path, mime in [('/robots.txt', 'text/plain'), ('/llms.txt', 'text/plain'), ('/llms-full.txt', 'text/plain'), ('/sitemap.xml', 'xml')]:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn(mime, response.headers['content-type'])
            self.assertEqual(response.headers['cache-control'], 'no-cache')
        image = await self.client.get('/images/mykep-social.png')
        self.assertEqual(image.status_code, 200)
        self.assertIn('image/png', image.headers['content-type'])

    async def test_precache_resources_are_all_fetchable(self):
        import json
        import re
        source = (Path(__file__).resolve().parents[1] / 'static/sw.js').read_text(encoding='utf-8')
        shell = json.loads(re.search(r'const APP_SHELL = (\[.*?\]);', source, re.S)[1])
        for path in shell:
            response = await self.client.get(path, follow_redirects=True)
            self.assertEqual(response.status_code, 200, path)

    async def test_api_and_docs_not_indexed(self):
        for path in ['/api/health', '/api/groups', '/api/schedule', '/docs', '/redoc', '/openapi.json']:
            response = await self.client.get(path)
            self.assertEqual(response.headers.get('x-robots-tag'), 'noindex', path)
            if path.startswith('/api/'):
                self.assertEqual(response.headers['cache-control'], 'no-store')

    async def test_unknown_path_is_not_soft_404(self):
        response = await self.client.get('/not-a-real-mykep-page')
        self.assertEqual(response.status_code, 404)

    async def test_service_worker_can_revalidate(self):
        response = await self.client.get('/sw.js')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-cache')
        self.assertIn('mykep-cache-v2.6.8', response.text)


if __name__ == '__main__':
    unittest.main()
