#!/usr/bin/env python3
"""Off-platform copy of the family portfolio book + drop tripwire.

Why: the book lives in one Cloudflare Durable Object. The worker now keeps a
revision ring and refuses undeclared shrinks, but both live on the same
platform behind the same token. This pulls the document hourly onto the
box, keeps only copies that changed, and pings Discord when a pull shows
fewer holdings than the last copy — a person deleting on purpose is rare
enough that every drop deserves a look.

    backup_portfolios.py --run        pull, dedupe, tripwire (cron)
    backup_portfolios.py --selftest   exercise the pure decisions
    backup_portfolios.py --list       show kept copies

Endpoint and token: TTW_SYNC_URL (default public worker) and TTW_SYNC_TOKEN
(or ~/.config/ttw/sync_token). Webhook for the ping: TTW_BACKUP_WEBHOOK
(or ~/.config/ttw/webhook). Stdlib only so cron needs no venv.
"""
from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import stat
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

DEFAULT_URL = "https://yf-proxy.2phakhvpgh.workers.dev/portfolios"
# Off the Intel. ~/local-projects rides the WSL root vhdx, which lives on C:,
# the QLC drive with the write budget; /mnt/wsl-storage is the Toshiba vdisk
# that exists for exactly this kind of churn (Jeff 2026-09-16). The volume is
# trivial either way -- ~136 KB/day -- so this is about not putting new writes
# on that drive by default, not about relieving pressure. TTW_BACKUP_DIR still
# wins, and the old path is read for copies written before the move.
DEFAULT_DIR = Path("/mnt/wsl-storage/ttw-backups/portfolios")
LEGACY_DIR = Path.home() / "local-projects" / "ttw-backups" / "portfolios"
# Copies are only written when the book actually changes and run ~34 KB each,
# so KEEP is a count that buys a wildly variable window: 50 bought 12 days at
# the 2026-09 edit rate. Retention is a TIME window now, with the count only a
# floor under it. 30 days because a wrong book gets reported long before then
# (Jeff 2026-09-16); the worker's own 30-revision ring is the restore source,
# these copies are the paper trail that says which revision to restore.
# The floor exists so a quiet stretch cannot empty the directory, and it must
# only ever keep MORE than the window, never fewer. At 10 it is a safety net
# under a slow month; at 50 it was the binding constraint against a 30-day
# window and would have quietly given a shorter retention than asked for.
KEEP = 10
KEEP_DAYS = 30
CHANGE_LOG = "changes.log"
log = logging.getLogger("ttw-backup")


# ── pure decisions ────────────────────────────────────────────────────────

def counts(doc: dict | None) -> dict:
    books = (doc or {}).get("portfolios") or []
    return {
        "portfolios": len(books),
        "holdings": sum(len(p.get("holdings") or []) for p in books),
    }


def should_write(prev_data: dict | None, new_data: dict | None) -> bool:
    """Only a changed document earns a new file. Sync meta (touched/deleted
    clocks) churns without the book changing, so compare the books alone."""
    return json.dumps((prev_data or {}).get("portfolios"), sort_keys=True) \
        != json.dumps((new_data or {}).get("portfolios"), sort_keys=True)


def drop_alert(prev_data: dict | None, new_data: dict | None) -> str:
    """Text of the ping when a pull lost something, else ''."""
    if prev_data is None:
        return ""
    a, b = counts(prev_data), counts(new_data)
    if b["portfolios"] < a["portfolios"]:
        return f"portfolios {a['portfolios']} → {b['portfolios']}"
    if b["holdings"] < a["holdings"]:
        return f"holdings {a['holdings']} → {b['holdings']}"
    return ""


def _holdings(doc: dict | None) -> dict:
    """{portfolio label: {symbol: shares}} — the shape a human reads."""
    out: dict[str, dict] = {}
    for book in (doc or {}).get("portfolios") or []:
        label = book.get("name") or book.get("id") or "?"
        rows: dict[str, float] = {}
        for h in book.get("holdings") or []:
            sym = h.get("symbol") or h.get("ticker") or "?"
            rows[sym] = h.get("shares") or h.get("qty") or 0
        out[label] = rows
    return out


