"""Synthetic service-layer benchmark, NOT an HTTP/VPS/browser capacity test."""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


async def run():
    from database import init_database
    import analytics
    from schedule_service import ScheduleService
    await init_database()
    await analytics.init_analytics_db()
    await analytics.start_writer()
    service = ScheduleService()
    lessons = [{'number': n, 'subject': 'Тестовий предмет', 'teacher': 'Тестовий викладач', 'cabinet': str(100+n), 'weeks': '1-4'} for n in range(1,9)]
    fixture = {f'ТЕСТ-{i:03}': {day: lessons for day in ['понеділок','вівторок','середа','четвер',"п'ятниця",'субота']} for i in range(200)}
    service.install(fixture, time.time())
    errors = 0
    async def visitor(i):
        nonlocal errors
        for _ in range(10):
            group = f'ТЕСТ-{i:03}'
            data = service.build(group,80,60)
            if data is None: errors += 1
            json.dumps({'status':'success','data':data,'meta':service.metadata()})
            analytics.record_request(f'test_{i}',group,'/api/schedule','Synthetic Android')
            await asyncio.sleep(0)
    started = time.perf_counter()
    await asyncio.gather(*(visitor(i) for i in range(200)))
    await asyncio.wait_for(analytics._queue.join(),20)
    elapsed = time.perf_counter()-started
    stats = await analytics.get_today_stats()
    status = analytics.writer_status()
    await analytics.stop_writer()
    print(json.dumps({'scope':'synthetic service-layer + real temporary SQLite; no HTTP, upstream, Telegram or browser',
        'concurrent_tasks':200,'operations':2000,'groups':200,'elapsed_including_flush_s':round(elapsed,3),
        'build_errors':errors,'persisted_views':stats['total_requests'],'unique_test_users':stats['unique_users'],
        'dropped_events':status['dropped']},ensure_ascii=False,indent=2))
    assert not errors and stats['total_requests']==2000 and stats['unique_users']==200 and status['dropped']==0


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        os.environ['MYKEP_DB_PATH'] = str(Path(tmp)/'benchmark.db')
        asyncio.run(run())
