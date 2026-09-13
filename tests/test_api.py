"""Real FastAPI integration tests; require requirements-dev.txt. No real upstream/bot."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

AVAILABLE = all(importlib.util.find_spec(name) for name in ('fastapi', 'httpx', 'aiosqlite'))


@unittest.skipUnless(AVAILABLE, 'FastAPI/httpx unavailable in this environment')
class APIIntegration(unittest.TestCase):
    def setUp(self):
        import main
        import database
        from fastapi.testclient import TestClient
        from schedule_service import ScheduleService
        self.main = main
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(database, 'DB_PATH', str(Path(self.tmp.name)/'test.db')),
            patch.object(main, 'BOT_MODE', 'disabled'), patch.object(main, 'schedule', ScheduleService()),
            patch('schedule_service.fetch_schedule_sync', side_effect=OSError('offline fixture'))]
        for p in self.patches: p.start()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

    def seed(self):
        import time
        self.main.schedule.install({'ПІ-24-02': {'понеділок': []}}, time.time())

    def test_cold_cache_returns_503(self):
        r = self.client.get('/api/schedule')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.headers['Retry-After'], '30')
        self.assertEqual(self.client.get('/api/groups').status_code, 503)

    def test_valid_query_durations(self):
        self.seed()
        r = self.client.get('/api/schedule', params={'group':'ПІ-24-02', 'duration1':'80', 'duration2':'60'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'success')
        self.assertEqual(r.headers['cache-control'], 'no-store')

    def test_invalid_parameters(self):
        self.seed()
        for params in [{'duration1': 90}, {'duration2': 'bad'}, {'uid': 'x'*129}, {'group':'x'*65}]:
            self.assertEqual(self.client.get('/api/schedule', params=params).status_code, 422)

    def test_unknown_group(self):
        self.seed()
        self.assertEqual(self.client.get('/api/schedule', params={'group':'UNKNOWN'}).status_code, 404)

    def test_groups_and_health(self):
        self.seed()
        self.assertEqual(self.client.get('/api/groups').json()['data'], ['ПІ-24-02'])
        self.assertEqual(self.client.get('/api/health').status_code, 200)

    def test_static_service_worker_assets(self):
        import json
        import re
        source = (Path(__file__).resolve().parents[1]/'static/sw.js').read_text()
        urls = json.loads(re.search(r'const APP_SHELL = (\[.*?\]);', source, re.S)[1])
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get('/sw.js').headers['cache-control'], 'no-cache')
