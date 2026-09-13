import asyncio
import tempfile
import time
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import analytics
import database
from schedule_service import ScheduleService, build_group_schedule, is_lesson_active, get_academic_week, valid_snapshot
from process_lock import exclusive_process_lock

FIXTURE = {'ПІ-24-02 / АК-24-02': {'понеділок': [
    {'number': 1, 'subject': 'Математика', 'teacher': 'Викладач', 'cabinet': '101', 'weeks': '1-4'},
    {'number': 5, 'subject': 'Фізика', 'teacher': 'Викладач', 'cabinet': '102', 'weeks': '1-4'}]}}


class ScheduleRules(unittest.TestCase):
    def test_exact_group_match(self):
        self.assertIsNone(build_group_schedule(FIXTURE, 'ПІ-24', 80, 60))
        self.assertIsNotNone(build_group_schedule(FIXTURE, 'ак2402', 80, 60))

    def test_duration_mapping(self):
        data = build_group_schedule(FIXTURE, 'ПІ-24-02', 80, 60)['понеділок']
        self.assertEqual(data[0]['time'], '08:00 - 09:20')
        self.assertEqual(data[1]['time'], '14:10 - 15:10')
        self.assertEqual(build_group_schedule(FIXTURE, 'ПІ-24-02', 60, 80)['понеділок'][1]['time'], '14:10 - 15:30')

    def test_week_filters(self):
        for val in ['1/3', '1 та 3', '1;3']:
            self.assertTrue(is_lesson_active(val, 3))
            self.assertFalse(is_lesson_active(val, 2))
        self.assertTrue(is_lesson_active('1-4', 4))
        self.assertEqual(get_academic_week(date(2026, 8, 31)), 1)
        self.assertEqual(get_academic_week(date(2026, 9, 28)), 1)

    def test_snapshot_validation(self):
        self.assertTrue(valid_snapshot(FIXTURE))
        for bad in [{}, [], {'A': 'oops'}, {'A': {'понеділок': [None]}}]:
            self.assertFalse(valid_snapshot(bad))

    def test_process_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'bot.lock'
            with exclusive_process_lock(path) as first:
                self.assertTrue(first)
                with exclusive_process_lock(path) as second:
                    self.assertFalse(second)
            with exclusive_process_lock(path) as third:
                self.assertTrue(third)


class AsyncStorage(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(database, 'DB_PATH', str(Path(self.tmp.name)/'test.db'))
        self.db_patch.start()
        await database.init_database()
        await analytics.init_analytics_db()

    async def asyncTearDown(self):
        await analytics.stop_writer()
        self.db_patch.stop()
        self.tmp.cleanup()

    async def test_200_refreshes_single_flight(self):
        service = ScheduleService()
        await service.load()
        def fetch():
            time.sleep(0.03)
            return FIXTURE
        with patch('schedule_service.fetch_schedule_sync', side_effect=fetch) as upstream:
            await asyncio.gather(*(service.refresh() for _ in range(200)))
            self.assertEqual(upstream.call_count, 1)
        self.assertEqual(service.groups, ['АК-24-02', 'ПІ-24-02'])

    async def test_disk_cache_restores_after_restart(self):
        service = ScheduleService(); await service.load()
        with patch('schedule_service.fetch_schedule_sync', return_value=FIXTURE):
            self.assertTrue(await service.refresh())
        restored = ScheduleService(); await restored.load()
        self.assertEqual(restored.raw, FIXTURE)
        self.assertIsNotNone(restored.build('ПІ-24-02', 80, 60))

    async def test_failure_preserves_last_good(self):
        service = ScheduleService(); await service.load()
        service.install(FIXTURE, time.time())
        with patch('schedule_service.fetch_schedule_sync', side_effect=OSError('offline')) as upstream:
            await asyncio.gather(*(service.refresh() for _ in range(200)))
        self.assertEqual(upstream.call_count, 1)
        self.assertEqual(service.raw, FIXTURE)
        self.assertTrue(service.metadata()['stale'])

    async def test_invalid_refresh_preserves_snapshot(self):
        service = ScheduleService(); await service.load(); service.install(FIXTURE, time.time())
        with patch('schedule_service.fetch_schedule_sync', return_value={'oops': []}):
            self.assertFalse(await service.refresh())
        self.assertEqual(service.raw, FIXTURE)

    async def test_2000_views_with_200_users(self):
        await analytics.start_writer()
        async def visitor(n):
            for _ in range(10):
                analytics.record_request(f'user_{n}', 'ПІ-24-02', '/api/schedule', 'Android')
                await asyncio.sleep(0)
        await asyncio.gather(*(visitor(i) for i in range(200)))
        await asyncio.wait_for(analytics._queue.join(), 10)
        stats = await analytics.get_today_stats()
        self.assertEqual(stats['total_requests'], 2000)
        self.assertEqual(stats['unique_users'], 200)
        self.assertEqual(analytics.writer_status()['dropped'], 0)
        self.assertEqual((await analytics.get_platform_breakdown())[0]['count'], 2000)
        self.assertEqual((await analytics.get_user_counts())['total'], 200)
        self.assertEqual(len(await analytics.get_week_stats()), 7)

    async def test_shutdown_flushes_and_picker_excluded(self):
        await analytics.start_writer()
        analytics.record_request('a', 'ПІ-24-02', '/api/schedule', 'iPhone')
        analytics.record_request('', '', '/api/groups', 'Android')
        await analytics.stop_writer()
        stats = await analytics.get_today_stats()
        self.assertEqual(stats['total_requests'], 1)
        self.assertEqual(stats['unique_users'], 1)
        self.assertEqual((await analytics.get_live_activity())['requests'], 1)

    async def test_report_deduplication_is_per_admin(self):
        await analytics.mark_report_sent('2026-09-13', 1)
        await analytics.mark_report_sent('2026-09-13', 1)
        self.assertTrue(await analytics.report_sent('2026-09-13', 1))
        self.assertFalse(await analytics.report_sent('2026-09-13', 2))

    async def test_queue_is_bounded(self):
        await analytics.start_writer()
        for i in range(10010):
            analytics.record_request(str(i), 'ПІ-24-02', '/api/schedule')
        self.assertEqual(analytics.writer_status()['dropped'], 10)
        self.assertLessEqual(analytics.writer_status()['pending'], 10000)
        await asyncio.wait_for(analytics._queue.join(), 15)
