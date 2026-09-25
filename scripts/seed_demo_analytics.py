"""Create a DEMO database with realistic fake schedule views for local testing
of the admin panel. It never touches the real schedule.db.

    python scripts/seed_demo_analytics.py demo.db --days 21 --users 350
    MYKEP_DB_PATH=demo.db ADMIN_DEV_LOGIN=1 ADMIN_COOKIE_SECURE=0 python main.py
"""
import argparse
import random
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

GROUPS = ['ПІ-24-01', 'ПІ-24-02', 'ПІ-25-01', 'КН-23-01', 'КН-24-02', 'ЕМ-22-01', 'ЕМ-25-01', 'БД-24-01',
          'ОО-23-02', 'МТ-25-01', 'КІ-22-01', 'КІ-24-01', 'ТР-23-01', 'ПЕ-25-02', 'ЕЛ-24-01']
UAS = [
    ('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', 45),
    ('Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36', 30),
    ('Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', 6),
    ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0 Mobile/15E148 Safari/604.1', 6),
    ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36', 7),
    ('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 3),
    ('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36 Telegram-Android/11.0', 3),
]
# Relative activity by hour: peaks before 1st lesson and on breaks.
HOUR_WEIGHTS = [0, 0, 0, 0, 0, 1, 4, 18, 26, 12, 10, 12, 11, 10, 8, 7, 5, 4, 4, 4, 6, 8, 6, 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--days', type=int, default=21)
    ap.add_argument('--users', type=int, default=350)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    target = Path(args.path).resolve()
    if target.name == 'schedule.db':
        sys.exit('Refusing to write into schedule.db — use a separate demo file, e.g. demo.db')
    rnd = random.Random(args.seed)
    kyiv = ZoneInfo('Europe/Kyiv')
    now = datetime.now(kyiv).replace(tzinfo=None)
    db = sqlite3.connect(target)
    db.execute('''CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
        uid TEXT, group_name TEXT, endpoint TEXT, user_agent TEXT)''')
    users = []
    for i in range(args.users):
        users.append({'uid': f'demo-{i:05d}', 'group': rnd.choice(GROUPS),
                      'ua': rnd.choices([u for u, _ in UAS], [w for _, w in UAS])[0],
                      'start': rnd.randint(0, args.days - 1) if i > 40 else 0,
                      'activity': rnd.uniform(0.25, 0.95)})
    rows = []
    for day_offset in range(args.days, -1, -1):
        day = (now - timedelta(days=day_offset)).date()
        weekday = day.weekday()
        day_factor = 0.35 if weekday >= 5 else 1.0
        for u in users:
            if args.days - day_offset < u['start'] and day_offset != 0:
                continue
            if rnd.random() > u['activity'] * day_factor:
                continue
            for _ in range(rnd.choices([1, 2, 3, 4], [45, 30, 17, 8])[0]):
                hour = rnd.choices(range(24), HOUR_WEIGHTS)[0]
                ts = datetime(day.year, day.month, day.day, hour, rnd.randint(0, 59), rnd.randint(0, 59))
                if ts > now:
                    continue
                rows.append((ts.strftime('%Y-%m-%d %H:%M:%S'), u['uid'], u['group'], '/api/schedule', u['ua']))
    db.executemany('INSERT INTO analytics (timestamp, uid, group_name, endpoint, user_agent) VALUES (?, ?, ?, ?, ?)', sorted(rows))
    db.commit()
    db.close()
    print(f'Inserted {len(rows)} demo views into {target}')


if __name__ == '__main__':
    main()
