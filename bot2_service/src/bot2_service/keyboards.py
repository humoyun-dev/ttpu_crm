from __future__ import annotations

from typing import Sequence

from aiogram.types import InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from bot2_service.texts import CHANNELS, get_text


def language_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        one_time_keyboard=True,
        keyboard=[[KeyboardButton(text="🇺🇿 O'zbek"), KeyboardButton(text="🇷🇺 Русский"), KeyboardButton(text="🇬🇧 English")]],
    )


def contact_keyboard(lang: str = "uz") -> ReplyKeyboardMarkup:
    text = get_text("contact_button", lang)
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        one_time_keyboard=True,
        keyboard=[[KeyboardButton(text=text, request_contact=True)]],
    )


def gender_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("gender_male", lang), callback_data="gender:male")
    kb.button(text=get_text("gender_female", lang), callback_data="gender:female")
    kb.adjust(2)
    return kb.as_markup()


def _localized_name(item: dict, lang: str) -> str:
    """Get localized name from catalog item, falling back to default name."""
    return (
        item.get(f"name_{lang}")
        or item.get("metadata", {}).get(f"name_{lang}")
        or item.get("name")
        or "-"
    )


def regions_keyboard(regions: Sequence[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for r in regions:
        region_name = _localized_name(r, lang)
        kb.button(text=str(region_name), callback_data=f"region:{r.get('id')}")
    kb.adjust(2)
    return kb.as_markup()


def programs_keyboard(programs: Sequence[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for p in programs:
        program_name = _localized_name(p, lang)
        kb.button(text=str(program_name), callback_data=f"program:{p.get('id')}")
    kb.adjust(1)
    return kb.as_markup()


def course_year_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for year in range(1, 5):
        kb.button(text=f"{year}-kurs", callback_data=f"course:{year}")
    kb.button(text=get_text("graduated", lang), callback_data="course:5")
    kb.adjust(2)
    return kb.as_markup()


def yes_no_keyboard(prefix: str, lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("yes", lang), callback_data=f"{prefix}:yes")
    kb.button(text=get_text("no", lang), callback_data=f"{prefix}:no")
    kb.adjust(2)
    return kb.as_markup()


def channels_keyboard() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for channel in CHANNELS:
        kb.button(text=channel["name"], url=channel["url"])
    kb.adjust(1)
    return kb.as_markup()
