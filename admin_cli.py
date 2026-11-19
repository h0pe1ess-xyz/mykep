"""Revoke all admin sessions from the server shell.

    .venv/bin/python admin_cli.py revoke-all
"""
import asyncio
import sys

import admin_auth
from database import connect


async def main(argv):
    if argv[1:] != ['revoke-all']:
        print(__doc__)
        return 2
    await admin_auth.init_admin_db()
    async with connect() as db:
        cur = await db.execute('DELETE FROM admin_sessions')
        await db.commit()
    print(f'Revoked {cur.rowcount} admin sessions.')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main(sys.argv)))
