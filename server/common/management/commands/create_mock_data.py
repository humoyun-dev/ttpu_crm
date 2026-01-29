from django.core.management.base import BaseCommand
from django.utils import timezone

from authn.models import User
from bot1.models import (
    Admissions2026Application,
    ApplicationStatus,
    Bot1Applicant,
    CampusTourRequest,
    FoundationRequest,
    PolitoAcademyRequest,
)
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

        # Service tokens
        ServiceToken.objects.update_or_create(
            service_name=ServiceToken.Service.BOT1,
            scope="default",
            defaults={"token_hash": _hashed("bot1secret"), "is_active": True},
        )
        ServiceToken.objects.update_or_create(
            service_name=ServiceToken.Service.BOT2,
            scope="default",
            defaults={"token_hash": _hashed("bot2secret"), "is_active": True},
        )

        # Catalog
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
        direction, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.DIRECTION, code="ENG", defaults={"name": "Engineering"}
        )
        track, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.TRACK, code="ENG-1", defaults={"name": "Engineering Track 1", "parent": direction}
        )
        subject, _ = CatalogItem.objects.update_or_create(
            type=CatalogItem.ItemType.SUBJECT, code="MATH", defaults={"name": "Math"}
        )

        # Bot1
        applicant, _ = Bot1Applicant.objects.update_or_create(
            telegram_user_id=123456,
            defaults={
                "telegram_chat_id": 654321,
                "username": "mock_user",
                "first_name": "Alice",
                "last_name": "Applicant",
                "phone": "+123456789",
                "email": "mock@applicant.com",
                "region": region,
            },
        )
        Admissions2026Application.objects.update_or_create(
            applicant=applicant,
            defaults={
                "direction": direction,
                "track": track,
                "status": ApplicationStatus.SUBMITTED,
                "answers": {"q1": "yes"},
                "submitted_at": timezone.now(),
            },
        )
        CampusTourRequest.objects.update_or_create(
            applicant=applicant,
            defaults={
                "preferred_date": timezone.now().date(),
                "status": ApplicationStatus.SUBMITTED,
                "answers": {"slots": "morning"},
                "submitted_at": timezone.now(),
            },
        )
        FoundationRequest.objects.update_or_create(
            applicant=applicant,
            defaults={
                "status": ApplicationStatus.SUBMITTED,
                "answers": {"interested": True},
                "submitted_at": timezone.now(),
            },
        )
        PolitoAcademyRequest.objects.update_or_create(
            applicant=applicant,
            defaults={
                "subject": subject,
                "status": ApplicationStatus.SUBMITTED,
                "answers": {"level": "beginner"},
                "submitted_at": timezone.now(),
            },
        )

        # Bot2
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
