"""Schedule parsing, persistent last-good snapshot and single-flight refresh."""
import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, date
from typing import Dict, Any, Optional

from config import DB_PATH, KYIV, REFRESH_SECONDS, RETRY_SECONDS
from database import connect

logger = logging.getLogger(__name__)
URL = "https://kep.nung.edu.ua/pages/education/schedule"


def normalize_group(value):
    return re.sub(r"[\s\-\N{EN DASH}-]", "", str(value)).casefold()


def split_groups(value):
    return [g.strip() for g in re.split(r"[/,|]", str(value)) if g.strip()]


def fetch_schedule_sync():
    # Lazy imports keep cache handling independent from the upstream parser.
    import cloudscraper
    import chompjs
    with cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "windows", "desktop": True}) as scraper:
        response = scraper.get(URL, timeout=(5, 20))
        response.raise_for_status()
        match = re.search(r"normalizeScheduleGroups\s*\(\s*\{", response.text)
        if not match:
            raise ValueError("Schedule data not found in source")
        data = chompjs.parse_js_object(response.text[match.end() - 1:])
        validate_snapshot(data)
        return data


DAYS = ('понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота')


def day_key(value: str) -> str:
    return value.strip().lower().replace('’', "'").replace('ʼ', "'")


def parse_condition(value: str) -> tuple[frozenset[int], Optional[date]]:
    """The date is metadata, never part of the cycle-week list."""
    if not isinstance(value, str):
        raise ValueError('Week condition must be text')
    text = value.lower().strip().replace('–', '-').replace('—', '-').replace('−', '-')
    start = None
    match = re.search(r'\s*\(\s*(?:з|від)\s+(\d{2}\.\d{2}\.\d{4})\s*\)\s*$', text)
    if match:
        start = datetime.strptime(match[1], '%d.%m.%Y').date()
        text = text[:match.start()].strip()
    if text in ('', 'всі', 'усі', 'всі тижні', 'усі тижні', 'щотижня'):
        return frozenset((1, 2, 3, 4)), start
    text = re.sub(r'\s+(?:та|і)\s+', ',', text)
    text = re.sub(r'[/\\;.]+', ',', text)
    if not re.fullmatch(r'[1-4]\s*(?:-\s*[1-4])?(?:\s*,\s*[1-4]\s*(?:-\s*[1-4])?)*', text):
        raise ValueError('Unrecognized week condition')
    weeks = set()
    for part in text.split(','):
        bounds = [int(n.strip()) for n in part.split('-')]
        if len(bounds) == 2:
            if bounds[0] > bounds[1]:
                raise ValueError('Reversed week range')
            weeks.update(range(bounds[0], bounds[1] + 1))
        else:
            weeks.add(bounds[0])
    return frozenset(weeks), start


def snapshot_counts(data: dict) -> dict:
    return {'groups': len(data), 'lessons': sum(len(ls) for days in data.values() for ls in days.values())}


def validate_snapshot(data: dict) -> None:
    if not isinstance(data, dict) or not data:
        raise ValueError('Empty or invalid snapshot')
    for group, days in data.items():
        if not isinstance(group, str) or not group.strip() or not isinstance(days, dict) or not days:
            raise ValueError('Invalid group or days')
        normalized_days = set()
        for day, lessons in days.items():
            if not isinstance(day, str) or day_key(day) not in DAYS or day_key(day) in normalized_days:
                raise ValueError('Invalid or duplicate day')
            normalized_days.add(day_key(day))
            if not isinstance(lessons, list):
                raise ValueError('Invalid lesson list')
            for lesson in lessons:
                if not isinstance(lesson, dict):
                    raise ValueError('Invalid lesson')
                number = lesson.get('number')
                if isinstance(number, bool) or str(number) not in tuple(map(str, range(1, 9))):
                    raise ValueError('Invalid lesson number')
                for field in ('subject', 'teacher', 'cabinet'):
                    if not isinstance(lesson.get(field), str):
                        raise ValueError('Missing lesson field')
                if not lesson['subject'].strip():
                    raise ValueError('Empty subject')
                for field in ('subgroup', 'condition'):
                    if field in lesson and not isinstance(lesson[field], str):
                        raise ValueError('Invalid lesson context')
                parse_condition(lesson.get('week', lesson.get('weeks', '')))
                if 'week' in lesson and 'weeks' in lesson and lesson['week'] != lesson['weeks']:
                    raise ValueError('Conflicting week conditions')


def valid_snapshot(data):
    try:
        validate_snapshot(data)
        return True
    except (ValueError, TypeError):
        return False


