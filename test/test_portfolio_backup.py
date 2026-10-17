import importlib.util
from pathlib import Path
import sqlite3

spec=importlib.util.spec_from_file_location('backup',Path(__file__).parents[1]/'scripts/backup_portfolios.py')
backup=importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def test_online_backup_includes_uncheckpointed_wal_and_restores(tmp_path):
    source=tmp_path/'live.sqlite'
    with sqlite3.connect(source) as writer:
        writer.execute('PRAGMA journal_mode=WAL')
        writer.execute('CREATE TABLE captures(value TEXT)')
        writer.execute("INSERT INTO captures VALUES ('100.10')")
        writer.commit()
        target=backup.backup_history(source,tmp_path/'copies')
        with sqlite3.connect(target) as restored:
            assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert restored.execute('SELECT value FROM captures').fetchall()==[('100.10',)]
    assert target.stat().st_mode & 0o777 == 0o600


def test_failed_backup_keeps_the_last_verified_copy(tmp_path):
    directory=tmp_path/'copies'
    directory.mkdir()
    target=directory/'history.sqlite'
    target.write_bytes(b'previous verified backup')
    try:
        backup.backup_history(tmp_path/'missing.sqlite',directory)
    except (OSError,sqlite3.Error): pass
    else: raise AssertionError('missing input must fail')
    assert target.read_bytes()==b'previous verified backup'
