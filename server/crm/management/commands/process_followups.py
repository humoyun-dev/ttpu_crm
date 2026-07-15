import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from crm.models import FollowUp
from crm.telegram import send_message, student_chat_id

logger = logging.getLogger(__name__)


# Bosqichga mos savol matni.
Q_CONTACT = {
    "uz": "Ish beruvchi siz bilan bog'landimi (aloqaga chiqdimi)?",
    "ru": "Связался ли с вами работодатель?",
}
Q_INTERVIEW = {
    "uz": "Suhbat (intervyu) bo'lib o'tdimi?",
    "ru": "Состоялось ли собеседование?",
}
BTN_YES = {"uz": "✅ Ha", "ru": "✅ Да"}
BTN_NO = {"uz": "❌ Yo'q", "ru": "❌ Нет"}

# Telegram yuborish xato bo'lsa — qisqa backoff bilan qayta uriniladi
# (har 60 soniyada emas).
SEND_RETRY_BACKOFF = timedelta(minutes=30)
# Talabada telegram id bo'lmasa — ancha keyinroq qayta tekshiramiz
# (ro'yxatdan o'tsa, savol yetib boradi).
NO_CHAT_RETRY_BACKOFF = timedelta(hours=24)


def _question(stage: str, lang: str) -> str:
    table = Q_INTERVIEW if stage == FollowUp.Stage.INTERVIEWED else Q_CONTACT
    return table.get(lang, table["uz"])


def _keyboard(followup_id, lang: str) -> dict:
    return {
        "inline_keyboard": [[
            {"text": BTN_YES.get(lang, BTN_YES["uz"]), "callback_data": f"followup:{followup_id}:yes"},
            {"text": BTN_NO.get(lang, BTN_NO["uz"]), "callback_data": f"followup:{followup_id}:no"},
        ]]
    }


class Command(BaseCommand):
    help = "Muddati yetgan follow-up savollarini inline tugmalar bilan Telegram'ga yuboradi."

    def handle(self, *args, **options):
        now = timezone.now()
        sent = 0
        total = 0

        # select_for_update(skip_locked=True): parallel/ustma-ust ishga tushgan
        # sikl xuddi shu qatorlarni qayta yubormaydi — band qatorlar o'tkaziladi.
        with transaction.atomic():
            due = (
                FollowUp.objects
                # Faqat FollowUp qatorlari qulflanadi (join'dagi student emas).
                .select_for_update(skip_locked=True, of=("self",))
                .filter(
                    next_send_at__isnull=False,
                    next_send_at__lte=now,
                    stage__in=[
                        FollowUp.Stage.PENDING,
                        FollowUp.Stage.CONTACTED,
                        FollowUp.Stage.INTERVIEWED,
                    ],
                    flagged_for_staff=False,
                )
                .select_related("lead_student__student")
            )

            for fu in due:
                total += 1
                student = fu.lead_student.student
                chat_id = student_chat_id(student)
                if not chat_id:
                    # Telegram id yo'q — har siklda qayta tanlamaslik uchun keyinroqqa suramiz.
                    fu.next_send_at = now + NO_CHAT_RETRY_BACKOFF
                    fu.save(update_fields=["next_send_at", "updated_at"])
                    logger.debug("FollowUp %s: talabada telegram id yo'q; keyinroq qayta uriniladi.", fu.id)
                    continue

                lang = getattr(student, "language", "uz") or "uz"
                text = _question(fu.stage, lang)
                if send_message(chat_id, text, reply_markup=_keyboard(fu.id, lang)):
                    # Savol yuborildi — talaba javob berguncha qayta yubormaymiz.
                    # Keyingi yuborishni record_answer (javob kelganda) rejalashtiradi.
                    fu.next_send_at = None
                    sent += 1
                else:
                    # Yuborilmadi — qisqa backoff bilan qayta uriniladi (spam emas).
                    fu.next_send_at = now + SEND_RETRY_BACKOFF
                fu.save(update_fields=["next_send_at", "updated_at"])

        self.stdout.write(f"process_followups: {sent} messages sent (of {total} due).")
