from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from audit.models import AuditLog


class Command(BaseCommand):
    help = "Delete audit log entries older than the retention window (default 365 days)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=365,
            help="Delete audit logs older than this many days (default: 365).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        cutoff = timezone.now() - timedelta(days=days)
        deleted_count, _ = AuditLog.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Deleted {deleted_count} audit log entries older than {days} days.")
