"""
Seed demo analytics data for testing the analytics dashboard.
Creates ProgramEnrollment, StudentRoster, Bot2Student and Bot2SurveyResponse
records so the analytics pages show realistic charts.
"""

import random
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from bot2.models import Bot2Student, Bot2SurveyResponse, ProgramEnrollment, StudentRoster
from catalog.models import CatalogItem


ACADEMIC_YEAR = "2024-2025"
CAMPAIGN = "default"

# (course_year, total_students, survey_response_rate, employment_rate)
YEAR_CONFIG = [
    (1, 100, 0.85, 0.85),   # 1-kurs: 100 talaba, 85% javob, 85% band
    (2, 110, 0.80, 0.58),   # 2-kurs: 110 talaba, 80% javob, 58% band
    (3, 95,  0.75, 0.62),   # 3-kurs: 95  talaba, 75% javob, 62% band
    (4, 90,  0.82, 0.75),   # 4-kurs: 90  talaba, 82% javob, 75% band
    (5, 80,  0.97, 0.97),   # Bitirganlar: 80 talaba, 97% javob, 97% band
]

EMPLOYMENT_STATUSES = {
    "employed": [
        "Ishlayapman (xususiy sektor)",
        "Ishlayapman (davlat sektori)",
        "O'z biznesim bor",
        "Freelancer sifatida ishlayapman",
        "Ishlayapman va o'qiyapman",
    ],
    "unemployed": [
        "Ishsizman, ish qidiryapman",
        "Ishsizman, o'qishni davom ettiryapman",
        "Ishsizman, hozircha ish qidirmayapman",
    ],
}

FIRST_NAMES = [
    "Abdulloh", "Akbar", "Alisher", "Amir", "Anvar", "Aziz", "Bahrom",
    "Bobur", "Behruz", "Doniyor", "Eldor", "Farhodjon", "Husan", "Ibrohim",
    "Jasur", "Kamol", "Laziz", "Mansur", "Nodirjon", "Oybek",
    "Sarvar", "Sherzod", "Timur", "Ulugbek", "Vohid",
    "Zafar", "Zuhra", "Nodira", "Malika", "Feruza",
    "Dilnoza", "Gulnora", "Maftuna", "Nilufar", "Shahnoza",
]

LAST_NAMES = [
    "Abdullayev", "Ahmedov", "Aliyev", "Azimov", "Baxtiyorov",
    "Ergashev", "Hasanov", "Holiqov", "Ismoilov", "Karimov",
    "Mahmudov", "Mirzayev", "Normatov", "Ortiqov", "Qodirov",
    "Rahimov", "Sotvoldiyev", "Toshmatov", "Umarov", "Xoliqov",
    "Yusupov", "Ziyodullayev",
]


class Command(BaseCommand):
    help = "Seed demo analytics data (ProgramEnrollment, StudentRoster, Bot2Student, Bot2SurveyResponse)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing demo analytics data before seeding",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing demo data...")
            Bot2SurveyResponse.objects.filter(survey_campaign=CAMPAIGN).delete()
            Bot2Student.objects.all().delete()
            StudentRoster.objects.filter(roster_campaign=CAMPAIGN).delete()
            ProgramEnrollment.objects.filter(campaign=CAMPAIGN, academic_year=ACADEMIC_YEAR).delete()
            self.stdout.write(self.style.WARNING("✓ Old demo data cleared."))

        programs = list(
            CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM)
            .order_by("name")[:6]
        )

        if not programs:
            self.stdout.write(self.style.ERROR(
                "No programs found. Run: python manage.py seed_dev first."
            ))
            return

        self.stdout.write(f"Using {len(programs)} programs...")

        with transaction.atomic():
            self._seed(programs)

        self.stdout.write(self.style.SUCCESS(
            f"✅ Demo analytics data seeded. Academic year: {ACADEMIC_YEAR}, Campaign: {CAMPAIGN}"
        ))

    def _seed(self, programs):
        rng = random.Random(42)
        now = timezone.now()

        total_enrollments = 0
        total_rosters = 0
        total_surveys = 0

        for course_year, total, response_rate, employment_rate in YEAR_CONFIG:
            responded_count = round(total * response_rate)

            # Distribute students across programs (roughly equal)
            per_program = total // len(programs)
            remainder = total % len(programs)

            student_counter = 0

            for idx, program in enumerate(programs):
                count = per_program + (1 if idx < remainder else 0)
                resp_share = round(responded_count * count / total)

                if course_year < 5:
                    # ProgramEnrollment tracks 1-4
                    ProgramEnrollment.objects.update_or_create(
                        program=program,
                        course_year=course_year,
                        academic_year=ACADEMIC_YEAR,
                        campaign=CAMPAIGN,
                        defaults={"student_count": count, "is_active": True},
                    )
                    total_enrollments += 1

                # Create StudentRoster entries for responded students (we need
                # physical records to attach survey responses to)
                for i in range(resp_share):
                    ext_id = f"demo-{course_year}-{program.code}-{i:04d}"

                    roster, _ = StudentRoster.objects.get_or_create(
                        student_external_id=ext_id,
                        defaults={
                            "roster_campaign": CAMPAIGN,
                            "program": program,
                            "course_year": course_year,
                            "is_active": True,
                        },
                    )
                    total_rosters += 1

                    first = rng.choice(FIRST_NAMES)
                    last = rng.choice(LAST_NAMES)

                    student, created = Bot2Student.objects.get_or_create(
                        student_external_id=ext_id,
                        defaults={
                            "roster": roster,
                            "first_name": first,
                            "last_name": last,
                            "username": f"{first.lower()}{student_counter}",
                        },
                    )
                    student_counter += 1

                    # Create survey response if not already exists
                    if not Bot2SurveyResponse.objects.filter(
                        student=student, survey_campaign=CAMPAIGN
                    ).exists():
                        is_employed = rng.random() < employment_rate
                        emp_type = "employed" if is_employed else "unemployed"
                        emp_status = rng.choice(EMPLOYMENT_STATUSES[emp_type])

                        submitted_at = now - timedelta(
                            days=rng.randint(1, 180),
                            hours=rng.randint(0, 23),
                        )

                        Bot2SurveyResponse.objects.create(
                            student=student,
                            roster=roster,
                            program=program,
                            course_year=course_year,
                            survey_campaign=CAMPAIGN,
                            employment_status=emp_status,
                            employment_company=(
                                f"Kompaniya {rng.randint(1, 50)}" if is_employed else ""
                            ),
                            employment_role=(
                                rng.choice(["Muhandis", "Dasturchi", "Tahlilchi", "Menejer", "Texnik"])
                                if is_employed else ""
                            ),
                            submitted_at=submitted_at,
                        )
                        total_surveys += 1

        self.stdout.write(f"  Created/updated {total_enrollments} enrollment records")
        self.stdout.write(f"  Created/updated {total_rosters} roster records")
        self.stdout.write(f"  Created {total_surveys} survey responses")
