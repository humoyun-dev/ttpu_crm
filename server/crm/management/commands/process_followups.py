import logging

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from crm.models import FollowUp

logger = logging.getLogger(__name__)

BOT_TOKEN = getattr(settings, "TELEGRAM_BOT_TOKEN", "")


def _send_telegram(chat_id: int, text: str) -> bool:
    if not BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set; skipping follow-up send.")
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        r = httpx.post(url, json={"chat_id": chat_id, "text": text}, timeout=10)
        r.raise_for_status()
        return True
    except Exception:
        logger.exception("Failed to send follow-up to chat_id=%s", chat_id)
        return False


QUESTION_TEXT = {
    "uz": "Siz ish taklifi bo'yicha suhbatga chiqildingizmi? (ha/yo'q)",
    "ru": "Вы прошли собеседование по предложению о работе? (да/нет)",
}


class Command(BaseCommand):
    help = "Send pending follow-up messages to students via Telegram."

    def handle(self, *args, **options):
        now = timezone.now()
        due = FollowUp.objects.filter(
            next_send_at__lte=now,
            stage__in=[
                FollowUp.Stage.PENDING,
                FollowUp.Stage.CONTACTED,
                FollowUp.Stage.INTERVIEWED,
            ],
            flagged_for_staff=False,
        ).select_related("lead_student__student")

        sent = 0
        for fu in due:
            student = fu.lead_student.student
            tg_id = student.telegram_user_id
            if not tg_id:
                logger.debug("Student %s has no telegram_user_id; skipping.", student.id)
                continue

            lang = getattr(student, "language", "uz")
            text = QUESTION_TEXT.get(lang, QUESTION_TEXT["uz"])
            if _send_telegram(tg_id, text):
                sent += 1

        self.stdout.write(f"process_followups: {sent} messages sent (of {due.count()} due).")
