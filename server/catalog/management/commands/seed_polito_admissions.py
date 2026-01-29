from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import CatalogItem


# Polito Academy Tracks
POLITO_TRACKS = [
    {
        "code": "TRACK-ITALIAN",
        "name": "Italian Track",
        "name_uz": "Italiya yo'nalishi",
        "name_ru": "Итальянское направление",
        "name_en": "Italian Track",
    },
    {
        "code": "TRACK-UZBEK",
        "name": "Uzbek Track",
        "name_uz": "O'zbek yo'nalishi",
        "name_ru": "Узбекское направление",
        "name_en": "Uzbek Track",
    },
]

# Admissions 2026 Subjects
ADMISSIONS_SUBJECTS = [
    {
        "code": "SUBJ-MATH",
        "name": "Mathematics",
        "name_uz": "Matematika",
        "name_ru": "Математика",
        "name_en": "Mathematics",
    },
    {
        "code": "SUBJ-PHYSICS",
        "name": "Physics",
        "name_uz": "Fizika",
        "name_ru": "Физика",
        "name_en": "Physics",
    },
    {
        "code": "SUBJ-CHEMISTRY",
        "name": "Chemistry",
        "name_uz": "Kimyo",
        "name_ru": "Химия",
        "name_en": "Chemistry",
    },
    {
        "code": "SUBJ-BIOLOGY",
        "name": "Biology",
        "name_uz": "Biologiya",
        "name_ru": "Биология",
        "name_en": "Biology",
    },
    {
        "code": "SUBJ-INFORMATICS",
        "name": "Informatics",
        "name_uz": "Informatika",
        "name_ru": "Информатика",
        "name_en": "Informatics",
    },
    {
        "code": "SUBJ-ENGLISH",
        "name": "English Language",
        "name_uz": "Ingliz tili",
        "name_ru": "Английский язык",
        "name_en": "English Language",
    },
    {
        "code": "SUBJ-RUSSIAN",
        "name": "Russian Language",
        "name_uz": "Rus tili",
        "name_ru": "Русский язык",
        "name_en": "Russian Language",
    },
    {
        "code": "SUBJ-HISTORY",
        "name": "History",
        "name_uz": "Tarix",
        "name_ru": "История",
        "name_en": "History",
    },
]


class Command(BaseCommand):
    help = "Seed Polito Academy tracks and Admissions 2026 subjects (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Deactivate items not in seed list.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        deactivate_missing = options["deactivate_missing"]

        # Seed tracks
        track_codes = {t["code"] for t in POLITO_TRACKS}
        for idx, track in enumerate(POLITO_TRACKS, start=1):
            CatalogItem.objects.update_or_create(
                type=CatalogItem.ItemType.TRACK,
                code=track["code"],
                defaults={
                    "name": track["name"],
                    "is_active": True,
                    "sort_order": idx,
                    "metadata": {
                        "name_uz": track["name_uz"],
                        "name_ru": track["name_ru"],
                        "name_en": track["name_en"],
                    },
                },
            )

        # Seed subjects
        subj_codes = {s["code"] for s in ADMISSIONS_SUBJECTS}
        for idx, subject in enumerate(ADMISSIONS_SUBJECTS, start=1):
            CatalogItem.objects.update_or_create(
                type=CatalogItem.ItemType.SUBJECT,
                code=subject["code"],
                defaults={
                    "name": subject["name"],
                    "is_active": True,
                    "sort_order": idx,
                    "metadata": {
                        "name_uz": subject["name_uz"],
                        "name_ru": subject["name_ru"],
                        "name_en": subject["name_en"],
                    },
                },
            )

        # Optionally deactivate missing items
        deactivated_tracks = 0
        deactivated_subjects = 0
        if deactivate_missing:
            deactivated_tracks = (
                CatalogItem.objects.filter(type=CatalogItem.ItemType.TRACK)
                .exclude(code__in=track_codes)
                .update(is_active=False)
            )
            deactivated_subjects = (
                CatalogItem.objects.filter(type=CatalogItem.ItemType.SUBJECT)
                .exclude(code__in=subj_codes)
                .update(is_active=False)
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Seeded {len(POLITO_TRACKS)} tracks, {len(ADMISSIONS_SUBJECTS)} subjects.\n"
                f"   Deactivated: {deactivated_tracks} tracks, {deactivated_subjects} subjects."
            )
        )
