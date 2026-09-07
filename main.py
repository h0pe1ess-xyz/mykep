import asyncio
import aiosqlite
import json
import re
import cloudscraper
import chompjs
import traceback
from datetime import datetime, timedelta, date
from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn
import os

app = FastAPI()
DB_PATH = "schedule.db"
STATS_PATH = "stats.txt"
URL = "https://kep.nung.edu.ua/pages/education/schedule"

# ==========================================
# СТАТИСТИКА
# ==========================================
stats_data = {
    "total_requests": 0,
    "unique_users": set(),
    "groups": {}
}

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS schedule 
                            (id INTEGER PRIMARY KEY, group_name TEXT, date TEXT, data TEXT)''')
        await db.commit()

def save_stats_to_file():
    try:
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            f.write("=== СТАТИСТИКА MyKep ===\n")
            f.write(f"Оновлено: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("------------------------\n")
            f.write(f"Унікальних користувачів: {len(stats_data['unique_users'])}\n")
            f.write(f"Всього запитів до API: {stats_data['total_requests']}\n")
            f.write("------------------------\n")
            f.write("Популярність груп:\n")
            sorted_groups = sorted(stats_data["groups"].items(), key=lambda x: x[1], reverse=True)
            for grp, count in sorted_groups:
                f.write(f"  • {grp}: {count} запитів\n")
    except:
        pass

def track_usage(uid: str, group: str):
    stats_data["total_requests"] += 1
    if uid:
        stats_data["unique_users"].add(uid)
    if group:
        stats_data["groups"][group] = stats_data["groups"].get(group, 0) + 1
    save_stats_to_file()

# ==========================================
# ПАРСЕР ТА ОБРОБКА
# ==========================================
def fetch_schedule_sync():
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
    response = scraper.get(URL, timeout=15)
    response.raise_for_status() 
    match = re.search(r'normalizeScheduleGroups\s*\(\s*\{', response.text)
    if match:
        return chompjs.parse_js_object(response.text[match.end() - 1:])
    raise ValueError("Не вдалося знайти початок розкладу на сторінці.")

def get_academic_week(target_date: date) -> int:
    base_monday = date(2026, 8, 31)
    delta_days = (target_date - base_monday).days
    if delta_days < 0: return 1
    return (delta_days // 7 % 4) + 1

def is_lesson_active(weeks_str, current_week: int) -> bool:
    try:
        if not weeks_str: return True
        w_str = str(weeks_str).lower().strip()
        
        # Якщо пара йде постійно
        if not w_str or "всі" in w_str or "усі" in w_str or "1-4" in w_str or "щотижня" in w_str: 
            return True
        
        # Рятуємо будь-які розділювачі (слеші, крапки, коми, слова "та/і")
        w_str = w_str.replace("/", ",").replace("\\", ",").replace(".", ",").replace(";", ",")
        w_str = w_str.replace(" та ", ",").replace(" і ", ",")
        
        # Залишаємо виключно цифри, коми і тире
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
        print(f"Помилка фільтрації тижня '{weeks_str}': {e}")
        # Якщо сталася помилка - ми ПОВЕРТАЄМО пару, щоб вона не зникла безслідно
        return True 

async def update_schedule_cache(group_name: str, duration: int, cache_key: str):
    raw_data = await asyncio.to_thread(fetch_schedule_sync)
    if not raw_data: return None
        
    group_schedule = {}
    
    # Шукаємо групу супернадійно: без урахування регістру, пробілів і дефісів
    search_group = group_name.lower().replace("-", "").strip()
    for key, value in raw_data.items():
        if search_group in str(key).lower().replace("-", "").strip():
            group_schedule = value
            break

    if not group_schedule: return {}
    
    # Нормалізуємо дні тижня з сайту (щоб "Понеділок" і "понеділок" були однаковими)
    normalized_schedule = {str(k).lower().strip(): v for k, v in group_schedule.items()}

    now = datetime.now()
    current_weekday = now.weekday()
    reference_date = now
    
    # Визначаємо, на який тиждень ми дивимось (якщо вихідні - показуємо наступний)
    if current_weekday == 6: reference_date = now + timedelta(days=1)
    elif current_weekday == 5 and now.hour > 15: reference_date = now + timedelta(days=2)

    base_monday = reference_date - timedelta(days=reference_date.weekday())
    days_to_check = {
        "понеділок": base_monday, "вівторок": base_monday + timedelta(days=1),
        "середа": base_monday + timedelta(days=2), "четвер": base_monday + timedelta(days=3),
        "п'ятниця": base_monday + timedelta(days=4), "субота": base_monday + timedelta(days=5)
    }

    time_mapping = {
        "1": "08:00 - 09:20", "2": "09:30 - 10:50", "3": "11:10 - 12:30", "4": "12:40 - 14:00", 
        "5": "14:10 - 15:30", "6": "15:40 - 17:00", "7": "17:10 - 18:30", "8": "18:40 - 20:00"
    } if int(duration) == 80 else {
        "1": "08:00 - 09:00", "2": "09:10 - 10:10", "3": "10:30 - 11:30", "4": "11:40 - 12:40",
        "5": "13:00 - 14:00", "6": "14:10 - 15:10", "7": "15:20 - 16:20", "8": "16:30 - 17:30"
    }

    full_week_schedule = {}
    for day_name, day_date in days_to_check.items():
        week_num = get_academic_week(day_date.date())
        formatted_day = []
        
        for lesson in normalized_schedule.get(day_name, []):
            # Перевіряємо обидва варіанти ключа, якщо раптом сайт змінив "week" на "weeks"
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

# ==========================================
# API ЕНДПОІНТИ
# ==========================================
@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/api/schedule")
async def get_schedule(background_tasks: BackgroundTasks, group: str = Query("ПІ-24-02"), duration: int = Query(60), uid: str = Query(None)):
    background_tasks.add_task(track_usage, uid, group)

    today = datetime.now().strftime("%Y-%m-%d")
    cache_key = f"{group}_{duration}" 
    
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT data FROM schedule WHERE group_name = ? AND date = ?", (cache_key, today)) as cursor:
            row = await cursor.fetchone()
            if row:
                return JSONResponse({"status": "success", "data": json.loads(row[0])})
    
    try:
        data = await update_schedule_cache(group, duration, cache_key)
        if data is not None:
            return JSONResponse({"status": "success", "data": data})
        return JSONResponse({"status": "error", "message": "Розклад не знайдено або порожній"}, status_code=404)
    except Exception as e:
        print(f"\n--- ❌ ПОМИЛКА ПАРСИНГУ ---\n{traceback.format_exc()}\n---------------------------\n")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
