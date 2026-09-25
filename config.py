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
APP_VERSION = '2.7.0'

# The statistics bot is superseded by the web admin panel. It stays in the
# repository and can be re-enabled with BOT_MODE=embedded or external.
BOT_MODE = os.getenv('BOT_MODE', 'disabled').strip().lower()
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()


def _int_env(name, default, low, high):
    try:
        return max(low, min(high, int(os.getenv(name, str(default)))))
    except ValueError:
        return default


# Hard allowlist: only these Telegram accounts may ever access /admin.
# Environment variables can narrow the list (e.g. temporarily lock one
# account out) but can NEVER add new IDs, so a leaked/edited .env alone
# cannot grant admin access to a stranger.
HARD_ADMIN_IDS = frozenset({1125085502, 1320649428})


def _admin_ids():
    raw = os.getenv('ADMIN_TELEGRAM_IDS') or os.getenv('TELEGRAM_ADMIN_IDS') or ''
    ids = {int(v) for v in (x.strip() for x in raw.split(',')) if v.isdigit()}
    return frozenset(ids & HARD_ADMIN_IDS) if ids else HARD_ADMIN_IDS


ADMIN_IDS = _admin_ids()
# Secure cookies are mandatory in production (HTTPS). Only set
# ADMIN_COOKIE_SECURE=0 for local http://localhost testing.
ADMIN_COOKIE_SECURE = os.getenv('ADMIN_COOKIE_SECURE', '1').strip() != '0'
# Local-only passwordless login for testing without Telegram. Works only when
# the request comes from 127.0.0.1/::1 directly (no proxy) to localhost.
ADMIN_DEV_LOGIN = os.getenv('ADMIN_DEV_LOGIN', '0').strip() == '1'
ADMIN_SESSION_HOURS = _int_env('ADMIN_SESSION_HOURS', 168, 1, 720)     # absolute lifetime
ADMIN_IDLE_HOURS = _int_env('ADMIN_IDLE_HOURS', 72, 1, 720)            # inactivity timeout
# Optional, e.g. https://mykep.pp.ua. When set, only this Origin is accepted
# for admin POST requests; otherwise the request Host is used.
ADMIN_PUBLIC_ORIGIN = os.getenv('ADMIN_PUBLIC_ORIGIN', '').strip().rstrip('/')
COLLEGE_SIZE = _int_env('ADMIN_COLLEGE_SIZE', 1200, 1, 100000)
PUBLIC_CSP = os.getenv('PUBLIC_CSP', '1').strip() != '0'