def describe_change(prev_data: dict | None, new_data: dict | None) -> list[str]:
    """One line per added/removed/resized holding, and per added/removed book.

    The counts in the alert say something shrank; these say WHAT, so a restore
    does not start with diffing two 39 KB JSON files by hand.
    """
    if prev_data is None:
        return []
    before, after = _holdings(prev_data), _holdings(new_data)
    lines = []
    for label in sorted(set(before) | set(after)):
        if label not in after:
            lines.append(f"portfolio removed: {label} ({len(before[label])} holdings)")
            continue
        if label not in before:
            lines.append(f"portfolio added: {label} ({len(after[label])} holdings)")
            continue
        a, b = before[label], after[label]
        for sym in sorted(set(a) - set(b)):
            lines.append(f"{label}: removed {sym} ({a[sym]:g} shares)")
        for sym in sorted(set(b) - set(a)):
            lines.append(f"{label}: added {sym} ({b[sym]:g} shares)")
        for sym in sorted(set(a) & set(b)):
            if a[sym] != b[sym]:
                lines.append(f"{label}: {sym} {a[sym]:g} -> {b[sym]:g} shares")
    return lines


def _stamp_of(name: str) -> str:
    """The YYYYMMDD prefix of a copy's filename, or '' if it is not one."""
    return name[:8] if len(name) > 8 and name[:8].isdigit() else ""


def prune(names: list[str], keep: int = KEEP, keep_days: int = KEEP_DAYS,
          today: str | None = None) -> list[str]:
    """Which copies to delete: older than `keep_days`, but never the newest
    `keep`. The count is a floor so a quiet month cannot empty the directory,
    and the window is what actually decides -- a delete nobody noticed for a
    season is still restorable.
    """
    ordered = sorted(names)
    if len(ordered) <= keep:
        return []
    today = today or time.strftime("%Y%m%d", time.gmtime())
    cutoff = (datetime.datetime.strptime(today, "%Y%m%d")
              - datetime.timedelta(days=keep_days)).strftime("%Y%m%d")
    protected = set(ordered[-keep:])
    return [n for n in ordered
            if n not in protected and _stamp_of(n) and _stamp_of(n) < cutoff]


# ── io ────────────────────────────────────────────────────────────────────

def token() -> str:
    """TTW_SYNC_TOKEN, or the first line of ~/.config/ttw/sync_token. The
    cron line exports it from wherever the household keeps secrets."""
    env = os.environ.get("TTW_SYNC_TOKEN", "")
    if env:
        return env
    try:
        return (Path.home() / ".config" / "ttw" / "sync_token").read_text().strip().splitlines()[0]
    except (OSError, IndexError):
        return ""


def pull(url: str, bearer: str) -> tuple[int, dict | None]:
    req = Request(url, headers={"Authorization": f"Bearer {bearer}",
                                "Origin": "https://jeffbai996.github.io",
                                "X-TTW-Device-ID": "scheduled-backup-v1",
                                "User-Agent": "ttw-backup/1"})
    with urlopen(req, timeout=20) as resp:
        out = json.loads(resp.read().decode("utf-8"))
    if not out.get("ok"):
        raise RuntimeError(out.get("error") or "pull failed")
    return int(out.get("rev") or 0), out.get("data")


def webhook() -> str:
    hook = os.environ.get("TTW_BACKUP_WEBHOOK", "")
    if hook:
        return hook
    try:
        return (Path.home() / ".config" / "ttw" / "webhook").read_text().strip().splitlines()[0]
    except (OSError, IndexError):
        return ""


