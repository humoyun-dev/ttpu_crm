from __future__ import annotations

from typing import List, Sequence

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder


def language_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="O'zbek 🇺🇿"), KeyboardButton(text="Русский 🇷🇺"), KeyboardButton(text="English 🇬🇧")],
        ],
    )


def contact_keyboard(text: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(resize_keyboard=True, keyboard=[[KeyboardButton(text=text, request_contact=True)]])


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Asosiy menyu - Reply keyboard"""
    kb = ReplyKeyboardBuilder()
    kb.button(text="Campus Tour")
    kb.button(text="Qabul 2026")
    kb.button(text="Foundation Year")
    kb.button(text="Polito Academy")
    kb.button(text="Arizalarim")
    kb.button(text="Sozlamalar")
    kb.adjust(2, 2, 2)
    return kb.as_markup(resize_keyboard=True)


def back_to_menu_keyboard() -> ReplyKeyboardMarkup:
    """Ortga va Bosh sahifa tugmalari"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="◀️ Ortga"), KeyboardButton(text="🏠 Bosh sahifa")],
        ],
    )


def cancel_keyboard() -> ReplyKeyboardMarkup:
    """Bekor qilish tugmasi"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="❌ Bekor qilish")],
        ],
    )


def skip_keyboard() -> ReplyKeyboardMarkup:
    """O'tkazib yuborish tugmasi"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="⏭️ O'tkazib yuborish")],
            [KeyboardButton(text="❌ Bekor qilish")],
        ],
    )


def phone_input_keyboard() -> ReplyKeyboardMarkup:
    """Telefon kiritish - Keyingisi va ortga tugmalari"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="Keyingisi ➡️")],
            [KeyboardButton(text="◀️ Ortga"), KeyboardButton(text="🏠 Bosh sahifa")],
        ],
    )


def gender_keyboard() -> ReplyKeyboardMarkup:
    """Jins tanlash - Reply keyboard"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="Erkak"), KeyboardButton(text="Ayol")],
            [KeyboardButton(text="◀️ Ortga")],
        ],
    )


def yes_no_keyboard(prefix: str = "confirm") -> ReplyKeyboardMarkup:
    """Ha/Yo'q tugmalari - Reply keyboard"""
    return ReplyKeyboardMarkup(
        resize_keyboard=True,
        keyboard=[
            [KeyboardButton(text="✅ Ha"), KeyboardButton(text="❌ Yo'q")],
            [KeyboardButton(text="◀️ Ortga")],
        ],
    )


def list_keyboard(items: Sequence[dict], label_key: str = "name") -> ReplyKeyboardMarkup:
    """Ro'yxat tugmalari - Reply keyboard, 2 ustunli"""
    kb = ReplyKeyboardBuilder()
    for item in items:
        if not isinstance(item, dict):
            continue
        # Try name, name_uz, code, id in order
        label = (
            item.get(label_key) 
            or item.get("name") 
            or item.get("name_uz") 
            or item.get("code") 
            or item.get("id")
        )
        if label:
            kb.button(text=str(label))
    # Ortga va Bosh sahifa tugmalari
    kb.button(text="◀️ Ortga")
    kb.button(text="🏠 Bosh sahifa")
    kb.adjust(2)  # 2 ustunli
    return kb.as_markup(resize_keyboard=True)


def tracks_keyboard(tracks: Sequence[dict]) -> ReplyKeyboardMarkup:
    return list_keyboard(tracks)


def directions_keyboard(directions: Sequence[dict]) -> ReplyKeyboardMarkup:
    return list_keyboard(directions)


def subjects_keyboard(subjects: Sequence[dict]) -> ReplyKeyboardMarkup:
    return list_keyboard(subjects)


def regions_keyboard(regions: Sequence[dict]) -> ReplyKeyboardMarkup:
    return list_keyboard(regions)


def time_slots_keyboard(slots: List[str]) -> ReplyKeyboardMarkup:
    """Vaqt slotlari - Reply keyboard"""
    kb = ReplyKeyboardBuilder()
    for slot in slots:
        kb.button(text=slot)
    kb.button(text="⏰ Boshqa vaqt")
    kb.button(text="◀️ Ortga")
    kb.adjust(3, 1, 1)  # 3 ustun vaqtlar, keyin boshqa vaqt, keyin ortga
    return kb.as_markup(resize_keyboard=True)


# ==================== Inline Calendar ====================
import calendar
from datetime import date


