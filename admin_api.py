"""/api/admin/* endpoints. Every endpoint except /config and /auth/* requires
a valid admin session; every POST additionally requires CSRF + same Origin."""
import csv
import hmac
import io
import json
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, Response

import admin_auth as auth
import admin_stats
import analytics
import server_metrics
from config import (ADMIN_COOKIE_SECURE, ADMIN_DEV_LOGIN, ADMIN_IDS, ADMIN_PUBLIC_ORIGIN,
                    ADMIN_SESSION_HOURS, APP_VERSION, BOT_MODE, TELEGRAM_BOT_TOKEN)

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/admin', include_in_schema=False)
MAX_BODY = 4096
_schedule = None   # injected by main.py


def bind(schedule_service):
    global _schedule
    _schedule = schedule_service


class AdminError(Exception):
    def __init__(self, status, message, headers=None):
        self.status, self.message, self.headers = status, message, headers or {}


def error_response(exc: AdminError):
    return JSONResponse(status_code=exc.status, headers=exc.headers,
                        content={'status': 'error', 'message': exc.message})


def client_ip(request: Request):
    # Uvicorn already resolves X-Forwarded-For from trusted proxies (127.0.0.1)
    # into request.client; do NOT read forwarding headers here (spoofable).
    return request.client.host if request.client else 'unknown'


def _origin_allowed(request: Request, origin: str):
    if ADMIN_PUBLIC_ORIGIN:
        return origin == ADMIN_PUBLIC_ORIGIN
    try:
        parts = urlsplit(origin)
    except ValueError:
        return False
    host = request.headers.get('host', '').lower()
    if not host or parts.netloc.lower() != host or parts.path not in ('', '/'):
        return False
    if parts.scheme == 'https':
        return True
    # Plain http is accepted only for local development.
    return parts.scheme == 'http' and ((parts.hostname or '') in ('localhost', '127.0.0.1') or not ADMIN_COOKIE_SECURE)


def _check_same_origin(request: Request, require=True):
    origin = request.headers.get('origin')
    fetch_site = request.headers.get('sec-fetch-site')
    if fetch_site and fetch_site not in ('same-origin', 'none'):
        raise AdminError(403, 'Заборонено (cross-site).')
    if origin is None:
        if require and fetch_site != 'same-origin':
            raise AdminError(403, 'Заборонено (немає Origin).')
        return
    if not _origin_allowed(request, origin):
        raise AdminError(403, 'Заборонено (чужий Origin).')


async def _json_body(request: Request):
    ctype = request.headers.get('content-type', '').split(';')[0].strip().lower()
    if ctype != 'application/json':
        raise AdminError(415, 'Очікується application/json.')
    length = request.headers.get('content-length')
    if length and (not length.isdigit() or int(length) > MAX_BODY):
        raise AdminError(413, 'Запит завеликий.')
    body = b''
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY:
            raise AdminError(413, 'Запит завеликий.')
    try:
        data = json.loads(body or b'{}')
    except (ValueError, UnicodeDecodeError):
        raise AdminError(400, 'Некоректний JSON.')
    if not isinstance(data, dict):
        raise AdminError(400, 'Некоректний JSON.')
    return data


async def require_session(request: Request, mutating=False):
    _check_same_origin(request, require=mutating)
    session = await auth.get_session(request.cookies.get(auth.COOKIE_NAME))
    if not session:
        raise AdminError(401, 'Потрібен вхід.')
    if not auth.api_session_limiter.check(session['sid']):
        raise AdminError(429, 'Забагато запитів.', {'Retry-After': str(auth.api_session_limiter.retry_after(session['sid']))})
    if mutating:
        token = request.headers.get('x-csrf-token', '')
        if not token or not hmac.compare_digest(token, session['csrf']):
            raise AdminError(403, 'Недійсний CSRF-токен. Оновіть сторінку.')
    return session


def _set_cookie(response, token):
    response.set_cookie(auth.COOKIE_NAME, token, max_age=ADMIN_SESSION_HOURS * 3600, path='/',
                        secure=ADMIN_COOKIE_SECURE, httponly=True, samesite='strict')


def _clear_cookie(response):
    response.delete_cookie(auth.COOKIE_NAME, path='/', secure=ADMIN_COOKIE_SECURE, httponly=True, samesite='strict')


async def _login_response(request, user, method):
    token = await auth.create_session(user['id'], user.get('name'), user.get('username'), method,
                                      client_ip(request), request.headers.get('user-agent', ''))
    await auth.audit('login', user['id'], client_ip(request), method)
    response = JSONResponse({'status': 'success'})
    _set_cookie(response, token)
    return response


def _is_direct_localhost(request: Request):
    host = (urlsplit('//' + request.headers.get('host', '')).hostname or '').lower()
    return (client_ip(request) in ('127.0.0.1', '::1') and host in ('localhost', '127.0.0.1')
            and not request.headers.get('x-forwarded-for') and not request.headers.get('x-real-ip'))


