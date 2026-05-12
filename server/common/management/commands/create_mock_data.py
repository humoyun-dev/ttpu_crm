from django.core.management.base import BaseCommand
from django.utils import timezone

from authn.models import User
from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster
from catalog.models import CatalogItem
from common.auth import _hashed
from common.models import ServiceToken


class Command(BaseCommand):
    help = "Create mock data for local development (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--admin-password", default="pass1234")
        parser.add_argument("--viewer-password", default="pass1234")

    def handle(self, *args, **options):
        admin_pwd = options["admin_password"]
        viewer_pwd = options["viewer_password"]

        admin, _ = User.objects.update_or_create(
            email="admin@example.com",
            defaults={"role": User.Role.ADMIN, "is_staff": True},
        )
        admin.set_password(admin_pwd)
        admin.save()
        viewer, _ = User.objects.update_or_create(
            email="viewer@example.com",
            defaults={"role": User.Role.VIEWER, "is_staff": False},
        )
        viewer.set_password(viewer_pwd)
        viewer.save()

        ServiceToken.objects.update_or_create(
            service_name=ServiceToken.Service.BOT2,
            scope="default",
            defaults={"token_hash": _hashed("bot2secret"), "is_active": True},
        )

        region, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.REGION,
            code="TASH",
            defaults={"name": "Tashkent"},
        )
        program_a, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.PROGRAM, code="PA", defaults={"name": "Program A"}
        )
        program_b, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.PROGRAM, code="PB", defaults={"name": "Program B"}
        )

        roster1, _ = StudentRoster.objects.update_or_create(
            student_external_id="S-001",
            defaults={
                "program": program_a,
                "course_year": 1,
                "is_active": True,
                "roster_campaign": "default",
            },
        )
        roster2, _ = StudentRoster.objects.update_or_create(
            student_external_id="S-002",
            defaults={
                "program": program_b,
                "course_year": 2,
                "is_active": True,
                "roster_campaign": "default",
            },
        )
        student1, _ = Bot2Student.objects.update_or_create(
            student_external_id="S-001",
            defaults={
                "roster": roster1,
                "username": "student1",
                "first_name": "Bob",
                "gender": Bot2Student.Gender.MALE,
                "region": region,
            },
        )
        Bot2Student.objects.update_or_create(
            student_external_id="S-002",
            defaults={
                "roster": roster2,
                "username": "student2",
                "first_name": "Carol",
                "gender": Bot2Student.Gender.FEMALE,
                "region": region,
            },
        )
        Bot2SurveyResponse.objects.update_or_create(
            roster=roster1,
            survey_campaign="default",
            defaults={
                "student": student1,
                "program": roster1.program,
                "course_year": roster1.course_year,
                "employment_status": "employed",
                "answers": {"satisfaction": 5},
                "submitted_at": timezone.now(),
            },
        )

        self.stdout.write(self.style.SUCCESS("Mock data created/updated."))
