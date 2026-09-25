import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from config import ADMIN_COOKIE_SECURE, ADMIN_DEV_LOGIN, BASE_DIR, BOT_MODE, PUBLIC_CSP, TELEGRAM_BOT_TOKEN
from database import init_database
from schedule_service import ScheduleService
import admin_api
import admin_auth
import analytics
import server_metrics

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
# Never log Telegram request URLs, which contain the bot token.
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
schedule = ScheduleService()
admin_api.bind(schedule)
ADMIN_DIR = BASE_DIR / 'admin_static'


async def _admin_housekeeping():
    while True:
        try:
            await admin_auth.cleanup()
        except Exception as exc:
            logger.warning('Admin cleanup failed (%s)', type(exc).__name__)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app):
    await init_database()
    await analytics.init_analytics_db()
    await admin_auth.init_admin_db()
    await analytics.start_writer()
    server_metrics.start_background()
    if ADMIN_DEV_LOGIN:
        logger.warning('ADMIN_DEV_LOGIN=1: passwordless local admin login is ENABLED. Never use this in production!')
    if not ADMIN_COOKIE_SECURE:
        logger.warning('ADMIN_COOKIE_SECURE=0: admin cookie without Secure flag (local testing only).')
    if not TELEGRAM_BOT_TOKEN:
        logger.warning('TELEGRAM_BOT_TOKEN is not set: Telegram login to /admin is unavailable.')
    tasks = [asyncio.create_task(_admin_housekeeping(), name='admin-housekeeping')]
    try:
        await schedule.load()
        # Start serving immediately from last good data. A cold start returns 503
        # promptly rather than starting one upstream request for every visitor.
        tasks.append(asyncio.create_task(schedule.run(), name='schedule-refresh'))
        # The statistics bot is disabled by default (replaced by /admin).
        # Re-enable with BOT_MODE=embedded if needed.
        if BOT_MODE == 'embedded' and TELEGRAM_BOT_TOKEN:
            import bot
            tasks.append(asyncio.create_task(bot.start_bot(TELEGRAM_BOT_TOKEN), name='telegram-bot'))
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await server_metrics.stop_background()
        await analytics.stop_writer()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(admin_api.router)


@app.exception_handler(admin_api.AdminError)
async def admin_error_handler(request: Request, exc: admin_api.AdminError):
    return admin_api.error_response(exc)


# Strict policy for the admin panel: only same-origin scripts/styles, no inline
# code, no framing, Trusted Types enforced (blocks DOM-XSS sinks in Chromium).
ADMIN_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
             "connect-src 'self'; manifest-src 'self'; worker-src 'self'; font-src 'self'; "
             "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; "
             "require-trusted-types-for 'script'; trusted-types mykep-admin")
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# Public site: no inline/external scripts are used. Inline style attributes exist
# in the existing pages, hence 'unsafe-inline' for styles only.
PUBLIC_CSP_VALUE = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; "
                    "worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; "
                    "form-action 'self'")


