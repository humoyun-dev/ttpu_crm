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

from bot1_service.keyboards import (
    back_to_menu_keyboard,
    birth_date_calendar,
    cancel_keyboard,
    contact_keyboard,
    directions_keyboard,
    gender_keyboard,
    language_keyboard,
    main_menu_keyboard,
    phone_input_keyboard,
    regions_keyboard,
    skip_keyboard,
    subjects_keyboard,
    time_slots_keyboard,
    tracks_keyboard,
    yes_no_keyboard,
    year_selector_keyboard,
    month_selector_keyboard,
    calendar_keyboard,
)
from bot1_service.states import AdmissionsState, CampusState, FoundationState, PolitoState, ProfileState
from bot1_service.store import ApplicationRecord, Store, UserProfile
from bot1_service.texts import PROMPTS, SECTION_INFO
import re

logger = logging.getLogger(__name__)

router = Router()

# Time slots
DEFAULT_TIME_SLOTS = ["10:00", "11:30", "14:00", "15:30", "17:00"]
NO_KB = ReplyKeyboardRemove()

# Phone validation pattern
PHONE_PATTERN = re.compile(r"^\+998\d{9}$")

api_client: CrmApiClient
catalog_cache: CatalogCache
store: Store


def setup_dependencies(api: CrmApiClient, catalog: CatalogCache, storage: Store):
    global api_client, catalog_cache, store
    api_client = api
    catalog_cache = catalog
    store = storage


def _validate_phone(phone: str) -> bool:
    """Validate phone number format: +998xxxxxxxxx"""
    return bool(PHONE_PATTERN.match(phone.strip()))


# ==================== Helpers ====================
def _language_from_text(text: str) -> str:
    lowered = text.lower()
    if "рус" in lowered or "rus" in lowered:
        return "ru"
    if "eng" in lowered or "gb" in lowered:
        return "en"
    return "uz"


def _gender_from_text(text: str) -> str:
    if "Erkak" in text:
        return "male"
    if "Ayol" in text:
        return "female"
    return "other"


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


async def _show_menu(message: Message):
    """Asosiy menyuni ko'rsatish"""
    await message.answer("Kerakli bo'limni tanlang:", reply_markup=main_menu_keyboard())


# ==================== /start va Profil ====================
@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await _ensure_profile(message)
    await state.set_state(ProfileState.waiting_for_language)
    await message.answer(PROMPTS["ask_language"], reply_markup=language_keyboard())


@router.message(ProfileState.waiting_for_language)
async def set_language(message: Message, state: FSMContext):
    lang = _language_from_text(message.text or "")
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, language=lang)
    await state.set_state(ProfileState.waiting_for_contact)
    await message.answer(PROMPTS["ask_contact"], reply_markup=contact_keyboard("Kontaktni ulashish"))


@router.message(ProfileState.waiting_for_contact, F.contact)
async def set_contact(message: Message, state: FSMContext):
    profile = await _ensure_profile(message)
    contact = message.contact
    phone = contact.phone_number
    chat_id = message.chat.id
    store.update_fields(profile.user_id, phone=phone, chat_id=chat_id)
    await state.set_state(ProfileState.waiting_for_first_name)
    await message.answer(PROMPTS["ask_first"], reply_markup=cancel_keyboard())


@router.message(ProfileState.waiting_for_first_name)
async def set_first_name(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await _show_menu(message)
        return
    
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, first_name=message.text.strip() if message.text else "")
    await state.set_state(ProfileState.waiting_for_last_name)
    await message.answer(PROMPTS["ask_last"], reply_markup=cancel_keyboard())


