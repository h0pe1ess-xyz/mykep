"""Isolated directory tests. Real temporary SQLite, mocked upstream only."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import database
import teacher_hints as module


class DirectoryValidation(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(module.validate_teachers({'teachers': {'КЛЮЧ': ' Ім’я '}}), {'КЛЮЧ': 'Ім’я'})

    def test_invalid(self):
        for payload in [None, {}, {'teachers': []}, {'teachers': {}}, {'teachers': {'x': None}}, {'teachers': {'x': ' '}}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                module.validate_teachers(payload)


class DirectoryCache(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(database, 'DB_PATH', str(Path(self.temp.name) / 'test.db'))
        self.db_patch.start()
        await database.init_database()
        self.service = module.TeacherHintsService()
        await self.service.load()

    async def asyncTearDown(self):
        self.db_patch.stop()
        self.temp.cleanup()

    async def test_bundled_snapshot(self):
        self.assertEqual(self.service.teachers['БІЛАНОЯ'], 'Білан Ольга Ярославівна')

    async def test_refresh_persists(self):
        with patch.object(module, 'fetch_teachers_sync', return_value={'TEST': 'Test Teacher'}):
            self.assertTrue(await self.service.refresh())
        other = module.TeacherHintsService()
        await other.load()
        self.assertEqual(other.teachers, {'TEST': 'Test Teacher'})

    async def test_failure_preserves_good_snapshot(self):
        before = dict(self.service.teachers)
        with patch.object(module, 'fetch_teachers_sync', side_effect=TimeoutError):
            self.assertFalse(await self.service.refresh())
        self.assertEqual(before, self.service.teachers)

    async def test_single_fetch_for_concurrent_refresh(self):
        with patch.object(module, 'fetch_teachers_sync', return_value={'TEST': 'Test Teacher'}) as fetch:
            results = await asyncio.gather(*(self.service.refresh() for _ in range(200)))
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(sum(results), 1)

    async def test_old_db_cannot_replace_newer_bundle(self):
        async with database.connect() as db:
            await db.execute('INSERT OR REPLACE INTO teacher_snapshot VALUES (1, ?, ?)', (json.dumps({'OLD': 'Old Teacher'}), 1))
            await db.commit()
        await self.service.load()
        self.assertIn('БІЛАНОЯ', self.service.teachers)
