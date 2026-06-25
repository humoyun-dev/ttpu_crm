from __future__ import annotations

import asyncio
import logging
import re
import uuid
from contextlib import suppress

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramConflictError
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from bot2_service.storage import ApiStorage
from aiogram.methods import GetUpdates
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove
from aiogram.utils.backoff import Backoff, BackoffConfig
from aiogram.utils.keyboard import InlineKeyboardBuilder

try:
    from aiogram.client.exceptions import TelegramConflictError as ClientTelegramConflictError
except Exception:  # pragma: no cover
    ClientTelegramConflictError = None  # type: ignore[assignment]

from bot2_service.api import CrmApiClient
from bot2_service.catalog_cache import CatalogCache
from bot2_service.config import settings
from bot2_service.keyboards import (
    birth_date_calendar,
    certificate_keyboard,
    confirm_keyboard,
    consent_keyboard,
    contact_keyboard,
    course_year_keyboard,
    cv_keyboard,
    directions_keyboard,
    gender_keyboard,
    language_keyboard,
    languages_keyboard,
    main_menu_keyboard,
    regions_keyboard,
    suggestions_keyboard,
    yes_no_keyboard,
)
from bot2_service.single_instance import SingleInstanceLock
from bot2_service.states import BotState
from bot2_service.texts import channels_text, get_text

logger = logging.getLogger(__name__)

router = Router()
api_client: CrmApiClient
catalog: CatalogCache
NO_KB = ReplyKeyboardRemove()

_BIRTH_DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")


def setup_dependencies(api: CrmApiClient, catalog_cache: CatalogCache):
    global api_client, catalog
    api_client = api
    catalog = catalog_cache


# ── helpers ───────────────────────────────────────────────────────────────────

async def _reply(message: Message, text: str, state: FSMContext, reply_markup=None, **_kwargs):
    return await message.answer(text, reply_markup=reply_markup)


async def _reply_cb(call: CallbackQuery, text: str, state: FSMContext, reply_markup=None):
    return await call.bot.send_message(call.message.chat.id, text, reply_markup=reply_markup)


def _parse_birth_date(text: str) -> str | None:
    """Return ISO date YYYY-MM-DD if text matches DD.MM.YYYY, else None."""
    m = _BIRTH_DATE_RE.match((text or "").strip())
    if not m:
        return None
    day, month, year = m.groups()
    try:
        import datetime
        datetime.date(int(year), int(month), int(day))
    except ValueError:
        return None
    return f"{year}-{month}-{day}"


# ── /start ────────────────────────────────────────────────────────────────────

@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    prof = await api_client.get_student_profile(message.from_user.id)
    if prof.ok and (prof.data or {}).get("found"):
        p = prof.data
        lang = p.get("language", "uz")
        first_name = p.get("first_name", "")
        await state.set_state(BotState.in_menu)
        await state.update_data(
            language=lang,
            tg_user_id=message.from_user.id,
            student_id=p.get("student_external_id", ""),
            tg_first_name=first_name,
            program_id=p.get("program_id"),
            program_name=p.get("program_name", ""),
            course_year=p.get("course_year"),
        )
        greeting = get_text("welcome_back", lang).format(name=first_name) if first_name else get_text("welcome_back_anon", lang)
        await message.answer(greeting, reply_markup=NO_KB)
        await message.answer(get_text("menu_main", lang), reply_markup=main_menu_keyboard(lang))
        return
    # New user
    await state.set_state(BotState.waiting_language)
    await message.answer(get_text("ask_language", "uz"), reply_markup=language_keyboard())


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.clear()
    await message.answer(get_text("cancelled", lang), reply_markup=NO_KB)