class ScheduleService:
    def __init__(self):
        self.raw = {}
        self.groups = []
        self.updated_at = 0.0
        self.last_attempt = 0.0
        self.last_error = False
        self.lock = asyncio.Lock()
        self.task = None
        self._built = {}
        # Diagnostics for the admin panel (never exposed publicly).
        self.last_attempt_wall = 0.0
        self.last_error_type = None
        self.last_error_reason = None
        self.last_duration_ms = None
        self.refresh_ok = 0
        self.refresh_failed = 0
        self.counts = {}
        self.previous_counts = {}

    def install(self, data, updated_at):
        validate_snapshot(data)
        self.previous_counts = self.counts
        self.counts = snapshot_counts(data)
        if self.previous_counts and any(self.counts[k] < self.previous_counts[k] for k in self.counts):
            logger.warning('Schedule size decreased: %s -> %s; inspect semester/source changes', self.previous_counts, self.counts)
        self.raw = data
        self.groups = sorted({g for key in data for g in split_groups(key)})
        self.updated_at = updated_at
        self._built.clear()

    async def load(self):
        async with connect() as db:
            await db.execute("CREATE TABLE IF NOT EXISTS schedule_snapshot (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL, updated_at REAL NOT NULL)")
            await db.commit()
            rows = await db.execute_fetchall("SELECT data, updated_at FROM schedule_snapshot WHERE id=1")
        if rows:
            try:
                data = json.loads(rows[0][0])
                if valid_snapshot(data):
                    self.install(data, rows[0][1])
            except (ValueError, TypeError):
                logger.warning("Invalid saved snapshot, will refresh")

    async def refresh(self):
        async with self.lock:
            # Also suppress sequential retries from a cold-cache request burst.
            if self.last_attempt and time.monotonic() - self.last_attempt < RETRY_SECONDS:
                return False
            self.last_attempt = time.monotonic()
            self.last_attempt_wall = time.time()
            started = time.monotonic()
            try:
                data = await asyncio.to_thread(fetch_schedule_sync)
                validate_snapshot(data)
                updated_at = time.time()
                async with connect() as db:
                    await db.execute("INSERT OR REPLACE INTO schedule_snapshot VALUES (1, ?, ?)", (json.dumps(data, ensure_ascii=False), updated_at))
                    await db.commit()
                self.install(data, updated_at)
                self.last_error = False
                self.last_error_type = None
                self.last_error_reason = None
                self.refresh_ok += 1
                self.last_duration_ms = round((time.monotonic() - started) * 1000)
                logger.info("Refreshed schedule: %s groups", len(self.groups))
                return True
            except Exception as exc:
                self.last_error = True
                self.last_error_type = type(exc).__name__
                self.last_error_reason = str(exc)[:160] if isinstance(exc, ValueError) else None
                self.refresh_failed += 1
                self.last_duration_ms = round((time.monotonic() - started) * 1000)
                logger.warning("Schedule refresh failed (%s); retaining cached data", type(exc).__name__)
                return False

    async def run(self):
        while True:
            await self.refresh()
            await asyncio.sleep(RETRY_SECONDS if self.last_error else REFRESH_SECONDS)

    def metadata(self):
        return {"updated_at": datetime.fromtimestamp(self.updated_at, KYIV).isoformat() if self.updated_at else None,
                "stale": bool(self.raw) and (self.last_error or time.time() - self.updated_at > REFRESH_SECONDS * 2)}

    def diagnostics(self):
        now = time.time()
        next_in = None
        if self.last_attempt:
            wait = RETRY_SECONDS if self.last_error else REFRESH_SECONDS
            next_in = max(0, round(wait - (time.monotonic() - self.last_attempt)))
        return {
            **self.metadata(),
            "ready": bool(self.raw),
            "counts": self.counts,
            "previous_counts": self.previous_counts,
            "groups": len(self.groups),
            "age_seconds": round(now - self.updated_at) if self.updated_at else None,
            "last_attempt": datetime.fromtimestamp(self.last_attempt_wall, KYIV).isoformat() if self.last_attempt_wall else None,
            "last_error": self.last_error,
            "last_error_type": self.last_error_type,
            "last_error_reason": self.last_error_reason,
            "last_duration_ms": self.last_duration_ms,
            "refresh_ok": self.refresh_ok,
            "refresh_failed": self.refresh_failed,
            "refresh_interval": REFRESH_SECONDS,
            "retry_interval": RETRY_SECONDS,
            "next_refresh_in": next_in,
            "retry_blocked_for": max(0, round(RETRY_SECONDS - (time.monotonic() - self.last_attempt))) if self.last_attempt else 0,
        }

    def build(self, group, duration1, duration2, week=None, monday=None, ignore_start=False):
        key = (normalize_group(group), duration1, duration2, week, monday, ignore_start, datetime.now(KYIV).date())
        if key not in self._built:
            result = build_group_schedule(self.raw, group, duration1, duration2, week=week, monday=monday, ignore_start=ignore_start)
            if result is None:
                return None
            if len(self._built) >= 1024:
                self._built.clear()
            self._built[key] = result
        return self._built[key]


MIN_CALENDAR_DATE = date(2000, 1, 1)
MAX_CALENDAR_DATE = date(2099, 12, 31)


