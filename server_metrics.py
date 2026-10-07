"""In-memory runtime metrics for the admin panel. No personal data is stored:
only counters per minute, latency samples and error class names."""
import asyncio
import os
import platform
import shutil
import socket
import sys
import threading
import time
from collections import deque
from datetime import datetime

from config import APP_VERSION, DB_PATH, KYIV

STARTED_AT = time.time()
_STARTED_MONO = time.monotonic()
_minutes = deque(maxlen=24 * 60)          # [minute_epoch, total, api, s4xx, s5xx, total_ms]
_latencies = deque(maxlen=4000)           # (monotonic, ms) for API requests
_totals = {'requests': 0, 's4xx': 0, 's5xx': 0}
_recent_errors = deque(maxlen=30)         # (iso time, path group, status)
_loop_lag = deque(maxlen=120)             # seconds of event loop drift, sampled every 1s
_cpu_prev = {'wall': time.monotonic(), 'cpu': sum(os.times()[:2])}
_lag_task = None


def _path_group(path):
    # Collapse paths to a small fixed set: never keep query strings / IDs.
    if path.startswith('/api/admin'):
        return '/api/admin'
    if path.startswith('/api/'):
        return path[:32]
    if path.startswith('/admin'):
        return '/admin'
    return 'static'


def record(path, status, elapsed_ms):
    minute = int(time.time() // 60)
    if not _minutes or _minutes[-1][0] != minute:
        _minutes.append([minute, 0, 0, 0, 0, 0.0])
    bucket = _minutes[-1]
    bucket[1] += 1
    bucket[5] += elapsed_ms
    _totals['requests'] += 1
    is_api = path.startswith('/api/') and not path.startswith('/api/admin')
    if is_api:
        bucket[2] += 1
        _latencies.append((time.monotonic(), elapsed_ms))
    if 400 <= status < 500:
        bucket[3] += 1
        _totals['s4xx'] += 1
    elif status >= 500:
        bucket[4] += 1
        _totals['s5xx'] += 1
        _recent_errors.append((datetime.now(KYIV).isoformat(timespec='seconds'), _path_group(path), status))


async def _measure_loop_lag():
    while True:
        start = time.monotonic()
        await asyncio.sleep(1)
        _loop_lag.append(max(0.0, time.monotonic() - start - 1))


def start_background():
    global _lag_task
    if _lag_task is None or _lag_task.done():
        _lag_task = asyncio.create_task(_measure_loop_lag(), name='loop-lag')


async def stop_background():
    global _lag_task
    if _lag_task:
        _lag_task.cancel()
        await asyncio.gather(_lag_task, return_exceptions=True)
    _lag_task = None


def _percentile(values, pct):
    if not values:
        return None
    values = sorted(values)
    k = min(len(values) - 1, max(0, round(pct / 100 * (len(values) - 1))))
    return round(values[k], 1)


def request_summary(window_minutes=60):
    now_minute = int(time.time() // 60)
    by_minute = {b[0]: b for b in _minutes}
    series = []
    for m in range(now_minute - window_minutes + 1, now_minute + 1):
        b = by_minute.get(m)
        series.append({
            'time': datetime.fromtimestamp(m * 60, KYIV).strftime('%H:%M'),
            'requests': b[1] if b else 0, 'api': b[2] if b else 0,
            's4xx': b[3] if b else 0, 's5xx': b[4] if b else 0,
            'avg_ms': round(b[5] / b[1], 1) if b and b[1] else 0,
        })
    cutoff = time.monotonic() - 300
    recent = [ms for t, ms in _latencies if t >= cutoff]
    last5 = series[-5:]
    return {
        'series': series,
        'last5': {
            'requests': sum(x['requests'] for x in last5),
            'api': sum(x['api'] for x in last5),
            's5xx': sum(x['s5xx'] for x in last5),
            's4xx': sum(x['s4xx'] for x in last5),
            'rpm': round(sum(x['requests'] for x in last5) / 5, 1),
        },
        'latency_ms': {'p50': _percentile(recent, 50), 'p95': _percentile(recent, 95),
                       'p99': _percentile(recent, 99), 'samples': len(recent)},
        'totals': dict(_totals),
        'recent_errors': [{'time': t, 'path': p, 'status': s} for t, p, s in reversed(_recent_errors)],
    }


def _read_proc(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return fh.read()
    except OSError:
        return ''


def _meminfo():
    info = {}
    for line in _read_proc('/proc/meminfo').splitlines():
        key, _, rest = line.partition(':')
        parts = rest.split()
        if parts and parts[0].isdigit():
            info[key] = int(parts[0]) * 1024
    if not info:
        return None
    total = info.get('MemTotal', 0)
    available = info.get('MemAvailable', info.get('MemFree', 0))
    return {'total': total, 'available': available, 'used': total - available,
            'percent': round((total - available) / total * 100, 1) if total else None}


def _process_rss():
    for line in _read_proc('/proc/self/status').splitlines():
        if line.startswith('VmRSS:'):
            return int(line.split()[1]) * 1024
    try:
        import resource
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return rss if sys.platform == 'darwin' else rss * 1024
    except Exception:
        return None


def _process_cpu_percent():
    now_wall, now_cpu = time.monotonic(), sum(os.times()[:2])
    dw, dc = now_wall - _cpu_prev['wall'], now_cpu - _cpu_prev['cpu']
    _cpu_prev.update(wall=now_wall, cpu=now_cpu)
    return round(dc / dw * 100, 1) if dw > 0.5 else None


def _file_size(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def _open_fds():
    try:
        return len(os.listdir('/proc/self/fd'))
    except OSError:
        return None


def system_info():
    try:
        load = os.getloadavg()
    except (OSError, AttributeError):
        load = None
    try:
        disk = shutil.disk_usage(os.path.dirname(DB_PATH))
        disk_info = {'total': disk.total, 'free': disk.free, 'used': disk.used,
                     'percent': round(disk.used / disk.total * 100, 1) if disk.total else None}
    except OSError:
        disk_info = None
    lags = list(_loop_lag)
    return {
        'version': APP_VERSION,
        'python': platform.python_version(),
        'platform': f'{platform.system()} {platform.release()}',
        'hostname': socket.gethostname(),
        'pid': os.getpid(),
        'started_at': datetime.fromtimestamp(STARTED_AT, KYIV).isoformat(timespec='seconds'),
        'uptime_seconds': round(time.monotonic() - _STARTED_MONO),
        'cpu_count': os.cpu_count(),
        'load_avg': [round(x, 2) for x in load] if load else None,
        'process': {'rss': _process_rss(), 'cpu_percent': _process_cpu_percent(),
                    'threads': threading.active_count(), 'open_fds': _open_fds()},
        'memory': _meminfo(),
        'disk': disk_info,
        'database': {'size': _file_size(DB_PATH), 'wal': _file_size(DB_PATH + '-wal')},
        'event_loop_lag_ms': {
            'current': round(lags[-1] * 1000, 1) if lags else None,
            'max_2min': round(max(lags) * 1000, 1) if lags else None,
        },
        'server_time': datetime.now(KYIV).isoformat(timespec='seconds'),
    }
