from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove
from aiogram.client.default import DefaultBotProperties
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from bot2_service.api import CrmApiClient
from bot2_service.catalog_cache import CatalogCache
from bot2_service.config import settings
from bot2_service.keyboards import (
    contact_keyboard,
    gender_keyboard,
    language_keyboard,
    programs_keyboard,
    course_year_keyboard,
    regions_keyboard,
    yes_no_keyboard,
    channels_keyboard,
)
from bot2_service.states import SurveyState
from bot2_service.texts import get_text, get_regions

logger = logging.getLogger(__name__)

router = Router()
api_client: CrmApiClient
catalog: CatalogCache
NO_KB = ReplyKeyboardRemove()


def setup_dependencies(api: CrmApiClient, catalog_cache: CatalogCache):
    global api_client, catalog
    api_client = api
    catalog = catalog_cache


def _language_from_text(text: str) -> str:
    """Detect language from button text."""
    lowered = text.lower()
    if "рус" in lowered or "🇷🇺" in lowered:
        return "ru"
    if "eng" in lowered or "🇬🇧" in lowered:
        return "en"
    return "uz"


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


# ==================== STEP 1: /start - Language Selection ====================
@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    """Start command - ask for language selection."""
    await state.clear()
    await state.set_state(SurveyState.waiting_language)
    sent = await message.answer(get_text("ask_language", "uz"), reply_markup=language_keyboard())
    await state.update_data(last_bot_message_id=sent.message_id)


# ==================== STEP 2: Language -> Contact ====================
@router.message(SurveyState.waiting_language)
async def set_language(message: Message, state: FSMContext):
    """Save language and ask for contact."""
    lang = _language_from_text(message.text or "")
    await state.update_data(language=lang)
    await state.set_state(SurveyState.waiting_contact)
    await _send_and_save(message, get_text("ask_contact", lang), state, reply_markup=contact_keyboard(lang))


# ==================== STEP 3: Contact -> First Name ====================
@router.message(SurveyState.waiting_contact, F.contact)
async def set_contact(message: Message, state: FSMContext):
    """Save contact and ask for first name."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    contact = message.contact
    await state.update_data(
        phone=contact.phone_number,
        chat_id=message.chat.id,
        telegram_user_id=message.from_user.id,
        username=message.from_user.username,
    )
    await state.set_state(SurveyState.waiting_first_name)
    await _send_and_save(message, get_text("ask_first", lang), state, reply_markup=NO_KB)


@router.message(SurveyState.waiting_contact)
async def contact_text_fallback(message: Message, state: FSMContext):
    """Handle text instead of contact - remind user to share contact."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    await _send_and_save(message, get_text("ask_contact", lang), state, reply_markup=contact_keyboard(lang))


# ==================== STEP 4: First Name -> Last Name ====================
@router.message(SurveyState.waiting_first_name)
async def set_first_name(message: Message, state: FSMContext):
    """Save first name and ask for last name."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(first_name=message.text.strip() if message.text else "")
    await state.set_state(SurveyState.waiting_last_name)
    await _send_and_save(message, get_text("ask_last", lang), state, reply_markup=NO_KB)


# ==================== STEP 5: Last Name -> Gender ====================
@router.message(SurveyState.waiting_last_name)
async def set_last_name(message: Message, state: FSMContext):
    """Save last name and ask for gender."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(last_name=message.text.strip() if message.text else "")
    await state.set_state(SurveyState.waiting_gender)
    await _send_and_save(message, get_text("ask_gender", lang), state, reply_markup=gender_keyboard(lang))