@router.message(ProfileState.waiting_for_last_name)
async def set_last_name(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await _show_menu(message)
        return
    
    profile = await _ensure_profile(message)
    store.update_fields(profile.user_id, last_name=message.text.strip() if message.text else "")
    
    # Ask for gender
    await state.set_state(ProfileState.waiting_for_gender)
    await message.answer("👤 Jinsingizni tanlang:", reply_markup=gender_keyboard())


# ==================== Asosiy menyu navigatsiyasi ====================
@router.message(F.text.in_(["🏠 Bosh sahifa", "/menu"]))
async def go_to_menu(message: Message, state: FSMContext):
    await state.clear()
    await _show_menu(message)


@router.message(F.text == "Campus Tour")
async def menu_campus(message: Message, state: FSMContext):
    profile = store.get_profile(message.from_user.id)
    if not profile or not profile.phone or not profile.first_name or not profile.last_name:
        await message.answer("Avval /start orqali profilni to'ldiring.")
        await state.clear()
        return
    await _sync_applicant(profile)
    await message.answer(SECTION_INFO["campus"], reply_markup=back_to_menu_keyboard())
    await state.set_state(CampusState.org)
    await message.answer(PROMPTS["ask_org"], reply_markup=back_to_menu_keyboard())


@router.message(F.text == "Foundation Year")
async def menu_foundation(message: Message, state: FSMContext):
    profile = store.get_profile(message.from_user.id)
    if not profile or not profile.phone or not profile.first_name or not profile.last_name:
        await message.answer("Avval /start orqali profilni to'ldiring.")
        await state.clear()
        return
    await _sync_applicant(profile)
    await message.answer(SECTION_INFO["foundation"], reply_markup=back_to_menu_keyboard())
    await state.set_state(FoundationState.second_phone)
    await message.answer("Qo'shimcha telefon raqam (+998xxxxxxxxx formatda):", reply_markup=phone_input_keyboard())


@router.message(F.text == "Polito Academy")
async def menu_polito(message: Message, state: FSMContext):
    profile = store.get_profile(message.from_user.id)
    if not profile or not profile.phone or not profile.first_name or not profile.last_name:
        await message.answer("Avval /start orqali profilni to'ldiring.")
        await state.clear()
        return
    await _sync_applicant(profile)
    await message.answer(SECTION_INFO["polito"], reply_markup=back_to_menu_keyboard())
    subjects = await catalog_cache.get_subjects()
    if not subjects:
        await message.answer(PROMPTS["no_catalog"])
        await state.clear()
        return
    await state.set_state(PolitoState.subject)
    await message.answer("Fan tanlang:", reply_markup=subjects_keyboard(subjects))


@router.message(F.text == "Qabul 2026")
async def menu_admissions(message: Message, state: FSMContext):
    profile = store.get_profile(message.from_user.id)
    if not profile or not profile.phone or not profile.first_name or not profile.last_name:
        await message.answer("Avval /start orqali profilni to'ldiring.")
        await state.clear()
        return
    await _sync_applicant(profile)
    await message.answer(SECTION_INFO["admissions"], reply_markup=back_to_menu_keyboard())
    tracks = await catalog_cache.get_tracks()
    if not tracks:
        await message.answer(PROMPTS["no_catalog"])
        await state.clear()
        return
    await state.set_state(AdmissionsState.track)
    await message.answer("Trackni tanlang:", reply_markup=tracks_keyboard(tracks))


@router.message(F.text == "Arizalarim")
async def menu_applications(message: Message, state: FSMContext):
    profile = store.get_profile(message.from_user.id)
    if not profile:
        await message.answer("Avval /start orqali profilni to'ldiring.")
        return
    if not profile.applications:
        await message.answer("Hozircha yuborilgan ariza yo'q.", reply_markup=main_menu_keyboard())
    else:
        lines = ["📋 Yuborilgan arizalar:\n"]
        for app in profile.applications[-5:]:
            status = None
            if app.meta:
                status = app.meta.get("status")
            if not status and app.response and isinstance(app.response, dict):
                status = app.response.get("status")
            status_text = status or "yuborilgan"

            if app.kind == "admissions":
                lines.append(
                    f"• Admissions 2026: {app.meta.get('track_label', '-')} / {app.meta.get('direction_label', '-')}"
                    f" — {status_text}"
                )
            elif app.kind == "polito":
                lines.append(f"• Polito Academy: {app.meta.get('subject_label', '-')} — {status_text}")
            elif app.kind == "foundation":
                lines.append(f"• Foundation Year — {status_text}")
            elif app.kind == "campus":
                org = app.meta.get("organization") or app.payload.get("organization") or "-"
                when = app.meta.get("preferred_date") or app.payload.get("preferred_date") or "-"
                time_slot = app.meta.get("time_slot") or app.payload.get("time_slot") or "-"
                when_text = when if when else "-"
                if time_slot:
                    when_text = f"{when_text} {time_slot}".strip()
                lines.append(f"• Campus Tour: {org}, {when_text} — {status_text}")
            else:
                lines.append(f"• {app.kind}: {status_text}")
        await message.answer("\n".join(lines), reply_markup=main_menu_keyboard())


@router.message(F.text == "Sozlamalar")
async def menu_settings(message: Message, state: FSMContext):
    await state.set_state(ProfileState.waiting_for_language)
    await message.answer("Tilni qayta tanlang:", reply_markup=language_keyboard())


# ==================== Campus Tour Flow ====================
@router.message(CampusState.org)
async def campus_org(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    await state.update_data(org=message.text.strip() if message.text else "")
    await state.set_state(CampusState.title)
    await message.answer(PROMPTS["ask_title"], reply_markup=back_to_menu_keyboard())


@router.message(CampusState.title)
async def campus_title(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.org)
            await message.answer(PROMPTS["ask_org"], reply_markup=back_to_menu_keyboard())
        return
    
    await state.update_data(title=message.text.strip() if message.text else "")
    await state.set_state(CampusState.second_phone)
    await message.answer("Qo'shimcha telefon raqam (+998xxxxxxxxx formatda):", reply_markup=phone_input_keyboard())


@router.message(CampusState.second_phone)
async def campus_second_phone(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.title)
            await message.answer(PROMPTS["ask_title"], reply_markup=back_to_menu_keyboard())
        return
    
    # Skip button
    if message.text and "Keyingisi" in message.text:
        await state.update_data(second_phone="")
        await state.set_state(CampusState.visitor_count)
        await message.answer("Necha kishi kelasiz? (Masalan: 5)", reply_markup=back_to_menu_keyboard())
        return
    
    phone = message.text.strip() if message.text else ""
    if phone and not _validate_phone(phone):
        await message.answer("❌ Noto'g'ri format! +998xxxxxxxxx formatda kiriting:", reply_markup=phone_input_keyboard())
        return
    
    await state.update_data(second_phone=phone)
    
    # Simplify: just ask for visitor count
    await state.set_state(CampusState.visitor_count)
    await message.answer("Necha kishi kelasiz? (Masalan: 5)", reply_markup=back_to_menu_keyboard())


@router.message(CampusState.visitor_count)
async def campus_visitor_count(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.second_phone)
            await message.answer(PROMPTS["ask_extra_phone"], reply_markup=back_to_menu_keyboard())
        return
    
    try:
        count = int(message.text.strip()) if message.text else 1
    except ValueError:
        count = 1
    await state.update_data(visitor_count=count)
    
    await state.set_state(CampusState.date)
    from datetime import date
    today = date.today()
    await message.answer("📅 Sanani tanlang:", reply_markup=calendar_keyboard(today.year, today.month))


@router.message(CampusState.date)
async def campus_date(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.visitor_count)
            await message.answer("Necha kishi kelasiz?", reply_markup=back_to_menu_keyboard())
        return
    # Inline calendar handles date selection via callback


@router.callback_query(F.data.startswith("cal_"))
async def calendar_callback(callback: CallbackQuery, state: FSMContext):
    data = callback.data
    
    if data == "cal_ignore":
        await callback.answer()
        return
    
    if data == "cal_cancel":
        await callback.answer("Bekor qilindi")
        await state.clear()
        await callback.message.delete()
        await callback.message.answer("Asosiy menyu:", reply_markup=main_menu_keyboard())
        return
    
    if data.startswith("cal_nav:"):
        # Navigate to different month
        _, year, month = data.split(":")
        await callback.message.edit_reply_markup(reply_markup=calendar_keyboard(int(year), int(month)))
        await callback.answer()
        return
    
    if data.startswith("cal_day:"):
        # Day selected - handled by calendar_day_selected
        await calendar_day_selected(callback, state)


@router.message(CampusState.time)
async def campus_time(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.date)
            await message.answer("Qaysi kun kelmoqchisiz?", reply_markup=back_to_menu_keyboard())
        return
    
    if message.text and "⏰" in message.text:
        await state.set_state(CampusState.time_custom)
        await message.answer("Vaqtni kiriting (HH:MM formatda, masalan 14:30):", reply_markup=back_to_menu_keyboard())
        return
    
    await state.update_data(time_slot=message.text.strip() if message.text else "")
    await state.set_state(CampusState.gender)
    await message.answer("Jinsingiz:", reply_markup=gender_keyboard())


@router.message(CampusState.time_custom)
async def campus_time_custom(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.time)
            await message.answer(PROMPTS["ask_time"], reply_markup=time_slots_keyboard(DEFAULT_TIME_SLOTS))
        return
    
    await state.update_data(time_slot=message.text.strip() if message.text else "")
    await state.set_state(CampusState.gender)
    await message.answer("Jinsingiz:", reply_markup=gender_keyboard())


@router.message(CampusState.gender)
async def campus_gender(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.time)
            await message.answer(PROMPTS["ask_time"], reply_markup=time_slots_keyboard(DEFAULT_TIME_SLOTS))
        return
    
    gender = "male" if message.text and "Erkak" in message.text else "female"
    await state.update_data(gender=gender, gender_label=message.text.strip() if message.text else "")
    
    regions = await catalog_cache.get_regions()
    await state.set_state(CampusState.region)
    await message.answer("Hududingiz:", reply_markup=regions_keyboard(regions))


@router.message(CampusState.region)
async def campus_region(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(CampusState.gender)
            await message.answer("Jinsingiz:", reply_markup=gender_keyboard())
        return
    
    regions = await catalog_cache.get_regions()
    selected = None
    for reg in regions:
        if isinstance(reg, dict):
            name = reg.get("name") or reg.get("name_uz") or ""
            if name and name in message.text:
                selected = reg
                break
    
    if not selected:
        await message.answer("Hudud topilmadi. Qaytadan tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    await state.update_data(region_id=selected.get("id"), region_label=selected.get("name", ""))
    await state.set_state(CampusState.confirm)
    
    data = await state.get_data()
    summary = f"""📋 Ma'lumotlarni tasdiqlang:

🏢 Tashkilot: {data.get('org', '-')}
💼 Lavozim: {data.get('title', '-')}
📞 Qo'shimcha telefon: {data.get('second_phone', '-')}
👥 Keluvchilar soni: {data.get('visitor_count', '-')}
📅 Sana: {data.get('preferred_date', '-')}
⏰ Vaqt: {data.get('time_slot', '-')}
👤 Jins: {data.get('gender_label', '-')}
🌍 Hudud: {data.get('region_label', '-')}

Yuborilsinmi?"""
    await message.answer(summary, reply_markup=yes_no_keyboard())


@router.message(CampusState.confirm)
async def campus_confirm(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await message.answer("Bekor qilindi.", reply_markup=main_menu_keyboard())
        return
    
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    if message.text and "✅" in message.text:
        data = await state.get_data()
        profile = store.get_profile(message.from_user.id)
        
        # Build answers with form data
        answers = {
            "organization": data.get("org", ""),
            "position": data.get("title", ""),
            "visitor_count": data.get("visitor_count", 1),
            "preferred_date": data.get("preferred_date", ""),
            "time_slot": data.get("time_slot", ""),
        }
        if data.get("second_phone"):
            answers["second_phone"] = data.get("second_phone")
        if data.get("gender"):
            answers["gender"] = data.get("gender")
        if data.get("region_label"):
            answers["region"] = data.get("region_label")
        
        payload = {
            "telegram_user_id": profile.user_id,
            "telegram_chat_id": profile.chat_id,
            "username": profile.username or "",
            "first_name": profile.first_name or "",
            "last_name": profile.last_name or "",
            "phone": profile.phone or "",
            "email": profile.email or "",
            "region_id": data.get("region_id") or profile.region_id,
            "answers": answers,
        }
        
        try:
            resp = await api_client.submit_campus_tour(payload)
            app = ApplicationRecord(
                kind="campus",
                payload=payload,
                response=resp.data if resp.ok else None,
                meta={
                    "organization": data.get("org"),
                    "preferred_date": data.get("preferred_date"),
                    "time_slot": data.get("time_slot"),
                    "status": (resp.data or {}).get("status") if resp.ok else None,
                },
            )
            store.append_application(profile.user_id, app)
            await message.answer("✅ Ariza yuborildi! Tez orada siz bilan bog'lanamiz.", reply_markup=main_menu_keyboard())
        except Exception as e:
            logger.error(f"Campus tour submission failed: {e}")
            await message.answer(f"❌ Xatolik: {e}", reply_markup=main_menu_keyboard())
        
        await state.clear()


# ==================== Foundation Year Flow ====================
@router.message(FoundationState.second_phone)
async def foundation_second_phone(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    # Skip button
    if message.text and "Keyingisi" in message.text:
        await state.update_data(second_phone="")
        await state.set_state(FoundationState.gender)
        await message.answer("Jinsingiz:", reply_markup=gender_keyboard())
        return
    
    phone = message.text.strip() if message.text else ""
    if phone and not _validate_phone(phone):
        await message.answer("❌ Noto'g'ri format! +998xxxxxxxxx formatda kiriting:", reply_markup=phone_input_keyboard())
        return
    
    await state.update_data(second_phone=phone)
    await state.set_state(FoundationState.gender)
    await message.answer("Jinsingiz:", reply_markup=gender_keyboard())


@router.message(FoundationState.gender)
async def foundation_gender(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(FoundationState.second_phone)
            await message.answer(PROMPTS["ask_extra_phone"], reply_markup=back_to_menu_keyboard())
        return
    
    gender = "male" if message.text and "Erkak" in message.text else "female"
    await state.update_data(gender=gender, gender_label=message.text.strip() if message.text else "")
    
    regions = await catalog_cache.get_regions()
    await state.set_state(FoundationState.region)
    await message.answer("Hududingiz:", reply_markup=regions_keyboard(regions))


@router.message(FoundationState.region)
async def foundation_region(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(FoundationState.gender)
            await message.answer("Jinsingiz:", reply_markup=gender_keyboard())
        return
    
    regions = await catalog_cache.get_regions()
    selected = None
    for reg in regions:
        if isinstance(reg, dict):
            name = reg.get("name") or reg.get("name_uz") or ""
            if name and name in message.text:
                selected = reg
                break
    
    if not selected:
        await message.answer("Hudud topilmadi. Qaytadan tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    await state.update_data(region_id=selected.get("id"), region_label=selected.get("name", ""))
    await state.set_state(FoundationState.confirm)
    
    data = await state.get_data()
    summary = f"""📋 Ma'lumotlarni tasdiqlang:

📞 Qo'shimcha telefon: {data.get('second_phone', '-')}
👤 Jins: {data.get('gender_label', '-')}
🌍 Hudud: {data.get('region_label', '-')}

Yuborilsinmi?"""
    await message.answer(summary, reply_markup=yes_no_keyboard())


@router.message(FoundationState.confirm)
async def foundation_confirm(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await message.answer("Bekor qilindi.", reply_markup=main_menu_keyboard())
        return
    
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    if message.text and "✅" in message.text:
        data = await state.get_data()
        profile = store.get_profile(message.from_user.id)
        
        # Build answers with form data
        answers = {}
        if data.get("second_phone"):
            answers["second_phone"] = data.get("second_phone")
        if data.get("gender"):
            answers["gender"] = data.get("gender")
        if data.get("region_label"):
            answers["region"] = data.get("region_label")
        
        payload = {
            "telegram_user_id": profile.user_id,
            "telegram_chat_id": profile.chat_id,
            "username": profile.username or "",
            "first_name": profile.first_name or "",
            "last_name": profile.last_name or "",
            "phone": profile.phone or "",
            "email": profile.email or "",
            "region_id": data.get("region_id") or profile.region_id,
            "answers": answers,
        }
        
        try:
            resp = await api_client.submit_foundation(payload)
            app = ApplicationRecord(
                kind="foundation",
                payload=payload,
                response=resp.data if resp.ok else None,
                meta={
                    "status": (resp.data or {}).get("status") if resp.ok else None,
                },
            )
            store.append_application(profile.user_id, app)
            await message.answer("✅ Ariza yuborildi!", reply_markup=main_menu_keyboard())
        except Exception as e:
            logger.error(f"Foundation submission failed: {e}")
            await message.answer(f"❌ Xatolik: {e}", reply_markup=main_menu_keyboard())
        
        await state.clear()


# ==================== Polito Academy Flow ====================
@router.message(PolitoState.subject)
async def polito_subject(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    # Find subject by name
    subjects = await catalog_cache.get_subjects()
    selected = None
    for subj in subjects:
        if isinstance(subj, dict):
            name = subj.get("name") or subj.get("name_uz") or ""
            if name and name in message.text:
                selected = subj
                break
    
    if not selected:
        await message.answer("Fan topilmadi. Qaytadan tanlang:", reply_markup=subjects_keyboard(subjects))
        return
    
    await state.update_data(subject_id=selected.get("id"), subject_label=selected.get("name", ""))
    await state.set_state(PolitoState.gender)
    await message.answer("Jinsingiz:", reply_markup=gender_keyboard())


@router.message(PolitoState.gender)
async def polito_gender(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            subjects = await catalog_cache.get_subjects()
            await state.set_state(PolitoState.subject)
            await message.answer("Fan tanlang:", reply_markup=subjects_keyboard(subjects))
        return
    
    gender = "male" if message.text and "Erkak" in message.text else "female"
    await state.update_data(gender=gender, gender_label=message.text.strip() if message.text else "")
    
    regions = await catalog_cache.get_regions()
    await state.set_state(PolitoState.region)
    await message.answer("Hududingiz:", reply_markup=regions_keyboard(regions))


@router.message(PolitoState.region)
async def polito_region(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            await state.set_state(PolitoState.gender)
            await message.answer("Jinsingiz:", reply_markup=gender_keyboard())
        return
    
    regions = await catalog_cache.get_regions()
    selected = None
    for reg in regions:
        if isinstance(reg, dict):
            name = reg.get("name") or reg.get("name_uz") or ""
            if name and name in message.text:
                selected = reg
                break
    
    if not selected:
        await message.answer("Hudud topilmadi. Qaytadan tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    await state.update_data(region_id=selected.get("id"), region_label=selected.get("name", ""))
    await state.set_state(PolitoState.confirm)
    
    data = await state.get_data()
    summary = f"""📋 Ma'lumotlarni tasdiqlang:

📚 Fan: {data.get('subject_label', '-')}
👤 Jins: {data.get('gender_label', '-')}
🌍 Hudud: {data.get('region_label', '-')}

Yuborilsinmi?"""
    await message.answer(summary, reply_markup=yes_no_keyboard())


@router.message(PolitoState.confirm)
async def polito_confirm(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await message.answer("Bekor qilindi.", reply_markup=main_menu_keyboard())
        return
    
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    if message.text and "✅" in message.text:
        data = await state.get_data()
        profile = store.get_profile(message.from_user.id)
        
        # Build answers with form data
        answers = {}
        if data.get("gender"):
            answers["gender"] = data.get("gender")
        if data.get("region_label"):
            answers["region"] = data.get("region_label")
        if data.get("subject_label"):
            answers["subject"] = data.get("subject_label")
        
        payload = {
            "telegram_user_id": profile.user_id,
            "telegram_chat_id": profile.chat_id,
            "username": profile.username or "",
            "first_name": profile.first_name or "",
            "last_name": profile.last_name or "",
            "phone": profile.phone or "",
            "email": profile.email or "",
            "region_id": data.get("region_id") or profile.region_id,
            "subject_id": data.get("subject_id"),
            "answers": answers,
        }
        
        try:
            resp = await api_client.submit_polito_academy(payload)
            app = ApplicationRecord(
                kind="polito",
                payload=payload,
                response=resp.data if resp.ok else None,
                meta={
                    "subject_label": data.get("subject_label"),
                    "status": (resp.data or {}).get("status") if resp.ok else None,
                },
            )
            store.append_application(profile.user_id, app)
            await message.answer("✅ Ariza yuborildi!", reply_markup=main_menu_keyboard())
        except Exception as e:
            logger.error(f"Polito submission failed: {e}")
            await message.answer(f"❌ Xatolik: {e}", reply_markup=main_menu_keyboard())
        
        await state.clear()


# ==================== Admissions 2026 Flow ====================
@router.message(AdmissionsState.track)
async def admissions_track(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    # Find track by name
    tracks = await catalog_cache.get_tracks()
    selected = None
    for track in tracks:
        if isinstance(track, dict):
            name = track.get("name") or track.get("name_uz") or ""
            if name and name in message.text:
                selected = track
                break
    
    if not selected:
        await message.answer("Track topilmadi. Qaytadan tanlang:", reply_markup=tracks_keyboard(tracks))
        return
    
    await state.update_data(track_id=selected.get("id"), track_label=selected.get("name", ""))
    
    # Fetch directions
    directions = await catalog_cache.get_directions()
    if not directions:
        await message.answer(PROMPTS["no_catalog"])
        await state.clear()
        return
    
    await state.set_state(AdmissionsState.direction)
    await message.answer("Yo'nalish tanlang:", reply_markup=directions_keyboard(directions))


@router.message(AdmissionsState.direction)
async def admissions_direction(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            tracks = await catalog_cache.get_tracks()
            await state.set_state(AdmissionsState.track)
            await message.answer("Trackni tanlang:", reply_markup=tracks_keyboard(tracks))
        return
    
    # Find direction by name
    directions = await catalog_cache.get_directions()
    selected = None
    for direction in directions:
        if isinstance(direction, dict):
            name = direction.get("name") or direction.get("name_uz") or ""
            if name and name in message.text:
                selected = direction
                break
    
    if not selected:
        await message.answer("Yo'nalish topilmadi. Qaytadan tanlang:", reply_markup=directions_keyboard(directions))
        return
    
    await state.update_data(direction_id=selected.get("id"), direction_label=selected.get("name", ""))
    
    # Region so'rash
    regions = await catalog_cache.get_regions()
    if not regions:
        await message.answer("Hududlar topilmadi")
        await state.clear()
        return
    
    await state.set_state(AdmissionsState.region)
    await message.answer("Qaysi hududda yashaysiz?", reply_markup=regions_keyboard(regions))


@router.message(AdmissionsState.region)
async def admissions_region(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            directions = await catalog_cache.get_directions()
            await state.set_state(AdmissionsState.direction)
            await message.answer("Yo'nalish tanlang:", reply_markup=directions_keyboard(directions))
        return
    
    # Find region by name
    regions = await catalog_cache.get_regions()
    selected = None
    for region in regions:
        if isinstance(region, dict):
            name = region.get("name") or region.get("name_uz") or ""
            if name and name in message.text:
                selected = region
                break
    
    if not selected:
        await message.answer("Hudud topilmadi. Qaytadan tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    await state.update_data(region_id=selected.get("id"), region_label=selected.get("name", ""))
    await state.set_state(AdmissionsState.second_phone)
    await message.answer("Qo'shimcha telefon raqam (+998xxxxxxxxx formatda):", reply_markup=phone_input_keyboard())


@router.message(AdmissionsState.second_phone)
async def admissions_second_phone(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        if "🏠" in message.text:
            await state.clear()
            await _show_menu(message)
        else:
            regions = await catalog_cache.get_regions()
            await state.set_state(AdmissionsState.region)
            await message.answer("Qaysi hududda yashaysiz?", reply_markup=regions_keyboard(regions))
        return
    
    # Skip button
    if message.text and "Keyingisi" in message.text:
        await state.update_data(second_phone="")
        await state.set_state(AdmissionsState.confirm)
        data = await state.get_data()
        summary = f"""📋 Ma'lumotlarni tasdiqlang:

📚 Track: {data.get('track_label', '-')}
🎯 Yo'nalish: {data.get('direction_label', '-')}
🌍 Hudud: {data.get('region_label', '-')}
📞 Qo'shimcha telefon: -

Yuborilsinmi?"""
        await message.answer(summary, reply_markup=yes_no_keyboard())
        return
    
    phone = message.text.strip() if message.text else ""
    if phone and not _validate_phone(phone):
        await message.answer("❌ Noto'g'ri format! +998xxxxxxxxx formatda kiriting:", reply_markup=phone_input_keyboard())
        return
    
    await state.update_data(second_phone=phone)
    
    await state.set_state(AdmissionsState.confirm)
    data = await state.get_data()
    summary = f"""📋 Ma'lumotlarni tasdiqlang:

Track: {data.get('track_label', '-')}
Yo'nalish: {data.get('direction_label', '-')}
Hudud: {data.get('region_label', '-')}
Ikkinchi telefon: {data.get('second_phone', '-')}

Yuborilsinmi?"""
    await message.answer(summary, reply_markup=yes_no_keyboard())


@router.message(AdmissionsState.confirm)
async def admissions_confirm(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await message.answer("Bekor qilindi.", reply_markup=main_menu_keyboard())
        return
    
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    if message.text and "✅" in message.text:
        data = await state.get_data()
        profile = store.get_profile(message.from_user.id)
        
        # Build answers with form data
        answers = {}
        if profile.gender:
            answers["gender"] = profile.gender
        if profile.birth_date:
            answers["birth_date"] = profile.birth_date
        if data.get("second_phone"):
            answers["second_phone"] = data.get("second_phone")
        if data.get("region_label"):
            answers["region"] = data.get("region_label")
        
        payload = {
            "telegram_user_id": profile.user_id,
            "telegram_chat_id": profile.chat_id,
            "username": profile.username or "",
            "first_name": profile.first_name or "",
            "last_name": profile.last_name or "",
            "phone": profile.phone or "",
            "email": profile.email or "",
            "region_id": data.get("region_id") or profile.region_id,
            "track_id": data.get("track_id"),
            "direction_id": data.get("direction_id"),
            "answers": answers,
        }
        
        logger.info(f"Admissions payload: {payload}")
        
        try:
            resp = await api_client.submit_admissions(payload)
            app = ApplicationRecord(
                kind="admissions",
                payload=payload,
                response=resp.data if resp.ok else None,
                meta={
                    "track_label": data.get("track_label"),
                    "direction_label": data.get("direction_label"),
                    "region_label": data.get("region_label"),
                    "status": (resp.data or {}).get("status") if resp.ok else None,
                },
            )
            store.append_application(profile.user_id, app)
            await message.answer("✅ Ariza yuborildi!", reply_markup=main_menu_keyboard())
        except Exception as e:
            logger.error(f"Admissions submission failed: {e}")
            await message.answer(f"❌ Xatolik: {e}", reply_markup=main_menu_keyboard())
        
        await state.clear()


# ==================== Profile extras (gender, region, birth_date) ====================
@router.message(ProfileState.waiting_for_gender)
async def set_gender(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    gender = _gender_from_text(message.text or "")
    profile = store.get_profile(message.from_user.id)
    store.update_fields(profile.user_id, gender=gender)
    
    # Ask for birth date
    await state.set_state(ProfileState.waiting_for_birth_date)
    from datetime import date
    default_year = date.today().year - 17  # 17 yoshli yil
    await message.answer("📅 Tug'ilgan sanangizni tanlang:", reply_markup=birth_date_calendar(default_year, 1))


@router.message(ProfileState.waiting_for_email)
async def set_email(message: Message, state: FSMContext):
    if message.text and "❌" in message.text:
        await state.clear()
        await _show_menu(message)
        return
    
    # Check if skip
    if message.text and "⏭️" in message.text:
        # Skip email, go to region
        await state.set_state(ProfileState.waiting_for_region)
        regions = await catalog_cache.get_regions()
        await message.answer("🌍 Hududingizni tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    # Simple email validation
    email = message.text.strip() if message.text else ""
    if email and "@" in email and "." in email:
        profile = store.get_profile(message.from_user.id)
        store.update_fields(profile.user_id, email=email)
        
        # Ask for region
        await state.set_state(ProfileState.waiting_for_region)
        regions = await catalog_cache.get_regions()
        await message.answer("🌍 Hududingizni tanlang:", reply_markup=regions_keyboard(regions))
    elif not email:
        # Empty message - ask to use skip button
        await message.answer("📧 Email kiriting yoki \"O'tkazib yuborish\" tugmasini bosing:", reply_markup=skip_keyboard())
    else:
        await message.answer("❌ Noto'g'ri email format. Qayta kiriting yoki \"O'tkazib yuborish\" tugmasini bosing:\n(Misol: name@example.com)", reply_markup=skip_keyboard())


@router.message(ProfileState.waiting_for_region)
async def set_region(message: Message, state: FSMContext):
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return
    
    # Find region by name
    regions = await catalog_cache.get_regions()
    selected = None
    for region in regions:
        if isinstance(region, dict):
            name = region.get("name") or region.get("name_uz") or ""
            if name and name in message.text:
                selected = region
                break
    
    if not selected:
        await message.answer("Hudud topilmadi. Qaytadan tanlang:", reply_markup=regions_keyboard(regions))
        return
    
    profile = store.get_profile(message.from_user.id)
    store.update_fields(profile.user_id, region_id=selected.get("id"), region_label=selected.get("name", ""))
    await state.clear()
    
    # Sync all profile data to server
    profile = store.get_profile(message.from_user.id)
    await _sync_applicant(profile)
    
    await message.answer("✅ Ro'yxatdan o'tish tugallandi!\n\nBarcha ma'lumotlaringiz saqlandi. Endi kerakli bo'limni tanlang:", reply_markup=main_menu_keyboard())


@router.message(ProfileState.waiting_for_birth_date)
async def set_birth_date(message: Message, state: FSMContext):
    # This handler is for text input fallback, but we use inline calendar now
    if message.text and ("🏠" in message.text or "◀️" in message.text):
        await state.clear()
        await _show_menu(message)
        return


# ==================== Birth Date Inline Calendar ====================
@router.callback_query(F.data.startswith("birth_year:"))
async def birth_year_selected(callback: CallbackQuery, state: FSMContext):
    """User selected birth year, now show month selector"""
    year = callback.data.split(":")[1]
    await state.update_data(birth_year=year)
    
    # Show month selector
    await callback.message.edit_reply_markup(reply_markup=month_selector_keyboard(int(year)))
    await callback.answer(f"Yil: {year}")


@router.callback_query(F.data.startswith("birth_year_nav:"))
async def birth_year_navigation(callback: CallbackQuery, state: FSMContext):
    """Navigate between years in birth date calendar"""
    _, year, month = callback.data.split(":")
    year, month = int(year), int(month)
    
    # Limit year range
    from datetime import date
    current_year = date.today().year
    max_year = current_year - 17  # Minimum age 17
    if year > max_year:
        year = max_year
    if year < 1960:
        year = 1960
    
    await callback.message.edit_reply_markup(reply_markup=birth_date_calendar(year, month))
    await callback.answer()


@router.callback_query(F.data.startswith("birth_month_nav:"))
async def birth_month_navigation(callback: CallbackQuery, state: FSMContext):
    """Navigate between months in birth date calendar"""
    _, year, month = callback.data.split(":")
    year, month = int(year), int(month)
    
    # Handle year change when navigating months
    if month < 1:
        month = 12
        year -= 1
    elif month > 12:
        month = 1
        year += 1
    
    # Limit year range
    from datetime import date
    current_year = date.today().year
    max_year = current_year - 17
    if year > max_year:
        year = max_year
        month = 12
    if year < 1960:
        year = 1960
        month = 1
    
    await callback.message.edit_reply_markup(reply_markup=birth_date_calendar(year, month))
    await callback.answer()


@router.callback_query(F.data.startswith("birth_day:"))
async def birth_day_selected(callback: CallbackQuery, state: FSMContext):
    """Birth date day selected in big calendar"""
    _, year, month, day = callback.data.split(":")
    year, month, day = int(year), int(month), int(day)
    
    from datetime import date
    birth_date = date(year, month, day)
    
    # Calculate age
    today = date.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    
    # Validate minimum age
    if age < 17:
        await callback.answer("⚠️ Yoshingiz kamida 17 bo'lishi kerak!", show_alert=True)
        return
    
    # Save birth date
    profile = store.get_profile(callback.from_user.id)
    birth_date_str = birth_date.strftime("%Y-%m-%d")
    store.update_fields(profile.user_id, birth_date=birth_date_str)
    
    await callback.message.delete()
    
    # Ask for email
    await state.set_state(ProfileState.waiting_for_email)
    await callback.message.answer("📧 Email manzilingizni kiriting yoki o'tkazib yuboring:\n(Misol: name@example.com)", reply_markup=skip_keyboard())
    await callback.answer()


@router.callback_query(F.data.startswith("cal_day:"))
async def calendar_day_selected(callback: CallbackQuery, state: FSMContext):
    """Campus tour date day selected"""
    _, year, month, day = callback.data.split(":")
    year, month, day = int(year), int(month), int(day)
    
    # Campus tour date selection
    from datetime import date
    selected_date = date(year, month, day)
    selected_date_str = selected_date.strftime("%Y-%m-%d")
    await state.update_data(preferred_date=selected_date_str)
    await callback.message.delete()
    await state.set_state(CampusState.time)
    await callback.message.answer(f"📅 Sana: {selected_date.strftime('%d.%m.%Y')}\n\n{PROMPTS['ask_time']}", reply_markup=time_slots_keyboard(DEFAULT_TIME_SLOTS))
    await callback.answer()


@router.callback_query(F.data.in_(["year_ignore", "month_ignore", "day_ignore", "cal_ignore"]))
async def calendar_ignore(callback: CallbackQuery):
    await callback.answer()