# ----------------------------------------------------------------- endpoints
@router.get('/config')
async def admin_config(request: Request):
    return {'status': 'success', 'data': {
        'bot_id': auth.bot_id(), 'telegram_login': bool(TELEGRAM_BOT_TOKEN and auth.bot_id()),
        'dev_login': ADMIN_DEV_LOGIN and _is_direct_localhost(request),
        'dev_admin_ids': sorted(ADMIN_IDS) if ADMIN_DEV_LOGIN and _is_direct_localhost(request) else [],
        'version': APP_VERSION}}


@router.post('/auth/telegram')
async def auth_telegram(request: Request):
    ip = client_ip(request)
    _check_same_origin(request)
    if not auth.login_ip_limiter.check(ip):
        raise AdminError(429, 'Забагато спроб входу. Зачекайте кілька хвилин.',
                         {'Retry-After': str(auth.login_ip_limiter.retry_after(ip))})
    data = await _json_body(request)
    user = auth.verify_telegram_payload(data)
    if not user:
        await auth.audit('login_bad_signature', None, ip)
        raise AdminError(401, 'Дані Telegram недійсні або застарілі. Спробуйте увійти ще раз.')
    if user['id'] not in ADMIN_IDS:
        await auth.audit('login_denied', user['id'], ip, user.get('username'))
        raise AdminError(403, 'Цей Telegram-акаунт не має доступу до адмінки.')
    if not await auth.consume_auth_hash(user['auth_hash']):
        await auth.audit('login_replay', user['id'], ip)
        raise AdminError(401, 'Ці дані входу вже використано. Увійдіть ще раз.')
    return await _login_response(request, user, 'telegram')


@router.post('/auth/code')
async def auth_code(request: Request):
    ip = client_ip(request)
    _check_same_origin(request)
    if not auth.code_ip_limiter.check(ip) or not auth.code_global_limiter.check('global'):
        raise AdminError(429, 'Забагато спроб. Зачекайте 10 хвилин.',
                         {'Retry-After': str(max(auth.code_ip_limiter.retry_after(ip), 60))})
    data = await _json_body(request)
    user = await auth.consume_login_code(data.get('code'))
    if not user:
        await auth.audit('login_bad_code', None, ip)
        raise AdminError(401, 'Код недійсний або прострочений.')
    return await _login_response(request, user, 'code')


@router.post('/auth/dev')
async def auth_dev(request: Request):
    if not ADMIN_DEV_LOGIN or not _is_direct_localhost(request):
        raise AdminError(404, 'Not found')
    _check_same_origin(request)
    data = await _json_body(request)
    try:
        user_id = int(data.get('user_id'))
    except (TypeError, ValueError):
        raise AdminError(400, 'Некоректний ID.')
    if user_id not in ADMIN_IDS:
        raise AdminError(403, 'Не адмін.')
    logger.warning('DEV LOGIN used for %s (local only)', user_id)
    return await _login_response(request, {'id': user_id, 'name': f'Dev {user_id}', 'username': ''}, 'dev')


@router.post('/logout')
async def logout(request: Request):
    session = await require_session(request, mutating=True)
    await auth.delete_session(session['token_hash'])
    await auth.audit('logout', session['user_id'], client_ip(request))
    response = JSONResponse({'status': 'success'})
    _clear_cookie(response)
    return response


@router.get('/me')
async def me(request: Request):
    s = await require_session(request)
    return {'status': 'success', 'data': {
        'user': {'id': s['user_id'], 'name': s['name'], 'username': s['username']},
        'csrf': s['csrf'], 'session': {'method': s['method'], 'created_at': s['created_at'], 'expires_at': s['expires_at']}}}


@router.get('/overview')
async def overview(request: Request):
    await require_session(request)
    return {'status': 'success', 'data': {**await admin_stats.overview(), 'health': _health_summary()}}


@router.get('/stats')
async def stats(request: Request, range_key: str = Query('30', alias='range', max_length=4)):
    await require_session(request)
    return {'status': 'success', 'data': await admin_stats.stats(range_key if range_key in admin_stats.RANGES else '30')}


def _bot_state():
    if BOT_MODE != 'embedded':
        return BOT_MODE
    try:
        import bot
        return bot.BOT_STATE
    except Exception:
        return 'unknown'


