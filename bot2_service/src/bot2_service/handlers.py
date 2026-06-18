from __future__ import annotations

import asyncio
import logging
import re
from contextlib import suppress

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramConflictError
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import GetUpdates
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove
from aiogram.utils.backoff import Backoff, BackoffConfig

try:
    from aiogram.client.exceptions import TelegramConflictError as ClientTelegramConflictError
except Exception:  # pragma: no cover
    ClientTelegramConflictError = None  # type: ignore[assignment]

from bot2_service.api import CrmApiClient
from bot2_service.catalog_cache import CatalogCache
from bot2_service.config import settings
from bot2_service.keyboards import (
    birth_date_calendar,
    channels_keyboard,
    consent_keyboard,
    contact_keyboard,
    document_type_keyboard,
    gender_keyboard,
    lang_select_keyboard,
    language_keyboard,
    regions_keyboard,
    yes_no_keyboard,
)
from bot2_service.single_instance import SingleInstanceLock
from bot2_service.states import BotState
from bot2_service.texts import DOC_TYPE_MAP, get_text

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

async def _delete_previous(chat_id: int, state: FSMContext, bot: Bot):
    try:
        data = await state.get_data()
        for key in ("last_bot_msg", "last_user_msg"):
            if mid := data.get(key):
                with suppress(Exception):
                    await bot.delete_message(chat_id, mid)
    except Exception as exc:
        logger.debug("delete_previous: %s", exc)


async def _reply(message: Message, text: str, state: FSMContext, reply_markup=None, *, delete_prev: bool = True):
    bot = message.bot
    if delete_prev:
        await _delete_previous(message.chat.id, state, bot)
    await state.update_data(last_user_msg=message.message_id)
    sent = await message.answer(text, reply_markup=reply_markup)
    await state.update_data(last_bot_msg=sent.message_id)
    return sent


async def _reply_cb(call: CallbackQuery, text: str, state: FSMContext, reply_markup=None):
    with suppress(Exception):
        await call.message.delete()
    sent = await call.bot.send_message(call.message.chat.id, text, reply_markup=reply_markup)
    await state.update_data(last_bot_msg=sent.message_id)
    return sent


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
    await state.set_state(BotState.waiting_language)
    sent = await message.answer(get_text("ask_language", "uz"), reply_markup=language_keyboard())
    await state.update_data(last_bot_msg=sent.message_id)


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.clear()
    await message.answer(get_text("cancelled", lang), reply_markup=NO_KB)


