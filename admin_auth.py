"""Admin authentication: Telegram Login verification, server-side sessions,
one-time login codes, rate limiting and an audit log.

Security model
- Only Telegram IDs from config.ADMIN_IDS (hard allowlist) can get a session.
- Telegram data is verified with HMAC-SHA256 (key = SHA256(bot token)),
  must be fresh (<= 5 min) and each signed payload can be used only once.
- The session token is 256-bit random, stored ONLY as a SHA-256 hash in the
  DB, sent in an HttpOnly + Secure + SameSite=Strict __Host- cookie.
- Every state-changing request needs a per-session CSRF token AND a
  same-origin Origin header.
"""
import hashlib
import hmac
import logging
import re
import secrets
import time
from collections import OrderedDict, deque
from datetime import datetime, timedelta

from config import (ADMIN_COOKIE_SECURE, ADMIN_IDLE_HOURS, ADMIN_IDS,
                    ADMIN_SESSION_HOURS, KYIV, TELEGRAM_BOT_TOKEN)
from database import connect

logger = logging.getLogger(__name__)

COOKIE_NAME = '__Host-mykep_admin' if ADMIN_COOKIE_SECURE else 'mykep_admin_dev'
AUTH_MAX_AGE_SECONDS = 300
CODE_TTL_SECONDS = 180
CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # no 0/O/1/I/L
CODE_LENGTH = 8                                     # 31^8 ≈ 8.5e11 combinations
MAX_SESSIONS_PER_USER = 10
_TG_FIELD = re.compile(r'^[a-z_]{1,32}$')


def _now():
    return time.time()


def _iso(ts):
    return datetime.fromtimestamp(ts, KYIV).isoformat(timespec='seconds')


