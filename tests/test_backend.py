import copy
from contextlib import closing
import json
import sqlite3
import tempfile
import time
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

import httpx
import analytics
import database
import admin_stats
from backup_database import backup_database, verify_database
from config import KYIV
from schedule_service import (DAYS, ScheduleService, build_group_schedule, calendar_metadata,
                              is_lesson_active, parse_condition, valid_snapshot)
from teacher_hints import TeacherHintsService


def lesson(number='1', subject='Математика', week='1-4'):
    return dict(number=number, subject=subject, week=week, teacher='Тест Т.Т.', cabinet='101')


def snapshot():
    days = {day: [] for day in DAYS}
    days['середа'] = [lesson('7', week='1,3 (з 01.10.2026)')]
    days['понеділок'] = [lesson(subject='Захист України (1 група)'), lesson(subject='Захист України (2 група)'), lesson('2')]
    return {'ЕК(11)-24-03 | НТ-24-01': days}


class ScheduleTests(unittest.TestCase):
    def test_stats_admission_year_excludes_school_entry_marker(self):
        self.assertEqual(admin_stats.parse_group('ЕК(11)-24-03'), ('ЕК', 2024))
        self.assertEqual(admin_stats.parse_group('ПІ-24-02'), ('ПІ', 2024))

    def test_lists_ranges_and_dates(self):
        for text, expected in [('1,3', {1, 3}), ('2,4', {2, 4}), ('1–4', {1, 2, 3, 4}), ('1—3;4', {1, 2, 3, 4}), ('1/3', {1, 3}), ('2 та 4', {2, 4})]:
            with self.subTest(text=text):
                weeks, start = parse_condition(text + ' (з 01.10.2026)')
                self.assertEqual(set(weeks), expected)
                self.assertEqual(start, date(2026, 10, 1))
        self.assertTrue(is_lesson_active('1,3 (з 01.10.2026)', 3, date(2026, 10, 14)))
        self.assertFalse(is_lesson_active('1,3 (з 01.10.2026)', 3, date(2026, 9, 16)))
        self.assertFalse(is_lesson_active('2,4 (з 01.10.2026)', 1, date(2026, 10, 14)))

    def test_unknown_conditions_never_become_always(self):
        for value in ('пізніше', '1,5', '4-1', '1,3 (з 31.02.2026)', '1 (після канікул)'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_condition(value)
        with self.assertRaises(ValueError):
            is_lesson_active('1 (з 01.10.2026)', 1)

    def test_real_regression_third_week_and_shared_group_identity(self):
        data = snapshot()
        built = build_group_schedule(data, 'ЕК(11)-24-03', 80, 60, monday=date(2026, 10, 12))
        self.assertEqual(built['середа'][0]['lesson'], 7)
        self.assertEqual(build_group_schedule(data, 'НТ-24-01', 80, 60, monday=date(2026, 10, 12)), built)
        self.assertEqual(build_group_schedule(data, 'ЕК(11)-24-03', 80, 60, monday=date(2026, 9, 14))['середа'], [])

    def test_only_exact_duplicates_removed_and_subgroup_context(self):
        raw = snapshot()
        rows = raw[next(iter(raw))]['понеділок']
        rows.extend([copy.deepcopy(rows[0]), lesson(subject='Захист України (1 група)', week='1,3'), lesson(subject='Хімія (1 група)')])
        result = build_group_schedule(raw, 'НТ-24-01', 80, 60, week=1, ignore_start=True)['понеділок']
        self.assertEqual(len(result), 5)
        self.assertEqual(result[0]['subgroup']['context'], result[1]['subgroup']['context'])
        self.assertNotEqual(result[0]['subgroup']['context'], result[3]['subgroup']['context'])

    def test_snapshot_validation_and_empty_days(self):
        self.assertTrue(valid_snapshot(snapshot()))
        self.assertTrue(valid_snapshot({'Група': {day: [] for day in DAYS}}))
        for value in ({'ТЕСТ': {'понеділок': [{}]}}, {'Група': {'невідомий': []}}, {}, {'Група': {'понеділок': [lesson('0')]}}, {'Група': {'понеділок': [lesson(week='невідомо')]}}):
            self.assertFalse(valid_snapshot(value))

    def test_saturday_sunday_monday_without_fixed_cutoff(self):
        raw = snapshot()
        raw[next(iter(raw))]['субота'] = [lesson('8')]
        saturday = datetime(2026, 10, 17, 15, 0, tzinfo=KYIV)
        data = build_group_schedule(raw, 'НТ-24-01', 80, 60, now=saturday)
        self.assertEqual(calendar_metadata(saturday, data)['default_monday'], '2026-10-12')
        self.assertEqual(calendar_metadata(saturday.replace(hour=19), data)['default_monday'], '2026-10-19')
        self.assertEqual(calendar_metadata(saturday.replace(hour=0), {**data, 'субота': []})['default_monday'], '2026-10-19')
        self.assertEqual(calendar_metadata(datetime(2026, 10, 18, tzinfo=KYIV), data)['default_monday'], '2026-10-19')
        self.assertEqual(calendar_metadata(datetime(2026, 10, 19, tzinfo=KYIV), data)['default_monday'], '2026-10-19')


class DatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'test.sqlite'
        self.patches = [patch.object(database, 'DB_PATH', str(self.path)), patch.object(analytics, 'DB_PATH', str(self.path))]
        for item in self.patches:
            item.start()
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE analytics (id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT NOT NULL,uid TEXT,group_name TEXT,endpoint TEXT,user_agent TEXT)')
            db.executemany('INSERT INTO analytics (timestamp,uid,group_name,endpoint,user_agent) VALUES (?,?,?,?,?)', [
                ('2026-10-14 10:00:00', 'synthetic-a', 'ПІ-24-01', '/api/schedule', 'test'),
                ('2026-10-14 10:01:00', 'synthetic-a', 'ПІ-24-02', '/api/schedule', 'test'),
                ('2026-10-14 10:02:00', 'synthetic-b', 'ПІ-24-02', '/api/schedule', 'test')])
            self.before = db.execute('SELECT * FROM analytics ORDER BY id').fetchall()
        await analytics.init_analytics_db()
        await analytics.start_writer()
        admin_stats._cache.clear()

    async def asyncTearDown(self):
        await analytics.stop_writer()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    async def test_idempotent_migration_preserves_every_legacy_value(self):
        await analytics.init_analytics_db()
        with closing(sqlite3.connect(self.path)) as db, db:
            after = db.execute('SELECT id,timestamp,uid,group_name,endpoint,user_agent FROM analytics ORDER BY id').fetchall()
            self.assertEqual(after, self.before)
            self.assertEqual(db.execute('SELECT DISTINCT event_kind FROM analytics').fetchall(), [('legacy_request',)])
        backups = list((self.path.parent / 'backups').glob('*.sqlite'))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as db, db:
            self.assertEqual(db.execute('SELECT * FROM analytics ORDER BY id').fetchall(), self.before)

    async def test_wal_backup_and_restore(self):
        with closing(sqlite3.connect(self.path)) as live, live:
            live.execute('INSERT INTO analytics (timestamp,uid) VALUES (?,?)', ('2026-10-14', 'wal-synthetic'))
            live.commit()
            dest = backup_database(self.path, self.path.parent / 'verified.sqlite')
            with closing(sqlite3.connect(dest)) as db, db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM analytics').fetchone()[0], 4)
            self.assertTrue(verify_database(dest))

    async def test_refresh_distinct_from_views_and_global_uniques(self):
        analytics.record_request('synthetic-a', 'ПІ-24-02', '/api/schedule', event_kind='refresh')
        analytics.record_request('synthetic-c', 'ПІ-24-02', '/api/schedule', event_kind='view')
        await analytics._queue.join()
        rows = await admin_stats.daily_summaries()
        legacy = next(row for row in rows if row['event_kind'] == 'legacy_request')
        self.assertEqual((legacy['views'], legacy['users']), (3, 2))
        with patch.object(admin_stats, '_today', return_value=date(2026, 10, 14)):
            stats = await admin_stats._stats('1')
        self.assertEqual(stats['specialties'][0]['users'], 3)
        self.assertEqual(stats['courses'][0]['users'], 3)
        self.assertEqual(stats['totals']['views'], 4)

    async def test_corrupt_refresh_retains_good_snapshot(self):
        service = ScheduleService()
        service.install(snapshot(), time.time())
        before = copy.deepcopy(service.raw)
        with patch('schedule_service.fetch_schedule_sync', return_value={'ТЕСТ': {'понеділок': [{}]}}):
            self.assertFalse(await service.refresh())
        self.assertEqual(service.raw, before)
        self.assertTrue(service.metadata()['stale'])
        self.assertEqual(service.diagnostics()['last_error_type'], 'ValueError')

    async def test_api_conditional_response_and_admin_protection(self):
        import main
        service = ScheduleService()
        service.install(snapshot(), time.time())
        with patch.object(main, 'schedule', service):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://localhost') as client:
                first = await client.get('/api/schedule', params={'group': 'НТ-24-01', 'event': 'view'})
                self.assertEqual(first.status_code, 200)
                self.assertEqual(set(first.json()['cycle']), {'1', '2', '3', '4'})
                checked = service.updated_at + 1
                service.updated_at = checked
                second = await client.get('/api/schedule', params={'group': 'НТ-24-01', 'event': 'refresh'}, headers={'If-None-Match': first.headers['etag']})
                self.assertEqual(second.status_code, 304)
                self.assertEqual(second.content, b'')
                self.assertIn('X-Source-Checked-At', second.headers)
                for path in ('/api/admin/analytics/daily', '/api/admin/analytics/details', '/api/admin/server'):
                    self.assertEqual((await client.get(path)).status_code, 401)

    async def test_teacher_failure_preserves_last_good(self):
        service = TeacherHintsService()
        await service.load()
        before = service.teachers.copy()
        with patch('teacher_hints.fetch_teachers_sync', side_effect=ValueError('invalid')):
            self.assertFalse(await service.refresh())
        self.assertEqual(service.teachers, before)

    async def test_admin_refresh_retains_auth_csrf_and_same_origin(self):
        import main
        import admin_api
        import admin_auth
        await admin_auth.init_admin_db()
        service = ScheduleService()
        await service.load()
        service.install(snapshot(), time.time())
        token = await admin_auth.create_session(next(iter(admin_auth.ADMIN_IDS)), 'Test', '', 'test', '127.0.0.1', 'synthetic')
        with patch.object(admin_api, '_schedule', service), patch('schedule_service.fetch_schedule_sync', return_value=snapshot()):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='https://localhost') as client:
                client.cookies.set(admin_auth.COOKIE_NAME, token)
                me = await client.get('/api/admin/me')
                self.assertEqual(me.status_code, 200)
                csrf = me.json()['data']['csrf']
                without = await client.post('/api/admin/actions/refresh-schedule', json={}, headers={'Origin': 'https://localhost'})
                self.assertEqual(without.status_code, 403)
                foreign = await client.post('/api/admin/actions/refresh-schedule', json={}, headers={'Origin': 'https://foreign.invalid', 'X-CSRF-Token': csrf})
                self.assertEqual(foreign.status_code, 403)
                refreshed = await client.post('/api/admin/actions/refresh-schedule', json={}, headers={'Origin': 'https://localhost', 'X-CSRF-Token': csrf})
                self.assertEqual(refreshed.status_code, 200)
                self.assertTrue(refreshed.json()['data']['refreshed'])
                for path in ('/api/admin/analytics/daily', '/api/admin/analytics/details'):
                    result = await client.get(path)
                    self.assertEqual(result.status_code, 200)
                    self.assertNotIn('uid', json.dumps(result.json()))


if __name__ == '__main__':
    unittest.main()
