from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_datetime


def parse_iso_datetime(value: str):
    dt = parse_datetime(value)
    if dt is None:
        try:
            dt = datetime.fromisoformat(value)
        except Exception:
            return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=timezone.utc)
    return dt
