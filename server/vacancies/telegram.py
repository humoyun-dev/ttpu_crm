import logging
import re
from html.parser import HTMLParser
import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}/{method}"
TIMEOUT  = 20.0
PHOTO_TIMEOUT = 30.0
CAPTION_LIMIT = 1024  # Telegram caption max length


# ── HTML → Telegram converter ──────────────────────────────────────────────

class _TelegramConverter(HTMLParser):
    """Converts Tiptap HTML to Telegram-compatible HTML (b/i/a only)."""

    def __init__(self):
        super().__init__()
        self._out: list[str] = []
        self._li_counter = 0
        self._list_stack: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "strong":
            self._out.append("<b>")
        elif tag == "em":
            self._out.append("<i>")
        elif tag == "ul":
            self._list_stack.append("ul")
        elif tag == "ol":
            self._list_stack.append("ol")
            self._li_counter = 0
        elif tag == "li":
            if self._list_stack and self._list_stack[-1] == "ol":
                self._li_counter += 1
                self._out.append(f"{self._li_counter}. ")
            else:
                self._out.append("• ")
        elif tag == "a":
            href = dict(attrs).get("href", "")
            self._out.append(f'<a href="{href}">')

    def handle_endtag(self, tag):
        if tag == "strong":
            self._out.append("</b>")
        elif tag == "em":
            self._out.append("</i>")
        elif tag in ("p", "li", "br"):
            text = "".join(self._out).rstrip()
            self._out = [text, "\n"]
        elif tag in ("ul", "ol"):
            if self._list_stack:
                self._list_stack.pop()
        elif tag == "a":
            self._out.append("</a>")

    def handle_data(self, data):
        # Re-escape for Telegram HTML (HTMLParser gives us raw chars)
        self._out.append(data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    def result(self) -> str:
        text = "".join(self._out).strip()
        return re.sub(r"\n{3,}", "\n\n", text)


def _html_to_telegram(text: str) -> str:
    """Converts Tiptap HTML to Telegram HTML. Falls back for plain text."""
    if not text:
        return ""
    if "<" not in text:
        return _bullet(_esc(text))
    converter = _TelegramConverter()
    converter.feed(text)
    return converter.result().strip()


# ── Telegram API calls ─────────────────────────────────────────────────────

def _call(method: str, payload: dict) -> dict:
    url = API_BASE.format(token=settings.TELEGRAM_BOT_TOKEN, method=method)
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.post(url, json=payload)
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} xatolik: {data.get('description')}")
    return data["result"]


def _send_text(channel_id: str, text: str) -> int:
    result = _call("sendMessage", {
        "chat_id": channel_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "link_preview_options": {"is_disabled": True},
    })
    return result["message_id"]


def _send_photo(channel_id: str, image_path: str, caption: str) -> int:
    url = API_BASE.format(token=settings.TELEGRAM_BOT_TOKEN, method="sendPhoto")
    with open(image_path, "rb") as f:
        with httpx.Client(timeout=PHOTO_TIMEOUT) as client:
            resp = client.post(url, data={
                "chat_id": channel_id,
                "caption": caption[:CAPTION_LIMIT],
                "parse_mode": "HTML",
            }, files={"photo": f})
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram sendPhoto xatolik: {data.get('description')}")
    return data["result"]["message_id"]


def post_vacancy(channel_id: str, text: str) -> int:
    """Text-only post (backward compat)."""
    return _send_text(channel_id, text)


def post_vacancy_with_media(channel_id: str, text: str, image_path: str | None = None) -> tuple[int, str]:
    """
    Returns (message_id, media_type).
    media_type is 'photo' or 'text' — stored in VacancyChannelPost for edit/delete.
    """
    if image_path:
        try:
            msg_id = _send_photo(channel_id, image_path, text)
            return msg_id, "photo"
        except Exception as exc:
            logger.warning("sendPhoto failed (%s), falling back to text post", exc)
    return _send_text(channel_id, text), "text"


def edit_vacancy(channel_id: str, message_id: int, text: str, media_type: str = "text") -> None:
    if media_type == "photo":
        _call("editMessageCaption", {
            "chat_id": channel_id,
            "message_id": message_id,
            "caption": text[:CAPTION_LIMIT],
            "parse_mode": "HTML",
        })
    else:
        _call("editMessageText", {
            "chat_id": channel_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        })