# Hidden command (not shown in the menu): unlink the Telegram account so the next
# /start re-runs the full identify + verify flow.
@router.message(Command("logout"))
async def cmd_logout(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    result = await api_client.logout(message.from_user.id)
    if not result.ok:
        logger.warning("logout API error for tg_user_id=%s: %s", message.from_user.id, result.error)
    await state.clear()
    await message.answer(get_text("logged_out", lang), reply_markup=NO_KB)


@router.message(Command("retry"))
async def cmd_retry(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if not data.get("student_id"):
        await message.answer(get_text("retry_nothing", lang))
        return
    await _final_submit(message, state)


# ── STEP 1: Language ──────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("lang_pick:"), BotState.waiting_language)
async def pick_language(call: CallbackQuery, state: FSMContext):
    lang = call.data.split(":")[1]
    if lang not in ("uz", "ru"):
        lang = "uz"
    await state.update_data(
        language=lang,
        tg_user_id=call.from_user.id,
        tg_first_name=call.from_user.first_name or "",
    )
    await state.set_state(BotState.waiting_student_id)
    with suppress(Exception):
        await call.message.delete()
    await _reply_cb(call, get_text("ask_student_id", lang), state, reply_markup=NO_KB)
    await call.answer()


# ── STEP 2: Student ID ────────────────────────────────────────────────────────

@router.message(BotState.waiting_student_id)
async def set_student_id(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    student_id = (message.text or "").strip()
    if not student_id:
        await _reply(message, get_text("ask_student_id", lang), state, reply_markup=NO_KB)
        return
    await state.update_data(student_id=student_id)
    await state.set_state(BotState.waiting_birth_date)
    from datetime import date as _date
    today = _date.today()
    default_year = 2000
    kb = birth_date_calendar(default_year, today.month, lang)
    await _reply(message, get_text("ask_birth_date", lang), state, reply_markup=kb)


# ── STEP 3a: Birth Date — calendar navigation (no-op) ────────────────────────

@router.callback_query(F.data == "cal_noop")
async def cal_noop(call: CallbackQuery):
    await call.answer()


# ── STEP 3b: Birth Date — month navigation ────────────────────────────────────

@router.callback_query(F.data.startswith("cal:"), BotState.waiting_birth_date)
async def cal_navigate(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    _, year_str, month_str = call.data.split(":")
    kb = birth_date_calendar(int(year_str), int(month_str), lang)
    with suppress(Exception):
        await call.message.edit_reply_markup(reply_markup=kb)
    await call.answer()


# ── STEP 3c: Birth Date — day selected from calendar ─────────────────────────

@router.callback_query(F.data.startswith("cal_day:"), BotState.waiting_birth_date)
async def cal_day_selected(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    iso_date = call.data.split("cal_day:")[1]   # YYYY-MM-DD
    with suppress(Exception):
        await call.message.delete()
    await call.answer()
    await _process_birth_date(call.message, state, lang, iso_date)


# ── STEP 3d: Birth Date — manual text input ───────────────────────────────────

@router.message(BotState.waiting_birth_date)
async def set_birth_date(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    iso_date = _parse_birth_date(message.text or "")
    if not iso_date:
        from datetime import date as _date
        today = _date.today()
        kb = birth_date_calendar(2000, today.month, lang)
        await _reply(message, get_text("birth_date_invalid", lang), state, reply_markup=kb)
        return
    await _process_birth_date(message, state, lang, iso_date)


async def _process_birth_date(message: Message, state: FSMContext, lang: str, iso_date: str):
    data = await state.get_data()
    student_id = data.get("student_id", "")
    result = await api_client.verify(student_id, iso_date)

    if not result.ok:
        logger.warning("verify API error for student_id=%s: %s", student_id, result.error)
        await _reply(message, get_text("verify_error", lang), state, reply_markup=NO_KB)
        return

    resp_data = result.data or {}
    if not resp_data.get("match"):
        await state.set_state(BotState.waiting_student_id)
        await _reply(message, get_text("verify_failed", lang), state, reply_markup=NO_KB)
        return

    roster = resp_data.get("roster", {})

    # Load existing profile from DB to pre-fill known fields
    tg_user_id = data.get("tg_user_id")
    profile: dict = {}
    if tg_user_id:
        prof_result = await api_client.get_student_profile(tg_user_id)
        if prof_result.ok and (prof_result.data or {}).get("found"):
            profile = prof_result.data

    # Determine greeting name: prefer DB name, fallback to Telegram name
    first_name = profile.get("first_name") or data.get("tg_first_name", "")

    # Pre-fill profile fields into state (skip questions for fields already filled)
    profile_update: dict = {
        "birth_date": iso_date,
        "program_id": roster.get("program_id"),
        "program_name": roster.get("program_name", ""),
        # Leave course_year unset (None) when the roster doesn't carry it, so the
        # survey asks the student instead of silently defaulting to 1st year.
        "course_year": roster.get("course_year"),
    }
    if profile.get("phone"):
        profile_update["phone"] = profile["phone"]
    if profile.get("gender"):
        profile_update["gender"] = profile["gender"]
    if profile.get("region_id"):
        region_name = profile.get(f"region_name_{lang}") or profile.get("region_name_uz") or ""
        profile_update["region_id"] = profile["region_id"]
        profile_update["region_label"] = region_name

    await state.update_data(**profile_update)
    await state.set_state(BotState.waiting_consent)

    greeting = f"Salom, {first_name}!\n" if first_name else ""
    if lang == "ru":
        greeting = f"Привет, {first_name}!\n" if first_name else ""
    consent_text = greeting + get_text("verify_success", lang) + "\n\n" + get_text("consent_text", lang)
    await _reply(message, consent_text, state, reply_markup=consent_keyboard(lang))


# ── STEP 4: Consent ───────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("consent:"), BotState.waiting_consent)
async def handle_consent(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]

    with suppress(Exception):
        await call.message.delete()

    if choice != "yes":
        await state.clear()
        await call.bot.send_message(call.message.chat.id, get_text("consent_declined", lang), reply_markup=NO_KB)
        await call.answer()
        return

    result = await api_client.register(
        telegram_user_id=call.from_user.id,
        student_id=data.get("student_id", ""),
        consent=True,
        language=lang,
        username=call.from_user.username or "",
        first_name=call.from_user.first_name or "",
        last_name=call.from_user.last_name or "",
    )

    if not result.ok:
        logger.warning("register API error for student_id=%s: %s", data.get("student_id"), result.error)
        await call.bot.send_message(call.message.chat.id, get_text("register_error", lang), reply_markup=NO_KB)
        await call.answer()
        return

    await state.update_data(
        telegram_user_id=call.from_user.id,
        username=call.from_user.username or "",
    )
    await _continue_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


# ── Survey continuation helper ────────────────────────────────────────────────

async def _continue_survey(chat_id: int, bot, state: FSMContext, lang: str) -> None:
    """Jump to the first unanswered survey step, skipping already-filled profile fields."""
    data = await state.get_data()

    if not data.get("phone"):
        await state.set_state(BotState.waiting_contact)
        await bot.send_message(chat_id, get_text("ask_contact", lang), reply_markup=contact_keyboard(lang))
        return

    if not data.get("gender"):
        await state.set_state(BotState.waiting_gender)
        await bot.send_message(chat_id, get_text("ask_gender", lang), reply_markup=gender_keyboard(lang))
        return

    if not data.get("region_id"):
        regions = await catalog.get_regions()
        await state.set_state(BotState.waiting_region)
        await bot.send_message(chat_id, get_text("ask_region", lang), reply_markup=regions_keyboard(regions, lang))
        return

    # Direction (yo'nalish): ask only when the roster didn't already supply it.
    if not data.get("program_id"):
        dirs = await catalog.get_catalog_items("direction")
        await state.set_state(BotState.waiting_direction)
        await bot.send_message(chat_id, get_text("ask_direction", lang), reply_markup=directions_keyboard(dirs, lang))
        return

    # Course year (1-4 / bitiruvchi): ask only when unknown from the roster.
    if not data.get("course_year"):
        await state.set_state(BotState.waiting_course_year)
        await bot.send_message(chat_id, get_text("ask_course_year", lang), reply_markup=course_year_keyboard(lang))
        return

    # Employment and beyond are always asked (survey-specific data)
    await state.set_state(BotState.waiting_employment)
    await bot.send_message(chat_id, get_text("ask_employment", lang), reply_markup=yes_no_keyboard("employment", lang))


# ── STEP 5: Contact ───────────────────────────────────────────────────────────

@router.message(BotState.waiting_contact, F.contact)
async def set_contact(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    contact = message.contact
    await state.update_data(
        phone=contact.phone_number or "",
        telegram_user_id=message.from_user.id,
        username=message.from_user.username or "",
    )
    await _continue_survey(message.chat.id, message.bot, state, lang)


@router.message(BotState.waiting_contact)
async def contact_fallback(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await _reply(message, get_text("ask_contact", lang), state, reply_markup=contact_keyboard(lang))


# ── STEP 6: Gender ────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("gender:"), BotState.waiting_gender)
async def pick_gender(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    gender = call.data.split(":")[1]
    await state.update_data(gender=gender)
    with suppress(Exception):
        await call.message.delete()
    await _continue_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


# ── STEP 9: Region ────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("region:"), BotState.waiting_region)
async def pick_region(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    with suppress(Exception):
        await call.message.delete()
    regions = await catalog.get_regions()
    region_key = call.data.split(":")[1]
    selected = next((r for r in regions if str(r.get("id")) == region_key), None)
    if selected:
        region_name = (
            selected.get(f"name_{lang}")
            or selected.get("metadata", {}).get(f"name_{lang}")
            or selected.get("name")
        )
        await state.update_data(
            region_id=str(selected.get("id")),
            region_code=selected.get("code"),
            region_label=region_name,
        )
    await _continue_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


# ── STEP 9b: Direction (if not in roster) ────────────────────────────────────

@router.callback_query(F.data.startswith("direction:"), BotState.waiting_direction)
async def pick_direction(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    with suppress(Exception):
        await call.message.delete()
    dirs = await catalog.get_catalog_items("direction")
    dir_id = call.data.split(":")[1]
    selected = next((d for d in dirs if str(d.get("id")) == dir_id), None)
    if selected:
        dir_name = (
            selected.get(f"name_{lang}")
            or selected.get("name_uz")
            or selected.get("name", "")
        )
        await state.update_data(program_id=str(selected.get("id")), program_name=dir_name)
    await _continue_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


@router.callback_query(F.data.startswith("course_year:"), BotState.waiting_course_year)
async def pick_course_year(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    with suppress(Exception):
        await call.message.delete()
    year = int(call.data.split(":")[1])
    await state.update_data(course_year=year)
    await _continue_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


# ── STEP 10: Employment ───────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("employment:"), BotState.waiting_employment)
async def pick_employment(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(employed=choice == "yes")
    with suppress(Exception):
        await call.message.delete()
    if choice == "yes":
        await state.set_state(BotState.waiting_company)
        await _reply_cb(call, get_text("ask_company", lang), state, reply_markup=NO_KB)
    else:
        await state.set_state(BotState.waiting_help)
        await _reply_cb(call, get_text("ask_help", lang), state, reply_markup=yes_no_keyboard("help", lang))
    await call.answer()


# ── BRANCH A: Employed ────────────────────────────────────────────────────────

@router.message(BotState.waiting_company)
async def set_company(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(company=(message.text or "").strip()[:255])
    await state.set_state(BotState.waiting_role)
    await _reply(message, get_text("ask_role", lang), state, reply_markup=NO_KB)


@router.message(BotState.waiting_role)
async def set_role(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(role=(message.text or "").strip()[:255])
    await state.set_state(BotState.waiting_suggestions)
    await _reply(message, get_text("ask_suggestions", lang), state, reply_markup=suggestions_keyboard(lang))


# ── BRANCH B: Unemployed ──────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("help:"), BotState.waiting_help)
async def pick_help(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(want_help=choice == "yes")
    with suppress(Exception):
        await call.message.delete()
    if choice == "yes":
        await state.set_state(BotState.waiting_share_consent)
        await call.bot.send_message(
            call.message.chat.id, get_text("ask_share", lang), reply_markup=yes_no_keyboard("share", lang)
        )
    else:
        await _ask_cv(call.message, state)
    await call.answer()


@router.callback_query(F.data.startswith("share:"), BotState.waiting_share_consent)
async def pick_share(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    choice = call.data.split(":")[1]
    await state.update_data(share_consent=choice == "yes")
    with suppress(Exception):
        await call.message.delete()
    await _ask_cv(call.message, state)
    await call.answer()


# ── Suggestions → Submit ──────────────────────────────────────────────────────

@router.message(BotState.waiting_suggestions)
async def set_suggestions(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if data.get("_sug_q_id"):
        with suppress(Exception):
            await message.bot.delete_message(message.chat.id, data["_sug_q_id"])
    await state.update_data(suggestions=(message.text or "").strip())
    if data.get("employed"):
        await _ask_confirmation(message, state)
    else:
        await message.answer(channels_text(lang))
        await _ask_confirmation(message, state)


@router.callback_query(F.data == "suggestions:skip", BotState.waiting_suggestions)
async def suggestions_skip_handler(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(suggestions="")
    with suppress(Exception):
        await call.message.delete()
    if data.get("employed"):
        await _ask_confirmation(call.message, state)
    else:
        await call.bot.send_message(call.message.chat.id, channels_text(lang))
        await _ask_confirmation(call.message, state)
    await call.answer()


# ── File upload helper ────────────────────────────────────────────────────────

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _file_too_large_text(lang: str) -> str:
    text = get_text("file_too_large", lang)
    if text == "file_too_large":  # key missing in texts.py — use a safe fallback
        return "Fayl hajmi 10 MB dan oshmasligi kerak."
    return text


async def _upload_file_to_server(
    message: Message, student_external_id: str, doc_type: str, lang: str = "uz"
) -> str | None:
    """Download file from Telegram and upload to CRM server. Returns doc_id or None on failure."""
    try:
        if message.document:
            file_id = message.document.file_id
            filename = message.document.file_name or f"{doc_type}.pdf"
            mime_type = message.document.mime_type or "application/octet-stream"
            file_size = message.document.file_size
        elif message.photo:
            file_id = message.photo[-1].file_id
            filename = f"{doc_type}.jpg"
            mime_type = "image/jpeg"
            file_size = message.photo[-1].file_size
        else:
            return None

        # Reject oversized files early to avoid buffering huge downloads.
        if file_size and file_size > _MAX_UPLOAD_BYTES:
            await message.answer(_file_too_large_text(lang))
            return None

        tg_file = await message.bot.get_file(file_id)
        buf = await message.bot.download_file(tg_file.file_path)
        raw = buf.read() if hasattr(buf, "read") else bytes(buf)

        result = await api_client.upload_document(student_external_id, doc_type, raw, filename, mime_type)
        if result.ok:
            return (result.data or {}).get("doc_id")
        logger.warning("upload_document failed for %s/%s: %s", student_external_id, doc_type, result.error)
    except Exception as exc:
        logger.exception("_upload_file_to_server error: %s", exc)
    return None


# ── CV Upload (unemployed only) ───────────────────────────────────────────────

async def _ask_cv(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.waiting_cv)
    sent = await message.answer(get_text("ask_cv", lang), reply_markup=cv_keyboard(lang))
    await state.update_data(_cv_q_id=sent.message_id)


@router.message(BotState.waiting_cv, F.document | F.photo)
async def handle_cv_file(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if data.get("_cv_q_id"):
        with suppress(Exception):
            await message.bot.delete_message(message.chat.id, data["_cv_q_id"])
    doc_id = await _upload_file_to_server(message, data.get("student_id", ""), "cv", lang)
    await state.update_data(cv_doc_id=doc_id or "")
    await message.answer(get_text("cv_received", lang), reply_markup=NO_KB)
    await _ask_suggestions(message, state)


@router.callback_query(F.data == "cv:no", BotState.waiting_cv)
async def cv_no_handler(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    with suppress(Exception):
        await call.message.delete()
    await state.set_state(BotState.waiting_languages)
    await call.bot.send_message(
        call.message.chat.id, get_text("ask_languages", lang), reply_markup=languages_keyboard([], lang)
    )
    await call.answer()


@router.message(BotState.waiting_cv)
async def cv_fallback(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if data.get("_cv_q_id"):
        with suppress(Exception):
            await message.bot.delete_message(message.chat.id, data["_cv_q_id"])
    sent = await message.answer(get_text("ask_cv", lang), reply_markup=cv_keyboard(lang))
    await state.update_data(_cv_q_id=sent.message_id)


# ── Language Selection ────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("lang_toggle:"), BotState.waiting_languages)
async def toggle_language(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    lang_key = call.data.split(":")[1]
    selected: list = list(data.get("known_langs", []))
    if lang_key in selected:
        selected.remove(lang_key)
    else:
        selected.append(lang_key)
    await state.update_data(known_langs=selected)
    with suppress(Exception):
        await call.message.edit_reply_markup(reply_markup=languages_keyboard(selected, lang))
    await call.answer()


@router.callback_query(F.data == "lang_done", BotState.waiting_languages)
async def languages_done(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if not data.get("known_langs"):
        await call.answer(get_text("select_at_least_one", lang), show_alert=True)
        return
    with suppress(Exception):
        await call.message.delete()
    await state.set_state(BotState.waiting_certificate)
    sent = await call.bot.send_message(
        call.message.chat.id, get_text("ask_certificate", lang), reply_markup=certificate_keyboard(lang)
    )
    await state.update_data(_cert_q_id=sent.message_id)
    await call.answer()


# ── Certificate Upload ────────────────────────────────────────────────────────

@router.message(BotState.waiting_certificate, F.document | F.photo)
async def handle_certificate_file(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if data.get("_cert_q_id"):
        with suppress(Exception):
            await message.bot.delete_message(message.chat.id, data["_cert_q_id"])
    doc_id = await _upload_file_to_server(message, data.get("student_id", ""), "certificate", lang)
    await state.update_data(cert_doc_id=doc_id or "")
    await message.answer(get_text("cert_received", lang), reply_markup=NO_KB)
    await _ask_suggestions(message, state)


@router.callback_query(F.data == "cert:skip", BotState.waiting_certificate)
async def cert_skip_handler(call: CallbackQuery, state: FSMContext):
    with suppress(Exception):
        await call.message.delete()
    await _ask_suggestions(call.message, state)
    await call.answer()


@router.message(BotState.waiting_certificate)
async def certificate_fallback(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if data.get("_cert_q_id"):
        with suppress(Exception):
            await message.bot.delete_message(message.chat.id, data["_cert_q_id"])
    sent = await message.answer(get_text("ask_certificate", lang), reply_markup=certificate_keyboard(lang))
    await state.update_data(_cert_q_id=sent.message_id)


# ── Suggestions before submit ─────────────────────────────────────────────────

async def _ask_suggestions(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.waiting_suggestions)
    sent = await message.answer(get_text("ask_suggestions", lang), reply_markup=suggestions_keyboard(lang))
    await state.update_data(_sug_q_id=sent.message_id)


# ── Confirmation before submit ────────────────────────────────────────────────

def _course_label(course_year, lang: str) -> str:
    if course_year == 5:
        return get_text("course_graduated_label", lang)
    if course_year:
        return f"{course_year} курс" if lang == "ru" else f"{course_year}-kurs"
    return "—"


def _build_review(data: dict, lang: str) -> str:
    """Human-readable summary of everything the student answered, shown right before
    the send/restart confirmation so they can review their answers."""
    lines = [get_text("review_title", lang)]

    if data.get("phone"):
        lines.append(f"{get_text('account_phone', lang)} {data['phone']}")

    gender = data.get("gender")
    if gender == "male":
        lines.append(f"{get_text('account_gender', lang)} {get_text('gender_male_label', lang)}")
    elif gender == "female":
        lines.append(f"{get_text('account_gender', lang)} {get_text('gender_female_label', lang)}")

    if data.get("region_label"):
        lines.append(f"{get_text('account_region', lang)} {data['region_label']}")
    if data.get("program_name"):
        lines.append(f"{get_text('review_direction', lang)} {data['program_name']}")

    lines.append(f"{get_text('review_course', lang)} {_course_label(data.get('course_year'), lang)}")

    employed = bool(data.get("employed"))
    lines.append(
        f"{get_text('review_employment', lang)} "
        f"{get_text('employed_label' if employed else 'unemployed_label', lang)}"
    )
    if employed:
        if data.get("company"):
            lines.append(f"{get_text('review_company', lang)} {data['company']}")
        if data.get("role"):
            lines.append(f"{get_text('review_role', lang)} {data['role']}")

    langs = data.get("known_langs") or []
    if langs:
        lines.append(f"{get_text('review_langs', lang)} {', '.join(str(x) for x in langs)}")
    if data.get("suggestions"):
        lines.append(f"{get_text('review_suggestions', lang)} {data['suggestions']}")

    yes, no = get_text("yes_short", lang), get_text("no_short", lang)
    lines.append(f"{get_text('review_help', lang)} {yes if data.get('want_help') else no}")
    lines.append(f"{get_text('review_share', lang)} {yes if data.get('share_consent') else no}")
    return "\n".join(lines)


async def _restart_survey(chat_id: int, bot, state: FSMContext, lang: str) -> None:
    """Re-run the survey from the first question, keeping the verified identity and
    roster facts (program/course) but clearing the student's collected answers."""
    data = await state.get_data()
    keep_keys = (
        "language", "tg_user_id", "telegram_user_id", "username", "student_id",
        "tg_first_name", "birth_date", "program_id", "program_name", "course_year",
    )
    preserved = {k: data.get(k) for k in keep_keys if data.get(k) is not None}
    await state.clear()
    await state.update_data(**preserved)
    await bot.send_message(chat_id, get_text("restart_notice", lang), reply_markup=NO_KB)
    await _continue_survey(chat_id, bot, state, lang)


async def _ask_confirmation(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    lang = data.get("language", "uz")
    await message.answer(_build_review(data, lang))
    await state.set_state(BotState.waiting_confirmation)
    await message.answer(get_text("confirm_send", lang), reply_markup=confirm_keyboard(lang))


@router.callback_query(F.data.startswith("confirm:"), BotState.waiting_confirmation)
async def handle_confirmation(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    with suppress(Exception):
        await call.message.delete()
    if choice == "yes":
        await _final_submit(call.message, state)
    else:
        await _restart_survey(call.message.chat.id, call.bot, state, lang)
    await call.answer()


# ── Main Menu ────────────────────────────────────────────────────────────────

async def _enter_main_menu(message: Message, state: FSMContext, data: dict, lang: str) -> None:
    """Transition to main menu after a successful survey submission."""
    await state.clear()
    await state.set_state(BotState.in_menu)
    await state.update_data(
        language=lang,
        tg_user_id=data.get("telegram_user_id") or data.get("tg_user_id"),
        student_id=data.get("student_id"),
        tg_first_name=data.get("tg_first_name", ""),
        program_id=data.get("program_id"),
        program_name=data.get("program_name", ""),
        course_year=data.get("course_year"),
    )
    await message.answer(get_text("thanks", lang), reply_markup=NO_KB)
    await message.answer(get_text("menu_main", lang), reply_markup=main_menu_keyboard(lang))


@router.message(BotState.in_menu)
async def handle_menu(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    text = (message.text or "").strip()

    if text == get_text("menu_portfolio", lang):
        await message.answer(get_text("portfolio_info", lang), reply_markup=main_menu_keyboard(lang))

    elif text == get_text("menu_vacancy", lang):
        await message.answer(get_text("vacancy_info", lang) + "\n" + channels_text(lang), reply_markup=main_menu_keyboard(lang))

    elif text == get_text("menu_survey", lang):
        prof = await api_client.get_student_profile(message.from_user.id)
        last_survey_at = (prof.data or {}).get("last_survey_at") if prof.ok else None
        if last_survey_at:
            try:
                from datetime import datetime, timezone as _tz
                dt = datetime.fromisoformat(last_survey_at.replace("Z", "+00:00")).astimezone(_tz.utc)
                date_str = dt.strftime("%d.%m.%Y")
            except Exception:
                date_str = last_survey_at
            kb = InlineKeyboardBuilder()
            kb.button(text=get_text("survey_new", lang), callback_data="survey_choice:new")
            kb.button(text=get_text("survey_back_btn", lang), callback_data="survey_choice:back")
            kb.adjust(1)
            await message.answer(get_text("survey_has_previous", lang).format(date=date_str), reply_markup=kb.as_markup())
        else:
            await _start_refill(message.chat.id, message.bot, state, lang, message.from_user.id)

    elif text == get_text("menu_account", lang):
        await _show_account(message, lang)

    elif text == get_text("menu_support", lang):
        await message.answer(get_text("support_info", lang) + "\n\n" + channels_text(lang), reply_markup=main_menu_keyboard(lang))

    else:
        await message.answer(get_text("menu_main", lang), reply_markup=main_menu_keyboard(lang))


@router.callback_query(F.data.startswith("survey_choice:"), BotState.in_menu)
async def handle_survey_choice(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    with suppress(Exception):
        await call.message.delete()
    if choice == "new":
        await _start_refill(call.message.chat.id, call.bot, state, lang, call.from_user.id)
    else:
        await call.bot.send_message(call.message.chat.id, get_text("menu_main", lang), reply_markup=main_menu_keyboard(lang))
    await call.answer()


async def _start_refill(chat_id: int, bot, state: FSMContext, lang: str, tg_user_id: int) -> None:
    """Skip re-verification for known user; pre-fill profile data and go to employment question."""
    prof = await api_client.get_student_profile(tg_user_id)
    if not prof.ok or not (prof.data or {}).get("found"):
        await state.clear()
        await state.set_state(BotState.waiting_language)
        await bot.send_message(chat_id, get_text("ask_language", "uz"), reply_markup=language_keyboard())
        return
    p = prof.data
    region_name = p.get(f"region_name_{lang}") or p.get("region_name_uz", "")
    await state.clear()
    await state.update_data(
        language=lang,
        tg_user_id=tg_user_id,
        telegram_user_id=tg_user_id,
        student_id=p.get("student_external_id", ""),
        tg_first_name=p.get("first_name", ""),
        phone=p.get("phone", ""),
        gender=p.get("gender") or "",
        region_id=p.get("region_id", "") or "",
        region_label=region_name,
        program_id=p.get("program_id"),
        program_name=p.get("program_name", ""),
        course_year=p.get("course_year"),
    )
    await state.set_state(BotState.waiting_employment)
    await bot.send_message(chat_id, get_text("ask_employment", lang), reply_markup=yes_no_keyboard("employment", lang))


async def _show_account(message: Message, lang: str) -> None:
    result = await api_client.get_student_profile(message.from_user.id)
    if not result.ok or not (result.data or {}).get("found"):
        await message.answer(get_text("account_not_found", lang))
        return

    p = result.data
    full_name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    phone = p.get("phone", "")
    gender = p.get("gender", "")
    region = p.get(f"region_name_{lang}") or p.get("region_name_uz", "")
    last_survey = p.get("last_survey_at", "")

    if gender == "male":
        gender_label = get_text("gender_male_label", lang)
    elif gender == "female":
        gender_label = get_text("gender_female_label", lang)
    else:
        gender_label = ""

    lines = [get_text("account_title", lang)]
    if full_name:
        lines.append(f"{get_text('account_name', lang)} {full_name}")
    if phone:
        lines.append(f"{get_text('account_phone', lang)} {phone}")
    if gender_label:
        lines.append(f"{get_text('account_gender', lang)} {gender_label}")
    if region:
        lines.append(f"{get_text('account_region', lang)} {region}")
    if last_survey:
        with suppress(Exception):
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(last_survey.replace("Z", "+00:00")).astimezone(timezone.utc)
            lines.append(f"{get_text('account_survey', lang)} {dt.strftime('%d.%m.%Y')}")

    await message.answer("\n".join(lines), reply_markup=main_menu_keyboard(lang))


# ── FollowUp Answer (stateless inline callback) ───────────────────────────────

@router.callback_query(F.data.startswith("followup:"))
async def handle_followup_answer(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    parts = call.data.split(":")
    if len(parts) < 3:
        await call.answer()
        return
    followup_id = parts[1]
    answer = parts[2]

    result = await api_client.followup_answer(followup_id, answer, call.from_user.id)
    if result.ok:
        with suppress(Exception):
            await call.message.edit_text(get_text("followup_answer_received", lang))
        await call.answer(get_text("followup_answer_received", lang))
    else:
        await call.answer(get_text("followup_answer_failed", lang), show_alert=True)


# ── Fallback ──────────────────────────────────────────────────────────────────

@router.message()
async def fallback_handler(message: Message, state: FSMContext):
    current = await state.get_state()
    data = await state.get_data()
    lang = data.get("language", "uz")
    if current is None:
        await message.answer(get_text("unknown_command", lang))
    else:
        await message.answer(get_text("use_buttons", lang))


# ── Survey Submission ─────────────────────────────────────────────────────────

async def _final_submit(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")

    student_id = data.get("student_id")
    if not student_id or not str(student_id).strip():
        logger.error(
            "Survey submission skipped: student_id empty. telegram_user_id=%s keys=%s",
            data.get("telegram_user_id"),
            sorted(data.keys()),
        )
        await message.answer(get_text("ask_student_id", lang), reply_markup=NO_KB)
        await state.set_state(BotState.waiting_student_id)
        return

    # Generate an idempotency key once and reuse it across retries (and /retry)
    # so the server can dedupe duplicate survey submissions.
    idempotency_key = data.get("idempotency_key")
    if not idempotency_key:
        idempotency_key = str(uuid.uuid4())
        await state.update_data(idempotency_key=idempotency_key)

    payload = {
        "idempotency_key": idempotency_key,
        "student_external_id": str(student_id).strip(),
        "telegram_user_id": data.get("telegram_user_id"),
        "username": data.get("username", "") or "",
        "phone": data.get("phone", "") or "",
        "gender": data.get("gender") or "unspecified",
        "region_id": data.get("region_id"),
        "region_code": data.get("region_code"),
        "program_id": data.get("program_id"),
        "language": lang,
        "course_year": data.get("course_year", 1),
        "employment_status": "employed" if data.get("employed") else "unemployed",
        "employment_company": data.get("company", ""),
        "employment_role": data.get("role", ""),
        "suggestions": data.get("suggestions", ""),
        "consents": {
            "share_with_employers": data.get("share_consent", False),
            "want_help": data.get("want_help", False),
        },
        "answers": {
            "region_label": data.get("region_label"),
            "program_label": data.get("program_name", ""),
            "course_year": data.get("course_year"),
            "known_langs": data.get("known_langs", []),
            "cv_doc_id": data.get("cv_doc_id", ""),
            "cert_doc_id": data.get("cert_doc_id", ""),
        },
    }

    logger.info("Submitting survey for student_id=%s telegram_user_id=%s", student_id, payload["telegram_user_id"])
    res = await api_client.submit_survey(payload)
    if res.ok:
        logger.info("Survey submitted for student_id=%s", student_id)
        await _enter_main_menu(message, state, data, lang)
        return

    logger.error("Survey failed student_id=%s: status=%s error=%s", student_id, res.status, res.error)
    await asyncio.sleep(1)
    res2 = await api_client.submit_survey(payload)
    if res2.ok:
        logger.info("Survey submitted on retry for student_id=%s", student_id)
        await _enter_main_menu(message, state, data, lang)
        return

    logger.error("Survey retry also failed student_id=%s: status=%s error=%s", student_id, res2.status, res2.error)
    await message.answer(get_text("submission_failed", lang), reply_markup=NO_KB)


# ── Bot startup ───────────────────────────────────────────────────────────────

async def start_bot():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    try:
        lock = SingleInstanceLock.acquire_for_token(settings.bot_token, name="bot2_service")
    except RuntimeError as e:
        logger.error(str(e))
        return

    bot = Bot(token=settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    api = CrmApiClient()
    dp = Dispatcher(storage=ApiStorage(api))
    cache = CatalogCache(api=api)
    setup_dependencies(api, cache)
    dp.include_router(router)

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        allowed_updates = dp.resolve_used_update_types()
        await dp.emit_startup(bot=bot)
        log_polling = logging.getLogger("aiogram.dispatcher")
        log_polling.info("Start polling")
        try:
            await _polling_exit_on_conflict(dp, bot, allowed_updates=allowed_updates)
        finally:
            log_polling.info("Polling stopped")
            await dp.emit_shutdown(bot=bot)
    finally:
        await api.close()
        with suppress(Exception):
            await bot.session.close()
        lock.release()


async def _polling_exit_on_conflict(
    dp: Dispatcher,
    bot: Bot,
    *,
    allowed_updates: list[str],
    polling_timeout: int = 10,
    backoff_config: BackoffConfig = BackoffConfig(min_delay=1.0, max_delay=5.0, factor=1.3, jitter=0.1),
) -> None:
    def _is_conflict(err: Exception) -> bool:
        if isinstance(err, TelegramConflictError):
            return True
        if ClientTelegramConflictError is not None and isinstance(err, ClientTelegramConflictError):
            return True
        if type(err).__name__ == "TelegramConflictError":
            return True
        return "terminated by other getUpdates request" in str(err)

    user = await bot.me()
    logging.getLogger("aiogram.dispatcher").info(
        "Run polling for bot @%s id=%d - %r", user.username, bot.id, user.full_name
    )

    backoff = Backoff(config=backoff_config)
    get_updates = GetUpdates(timeout=polling_timeout, allowed_updates=allowed_updates)
    kwargs: dict[str, object] = {}
    if bot.session.timeout:
        kwargs["request_timeout"] = int(bot.session.timeout + polling_timeout)

    failed = False
    while True:
        try:
            updates = await bot(get_updates, **kwargs)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            if _is_conflict(e):
                logger.error(
                    "Polling stopped: %s. Another instance is polling this token. Stop it and restart.", e
                )
                return
            failed = True
            logging.getLogger("aiogram.dispatcher").error("Failed to fetch updates - %s: %s", type(e).__name__, e)
            logging.getLogger("aiogram.dispatcher").warning(
                "Sleep %.1fs and retry (attempt=%d bot_id=%d)", backoff.next_delay, backoff.counter, bot.id
            )
            await backoff.asleep()
            continue

        if failed:
            logging.getLogger("aiogram.dispatcher").info(
                "Connection re-established (attempt=%d bot_id=%d)", backoff.counter, bot.id
            )
            backoff.reset()
            failed = False

        for update in updates:
            try:
                await dp.feed_update(bot, update)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                logging.getLogger("aiogram.dispatcher").exception(
                    "Error handling update id=%s: %s", update.update_id, e
                )
            finally:
                get_updates.offset = update.update_id + 1
