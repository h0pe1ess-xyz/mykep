"""Aggregated statistics for the admin panel, computed from the existing
`analytics` table (history is preserved, nothing is deleted or rewritten).
Only aggregates leave this module: raw UIDs and User-Agents are never returned."""
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from config import COLLEGE_SIZE, KYIV
from database import connect

VIEWS = "endpoint = '/api/schedule'"
RANGES = {'1': 1, '7': 7, '14': 14, '30': 30, '90': 90, 'all': None}
WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
_cache = {}
CACHE_SECONDS = 20

PLATFORM_SQL = """CASE
  WHEN LOWER(user_agent) LIKE '%iphone%' OR LOWER(user_agent) LIKE '%ipad%' THEN 'iOS'
  WHEN LOWER(user_agent) LIKE '%android%' THEN 'Android'
  WHEN LOWER(user_agent) LIKE '%macintosh%' OR LOWER(user_agent) LIKE '%mac os%' THEN 'macOS'
  WHEN LOWER(user_agent) LIKE '%windows%' THEN 'Windows'
  WHEN LOWER(user_agent) LIKE '%linux%' THEN 'Linux' ELSE 'Інше' END"""
BROWSER_SQL = """CASE
  WHEN LOWER(user_agent) LIKE '%telegram%' THEN 'Telegram'
  WHEN LOWER(user_agent) LIKE '%instagram%' THEN 'Instagram'
  WHEN LOWER(user_agent) LIKE '%samsungbrowser%' THEN 'Samsung Internet'
  WHEN LOWER(user_agent) LIKE '%edg/%' OR LOWER(user_agent) LIKE '%edgios%' OR LOWER(user_agent) LIKE '%edga/%' THEN 'Edge'
  WHEN LOWER(user_agent) LIKE '%opr/%' OR LOWER(user_agent) LIKE '%opera%' THEN 'Opera'
  WHEN LOWER(user_agent) LIKE '%firefox%' OR LOWER(user_agent) LIKE '%fxios%' THEN 'Firefox'
  WHEN LOWER(user_agent) LIKE '%crios%' OR LOWER(user_agent) LIKE '%chrome%' THEN 'Chrome'
  WHEN LOWER(user_agent) LIKE '%safari%' THEN 'Safari'
  ELSE 'Інше' END"""

# Default bell schedule (1st shift 80 min, 2nd shift 60 min) used to classify
# when people look at the schedule: during a lesson or during a break.
LESSON_SLOTS = [(1, '08:00', '09:20'), (2, '09:30', '10:50'), (3, '11:10', '12:30'), (4, '12:40', '14:00'),
                (5, '14:10', '15:10'), (6, '15:20', '16:20'), (7, '16:30', '17:30'), (8, '17:40', '18:40')]


def _minutes(hm):
    h, m = hm.split(':')
    return int(h) * 60 + int(m)


async def _rows(query, params=()):
    async with connect() as db:
        return await db.execute_fetchall(query, params)


def _now():
    return datetime.now(KYIV)


def _today():
    return _now().date()


async def _cached(key, producer):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = await producer()
    if len(_cache) > 64:
        _cache.clear()
    _cache[key] = (time.monotonic(), value)
    return value


