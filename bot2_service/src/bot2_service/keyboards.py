from __future__ import annotations

import calendar
from typing import Sequence

from aiogram.types import InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from bot2_service.texts import CHANNELS, get_text

_MONTH_UZ = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"]
_MONTH_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
_WEEK_UZ  = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]
_WEEK_RU  = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


def birth_date_calendar(year: int, month: int, lang: str = "uz") -> InlineKeyboardMarkup:
    """Inline calendar — year row on top, month row below, then day grid."""
    from datetime import date as _date
    today = _date.today()
    months = _MONTH_UZ if lang != "ru" else _MONTH_RU
    week_days = _WEEK_UZ if lang != "ru" else _WEEK_RU

    kb = InlineKeyboardBuilder()

    # Row 1: year navigation  ◀ 2001 ▶
    can_prev_year = year > 1970
    can_next_year = year < today.year
    kb.button(text="◀" if can_prev_year else " ",
              callback_data=f"cal:{year-1}:{month:02d}" if can_prev_year else "cal_noop")
    kb.button(text=str(year), callback_data="cal_noop")
    kb.button(text="▶" if can_next_year else " ",
              callback_data=f"cal:{year+1}:{month:02d}" if can_next_year else "cal_noop")

    # Row 2: month navigation  ◀ May ▶
    prev_m = month - 1 if month > 1 else 12
    prev_y_m = year if month > 1 else year - 1
    next_m = month + 1 if month < 12 else 1
    next_y_m = year if month < 12 else year + 1
    can_prev_month = (prev_y_m, prev_m) >= (1970, 1)
    can_next_month = (next_y_m, next_m) <= (today.year, today.month)
    kb.button(text="◀" if can_prev_month else " ",
              callback_data=f"cal:{prev_y_m}:{prev_m:02d}" if can_prev_month else "cal_noop")
    kb.button(text=months[month - 1], callback_data="cal_noop")
    kb.button(text="▶" if can_next_month else " ",
              callback_data=f"cal:{next_y_m}:{next_m:02d}" if can_next_month else "cal_noop")

    # Row 3: weekday headers
    for wd in week_days:
        kb.button(text=wd, callback_data="cal_noop")

    # Day rows
    cal = calendar.monthcalendar(year, month)
    for week in cal:
        for day in week:
            if day == 0:
                kb.button(text=" ", callback_data="cal_noop")
            else:
                d = _date(year, month, day)
                if d > today:
                    kb.button(text=" ", callback_data="cal_noop")
                else:
                    kb.button(text=str(day), callback_data=f"cal_day:{year}-{month:02d}-{day:02d}")

    # 3 (year) + 3 (month) + 7 (weekdays) + 7*weeks (days)
    kb.adjust(3, 3, 7, *([7] * len(cal)))
    return kb.as_markup()


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
