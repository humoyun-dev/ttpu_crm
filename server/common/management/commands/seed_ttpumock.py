import random
from datetime import timedelta

from django.core.management import BaseCommand
from django.db import transaction
from django.utils import timezone

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster
from catalog.models import CatalogItem


SCALE_CONFIG = {
    "small": {
        "roster_active": 800,
        "roster_inactive": 80,
        "survey_ratio": (0.45, 0.55),
        "student_ratio": (0.65, 0.8),
    },
    "medium": {
        "roster_active": 1500,
        "roster_inactive": 150,
        "survey_ratio": (0.5, 0.65),
        "student_ratio": (0.7, 0.85),
    },
    "large": {
        "roster_active": 3000,
        "roster_inactive": 300,
        "survey_ratio": (0.55, 0.7),
        "student_ratio": (0.75, 0.9),
    },
}


REGIONS = [
    ("REG_TASH", "Tashkent City"),
    ("REG_TASHREG", "Tashkent Region"),
    ("REG_AND", "Andijan"),
    ("REG_BUK", "Bukhara"),
    ("REG_FER", "Fergana"),
    ("REG_JIZ", "Jizzakh"),
    ("REG_NAV", "Navoi"),
    ("REG_NAM", "Namangan"),
    ("REG_QAR", "Qarshi"),
    ("REG_SAM", "Samarkand"),
    ("REG_SUR", "Surkhandarya"),
    ("REG_SYR", "Syrdarya"),
    ("REG_KHO", "Khorezm"),
    ("REG_NUK", "Nukus"),
]

CAMPAIGNS = ["2025-FALL", "2026-SPRING", "default"]

FIRST_NAMES = ["Ali", "Vali", "Sardor", "Dilshod", "Aziza", "Laylo", "Malika", "Javlon", "Madina"]
LAST_NAMES = ["Karimov", "Saidov", "Yusupov", "Nazarova", "Rakhimov", "Islomova", "Usmonov", "Khaydarov"]


def _choice(rng, seq):
    return seq[rng.randint(0, len(seq) - 1)]


class Command(BaseCommand):
    help = "Seed synthetic TTPU-only mock data (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, help="Deterministic seed.")
        parser.add_argument("--days", type=int, default=120, help="Time window (days) for submitted_at.")
        parser.add_argument("--scale", choices=SCALE_CONFIG.keys(), default="medium", help="Dataset size.")
        parser.add_argument("--upsert", action="store_true", help="Upsert instead of fresh insert.")

    def handle(self, *args, **options):
        seed = options.get("seed")
        days = options["days"]
        scale = options["scale"]
        upsert = options["upsert"]
        rng = random.Random(seed)

        config = SCALE_CONFIG[scale]

        with transaction.atomic():
            region_items = self._seed_catalog_type(CatalogItem.ItemType.REGION, REGIONS, rng, upsert)
            programs = list(CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM, is_active=True))

            rosters = self._seed_roster(config, programs, rng, upsert)
            students = self._seed_students(config, rosters, region_items, rng, upsert)
            self._seed_surveys(config, students, rosters, rng, days, upsert)

        self.stdout.write(self.style.SUCCESS("TTPU mock data seeded."))

    def _seed_catalog_type(self, item_type, items, rng, upsert):
        created_items = []
        for idx, (code, name) in enumerate(items, start=1):
            defaults = {"name": name, "is_active": True, "sort_order": idx, "metadata": {}}
            obj, _ = CatalogItem.objects.update_or_create(
                type=item_type,
                code=code,
                defaults=defaults,
            )
            created_items.append(obj)
        return created_items

    def _random_time(self, rng, days):
        return timezone.now() - timedelta(days=rng.randint(0, days), hours=rng.randint(0, 23))

    def _seed_roster(self, config, programs, rng, upsert):
        rosters = []
        total = config["roster_active"] + config["roster_inactive"]
        for i in range(total):
            external_id = f"S{i+1:05d}"
            is_active = i < config["roster_active"]
            program = _choice(rng, programs)
            course_year = rng.randint(1, 4)
            obj, _ = StudentRoster.objects.update_or_create(
                student_external_id=external_id,
                defaults={
                    "program": program,
                    "course_year": course_year,
                    "is_active": is_active,
                    "roster_campaign": "default",
                },
            )
            rosters.append(obj)
        return rosters

    def _seed_students(self, config, rosters, regions, rng, upsert):
        ratio = rng.uniform(*config["student_ratio"])
        target = int(len(rosters) * ratio)
        selected = rng.sample(rosters, target)
        students = []
        for roster in selected:
            first = _choice(rng, FIRST_NAMES)
            last = _choice(rng, LAST_NAMES)
            region = regions[rng.randint(0, len(regions) - 1)]
            obj, _ = Bot2Student.objects.update_or_create(
                student_external_id=roster.student_external_id,
                defaults={
                    "roster": roster,
                    "username": f"student_{roster.student_external_id.lower()}",
                    "first_name": first,
                    "last_name": last,
                    "gender": Bot2Student.Gender.MALE if rng.randint(0, 1) else Bot2Student.Gender.FEMALE,
                    "phone": f"+99890{rng.randint(1000000,9999999)}",
                    "region": region,
                },
            )
            students.append(obj)
        return students

    def _seed_surveys(self, config, students, rosters, rng, days, upsert):
        active_rosters = [r for r in rosters if r.is_active]
        ratio = rng.uniform(*config["survey_ratio"])
        target = int(len(active_rosters) * ratio)
        selected_rosters = rng.sample(active_rosters, min(target, len(active_rosters)))
        student_map = {s.student_external_id: s for s in students}

        for roster in selected_rosters:
            student = student_map.get(roster.student_external_id)
            if not student:
                continue
            campaign = _choice(rng, CAMPAIGNS)
            employment_status = ""
            employment_company = ""
            employment_role = ""
            if roster.course_year >= 3 and rng.random() < 0.4:
                employment_status = "employed"
                employment_company = f"Company{rng.randint(1, 100)}"
                employment_role = "Engineer"
            payload = {
                "student": student,
                "roster": roster,
                "program": roster.program,
                "course_year": roster.course_year,
                "survey_campaign": campaign,
                "employment_status": employment_status,
                "employment_company": employment_company,
                "employment_role": employment_role,
                "answers": {"q1": rng.randint(1, 5)},
                "submitted_at": self._random_time(rng, days),
            }
            Bot2SurveyResponse.objects.update_or_create(
                roster=roster,
                survey_campaign=campaign,
                defaults=payload,
            )
