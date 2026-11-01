import json
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import httpx
import analytics
import admin_stats
import database
import main
from activity_limits import ActivityLimits
from config import KYIV


class UsageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'usage.sqlite'
        self.patches = [patch.object(database,'DB_PATH',str(self.path)),
                        patch.object(analytics,'DB_PATH',str(self.path)),
                        patch.object(main,'usage_limits',ActivityLimits())]
        for item in self.patches:
            item.start()
        await analytics.init_analytics_db()
        await analytics.start_writer()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='https://localhost')
        self.payload = dict(uid='synthetic-usage-user',duration1=60,duration2=80,swipe='native',page='settings')

    async def asyncTearDown(self):
        await self.client.aclose()
        await analytics.stop_writer()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    async def stats(self):
        await analytics._queue.join()
        today=datetime.now(KYIV).date()
        return await admin_stats.usage_stats((today-timedelta(days=7)).isoformat(),(today+timedelta(days=1)).isoformat())

    async def test_validation_limits_origin_and_no_public_stats(self):
        for changes in [dict(duration1=90),dict(duration2='60'),dict(swipe='pointer'),dict(page='admin'),dict(uid='bad!'),dict(extra='x')]:
            self.assertEqual((await self.client.post('/api/usage',json={**self.payload,**changes})).status_code,422)
        self.assertEqual((await self.client.post('/api/usage',content=b'{'*1025)).status_code,413)
        self.assertEqual((await self.client.post('/api/usage',json=self.payload,headers={'Origin':'https://other.test'})).status_code,403)
        self.assertIn((await self.client.get('/api/admin/stats')).status_code,(401,403))
        self.assertEqual((await self.stats())['users'],0)

    async def test_deduplicated_visits_still_update_latest_settings(self):
        self.assertEqual((await self.client.post('/api/usage',json=self.payload)).status_code,204)
        self.assertEqual((await self.client.post('/api/usage',json={**self.payload,'duration1':80,'swipe':'baseline'})).status_code,204)
        stats=await self.stats()
        self.assertEqual(stats['users'],1)
        self.assertEqual(stats['duration1'],{60:0,80:1})
        self.assertEqual(stats['swipes'],{'native':0,'baseline':1})
        self.assertEqual(next(p for p in stats['pages'] if p['page']=='settings')['views'],1)
        self.assertEqual((await analytics._rows('SELECT COUNT(*) FROM analytics'))[0][0],0)

    async def test_unique_people_across_days_and_mixed_shifts(self):
        now=datetime.now(KYIV)
        for day in [now-timedelta(days=1),now]:
            analytics._queue.put_nowait(analytics.UsageRecord(day.strftime('%Y-%m-%d %H:%M:%S'),'user-a',60,80,'native','bells',day.timestamp()))
        analytics.record_usage('user-b',80,60,'baseline','bells')
        analytics.record_usage('user-b',80,60,'baseline',None)
        stats=await self.stats()
        bells=next(p for p in stats['pages'] if p['page']=='bells')
        self.assertEqual((bells['users'],bells['views']),(2,3))
        self.assertEqual(stats['duration1'],{60:1,80:1})
        self.assertEqual(stats['duration2'],{60:1,80:1})
        self.assertNotIn('user-a',json.dumps(stats))

    async def test_rate_limit_queue_failure_and_recovery(self):
        with patch.object(main,'usage_limits',ActivityLimits(global_burst=1,global_rate=0)):
            self.assertEqual((await self.client.post('/api/usage',json=self.payload)).status_code,204)
            self.assertEqual((await self.client.post('/api/usage',json={**self.payload,'uid':'another-user'})).status_code,429)
        with patch.object(analytics,'record_usage',return_value=False):
            self.assertEqual((await self.client.post('/api/usage',json={**self.payload,'page':'bells'})).status_code,503)
        self.assertEqual((await self.client.post('/api/usage',json={**self.payload,'page':'bells'})).status_code,204)

    async def test_batching_volume(self):
        started=time.perf_counter()
        for n in range(1000):
            self.assertTrue(analytics.record_usage(f'load-user-{n%100}',60,80,'native','dashboard'))
        await analytics._queue.join()
        elapsed=time.perf_counter()-started
        stats=await self.stats()
        row=next(p for p in stats['pages'] if p['page']=='dashboard')
        self.assertEqual((row['users'],row['views']),(100,1000))
        print(f'Usage synthetic batch: 1000 receipts, 100 profiles, {elapsed:.3f}s; daily rows={len(await analytics._rows("SELECT uid FROM usage_daily"))}')

    async def test_delayed_writer_and_clock_fold_keep_newest_received_state(self):
        stamp=datetime.now(KYIV).strftime('%Y-%m-%d %H:%M:%S')
        for duration,received in [(80,200),(60,100)]:
            analytics._queue.put_nowait(analytics.UsageRecord(stamp,'user-ordered',duration,60,'native',None,received))
        self.assertEqual((await self.stats())['duration1'],{60:0,80:1})
