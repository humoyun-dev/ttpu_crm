from django.core.management.base import BaseCommand
from django.utils import timezone

from authn.models import RevokedToken


class Command(BaseCommand):
    help = "Delete expired revoked tokens"

    def handle(self, *args, **options):
        deleted_count, _ = RevokedToken.objects.filter(expires_at__lt=timezone.now()).delete()
        self.stdout.write(f"Deleted {deleted_count} expired revoked tokens.")
