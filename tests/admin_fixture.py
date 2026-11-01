"""Local browser fixture with synthetic auth and isolated SQLite data."""
import json
import os
import socket
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def run():
    with tempfile.TemporaryDirectory(prefix='mykep-admin-test-') as directory:
        os.environ['MYKEP_DB_PATH'] = str(Path(directory) / 'test.sqlite')
        os.environ['TELEGRAM_BOT_TOKEN'] = '123456:synthetic-test-key'
        os.environ['ADMIN_COOKIE_SECURE'] = '0'
        os.environ['ADMIN_PUBLIC_ORIGIN'] = ''
        import main
        from schedule_service import DAYS
        fixture = {'ПІ-24-02': {day: [{'number': '1', 'subject': 'Test', 'teacher': 'Test',
                                     'cabinet': '101', 'week': '1-4'}] for day in DAYS}}
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]

            class ReadyServer(uvicorn.Server):
                async def startup(self, sockets=None):
                    await super().startup(sockets=sockets)
                    print(json.dumps({'port': port}), flush=True)

            config = uvicorn.Config(main.app, access_log=False, log_level='warning')
            with patch('schedule_service.fetch_schedule_sync', return_value=fixture), \
                 patch('teacher_hints.fetch_teachers_sync', return_value={'Test': 'Test Teacher'}):
                ReadyServer(config).run(sockets=[sock])


if __name__ == '__main__':
    run()
