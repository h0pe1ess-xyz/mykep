import asyncio
import logging
from datetime import datetime, time as dtime
from telegram import Update, Bot
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import analytics

logger = logging.getLogger(__name__)

ADMIN_IDS = {1125085502, 1320649428}
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
    if not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_today_stats()
    groups_text = "\n".join(
        f"  {i+1}. {g[0]} - {g[1]} req"
        for i, g in enumerate(data["top_groups"])
    ) or "  Немає даних"

    msg = (
        f"📊 Статистика за {data['date']}\n"
        f"{'─' * 24}\n"
        f"Запитів: {data['total_requests']}\n"
        f"Юзерів: {data['unique_users']}\n"
        f"{'─' * 24}\n"
        f"Топ групи:\n{groups_text}"
    )
    await update.message.reply_text(msg)


async def cmd_week(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Weekly breakdown."""
    if not _is_admin(update.effective_user.id):
        return

    days = await analytics.get_week_stats()
    max_req = max((d["requests"] for d in days), default=1) or 1

    lines = []
    for d in days:
        short_date = d["date"][5:]  # MM-DD
        bar = _bar(d["requests"], max_req, 8)
        lines.append(f"{short_date} {bar} {d['requests']}req / {d['users']}usr")

    msg = f"📈 Тижнева динаміка\n{'─' * 28}\n" + "\n".join(lines)
    await update.message.reply_text(msg)


async def cmd_groups(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Top groups all time."""
    if not _is_admin(update.effective_user.id):
        return

    groups = await analytics.get_top_groups(10)
    if not groups:
        await update.message.reply_text("Немає даних по групах.")
        return

    max_cnt = groups[0][1] if groups else 1
    lines = []
    for i, (name, cnt) in enumerate(groups):
        bar = _bar(cnt, max_cnt, 8)
        lines.append(f"  {i+1}. {name} {bar} {cnt}")

    msg = f"🏆 Топ-10 груп (all time)\n{'─' * 28}\n" + "\n".join(lines)
    await update.message.reply_text(msg)


async def cmd_users(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """User counts by period."""
    if not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_user_counts()
    msg = (
        f"👥 Унікальні юзери\n"
        f"{'─' * 24}\n"
        f"Сьогодні (DAU):  {data['dau']}\n"
        f"Тиждень (WAU):   {data['wau']}\n"
        f"Місяць (MAU):    {data['mau']}\n"
        f"Всього:          {data['total']}"
    )
    await update.message.reply_text(msg)


async def cmd_live(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Activity in the last hour."""
    if not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_live_activity(60)
    groups_text = ", ".join(f"{g[0]}({g[1]})" for g in data["top_groups"]) or "---"

    msg = (
        f"⚡ Live (остання година)\n"
        f"{'─' * 24}\n"
        f"Запитів: {data['requests']}\n"
        f"Юзерів: {data['unique_users']}\n"
        f"Групи: {groups_text}"
    )
    await update.message.reply_text(msg)


async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Platform breakdown."""
    if not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_platform_breakdown()
    if not data:
        await update.message.reply_text("Немає даних по платформах.")
        return

    lines = [f"  {d['platform']}: {d['count']} ({d['percent']}%)" for d in data]
    msg = f"📱 Платформи\n{'─' * 24}\n" + "\n".join(lines)
    await update.message.reply_text(msg)


async def cmd_hours(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Hourly activity chart for today."""
    if not _is_admin(update.effective_user.id):
        return

    data = await analytics.get_hourly_activity()
    if not data:
        await update.message.reply_text("Немає даних по годинах за сьогодні.")
        return

    max_req = max((d["requests"] for d in data), default=1) or 1
    lines = [
        f"{d['hour']} {_bar(d['requests'], max_req, 10)} {d['requests']}"
        for d in data
    ]
    msg = f"🕐 Активність по годинах\n{'─' * 28}\n" + "\n".join(lines)
    await update.message.reply_text(msg)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show available commands."""
    if not _is_admin(update.effective_user.id):
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
        "/help - Ця довідка"
    )
    await update.message.reply_text(msg)


async def _send_daily_report(bot: Bot) -> None:
    """Send daily summary to all admins."""
    data = await analytics.get_today_stats()
    user_data = await analytics.get_user_counts()

    groups_text = "\n".join(
        f"  {i+1}. {g[0]} - {g[1]} req"
        for i, g in enumerate(data["top_groups"])
    ) or "  Немає даних"

    msg = (
        f"📊 Щоденний звіт - {data['date']}\n"
        f"{'─' * 28}\n"
        f"Запитів сьогодні: {data['total_requests']}\n"
        f"Юзерів сьогодні: {data['unique_users']}\n"
        f"Всього юзерів: {user_data['total']}\n"
        f"{'─' * 28}\n"
        f"Топ групи:\n{groups_text}\n"
        f"{'─' * 28}\n"
        f"Автозвіт MyKep Analytics"
    )

    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(chat_id=admin_id, text=msg)
        except Exception as e:
            logger.warning(f"Failed to send daily report to {admin_id}: {e}")


async def _daily_report_scheduler(bot: Bot) -> None:
    """Background loop that sends daily reports at DAILY_REPORT_HOUR:DAILY_REPORT_MINUTE."""
    while True:
        now = datetime.now()
        target = now.replace(
            hour=DAILY_REPORT_HOUR,
            minute=DAILY_REPORT_MINUTE,
            second=0,
            microsecond=0
        )
        if now >= target:
            target += __import__("datetime").timedelta(days=1)

        wait_seconds = (target - now).total_seconds()
        logger.info(f"Daily report scheduled in {wait_seconds:.0f}s")
        await asyncio.sleep(wait_seconds)

        try:
            await _send_daily_report(bot)
        except Exception as e:
            logger.error(f"Daily report error: {e}")


async def start_bot(token: str) -> None:
    """Initialize and run the Telegram bot (polling mode)."""
    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_help))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("week", cmd_week))
    app.add_handler(CommandHandler("groups", cmd_groups))
    app.add_handler(CommandHandler("users", cmd_users))
    app.add_handler(CommandHandler("live", cmd_live))
    app.add_handler(CommandHandler("hours", cmd_hours))
    app.add_handler(CommandHandler("platforms", cmd_platforms))

    await app.initialize()
    await app.start()
    await app.updater.start_polling(drop_pending_updates=True)

    # Schedule daily reports
    asyncio.create_task(_daily_report_scheduler(app.bot))

    logger.info("Telegram bot started (polling).")

    # Keep alive
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        await app.updater.stop()
        await app.stop()
        await app.shutdown()
