from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, Optional

from aiogram import F, Router, Bot
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

from bot1_service.api import CrmApiClient
from bot1_service.calendar import MIN_BIRTH_YEAR, month_calendar
from bot1_service.catalog_cache import CatalogCache
from aiogram.types import ReplyKeyboardRemove

from bot1_service.keyboards import (
    contact_keyboard,
    directions_keyboard,
    gender_keyboard,
    language_keyboard,
    main_menu_keyboard,
    regions_keyboard,
    subjects_keyboard,
    time_slots_keyboard,
    tracks_keyboard,
    yes_no_keyboard,
)
from bot1_service.states import AdmissionsState, CampusState, FoundationState, PolitoState, ProfileState
from bot1_service.store import ApplicationRecord, Store, UserProfile
from bot1_service.texts import PROMPTS, SECTION_INFO

logger = logging.getLogger(__name__)

router = Router()

# Time slots can be replaced with server-provided ones later.
DEFAULT_TIME_SLOTS = ["10:00", "11:30", "14:00", "15:30", "17:00"]
NO_KB = ReplyKeyboardRemove()

api_client: CrmApiClient
catalog_cache: CatalogCache
store: Store


def setup_dependencies(api: CrmApiClient, catalog: CatalogCache, storage: Store):
    global api_client, catalog_cache, store
    api_client = api
    catalog_cache = catalog
    store = storage


# ==================== Message Deletion Helpers ====================
async def _delete_previous_messages(chat_id: int, state: FSMContext, bot: Bot):
    """Delete previous bot and user messages to keep chat clean."""
    try:
        data = await state.get_data()
        # Delete previous bot message
        if "last_bot_message_id" in data:
            try:
                await bot.delete_message(chat_id, data["last_bot_message_id"])
            except Exception:
                pass
        # Delete previous user message
        if "last_user_message_id" in data:
            try:
                await bot.delete_message(chat_id, data["last_user_message_id"])
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"Could not delete previous messages: {e}")


async def _send_and_save(message: Message, text: str, state: FSMContext, reply_markup=None, delete_previous: bool = True):
    """Send message, save its ID, and optionally delete previous messages."""
    bot = message.bot
    chat_id = message.chat.id
    
    if delete_previous:
        await _delete_previous_messages(chat_id, state, bot)
    
    # Save current user message ID for deletion
    await state.update_data(last_user_message_id=message.message_id)
    
    # Send new message
    sent = await message.answer(text, reply_markup=reply_markup)
    
    # Save new bot message ID
    await state.update_data(last_bot_message_id=sent.message_id)
    
    return sent


async def _send_and_save_callback(call: CallbackQuery, text: str, state: FSMContext, reply_markup=None):
    """Send message from callback, save its ID, and delete previous messages."""
    bot = call.bot
    chat_id = call.message.chat.id
    
    # Delete the message with inline keyboard that was just clicked
    try:
        await call.message.delete()
    except Exception:
        pass
    
    # Send new message
    sent = await bot.send_message(chat_id, text, reply_markup=reply_markup)
    
    # Save new bot message ID
    await state.update_data(last_bot_message_id=sent.message_id)
    
    return sent


def _language_from_text(text: str) -> str:
    lowered = text.lower()
    if "рус" in lowered or "rus" in lowered:
        return "ru"
    if "eng" in lowered or "gb" in lowered:
        return "en"
    return "uz"


async def _ensure_profile(message: Message) -> UserProfile:
    user_id = message.from_user.id
    profile = store.get_profile(user_id)
    if profile:
        return profile
    profile = UserProfile(
        user_id=user_id,
        chat_id=message.chat.id,
        language="uz",
        username=message.from_user.username,
    )
    store.upsert_profile(profile)
    return profile


async def _sync_applicant(profile: UserProfile):
    payload = {
        "telegram_user_id": profile.user_id,
        "telegram_chat_id": profile.chat_id,
        "username": profile.username or "",
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "phone": profile.phone or "",
        "email": profile.email or "",
        "region_id": profile.region_id,
    }
    return await api_client.upsert_applicant(payload)


