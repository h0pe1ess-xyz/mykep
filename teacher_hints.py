"""Shared teacher directory. Never fetch upstream per visitor; keep last good data."""
import asyncio
import json
import logging
import time

from config import BASE_DIR
from database import connect

URL = 'https://kep.nung.edu.ua/api/exam-hints'
logger = logging.getLogger(__name__)


def validate_teachers(payload):
    if not isinstance(payload, dict):
        raise ValueError('Invalid teacher directory')
    raw = payload.get('teachers')
    if not isinstance(raw, dict) or not raw or len(raw) > 5000:
        raise ValueError('Invalid teacher mapping')
    if not all(isinstance(k, str) and 0 < len(k) <= 200 and
               isinstance(v, str) and 0 < len(v.strip()) <= 300
               for k, v in raw.items()):
        raise ValueError('Invalid teacher entry')
    return {k: v.strip() for k, v in raw.items()}


def fetch_teachers_sync():
    import cloudscraper
    with cloudscraper.create_scraper() as client:
        response = client.get(URL, timeout=(5, 15))
        response.raise_for_status()
        if len(response.content) > 2_000_000:
            raise ValueError('Teacher response too large')
        return validate_teachers(response.json())


class TeacherHintsService:
    def __init__(self):
        self.teachers = {}
        self.updated_at = 0
        self.lock = asyncio.Lock()
        self.last_attempt = None

    async def load(self):
        # A release snapshot also works on a fresh VPS with upstream unavailable.
        try:
            payload = json.loads((BASE_DIR / 'static/data/teacher-hints.json').read_text(encoding='utf-8'))
            self.teachers = validate_teachers(payload)
            self.updated_at = float(payload.get('updated_at', 0))
        except (OSError, ValueError, TypeError):
            logger.warning('Bundled teacher directory unavailable')
        async with connect() as db:
            await db.execute('CREATE TABLE IF NOT EXISTS teacher_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, updated_at REAL NOT NULL)')
            await db.commit()
            rows = await db.execute_fetchall('SELECT data, updated_at FROM teacher_snapshot WHERE id=1')
        if rows and rows[0][1] >= self.updated_at:
            try:
                self.teachers = validate_teachers({'teachers': json.loads(rows[0][0])})
                self.updated_at = rows[0][1]
            except (ValueError, TypeError):
                logger.warning('Invalid saved teacher directory')

    async def refresh(self):
        async with self.lock:
            now = time.monotonic()
            if self.last_attempt is not None and now - self.last_attempt < 300:
                return False
            self.last_attempt = now
            try:
                teachers = await asyncio.to_thread(fetch_teachers_sync)
                updated_at = time.time()
                async with connect() as db:
                    await db.execute('INSERT OR REPLACE INTO teacher_snapshot VALUES (1, ?, ?)',
                                     (json.dumps(teachers, ensure_ascii=False), updated_at))
                    await db.commit()
                self.teachers, self.updated_at = teachers, updated_at
                return True
            except Exception:
                logger.warning('Teacher refresh failed; keeping last good directory')
                return False

    async def run(self):
        while True:
            ok = await self.refresh()
            await asyncio.sleep(3600 if ok else 300)
