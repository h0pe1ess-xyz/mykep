import asyncio
import hashlib
import hmac
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

import admin_auth as auth
import admin_stats
import analytics
import database
import main
from upstream import fetch_college

TEST_TOKEN = '123456:synthetic-test-key'
ADMIN_ID = min(auth.ADMIN_IDS)


def signed_payload(user_id=ADMIN_ID, **changes):
    data = dict(id=user_id, first_name='Test', auth_date=int(time.time()))
    data.update(changes)
    check = '\n'.join(f'{key}={data[key]}' for key in sorted(data))
    secret = hashlib.sha256(TEST_TOKEN.encode()).digest()
    data['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return data


class SignatureTests(unittest.TestCase):
    def test_signature_freshness_and_types(self):
        with patch.object(auth, 'TELEGRAM_BOT_TOKEN', TEST_TOKEN):
            self.assertEqual(auth.verify_telegram_payload(signed_payload())['id'], ADMIN_ID)
            for changes in ({'auth_date': int(time.time()) - 301},
                            {'auth_date': int(time.time()) + 61},
                            {'id': True}, {'first_name': 'bad\nname'}):
                self.assertIsNone(auth.verify_telegram_payload(signed_payload(**changes)))
            payload = signed_payload()
            payload['first_name'] = 'Tampered'
            self.assertIsNone(auth.verify_telegram_payload(payload))
            for payload in (None, [], {}, {'hash': 'x' * 64}):
                self.assertIsNone(auth.verify_telegram_payload(payload))

    def test_invalid_allowlist_cannot_restore_default_admins(self):
        env = dict(os.environ, ADMIN_TELEGRAM_IDS='invalid')
        result = subprocess.run([sys.executable, '-c', 'import config; print(len(config.ADMIN_IDS))'],
                                env=env, capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout.strip(), '0')

    def test_limiter_capacity_does_not_evict_blocked_clients(self):
        gate = auth.RateLimiter(1, 60, max_keys=2)
        with patch('admin_auth.time.monotonic', return_value=100):
            self.assertTrue(gate.check('a'))
            self.assertTrue(gate.check('b'))
            self.assertFalse(gate.check('c'))
            self.assertFalse(gate.check('a'))
        with patch('admin_auth.time.monotonic', return_value=161):
            self.assertTrue(gate.check('c'))
        self.assertLessEqual(len(gate.hits), 2)


class AdminSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / 'test.sqlite')
        self.patches = [patch.object(database, 'DB_PATH', self.path),
                        patch.object(analytics, 'DB_PATH', self.path),
                        patch.object(auth, 'TELEGRAM_BOT_TOKEN', TEST_TOKEN)]
        for item in self.patches:
            item.start()
        for name in ('login_ip_limiter', 'login_global_limiter', 'code_ip_limiter',
                     'code_global_limiter', 'api_session_limiter', 'action_limiter'):
            getattr(auth, name).hits.clear()
        await database.init_database()
        await auth.init_admin_db()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),
                                       base_url='https://localhost', headers={'Origin': 'https://localhost'})

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    async def login(self):
        response = await self.client.post('/api/admin/auth/telegram', json=signed_payload())
        self.assertEqual(response.status_code, 200, response.text)
        return response

    async def test_all_protected_routes_reject_anonymous_requests(self):
        for path in ('me', 'overview', 'stats', 'server', 'sessions', 'audit',
                     'analytics/daily', 'analytics/details', 'export/daily.csv'):
            with self.subTest(path=path):
                self.assertEqual((await self.client.get('/api/admin/' + path)).status_code, 401)
        for path in ('logout', 'login-code', 'sessions/revoke', 'actions/refresh-schedule', 'actions/rollback-schedule'):
            with self.subTest(path=path):
                self.assertEqual((await self.client.post('/api/admin/' + path, json={})).status_code, 401)
        self.assertEqual((await self.client.post('/api/admin/auth/dev', json={'user_id': ADMIN_ID})).status_code, 405)

    async def test_login_cookie_csrf_logout_and_private_headers(self):
        response = await self.login()
        cookie = response.headers['set-cookie']
        for attribute in ('__Host-mykep_admin=', 'HttpOnly', 'Secure', 'SameSite=strict', 'Path=/'):
            self.assertIn(attribute, cookie)
        response = await self.client.get('/api/admin/me')
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(response.headers['x-frame-options'], 'DENY')
        csrf = response.json()['data']['csrf']
        original = self.client.cookies.get(auth.COOKIE_NAME)
        self.assertEqual((await self.client.post('/api/admin/logout', json={})).status_code, 403)
        response = await self.client.post('/api/admin/logout', json={}, headers={'X-CSRF-Token': csrf, 'Origin': 'https://other.test'})
        self.assertEqual(response.status_code, 403)
        response = await self.client.post('/api/admin/logout', json={}, headers={'X-CSRF-Token': csrf})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(await auth.get_session(original))
        self.assertEqual((await self.client.get('/api/admin/me')).status_code, 401)
        self.assertEqual([row['event'] for row in await auth.audit_log()], ['logout', 'login'])

    async def test_nonadmin_and_replayed_signed_data_are_denied(self):
        self.assertEqual((await self.client.post('/api/admin/auth/telegram', json=signed_payload(1))).status_code, 403)
        payload = signed_payload()
        responses = await asyncio.gather(*(self.client.post('/api/admin/auth/telegram', json=payload) for _ in range(5)))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 401, 401, 401, 401])

    async def test_code_single_use_under_concurrent_requests(self):
        code, _ = await auth.create_login_code_for_cli(ADMIN_ID)
        users = await asyncio.gather(*(auth.consume_login_code(code) for _ in range(10)))
        self.assertEqual(sum(user is not None for user in users), 1)
        with self.assertRaises(PermissionError):
            await auth.create_login_code_for_cli(1)

    async def test_session_expiry_revocation_and_storage_hashes(self):
        token = await auth.create_session(ADMIN_ID, 'Test', '', 'telegram', '', '')
        session = await auth.get_session(token)
        self.assertNotEqual(session['token_hash'], token)
        async with database.connect() as db:
            stored = (await db.execute_fetchall('SELECT token_hash FROM admin_sessions'))[0][0]
            self.assertEqual(stored, hashlib.sha256(token.encode()).hexdigest())
        with patch.object(auth, '_now', return_value=time.time() + auth.ADMIN_IDLE_HOURS * 3600 + 1):
            self.assertIsNone(await auth.get_session(token))
        token = await auth.create_session(ADMIN_ID, 'Test', '', 'telegram', '', '')
        with patch.object(auth, 'ADMIN_IDS', frozenset()):
            self.assertIsNone(await auth.get_session(token))

    async def test_origin_and_body_limits(self):
        for origin in ('null', 'https://localhost/evil', 'https://localhost?x=1', 'http://localhost'):
            response = await self.client.post('/api/admin/auth/telegram', json={}, headers={'Origin': origin})
            self.assertEqual(response.status_code, 403)
        response = await self.client.post('/api/admin/auth/code', content='[]', headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 400)
        for path in ('/api/activity', '/api/admin/auth/code'):
            self.assertEqual((await self.client.post(path, content=b'x' * 4097)).status_code, 413)
            async def chunks():
                yield b'x' * 2048
                yield b'x' * 2049
            self.assertEqual((await self.client.post(path, content=chunks(), headers={'Content-Type': 'application/json'})).status_code, 413)


class ReliabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_server_failures_keep_private_headers_and_hide_details(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='https://localhost') as client:
            with patch.object(main.schedule, 'metadata', side_effect=RuntimeError('private fixture detail')):
                response = await client.get('/api/health')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
        self.assertNotIn('private fixture detail', response.text)

    async def test_demo_seed_refuses_existing_custom_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'custom.sqlite'
            path.write_bytes(b'existing database fixture')
            result = subprocess.run([sys.executable, 'scripts/seed_demo_analytics.py', str(path)],
                                    capture_output=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(path.read_bytes(), b'existing database fixture')

    async def test_stats_cache_serializes_identical_cold_requests(self):
        admin_stats._cache.clear()
        admin_stats._cache_lock = asyncio.Lock()
        producer = AsyncMock(return_value={'views': 1})
        result = await asyncio.gather(*(admin_stats._cached('test', producer) for _ in range(20)))
        self.assertEqual(result, [{'views': 1}] * 20)
        producer.assert_awaited_once()
        admin_stats._cache.clear()

    async def test_startup_failure_stops_started_resources(self):
        with patch.object(main, 'init_database', AsyncMock()), \
             patch.object(analytics, 'init_analytics_db', AsyncMock()), \
             patch.object(auth, 'init_admin_db', AsyncMock()), \
             patch.object(analytics, 'start_writer', AsyncMock()), \
             patch.object(analytics, 'stop_writer', AsyncMock()) as stop, \
             patch.object(main.schedule, 'load', AsyncMock(side_effect=RuntimeError('fixture'))):
            with self.assertRaises(RuntimeError):
                async with main.lifespan(main.app):
                    self.fail('Startup should fail')
            stop.assert_awaited_once()
            self.assertFalse(any(task.get_name() in ('admin-housekeeping', 'loop-lag') for task in asyncio.all_tasks()))


class UpstreamTests(unittest.TestCase):
    def test_bounded_stream_and_redirect_refusal(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status_code = 200
        response.iter_content.return_value = iter([b'123', b'456'])
        client = MagicMock()
        client.__enter__.return_value = client
        client.get.return_value = response
        with patch('upstream.cloudscraper.create_scraper', return_value=client):
            with self.assertRaises(ValueError):
                fetch_college('https://kep.nung.edu.ua/test', 5)
            self.assertFalse(client.get.call_args.kwargs['allow_redirects'])
            response.status_code = 302
            with self.assertRaises(ValueError):
                fetch_college('https://kep.nung.edu.ua/test', 100)
