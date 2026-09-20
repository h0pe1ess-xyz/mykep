import asyncio
import logging
import os
import random
from config import KYIV, DB_PATH
from process_lock import exclusive_process_lock
from datetime import datetime, time as dtime
from telegram import Update, Bot
from telegram.error import Conflict, InvalidToken, Forbidden, NetworkError
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

import analytics

logger = logging.getLogger(__name__)

# Preserve existing admins unless the deployment explicitly overrides them.
ADMIN_IDS = {int(value.strip()) for value in os.getenv('TELEGRAM_ADMIN_IDS', '1125085502,1320649428').split(',') if value.strip()}
BOT_STATE = 'disabled' 
DAILY_REPORT_HOUR = 22
DAILY_REPORT_MINUTE = 0


def _is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def _bar(value: int, max_val: int, width: int = 10) -> str:
    """Simple text progress bar."""
    if max_val == 0:
        return "░" * width
    filled = round(value / max_val * width)
    return "█" * filled + "░" * (width - filled)


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Today's summary."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_today_stats()
    groups_text = "\n".join(
        f"  {i+1}. {g[0]} - {g[1]} перегл."
        for i, g in enumerate(data["top_groups"])
    ) or "  Немає даних"

    msg = (
        f"📊 Статистика за {data['date']}\n"
        f"{'─' * 24}\n"
        f"Переглядів розкладу: {data['total_requests']}\n"
        f"Користувачів: {data['unique_users']}\n"
        f"{'─' * 24}\n"
        f"Топ групи:\n{groups_text}"
    )
    await update.effective_message.reply_text(msg)


