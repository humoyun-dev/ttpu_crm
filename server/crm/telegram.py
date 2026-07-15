"""Backend → Telegram yetkazish (follow-up savollari + lead xabarlari).

Bot xizmatiga bog'liqlik yo'q — to'g'ridan-to'g'ri Telegram Bot API.
Token `settings.TELEGRAM_BOT_TOKEN` dan olinadi.
"""
import logging

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT = 10.0


def _token() -> str:
    return getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""


def send_message(chat_id, text: str, reply_markup: dict | None = None) -> bool:
    """Telegram'ga xabar yuboradi. Xatolikda False (loglaydi, exception otmaydi)."""
    token = _token()
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN o'rnatilmagan; chat_id=%s ga yubormaymiz", chat_id)
        return False

    payload: dict = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup

    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return True
    except Exception:
        logger.exception("Telegram yuborish xatosi chat_id=%s", chat_id)
        return False


def student_chat_id(student):
    """Talabaning Telegram chat id'sini topadi (avval student, keyin linked account)."""
    if getattr(student, "telegram_user_id", None):
        return student.telegram_user_id
    if hasattr(student, "accounts"):
        # Faqat faol akkaunt — /logout qilganlarga xabar yubormaymiz.
        acc = student.accounts.filter(is_active=True).first()
        if acc:
            return acc.telegram_user_id
    return None