async def _ask_missing_common_extras(
    message: Message, state: FSMContext, profile: UserProfile, flow: str, 
    bot: Bot = None, chat_id: int = None
):
    """Ask for missing profile data. Uses bot.send_message if bot and chat_id provided."""
    await state.update_data(extra_flow=flow)
    _bot = bot or message.bot
    _chat_id = chat_id or message.chat.id
    
    if not profile.birth_date:
        await state.set_state(ProfileState.waiting_for_birth_date)
        target = date.today().replace(year=date.today().year - 17)
        sent = await _bot.send_message(_chat_id, PROMPTS["ask_birth"], reply_markup=month_calendar(target))
        await state.update_data(last_bot_message_id=sent.message_id)
        return True
    if not profile.gender:
        await state.set_state(ProfileState.waiting_for_gender)
        sent = await _bot.send_message(_chat_id, PROMPTS["ask_gender"], reply_markup=gender_keyboard())
        await state.update_data(last_bot_message_id=sent.message_id)
        return True
    if not (profile.region_id or profile.region_label):
        await state.set_state(ProfileState.waiting_for_region)
        regions = await catalog_cache.get_regions()
        sent = await _bot.send_message(_chat_id, PROMPTS["ask_region"], reply_markup=regions_keyboard(regions))
        await state.update_data(last_bot_message_id=sent.message_id)
        return True
    return False


async def _show_menu(message: Message, bot: Bot = None, chat_id: int = None):
    """Show main menu. Can use message.answer or bot.send_message."""
    if bot and chat_id:
        await bot.send_message(chat_id, "Kerakli bo'limni tanlang:", reply_markup=main_menu_keyboard())
    else:
        await message.answer("Kerakli bo'limni tanlang:", reply_markup=main_menu_keyboard())


async def _resume_after_extras(message: Message, state: FSMContext, bot: Bot = None, chat_id: int = None):
    """Resume flow after collecting extra profile data."""
    data = await state.get_data()
    flow = data.get("extra_flow")
    _bot = bot or message.bot
    _chat_id = chat_id or message.chat.id
    
    if flow == "foundation":
        await state.set_state(FoundationState.confirm)
        sent = await _bot.send_message(_chat_id, PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("foundation_send"))
        await state.update_data(last_bot_message_id=sent.message_id)
    elif flow == "polito":
        await state.set_state(PolitoState.confirm)
        sent = await _bot.send_message(_chat_id, PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("polito_send"))
        await state.update_data(last_bot_message_id=sent.message_id)
    elif flow == "admissions":
        await state.set_state(AdmissionsState.confirm)
        sent = await _bot.send_message(_chat_id, PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("admissions_send"))
        await state.update_data(last_bot_message_id=sent.message_id)
    elif flow == "campus":
        await state.set_state(CampusState.date)
        sent = await _bot.send_message(_chat_id, PROMPTS["ask_date"], reply_markup=month_calendar(date.today()))
        await state.update_data(last_bot_message_id=sent.message_id)


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await _ensure_profile(message)
    await state.set_state(ProfileState.waiting_for_language)
    sent = await message.answer(PROMPTS["ask_language"], reply_markup=language_keyboard())
    await state.update_data(last_bot_message_id=sent.message_id)


@router.message(ProfileState.waiting_for_language)
async def set_language(message: Message, state: FSMContext):
    lang = _language_from_text(message.text or "")
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, language=lang)
    await state.set_state(ProfileState.waiting_for_contact)
    await _send_and_save(message, PROMPTS["ask_contact"], state, reply_markup=contact_keyboard("Kontaktni ulashish"))


@router.message(ProfileState.waiting_for_contact, F.contact)
async def set_contact(message: Message, state: FSMContext):
    profile = await _ensure_profile(message)
    contact = message.contact
    phone = contact.phone_number
    chat_id = message.chat.id
    store.update_fields(profile.user_id, phone=phone, chat_id=chat_id)
    await state.set_state(ProfileState.waiting_for_first_name)
    await _send_and_save(message, PROMPTS["ask_first"], state, reply_markup=NO_KB)


@router.message(ProfileState.waiting_for_first_name)
async def set_first_name(message: Message, state: FSMContext):
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, first_name=message.text.strip() if message.text else "")
    await state.set_state(ProfileState.waiting_for_last_name)
    await _send_and_save(message, PROMPTS["ask_last"], state, reply_markup=NO_KB)


