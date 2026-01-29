from __future__ import annotations

import calendar
from datetime import date

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder


MIN_BIRTH_YEAR = date.today().year - 17


def month_calendar(target: date) -> InlineKeyboardMarkup:
    cal = calendar.Calendar(firstweekday=0)
    kb = InlineKeyboardBuilder()
    kb.button(text="«", callback_data=f"cal:prev:{target.year}:{target.month}")
    kb.button(text=f"{target.year}-{target.month:02d}", callback_data="noop")
    kb.button(text="»", callback_data=f"cal:next:{target.year}:{target.month}")
    for week in cal.monthdayscalendar(target.year, target.month):
        for day in week:
            if day == 0:
                kb.button(text=" ", callback_data="noop")
            else:
                kb.button(text=str(day), callback_data=f"cal:day:{target.year}:{target.month}:{day}")
    kb.adjust(3, 7, 7, 7, 7, 7)
    return kb.as_markup()
