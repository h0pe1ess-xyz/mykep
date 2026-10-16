import asyncio
import time
import unittest
from datetime import date
from unittest.mock import Mock, patch

import httpx
import analytics
import main
from schedule_service import DAYS, ScheduleService, build_group_schedule


class ActivityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        service = ScheduleService()
        service.install({'ТЕСТ-24-01': {day: [] for day in DAYS}}, time.time())
        self.writer = Mock(return_value=True)
        self.patches = [patch.object(main, 'schedule', service),
                        patch.object(main, 'activity_limiter', analytics.ActivityLimiter()),
                        patch.object(analytics, 'record_request', self.writer)]
        for item in self.patches:
            item.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='https://localhost')
        self.event = {'uid': 'user_legacy1234', 'group': 'ТЕСТ-24-01', 'mode': 'standalone', 'event': 'view'}

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches):
            item.stop()

    async def test_real_group_and_legacy_uid_formats(self):
        for uid in ['user_ab12xyz123mc', 'a771584d-2535-4e1a-a848-07f0dcf67d27', 'old-client:123', '12345']:
            response = await self.client.post('/api/activity', json={**self.event, 'uid': uid, 'group': 'тест-24-01'})
            self.assertEqual(response.status_code, 204)
            self.assertEqual(self.writer.call_args.args[1], 'ТЕСТ-24-01')
        before = self.writer.call_count
        for changed in [{'group': 'НЕІСНУЄ'}, {'uid': ''}, {'uid': 'bad uid'}, {'uid': 'line\nuid'}, {'uid': 'trailing\n'}, {'uid': 'x' * 129}, {'uid': 123}, {'extra': 'field'}, {'event': 'refresh'}]:
            response = await self.client.post('/api/activity', json={**self.event, **changed})
            self.assertEqual(response.status_code, 422, changed.keys())
        self.assertEqual(self.writer.call_count, before)

    async def test_body_limit_before_json_parsing_including_chunked_stream(self):
        with patch.object(main.ActivityEvent, 'model_validate_json', wraps=main.ActivityEvent.model_validate_json) as parse:
            response = await self.client.post('/api/activity', content=b' ' * 2049, headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status_code, 413)
            async def chunks():
                for _ in range(3):
                    yield b' ' * 800
            response = await self.client.post('/api/activity', content=chunks(), headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status_code, 413)
            parse.assert_not_called()
        self.assertEqual((await self.client.post('/api/activity', content='not json', headers={'Content-Type': 'application/json'})).status_code, 422)
        self.assertEqual((await self.client.post('/api/activity', content='{}')).status_code, 415)
        self.writer.assert_not_called()

    async def test_rate_limit_is_atomic_and_shared_with_legacy_get(self):
        responses = await asyncio.gather(*(self.client.post('/api/activity', json=self.event) for _ in range(40)))
        self.assertEqual(sum(r.status_code == 204 for r in responses), 30)
        limited = [r for r in responses if r.status_code == 429]
        self.assertEqual(len(limited), 10)
        self.assertTrue(all(int(r.headers['Retry-After']) > 0 for r in limited))
        before = self.writer.call_count
        response = await self.client.get('/api/schedule', params={'group': self.event['group'], 'uid': self.event['uid'], 'event': 'view'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['X-Activity-Status'], 'limited')
        self.assertEqual(self.writer.call_count, before)
        for params in [{'uid': 'bad uid'}, {'uid': self.event['uid']}]:
            self.assertEqual((await self.client.get('/api/schedule', params={'group': self.event['group'], **params})).status_code, 200)
        self.assertEqual(self.writer.call_count, before)

    async def test_campus_users_do_not_share_a_small_ip_quota(self):
        for index in range(120):
            response = await self.client.post('/api/activity', json={**self.event, 'uid': f'user_campus_{index}'})
            self.assertEqual(response.status_code, 204)
        self.assertEqual(self.writer.call_count, 120)
        for path in ['/api/groups', '/api/schedule?group=ТЕСТ-24-01']:
            self.assertEqual((await self.client.get(path)).status_code, 200)

    async def test_origin_is_only_a_browser_check_and_queue_failure_is_explicit(self):
        response = await self.client.post('/api/activity', json=self.event, headers={'Origin': 'https://elsewhere.invalid'})
        self.assertEqual(response.status_code, 403)
        self.writer.assert_not_called()
        response = await self.client.post('/api/activity', json=self.event, headers={'Origin': 'https://localhost'})
        self.assertEqual(response.status_code, 204)
        self.writer.return_value = False
        response = await self.client.post('/api/activity', json=self.event)
        self.assertEqual(response.status_code, 503)
        self.assertIn('Retry-After', response.headers)

    async def test_calendar_bounds_return_422_before_build_or_write(self):
        for monday in ['9999-12-27', '1999-12-27', '2100-01-04']:
            with patch.object(main.schedule, 'build') as build:
                response = await self.client.get('/api/schedule', params={'group': self.event['group'], 'monday': monday})
                self.assertEqual(response.status_code, 422)
                build.assert_not_called()
        self.writer.assert_not_called()
        for monday in ['2000-01-03', '2099-12-28']:
            response = await self.client.get('/api/schedule', params={'group': self.event['group'], 'monday': monday})
            self.assertEqual(response.status_code, 200)
        with self.assertRaises(ValueError):
            build_group_schedule(main.schedule.raw, self.event['group'], 80, 60, monday=date(9999, 12, 27))


class LimiterTests(unittest.TestCase):
    def test_recovery_global_burst_volume_and_bounded_state(self):
        limiter = analytics.ActivityLimiter(max_users=4)
        now = limiter.updated
        for index in range(600):
            self.assertEqual(limiter.admit(f'user_{index}', now), 0)
        self.assertEqual(len(limiter.users), 4)
        self.assertGreater(limiter.admit('rotating_uid', now), 0)
        self.assertEqual(limiter.admit('rotating_uid', now + 1), 0)
        limiter.hour_count = 5000
        self.assertGreater(limiter.admit('user', now + 2), 0)
        self.assertEqual(limiter.admit('user', now + 3601), 0)
        limiter.day_count = 50000
        self.assertGreater(limiter.admit('user', now + 3602), 0)
        self.assertEqual(limiter.admit('user', now + 86401), 0)

    def test_per_uid_refills_without_evading_daily_budget(self):
        limiter = analytics.ActivityLimiter()
        now = limiter.updated
        for _ in range(30):
            self.assertEqual(limiter.admit('legacy-user', now), 0)
        self.assertEqual(limiter.admit('legacy-user', now), 5)
        self.assertEqual(limiter.admit('legacy-user', now + 5), 0)
        self.assertEqual(limiter.day_count, 31)


if __name__ == '__main__':
    unittest.main()
