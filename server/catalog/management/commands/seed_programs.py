from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import CatalogItem


PROGRAMS = [
    # Bachelor - Italian
    {
        "code": "B-IT-COMPE",
        "name_uz": "Sanoatda axborot texnologiyalari va dasturlash (Kompyuter muhandisligi)",
        "name_ru": "Информационные технологии и программирование в промышленности (Компьютерная инженерия)",
        "name_en": "Information Technologies and Programming in Industry (Computer Engineering)",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-ME",
        "name_uz": "Mexanika muhandisligi",
        "name_ru": "Машиностроительная инженерия",
        "name_en": "Mechanical Engineering",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-IMT",
        "name_uz": "Sanoat ishlab chiqarish texnologiyalari",
        "name_ru": "Промышленные производственные технологии",
        "name_en": "Industrial Manufacturing Technologies",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-ICEA",
        "name_uz": "Sanoat va fuqarolik muhandisligi va arxitektura",
        "name_ru": "Промышленная и гражданская инженерия и архитектура",
        "name_en": "Industrial and Civil Engineering and Architecture",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-AE",
        "name_uz": "Avtomobil muhandisligi",
        "name_ru": "Автомобильная инженерия",
        "name_en": "Automotive Engineering",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-AS",
        "name_uz": "Aerokosmik muhandislik",
        "name_ru": "Авиакосмическая инженерия",
        "name_en": "Aerospace Engineering",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    # Bachelor - Uzbek
    {
        "code": "B-UZ-SE",
        "name_uz": "Dasturiy ta'minot muhandisligi",
        "name_ru": "Программная инженерия",
        "name_en": "Software Engineering",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    {
        "code": "B-UZ-AD",
        "name_uz": "Arxitektura va dizayn",
        "name_ru": "Архитектура и дизайн",
        "name_en": "Architecture & Design",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    {
        "code": "B-UZ-BM",
        "name_uz": "Biznes menejment",
        "name_ru": "Бизнес-менеджмент",
        "name_en": "Business Management",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    # Master
    {
        "code": "M-MECH",
        "name_uz": "Mexatronika muhandisligi",
        "name_ru": "Мехатронная инженерия",
        "name_en": "Mechatronic Engineering",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-ICE",
        "name_uz": "Axborot va kommunikatsiya muhandisligi",
        "name_ru": "Информационная и коммуникационная инженерия",
        "name_en": "Information and Communication Engineering",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-RCHM",
        "name_uz": "Tarixiy yodgorliklarni tiklash va muhofaza qilish",
        "name_ru": "Реставрация и сохранение исторических памятников",
        "name_en": "Restoration and Conservation of Historical Monuments",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-MBA",
        "name_uz": "Biznes boshqaruvi magistri (MBA)",
        "name_ru": "Магистр делового администрирования (MBA)",
        "name_en": "Master of Business Administration (MBA)",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
]


class Command(BaseCommand):
    help = "Seed Bachelor and Master programs into catalog_items (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--deactivate-missing", action="store_true", help="Deactivate program items not in the seed list.")

    @transaction.atomic
    def handle(self, *args, **options):
        deactivate_missing = options["deactivate_missing"]
        codes = {p["code"] for p in PROGRAMS}
        sort_map = {p["code"]: idx for idx, p in enumerate(PROGRAMS, start=1)}
        for program in PROGRAMS:
            CatalogItem.objects.update_or_create(
                type=CatalogItem.ItemType.PROGRAM,
                code=program["code"],
                defaults={
                    "name": program["name_en"],
                    "name_uz": program["name_uz"],
                    "name_ru": program["name_ru"],
                    "name_en": program["name_en"],
                    "is_active": True,
                    "sort_order": sort_map[program["code"]],
                    "metadata": {
                        "level": program["level"],
                        "track": program["track"],
                        "language": program["language"],
                        "duration_years": program["duration_years"],
                    },
                },
            )

        deactivated = 0
        if deactivate_missing:
            deactivated = (
                CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM)
                .exclude(code__in=codes)
                .update(is_active=False)
            )

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(PROGRAMS)} programs. Deactivated outside set: {deactivated}."))
