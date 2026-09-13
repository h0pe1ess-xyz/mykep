import sqlite3, json

db = sqlite3.connect('schedule.db')
rows = db.execute('SELECT group_name, date, data FROM schedule ORDER BY date DESC').fetchall()

with open('debug_cache.txt', 'w', encoding='utf-8') as f:
    f.write(f"Total rows: {len(rows)}\n\n")
    for r in rows:
        try:
            d = json.loads(r[2])
            days_info = {k: len(v) for k, v in d.items()}
        except:
            days_info = "PARSE ERROR"
        f.write(f"{r[0]} | {r[1]} | {days_info}\n")

db.close()
print("Done")