def alert(text: str) -> bool:
    """Post to Discord. The hook is either a webhook URL or, where the
    channel allows no webhooks, `bot <token> <channel_id>`."""
    hook = webhook()
    if not hook:
        return False
    body = json.dumps({"content": text[:1900]}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (ttw-backup, 1.0)"}
    if hook.startswith("bot "):
        _, bot_token, channel = hook.split()
        hook = f"https://discord.com/api/v10/channels/{channel}/messages"
        headers["Authorization"] = f"Bot {bot_token}"
    req = Request(hook, data=body, method="POST", headers=headers)
    try:
        with urlopen(req, timeout=15):
            return True
    except (URLError, OSError):
        return False


def latest(directory: Path) -> tuple[Path | None, dict | None]:
    files = sorted(directory.glob("*.json"))
    if not files:
        return None, None
    try:
        return files[-1], json.loads(files[-1].read_text()).get("data")
    except (OSError, ValueError):
        return files[-1], None


def secure_runtime(directory: Path) -> None:
    """Make private-state modes independent of the caller's ambient umask.

    Only the configured runtime path is touched; tracked source files and
    public assets are deliberately outside this boundary.
    """
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    if directory in (DEFAULT_DIR, LEGACY_DIR):
        directory.parent.chmod(0o700)
        log_path = directory.parent / "backup.log"
        if log_path.exists():
            log_path.chmod(0o600)
    for path in directory.glob("*.json"):
        if path.is_file():
            path.chmod(0o600)


def append_changes(directory: Path, stamp: str, rev: int, lines: list[str]) -> None:
    """Append this pull's changes to changes.log, 0600 like the copies.

    It names symbols and share counts, so it is as sensitive as the books and
    is created with the same mode rather than whatever umask happens to be.
    """
    if not lines:
        return
    path = directory / CHANGE_LOG
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        with os.fdopen(fd, "a", encoding="utf-8") as handle:
            for line in lines:
                handle.write(f"{stamp} rev{rev} {line}\n")
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        # A pre-existing log from a looser umask is tightened on every append.
        try:
            path.chmod(0o600)
        except OSError:
            pass


def private_atomic_write(path: Path, text: str) -> None:
    """Create mode-0600 bytes before rename; never expose a permissive temp."""
    fd, temporary = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    tmp = Path(temporary)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            fd = -1
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        path.chmod(0o600)
    finally:
        if fd >= 0:
            os.close(fd)
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def run(url: str, directory: Path) -> int:
    secure_runtime(directory)
    bearer = token()
    if not bearer:
        log.error("no sync token")
        return 2
    try:
        rev, data = pull(url, bearer)
    except (URLError, OSError, ValueError, RuntimeError) as exc:
        log.error("pull failed: %s", exc)
        alert(f"⚠️ ttw portfolio backup: pull failed — {exc}")
        return 1
    prev_path, prev = latest(directory)
    drop = drop_alert(prev, data)
    if drop:
        msg = (f"🚨 family portfolio book shrank between backups: {drop} "
               f"(rev {rev}, last copy {prev_path.name if prev_path else '-'}). "
               f"Restore: worker /portfolios/history → /portfolios/restore.")
        log.warning(msg)
        alert(msg)
    if should_write(prev, data):
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        path = directory / f"{stamp}-rev{rev}.json"
        # Append BEFORE the copy lands: if the write fails, the log still says
        # what the pull saw, and a log line with no copy is a louder signal
        # than a copy with no explanation.
        append_changes(directory, stamp, rev, describe_change(prev, data))
        private_atomic_write(
            path,
            json.dumps({"rev": rev, "pulled": stamp, "counts": counts(data), "data": data},
                       ensure_ascii=False, indent=1),
        )
        log.info("wrote %s %s", path.name, counts(data))
        for name in prune([p.name for p in directory.glob("*.json")]):
            (directory / name).unlink()
    else:
        log.info("unchanged at rev %s %s", rev, counts(data))
    return 0


def selftest() -> int:
    book = lambda n, h: {"portfolios": [{"id": f"p{i}", "holdings": [{}] * h} for i in range(n)]}
    assert counts(None) == {"portfolios": 0, "holdings": 0}
    assert counts(book(2, 3)) == {"portfolios": 2, "holdings": 6}
    assert should_write(None, book(1, 1))
    assert not should_write(book(1, 1), book(1, 1))
    assert should_write(book(1, 1), book(1, 2))
    assert drop_alert(None, book(0, 0)) == ""
    assert drop_alert(book(2, 3), book(2, 3)) == ""
    assert drop_alert(book(2, 3), book(1, 3)) == "portfolios 2 → 1"
    assert drop_alert(book(1, 5), book(1, 4)) == "holdings 5 → 4"
    assert drop_alert(book(1, 5), None) == "portfolios 1 → 0"
    # Retention is a window with a count as its floor. Names that are not
    # stamped copies are never proposed for deletion.
    stamped = lambda day, n: f"2026{day:04}T120000Z-rev{n}.json"
    old = [stamped(101 + i, i) for i in range(28)]           # 2026-01-01 onward
    # Everything is far outside a 30-day window, so only the floor survives.
    assert len(old) - len(prune(old, today="20260901")) == KEEP
    assert prune(old, today="20260102") == []                # inside the window
    assert prune([f"{i:03}" for i in range(52)]) == []       # unstamped: untouched
    assert prune(["a", "b"]) == []

    # The window decides; the floor only ever keeps MORE. With a copy a day for
    # 40 days, a 30-day window keeps ~30 -- comfortably above the floor, and the
    # floor must not drag that number down.
    daily = [stamped(801 + i, i) for i in range(28)]         # 2026-08-01..08-28
    kept = sorted(set(daily) - set(prune(daily, today="20260820")))
    assert len(kept) > KEEP and kept[0][:8] >= "20260721", kept[:3]
    # A short window never keeps fewer than the floor.
    assert len(daily) - len(prune(daily, keep_days=1, today="20261231")) == KEEP

    # describe_change names the holding, which is the whole point of the log.
    one = {"portfolios": [{"id": "p1", "name": "Gordon", "holdings": [
        {"symbol": "AAPL", "shares": 10}, {"symbol": "MSFT", "shares": 5}]}]}
    gone = {"portfolios": [{"id": "p1", "name": "Gordon", "holdings": [
        {"symbol": "AAPL", "shares": 10}]}]}
    grew = {"portfolios": [{"id": "p1", "name": "Gordon", "holdings": [
        {"symbol": "AAPL", "shares": 12}, {"symbol": "MSFT", "shares": 5}]}]}
    assert describe_change(None, one) == []
    assert describe_change(one, one) == []
    assert describe_change(one, gone) == ["Gordon: removed MSFT (5 shares)"]
    assert describe_change(gone, one) == ["Gordon: added MSFT (5 shares)"]
    assert describe_change(one, grew) == ["Gordon: AAPL 10 -> 12 shares"]
    assert describe_change(one, {"portfolios": []}) == ["portfolio removed: Gordon (2 holdings)"]
    with tempfile.TemporaryDirectory() as root:
        directory = Path(root) / "backups" / "portfolios"
        old_umask = os.umask(0)
        try:
            secure_runtime(directory)
            output = directory / "sample.json"
            private_atomic_write(output, '{"private":true}')
            # Written under umask 0 on purpose: the log must get 0600 from the
            # open mode, not from a umask that happens to be tight.
            append_changes(directory, "20260916T120000Z", 9,
                           ["Gordon: removed MSFT (5 shares)"])
            append_changes(directory, "20260916T130000Z", 10, [])
        finally:
            os.umask(old_umask)
        assert stat.S_IMODE(directory.stat().st_mode) == 0o700
        assert stat.S_IMODE(output.stat().st_mode) == 0o600
        assert not list(directory.glob(".tmp-*"))
        changes = directory / CHANGE_LOG
        assert stat.S_IMODE(changes.stat().st_mode) == 0o600
        # The empty append wrote nothing; one change is one line.
        assert changes.read_text().splitlines() == [
            "20260916T120000Z rev9 Gordon: removed MSFT (5 shares)"]
        # The log is not a copy and must survive pruning.
        assert prune([p.name for p in directory.glob("*.json")], today="20270101") == []
    print("selftest ok")
    return 0


def main(argv: list[str] | None = None) -> int:
    os.umask(0o077)
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.selftest:
        return selftest()
    if args.list:
        for p in sorted(args.dir.glob("*.json")):
            print(p.name)
        return 0
    if args.run:
        return run(os.environ.get("TTW_SYNC_URL", DEFAULT_URL), args.dir)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