@router.message(ProfileState.waiting_for_last_name)
async def set_last_name(message: Message, state: FSMContext):
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, last_name=message.text.strip() if message.text else "")
    profile = store.get_profile(profile.user_id)
    await _sync_applicant(profile)
    # Delete previous messages before showing menu
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    await state.clear()
    await _show_menu(message)


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(call: CallbackQuery, state: FSMContext):
    section = call.data.split(":")[1]
    profile = store.get_profile(call.from_user.id)
    if not profile or not profile.phone or not profile.first_name or not profile.last_name:
        await call.message.answer("Avval /start orqali profilni to'ldiring.")
        await state.clear()
        return
    await _sync_applicant(profile)
    
    # Delete menu message
    try:
        await call.message.delete()
    except Exception:
        pass
    
    if section == "campus":
        sent = await call.bot.send_message(call.message.chat.id, SECTION_INFO["campus"])
        await state.update_data(last_bot_message_id=sent.message_id)
        await state.set_state(CampusState.org)
        sent = await call.bot.send_message(call.message.chat.id, PROMPTS["ask_org"])
        await state.update_data(last_bot_message_id=sent.message_id)
    elif section == "foundation":
        sent = await call.bot.send_message(call.message.chat.id, SECTION_INFO["foundation"])
        await state.set_state(FoundationState.second_phone)
        sent = await call.bot.send_message(call.message.chat.id, PROMPTS["ask_extra_phone"])
        await state.update_data(last_bot_message_id=sent.message_id)
    elif section == "polito":
        sent = await call.bot.send_message(call.message.chat.id, SECTION_INFO["polito"])
        subjects = await catalog_cache.get_subjects()
        if not subjects:
            await call.bot.send_message(call.message.chat.id, PROMPTS["no_catalog"])
            await state.clear()
            return
        await state.set_state(PolitoState.subject)
        sent = await call.bot.send_message(call.message.chat.id, "Fan tanlang:", reply_markup=subjects_keyboard(subjects))
        await state.update_data(last_bot_message_id=sent.message_id)
    elif section == "admissions":
        sent = await call.bot.send_message(call.message.chat.id, SECTION_INFO["admissions"])
        tracks = await catalog_cache.get_tracks()
        if not tracks:
            await call.bot.send_message(call.message.chat.id, PROMPTS["no_catalog"])
            await state.clear()
            return
        await state.set_state(AdmissionsState.track)
        sent = await call.bot.send_message(call.message.chat.id, "Trackni tanlang:", reply_markup=tracks_keyboard(tracks))
        await state.update_data(last_bot_message_id=sent.message_id)
    elif section == "profile":
        text = f"Profil:\nTelefon: {profile.phone}\nIsm: {profile.first_name}\nFamiliya: {profile.last_name}\nHudud: {profile.region_label or '-'}\nJins: {profile.gender or '-'}\nTug'ilgan sana: {profile.birth_date or '-'}"
        await call.bot.send_message(call.message.chat.id, text)
        await _show_menu(call.message, call.bot, call.message.chat.id)
    elif section == "applications":
        if not profile.applications:
            await call.bot.send_message(call.message.chat.id, "Hozircha yuborilgan ariza yo'q.")
        else:
            lines = []
            for app in profile.applications[-5:]:
                lines.append(f"{app.kind}: {app.response or 'yuborilgan'}")
            await call.bot.send_message(call.message.chat.id, "\n".join(lines))
        await _show_menu(call.message, call.bot, call.message.chat.id)
    elif section == "settings":
        await state.set_state(ProfileState.waiting_for_language)
        sent = await call.bot.send_message(call.message.chat.id, "Tilni qayta tanlang:", reply_markup=language_keyboard())
        await state.update_data(last_bot_message_id=sent.message_id)
    await call.answer()


# Campus tour flow
@router.message(CampusState.org)
async def campus_org(message: Message, state: FSMContext):
    await state.update_data(org=message.text.strip())
    await state.set_state(CampusState.title)
    await _send_and_save(message, PROMPTS["ask_title"], state)


@router.message(CampusState.title)
async def campus_title(message: Message, state: FSMContext):
    await state.update_data(title=message.text.strip())
    await state.set_state(CampusState.second_phone)
    await _send_and_save(message, PROMPTS["ask_extra_phone"], state)


