"""Bot unit tests run without contacting Telegram when python-telegram-bot is installed."""
import asyncio
import importlib.util
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

AVAILABLE = importlib.util.find_spec('telegram') is not None


@unittest.skipUnless(AVAILABLE, 'python-telegram-bot unavailable in this environment')
class BotLifecycle(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_stops_report_polling_application(self):
        import bot
        task = asyncio.create_task(asyncio.sleep(3600))
        app = SimpleNamespace(updater=SimpleNamespace(running=True, stop=AsyncMock()),
            running=True, stop=AsyncMock(), shutdown=AsyncMock())
        await bot._cleanup(app, task)
        self.assertTrue(task.cancelled())
        app.updater.stop.assert_awaited_once()
        app.stop.assert_awaited_once()
        app.shutdown.assert_awaited_once()

    async def test_cleanup_continues_after_stop_error(self):
        import bot
        app = SimpleNamespace(updater=SimpleNamespace(running=True, stop=AsyncMock(side_effect=RuntimeError())),
            running=True, stop=AsyncMock(), shutdown=AsyncMock())
        await bot._cleanup(app, None)
        app.shutdown.assert_awaited_once()

    async def test_non_admin_gets_no_statistics(self):
        import bot
        message = SimpleNamespace(reply_text=AsyncMock())
        update = SimpleNamespace(effective_user=SimpleNamespace(id=-1), effective_message=message)
        with patch.object(bot.analytics, 'get_today_stats', new_callable=AsyncMock) as stats:
            await bot.cmd_stats(update, None)
            stats.assert_not_awaited()
        message.reply_text.assert_not_awaited()

    async def test_no_duplicate_daily_report_for_delivered_admin(self):
        import bot
        client = SimpleNamespace(send_message=AsyncMock())
        with patch.object(bot, 'ADMIN_IDS', {1, 2}), \
             patch.object(bot.analytics, 'get_today_stats', new_callable=AsyncMock, return_value={'date':'2026-09-13','total_requests':2,'unique_users':1,'top_groups':[]}), \
             patch.object(bot.analytics, 'get_user_counts', new_callable=AsyncMock, return_value={'total':1}), \
             patch.object(bot.analytics, 'report_sent', new_callable=AsyncMock, side_effect=lambda day, admin: admin == 1), \
             patch.object(bot.analytics, 'mark_report_sent', new_callable=AsyncMock) as marked:
            await bot._send_daily_report(client)
            client.send_message.assert_awaited_once()
            self.assertEqual(client.send_message.call_args.kwargs['chat_id'],2)
            marked.assert_awaited_once_with('2026-09-13',2)
