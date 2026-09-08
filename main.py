import asyncio
import aiosqlite
import json
import re
import cloudscraper
import chompjs
import traceback
import logging
from datetime import datetime, timedelta, date
from typing import Dict, Any, Optional

from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()
DB_PATH = "schedule.db"
STATS_PATH = "stats.txt"
URL = "https://kep.nung.edu.ua/pages/education/schedule"

stats_data: Dict[str, Any] = {
    "total_requests": 0,
    "unique_users": set(),
    "groups": {}
}

cached_groups_list = []
last_groups_fetch = 0

async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS schedule (
                id INTEGER PRIMARY KEY,
                group_name TEXT,
                date TEXT,
                data TEXT
            )
        ''')
        await db.commit()

def save_stats_to_file() -> None:
    try:
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            f.write("=== MyKep API Statistics ===\n")
            f.write(f"Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("------------------------\n")
            f.write(f"Unique Users: {len(stats_data['unique_users'])}\n")
            f.write(f"Total API Requests: {stats_data['total_requests']}\n")
            f.write("------------------------\n")
            f.write("Group Popularity:\n")
            sorted_groups = sorted(stats_data["groups"].items(), key=lambda x: x[1], reverse=True)
            for grp, count in sorted_groups:
                f.write(f"  - {grp}: {count} requests\n")
    except Exception as e:
        logger.warning(f"Failed to write stats file: {e}")

def track_usage(uid: Optional[str], group: str) -> None:
    stats_data["total_requests"] += 1
    if uid:
        stats_data["unique_users"].add(uid)
    if group:
        stats_data["groups"][group] = stats_data["groups"].get(group, 0) + 1
    save_stats_to_file()

def fetch_schedule_sync() -> Dict[str, Any]:
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
    response = scraper.get(URL, timeout=15)
    response.raise_for_status() 
    match = re.search(r'normalizeScheduleGroups\s*\(\s*\{', response.text)
    if match:
        return chompjs.parse_js_object(response.text[match.end() - 1:])
    raise ValueError("Failed to locate schedule data in page source.")

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

async def update_schedule_cache(group_name: str, duration1: int, duration2: int, cache_key: str) -> Optional[Dict[str, Any]]:
    raw_data = await asyncio.to_thread(fetch_schedule_sync)
    if not raw_data: return None
        
    group_schedule = {}
    search_group = group_name.lower().replace("-", "").strip()
    
    for key, value in raw_data.items():
        if search_group in str(key).lower().replace("-", "").strip():
            group_schedule = value
            break

    if not group_schedule: return {}
    
    normalized_schedule = {str(k).lower().strip(): v for k, v in group_schedule.items()}

    now = datetime.now()
    current_weekday = now.weekday()
    reference_date = now
    
    if current_weekday == 6:
        reference_date = now + timedelta(days=1)
    elif current_weekday == 5 and now.hour > 15:
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

    # 1st shift: 1-4 lessons
    shift1_80 = {
        "1": "08:00 - 09:20", "2": "09:30 - 10:50", "3": "11:10 - 12:30", "4": "12:40 - 14:00"
    }
    shift1_60 = {
        "1": "08:00 - 09:00", "2": "09:10 - 10:10", "3": "10:30 - 11:30", "4": "11:40 - 12:40"
    }
    
    # 2nd shift: 5-8 lessons
    shift2_80 = {
        "5": "14:10 - 15:30", "6": "15:40 - 17:00", "7": "17:10 - 18:30", "8": "18:40 - 20:00"
    }
    shift2_60 = {
        "5": "14:10 - 15:10", "6": "15:20 - 16:20", "7": "16:30 - 17:30", "8": "17:40 - 18:40"
    }
    
    time_mapping = {}
    time_mapping.update(shift1_80 if int(duration1) == 80 else shift1_60)
    time_mapping.update(shift2_80 if int(duration2) == 80 else shift2_60)

    full_week_schedule = {}
    for day_name, day_date in days_to_check.items():
        week_num = get_academic_week(day_date.date())
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

    today_str = now.strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM schedule WHERE group_name = ? AND date = ?", (cache_key, today_str))
        await db.execute("INSERT INTO schedule (group_name, date, data) VALUES (?, ?, ?)", 
                         (cache_key, today_str, json.dumps(full_week_schedule, ensure_ascii=False)))
        await db.commit()
        
    return full_week_schedule

@app.on_event("startup")
async def startup_event() -> None:
    await init_db()
    logger.info("Database initialized.")

@app.get("/api/schedule")
async def get_schedule(
    background_tasks: BackgroundTasks, 
    group: str = Query("ПІ-24-02"), 
    duration1: int = Query(80),
    duration2: int = Query(60),
    uid: Optional[str] = Query(None)
) -> JSONResponse:
    background_tasks.add_task(track_usage, uid, group)

    today = datetime.now().strftime("%Y-%m-%d")
    cache_key = f"{group}_{duration1}_{duration2}" 
    
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT data FROM schedule WHERE group_name = ? AND date = ?", (cache_key, today)) as cursor:
            row = await cursor.fetchone()
            if row:
                return JSONResponse({"status": "success", "data": json.loads(row[0])})
    
    try:
        data = await update_schedule_cache(group, duration1, duration2, cache_key)
        if data is not None:
            return JSONResponse({"status": "success", "data": data})
        return JSONResponse(
            {"status": "error", "message": "Schedule not found or empty"}, 
            status_code=404
        )
    except Exception as e:
        logger.error(f"Error parsing schedule: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500, 
            content={"status": "error", "message": str(e)}
        )

@app.get("/api/groups")
async def get_groups() -> JSONResponse:
    global cached_groups_list, last_groups_fetch
    import time
    now = time.time()
    
    if not cached_groups_list or (now - last_groups_fetch > 3600):
        try:
            raw_data = await asyncio.to_thread(fetch_schedule_sync)
            if raw_data:
                cached_groups_list = sorted([str(k).strip() for k in raw_data.keys() if str(k).strip()])
                last_groups_fetch = now
        except Exception as e:
            logger.error(f"Failed to fetch groups: {e}")
            if not cached_groups_list:
                return JSONResponse(status_code=500, content={"status": "error", "message": "Could not fetch groups"})
    
    return JSONResponse({"status": "success", "data": cached_groups_list})

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
