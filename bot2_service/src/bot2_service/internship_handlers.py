"""Amaliyot (internship) arizasi oqimi — mustaqil router.

Menyudagi "🎓 Amaliyot" tugmasi `start_internship`ni chaqiradi. Oqim:
  manba tanlash (reestr / erkin matn) → kompaniya → ixtiyoriy izoh → yuborish.
Server bir vaqtda bitta pending arizani kafolatlaydi; bu yerda faqat UI.
"""
import html
import logging

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from .api import CrmApiClient
from .keyboards import main_menu_keyboard
from .states import BotState
from .texts import get_text, is_menu_label

logger = logging.getLogger(__name__)

router = Router()

# Umumiy CrmApiClient start_bot'da o'rnatiladi (setup_api) — modul darajasida
# alohida httpx pool ochilmaydi va shutdown'da bitta close() hammasini yopadi.
_api: CrmApiClient | None = None


def setup_api(api: CrmApiClient) -> None:
    global _api
    _api = api


def _client() -> CrmApiClient:
    if _api is None:
        raise RuntimeError("internship_handlers: setup_api() chaqirilmagan")
    return _api


PAGE_SIZE = 8


# ── Klaviaturalar ─────────────────────────────────────────────────────────────
def _source_keyboard(lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("intern_src_registry", lang), callback_data="intern:src:reg")
    kb.button(text=get_text("intern_src_manual", lang), callback_data="intern:src:man")
    kb.adjust(1)
    return kb.as_markup()


