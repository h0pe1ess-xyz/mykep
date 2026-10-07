"""Break-glass admin login from the server shell (e.g. if Telegram login is
misconfigured). Prints a one-time code valid for 3 minutes.

    .venv/bin/python admin_cli.py code 1125085502
    .venv/bin/python admin_cli.py revoke-all
"""
import asyncio
import sys

import admin_auth
from config import ADMIN_IDS
from database import connect


async def main(argv):
    await admin_auth.init_admin_db()
    if len(argv) == 3 and argv[1] == 'code':
        user_id = int(argv[2])
        if user_id not in ADMIN_IDS:
            sys.exit(f'{user_id} is not in the admin allowlist')
        code, ttl = await admin_auth.create_login_code_for_cli(user_id)
        await admin_auth.audit('login_code_created', user_id, 'cli', 'server shell')
        print(f'One-time login code: {code} (valid {ttl // 60} min). Enter it at /admin -> "Увійти одноразовим кодом".')
    elif len(argv) == 2 and argv[1] == 'revoke-all':
        async with connect() as db:
            cur = await db.execute('DELETE FROM admin_sessions')
            await db.commit()
        print(f'Revoked {cur.rowcount} admin sessions.')
    else:
        print(__doc__)


if __name__ == '__main__':
    asyncio.run(main(sys.argv))