@router.message(CampusState.second_phone)
async def campus_second_phone(message: Message, state: FSMContext):
    phone = message.text.strip() if message.text and message.text.lower() != "skip" else ""
    await state.update_data(second_phone=phone)
    profile = store.get_profile(message.from_user.id)
    # Delete previous messages
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    missing = await _ask_missing_common_extras(message, state, profile, flow="campus")
    if not missing:
        await state.set_state(CampusState.date)
        sent = await message.answer(PROMPTS["ask_date"], reply_markup=month_calendar(date.today()))
        await state.update_data(last_bot_message_id=sent.message_id)


@router.callback_query(F.data.startswith("cal:"), CampusState.date)
async def campus_date_picker(call: CallbackQuery, state: FSMContext):
    _, action, y, m, *rest = call.data.split(":")
    year = int(y)
    month = int(m)
    current = date(year, month, 1)
    if action == "prev":
        new_month = month - 1 or 12
        new_year = year - 1 if month == 1 else year
        if new_year < MIN_BIRTH_YEAR:
            await call.answer("Minimal yilga yetdingiz.", show_alert=False)
            return
        await call.message.edit_reply_markup(reply_markup=month_calendar(date(new_year, new_month, 1)))
        await call.answer()
        return
    if action == "next":
        new_month = month + 1 if month < 12 else 1
        new_year = year + 1 if month == 12 else year
        await call.message.edit_reply_markup(reply_markup=month_calendar(date(new_year, new_month, 1)))
        await call.answer()
        return
    if action == "day":
        day = int(rest[0])
        chosen = date(year, month, day)
        await state.update_data(preferred_date=str(chosen))
        await state.set_state(CampusState.time)
        await _send_and_save_callback(call, PROMPTS["ask_time"], state, reply_markup=time_slots_keyboard(DEFAULT_TIME_SLOTS))
        await call.answer(f"{chosen}")


@router.callback_query(F.data.startswith("time:"), CampusState.time)
async def campus_time_slot(call: CallbackQuery, state: FSMContext):
    _, value = call.data.split(":", 1)
    if value == "custom":
        await _send_and_save_callback(call, "Custom vaqt kiriting (masalan 13:30):", state)
        return
    await state.update_data(time_slot=value)
    await state.set_state(CampusState.confirm)
    data = await state.get_data()
    text = (
        "Campus tour arizasi:\n"
        f"Tashkilot: {data.get('org')}\n"
        f"Lavozim: {data.get('title')}\n"
        f"Qo'shimcha telefon: {data.get('second_phone') or '-'}\n"
        f"Sana: {data.get('preferred_date')}\n"
        f"Vaqt: {value}\n\n"
        + PROMPTS["confirm_send"]
    )
    await _send_and_save_callback(call, text, state, reply_markup=yes_no_keyboard("campus_send"))
    await call.answer()


@router.message(CampusState.time)
async def campus_custom_time(message: Message, state: FSMContext):
    await state.update_data(time_slot=message.text.strip())
    await state.set_state(CampusState.confirm)
    data = await state.get_data()
    text = (
        "Campus tour arizasi:\n"
        f"Tashkilot: {data.get('org')}\n"
        f"Lavozim: {data.get('title')}\n"
        f"Qo'shimcha telefon: {data.get('second_phone') or '-'}\n"
        f"Sana: {data.get('preferred_date')}\n"
        f"Vaqt: {message.text.strip()}\n\n"
        + PROMPTS["confirm_send"]
    )
    await _send_and_save(message, text, state, reply_markup=yes_no_keyboard("campus_send"))


@router.callback_query(F.data == "campus_send:yes", CampusState.confirm)
async def campus_send(call: CallbackQuery, state: FSMContext):
    profile = store.get_profile(call.from_user.id)
    data = await state.get_data()
    await _sync_applicant(profile)
    payload = {
        "telegram_user_id": profile.user_id,
        "telegram_chat_id": profile.chat_id,
        "username": profile.username,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "phone": profile.phone,
        "region_id": profile.region_id,
        "preferred_date": data.get("preferred_date"),
        "status": "submitted",
        "answers": {
            "organization": data.get("org"),
            "title": data.get("title"),
            "second_phone": data.get("second_phone"),
            "time_slot": data.get("time_slot"),
            "birth_date": profile.birth_date,
            "gender": profile.gender,
            "region_label": profile.region_label,
        },
    }
    res = await api_client.submit_campus_tour(payload)
    # Delete confirmation message
    try:
        await call.message.delete()
    except Exception:
        pass
    if res.ok:
        store.append_application(profile.user_id, ApplicationRecord(kind="campus_tour", payload=payload, response=res.data))
        await call.bot.send_message(call.message.chat.id, PROMPTS["thanks"])
    else:
        await call.bot.send_message(call.message.chat.id, PROMPTS["error"])
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


