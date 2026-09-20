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
    return re.sub(r"[\s\-–-]", "", str(value)).casefold()


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
        if not valid_snapshot(data):
            raise ValueError("Invalid schedule data; keeping last good snapshot")
        return data


def valid_snapshot(data):
    return (isinstance(data, dict) and bool(data) and
            all(isinstance(days, dict) and all(isinstance(lessons, list) and
                all(isinstance(lesson, dict) for lesson in lessons)
                for lessons in days.values()) for days in data.values()))


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

    def install(self, data, updated_at):
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
            try:
                data = await asyncio.to_thread(fetch_schedule_sync)
                if not valid_snapshot(data):
                    raise ValueError("Invalid snapshot")
                updated_at = time.time()
                async with connect() as db:
                    await db.execute("INSERT OR REPLACE INTO schedule_snapshot VALUES (1, ?, ?)", (json.dumps(data, ensure_ascii=False), updated_at))
                    await db.commit()
                self.install(data, updated_at)
                self.last_error = False
                logger.info("Refreshed schedule: %s groups", len(self.groups))
                return True
            except Exception as exc:
                self.last_error = True
                logger.warning("Schedule refresh failed (%s); retaining cached data", type(exc).__name__)
                return False

    async def run(self):
        while True:
            await self.refresh()
            await asyncio.sleep(RETRY_SECONDS if self.last_error else REFRESH_SECONDS)

    def metadata(self):
        return {"updated_at": datetime.fromtimestamp(self.updated_at, KYIV).isoformat() if self.updated_at else None,
                "stale": bool(self.raw) and (self.last_error or time.time() - self.updated_at > REFRESH_SECONDS * 2)}

    def build(self, group, duration1, duration2, week=None):
        # Minute bucket handles the Saturday rollover; bound memory explicitly.
        key = (normalize_group(group), duration1, duration2, week, int(time.time() // 60))
        if key not in self._built:
            result = build_group_schedule(self.raw, group, duration1, duration2, week=week)
            if result is None:
                return None
            if len(self._built) >= 1024:
                self._built.clear()
            self._built[key] = result
        return self._built[key]


def get_academic_week(target_date: date) -> int:
    base_monday = date(2026, 8, 31)
    delta_days = (target_date - base_monday).days
    if delta_days < 0: return 1
    return (delta_days // 7 % 4) + 1

def is_lesson_active(weeks_str: str, current_week: int) -> bool:
    try:
        if not weeks_str: return True
        w_str = str(weeks_str).lower().strip()
        
        if not w_str or "всі" in w_str or "усі" in w_str or "1-4" in w_str or "щотижня" in w_str: 
            return True
        
        w_str = w_str.replace("/", ",").replace("\\", ",").replace(".", ",").replace(";", ",")
        w_str = w_str.replace(" та ", ",").replace(" і ", ",")
        
        clean_str = re.sub(r'[^0-9,\-]', '', w_str)
        if not clean_str: return True

        for part in [p.strip() for p in clean_str.split(",") if p.strip()]:
            if "-" in part:
                s, e = map(int, part.split("-"))
                if s <= current_week <= e: return True
            else:
                if int(part) == current_week: return True
        return False
    except Exception as e:
        logger.warning(f"Error filtering active week '{weeks_str}': {e}. Defaulting to True.")
        return True 

def build_group_schedule(raw_schedule_data: dict, group_name: str, duration1: int, duration2: int,
                         week: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Build schedule for a single group from the in-memory raw data. No network calls."""
    if week is not None and (type(week) is not int or week not in (1, 2, 3, 4)):
        raise ValueError("Week must be an integer from 1 to 4")
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

    normalized_schedule = {str(k).lower().strip(): v for k, v in group_schedule.items()}

    now = datetime.now(KYIV)
    current_weekday = now.weekday()
    reference_date = now
    
    if current_weekday == 6:
        reference_date = now + timedelta(days=1)
    elif current_weekday == 5 and now.hour >= 15:
        reference_date = now + timedelta(days=2)

    base_monday = reference_date - timedelta(days=reference_date.weekday())
    days_to_check = {
        "понеділок": base_monday,
        "вівторок": base_monday + timedelta(days=1),
        "середа": base_monday + timedelta(days=2),
        "четвер": base_monday + timedelta(days=3),
        "п'ятниця": base_monday + timedelta(days=4),
        "субота": base_monday + timedelta(days=5)
    }

    shift1_80 = {"1": "08:00 - 09:20", "2": "09:30 - 10:50", "3": "11:10 - 12:30", "4": "12:40 - 14:00"}
    shift1_60 = {"1": "08:00 - 09:00", "2": "09:10 - 10:10", "3": "10:30 - 11:30", "4": "11:40 - 12:40"}
    shift2_80 = {"5": "14:10 - 15:30", "6": "15:40 - 17:00", "7": "17:10 - 18:30", "8": "18:40 - 20:00"}
    shift2_60 = {"5": "14:10 - 15:10", "6": "15:20 - 16:20", "7": "16:30 - 17:30", "8": "17:40 - 18:40"}
    
    time_mapping = {}
    time_mapping.update(shift1_80 if int(duration1) == 80 else shift1_60)
    time_mapping.update(shift2_80 if int(duration2) == 80 else shift2_60)

    full_week_schedule = {}
    for day_name, day_date in days_to_check.items():
        week_num = week if week is not None else get_academic_week(day_date.date())
        formatted_day = []
        
        for lesson in normalized_schedule.get(day_name, []):
            week_val = lesson.get("week", lesson.get("weeks", ""))
            
            if not is_lesson_active(week_val, week_num): 
                continue
                
            num = str(lesson.get("number"))
            formatted_day.append({
                "lesson": int(num) if num.isdigit() else 0,
                "time": time_mapping.get(num, "00:00 - 00:00"),
                "subject": lesson.get("subject", ""),
                "teacher": lesson.get("teacher", ""),
                "room": lesson.get("cabinet", "")
            })
            
        formatted_day.sort(key=lambda x: x["lesson"])
        full_week_schedule[day_name] = formatted_day

    return full_week_schedule

