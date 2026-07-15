import hashlib
from django.conf import settings
from .models import VacancyChannelPost


def enqueue_channel_post(vacancy, action: str):
    if not getattr(settings, "VACANCY_CHANNEL_ID", ""):
        return None

    fingerprint = f"{vacancy.id}:{action}:{vacancy.updated_at.isoformat()}"
    idem_key = hashlib.sha256(fingerprint.encode()).hexdigest()[:64]

    post, _ = VacancyChannelPost.objects.get_or_create(
        idempotency_key=idem_key,
        defaults={
            "vacancy": vacancy,
            "action": action,
            "channel_id": settings.VACANCY_CHANNEL_ID,
            "status": VacancyChannelPost.Status.PENDING,
        },
    )
    return post