@router.callback_query(F.data == "campus_send:no", CampusState.confirm)
async def campus_cancel(call: CallbackQuery, state: FSMContext):
    try:
        await call.message.delete()
    except Exception:
        pass
    await call.bot.send_message(call.message.chat.id, "Bekor qilindi.")
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


# Foundation flow
@router.message(FoundationState.second_phone)
async def foundation_second_phone(message: Message, state: FSMContext):
    phone = message.text.strip() if message.text and message.text.lower() != "skip" else ""
    await state.update_data(second_phone=phone)
    profile = store.get_profile(message.from_user.id)
    # Delete previous messages
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    missing = await _ask_missing_common_extras(message, state, profile, flow="foundation")
    if not missing:
        await state.set_state(FoundationState.confirm)
        sent = await message.answer(PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("foundation_send"))
        await state.update_data(last_bot_message_id=sent.message_id)


@router.callback_query(F.data.startswith("gender:"), ProfileState.waiting_for_gender)
async def set_gender(call: CallbackQuery, state: FSMContext):
    gender = call.data.split(":")[1]
    store.update_fields(call.from_user.id, gender=gender)
    profile = store.get_profile(call.from_user.id)
    chat_id = call.message.chat.id
    # Delete gender selection message
    try:
        await call.message.delete()
    except Exception:
        pass
    if await _ask_missing_common_extras(call.message, state, profile, flow=(await state.get_data()).get("extra_flow", "foundation"), bot=call.bot, chat_id=chat_id):
        await call.answer()
        return
    await _resume_after_extras(call.message, state, bot=call.bot, chat_id=chat_id)
    await call.answer()


@router.callback_query(F.data.startswith("region:"), ProfileState.waiting_for_region)
async def set_region(call: CallbackQuery, state: FSMContext):
    regions = await catalog_cache.get_regions()
    selected_id = call.data.split(":")[1]
    selected = next((r for r in regions if str(r.get("id") or r.get("code")) == selected_id), None)
    store.update_fields(
        call.from_user.id,
        region_id=selected.get("id") or selected.get("code"),
        region_label=selected.get("name"),
    )
    profile = store.get_profile(call.from_user.id)
    chat_id = call.message.chat.id
    # Delete region selection message
    try:
        await call.message.delete()
    except Exception:
        pass
    if await _ask_missing_common_extras(call.message, state, profile, flow=(await state.get_data()).get("extra_flow", "foundation"), bot=call.bot, chat_id=chat_id):
        await call.answer()
        return
    await _resume_after_extras(call.message, state, bot=call.bot, chat_id=chat_id)
    await call.answer()


@router.callback_query(F.data.startswith("cal:"), ProfileState.waiting_for_birth_date)
async def birth_date_picker(call: CallbackQuery, state: FSMContext):
    _, action, y, m, *rest = call.data.split(":")
    year = int(y)
    month = int(m)
    if action == "prev":
        new_month = month - 1 or 12
        new_year = year - 1 if month == 1 else year
        if new_year < MIN_BIRTH_YEAR:
            await call.answer("Minimal yilga yetdingiz.", show_alert=False)
            return
        await call.message.edit_reply_markup(reply_markup=month_calendar(date(new_year, new_month, 1)))
        await call.answer()
        return
    if action == "next":
        new_month = month + 1 if month < 12 else 1
        new_year = year + 1 if month == 12 else year
        await call.message.edit_reply_markup(reply_markup=month_calendar(date(new_year, new_month, 1)))
        await call.answer()
        return
    if action == "day":
        day = int(rest[0])
        chosen = date(year, month, day)
        store.update_fields(call.from_user.id, birth_date=str(chosen))
        profile = store.get_profile(call.from_user.id)
        chat_id = call.message.chat.id
        # Delete calendar message
        try:
            await call.message.delete()
        except Exception:
            pass
        if await _ask_missing_common_extras(call.message, state, profile, flow=(await state.get_data()).get("extra_flow", "foundation"), bot=call.bot, chat_id=chat_id):
            await call.answer(f"{chosen}")
            return
        await _resume_after_extras(call.message, state, bot=call.bot, chat_id=chat_id)
        await call.answer(f"{chosen}")


