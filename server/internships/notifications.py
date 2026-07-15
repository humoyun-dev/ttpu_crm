"""Amaliyot arizasi natijasini talabaga Telegram orqali yetkazish.

Follow-up/lead xabarlari bilan bir xil transport (`crm.telegram`) ishlatiladi —
bot xizmatiga bog'liqlik yo'q.
"""
import logging

from crm.telegram import send_message, student_chat_id

from .models import InternshipRequest

logger = logging.getLogger(__name__)


def notify_result(req: InternshipRequest) -> bool:
    """Tasdiqlangan/rad etilgan ariza haqida talabaga xabar yuboradi.

    Xatolikda False qaytaradi (send_message loglaydi, exception otmaydi).
    """
    student = req.student
    chat_id = student_chat_id(student)
    if not chat_id:
        return False

    lang = (getattr(student, "language", "") or "uz").lower()

    if req.status == InternshipRequest.Status.APPROVED:
        if lang == "ru":
            text = f"🎉 Ваша заявка на стажировку одобрена! Компания: {req.company_name}"
        else:
            text = f"🎉 Amaliyot arizangiz tasdiqlandi! Kompaniya: {req.company_name}"
    elif req.status == InternshipRequest.Status.REJECTED:
        reason = (req.staff_comment or "").strip()
        if lang == "ru":
            text = (
                f"Ваша заявка на стажировку отклонена. Причина: {reason}"
                if reason
                else "К сожалению, ваша заявка на стажировку отклонена."
            )
        else:
            text = (
                f"Amaliyot arizangiz rad etildi. Sabab: {reason}"
                if reason
                else "Afsuski, amaliyot arizangiz rad etildi."
            )
    else:
        # Terminal bo'lmagan status uchun xabar yubormaymiz (himoya qatlami —
        # serializer buni allaqachon bloklaydi, lekin bu yerda ham no-op qilamiz).
        logger.warning("notify_result: terminal bo'lmagan status=%s (req=%s)", req.status, req.id)
        return False

    return send_message(chat_id, text)
