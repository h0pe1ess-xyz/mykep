"""Anonymous schedule-view counters. A bounded queue prevents per-request SQLite writers."""
import asyncio
import logging
from datetime import datetime, timedelta

from config import KYIV
from database import connect

logger = logging.getLogger(__name__)
_queue = None
_writer = None
_dropped = 0
_last_write_error = False


async def init_analytics_db():
    async with connect() as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
            uid TEXT, group_name TEXT, endpoint TEXT, user_agent TEXT)''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_uid ON analytics(uid)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_group ON analytics(group_name)')
        await db.execute('''CREATE TABLE IF NOT EXISTS bot_reports (
            report_date TEXT NOT NULL, admin_id INTEGER NOT NULL,
            PRIMARY KEY (report_date, admin_id))''')
        await db.commit()


async def start_writer():
    global _queue, _writer, _dropped, _last_write_error
    if _writer and not _writer.done():
        return
    _queue = asyncio.Queue(maxsize=10000)
    _dropped = 0
    _last_write_error = False
    _writer = asyncio.create_task(_write_loop(), name='analytics-writer')


def record_request(uid, group_name, endpoint, user_agent=''):
    global _dropped
    row = (datetime.now(KYIV).strftime('%Y-%m-%d %H:%M:%S'),
           str(uid or '')[:128], str(group_name).strip().upper()[:64],
           str(endpoint)[:64], str(user_agent)[:512])
    try:
        if _queue is None:
            raise asyncio.QueueFull
        _queue.put_nowait(row)
    except asyncio.QueueFull:
        _dropped += 1
        if _dropped == 1 or _dropped % 100 == 0:
            logger.warning('Analytics queue unavailable/full: %s events dropped', _dropped)


async def log_request(uid, group_name, endpoint, user_agent=''):
    """Compatibility wrapper for integrations using the previous async API."""
    record_request(uid, group_name, endpoint, user_agent)


async def _write_loop():
    global _last_write_error, _dropped
    while True:
        first = await _queue.get()
        if first is None:
            _queue.task_done()
            return
        batch = [first]
        # Small batching window turns a traffic burst into a handful of commits.
        await asyncio.sleep(0.05)
        stopping = False
        while len(batch) < 200:
            try:
                item = _queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if item is None:
                _queue.task_done()
                stopping = True
                break
            batch.append(item)
        for attempt in range(3):
            try:
                async with connect() as db:
                    await db.executemany('INSERT INTO analytics (timestamp, uid, group_name, endpoint, user_agent) VALUES (?, ?, ?, ?, ?)', batch)
                    await db.commit()
                _last_write_error = False
                break
            except Exception as exc:
                _last_write_error = True
                logger.warning('Analytics batch write failed (%s)', type(exc).__name__)
                if attempt == 2:
                    _dropped += len(batch)
                else:
                    await asyncio.sleep(0.2 * (attempt + 1))
        for _ in batch:
            _queue.task_done()
        if stopping:
            return


async def stop_writer():
    global _writer, _queue
    if _writer and not _writer.done():
        try:
            await asyncio.wait_for(_queue.put(None), timeout=5)
            await asyncio.wait_for(asyncio.shield(_writer), timeout=25)
        except asyncio.TimeoutError:
            logger.warning('Analytics shutdown timed out; pending events may be lost')
            _writer.cancel()
            await asyncio.gather(_writer, return_exceptions=True)
    _writer = None
    _queue = None


def writer_status():
    return {'running': bool(_writer and not _writer.done()),
            'pending': _queue.qsize() if _queue else 0,
            'dropped': _dropped, 'write_error': _last_write_error}


async def _rows(query, params=()):
    async with connect() as db:
        return await db.execute_fetchall(query, params)


def _today():
    return datetime.now(KYIV).strftime('%Y-%m-%d')


