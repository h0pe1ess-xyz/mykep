"""WAL-safe SQLite backup and isolated restore verification. Never restore live data."""
import argparse
import hashlib
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


def verify_database(path: Path) -> str:
    with closing(sqlite3.connect(f'{path.resolve().as_uri()}?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity check failed')
        digest = hashlib.sha256()
        for line in db.iterdump():
            digest.update(line.encode('utf-8'))
        return digest.hexdigest()


def backup_database(source: Path, destination: Path) -> Path:
    source, destination = source.resolve(), destination.resolve()
    if source == destination or destination.exists():
        raise ValueError('Backup destination must be a new file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as live:
        with closing(sqlite3.connect(destination)) as backup:
            live.backup(backup)
    digest = verify_database(destination)
    with tempfile.TemporaryDirectory(prefix='mykep-restore-') as directory:
        restored = Path(directory) / 'restored.sqlite'
        with closing(sqlite3.connect(destination)) as backup, closing(sqlite3.connect(restored)) as target:
            backup.backup(target)
        if verify_database(restored) != digest:
            raise RuntimeError('Restored database differs from backup')
    return destination


def migration_backup(source: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    return backup_database(source, source.parent / 'backups' / f'{source.stem}-{stamp}.sqlite')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    backup_database(args.source, args.destination)
    print('Backup integrity and isolated restore verified')
