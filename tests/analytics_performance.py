"""Compare rollup placement using isolated synthetic SQLite files only."""
import asyncio
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import types
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import analytics
import database


async def measure(mode, path, old_update):
    with patch.object(database, 'DB_PATH', str(path)), patch.object(analytics, 'DB_PATH', str(path)):
        await database.init_database()
        await analytics.init_analytics_db()
        seed = [('2026-10-14 09:00:00', f'user-{i % 1000}', f'GROUP-{i % 10}',
                 '/api/schedule', 'synthetic', 'standalone', 'view') for i in range(40000)]
        with closing(sqlite3.connect(path)) as db, db:
            db.executemany('INSERT INTO analytics (timestamp,uid,group_name,endpoint,user_agent,display_mode,event_kind) VALUES (?,?,?,?,?,?,?)', seed)
        await analytics.refresh_daily()
        started = time.perf_counter()
        for batch in range(30):
            rows = [('2026-10-14 10:00:00', f'user-{i % 1200}', f'GROUP-{i % 10}',
                     '/api/schedule', 'synthetic', 'browser', 'interaction' if i % 3 else 'view')
                    for i in range(batch * 200, (batch + 1) * 200)]
            async with database.connect() as db:
                await db.executemany('INSERT INTO analytics (timestamp,uid,group_name,endpoint,user_agent,display_mode,event_kind) VALUES (?,?,?,?,?,?,?)', rows)
                if mode == 'baseline':
                    await old_update(db)
                await db.commit()
        write_seconds = time.perf_counter() - started
        if mode == 'candidate':
            await analytics.refresh_daily()
        elapsed = time.perf_counter() - started
        with closing(sqlite3.connect(path)) as db:
            detail = db.execute('SELECT COUNT(*),COUNT(DISTINCT uid) FROM analytics').fetchone()
            expected = db.execute("SELECT SUBSTR(timestamp,1,10),group_name,event_kind,COUNT(*),COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE endpoint='/api/schedule' GROUP BY 1,2,3 UNION ALL SELECT SUBSTR(timestamp,1,10),'*',event_kind,COUNT(*),COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE endpoint='/api/schedule' GROUP BY 1,3").fetchall()
            actual = db.execute('SELECT day,group_name,event_kind,views,users FROM analytics_daily').fetchall()
            assert sorted(actual) == sorted(expected)
            assert detail == (46000, 1200)
        return dict(mode=mode, seed=40000, batches=30, batch_size=200,
                    rollup_passes=30 if mode == 'baseline' else 1,
                    write_seconds=round(write_seconds, 4), total_seconds=round(elapsed, 4),
                    details=detail[0], global_users=detail[1], every_rollup_matches_detail=True)


async def main():
    source = subprocess.check_output(['git', 'show', 'd2cfdc4:analytics.py'], text=True, encoding='utf-8')
    baseline = types.ModuleType('baseline_analytics')
    exec(compile(source, 'd2cfdc4:analytics.py', 'exec'), baseline.__dict__)
    results = []
    with tempfile.TemporaryDirectory() as temporary:
        for mode in ('baseline', 'candidate'):
            path = Path(temporary) / (mode + '.sqlite')
            baseline.DB_PATH = str(path)
            results.append(await measure(mode, path, baseline.update_daily))
    target = Path('.mykep-local/analytics-performance.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