def _employers_keyboard(items: list[dict], page: int, count: int, lang: str) -> InlineKeyboardMarkup:
    # Explicit rows: one employer per row, nav (prev/next) on one row, manual last.
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=e["name"], callback_data=f"intern:emp:{e['id']}")]
        for e in items
    ]
    nav: list[InlineKeyboardButton] = []
    if page > 0:
        nav.append(InlineKeyboardButton(text=get_text("intern_prev", lang), callback_data=f"intern:pg:{page - 1}"))
    if (page + 1) * PAGE_SIZE < count:
        nav.append(InlineKeyboardButton(text=get_text("intern_next", lang), callback_data=f"intern:pg:{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([InlineKeyboardButton(text=get_text("intern_manual_from_list", lang), callback_data="intern:src:man")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _note_keyboard(lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("intern_note_skip", lang), callback_data="intern:note:skip")
    kb.adjust(1)
    return kb.as_markup()


# ── Entrypoint (menyudan chaqiriladi) ─────────────────────────────────────────
async def start_internship(message: Message, state: FSMContext, lang: str) -> None:
    """Menyuda "🎓 Amaliyot" bosilganda. Pending ariza bo'lsa — holatni ko'rsatadi."""
    tg_id = message.from_user.id
    status = await _client().internship_status(tg_id)
    if status.ok and (status.data or {}).get("has_pending"):
        company = (status.data or {}).get("company_name", "")
        await message.answer(
            get_text("intern_already_pending", lang).format(company=html.escape(str(company))),
            reply_markup=main_menu_keyboard(lang),
            parse_mode="HTML",
        )
        return

    await state.set_state(BotState.intern_source)
    await message.answer(get_text("intern_ask_source", lang), reply_markup=_source_keyboard(lang))


# ── Manba tanlash ─────────────────────────────────────────────────────────────
@router.callback_query(F.data == "intern:src:reg", BotState.intern_source)
async def intern_pick_registry(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await _render_employers(call, state, lang, page=0, edit=True)
    await call.answer()


@router.callback_query(
    F.data == "intern:src:man",
    StateFilter(BotState.intern_source, BotState.intern_pick_employer),
)
async def intern_pick_manual(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.intern_type_company)
    await call.message.edit_text(get_text("intern_type_prompt", lang))
    await call.answer()


async def _render_employers(call: CallbackQuery, state: FSMContext, lang: str, page: int, edit: bool):
    res = await _client().list_employers(limit=PAGE_SIZE, offset=page * PAGE_SIZE)
    items = (res.data or {}).get("results", []) if res.ok else []
    count = (res.data or {}).get("count", 0) if res.ok else 0

    if not items and page == 0:
        # Reestr bo'sh — to'g'ridan-to'g'ri erkin matnga o'tamiz.
        await state.set_state(BotState.intern_type_company)
        await call.message.edit_text(get_text("intern_empty_employers", lang))
        return

    await state.set_state(BotState.intern_pick_employer)
    await state.update_data(intern_page=page)
    kb = _employers_keyboard(items, page, count, lang)
    text = get_text("intern_pick_prompt", lang)
    if edit:
        await call.message.edit_text(text, reply_markup=kb)
    else:
        await call.message.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("intern:pg:"), BotState.intern_pick_employer)
async def intern_paginate(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    page = int(call.data.split(":")[-1])
    await _render_employers(call, state, lang, page=page, edit=True)
    await call.answer()


@router.callback_query(F.data.startswith("intern:emp:"), BotState.intern_pick_employer)
async def intern_employer_chosen(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    employer_id = call.data.split(":", 2)[-1]
    await state.update_data(intern_employer_id=employer_id, intern_company="")
    await state.set_state(BotState.intern_note)
    await call.message.edit_text(get_text("intern_ask_note", lang), reply_markup=_note_keyboard(lang))
    await call.answer()


# ── Erkin matn (kompaniya nomi) ───────────────────────────────────────────────
@router.message(BotState.intern_type_company)
async def intern_company_typed(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    company = (message.text or "").strip()
    # Doimiy menyu reply-klaviaturasi bu bosqichda ham ko'rinib turadi —
    # menyu tugmasi bosilsa, kompaniya nomi sifatida saqlamaymiz.
    if not company or is_menu_label(company):
        await message.answer(get_text("intern_type_prompt", lang))
        return
    await state.update_data(intern_company=company[:255], intern_employer_id="")
    await state.set_state(BotState.intern_note)
    await message.answer(get_text("intern_ask_note", lang), reply_markup=_note_keyboard(lang))


# ── Izoh + yuborish ───────────────────────────────────────────────────────────
@router.callback_query(F.data == "intern:note:skip", BotState.intern_note)
async def intern_note_skip(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await call.message.edit_reply_markup(reply_markup=None)
    await _submit_internship(call.message, state, lang, note="")
    await call.answer()


@router.message(BotState.intern_note)
async def intern_note_typed(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    note = (message.text or "").strip()
    # Menyu tugmasi bosilgan bo'lsa — izoh sifatida saqlamaymiz, qayta so'raymiz.
    if is_menu_label(note):
        await message.answer(get_text("intern_ask_note", lang), reply_markup=_note_keyboard(lang))
        return
    await _submit_internship(message, state, lang, note=note)


async def _submit_internship(message: Message, state: FSMContext, lang: str, note: str) -> None:
    data = await state.get_data()
    tg_id = message.chat.id
    res = await _client().create_internship(
        tg_id,
        employer_id=data.get("intern_employer_id", "") or "",
        company_name=data.get("intern_company", "") or "",
        note=note,
    )

    await _return_to_menu(state)

    if res.ok:
        await message.answer(get_text("intern_submitted", lang), reply_markup=main_menu_keyboard(lang))
        return

    if res.status == 409:
        # Poyga / allaqachon pending — joriy holatni olib ko'rsatamiz.
        status = await _client().internship_status(tg_id)
        company = (status.data or {}).get("company_name", "") if status.ok else ""
        await message.answer(
            get_text("intern_already_pending", lang).format(company=html.escape(str(company))),
            reply_markup=main_menu_keyboard(lang),
            parse_mode="HTML",
        )
        return

    logger.warning("create_internship failed for tg=%s: %s", tg_id, res.error)
    await message.answer(get_text("intern_error", lang), reply_markup=main_menu_keyboard(lang))


async def _return_to_menu(state: FSMContext) -> None:
    await state.update_data(
        intern_employer_id=None, intern_company=None, intern_page=None
    )
    await state.set_state(BotState.in_menu)


# ── Fallback: inline-kutayotgan holatlarda matn yozilsa qayta so'raymiz ────────
@router.message(StateFilter(BotState.intern_source, BotState.intern_pick_employer))
async def intern_inline_fallback(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.intern_source)
    await message.answer(get_text("intern_ask_source", lang), reply_markup=_source_keyboard(lang))


# Eskirgan/mos kelmagan intern:* callback — Telegram'dagi doimiy "yuklanmoqda"
# spinnerini tozalash uchun javob beramiz (oxirgi bo'lib ro'yxatga olinadi).
@router.callback_query(F.data.startswith("intern:"))
async def intern_stale_callback(call: CallbackQuery):
    await call.answer()