def _health_summary():
    sched = _schedule.diagnostics() if _schedule else {'ready': False}
    writer = analytics.writer_status()
    system = server_metrics.system_info()
    requests = server_metrics.request_summary(15)
    checks = []

    def add(key, label, level, detail):
        checks.append({'key': key, 'label': label, 'level': level, 'detail': detail})

    if not sched.get('ready'):
        add('schedule', 'Розклад', 'critical', 'Немає даних розкладу — сайт віддає 503')
    elif sched.get('stale'):
        add('schedule', 'Розклад', 'warning', f"Застарілий кеш (помилка: {sched.get('last_error_type') or '—'})")
    else:
        add('schedule', 'Розклад', 'ok', f"{sched.get('groups')} груп, актуальний")
    if not writer['running']:
        add('analytics', 'Запис статистики', 'critical', 'Writer зупинений')
    elif writer['write_error'] or writer['dropped']:
        add('analytics', 'Запис статистики', 'warning', f"Втрачено подій: {writer['dropped']}")
    else:
        add('analytics', 'Запис статистики', 'ok', f"У черзі: {writer['pending']}")
    disk = system.get('disk')
    if disk and disk['total']:
        free_pct = disk['free'] / disk['total'] * 100
        add('disk', 'Диск', 'critical' if free_pct < 5 else 'warning' if free_pct < 15 else 'ok',
            f'Вільно {free_pct:.0f}%')
    mem = system.get('memory')
    if mem and mem.get('percent') is not None:
        add('memory', "Пам'ять", 'critical' if mem['percent'] > 95 else 'warning' if mem['percent'] > 85 else 'ok',
            f"Зайнято {mem['percent']:.0f}%")
    lag = system['event_loop_lag_ms']['max_2min']
    if lag is not None:
        add('loop', 'Event loop', 'warning' if lag > 250 else 'ok', f'Макс. затримка {lag:.0f} мс')
    s5 = sum(x['s5xx'] for x in requests['series'])
    add('errors', 'Помилки 5xx (15 хв)', 'warning' if s5 else 'ok', str(s5))
    order = {'ok': 0, 'warning': 1, 'critical': 2}
    worst = max((c['level'] for c in checks), key=order.get, default='ok')
    return {'status': worst, 'checks': checks, 'uptime_seconds': system['uptime_seconds'],
            'version': APP_VERSION, 'rpm': requests['last5']['rpm'], 'p95_ms': requests['latency_ms']['p95']}


@router.get('/server')
async def server(request: Request):
    await require_session(request)
    return {'status': 'success', 'data': {
        'health': _health_summary(),
        'system': server_metrics.system_info(),
        'requests': server_metrics.request_summary(60),
        'schedule': _schedule.diagnostics() if _schedule else None,
        'analytics_writer': analytics.writer_status(),
        'bot': {'mode': BOT_MODE, 'state': _bot_state()},
        'security': {'secure_cookie': ADMIN_COOKIE_SECURE, 'dev_login_enabled': ADMIN_DEV_LOGIN,
                     'telegram_login_configured': bool(TELEGRAM_BOT_TOKEN), 'admins': len(ADMIN_IDS),
                     'https': request.url.scheme == 'https'},
    }}


@router.post('/actions/refresh-schedule')
async def refresh_schedule(request: Request):
    s = await require_session(request, mutating=True)
    if not auth.action_limiter.check(s['sid']):
        raise AdminError(429, 'Зачекайте хвилину.')
    diag = _schedule.diagnostics()
    if diag['retry_blocked_for']:
        return {'status': 'success', 'data': {'refreshed': False,
                'message': f"Оновлення щойно запускалось, спробуйте через {diag['retry_blocked_for']} с."}}
    ok = await _schedule.refresh()
    await auth.audit('refresh_schedule', s['user_id'], client_ip(request), 'ok' if ok else 'failed')
    return {'status': 'success', 'data': {'refreshed': ok, 'message': 'Розклад оновлено.' if ok else
            'Не вдалося оновити — працює останній збережений розклад.', 'schedule': _schedule.diagnostics()}}


@router.get('/sessions')
async def sessions(request: Request):
    s = await require_session(request)
    return {'status': 'success', 'data': await auth.list_sessions(s['sid'])}


@router.post('/sessions/revoke')
async def sessions_revoke(request: Request):
    s = await require_session(request, mutating=True)
    data = await _json_body(request)
    if data.get('scope') == 'others':
        count = await auth.revoke_other_sessions(s['sid'])
    else:
        sid = data.get('sid')
        if not isinstance(sid, str) or not sid or len(sid) > 32:
            raise AdminError(400, 'Некоректна сесія.')
        count = await auth.revoke_session(sid)
    await auth.audit('revoke_sessions', s['user_id'], client_ip(request), f'count={count}')
    return {'status': 'success', 'data': {'revoked': count}}


@router.post('/login-code')
async def login_code(request: Request):
    s = await require_session(request, mutating=True)
    if not auth.action_limiter.check(s['sid']):
        raise AdminError(429, 'Зачекайте хвилину.')
    code, ttl = await auth.create_login_code(s)
    await auth.audit('login_code_created', s['user_id'], client_ip(request))
    return {'status': 'success', 'data': {'code': code, 'expires_in': ttl}}


@router.get('/audit')
async def audit(request: Request, limit: int = Query(100, ge=1, le=500)):
    await require_session(request)
    return {'status': 'success', 'data': await auth.audit_log(limit)}


def _csv_safe(value):
    # Prevent CSV/formula injection when opened in Excel/Sheets.
    text = str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@', '\t', '\r') else text


@router.get('/export/{kind}.csv')
async def export_csv(request: Request, kind: str):
    s = await require_session(request)
    if kind == 'daily':
        rows = await admin_stats.export_daily_rows()
    elif kind == 'groups':
        rows = await admin_stats.export_group_rows()
    else:
        raise AdminError(404, 'Not found')
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow([_csv_safe(v) for v in row])
    await auth.audit('export', s['user_id'], client_ip(request), kind)
    return Response(content='\ufeff' + buf.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="mykep-{kind}.csv"'})
