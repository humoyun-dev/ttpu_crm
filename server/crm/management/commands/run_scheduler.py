import time
import logging

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Long-lived scheduler: runs followups + pending vacancy posts every INTERVAL seconds."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=int, default=60)

    def handle(self, *args, **opts):
        interval = opts["interval"]
        # RevokedToken GC (cleanup_tokens) har siklda emas — taxminan soatiga bir marta.
        gc_every = max(1, 3600 // max(interval, 1))
        cycle = 0
        self.stdout.write(self.style.SUCCESS(f"Scheduler started (interval={interval}s)"))
        while True:
            # Drop connections older than CONN_MAX_AGE / any that went stale while
            # the process was idle, so each cycle starts with a healthy connection.
            close_old_connections()
            cmds = ["process_followups", "post_pending_vacancies"]
            if cycle % gc_every == 0:
                cmds.append("cleanup_tokens")
            for cmd in cmds:
                try:
                    call_command(cmd)
                except Exception:
                    logger.exception("[scheduler] %s failed", cmd)
            close_old_connections()
            cycle += 1
            time.sleep(interval)