def get_academic_week(target_date: date) -> int:
    base_monday = date(2026, 8, 31)
    delta_days = (target_date - base_monday).days
    if delta_days < 0: return 1
    return (delta_days // 7 % 4) + 1

def is_lesson_active(weeks_str: str, current_week: int, lesson_date: Optional[date] = None) -> bool:
    weeks, start = parse_condition(weeks_str)
    if start and lesson_date is None:
        raise ValueError('A dated condition needs a concrete lesson date')
    return current_week in weeks and (start is None or lesson_date >= start)


def subgroup_for(lesson: dict) -> Optional[dict]:
    explicit = lesson.get('subgroup')
    subject = lesson['subject']
    match = re.search(r'\(\s*(\d+)\s*(підгрупа|група)\s*\)', subject, re.I)
    if explicit:
        return {'context': subject.strip(), 'value': explicit, 'label': explicit}
    if not match:
        return None
    # A selection belongs to this subject and marker kind, never all subjects.
    context = (subject[:match.start()] + subject[match.end():]).strip() + '|' + match[2].lower()
    return {'context': context, 'value': match[1], 'label': f'{match[1]} {match[2]}'}


def build_group_schedule(raw_schedule_data: dict, group_name: str, duration1: int, duration2: int,
                         week: Optional[int] = None, monday: Optional[date] = None,
                         ignore_start: bool = False, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """Build schedule for a single group from the in-memory raw data. No network calls."""
    if week is not None and (type(week) is not int or week not in (1, 2, 3, 4)):
        raise ValueError("Week must be an integer from 1 to 4")
    if monday is not None and not MIN_CALENDAR_DATE <= monday <= MAX_CALENDAR_DATE:
        raise ValueError('Calendar dates must be between 2000 and 2099')
    if not raw_schedule_data:
        return None

    group_schedule = None
    search_group = normalize_group(group_name)
    for key, value in raw_schedule_data.items():
        if search_group in [normalize_group(g) for g in split_groups(key)]:
            group_schedule = value
            break
    if group_schedule is None:
        return None

    normalized_schedule = {day_key(k): v for k, v in group_schedule.items()}
    now = now or datetime.now(KYIV)
    base_monday = monday or (now.date() - timedelta(days=now.weekday()))
    days_to_check = {day: base_monday + timedelta(days=i) for i, day in enumerate(DAYS)}

    shift1_80 = {"1": "08:00 - 09:20", "2": "09:30 - 10:50", "3": "11:10 - 12:30", "4": "12:40 - 14:00"}
    shift1_60 = {"1": "08:00 - 09:00", "2": "09:10 - 10:10", "3": "10:30 - 11:30", "4": "11:40 - 12:40"}
    shift2_80 = {"5": "14:10 - 15:30", "6": "15:40 - 17:00", "7": "17:10 - 18:30", "8": "18:40 - 20:00"}
    shift2_60 = {"5": "14:10 - 15:10", "6": "15:20 - 16:20", "7": "16:30 - 17:30", "8": "17:40 - 18:40"}

    time_mapping = {}
    time_mapping.update(shift1_80 if int(duration1) == 80 else shift1_60)
    time_mapping.update(shift2_80 if int(duration2) == 80 else shift2_60)

    full_week_schedule = {}
    for day_name, day_date in days_to_check.items():
        week_num = week if week is not None else get_academic_week(day_date)
        formatted_day = []

        seen = set()
        for lesson in normalized_schedule.get(day_name, []):
            identity = json.dumps(lesson, sort_keys=True, ensure_ascii=False)
            if identity in seen:
                continue
            seen.add(identity)
            week_val = lesson.get("week", lesson.get("weeks", ""))

            weeks, starts_on = parse_condition(week_val)
            if week_num not in weeks or (not ignore_start and starts_on and day_date < starts_on):
                continue

            num = str(lesson.get("number"))
            formatted_day.append({
                "lesson": int(num) if num.isdigit() else 0,
                "time": time_mapping.get(num, "00:00 - 00:00"),
                "subject": lesson.get("subject", ""),
                "teacher": lesson.get("teacher", ""),
                "room": lesson.get("cabinet", ""),
                "condition": week_val,
                "starts_on": starts_on.isoformat() if starts_on else None,
                "subgroup": subgroup_for(lesson)
            })

        formatted_day.sort(key=lambda x: x["lesson"])
        full_week_schedule[day_name] = formatted_day

    return full_week_schedule



def calendar_metadata(now: datetime, data: dict) -> dict:
    monday = now.date() - timedelta(days=now.weekday())
    saturday = data.get('субота', [])
    end = max((l['time'].split(' - ')[1] for l in saturday), default='00:00')
    upcoming = now.weekday() == 6 or (now.weekday() == 5 and now.strftime('%H:%M') >= end)
    return {'today': now.date().isoformat(), 'current_monday': monday.isoformat(),
            'default_monday': (monday + timedelta(days=7 if upcoming else 0)).isoformat(),
            'current_cycle': get_academic_week(monday)}
