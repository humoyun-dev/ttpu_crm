import html
from contextlib import suppress

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from .api import CrmApiClient
from .texts import get_text

router = Router()

# Umumiy CrmApiClient start_bot'da o'rnatiladi (setup_api) — modul darajasida
# alohida httpx pool ochilmaydi va shutdown'da bitta close() hammasini yopadi.
_api: CrmApiClient | None = None


def setup_api(api: CrmApiClient) -> None:
    global _api
    _api = api


def _client() -> CrmApiClient:
    if _api is None:
        raise RuntimeError("vacancy_handlers: setup_api() chaqirilmagan")
    return _api


async def _lang_of(state: FSMContext) -> str:
    with suppress(Exception):
        data = await state.get_data()
        return data.get("language", "uz")
    return "uz"


async def send_vacancy_page(message: Message, tg_id: int, page: int = 1, lang: str = "uz"):
    """ReplyKeyboard tugmasidan chaqirilganda yangi xabar yuboradi."""
    result = await _client().get_vacancies(telegram_user_id=tg_id, page=page, page_size=5)

    if not result.ok and result.status == 403:
        await message.answer(get_text("vac_need_survey", lang))
        return

    if not result.ok or not result.data:
        await message.answer(get_text("vac_load_failed", lang))
        return

    data  = result.data
    items = data.get("results", [])

    if not items:
        await message.answer(get_text("vac_empty", lang))
        return

    keyboard = _vacancy_nav_keyboard(
        page=data["page"],
        has_next=data["has_next"],
        channel_link=data.get("channel_link", ""),
        lang=lang,
    )
    await message.answer(
        _build_page_text(data, items, lang),
        reply_markup=keyboard,
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


def _build_page_text(data: dict, items: list, lang: str) -> str:
    """Sahifa matni. Server qiymatlari (title, kompaniya, hudud...) HTML uchun
    escape qilinadi — aks holda '<'/'&' TelegramBadRequest keltirib chiqaradi."""
    esc = html.escape
    lines = [get_text("vac_title", lang).format(page=data.get("page", 1)) + "\n"]
    for i, v in enumerate(items, 1):
        lines.append(f"<b>{i}. {esc(str(v.get('title', '')))}</b>")
        lines.append(f"🏢 {esc(str(v.get('company_name', '')))}  •  {esc(str(v.get('employment_type', '')))}")
        if v.get("region"):
            lines.append(f"📍 {esc(str(v['region']))}")
        if v.get("salary_min") or v.get("salary_max"):
            lines.append(f"💰 {esc(_salary_str(v))}")
        if v.get("deadline"):
            lines.append(get_text("vac_deadline", lang).format(deadline=esc(str(v["deadline"]))))
        if v.get("apply_url"):
            lines.append(f"📨 {esc(str(v['apply_url']))}")
        elif v.get("apply_contact"):
            lines.append(f"📨 {esc(str(v['apply_contact']))}")
        lines.append("")
    return "\n".join(lines)


def _vacancy_nav_keyboard(page: int, has_next: bool, channel_link: str, lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    nav = []
    if page > 1:
        kb.button(text=get_text("vac_prev", lang), callback_data=f"vac:page:{page - 1}")
        nav.append(1)
    if has_next:
        kb.button(text=get_text("vac_next", lang), callback_data=f"vac:page:{page + 1}")
        nav.append(1)
    if nav:
        kb.adjust(len(nav))
    if channel_link:
        kb.row()
        kb.button(text=get_text("vac_channel_btn", lang), url=channel_link)
    return kb.as_markup()


def _salary_str(v: dict) -> str:
    cur = v.get("salary_currency", "UZS")
    lo, hi = v.get("salary_min"), v.get("salary_max")
    if lo and hi:
        return f"{lo:,} – {hi:,} {cur}"
    return f"{(lo or hi):,} {cur}"


async def _safe_edit(message: Message, text: str, reply_markup: InlineKeyboardMarkup | None = None) -> None:
    """edit_text: bir xil sahifaga qayta bosilganda chiqadigan
    "message is not modified" xatosini yutadi (boshqalarini tarqatadi)."""
    try:
        await message.edit_text(
            text,
            reply_markup=reply_markup,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except TelegramBadRequest as exc:
        if "message is not modified" not in str(exc):
            raise


@router.callback_query(F.data == "menu:vacancies")
async def show_vacancies(call: CallbackQuery, state: FSMContext):
    await _render_page(call, state, page=1)


@router.callback_query(F.data.startswith("vac:page:"))
async def paginate_vacancies(call: CallbackQuery, state: FSMContext):
    try:
        page = int(call.data.split(":")[-1])
    except ValueError:
        page = 1
    await _render_page(call, state, page=page)


async def _render_page(call: CallbackQuery, state: FSMContext, page: int):
    lang = await _lang_of(state)
    try:
        tg_id = call.from_user.id
        result = await _client().get_vacancies(telegram_user_id=tg_id, page=page, page_size=5)

        if not result.ok and result.status == 403:
            await _safe_edit(call.message, get_text("vac_need_survey", lang))
            return

        if not result.ok or not result.data:
            await _safe_edit(call.message, get_text("vac_load_failed", lang))
            return

        data  = result.data
        items = data.get("results", [])

        if not items:
            # Bo'sh sahifa: birinchi bo'lmasa (masalan, oxirgi vakansiya ikki
            # bosish orasida yopilgan) — orqaga tugmasini qoldiramiz,
            # foydalanuvchi tugmasiz qolib ketmasin.
            kb = None
            if page > 1:
                b = InlineKeyboardBuilder()
                b.button(text=get_text("survey_back_btn", lang), callback_data=f"vac:page:{page - 1}")
                kb = b.as_markup()
            await _safe_edit(call.message, get_text("vac_empty", lang), reply_markup=kb)
            return

        keyboard = _vacancy_nav_keyboard(
            page=data["page"],
            has_next=data["has_next"],
            channel_link=data.get("channel_link", ""),
            lang=lang,
        )
        await _safe_edit(call.message, _build_page_text(data, items, lang), reply_markup=keyboard)
    finally:
        # Spinner hech qachon osilib qolmasin.
        with suppress(Exception):
            await call.answer()