def _next_day(day):
    return (datetime.strptime(day, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')


# Old /api/groups rows are intentionally excluded from reports, not deleted.
VIEWS = "endpoint = '/api/schedule'"


async def get_today_stats():
    today = _today()
    params = (today, _next_day(today))
    counts = (await _rows(f"SELECT COUNT(*), COUNT(DISTINCT NULLIF(uid, '')) FROM analytics WHERE {VIEWS} AND timestamp >= ? AND timestamp < ?", params))[0]
    groups = await _rows(f"SELECT group_name, COUNT(*) AS cnt FROM analytics WHERE {VIEWS} AND timestamp >= ? AND timestamp < ? AND group_name != '' GROUP BY group_name ORDER BY cnt DESC LIMIT 5", params)
    return {'date': today, 'total_requests': counts[0], 'unique_users': counts[1], 'top_groups': groups}


async def get_week_stats():
    today = datetime.now(KYIV).date()
    start = (today - timedelta(days=6)).isoformat()
    rows = await _rows(f"SELECT SUBSTR(timestamp,1,10), COUNT(*), COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE {VIEWS} AND timestamp >= ? AND timestamp < ? GROUP BY SUBSTR(timestamp,1,10)", (start, (today + timedelta(days=1)).isoformat()))
    by_day = {r[0]: r[1:] for r in rows}
    result = []
    for i in range(6, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        requests, users = by_day.get(day, (0, 0))
        result.append({'date': day, 'requests': requests, 'users': users})
    return result


async def get_top_groups(limit=10):
    return await _rows(f"SELECT group_name, COUNT(*) AS cnt FROM analytics WHERE {VIEWS} AND group_name != '' GROUP BY group_name ORDER BY cnt DESC LIMIT ?", (max(1, min(limit, 50)),))


async def get_user_counts():
    now = datetime.now(KYIV)
    # Rolling 7/30-day windows; DAU uses the Kyiv calendar day.
    bounds = (_today(), (now-timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S'), (now-timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S'))
    row = (await _rows(f"""SELECT
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE {VIEWS}""", bounds))[0]
    return dict(zip(('dau', 'wau', 'mau', 'total'), row))


async def get_hourly_activity():
    rows = await _rows(f"SELECT SUBSTR(timestamp,12,2), COUNT(*) FROM analytics WHERE {VIEWS} AND timestamp >= ? AND timestamp < ? GROUP BY SUBSTR(timestamp,12,2) ORDER BY 1", (_today(), _next_day(_today())))
    return [{'hour': f'{r[0]}:00', 'requests': r[1]} for r in rows]


async def get_platform_breakdown():
    # Aggregate in SQL: don't load every historical User-Agent into Python.
    rows = await _rows(f"""SELECT CASE
      WHEN LOWER(user_agent) LIKE '%iphone%' OR LOWER(user_agent) LIKE '%ipad%' THEN 'iOS'
      WHEN LOWER(user_agent) LIKE '%android%' THEN 'Android'
      WHEN LOWER(user_agent) LIKE '%macintosh%' OR LOWER(user_agent) LIKE '%mac os%' THEN 'macOS'
      WHEN LOWER(user_agent) LIKE '%windows%' THEN 'Windows'
      WHEN LOWER(user_agent) LIKE '%linux%' THEN 'Linux' ELSE 'Other' END AS platform,
      COUNT(*) AS cnt FROM analytics WHERE {VIEWS} AND user_agent != '' GROUP BY platform ORDER BY cnt DESC""")
    total = sum(r[1] for r in rows) or 1
    return [{'platform': r[0], 'count': r[1], 'percent': round(r[1]/total*100, 1)} for r in rows]


async def get_live_activity(minutes=60):
    cutoff = (datetime.now(KYIV)-timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')
    counts = (await _rows(f"SELECT COUNT(*), COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE {VIEWS} AND timestamp >= ?", (cutoff,)))[0]
    top = await _rows(f"SELECT group_name, COUNT(*) AS cnt FROM analytics WHERE {VIEWS} AND timestamp >= ? AND group_name != '' GROUP BY group_name ORDER BY cnt DESC LIMIT 3", (cutoff,))
    return {'period_minutes': minutes, 'requests': counts[0], 'unique_users': counts[1], 'top_groups': top}


async def report_sent(day, admin_id):
    return bool(await _rows('SELECT 1 FROM bot_reports WHERE report_date=? AND admin_id=?', (day, admin_id)))


async def mark_report_sent(day, admin_id):
    async with connect() as db:
        await db.execute('INSERT OR IGNORE INTO bot_reports VALUES (?, ?)', (day, admin_id))
        await db.commit()
