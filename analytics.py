"""Anonymous schedule-view counters. A bounded queue prevents per-request SQLite writers."""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from config import KYIV, DB_PATH
from pathlib import Path
from backup_database import migration_backup
from database import connect

logger = logging.getLogger(__name__)
_queue = None
_writer = None
_rollup = None
_rollup_stop = None
ROLLUP_INTERVAL = 60
_last_rollup_error = False
_last_rollup_success = None
_dropped = 0
_last_write_error = False


async def init_analytics_db():
    global _last_rollup_success
    # Back up the target, including WAL, before any schema change. Never touch a
    # different deployment database or replace historical rows.
    async with connect() as db:
        columns = {row[1] for row in await db.execute_fetchall('PRAGMA table_info(analytics)')}
        tables = {row[0] for row in await db.execute_fetchall("SELECT name FROM sqlite_master WHERE type='table'")}
    if columns and ('event_kind' not in columns or 'display_mode' not in columns or
                    not {'usage_profiles', 'usage_daily'} <= tables):
        await asyncio.to_thread(migration_backup, Path(DB_PATH))
    async with connect() as db:
        await db.execute('BEGIN IMMEDIATE')
        await db.execute('''CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
            uid TEXT, group_name TEXT, endpoint TEXT, user_agent TEXT)''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_uid ON analytics(uid)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_group ON analytics(group_name)')
        # Non-destructive migration: old rows keep NULL (= unknown display mode).
        columns = {row[1] for row in await db.execute_fetchall('PRAGMA table_info(analytics)')}
        if 'display_mode' not in columns:
            await db.execute('ALTER TABLE analytics ADD COLUMN display_mode TEXT')
        if 'event_kind' not in columns:
            await db.execute("ALTER TABLE analytics ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'legacy_request'")
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analytics_endpoint_ts ON analytics(endpoint, timestamp)')
        await db.execute('''CREATE TABLE IF NOT EXISTS bot_reports (
            report_date TEXT NOT NULL, admin_id INTEGER NOT NULL,
            PRIMARY KEY (report_date, admin_id))''')
        await db.execute('''CREATE TABLE IF NOT EXISTS analytics_daily (
            day TEXT NOT NULL, group_name TEXT NOT NULL, event_kind TEXT NOT NULL,
            views INTEGER NOT NULL, users INTEGER NOT NULL,
            PRIMARY KEY(day, group_name, event_kind))''')
        await db.execute('''CREATE TABLE IF NOT EXISTS analytics_rollup_state (
            id INTEGER PRIMARY KEY CHECK(id=1), last_id INTEGER NOT NULL)''')
        await db.execute('''CREATE TABLE IF NOT EXISTS analytics_size (
            day TEXT PRIMARY KEY, bytes INTEGER NOT NULL, details INTEGER NOT NULL)''')
        await db.execute('''CREATE TABLE IF NOT EXISTS usage_profiles (
            uid TEXT PRIMARY KEY, seen TEXT NOT NULL, received REAL NOT NULL,
            duration1 INTEGER NOT NULL CHECK(duration1 IN (60,80)),
            duration2 INTEGER NOT NULL CHECK(duration2 IN (60,80)),
            swipe TEXT NOT NULL CHECK(swipe IN ('native','baseline')))''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_usage_seen ON usage_profiles(seen)')
        await db.execute('''CREATE TABLE IF NOT EXISTS usage_daily (
            day TEXT NOT NULL, uid TEXT NOT NULL,
            page TEXT NOT NULL CHECK(page IN ('dashboard','schedule','settings','bells')),
            views INTEGER NOT NULL, PRIMARY KEY(day,uid,page))''')
        await update_daily(db)
        await db.commit()
        _last_rollup_success = datetime.now(KYIV).isoformat()


async def start_writer():
    global _queue, _writer, _rollup, _rollup_stop, _dropped, _last_write_error, _last_rollup_error
    if _writer and not _writer.done():
        return
    _queue = asyncio.Queue(maxsize=10000)
    _dropped = 0
    _last_write_error = False
    _last_rollup_error = False
    _writer = asyncio.create_task(_write_loop(), name='analytics-writer')
    _rollup_stop = asyncio.Event()
    _rollup = asyncio.create_task(_rollup_loop(), name='analytics-rollup')


DISPLAY_MODES = {'standalone', 'browser'}


@dataclass(frozen=True)
class UsageRecord:
    timestamp: str
    uid: str
    duration1: int
    duration2: int
    swipe: str
    page: str | None
    received: float


def record_usage(uid: str, duration1: int, duration2: int, swipe: str, page: str | None) -> bool:
    global _dropped
    if _queue is None or _queue.full():
        _dropped += 1
        return False
    now = datetime.now(KYIV)
    _queue.put_nowait(UsageRecord(now.strftime('%Y-%m-%d %H:%M:%S'),
                                uid, duration1, duration2, swipe, page, now.timestamp()))
    return True


def record_request(uid, group_name, endpoint, user_agent='', display_mode=None, event_kind='legacy_request'):
    global _dropped
    mode = display_mode if display_mode in DISPLAY_MODES else None
    row = (datetime.now(KYIV).strftime('%Y-%m-%d %H:%M:%S'),
           str(uid or '')[:128], str(group_name).strip().upper()[:64],
           str(endpoint)[:64], str(user_agent)[:512], mode, event_kind)
    try:
        if _queue is None:
            raise asyncio.QueueFull
        _queue.put_nowait(row)
        return True
    except asyncio.QueueFull:
        _dropped += 1
        if _dropped == 1 or _dropped % 100 == 0:
            logger.warning('Analytics queue unavailable/full: %s events dropped', _dropped)
        return False


async def log_request(uid, group_name, endpoint, user_agent='', display_mode=None):
    """Compatibility wrapper for integrations using the previous async API."""
    record_request(uid, group_name, endpoint, user_agent, display_mode)


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
                    legacy = [row for row in batch if not isinstance(row, UsageRecord)]
                    usage = [row for row in batch if isinstance(row, UsageRecord)]
                    if legacy:
                        await db.executemany('INSERT INTO analytics (timestamp, uid, group_name, endpoint, user_agent, display_mode, event_kind) VALUES (?, ?, ?, ?, ?, ?, ?)', legacy)
                    if usage:
                        await db.executemany('''INSERT INTO usage_profiles(uid,seen,duration1,duration2,swipe,received)
                            VALUES (?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET
                            seen=excluded.seen,duration1=excluded.duration1,duration2=excluded.duration2,
                            swipe=excluded.swipe,received=excluded.received
                            WHERE excluded.received >= usage_profiles.received''',
                            [(r.uid,r.timestamp,r.duration1,r.duration2,r.swipe,r.received) for r in usage])
                        await db.executemany('''INSERT INTO usage_daily(day,uid,page,views) VALUES (?,?,?,1)
                            ON CONFLICT(day,uid,page) DO UPDATE SET views=views+1''',
                            [(r.timestamp[:10],r.uid,r.page) for r in usage if r.page])
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
    global _writer, _queue, _rollup
    if _rollup:
        # Let an active transaction close normally, including its SQLite thread.
        _rollup_stop.set()
        await asyncio.gather(_rollup, return_exceptions=True)
        _rollup = None
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
    await refresh_daily()


def writer_status():
    return {'running': bool(_writer and not _writer.done()),
            'pending': _queue.qsize() if _queue else 0,
            'dropped': _dropped, 'write_error': _last_write_error,
            'rollup_error': _last_rollup_error,
            'rollup_running': bool(_rollup and not _rollup.done()),
            'rollup_stale': _last_rollup_success is None or (datetime.now(KYIV) - datetime.fromisoformat(_last_rollup_success)).total_seconds() > ROLLUP_INTERVAL * 3,
            'last_rollup_success': _last_rollup_success}


async def refresh_daily():
    global _last_rollup_error, _last_rollup_success
    # Checkpoint and aggregates commit together. BEGIN IMMEDIATE serializes
    # catch-up across web/bot processes without blocking event-loop readers.
    async with connect() as db:
        await db.execute('BEGIN IMMEDIATE')
        await update_daily(db)
        await db.commit()
    _last_rollup_success = datetime.now(KYIV).isoformat()
    _last_rollup_error = False


async def _rollup_loop():
    global _last_rollup_error
    while not _rollup_stop.is_set():
        try:
            await asyncio.wait_for(_rollup_stop.wait(), ROLLUP_INTERVAL)
            return
        except asyncio.TimeoutError:
            pass
        try:
            await refresh_daily()
            _last_rollup_error = False
        except Exception:
            _last_rollup_error = True
            logger.exception('Analytics rollup failed; checkpoint will be retried')


async def _rows(query, params=()):
    async with connect() as db:
        return await db.execute_fetchall(query, params)


def _today():
    return datetime.now(KYIV).strftime('%Y-%m-%d')


def _next_day(day):
    return (datetime.strptime(day, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')


# Old /api/groups rows are intentionally excluded from reports, not deleted.
VIEWS = "endpoint = '/api/schedule' AND event_kind IN ('legacy_request','view','interaction')"


async def update_daily(db):
    checkpoint = await db.execute_fetchall('SELECT last_id FROM analytics_rollup_state WHERE id=1')
    last_id = checkpoint[0][0] if checkpoint else 0
    upper = (await db.execute_fetchall('SELECT COALESCE(MAX(id),0) FROM analytics'))[0][0]
    if upper == last_id:
        return
    days = await db.execute_fetchall('SELECT DISTINCT SUBSTR(timestamp,1,10) FROM analytics WHERE id>? AND id<=?', (last_id, upper))
    for (day,) in days:
        params = (day, _next_day(day))
        await db.execute('''INSERT OR REPLACE INTO analytics_daily
            SELECT SUBSTR(timestamp,1,10), group_name, event_kind, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
            FROM analytics WHERE endpoint='/api/schedule' AND timestamp>=? AND timestamp<? GROUP BY 1,2,3''', params)
        # Global uniques are computed from detail, never summed across groups.
        await db.execute('''INSERT OR REPLACE INTO analytics_daily
            SELECT SUBSTR(timestamp,1,10), '*', event_kind, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
            FROM analytics WHERE endpoint='/api/schedule' AND timestamp>=? AND timestamp<? GROUP BY 1,3''', params)
    await db.execute('INSERT OR REPLACE INTO analytics_rollup_state VALUES (1,?)', (upper,))
    size = sum(path.stat().st_size for path in (Path(DB_PATH), Path(DB_PATH + '-wal')) if path.exists())
    await db.execute('INSERT OR REPLACE INTO analytics_size VALUES (?,?,?)', (_today(), size, upper))


async def storage_status():
    samples = await _rows('SELECT day,bytes,details FROM analytics_size ORDER BY day DESC LIMIT 30')
    details = (await _rows('SELECT COUNT(*) FROM analytics'))[0][0]
    return {'details': details, 'automatic_deletion': False,
            'samples': [dict(zip(('day', 'bytes', 'details'), row)) for row in samples]}


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