def calendar_keyboard(year: int, month: int) -> InlineKeyboardMarkup:
    """Inline kalendar - oy va yil tanlash bilan"""
    kb = InlineKeyboardBuilder()
    
    # Oy nomi va yil
    month_names = ["", "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
                   "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"]
    kb.button(text=f"📅 {month_names[month]} {year}", callback_data="cal_ignore")
    kb.adjust(1)
    
    # Hafta kunlari
    days_row = []
    for day in ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]:
        days_row.append(InlineKeyboardButton(text=day, callback_data="cal_ignore"))
    kb.row(*days_row)
    
    # Kunlar
    cal = calendar.monthcalendar(year, month)
    for week in cal:
        row = []
        for day in week:
            if day == 0:
                row.append(InlineKeyboardButton(text=" ", callback_data="cal_ignore"))
            else:
                row.append(InlineKeyboardButton(text=str(day), callback_data=f"cal_day:{year}:{month}:{day}"))
        kb.row(*row)
    
    # Navigatsiya
    prev_month = month - 1
    prev_year = year
    if prev_month < 1:
        prev_month = 12
        prev_year -= 1
    
    next_month = month + 1
    next_year = year
    if next_month > 12:
        next_month = 1
        next_year += 1
    
    kb.row(
        InlineKeyboardButton(text="◀️", callback_data=f"cal_nav:{prev_year}:{prev_month}"),
        InlineKeyboardButton(text="Bugun", callback_data=f"cal_day:{date.today().year}:{date.today().month}:{date.today().day}"),
        InlineKeyboardButton(text="▶️", callback_data=f"cal_nav:{next_year}:{next_month}")
    )
    
    # Bekor qilish
    kb.row(InlineKeyboardButton(text="❌ Bekor qilish", callback_data="cal_cancel"))
    
    return kb.as_markup()


def year_selector_keyboard(start_year: int = 1990, end_year: int = 2015) -> InlineKeyboardMarkup:
    """Yil tanlash - tug'ilgan yil uchun"""
    kb = InlineKeyboardBuilder()
    kb.button(text="📅 Yilni tanlang", callback_data="year_ignore")
    kb.adjust(1)
    
    # Yillar 4 ustunli
    years = list(range(end_year, start_year - 1, -1))
    for year in years:
        kb.button(text=str(year), callback_data=f"birth_year:{year}")
    kb.adjust(1, 4)
    
    kb.row(InlineKeyboardButton(text="❌ Bekor qilish", callback_data="cal_cancel"))
    return kb.as_markup()


def birth_date_calendar(year: int, month: int) -> InlineKeyboardMarkup:
    """Birth date calendar - year navigation, day calendar, month navigation"""
    kb = InlineKeyboardBuilder()
    
    # Year navigation
    kb.row(
        InlineKeyboardButton(text="◀️", callback_data=f"birth_year_nav:{year-1}:{month}"),
        InlineKeyboardButton(text=f"📅 {year} yil", callback_data="year_ignore"),
        InlineKeyboardButton(text="▶️", callback_data=f"birth_year_nav:{year+1}:{month}")
    )
    
    # Day calendar headers
    kb.row(
        InlineKeyboardButton(text="Du", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Se", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Ch", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Pa", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Ju", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Sh", callback_data="cal_ignore"),
        InlineKeyboardButton(text="Ya", callback_data="cal_ignore")
    )
    
    # Day calendar
    cal = calendar.monthcalendar(year, month)
    for week in cal:
        row = []
        for day in week:
            if day == 0:
                row.append(InlineKeyboardButton(text=" ", callback_data="cal_ignore"))
            else:
                row.append(InlineKeyboardButton(text=str(day), callback_data=f"birth_day:{year}:{month}:{day}"))
        kb.row(*row)
    
    # Month navigation
    month_names = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"]
    kb.row(
        InlineKeyboardButton(text="◀️", callback_data=f"birth_month_nav:{year}:{month-1 if month > 1 else 12}"),
        InlineKeyboardButton(text=f"{month_names[month-1]}", callback_data="month_ignore"),
        InlineKeyboardButton(text="▶️", callback_data=f"birth_month_nav:{year}:{month+1 if month < 12 else 1}")
    )
    
    # Cancel button
    kb.row(InlineKeyboardButton(text="❌ Bekor qilish", callback_data="cal_cancel"))
    
    return kb.as_markup()


def month_selector_keyboard(year: int) -> InlineKeyboardMarkup:
    """Oy tanlash"""
    kb = InlineKeyboardBuilder()
    month_names = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
                   "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"]
    
    kb.button(text=f"📅 {year} yil - oyni tanlang", callback_data="month_ignore")
    kb.adjust(1)
    
    for i, name in enumerate(month_names, 1):
        kb.button(text=name, callback_data=f"birth_month:{year}:{i}")
    kb.adjust(1, 3, 3, 3, 3)
    
    kb.row(InlineKeyboardButton(text="◀️ Ortga", callback_data="birth_year_back"))
    return kb.as_markup()


def day_selector_keyboard(year: int, month: int) -> InlineKeyboardMarkup:
    """Kun tanlash - tug'ilgan kun uchun"""
    return calendar_keyboard(year, month)
