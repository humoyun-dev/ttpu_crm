from __future__ import annotations

from typing import Sequence

from aiogram.types import InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from bot2_service.texts import CHANNELS, get_text


def language_keyboard() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="🇺🇿 O'zbek", callback_data="lang_pick:uz")
    kb.button(text="🇷🇺 Русский", callback_data="lang_pick:ru")
    kb.adjust(2)
    return kb.as_markup()


def contact_keyboard(lang: str = "uz") -> ReplyKeyboardMarkup:
    text = get_text("contact_button", lang)
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        one_time_keyboard=True,
        keyboard=[[KeyboardButton(text=text, request_contact=True)]],
    )


def consent_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("consent_yes", lang), callback_data="consent:yes")
    kb.button(text=get_text("consent_no", lang), callback_data="consent:no")
    kb.adjust(2)
    return kb.as_markup()


def gender_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("gender_male", lang), callback_data="gender:male")
    kb.button(text=get_text("gender_female", lang), callback_data="gender:female")
    kb.adjust(2)
    return kb.as_markup()


def _localized_name(item: dict, lang: str) -> str:
    return (
        item.get(f"name_{lang}")
        or item.get("metadata", {}).get(f"name_{lang}")
        or item.get("name")
        or "-"
    )


def regions_keyboard(regions: Sequence[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for r in regions:
        kb.button(text=str(_localized_name(r, lang)), callback_data=f"region:{r.get('id')}")
    kb.adjust(2)
    return kb.as_markup()


def yes_no_keyboard(prefix: str, lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("yes", lang), callback_data=f"{prefix}:yes")
    kb.button(text=get_text("no", lang), callback_data=f"{prefix}:no")
    kb.adjust(2)
    return kb.as_markup()


def lang_select_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("lang_english", lang), callback_data="lang:english")
    kb.button(text=get_text("lang_russian", lang), callback_data="lang:russian")
    kb.adjust(2)
    return kb.as_markup()


def document_type_keyboard(lang: str = "uz") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=get_text("doc_type_cv", lang), callback_data="doctype:cv")
    kb.button(text=get_text("doc_type_ielts", lang), callback_data="doctype:ielts")
    kb.button(text=get_text("doc_type_cert", lang), callback_data="doctype:cert")
    kb.adjust(1)
    return kb.as_markup()


def channels_keyboard() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for channel in CHANNELS:
        kb.button(text=channel["name"], url=channel["url"])
    kb.adjust(1)
    return kb.as_markup()
