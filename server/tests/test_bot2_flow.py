"""
Full integration tests for Bot2 registration flow.
Tests the complete survey submission process including auto-roster creation.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster
from catalog.models import CatalogItem

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@test.com",
        password="testpass123",
        role="admin",
    )


@pytest.fixture
def service_token():
    """Bot2 service token from .env"""
    return "raw-bot2-service-token"


@pytest.fixture
def sample_direction(db):
    """Create a sample direction (bakalavriat yo'nalishi)"""
    return CatalogItem.objects.create(
        type=CatalogItem.ItemType.DIRECTION,
        code="DIR-SOFT-UZ",
        name="Software Engineering",
        is_active=True,
        metadata={
            "name_uz": "Dasturiy ta'minot muhandisligi 🇺🇿",
            "name_ru": "Программная инженерия 🇺🇿",
            "name_en": "Software Engineering 🇺🇿",
            "diploma": "uzbek",
        },
    )


@pytest.fixture
def sample_region(db):
    """Create a sample region"""
    return CatalogItem.objects.create(
        type=CatalogItem.ItemType.REGION,
        code="REG-TASHCITY",
        name="Tashkent city",
        is_active=True,
        metadata={
            "name_uz": "Toshkent shahri",
            "name_ru": "город Ташкент",
            "name_en": "Tashkent city",
        },
    )


class TestBot2Authentication:
    """Test authentication and catalog access"""

    def test_login_returns_tokens(self, api_client, admin_user):
        """Test that login returns access and refresh tokens in response body"""
        response = api_client.post(
            "/api/v1/auth/login",
            {"email": "admin@test.com", "password": "testpass123"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert "access" in data
        assert "refresh" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@test.com"

    def test_get_directions_requires_auth(self, api_client, sample_direction):
        """Test that catalog/items endpoint requires authentication"""
        response = api_client.get("/api/v1/catalog/items/?type=direction")
        assert response.status_code == 401

    def test_get_directions_with_auth(self, api_client, admin_user, sample_direction):
        """Test authenticated access to directions"""
        # Login first
        login_response = api_client.post(
            "/api/v1/auth/login",
            {"email": "admin@test.com", "password": "testpass123"},
            format="json",
        )
        token = login_response.json()["access"]

        # Get directions
        response = api_client.get(
            "/api/v1/catalog/items/?type=direction",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) >= 1
        assert data["results"][0]["code"] == "DIR-SOFT-UZ"


class TestBot2SurveySubmission:
    """Test complete survey submission flow"""

    @pytest.mark.django_db
    def test_submit_survey_without_service_token(self, api_client):
        """Test that survey submission requires service token"""
        response = api_client.post(
            "/api/v1/bot2/surveys/submit",
            {"student_external_id": "12345"},
            format="json",
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_submit_survey_creates_roster_and_student(
        self, api_client, service_token, sample_direction, sample_region
    ):
        """Test full survey submission with auto-roster creation"""
        payload = {
            "student_external_id": "TEST-001",
            "telegram_user_id": 123456789,
            "username": "test_user",
            "phone": "+998901234567",
            "first_name": "Test",
            "last_name": "User",
            "gender": "male",
            "region_id": str(sample_region.id),
            "program_id": str(sample_direction.id),
            "language": "uz",
            "employment_status": "employed",
            "employment_company": "Tech Corp",
            "employment_role": "Developer",
            "consents": {
                "share_with_employers": True,
                "want_help": False,
            },
            "answers": {
                "region_label": "Toshkent shahri",
                "program_label": "Dasturiy ta'minot muhandisligi 🇺🇿",
            },
        }

        response = api_client.post(
            "/api/v1/bot2/surveys/submit",
            payload,
            format="json",
            HTTP_X_SERVICE_TOKEN=service_token,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "roster" in data
        assert "response_id" in data

        # Verify roster was created
        roster = StudentRoster.objects.get(student_external_id="TEST-001")
        assert roster.program == sample_direction
        assert roster.course_year == 1
        assert roster.roster_campaign == "bot2_auto"

        # Verify student was created
        student = Bot2Student.objects.get(student_external_id="TEST-001")
        assert student.roster == roster
        assert student.telegram_user_id == 123456789
        assert student.username == "test_user"
        assert student.first_name == "Test"
        assert student.last_name == "User"
        assert student.gender == "male"
        assert student.region == sample_region

        # Verify survey response was created
        survey = Bot2SurveyResponse.objects.get(student=student)
        assert survey.roster == roster
        assert survey.program == sample_direction
        assert survey.employment_status == "employed"
        assert survey.employment_company == "Tech Corp"
        assert survey.employment_role == "Developer"
        assert survey.consents["share_with_employers"] is True

    @pytest.mark.django_db
    def test_submit_survey_updates_existing_student(
        self, api_client, service_token, sample_direction, sample_region
    ):
        """Test that submitting again updates existing records"""
        # First submission
        payload1 = {
            "student_external_id": "TEST-002",
            "telegram_user_id": 987654321,
            "program_id": str(sample_direction.id),
            "first_name": "John",
            "last_name": "Doe",
            "gender": "male",
            "employment_status": "unemployed",
        }
        api_client.post(
            "/api/v1/bot2/surveys/submit",
            payload1,
            format="json",
            HTTP_X_SERVICE_TOKEN=service_token,
        )

        # Second submission with updated data
        payload2 = {
            "student_external_id": "TEST-002",
            "telegram_user_id": 987654321,
            "program_id": str(sample_direction.id),
            "first_name": "Jane",
            "last_name": "Smith",
            "gender": "female",
            "region_id": str(sample_region.id),
            "employment_status": "employed",
            "employment_company": "Updated Corp",
            "employment_role": "Manager",
        }
        response = api_client.post(
            "/api/v1/bot2/surveys/submit",
            payload2,
            format="json",
            HTTP_X_SERVICE_TOKEN=service_token,
        )

        assert response.status_code == 200

        # Verify only one student and survey exist (updated, not duplicated)
        assert Bot2Student.objects.filter(student_external_id="TEST-002").count() == 1
        assert StudentRoster.objects.filter(student_external_id="TEST-002").count() == 1

        student = Bot2Student.objects.get(student_external_id="TEST-002")
        assert student.first_name == "Jane"
        assert student.last_name == "Smith"
        assert student.gender == "female"
        assert student.region == sample_region

        survey = Bot2SurveyResponse.objects.get(student=student)
        assert survey.employment_status == "employed"
        assert survey.employment_company == "Updated Corp"

    @pytest.mark.django_db
    def test_submit_survey_without_program_id_fails(self, api_client, service_token):
        """Test that survey submission without program_id fails if roster doesn't exist"""
        payload = {
            "student_external_id": "TEST-003",
            "telegram_user_id": 111222333,
            "first_name": "Test",
        }
        response = api_client.post(
            "/api/v1/bot2/surveys/submit",
            payload,
            format="json",
            HTTP_X_SERVICE_TOKEN=service_token,
        )
        assert response.status_code == 400
        assert "ROSTER_NOT_FOUND" in response.json()["error"]["code"]

    @pytest.mark.django_db
    def test_submit_survey_with_invalid_program_id(self, api_client, service_token):
        """Test that invalid program_id returns proper error"""
        payload = {
            "student_external_id": "TEST-004",
            "program_id": "00000000-0000-0000-0000-000000000000",
        }
        response = api_client.post(
            "/api/v1/bot2/surveys/submit",
            payload,
            format="json",
            HTTP_X_SERVICE_TOKEN=service_token,
        )
        assert response.status_code == 400
        assert "INVALID_PROGRAM" in response.json()["error"]["code"]


class TestBot2DataIntegrity:
    """Test data integrity and constraints"""

    def test_student_external_id_unique(
        self, api_client, service_token, sample_direction
    ):
        """Test that student_external_id is unique across rosters"""
        # Create first roster
        StudentRoster.objects.create(
            student_external_id="UNIQUE-001",
            program=sample_direction,
            course_year=1,
        )

        # Try to create another roster with same student_external_id
        with pytest.raises(Exception):  # Should raise IntegrityError
            StudentRoster.objects.create(
                student_external_id="UNIQUE-001",
                program=sample_direction,
                course_year=2,
            )

    def test_region_must_be_region_type(self, db, sample_direction):
        """Test that region field only accepts REGION type catalog items"""
        roster = StudentRoster.objects.create(
            student_external_id="REG-TEST-001",
            program=sample_direction,
            course_year=1,
        )

        student = Bot2Student(
            student_external_id="REG-TEST-001",
            roster=roster,
            region=sample_direction,  # Wrong type - using direction as region
        )

        with pytest.raises(Exception):  # Should raise ValidationError
            student.save()
