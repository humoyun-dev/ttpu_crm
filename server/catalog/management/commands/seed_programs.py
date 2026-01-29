from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import CatalogItem


PROGRAMS = [
    # Bachelor - Italian
    {
        "code": "B-IT-COMPE",
        "name": "INFORMATION TECHNOLOGIES AND PROGRAMMING IN INDUSTRY (COMPUTER ENGINEERING)",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-ME",
        "name": "MECHANICAL ENGINEERING",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-IMT",
        "name": "INDUSTRIAL MANUFACTURING TECHNOLOGIES",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-ICEA",
        "name": "INDUSTRIAL AND CIVIL ENGINEERING AND ARCHITECTURE",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-AE",
        "name": "AUTOMOTIVE ENGINEERING",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    {
        "code": "B-IT-AS",
        "name": "AEROSPACE ENGINEERING",
        "level": "bachelor",
        "track": "italian",
        "language": "Italian/English",
        "duration_years": 4,
    },
    # Bachelor - Uzbek
    {
        "code": "B-UZ-SE",
        "name": "SOFTWARE ENGINEERING",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    {
        "code": "B-UZ-AD",
        "name": "ARCHITECTURE & DESIGN",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    {
        "code": "B-UZ-BM",
        "name": "BUSINESS MANAGEMENT",
        "level": "bachelor",
        "track": "uzbek",
        "language": "Uzbek/English",
        "duration_years": 4,
    },
    # Master
    {
        "code": "M-MECH",
        "name": "MECHATRONIC ENGINEERING",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-ICE",
        "name": "INFORMATION AND COMMUNICATION ENGINEERING",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-RCHM",
        "name": "RESTORATION AND CONSERVATION OF HISTORICAL MONUMENTS",
        "level": "master",
        "track": "n/a",
        "language": "English",
        "duration_years": 2,
    },
    {
        "code": "M-MBA",
        "name": "MASTER OF BUSINESS ADMINISTRATION (MBA)",
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
                    "name": program["name"],
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