@router.callback_query(F.data == "foundation_send:yes", FoundationState.confirm)
async def foundation_send(call: CallbackQuery, state: FSMContext):
    profile = store.get_profile(call.from_user.id)
    data = await state.get_data()
    await _sync_applicant(profile)
    payload = {
        "telegram_user_id": profile.user_id,
        "telegram_chat_id": profile.chat_id,
        "username": profile.username,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "phone": profile.phone,
        "region_id": profile.region_id,
        "status": "submitted",
        "answers": {
            "second_phone": data.get("second_phone"),
            "birth_date": profile.birth_date,
            "gender": profile.gender,
            "region_label": profile.region_label,
        },
    }
    res = await api_client.submit_foundation(payload)
    # Delete confirmation message
    try:
        await call.message.delete()
    except Exception:
        pass
    if res.ok:
        store.append_application(profile.user_id, ApplicationRecord(kind="foundation", payload=payload, response=res.data))
        await call.bot.send_message(call.message.chat.id, PROMPTS["thanks"])
    else:
        await call.bot.send_message(call.message.chat.id, PROMPTS["error"])
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


@router.callback_query(F.data == "foundation_send:no", FoundationState.confirm)
async def foundation_cancel(call: CallbackQuery, state: FSMContext):
    try:
        await call.message.delete()
    except Exception:
        pass
    await call.bot.send_message(call.message.chat.id, "Bekor qilindi.")
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


# Polito flow
@router.callback_query(F.data.startswith("subject:"), PolitoState.subject)
async def polito_subject(call: CallbackQuery, state: FSMContext):
    subject_id = call.data.split(":")[1]
    subjects = await catalog_cache.get_subjects()
    subject = next((s for s in subjects if str(s.get("id") or s.get("code")) == subject_id), None)
    if not subject:
        await call.answer("Topilmadi")
        return
    await state.update_data(subject_id=subject.get("id"), subject_name=subject.get("name"))
    await state.set_state(PolitoState.second_phone)
    await _send_and_save_callback(call, PROMPTS["ask_extra_phone"], state)
    await call.answer()


@router.message(PolitoState.second_phone)
async def polito_second_phone(message: Message, state: FSMContext):
    phone = message.text.strip() if message.text and message.text.lower() != "skip" else ""
    await state.update_data(second_phone=phone)
    profile = store.get_profile(message.from_user.id)
    # Delete previous messages
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    missing = await _ask_missing_common_extras(message, state, profile, flow="polito")
    if not missing:
        await state.set_state(PolitoState.confirm)
        sent = await message.answer(PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("polito_send"))
        await state.update_data(last_bot_message_id=sent.message_id)


@router.callback_query(F.data == "polito_send:yes", PolitoState.confirm)
async def polito_send(call: CallbackQuery, state: FSMContext):
    profile = store.get_profile(call.from_user.id)
    data = await state.get_data()
    await _sync_applicant(profile)
    payload = {
        "telegram_user_id": profile.user_id,
        "telegram_chat_id": profile.chat_id,
        "username": profile.username,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "phone": profile.phone,
        "region_id": profile.region_id,
        "subject": data.get("subject_id"),
        "status": "submitted",
        "answers": {
            "second_phone": data.get("second_phone"),
            "subject_name": data.get("subject_name"),
            "birth_date": profile.birth_date,
            "gender": profile.gender,
            "region_label": profile.region_label,
        },
    }
    res = await api_client.submit_polito_academy(payload)
    # Delete confirmation message
    try:
        await call.message.delete()
    except Exception:
        pass
    if res.ok:
        store.append_application(profile.user_id, ApplicationRecord(kind="polito_academy", payload=payload, response=res.data))
        await call.bot.send_message(call.message.chat.id, PROMPTS["thanks"])
    else:
        await call.bot.send_message(call.message.chat.id, PROMPTS["error"])
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


@router.callback_query(F.data == "polito_send:no", PolitoState.confirm)
async def polito_cancel(call: CallbackQuery, state: FSMContext):
    try:
        await call.message.delete()
    except Exception:
        pass
    await call.bot.send_message(call.message.chat.id, "Bekor qilindi.")
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


