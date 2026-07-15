import httpx
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from vacancies.models import Vacancy, VacancyChannelPost
from vacancies import telegram

MAX_ATTEMPTS = 5
BATCH_SIZE = 50

# Yuborish jarayonidagi qatorlar uchun oraliq holat (in-flight marker).
# Ataylab Status.choices dan tashqarida — PENDING filtriga tushmaydi, shuning
# uchun parallel yoki keyingi sikl bu qatorni qayta ola olmaydi. Jarayon
# Telegram'ga yuborish o'rtasida yiqilsa, qator "sending" da qolib ketadi va
# avtomatik qayta yuborilMAYDI (dublikat post xavfidan ko'ra xavfsizroq) —
# bunday qatorni admin qo'lda PENDING ga qaytarishi kerak.
STATUS_SENDING = "sending"


class Command(BaseCommand):
    help = "Pending vakansiyalarni Telegram kanalga joylaydi (outbox drainer)"

    def handle(self, *args, **options):
        claimed_ids = self._claim_batch()

        # Claim'dan KEYIN qayta o'qiymiz — attempts ham yangilangan bo'ladi.
        posts = (
            VacancyChannelPost.objects
            .filter(id__in=claimed_ids)
            .select_related("vacancy", "vacancy__region")
            .order_by("created_at")
        )

        sent = failed = skipped = 0
        for post in posts:
            try:
                self._process(post)
                post.status     = VacancyChannelPost.Status.SENT
                post.sent_at    = timezone.now()
                post.last_error = ""
                sent += 1
            except httpx.TransportError as exc:
                # Ambivalent transport xatosi (timeout/connect): Telegram xabarni
                # yetkazgan BO'LISHI mumkin. PENDING ga qaytarib qayta yuborsak,
                # dublikat post paydo bo'ladi. Shuning uchun qatorni "sending" da
                # qoldiramiz (last_error bilan) — admin qo'lda ko'rib, kerak bo'lsa
                # PENDING ga qaytaradi. Auto-retry qilinmaydi.
                post.status     = STATUS_SENDING
                post.last_error = f"transport: {exc}"
                failed += 1
                self.stderr.write(f"Ambivalent transport xatosi (post={post.id}), 'sending' da qoldirildi: {exc}")
            except Exception as exc:
                err = str(exc)
                if "message is not modified" in err:
                    post.status     = VacancyChannelPost.Status.SKIPPED
                    post.last_error = err
                    skipped += 1
                else:
                    # Aniq rad (masalan Telegram ok=false → RuntimeError): xabar
                    # ANIQ yetkazilmagan, xavfsiz qayta urinish. Limitgacha PENDING,
                    # limit tugasa FAILED.
                    if post.attempts < MAX_ATTEMPTS:
                        post.status = VacancyChannelPost.Status.PENDING
                    else:
                        post.status = VacancyChannelPost.Status.FAILED
                    post.last_error = err
                    failed += 1
                    self.stderr.write(f"Xatolik (post={post.id}): {exc}")
            post.save()

        self.stdout.write(self.style.SUCCESS(
            f"Yuborildi: {sent}, O'tkazildi: {skipped}, Xatolik: {failed}"
        ))

    @staticmethod
    def _claim_batch():
        """Pending qatorlarni tranzaksiya ichida band qiladi (claim).

        select_for_update(skip_locked=True) parallel ishga tushgan sikl (masalan,
        run_scheduler bilan bir vaqtdagi qo'lda ishga tushirish) xuddi shu
        qatorlarni olishining oldini oladi; Telegram'ga yuborishdan OLDIN
        holat "sending" qilib commit qilinadi, shunda jarayon yiqilsa ham
        qator PENDING bo'lib qolmaydi va qayta yuborilmaydi.
        """
        with transaction.atomic():
            ids = list(
                VacancyChannelPost.objects
                .select_for_update(skip_locked=True)
                .filter(status=VacancyChannelPost.Status.PENDING)
                .filter(attempts__lt=MAX_ATTEMPTS)
                .order_by("created_at")
                .values_list("id", flat=True)[:BATCH_SIZE]
            )
            if ids:
                VacancyChannelPost.objects.filter(id__in=ids).update(
                    status=STATUS_SENDING,
                    attempts=F("attempts") + 1,
                )
        return ids

    def _process(self, post: VacancyChannelPost):
        vacancy   = post.vacancy
        text      = telegram.render_vacancy_html(vacancy)
        image_path = vacancy.image.path if vacancy.image else None

        if post.action == VacancyChannelPost.Action.CREATE:
            msg_id, media_type = telegram.post_vacancy_with_media(
                post.channel_id, text, image_path
            )
            post.telegram_message_id = msg_id
            post.media_type          = media_type

        elif post.action == VacancyChannelPost.Action.EDIT:
            msg_id = self._latest_message_id(vacancy)
            if not msg_id:
                raise RuntimeError("Tahrirlash uchun message_id topilmadi")
            create_post = self._latest_create_post(vacancy)
            media_type  = create_post.media_type if create_post else VacancyChannelPost.MediaType.TEXT
            telegram.edit_vacancy(post.channel_id, msg_id, text, media_type)
            post.telegram_message_id = msg_id

        elif post.action == VacancyChannelPost.Action.DELETE:
            msg_id = self._latest_message_id(vacancy)
            if msg_id:
                telegram.delete_vacancy(post.channel_id, msg_id)
            post.telegram_message_id = msg_id

    @staticmethod
    def _latest_message_id(vacancy: Vacancy):
        last = (
            vacancy.channel_posts
            .filter(
                action=VacancyChannelPost.Action.CREATE,
                status=VacancyChannelPost.Status.SENT,
                telegram_message_id__isnull=False,
            )
            .order_by("-sent_at")
            .first()
        )
        return last.telegram_message_id if last else None

    @staticmethod
    def _latest_create_post(vacancy: Vacancy):
        return (
            vacancy.channel_posts
            .filter(
                action=VacancyChannelPost.Action.CREATE,
                status=VacancyChannelPost.Status.SENT,
            )
            .order_by("-sent_at")
            .first()
        )
