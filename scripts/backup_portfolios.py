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
DEFAULT_DIR = Path.home() / "local-projects" / "ttw-backups" / "portfolios"
KEEP = 50
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


def prune(names: list[str], keep: int = KEEP) -> list[str]:
    """Which copies to delete: everything beyond the newest `keep`."""
    return sorted(names)[:-keep] if len(names) > keep else []


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
    if directory == DEFAULT_DIR:
        directory.parent.chmod(0o700)
        log_path = directory.parent / "backup.log"
        if log_path.exists():
            log_path.chmod(0o600)
    for path in directory.glob("*.json"):
        if path.is_file():
            path.chmod(0o600)


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
    assert prune([f"{i:03}" for i in range(52)]) == ["000", "001"]
    assert prune(["a", "b"]) == []
    with tempfile.TemporaryDirectory() as root:
        directory = Path(root) / "backups" / "portfolios"
        old_umask = os.umask(0)
        try:
            secure_runtime(directory)
            output = directory / "sample.json"
            private_atomic_write(output, '{"private":true}')
        finally:
            os.umask(old_umask)
        assert stat.S_IMODE(directory.stat().st_mode) == 0o700
        assert stat.S_IMODE(output.stat().st_mode) == 0o600
        assert not list(directory.glob(".tmp-*"))
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