def _days(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _pct(a, b):
    return round(a / b * 100, 1) if b else None


def parse_group(name):
    """ПІ-24-02 -> ('ПІ', 2024). Returns (None, None) when unknown."""
    m = re.match(r'^\s*([^\d\s\-–]+)[\s\-–]*(\d{2})', str(name or ''))
    if not m:
        return None, None
    return m.group(1).upper(), 2000 + int(m.group(2))


def course_for(year, today=None):
    today = today or _today()
    academic_start = today.year if today.month >= 9 else today.year - 1
    course = academic_start - year + 1
    return course if 1 <= course <= 5 else None


# ---------------------------------------------------------------- overview
async def overview():
    return await _cached('overview', _overview)


async def _overview():
    now = _now()
    today = now.date()
    yesterday = today - timedelta(days=1)
    t0, t1 = today.isoformat(), (today + timedelta(days=1)).isoformat()
    y0 = yesterday.isoformat()
    same_time_yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')

    def ago(**kw):
        return (now - timedelta(**kw)).strftime('%Y-%m-%d %H:%M:%S')

    row = (await _rows(f"""SELECT
        SUM(timestamp >= ?), COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        SUM(timestamp >= ? AND timestamp < ?), COUNT(DISTINCT CASE WHEN timestamp >= ? AND timestamp < ? THEN NULLIF(uid,'') END),
        SUM(timestamp >= ? AND timestamp <= ?),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT CASE WHEN timestamp >= ? THEN NULLIF(uid,'') END),
        COUNT(DISTINCT NULLIF(uid,'')), COUNT(*), MIN(timestamp)
        FROM analytics WHERE {VIEWS}""",
        (t0, t0, y0, t0, y0, t0, y0, same_time_yesterday,
         ago(minutes=5), ago(minutes=15), ago(hours=1), ago(days=7), ago(days=30))))[0]
    (views_today, users_today, views_yday, users_yday, views_yday_same_time,
     live5, live15, live60, wau, mau, total_users, total_views, first_ts) = [x or 0 for x in row[:12]] + [row[12]]

    new_today = (await _rows(f"""SELECT COUNT(*) FROM (SELECT uid, MIN(timestamp) AS first
        FROM analytics WHERE {VIEWS} AND uid != '' GROUP BY uid) WHERE first >= ?""", (t0,)))[0][0]

    hourly = await _rows(f"""SELECT SUBSTR(timestamp,1,10), CAST(SUBSTR(timestamp,12,2) AS INTEGER), COUNT(*)
        FROM analytics WHERE {VIEWS} AND timestamp >= ? AND timestamp < ? GROUP BY 1, 2""", (y0, t1))
    today_hours, yday_hours = [0] * 24, [0] * 24
    for day, hour, cnt in hourly:
        (today_hours if day == t0 else yday_hours)[hour] = cnt

    last60 = await _rows(f"""SELECT SUBSTR(timestamp,12,5), COUNT(*) FROM analytics
        WHERE {VIEWS} AND timestamp >= ? GROUP BY 1""", (ago(minutes=59, seconds=now.second),))
    per_min = dict(last60)
    minute_series = []
    for i in range(59, -1, -1):
        label = (now - timedelta(minutes=i)).strftime('%H:%M')
        minute_series.append({'time': label, 'views': per_min.get(label, 0)})

    spark = await _rows(f"""SELECT SUBSTR(timestamp,1,10), COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {VIEWS} AND timestamp >= ? GROUP BY 1""", ((today - timedelta(days=13)).isoformat(),))
    by_day = {r[0]: (r[1], r[2]) for r in spark}
    daily14 = [{'date': d.isoformat(), 'views': by_day.get(d.isoformat(), (0, 0))[0],
                'users': by_day.get(d.isoformat(), (0, 0))[1]} for d in _days(today - timedelta(days=13), today)]

    top_today = await _rows(f"""SELECT group_name, COUNT(*), COUNT(DISTINCT NULLIF(uid,'')) FROM analytics
        WHERE {VIEWS} AND timestamp >= ? AND group_name != '' GROUP BY group_name ORDER BY 2 DESC LIMIT 5""", (t0,))
    live_groups = await _rows(f"""SELECT group_name, COUNT(*) FROM analytics WHERE {VIEWS} AND timestamp >= ?
        AND group_name != '' GROUP BY group_name ORDER BY 2 DESC LIMIT 5""", (ago(hours=1),))

    peak_hour_today = max(range(24), key=lambda h: today_hours[h]) if any(today_hours) else None
    return {
        'now': now.isoformat(timespec='seconds'),
        'today': {'views': views_today, 'users': users_today, 'new_users': new_today,
                  'views_per_user': round(views_today / users_today, 1) if users_today else 0,
                  'peak_hour': peak_hour_today},
        'yesterday': {'views': views_yday, 'users': users_yday, 'views_same_time': views_yday_same_time},
        'delta_views_same_time_pct': _pct(views_today - views_yday_same_time, views_yday_same_time),
        'live': {'users_5m': live5, 'users_15m': live15, 'users_60m': live60, 'groups_60m': [
            {'group': g, 'views': c} for g, c in live_groups]},
        'audience': {'dau': users_today, 'wau': wau, 'mau': mau, 'total': total_users,
                     'stickiness_pct': _pct(users_today, mau), 'college_size': COLLEGE_SIZE,
                     'reach_pct': _pct(mau, COLLEGE_SIZE)},
        'all_time': {'views': total_views, 'users': total_users, 'since': first_ts[:10] if first_ts else None},
        'hours_today': today_hours, 'hours_yesterday': yday_hours,
        'last_60_minutes': minute_series,
        'daily_14': daily14,
        'top_groups_today': [{'group': g, 'views': c, 'users': u} for g, c, u in top_today],
    }


# ------------------------------------------------------------------- stats
async def stats(range_key):
    if range_key not in RANGES:
        range_key = '30'
    return await _cached(f'stats:{range_key}', lambda: _stats(range_key))


async def _stats(range_key):
    today = _today()
    n = RANGES[range_key]
    if n is None:
        first = (await _rows(f'SELECT MIN(timestamp) FROM analytics WHERE {VIEWS}'))[0][0]
        start = date.fromisoformat(first[:10]) if first else today
    else:
        start = today - timedelta(days=n - 1)
    s0, s1 = start.isoformat(), (today + timedelta(days=1)).isoformat()
    ndays = (today - start).days + 1
    where = f'{VIEWS} AND timestamp >= ? AND timestamp < ?'
    p = (s0, s1)

    totals = (await _rows(f"SELECT COUNT(*), COUNT(DISTINCT NULLIF(uid,'')) FROM analytics WHERE {where}", p))[0]
    total_views, total_users = totals[0] or 0, totals[1] or 0

    # Daily series with new vs returning users (first-seen computed over ALL history).
    daily = await _rows(f"""SELECT SUBSTR(timestamp,1,10), COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {where} GROUP BY 1""", p)
    first_seen_rows = await _rows(f"""SELECT first, COUNT(*) FROM (SELECT SUBSTR(MIN(timestamp),1,10) AS first
        FROM analytics WHERE {VIEWS} AND uid != '' GROUP BY uid) GROUP BY first""")
    first_seen = dict(first_seen_rows)
    by_day = {r[0]: (r[1], r[2]) for r in daily}
    series = []
    cumulative = sum(c for d, c in first_seen.items() if d < s0)
    for d in _days(start, today):
        key = d.isoformat()
        views, users = by_day.get(key, (0, 0))
        new = first_seen.get(key, 0)
        cumulative += new
        series.append({'date': key, 'weekday': WEEKDAYS[d.weekday()], 'views': views, 'users': users,
                       'new_users': new, 'returning_users': max(0, users - new), 'total_users': cumulative})

    # Time of day: hourly average, 15-minute profile, weekday x hour heatmap.
    minute_rows = await _rows(f"""SELECT CAST(strftime('%w', timestamp) AS INTEGER), SUBSTR(timestamp,12,5), COUNT(*)
        FROM analytics WHERE {where} GROUP BY 1, 2""", p)
    hours = [0] * 24
    quarter = [0] * 96
    heat = [[0] * 24 for _ in range(7)]
    slot_counter = Counter()
    weekday_totals = [0] * 7
    for wd_sqlite, hm, cnt in minute_rows:
        wd = (wd_sqlite + 6) % 7            # SQLite: 0=Sunday -> Monday-first
        minute = _minutes(hm)
        hours[minute // 60] += cnt
        quarter[minute // 15] += cnt
        heat[wd][minute // 60] += cnt
        weekday_totals[wd] += cnt
        slot_counter[_slot_for(minute)] += cnt
    weekday_days = Counter(d.weekday() for d in _days(start, today))
    slots = _slot_breakdown(slot_counter)

    peak_hour = max(range(24), key=lambda h: hours[h]) if any(hours) else None
    peak_quarter = max(range(96), key=lambda q: quarter[q]) if any(quarter) else None
    weekday_avg = [round(weekday_totals[i] / weekday_days[i], 1) if weekday_days[i] else 0 for i in range(7)]
    peak_weekday = max(range(7), key=lambda i: weekday_avg[i]) if any(weekday_avg) else None
    best_day = max(series, key=lambda x: x['views']) if series else None
    best_dau = max(series, key=lambda x: x['users']) if series else None

    # Groups, specialties, admission years.
    group_rows = await _rows(f"""SELECT group_name, COUNT(*), COUNT(DISTINCT NULLIF(uid,'')) FROM analytics
        WHERE {where} AND group_name != '' GROUP BY group_name ORDER BY 2 DESC LIMIT 400""", p)
    groups = [{'group': g, 'views': c, 'users': u} for g, c, u in group_rows]
    spec_views, spec_users, year_views, year_users = Counter(), Counter(), Counter(), Counter()
    uid_group_rows = await _rows(f"""SELECT group_name, COUNT(DISTINCT NULLIF(uid,'')) FROM analytics
        WHERE {where} AND group_name != '' GROUP BY group_name""", p)
    for g in groups:
        spec, year = parse_group(g['group'])
        spec_views[spec or 'Інше'] += g['views']
        if year:
            year_views[year] += g['views']
    for g, u in uid_group_rows:
        spec, year = parse_group(g)
        spec_users[spec or 'Інше'] += u
        if year:
            year_users[year] += u
    specialties = [{'name': k, 'views': v, 'users': spec_users.get(k, 0)} for k, v in spec_views.most_common(20)]
    courses = []
    for year, v in sorted(year_views.items(), reverse=True):
        c = course_for(year)
        courses.append({'year': year, 'course': c, 'label': f'{c} курс' if c else f'вступ {year}',
                        'views': v, 'users': year_users.get(year, 0)})

    # Devices: by unique users (people) and views.
    platforms = await _rows(f"""SELECT {PLATFORM_SQL} AS k, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {where} AND user_agent != '' GROUP BY k ORDER BY 3 DESC""", p)
    browsers = await _rows(f"""SELECT {BROWSER_SQL} AS k, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {where} AND user_agent != '' GROUP BY k ORDER BY 3 DESC""", p)
    modes = await _rows(f"""SELECT COALESCE(display_mode, 'unknown') AS k, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {where} GROUP BY k ORDER BY 2 DESC""", p)

    # Engagement & retention (per-user active days over all history).
    active = await _rows(f"""SELECT uid, SUBSTR(timestamp,1,10) FROM analytics
        WHERE {VIEWS} AND uid != '' GROUP BY uid, SUBSTR(timestamp,1,10)""")
    retention = _retention(active, start, today)
    views_per_user = round(total_views / total_users, 1) if total_users else 0

    return {
        'range': range_key, 'start': s0, 'end': today.isoformat(), 'days': ndays,
        'totals': {'views': total_views, 'users': total_users, 'views_per_user': views_per_user,
                   'avg_daily_views': round(total_views / ndays, 1) if ndays else 0,
                   'avg_dau': round(sum(x['users'] for x in series) / ndays, 1) if ndays else 0,
                   'new_users': sum(x['new_users'] for x in series)},
        'daily': series,
        'hours_avg': [round(h / ndays, 2) for h in hours],
        'hours_total': hours,
        'quarter_hours_avg': [round(q / ndays, 2) for q in quarter],
        'heatmap': heat, 'weekdays': WEEKDAYS, 'weekday_avg': weekday_avg,
        'slots': slots,
        'peaks': {
            'hour': peak_hour, 'quarter': f'{peak_quarter // 4:02d}:{peak_quarter % 4 * 15:02d}' if peak_quarter is not None else None,
            'weekday': WEEKDAYS[peak_weekday] if peak_weekday is not None else None,
            'best_day': best_day and {'date': best_day['date'], 'views': best_day['views']},
            'best_dau': best_dau and {'date': best_dau['date'], 'users': best_dau['users']},
        },
        'groups': groups, 'specialties': specialties, 'courses': courses,
        'platforms': [{'name': k, 'views': v, 'users': u} for k, v, u in platforms],
        'browsers': [{'name': k, 'views': v, 'users': u} for k, v, u in browsers],
        'display_modes': [{'name': k, 'views': v, 'users': u} for k, v, u in modes],
        'retention': retention,
    }


def _slot_for(minute):
    if minute < _minutes(LESSON_SLOTS[0][1]):
        return 'before'
    for number, begin, end in LESSON_SLOTS:
        if _minutes(begin) <= minute < _minutes(end):
            return f'lesson{number}'
    if minute >= _minutes(LESSON_SLOTS[-1][2]):
        return 'after'
    return 'break'


def _slot_breakdown(counter):
    total = sum(counter.values()) or 1
    items = [('before', 'До 1-ї пари')] + [(f'lesson{n}', f'{n} пара') for n, _, _ in LESSON_SLOTS] + [
        ('break', 'Перерви'), ('after', 'Після пар')]
    lessons = sum(v for k, v in counter.items() if k.startswith('lesson'))
    return {
        'items': [{'key': k, 'label': label, 'views': counter.get(k, 0), 'percent': round(counter.get(k, 0) / total * 100, 1)}
                  for k, label in items],
        'summary': {'lessons': lessons, 'breaks': counter.get('break', 0),
                    'outside': counter.get('before', 0) + counter.get('after', 0)},
        'bells': [{'lesson': n, 'start': b, 'end': e} for n, b, e in LESSON_SLOTS],
    }


def _retention(active_rows, start, today):
    days_by_user = defaultdict(set)
    for uid, day in active_rows:
        days_by_user[uid].add(date.fromisoformat(day))
    d1_base = d1_hit = d7_base = d7_hit = 0
    active_in_range = returning = 0
    active_days_total = 0
    freq = Counter()
    for days in days_by_user.values():
        first = min(days)
        in_range = [d for d in days if start <= d <= today]
        if in_range:
            active_in_range += 1
            active_days_total += len(in_range)
            freq[min(len(in_range), 7)] += 1
            if len(in_range) >= 2:
                returning += 1
        if start <= first <= today - timedelta(days=1):
            d1_base += 1
            d1_hit += (first + timedelta(days=1)) in days
        if start <= first <= today - timedelta(days=7):
            d7_base += 1
            d7_hit += any(first < d <= first + timedelta(days=7) for d in days)
    return {
        'd1_pct': _pct(d1_hit, d1_base), 'd1_base': d1_base,
        'd7_pct': _pct(d7_hit, d7_base), 'd7_base': d7_base,
        'returning_pct': _pct(returning, active_in_range),
        'avg_active_days': round(active_days_total / active_in_range, 1) if active_in_range else 0,
        'frequency': [{'days': k if k < 7 else '7+', 'users': freq.get(k, 0)} for k in range(1, 8)],
    }


async def export_daily_rows():
    rows = await _rows(f"""SELECT SUBSTR(timestamp,1,10), COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {VIEWS} GROUP BY 1 ORDER BY 1""")
    return [('date', 'views', 'unique_users')] + [tuple(r) for r in rows]


async def export_group_rows():
    rows = await _rows(f"""SELECT group_name, COUNT(*), COUNT(DISTINCT NULLIF(uid,''))
        FROM analytics WHERE {VIEWS} AND group_name != '' GROUP BY 1 ORDER BY 2 DESC""")
    return [('group', 'views', 'unique_users')] + [tuple(r) for r in rows]