async def cmd_week(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Weekly breakdown."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    days = await analytics.get_week_stats()
    max_req = max((d["requests"] for d in days), default=1) or 1

    lines = []
    for d in days:
        short_date = d["date"][5:]  # MM-DD
        bar = _bar(d["requests"], max_req, 8)
        lines.append(f"{short_date} {bar} {d['requests']} перегл. / {d['users']} корист.")

    msg = f"📈 Тижнева динаміка\n{'─' * 28}\n" + "\n".join(lines)
    await update.effective_message.reply_text(msg)


async def cmd_groups(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Top groups all time."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    groups = await analytics.get_top_groups(10)
    if not groups:
        await update.effective_message.reply_text("Немає даних по групах.")
        return

    max_cnt = groups[0][1] if groups else 1
    lines = []
    for i, (name, cnt) in enumerate(groups):
        bar = _bar(cnt, max_cnt, 8)
        lines.append(f"  {i+1}. {name} {bar} {cnt}")

    msg = f"🏆 Топ-10 груп (за весь час)\n{'─' * 28}\n" + "\n".join(lines)
    await update.effective_message.reply_text(msg)


async def cmd_users(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """User counts by period."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_user_counts()
    msg = (
        f"👥 Унікальні користувачі\n"
        f"{'─' * 24}\n"
        f"Сьогодні (DAU):  {data['dau']}\n"
        f"Тиждень (WAU):   {data['wau']}\n"
        f"Місяць (MAU):    {data['mau']}\n"
        f"Всього:          {data['total']}"
    )
    await update.effective_message.reply_text(msg)


async def cmd_live(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Activity in the last hour."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_live_activity(60)
    groups_text = ", ".join(f"{g[0]}({g[1]})" for g in data["top_groups"]) or "---"

    msg = (
        f"⚡ Live (остання година)\n"
        f"{'─' * 24}\n"
        f"Переглядів розкладу: {data['requests']}\n"
        f"Користувачів: {data['unique_users']}\n"
        f"Групи: {groups_text}"
    )
    await update.effective_message.reply_text(msg)


async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Platform breakdown."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_platform_breakdown()
    if not data:
        await update.effective_message.reply_text("Немає даних по платформах.")
        return

    lines = [f"  {d['platform']}: {d['count']} ({d['percent']}%)" for d in data]
    msg = f"📱 Платформи (за переглядами, не людьми)\n{'─' * 24}\n" + "\n".join(lines)
    await update.effective_message.reply_text(msg)


async def cmd_hours(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Hourly activity chart for today."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_hourly_activity()
    if not data:
        await update.effective_message.reply_text("Немає даних по годинах за сьогодні.")
        return

    max_req = max((d["requests"] for d in data), default=1) or 1
    lines = [
        f"{d['hour']} {_bar(d['requests'], max_req, 10)} {d['requests']}"
        for d in data
    ]
    msg = f"🕐 Активність по годинах\n{'─' * 28}\n" + "\n".join(lines)
    await update.effective_message.reply_text(msg)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show available commands."""
    if not update.effective_user or not update.effective_message or not _is_admin(update.effective_user.id):
        return

    msg = (
        "📋 MyKep Analytics Bot\n"
        "─────────────────\n"
        "/stats - Зведення за сьогодні\n"
        "/week - Тижнева динаміка\n"
        "/groups - Топ-10 груп\n"
        "/users - DAU / WAU / MAU\n"
        "/live - Активність за останню годину\n"
        "/hours - Активність по годинах\n"
        "/platforms - Розбивка по платформах\n"
        "/help - Ця довідка\n\nУнікальний користувач - анонімний ID браузера або PWA, не підтверджена особа. Офлайн-перегляди не враховуються. Час: Київ."
    )
    await update.effective_message.reply_text(msg)


async def _send_daily_report(bot: Bot) -> None:
    """Send daily summary to all admins."""
    data = await analytics.get_today_stats()
    user_data = await analytics.get_user_counts()

    groups_text = "\n".join(
        f"  {i+1}. {g[0]} - {g[1]} перегл."
        for i, g in enumerate(data["top_groups"])
    ) or "  Немає даних"

    msg = (
        f"📊 Щоденний звіт - {data['date']}\n"
        f"{'─' * 28}\n"
        f"Переглядів розкладу сьогодні: {data['total_requests']}\n"
        f"Користувачів сьогодні: {data['unique_users']}\n"
        f"Всього користувачів: {user_data['total']}\n"
        f"{'─' * 28}\n"
        f"Топ групи:\n{groups_text}\n"
        f"{'─' * 28}\n"
        f"Автозвіт MyKep Analytics"
    )

    for admin_id in ADMIN_IDS:
        if await analytics.report_sent(data['date'], admin_id):
            continue
        try:
            await bot.send_message(chat_id=admin_id, text=msg)
            await analytics.mark_report_sent(data['date'], admin_id)
        except Forbidden:
            logger.warning('Daily report not delivered: admin must start/unblock the bot')
        except Exception as exc:
            logger.warning('Daily report delivery failed (%s); will retry', type(exc).__name__)


async def _daily_report_scheduler(bot):
    # Poll the Kyiv clock instead of sleeping 24h; correct across DST/restarts.
    # Successful deliveries are persisted per admin and calendar day.
    while True:
        now = datetime.now(KYIV)
        if (now.hour, now.minute) >= (DAILY_REPORT_HOUR, DAILY_REPORT_MINUTE):
            try:
                await _send_daily_report(bot)
            except Exception as exc:
                logger.warning('Daily report failed (%s)', type(exc).__name__)
        await asyncio.sleep(60)


async def on_error(update, context):
    # Telegram URLs can contain the token: never stringify network exceptions.
    logger.warning('Telegram handler failed (%s)', type(context.error).__name__)
    if update and update.effective_user and _is_admin(update.effective_user.id) and update.effective_message:
        try:
            await update.effective_message.reply_text('Не вдалося отримати статистику. Спробуйте ще раз за кілька секунд.')
        except Exception:
            pass


async def _cleanup(app, report_task):
    if report_task:
        report_task.cancel()
        await asyncio.gather(report_task, return_exceptions=True)
    if app is None:
        return
    # Each cleanup step is independent; a failed stop must not skip shutdown.
    for operation, needed in ((app.updater.stop, app.updater.running),
                              (app.stop, app.running), (app.shutdown, True)):
        if needed:
            try:
                await operation()
            except Exception as exc:
                logger.warning('Bot cleanup failed (%s)', type(exc).__name__)


async def start_bot(token):
    global BOT_STATE
    # Same-host worker/reloader protection; across hosts run exactly one poller.
    with exclusive_process_lock(DB_PATH + '.bot.lock') as acquired:
        if not acquired:
            BOT_STATE = 'another_local_instance'
            logger.warning('Bot already running locally; skipping duplicate poller')
            return
        backoff = 5
        while True:
            app = None
            report_task = None
            stop_event = asyncio.Event()
            fatal = []
            def polling_error(error):
                logger.warning('Telegram polling error (%s)', type(error).__name__)
                if isinstance(error, (Conflict, InvalidToken)):
                    fatal.append(type(error).__name__)
                    stop_event.set()

            try:
                BOT_STATE = 'starting'
                app = (Application.builder().token(token)
                       .connect_timeout(10).read_timeout(15).write_timeout(15)
                       .pool_timeout(10).build())
                for command, handler in {'start': cmd_help, 'help': cmd_help, 'stats': cmd_stats,
                        'week': cmd_week, 'groups': cmd_groups, 'users': cmd_users,
                        'live': cmd_live, 'hours': cmd_hours, 'platforms': cmd_platforms}.items():
                    app.add_handler(CommandHandler(command, handler))
                app.add_error_handler(on_error)
                await app.initialize()
                # Do not delete a webhook behind the operator's back.
                info = await app.bot.get_webhook_info()
                if info.url:
                    BOT_STATE = 'webhook_conflict'
                    logger.error('Webhook configured: polling disabled. Operator must choose one mode.')
                    return
                await app.start()
                await app.updater.start_polling(drop_pending_updates=False, timeout=25,
                        bootstrap_retries=0, error_callback=polling_error,
                        allowed_updates=['message'])
                report_task = asyncio.create_task(_daily_report_scheduler(app.bot), name='daily-report')
                BOT_STATE = 'running'
                backoff = 5
                logger.info('Telegram bot polling started')
                await stop_event.wait()
                if fatal:
                    BOT_STATE = 'configuration_error'
                    logger.error('Polling stopped (%s). Stop duplicate deployment or fix token, then restart.', fatal[0])
                    return
            except asyncio.CancelledError:
                BOT_STATE = 'stopped'
                raise
            except (InvalidToken, Conflict):
                BOT_STATE = 'configuration_error'
                logger.error('Bot token or polling conflict. Fix deployment configuration and restart.')
                return
            except Exception as exc:
                BOT_STATE = 'retrying'
                logger.warning('Bot unavailable (%s); reconnecting with backoff', type(exc).__name__)
            finally:
                await _cleanup(app, report_task)
            await asyncio.sleep(backoff + random.uniform(0, 2))
            backoff = min(backoff * 2, 120)


async def run_standalone():
    from database import init_database
    token = os.getenv('TELEGRAM_BOT_TOKEN', '')
    if not token:
        raise SystemExit('Set TELEGRAM_BOT_TOKEN in the environment or .env')
    await init_database()
    await analytics.init_analytics_db()
    await start_bot(token)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    asyncio.run(run_standalone())
