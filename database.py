"""Short read connections + one batched analytics writer; WAL permits concurrent reads."""
from contextlib import asynccontextmanager
from pathlib import Path
import aiosqlite
from config import DB_PATH


@asynccontextmanager
async def connect():
    async with aiosqlite.connect(DB_PATH, timeout=10) as db:
        await db.execute('PRAGMA busy_timeout=10000')
        await db.execute('PRAGMA synchronous=NORMAL')
        yield db


async def init_database():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with connect() as db:
        await db.execute('PRAGMA journal_mode=WAL')
        await db.commit()