@app.middleware('http')
async def response_headers(request: Request, call_next):
    started = time.perf_counter()
    path = request.url.path
    try:
        response = await call_next(request)
    except Exception:
        server_metrics.record(path, 500, (time.perf_counter() - started) * 1000)
        raise
    server_metrics.record(path, response.status_code, (time.perf_counter() - started) * 1000)
    h = response.headers
    h['X-Content-Type-Options'] = 'nosniff'
    h['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    h['X-Frame-Options'] = 'DENY'
    h['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
    h['Cross-Origin-Opener-Policy'] = 'same-origin'
    if request.url.scheme == 'https':
        h['Strict-Transport-Security'] = 'max-age=15552000'
    is_admin = path == '/admin' or path.startswith('/admin/') or path.startswith('/api/admin')
    if path.startswith('/api/'):
        h['Cache-Control'] = 'no-store'
        h['X-Robots-Tag'] = 'noindex'
        h['Content-Security-Policy'] = API_CSP
    elif path.endswith(('.html', '.js', '.css', '.json', '.txt', '.xml', '.webmanifest')) or path in ('/', '/admin/'):
        h['Cache-Control'] = 'no-cache'
    if is_admin:
        h['X-Robots-Tag'] = 'noindex, nofollow'
        h['Cross-Origin-Resource-Policy'] = 'same-origin'
        h['Referrer-Policy'] = 'no-referrer'
        if not path.startswith('/api/'):
            h['Content-Security-Policy'] = ADMIN_CSP
    elif PUBLIC_CSP and not path.startswith('/api/'):
        h['Content-Security-Policy'] = PUBLIC_CSP_VALUE
    if path in ('/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap.xml'):
        h['X-Robots-Tag'] = 'noindex'
    return response


@app.get('/api/health')
async def health():
    # Public liveness probe: deliberately minimal (details are in /admin).
    ready = bool(schedule.raw)
    return JSONResponse(status_code=200 if ready else 503, content={
        'status': 'ok' if ready else 'warming_up',
        'schedule': schedule.metadata(),
    })


@app.get('/api/schedule')
async def get_schedule(request: Request,
                       group: str = Query('ПІ-24-02', min_length=2, max_length=64),
                       duration1: int = Query(80),
                       duration2: int = Query(60),
                       uid: Optional[str] = Query(None, max_length=128),
                       week: Optional[int] = Query(None, ge=1, le=4),
                       mode: Optional[str] = Query(None, max_length=16)):
    if duration1 not in (60, 80) or duration2 not in (60, 80):
        return JSONResponse(status_code=422, content={'status': 'error', 'message': 'Тривалість має бути 60 або 80 хвилин.'})
    if not schedule.raw:
        return JSONResponse(status_code=503, headers={'Retry-After': '30'}, content={
            'status': 'error', 'message': 'Розклад тимчасово недоступний. Спробуйте за хвилину.'})
    data = schedule.build(group, duration1, duration2, week=week)
    if data is None:
        return JSONResponse(status_code=404, content={'status': 'error', 'message': 'Групу не знайдено. Перевірте назву в налаштуваннях.'})
    analytics.record_request(uid, group, '/api/schedule', request.headers.get('user-agent', ''), mode)
    return {'status': 'success', 'data': data, 'meta': schedule.metadata()}


@app.get('/api/groups')
async def get_groups():
    if not schedule.groups:
        return JSONResponse(status_code=503, headers={'Retry-After': '30'}, content={
            'status': 'error', 'message': 'Список груп тимчасово недоступний.'})
    # Group pickers are not schedule views and must not inflate bot statistics.
    return {'status': 'success', 'data': schedule.groups, 'meta': schedule.metadata()}


# ------------------------------------------------------------ admin frontend
# Explicit allowlist: no user input ever reaches the filesystem path.
ADMIN_FILES = {
    'admin.css': 'text/css; charset=utf-8',
    'admin.js': 'text/javascript; charset=utf-8',
    'charts.js': 'text/javascript; charset=utf-8',
    'sw.js': 'text/javascript; charset=utf-8',
    'manifest.webmanifest': 'application/manifest+json',
    'icon-192.png': 'image/png',
    'icon-512.png': 'image/png',
    'maskable-512.png': 'image/png',
    'apple-touch-icon.png': 'image/png',
}


@app.api_route('/admin', methods=['GET', 'HEAD'], include_in_schema=False)
async def admin_redirect():
    return RedirectResponse(url='/admin/', status_code=308)


@app.api_route('/admin/', methods=['GET', 'HEAD'], include_in_schema=False)
async def admin_index():
    return FileResponse(ADMIN_DIR / 'index.html', media_type='text/html; charset=utf-8')


@app.api_route('/admin/{name}', methods=['GET', 'HEAD'], include_in_schema=False)
async def admin_file(name: str):
    media_type = ADMIN_FILES.get(name)
    if media_type is None:
        return JSONResponse(status_code=404, content={'status': 'error', 'message': 'Not found'})
    return FileResponse(ADMIN_DIR / name, media_type=media_type)


@app.api_route('/index.html', methods=['GET', 'HEAD'], include_in_schema=False)
async def canonical_home(request: Request):
    # Preserve launch parameters; use a relative target independent of Host headers.
    target = '/' + ('?' + request.url.query if request.url.query else '')
    return RedirectResponse(url=target, status_code=308)


app.mount('/', StaticFiles(directory=str(BASE_DIR / 'static'), html=True), name='static')

if __name__ == '__main__':
    import uvicorn
    import os
    uvicorn.run('main:app', host=os.getenv('MYKEP_HOST', '127.0.0.1'), port=int(os.getenv('MYKEP_PORT', '8000')), reload=False, access_log=False)
