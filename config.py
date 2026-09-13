"""Shared settings. Existing deployments keep schedule.db in the project root."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / '.env')
DB_PATH = str(Path(os.getenv('MYKEP_DB_PATH', str(BASE_DIR / 'schedule.db'))).expanduser().resolve())
KYIV = ZoneInfo('Europe/Kyiv')
REFRESH_SECONDS = max(60, int(os.getenv('SCHEDULE_REFRESH_SECONDS', '1800')))
RETRY_SECONDS = max(5, int(os.getenv('SCHEDULE_RETRY_SECONDS', '30')))
BOT_MODE = os.getenv('BOT_MODE', 'embedded').lower()