def delete_vacancy(channel_id: str, message_id: int) -> None:
    _call("deleteMessage", {"chat_id": channel_id, "message_id": message_id})


# ── Render ─────────────────────────────────────────────────────────────────

def render_vacancy_html(vacancy) -> str:
    """
    Format (example channel style):
    #python #backend
    <b>Title</b> | <b>Company</b> (3-5 yil tajriba)

    Maosh: 16 000 000 – 27 000 000 UZS
    Bandlik turi: To'liq stavka
    Ish joyi: Ofisda
    Jadval: 5/2, 9:00-18:00
    Manzil: Toshkent, Ko'cha 4
    Bog'lanish: @username

    Vazifalar:
    • ...

    Talablar:
    • ...

    Ariza topshirish →

    👉 TTPU Bandlik Markazi kanaliga obuna bo'ling
    """
    parts = []

    # ── Teglar ──────────────────────────────────────────────────────────────
    if vacancy.tags and vacancy.tags.strip():
        parts.append(vacancy.tags.strip())

    # ── Sarlavha ────────────────────────────────────────────────────────────
    title_line = f"<b>{_esc(vacancy.title)}</b> | <b>{_esc(vacancy.company_name)}</b>"
    if vacancy.experience:
        title_line += f" ({_esc(vacancy.experience)})"
    parts.append(title_line)
    parts.append("")

    # ── Meta blok ───────────────────────────────────────────────────────────
    if vacancy.salary_min or vacancy.salary_max:
        if vacancy.salary_min and vacancy.salary_max:
            sal = f"{vacancy.salary_min:,} – {vacancy.salary_max:,} {vacancy.salary_currency}"
        else:
            sal = f"{(vacancy.salary_min or vacancy.salary_max):,} {vacancy.salary_currency}"
        parts.append(f"Maosh: {sal}")

    parts.append(f"Bandlik turi: {vacancy.get_employment_type_display()}")

    if vacancy.work_format:
        fmt_map = {
            "onsite": "Ofisda",
            "remote": "Masofaviy (remote)",
            "hybrid": "Aralash (hybrid)",
        }
        parts.append(f"Ish joyi: {fmt_map.get(vacancy.work_format, vacancy.work_format)}")

    if vacancy.schedule:
        parts.append(f"Jadval: {_esc(vacancy.schedule)}")

    # Manzil: region + address
    location_parts = []
    if vacancy.region:
        location_parts.append(_esc(vacancy.region.name))
    if vacancy.address:
        location_parts.append(_esc(vacancy.address))
    if location_parts:
        parts.append(f"Manzil: {', '.join(location_parts)}")

    if vacancy.deadline:
        parts.append(f"Muddat: {vacancy.deadline.strftime('%d.%m.%Y')}")

    if vacancy.apply_contact:
        parts.append(f"Bog'lanish: {_esc(vacancy.apply_contact)}")

    parts.append("")

    # ── Vazifalar ────────────────────────────────────────────────────────────
    parts.append("Vazifalar:")
    parts.append(_html_to_telegram(vacancy.description))

    # ── Talablar ─────────────────────────────────────────────────────────────
    if vacancy.requirements:
        parts.append("")
        parts.append("Talablar:")
        parts.append(_html_to_telegram(vacancy.requirements))

    # ── CTA ──────────────────────────────────────────────────────────────────
    if vacancy.apply_url:
        parts.append("")
        parts.append(f'<a href="{vacancy.apply_url}">Ariza topshirish →</a>')

    # ── Footer ───────────────────────────────────────────────────────────────
    channel_link = getattr(settings, "VACANCY_CHANNEL_LINK", "")
    if channel_link:
        parts.append(f'\n👉 <a href="{channel_link}">TTPU Bandlik Markazi</a> kanaliga obuna bo\'ling')

    return "\n".join(parts)


# ── Helpers ────────────────────────────────────────────────────────────────

def _bullet(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if len(lines) <= 1:
        return text
    return "\n".join(f"• {l}" for l in lines)


def _esc(text: str) -> str:
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