# Admissions flow
@router.callback_query(F.data.startswith("track:"), AdmissionsState.track)
async def admissions_track(call: CallbackQuery, state: FSMContext):
    track_id = call.data.split(":")[1]
    tracks = await catalog_cache.get_tracks()
    track = next((t for t in tracks if str(t.get("id") or t.get("code")) == track_id), None)
    if not track:
        await call.answer("Track topilmadi")
        return
    await state.update_data(track_id=track.get("id"), track_name=track.get("name"))
    directions = await catalog_cache.get_directions()
    if not directions:
        try:
            await call.message.delete()
        except Exception:
            pass
        await call.bot.send_message(call.message.chat.id, PROMPTS["no_catalog"])
        await state.clear()
        return
    await state.set_state(AdmissionsState.direction)
    await _send_and_save_callback(call, "Yo'nalishni tanlang:", state, reply_markup=directions_keyboard(directions))
    await call.answer()


@router.callback_query(F.data.startswith("direction:"), AdmissionsState.direction)
async def admissions_direction(call: CallbackQuery, state: FSMContext):
    direction_id = call.data.split(":")[1]
    directions = await catalog_cache.get_directions()
    direction = next((d for d in directions if str(d.get("id") or d.get("code")) == direction_id), None)
    if not direction:
        await call.answer("Yo'nalish topilmadi")
        return
    await state.update_data(direction_id=direction.get("id"), direction_name=direction.get("name"))
    await state.set_state(AdmissionsState.second_phone)
    await _send_and_save_callback(call, PROMPTS["ask_extra_phone"], state)
    await call.answer()


@router.message(AdmissionsState.second_phone)
async def admissions_second_phone(message: Message, state: FSMContext):
    phone = message.text.strip() if message.text and message.text.lower() != "skip" else ""
    await state.update_data(second_phone=phone)
    profile = store.get_profile(message.from_user.id)
    # Delete previous messages
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    missing = await _ask_missing_common_extras(message, state, profile, flow="admissions")
    if not missing:
        await state.set_state(AdmissionsState.confirm)
        sent = await message.answer(PROMPTS["confirm_send"], reply_markup=yes_no_keyboard("admissions_send"))
        await state.update_data(last_bot_message_id=sent.message_id)


@router.callback_query(F.data == "admissions_send:yes", AdmissionsState.confirm)
async def admissions_send(call: CallbackQuery, state: FSMContext):
    profile = store.get_profile(call.from_user.id)
    data = await state.get_data()
    if not data.get("direction_id"):
        try:
            await call.message.delete()
        except Exception:
            pass
        await call.bot.send_message(call.message.chat.id, PROMPTS["no_catalog"])
        await call.answer()
        return
    await _sync_applicant(profile)
    payload = {
        "telegram_user_id": profile.user_id,
        "telegram_chat_id": profile.chat_id,
        "username": profile.username,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "phone": profile.phone,
        "region_id": profile.region_id,
        "direction": data.get("direction_id"),
        "track": data.get("track_id"),
        "status": "submitted",
        "answers": {
            "second_phone": data.get("second_phone"),
            "track_name": data.get("track_name"),
            "direction_name": data.get("direction_name"),
            "birth_date": profile.birth_date,
            "gender": profile.gender,
            "region_label": profile.region_label,
        },
    }
    res = await api_client.submit_admissions(payload)
    # Delete confirmation message
    try:
        await call.message.delete()
    except Exception:
        pass
    if res.ok:
        store.append_application(profile.user_id, ApplicationRecord(kind="admissions_2026", payload=payload, response=res.data))
        await call.bot.send_message(call.message.chat.id, PROMPTS["thanks"])
    else:
        await call.bot.send_message(call.message.chat.id, PROMPTS["error"])
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()


@router.callback_query(F.data == "admissions_send:no", AdmissionsState.confirm)
async def admissions_cancel(call: CallbackQuery, state: FSMContext):
    try:
        await call.message.delete()
    except Exception:
        pass
    await call.bot.send_message(call.message.chat.id, "Bekor qilindi.")
    await state.clear()
    await _show_menu(call.message, call.bot, call.message.chat.id)
    await call.answer()