# ==================== STEP 6: Gender -> Region ====================
@router.callback_query(F.data.startswith("gender:"), SurveyState.waiting_gender)
async def pick_gender(call: CallbackQuery, state: FSMContext):
    """Save gender and ask for region."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    gender = call.data.split(":")[1]
    await state.update_data(gender=gender)
    regions = await catalog.get_regions()
    await state.set_state(SurveyState.waiting_region)
    await _send_and_save_callback(call, get_text("ask_region", lang), state, reply_markup=regions_keyboard(regions, lang))
    await call.answer()


# ==================== STEP 7: Region -> Student ID ====================
@router.callback_query(F.data.startswith("region:"), SurveyState.waiting_region)
async def pick_region(call: CallbackQuery, state: FSMContext):
    """Save region and ask for student ID."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    regions = await catalog.get_regions()
    region_key = call.data.split(":")[1]
    selected = next((r for r in regions if str(r.get("id")) == region_key), None)
    if selected:
        # Extract localized name from metadata
        region_name = selected.get("metadata", {}).get(f"name_{lang}", selected.get("name"))
        await state.update_data(
            region_id=str(selected.get("id")),
            region_code=selected.get("code"),
            region_label=region_name
        )
    await state.set_state(SurveyState.waiting_student_id)
    await _send_and_save_callback(call, get_text("ask_student_id", lang), state, reply_markup=NO_KB)
    await call.answer()


# ==================== STEP 8: Student ID -> Education Program ====================
@router.message(SurveyState.waiting_student_id)
async def set_student_id(message: Message, state: FSMContext):
    """Save student ID and ask for education program."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(student_id=message.text.strip() if message.text else "")
    programs = await catalog.get_programs()
    await state.set_state(SurveyState.waiting_program)
    await _send_and_save(message, get_text("ask_program", lang), state, reply_markup=programs_keyboard(programs, lang))


# ==================== STEP 9: Education Program -> Employment Status ====================
@router.callback_query(F.data.startswith("program:"), SurveyState.waiting_program)
async def pick_program(call: CallbackQuery, state: FSMContext):
    """Save program and ask course year."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    programs = await catalog.get_programs()
    key = call.data.split(":")[1]
    program = next((p for p in programs if str(p.get("id")) == key), None)
    if program:
        # Extract localized name from metadata
        program_name = program.get("metadata", {}).get(f"name_{lang}", program.get("name"))
        await state.update_data(
            program_id=str(program.get("id")),
            program_code=program.get("code"),
            program_label=program_name
        )
    await state.set_state(SurveyState.waiting_course_year)
    await _send_and_save_callback(call, get_text("ask_course_year", lang), state, reply_markup=course_year_keyboard())
    await call.answer()


