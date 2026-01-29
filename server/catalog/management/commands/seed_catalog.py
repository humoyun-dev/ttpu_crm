from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import CatalogItem


# Bakalavriat yo'nalishlari (2025-2026)
DIRECTIONS = [
    {
        "id": 1,
        "name_uz": "Mexanika muhandisligi 🇮🇹",
        "name_ru": "Машиностроительная инженерия 🇮🇹",
        "name_en": "Mechanical Engineering 🇮🇹",
        "code": "DIR-MECH-IT",
        "diploma": "italian",
    },
    {
        "id": 2,
        "name_uz": "Kompyuter muhandisligi 🇮🇹",
        "name_ru": "Компьютерная инженерия 🇮🇹",
        "name_en": "Computer Engineering 🇮🇹",
        "code": "DIR-COMP-IT",
        "diploma": "italian",
    },
    {
        "id": 3,
        "name_uz": "Qurilish muhandisligi 🇮🇹",
        "name_ru": "Строительная инженерия 🇮🇹",
        "name_en": "Civil Engineering 🇮🇹",
        "code": "DIR-CIVIL-IT",
        "diploma": "italian",
    },
    {
        "id": 4,
        "name_uz": "Ishlab chiqarish muhandisligi 🇺🇿",
        "name_ru": "Производственная инженерия 🇺🇿",
        "name_en": "Production Engineering 🇺🇿",
        "code": "DIR-PROD-UZ",
        "diploma": "uzbek",
    },
    {
        "id": 5,
        "name_uz": "Dasturiy ta'minot muhandisligi 🇺🇿",
        "name_ru": "Программная инженерия 🇺🇿",
        "name_en": "Software Engineering 🇺🇿",
        "code": "DIR-SOFT-UZ",
        "diploma": "uzbek",
    },
    {
        "id": 6,
        "name_uz": "Avtomobil muhandisligi 🇺🇿",
        "name_ru": "Автомобильная инженерия 🇺🇿",
        "name_en": "Automotive Engineering 🇺🇿",
        "code": "DIR-AUTO-UZ",
        "diploma": "uzbek",
    },
    {
        "id": 7,
        "name_uz": "Arxitektura va dizayn 🇺🇿",
        "name_ru": "Архитектура и дизайн 🇺🇿",
        "name_en": "Architecture and Design 🇺🇿",
        "code": "DIR-ARCH-UZ",
        "diploma": "uzbek",
    },
    {
        "id": 8,
        "name_uz": "Aviatsiya muhandisligi 🇺🇿",
        "name_ru": "Авиационная инженерия 🇺🇿",
        "name_en": "Aviation Engineering 🇺🇿",
        "code": "DIR-AVIA-UZ",
        "diploma": "uzbek",
    },
]

# 12 viloyat + 1 shahar + 1 avtanom respublika
REGIONS = [
    {
        "id": 1,
        "name_uz": "Toshkent shahri",
        "name_ru": "город Ташкент",
        "name_en": "Tashkent city",
        "code": "REG-TASHCITY",
    },
    {
        "id": 2,
        "name_uz": "Toshkent viloyati",
        "name_ru": "Ташкентская область",
        "name_en": "Tashkent region",
        "code": "REG-TASHREGION",
    },
    {
        "id": 3,
        "name_uz": "Andijon",
        "name_ru": "Андижан",
        "name_en": "Andijan",
        "code": "REG-ANDIJAN",
    },
    {
        "id": 4,
        "name_uz": "Buxoro",
        "name_ru": "Бухара",
        "name_en": "Bukhara",
        "code": "REG-BUKHARA",
    },
    {
        "id": 5,
        "name_uz": "Farg'ona",
        "name_ru": "Фергана",
        "name_en": "Fergana",
        "code": "REG-FERGANA",
    },
    {
        "id": 6,
        "name_uz": "Jizzax",
        "name_ru": "Джизак",
        "name_en": "Jizzakh",
        "code": "REG-JIZZAKH",
    },
    {
        "id": 7,
        "name_uz": "Namangan",
        "name_ru": "Наманган",
        "name_en": "Namangan",
        "code": "REG-NAMANGAN",
    },
    {
        "id": 8,
        "name_uz": "Navoiy",
        "name_ru": "Навои",
        "name_en": "Navoiy",
        "code": "REG-NAVOIY",
    },
    {
        "id": 9,
        "name_uz": "Qashqadaryo",
        "name_ru": "Кашкадарья",
        "name_en": "Kashkadarya",
        "code": "REG-KASHKA",
    },
    {
        "id": 10,
        "name_uz": "Samarqand",
        "name_ru": "Самарканд",
        "name_en": "Samarkand",
        "code": "REG-SAMARKAND",
    },
    {
        "id": 11,
        "name_uz": "Sirdaryo",
        "name_ru": "Сырдарья",
        "name_en": "Sirdarya",
        "code": "REG-SIRDARYA",
    },
    {
        "id": 12,
        "name_uz": "Surxondaryo",
        "name_ru": "Сурхандарья",
        "name_en": "Surkhandarya",
        "code": "REG-SURKHAN",
    },
    {
        "id": 13,
        "name_uz": "Xorazm",
        "name_ru": "Хорезм",
        "name_en": "Khorezm",
        "code": "REG-KHOREZM",
    },
    {
        "id": 14,
        "name_uz": "Qoraqalpog'iston Respublikasi",
        "name_ru": "Республика Каракалпакстан",
        "name_en": "Republic of Karakalpakstan",
        "code": "REG-KARAKALPAK",
    },
]


class Command(BaseCommand):
    help = "Seed directions and regions into catalog (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Deactivate items not in seed list.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        deactivate_missing = options["deactivate_missing"]

        # Seed directions
        dir_codes = {d["code"] for d in DIRECTIONS}
        for idx, direction in enumerate(DIRECTIONS, start=1):
            CatalogItem.objects.update_or_create(
                type=CatalogItem.ItemType.DIRECTION,
                code=direction["code"],
                defaults={
                    "name": direction["name_en"],
                    "is_active": True,
                    "sort_order": idx,
                    "metadata": {
                        "name_uz": direction["name_uz"],
                        "name_ru": direction["name_ru"],
                        "name_en": direction["name_en"],
                        "diploma": direction["diploma"],
                    },
                },
            )

        # Seed regions
        reg_codes = {r["code"] for r in REGIONS}
        for idx, region in enumerate(REGIONS, start=1):
            CatalogItem.objects.update_or_create(
                type=CatalogItem.ItemType.REGION,
                code=region["code"],
                defaults={
                    "name": region["name_en"],
                    "is_active": True,
                    "sort_order": idx,
                    "metadata": {
                        "name_uz": region["name_uz"],
                        "name_ru": region["name_ru"],
                        "name_en": region["name_en"],
                    },
                },
            )

        # Optionally deactivate missing items
        deactivated_dirs = 0
        deactivated_regs = 0
        if deactivate_missing:
            deactivated_dirs = (
                CatalogItem.objects.filter(type=CatalogItem.ItemType.DIRECTION)
                .exclude(code__in=dir_codes)
                .update(is_active=False)
            )
            deactivated_regs = (
                CatalogItem.objects.filter(type=CatalogItem.ItemType.REGION)
                .exclude(code__in=reg_codes)
                .update(is_active=False)
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Seeded {len(DIRECTIONS)} directions, {len(REGIONS)} regions.\n"
                f"   Deactivated: {deactivated_dirs} directions, {deactivated_regs} regions."
            )
        )
