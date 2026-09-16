import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from config import BASE_DIR, BOT_MODE
from database import init_database
from schedule_service import ScheduleService
import analytics

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
# Never log Telegram request URLs, which contain the bot token.
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
schedule = ScheduleService()


@asynccontextmanager
async def lifespan(app):
    await init_database()
    await analytics.init_analytics_db()
    await analytics.start_writer()
    tasks = []
    try:
        await schedule.load()
        # Start serving immediately from last good data. A cold start returns 503
        # promptly rather than starting one upstream request for every visitor.
        tasks.append(asyncio.create_task(schedule.run(), name='schedule-refresh'))
        if BOT_MODE == 'embedded':
            import os
            if os.getenv('TELEGRAM_BOT_TOKEN'):
                import bot
                tasks.append(asyncio.create_task(bot.start_bot(os.environ['TELEGRAM_BOT_TOKEN']), name='telegram-bot'))
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await analytics.stop_writer()


app = FastAPI(lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware('http')
async def response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Robots-Tag'] = 'noindex'
    elif request.url.path.endswith(('.html', '.js', '.css', '.json', '.txt', '.xml')) or request.url.path == '/':
        response.headers['Cache-Control'] = 'no-cache'
    if request.url.path in ('/docs', '/redoc', '/openapi.json', '/docs/oauth2-redirect', '/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap.xml'):
        response.headers['X-Robots-Tag'] = 'noindex'
    return response


@app.get('/api/health')
async def health():
    ready = bool(schedule.raw)
    return JSONResponse(status_code=200 if ready else 503, content={
        'status': 'ok' if ready else 'warming_up',
        'schedule': schedule.metadata(),
        'analytics': analytics.writer_status(),
    })


@app.get('/api/schedule')
async def get_schedule(request: Request,
                       group: str = Query('ПІ-24-02', min_length=2, max_length=64),
                       duration1: int = Query(80),
                       duration2: int = Query(60),
                       uid: Optional[str] = Query(None, max_length=128)):
    if duration1 not in (60, 80) or duration2 not in (60, 80):
        return JSONResponse(status_code=422, content={'status': 'error', 'message': 'Тривалість має бути 60 або 80 хвилин.'})
    if not schedule.raw:
        return JSONResponse(status_code=503, headers={'Retry-After': '30'}, content={
            'status': 'error', 'message': 'Розклад тимчасово недоступний. Спробуйте за хвилину.'})
    data = schedule.build(group, duration1, duration2)
    if data is None:
        return JSONResponse(status_code=404, content={'status': 'error', 'message': 'Групу не знайдено. Перевірте назву в налаштуваннях.'})
    analytics.record_request(uid, group, '/api/schedule', request.headers.get('user-agent', ''))
    return {'status': 'success', 'data': data, 'meta': schedule.metadata()}


@app.get('/api/groups')
async def get_groups():
    if not schedule.groups:
        return JSONResponse(status_code=503, headers={'Retry-After': '30'}, content={
            'status': 'error', 'message': 'Список груп тимчасово недоступний.'})
    # Group pickers are not schedule views and must not inflate bot statistics.
    return {'status': 'success', 'data': schedule.groups, 'meta': schedule.metadata()}


@app.api_route('/index.html', methods=['GET', 'HEAD'], include_in_schema=False)
async def canonical_home(request: Request):
    # Preserve launch parameters; use a relative target independent of Host headers.
    target = '/' + ('?' + request.url.query if request.url.query else '')
    return RedirectResponse(url=target, status_code=308)


app.mount('/', StaticFiles(directory=str(BASE_DIR / 'static'), html=True), name='static')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=False, access_log=False)