# ==================== STEP 9b: Course year -> Employment ====================
@router.callback_query(F.data.startswith("course:"), SurveyState.waiting_course_year)
async def pick_course_year(call: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("language", "uz")
    year = int(call.data.split(":")[1])
    await state.update_data(course_year=year)
    await state.set_state(SurveyState.waiting_employment)
    await _send_and_save_callback(call, get_text("ask_employment", lang), state, reply_markup=yes_no_keyboard("employment", lang))
    await call.answer()


# ==================== STEP 10: Employment Status ====================
@router.callback_query(F.data.startswith("employment:"), SurveyState.waiting_employment)
async def employment_choice(call: CallbackQuery, state: FSMContext):
    """Handle employment choice - branch flow."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(employed=choice == "yes")
    
    if choice == "yes":
        # If employed -> ask for company name
        await state.set_state(SurveyState.waiting_company)
        await _send_and_save_callback(call, get_text("ask_company", lang), state, reply_markup=NO_KB)
    else:
        # If not employed -> ask if university should help find job
        await state.set_state(SurveyState.waiting_help)
        await _send_and_save_callback(call, get_text("ask_help", lang), state, reply_markup=yes_no_keyboard("help", lang))
    await call.answer()


# ==================== BRANCH A: Employed -> Company -> Role -> Thanks ====================
@router.message(SurveyState.waiting_company)
async def set_company(message: Message, state: FSMContext):
    """Save company name and ask for position/role."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    await state.update_data(company=message.text.strip() if message.text else "")
    await state.set_state(SurveyState.waiting_role)
    await _send_and_save(message, get_text("ask_role", lang), state, reply_markup=NO_KB)


@router.message(SurveyState.waiting_role)
async def set_role(message: Message, state: FSMContext):
    """Save role and complete the survey with thanks."""
    await state.update_data(role=message.text.strip() if message.text else "")
    # Delete previous messages before final submit
    await _delete_previous_messages(message.chat.id, state, message.bot)
    try:
        await message.delete()
    except Exception:
        pass
    await _final_submit(message, state)


# ==================== BRANCH B: Not Employed -> Help -> Share -> Channels -> Thanks ====================
@router.callback_query(F.data.startswith("help:"), SurveyState.waiting_help)
async def pick_help(call: CallbackQuery, state: FSMContext):
    """Handle 'want university help' choice."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(want_help=choice == "yes")
    
    # Delete the message with inline keyboard
    try:
        await call.message.delete()
    except Exception:
        pass
    
    if choice == "yes":
        # If wants help -> ask about sharing data with employers
        await state.set_state(SurveyState.waiting_share_consent)
        sent = await call.bot.send_message(call.message.chat.id, get_text("ask_share", lang), reply_markup=yes_no_keyboard("share", lang))
        await state.update_data(last_bot_message_id=sent.message_id)
    else:
        # If doesn't want help -> just say thanks
        await _final_submit(call.message, state)
    await call.answer()


@router.callback_query(F.data.startswith("share:"), SurveyState.waiting_share_consent)
async def pick_share(call: CallbackQuery, state: FSMContext):
    """Handle share consent choice -> show channels -> thanks."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    choice = call.data.split(":")[1]
    await state.update_data(share_consent=choice == "yes")
    
    # Delete the message with inline keyboard
    try:
        await call.message.delete()
    except Exception:
        pass
    
    # Show channels to subscribe
    await call.bot.send_message(call.message.chat.id, get_text("channels", lang), reply_markup=channels_keyboard())
    
    # Complete the survey
    await _final_submit(call.message, state, show_thanks_only=True)
    await call.answer()


# ==================== Final Submission ====================
async def _final_submit(message: Message, state: FSMContext, show_thanks_only: bool = False):
    """Submit survey data to the server and send thanks message."""
    data = await state.get_data()
    lang = data.get("language", "uz")
    
    payload = {
        "student_external_id": data.get("student_id"),
        "telegram_user_id": data.get("telegram_user_id"),
        "username": data.get("username") or "",
        "phone": data.get("phone") or "",
        "first_name": data.get("first_name") or "",
        "last_name": data.get("last_name") or "",
        "gender": data.get("gender") or "unspecified",
        "region_id": data.get("region_id"),
        "region_code": data.get("region_code"),
        "program_id": data.get("program_id"),
        "program_code": data.get("program_code"),
        "course_year": data.get("course_year"),
        "language": lang,
        "employment_status": "employed" if data.get("employed") else "unemployed",
        "employment_company": data.get("company", ""),
        "employment_role": data.get("role", ""),
        "consents": {
            "share_with_employers": data.get("share_consent", False),
            "want_help": data.get("want_help", False),
        },
        "answers": {
            "region_label": data.get("region_label"),
            "program_label": data.get("program_label"),
            "course_year": data.get("course_year"),
        },
    }
    
    res = await api_client.submit_survey(payload)
    
    if res.ok:
        await message.answer(get_text("thanks", lang), reply_markup=NO_KB)
    else:
        logger.error(f"Survey submission failed: {res.error}")
        await message.answer(get_text("thanks", lang), reply_markup=NO_KB)
    
    await state.clear()


async def start_bot():
    """Initialize and start the bot."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    bot = Bot(token=settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=MemoryStorage())
    api = CrmApiClient()
    cache = CatalogCache(api=api)
    setup_dependencies(api, cache)
    dp.include_router(router)
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await api.close()