@router.message(Command("retry"))
async def cmd_retry(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if not data.get("student_id"):
        await message.answer(get_text("retry_nothing", lang))
        return
    await _final_submit(message, state)


@router.message(Command("upload"))
async def cmd_upload(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    if not data.get("student_id"):
        await message.answer(get_text("upload_not_registered", lang))
        return
    await state.set_state(BotState.waiting_document_type)
    await _reply(message, get_text("ask_doc_type", lang), state, reply_markup=document_type_keyboard(lang), delete_prev=False)


# ── STEP 1: Language ──────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("lang_pick:"), BotState.waiting_language)
async def pick_language(call: CallbackQuery, state: FSMContext):
    lang = call.data.split(":")[1]
    if lang not in ("uz", "ru"):
        lang = "uz"
    await state.update_data(language=lang)
    await state.set_state(BotState.waiting_student_id)
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
    await state.update_data(
        birth_date=iso_date,
        program_id=roster.get("program_id"),
        program_name=roster.get("program_name", ""),
        course_year=roster.get("course_year", 1),
    )
    await state.set_state(BotState.waiting_consent)
    consent_text = get_text("verify_success", lang) + "\n\n" + get_text("consent_text", lang)
    await _reply(message, consent_text, state, reply_markup=consent_keyboard(lang))


# ── STEP 4: Consent ───────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("consent:"), BotState.waiting_consent)
async def handle_consent(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]

    if choice != "yes":
        await state.clear()
        with suppress(Exception):
            await call.message.delete()
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
        with suppress(Exception):
            await call.message.delete()
        await call.bot.send_message(call.message.chat.id, get_text("register_error", lang), reply_markup=NO_KB)
        await call.answer()
        return

    await state.update_data(
        telegram_user_id=call.from_user.id,
        username=call.from_user.username or "",
    )
    await state.set_state(BotState.waiting_contact)
    await _reply_cb(call, get_text("ask_contact", lang), state, reply_markup=contact_keyboard(lang))
    await call.answer()


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
    await state.set_state(BotState.waiting_first_name)
    await _reply(message, get_text("ask_first", lang), state, reply_markup=NO_KB)


@router.message(BotState.waiting_contact)
async def contact_fallback(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await _reply(message, get_text("ask_contact", lang), state, reply_markup=contact_keyboard(lang))


# ── STEP 6: First Name ────────────────────────────────────────────────────────

@router.message(BotState.waiting_first_name)
async def set_first_name(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    first_name = (message.text or "").strip()
    if not first_name:
        await _reply(message, get_text("ask_first", lang), state, reply_markup=NO_KB)
        return
    await state.update_data(first_name=first_name)
    await state.set_state(BotState.waiting_last_name)
    await _reply(message, get_text("ask_last", lang), state, reply_markup=NO_KB)


# ── STEP 7: Last Name ─────────────────────────────────────────────────────────

@router.message(BotState.waiting_last_name)
async def set_last_name(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    last_name = (message.text or "").strip()
    if not last_name:
        await _reply(message, get_text("ask_last", lang), state, reply_markup=NO_KB)
        return
    await state.update_data(last_name=last_name)
    await state.set_state(BotState.waiting_gender)
    await _reply(message, get_text("ask_gender", lang), state, reply_markup=gender_keyboard(lang))


# ── STEP 8: Gender ────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("gender:"), BotState.waiting_gender)
async def pick_gender(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    gender = call.data.split(":")[1]
    await state.update_data(gender=gender)
    regions = await catalog.get_regions()
    await state.set_state(BotState.waiting_region)
    await _reply_cb(call, get_text("ask_region", lang), state, reply_markup=regions_keyboard(regions, lang))
    await call.answer()


# ── STEP 9: Region ────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("region:"), BotState.waiting_region)
async def pick_region(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
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
    await state.set_state(BotState.waiting_employment)
    await _reply_cb(call, get_text("ask_employment", lang), state, reply_markup=yes_no_keyboard("employment", lang))
    await call.answer()


# ── STEP 10: Employment ───────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("employment:"), BotState.waiting_employment)
async def pick_employment(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(employed=choice == "yes")
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
    await state.update_data(company=(message.text or "").strip())
    await state.set_state(BotState.waiting_role)
    await _reply(message, get_text("ask_role", lang), state, reply_markup=NO_KB)


@router.message(BotState.waiting_role)
async def set_role(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(role=(message.text or "").strip())
    await state.set_state(BotState.waiting_suggestions)
    await _reply(message, get_text("ask_suggestions", lang), state, reply_markup=NO_KB)


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
        sent = await call.bot.send_message(
            call.message.chat.id, get_text("ask_share", lang), reply_markup=yes_no_keyboard("share", lang)
        )
        await state.update_data(last_bot_msg=sent.message_id)
    else:
        await state.set_state(BotState.waiting_suggestions)
        sent = await call.bot.send_message(
            call.message.chat.id, get_text("ask_suggestions", lang), reply_markup=NO_KB
        )
        await state.update_data(last_bot_msg=sent.message_id)
    await call.answer()


@router.callback_query(F.data.startswith("share:"), BotState.waiting_share_consent)
async def pick_share(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(share_consent=choice == "yes")
    with suppress(Exception):
        await call.message.delete()
    if choice == "yes":
        await call.bot.send_message(
            call.message.chat.id, get_text("channels", lang), reply_markup=channels_keyboard()
        )
    await state.set_state(BotState.waiting_suggestions)
    sent = await call.bot.send_message(
        call.message.chat.id, get_text("ask_suggestions", lang), reply_markup=NO_KB
    )
    await state.update_data(last_bot_msg=sent.message_id)
    await call.answer()


# ── Suggestions → Language Proficiency ───────────────────────────────────────

@router.message(BotState.waiting_suggestions)
async def set_suggestions(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(suggestions=(message.text or "").strip())
    await state.set_state(BotState.waiting_lang_select)
    await _reply(message, get_text("ask_lang_select", lang), state, reply_markup=lang_select_keyboard(lang))


@router.callback_query(F.data == "lang:english", BotState.waiting_lang_select)
async def pick_lang_english(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.waiting_english_level)
    await _reply_cb(call, get_text("ask_english_level", lang), state, reply_markup=NO_KB)
    await call.answer()


@router.callback_query(F.data == "lang:russian", BotState.waiting_lang_select)
async def pick_lang_russian(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.set_state(BotState.waiting_russian_level)
    await _reply_cb(call, get_text("ask_russian_level", lang), state, reply_markup=NO_KB)
    await call.answer()


@router.message(BotState.waiting_english_level)
async def set_english_level(message: Message, state: FSMContext):
    await state.update_data(english_level=(message.text or "").strip())
    await _delete_previous(message.chat.id, state, message.bot)
    with suppress(Exception):
        await message.delete()
    await _final_submit(message, state)


@router.message(BotState.waiting_russian_level)
async def set_russian_level(message: Message, state: FSMContext):
    await state.update_data(russian_level=(message.text or "").strip())
    await _delete_previous(message.chat.id, state, message.bot)
    with suppress(Exception):
        await message.delete()
    await _final_submit(message, state)


# ── Document Upload Flow ──────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("doctype:"), BotState.waiting_document_type)
async def pick_doc_type(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    doc_type_key = call.data.split(":")[1]
    await state.update_data(doc_type=doc_type_key)
    await state.set_state(BotState.waiting_document_file)
    await _reply_cb(call, get_text("ask_doc_file", lang), state, reply_markup=NO_KB)
    await call.answer()


@router.message(BotState.waiting_document_file)
async def handle_document_file(message: Message, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    student_id = data.get("student_id", "")
    doc_type_key = data.get("doc_type", "cv")
    doc_type = DOC_TYPE_MAP.get(doc_type_key, "CERT")

    file_id = None
    filename = "document"
    mime_type = "application/octet-stream"

    if message.document:
        file_id = message.document.file_id
        filename = message.document.file_name or "document.pdf"
        mime_type = message.document.mime_type or mime_type
    elif message.photo:
        photo = message.photo[-1]
        file_id = photo.file_id
        filename = "photo.jpg"
        mime_type = "image/jpeg"
    else:
        await _reply(message, get_text("doc_invalid_file", lang), state, reply_markup=NO_KB, delete_prev=False)
        return

    try:
        tg_file = await message.bot.get_file(file_id)
        file_bytes = await message.bot.download_file(tg_file.file_path)
        raw_bytes = file_bytes.read() if hasattr(file_bytes, "read") else bytes(file_bytes)
    except Exception as exc:
        logger.exception("Failed to download file: %s", exc)
        await _reply(message, get_text("doc_upload_failed", lang), state, reply_markup=NO_KB, delete_prev=False)
        return

    result = await api_client.upload_document(student_id, doc_type, raw_bytes, filename, mime_type)

    if result.ok:
        await state.set_state(None)
        await _reply(message, get_text("doc_upload_success", lang), state, reply_markup=NO_KB, delete_prev=False)
    else:
        logger.warning("upload_document failed for student_id=%s: %s", student_id, result.error)
        await _reply(message, get_text("doc_upload_failed", lang), state, reply_markup=NO_KB, delete_prev=False)


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
        logger.error("Survey submission skipped: student_id empty. data=%s", data)
        await message.answer(get_text("ask_student_id", lang), reply_markup=NO_KB)
        await state.set_state(BotState.waiting_student_id)
        return

    payload = {
        "student_external_id": str(student_id).strip(),
        "telegram_user_id": data.get("telegram_user_id"),
        "username": data.get("username", "") or "",
        "phone": data.get("phone", "") or "",
        "first_name": data.get("first_name", "") or "",
        "last_name": data.get("last_name", "") or "",
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
            "english_level": data.get("english_level", ""),
            "russian_level": data.get("russian_level", ""),
        },
    }

    logger.info("Submitting survey for student_id=%s telegram_user_id=%s", student_id, payload["telegram_user_id"])
    res = await api_client.submit_survey(payload)
    if res.ok:
        logger.info("Survey submitted for student_id=%s", student_id)
        await message.answer(get_text("thanks", lang), reply_markup=NO_KB)
        await state.clear()
        return

    logger.error("Survey failed student_id=%s: status=%s error=%s", student_id, res.status, res.error)
    await asyncio.sleep(1)
    res2 = await api_client.submit_survey(payload)
    if res2.ok:
        logger.info("Survey submitted on retry for student_id=%s", student_id)
        await message.answer(get_text("thanks", lang), reply_markup=NO_KB)
        await state.clear()
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
    dp = Dispatcher(storage=MemoryStorage())
    api = CrmApiClient()
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
