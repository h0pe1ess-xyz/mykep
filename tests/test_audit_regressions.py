import unittest
from datetime import date
from unittest.mock import patch

import httpx
import admin_api
import admin_stats
import analytics
from activity_limits import ActivityLimits


class ActivityLimitsTests(unittest.TestCase):
    def test_duplicates_expire_and_queue_failures_can_retry(self):
        gate = ActivityLimits()
        day = date(2026, 10, 27)
        self.assertEqual(gate.check('u', 'g', 'view', 100, day), 'accepted')
        self.assertEqual(gate.check('u', 'g', 'view', 101, day), 'duplicate')
        self.assertEqual(gate.count, 1)
        self.assertEqual(gate.check('u', 'g', 'view', 110, day), 'accepted')
        gate.forget('u', 'g', 'view')
        self.assertEqual(gate.check('u', 'g', 'view', 110, day), 'accepted')

    def test_uid_burst_global_budget_shared_network_and_bounded_memory(self):
        gate = ActivityLimits(client_burst=2, client_rate=0, global_burst=10, global_rate=0, daily_limit=4, max_clients=2)
        day = date(2026, 10, 27)
        for kind in ('view', 'interaction'):
            self.assertEqual(gate.check('a', 'g', kind, 100, day), 'accepted')
        self.assertEqual(gate.check('a', 'g', 'refresh', 100, day), 'limited')
        # No IP bucket: another UID on the same Wi-Fi has its own allowance.
        self.assertEqual(gate.check('b', 'g', 'view', 100, day), 'accepted')
        self.assertEqual(gate.check('c', 'g', 'view', 100, day), 'accepted')
        self.assertLessEqual(len(gate.clients), 2)
        self.assertEqual(gate.check('d', 'g', 'view', 100, day), 'limited')
        self.assertEqual(gate.check('d', 'g', 'view', 101, date(2026, 10, 28)), 'accepted')
        global_gate = ActivityLimits(global_burst=1, global_rate=0)
        self.assertEqual(global_gate.check('a', 'g', 'view', 100, day), 'accepted')
        self.assertEqual(global_gate.check('b', 'g', 'view', 100, day), 'limited')

    def test_historical_slots_follow_date_and_current_standard(self):
        self.assertEqual(admin_stats._slot_for(9*60+5, date(2026, 10, 26)), 'lesson1')
        self.assertEqual(admin_stats._slot_for(9*60+5, date(2026, 10, 27)), 'break')
        self.assertEqual(admin_stats._slot_for(9*60+10, date(2026, 10, 27)), 'lesson2')
        historical = admin_stats._slot_breakdown({}, date(2026, 10, 14), date(2026, 10, 14))
        current = admin_stats._slot_breakdown({}, date(2026, 10, 27), date(2026, 10, 27))
        mixed = admin_stats._slot_breakdown({}, date(2026, 10, 14), date(2026, 10, 27))
        self.assertEqual(historical['bells'][0]['end'], '09:20')
        self.assertEqual(current['bells'][0]['end'], '09:00')
        self.assertIn('стандарт змінювався', mixed['profile_note'])

    def test_rollup_failure_degrades_health_and_exposes_last_success(self):
        writer = dict(running=True, pending=0, dropped=0, write_error=False, rollup_running=True,
                      rollup_error=True, last_rollup_success='2026-10-27T09:00:00+02:00')
        with patch.object(analytics, 'writer_status', return_value=writer):
            health = admin_api._health_summary()
        check = next(c for c in health['checks'] if c['key'] == 'rollup')
        self.assertEqual(check['level'], 'warning')
        self.assertIn(writer['last_rollup_success'], check['detail'])


class PublicAPITests(unittest.IsolatedAsyncioTestCase):
    async def test_dates_and_activity_admission(self):
        import main
        event = dict(uid='synthetic-user', group='ПІ-24-02', mode='browser', event='view')
        with patch.object(main.schedule, 'groups', ['ПІ-24-02']), patch.object(main, 'activity_limits', ActivityLimits(global_burst=1, global_rate=0)), patch.object(analytics, 'record_request', return_value=True) as record:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='https://localhost') as client:
                for monday in ('9999-12-27', '0001-01-01', '2101-01-03'):
                    self.assertEqual((await client.get('/api/schedule', params={'monday':monday})).status_code, 422)
                self.assertEqual((await client.post('/api/activity', json={**event, 'group':'НЕІСНУЮЧА-ГРУПА'})).status_code, 422)
                self.assertEqual((await client.post('/api/activity', json=event)).status_code, 204)
                self.assertEqual((await client.post('/api/activity', json=event)).status_code, 204)
                limited = await client.post('/api/activity', json={**event, 'uid':'another-user'})
                self.assertEqual(limited.status_code, 429)
                self.assertIn('Retry-After', limited.headers)
        self.assertEqual(record.call_count, 1)


if __name__ == '__main__':
    unittest.main()
