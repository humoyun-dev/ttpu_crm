from __future__ import annotations

import hashlib
import os
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path

try:
    import fcntl  # type: ignore
except Exception:  # pragma: no cover
    fcntl = None  # type: ignore


@dataclass(frozen=True)
class SingleInstanceLock:
    """Best-effort single-instance lock (per bot token).

    This prevents starting multiple pollers for the same token on the same host,
    which would otherwise cause TelegramConflictError (multiple getUpdates).

    Note: this does not coordinate across multiple machines/containers.
    """

    lock_path: Path
    fd: int

    @classmethod
    def acquire_for_token(cls, token: str, *, name: str) -> "SingleInstanceLock":
        if not token:
            raise RuntimeError("BOT_TOKEN is empty; cannot start bot.")

        if fcntl is None:
            # Non-POSIX environment (e.g., Windows). Run without a lock.
            return cls(lock_path=Path("/dev/null"), fd=-1)

        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
        lock_path = Path("/tmp") / f"{name}-{digest}.lock"

        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise RuntimeError(
                f"Another instance is already running (lock file: {lock_path}). "
                "Stop the other process/container and try again."
            )

        os.ftruncate(fd, 0)
        os.write(fd, str(os.getpid()).encode("utf-8"))
        return cls(lock_path=lock_path, fd=fd)

    def release(self) -> None:
        if self.fd == -1 or fcntl is None:
            return

        with suppress(Exception):
            fcntl.flock(self.fd, fcntl.LOCK_UN)
        with suppress(Exception):
            os.close(self.fd)
        with suppress(FileNotFoundError):
            self.lock_path.unlink()