def _sha256(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def bot_id():
    head = TELEGRAM_BOT_TOKEN.split(':', 1)[0]
    return int(head) if head.isdigit() else None


# ---------------------------------------------------------------- rate limit
class RateLimiter:
    """Sliding-window limiter with a bounded number of tracked keys."""

    def __init__(self, limit, window_seconds, max_keys=20000):
        self.limit, self.window, self.max_keys = limit, window_seconds, max_keys
        self.hits = OrderedDict()

    def _prune(self, key, now):
        q = self.hits.get(key)
        if q is None:
            return None
        while q and q[0] <= now - self.window:
            q.popleft()
        return q

    def check(self, key):
        """True if the request is allowed (and counts it)."""
        now = time.monotonic()
        q = self._prune(key, now)
        if q is None:
            q = deque()
            self.hits[key] = q
            while len(self.hits) > self.max_keys:
                self.hits.popitem(last=False)
        self.hits.move_to_end(key)
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def retry_after(self, key):
        q = self.hits.get(key)
        if not q:
            return 0
        return max(1, int(self.window - (time.monotonic() - q[0])) + 1)


login_ip_limiter = RateLimiter(10, 600)          # Telegram login attempts per IP
code_ip_limiter = RateLimiter(5, 600)            # login-code guesses per IP
code_global_limiter = RateLimiter(40, 600)       # all login-code guesses (anti-botnet)
api_session_limiter = RateLimiter(240, 60)       # admin API calls per session
action_limiter = RateLimiter(10, 60)             # heavy actions per session


# ------------------------------------------------------------------- storage
async def init_admin_db():
    async with connect() as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY, sid TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
            display_name TEXT, username TEXT, csrf TEXT NOT NULL, method TEXT NOT NULL,
            created_at REAL NOT NULL, last_seen REAL NOT NULL, expires_at REAL NOT NULL,
            ip TEXT, user_agent TEXT)''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id)')
        await db.execute('''CREATE TABLE IF NOT EXISTS admin_login_codes (
            code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, display_name TEXT,
            username TEXT, created_at REAL NOT NULL, expires_at REAL NOT NULL)''')
        await db.execute('''CREATE TABLE IF NOT EXISTS admin_used_auth (
            auth_hash TEXT PRIMARY KEY, used_at REAL NOT NULL)''')
        await db.execute('''CREATE TABLE IF NOT EXISTS admin_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, event TEXT NOT NULL,
            user_id INTEGER, ip TEXT, detail TEXT)''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit(ts)')
        await db.commit()


async def cleanup():
    now = _now()
    async with connect() as db:
        await db.execute('DELETE FROM admin_sessions WHERE expires_at < ? OR last_seen < ?',
                         (now, now - ADMIN_IDLE_HOURS * 3600))
        await db.execute('DELETE FROM admin_login_codes WHERE expires_at < ?', (now,))
        await db.execute('DELETE FROM admin_used_auth WHERE used_at < ?', (now - 86400,))
        await db.execute('DELETE FROM admin_audit WHERE ts < ?', (now - 180 * 86400,))
        await db.commit()


async def audit(event, user_id=None, ip=None, detail=None):
    try:
        async with connect() as db:
            await db.execute('INSERT INTO admin_audit (ts, event, user_id, ip, detail) VALUES (?, ?, ?, ?, ?)',
                             (_now(), event[:40], user_id, (ip or '')[:64], (detail or '')[:200] or None))
            await db.commit()
    except Exception as exc:  # auditing must never break auth
        logger.warning('Audit write failed (%s)', type(exc).__name__)


async def audit_log(limit=100):
    async with connect() as db:
        rows = await db.execute_fetchall(
            'SELECT ts, event, user_id, ip, detail FROM admin_audit ORDER BY id DESC LIMIT ?',
            (max(1, min(int(limit), 500)),))
    return [{'time': _iso(r[0]), 'event': r[1], 'user_id': r[2], 'ip': r[3], 'detail': r[4]} for r in rows]


# ------------------------------------------------------------- telegram auth
def verify_telegram_payload(data, now=None):
    """Return a normalized user dict if `data` is a genuine, fresh Telegram
    Login payload; otherwise None. Pure function (no I/O) for easy testing."""
    if not TELEGRAM_BOT_TOKEN or not isinstance(data, dict) or not 3 <= len(data) <= 16:
        return None
    received_hash = data.get('hash')
    if not isinstance(received_hash, str) or not re.fullmatch(r'[0-9a-fA-F]{64}', received_hash):
        return None
    fields = {}
    for key, value in data.items():
        if key == 'hash':
            continue
        if not isinstance(key, str) or not _TG_FIELD.match(key):
            return None
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            return None
        value = str(value)
        if len(value) > 512 or '\n' in value:
            return None
        fields[key] = value
    check_string = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    secret = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode('utf-8')).digest()
    expected = hmac.new(secret, check_string.encode('utf-8'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash.lower()):
        return None
    try:
        user_id = int(fields.get('id', ''))
        auth_date = int(fields.get('auth_date', ''))
    except ValueError:
        return None
    now = _now() if now is None else now
    if auth_date > now + 60 or now - auth_date > AUTH_MAX_AGE_SECONDS:
        return None
    name = ' '.join(x for x in (fields.get('first_name', ''), fields.get('last_name', '')) if x).strip()
    return {'id': user_id, 'name': name[:64] or str(user_id), 'username': fields.get('username', '')[:64],
            'auth_hash': received_hash.lower()}


async def consume_auth_hash(auth_hash):
    """Replay protection: each signed Telegram payload works exactly once."""
    async with connect() as db:
        cur = await db.execute('INSERT OR IGNORE INTO admin_used_auth VALUES (?, ?)', (auth_hash, _now()))
        await db.commit()
        return cur.rowcount == 1


# ------------------------------------------------------------------ sessions
async def create_session(user_id, display_name, username, method, ip, user_agent):
    if user_id not in ADMIN_IDS:
        raise PermissionError('not an admin')
    token = secrets.token_urlsafe(32)
    now = _now()
    async with connect() as db:
        await db.execute('INSERT INTO admin_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (
            _sha256(token), secrets.token_urlsafe(9), user_id, (display_name or '')[:64], (username or '')[:64],
            secrets.token_urlsafe(32), method, now, now, now + ADMIN_SESSION_HOURS * 3600,
            (ip or '')[:64], (user_agent or '')[:200]))
        # Keep at most N newest sessions per admin.
        await db.execute('''DELETE FROM admin_sessions WHERE user_id = ? AND token_hash NOT IN (
            SELECT token_hash FROM admin_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)''',
                         (user_id, user_id, MAX_SESSIONS_PER_USER))
        await db.commit()
    return token


async def get_session(token):
    if not token or not isinstance(token, str) or len(token) > 128:
        return None
    now = _now()
    token_hash = _sha256(token)
    async with connect() as db:
        rows = await db.execute_fetchall(
            'SELECT sid, user_id, display_name, username, csrf, method, created_at, last_seen, expires_at '
            'FROM admin_sessions WHERE token_hash = ?', (token_hash,))
        if not rows:
            return None
        sid, user_id, name, username, csrf, method, created, last_seen, expires = rows[0]
        if expires < now or last_seen < now - ADMIN_IDLE_HOURS * 3600 or user_id not in ADMIN_IDS:
            await db.execute('DELETE FROM admin_sessions WHERE token_hash = ?', (token_hash,))
            await db.commit()
            return None
        if now - last_seen > 60:
            await db.execute('UPDATE admin_sessions SET last_seen = ? WHERE token_hash = ?', (now, token_hash))
            await db.commit()
    return {'sid': sid, 'user_id': user_id, 'name': name, 'username': username, 'csrf': csrf,
            'method': method, 'created_at': _iso(created), 'expires_at': _iso(expires), 'token_hash': token_hash}


async def delete_session(token_hash):
    async with connect() as db:
        await db.execute('DELETE FROM admin_sessions WHERE token_hash = ?', (token_hash,))
        await db.commit()


async def list_sessions(current_sid):
    async with connect() as db:
        rows = await db.execute_fetchall(
            'SELECT sid, user_id, display_name, username, method, created_at, last_seen, expires_at, ip, user_agent '
            'FROM admin_sessions ORDER BY last_seen DESC')
    return [{'sid': r[0], 'user_id': r[1], 'name': r[2], 'username': r[3], 'method': r[4],
             'created_at': _iso(r[5]), 'last_seen': _iso(r[6]), 'expires_at': _iso(r[7]),
             'ip': r[8], 'device': describe_user_agent(r[9] or ''), 'current': r[0] == current_sid} for r in rows]


async def revoke_session(sid):
    async with connect() as db:
        cur = await db.execute('DELETE FROM admin_sessions WHERE sid = ?', (str(sid)[:32],))
        await db.commit()
        return cur.rowcount


async def revoke_other_sessions(current_sid):
    async with connect() as db:
        cur = await db.execute('DELETE FROM admin_sessions WHERE sid != ?', (current_sid,))
        await db.commit()
        return cur.rowcount


def describe_user_agent(ua):
    ua_l = ua.lower()
    os_name = ('iOS' if ('iphone' in ua_l or 'ipad' in ua_l) else 'Android' if 'android' in ua_l
               else 'macOS' if 'macintosh' in ua_l else 'Windows' if 'windows' in ua_l
               else 'Linux' if 'linux' in ua_l else 'Інше')
    browser = ('Edge' if 'edg/' in ua_l else 'Firefox' if ('firefox' in ua_l or 'fxios' in ua_l)
               else 'Chrome' if ('chrome' in ua_l or 'crios' in ua_l) else 'Safari' if 'safari' in ua_l
               else 'Браузер')
    return f'{browser} · {os_name}'


# --------------------------------------------------------------- login codes
def normalize_code(value):
    return re.sub(r'[^A-Z0-9]', '', str(value or '').upper())[:32]


async def create_login_code(session):
    code = ''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    now = _now()
    async with connect() as db:
        # At most 3 live codes per admin.
        await db.execute('''DELETE FROM admin_login_codes WHERE user_id = ? AND code_hash NOT IN (
            SELECT code_hash FROM admin_login_codes WHERE user_id = ? AND expires_at > ?
            ORDER BY created_at DESC LIMIT 2)''', (session['user_id'], session['user_id'], now))
        await db.execute('INSERT INTO admin_login_codes VALUES (?, ?, ?, ?, ?, ?)', (
            _sha256(code), session['user_id'], session['name'], session['username'], now, now + CODE_TTL_SECONDS))
        await db.commit()
    return f'{code[:4]}-{code[4:]}', CODE_TTL_SECONDS


async def consume_login_code(raw_code):
    code = normalize_code(raw_code)
    if len(code) != CODE_LENGTH or any(c not in CODE_ALPHABET for c in code):
        return None
    async with connect() as db:
        rows = await db.execute_fetchall(
            'SELECT user_id, display_name, username, expires_at FROM admin_login_codes WHERE code_hash = ?',
            (_sha256(code),))
        if not rows:
            return None
        # Single use: delete before issuing a session.
        await db.execute('DELETE FROM admin_login_codes WHERE code_hash = ?', (_sha256(code),))
        await db.commit()
    user_id, name, username, expires = rows[0]
    if expires < _now() or user_id not in ADMIN_IDS:
        return None
    return {'id': user_id, 'name': name, 'username': username}


async def create_login_code_for_cli(user_id):
    """Break-glass: used by admin_cli.py from the server shell."""
    return await create_login_code({'user_id': user_id, 'name': 'CLI', 'username': ''})
