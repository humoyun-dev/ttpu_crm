from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster
from common.auth import _hashed

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def service_tokens(settings):
    settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}
    return settings


def test_survey_without_roster_returns_error(api_client):
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {"student_external_id": "123"},
        format="json",
        HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "ROSTER_NOT_FOUND"


def test_survey_with_roster_uses_roster_values(api_client, program_item):
    roster = StudentRoster.objects.create(
        student_external_id="123",
        program=program_item,
        course_year=2,
        is_active=True,
    )
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {
            "student_external_id": "123",
            "program": "WRONG",
            "course_year": 4,
            "survey_campaign": "default",
            "answers": {"q1": "a1"},
        },
        format="json",
        HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_200_OK
    data = resp.data
    assert data["ok"] is True
    assert data["roster"]["program_id"] == str(program_item.id)
    assert data["roster"]["course_year"] == roster.course_year

    survey = Bot2SurveyResponse.objects.get(id=data["response_id"])
    assert survey.course_year == roster.course_year
    assert survey.program_id == roster.program_id
    assert survey.roster_id == roster.id
    assert Bot2Student.objects.filter(student_external_id="123", roster=roster).exists()


def test_roster_without_program_serializes_program_id_as_null(api_client):
    """A roster with no program must serialize program_id as JSON null, NOT the
    literal string "None" — otherwise the bot stores "None" and re-submits it,
    crashing the UUID lookup in submit_survey (regression for the 500 storm)."""
    # birth_date roster'da bo'lishi shart (aks holda ID-only verifikatsiya xavfsizlik
    # uchun rad etiladi); testning asl maqsadi — program_id ning JSON null bo'lishi.
    StudentRoster.objects.create(
        student_external_id="np-1", course_year=1, is_active=True, birth_date="2000-01-01"
    )
    resp = api_client.post(
        reverse("bot-verify"),
        {"student_id": "np-1", "birth_date": "2000-01-01"},
        format="json",
        HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["match"] is True
    assert resp.data["roster"]["program_id"] is None


@pytest.mark.parametrize("bad_program_id", ["None", "null", "", "not-a-uuid"])
def test_submit_with_stale_string_program_id_does_not_500(api_client, program_item, bad_program_id):
    """Stale bot FSM state may send program_id as the string "None"/"null"/garbage.
    The server must resolve the program from the roster and never 500 on the bad value."""
    StudentRoster.objects.create(
        student_external_id="stale-1", program=program_item, course_year=2, is_active=True
    )
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {"student_external_id": "stale-1", "program_id": bad_program_id, "answers": {}},
        format="json",
        HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert resp.data["roster"]["program_id"] == str(program_item.id)


def test_submit_fills_student_name_from_roster(api_client, program_item):
    """The student's official name comes from the roster (Excel import) so it shows on
    the survey detail page and in the Excel export, even when the bot sent no name."""
    StudentRoster.objects.create(
        student_external_id="NM-1", program=program_item, course_year=1,
        first_name="Humoyunbek", last_name="Tursunniyazov", is_active=True,
    )
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {"student_external_id": "NM-1", "telegram_user_id": 900, "answers": {}},
        format="json", HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_200_OK
    s = Bot2Student.objects.get(student_external_id="NM-1")
    assert s.first_name == "Humoyunbek"
    assert s.last_name == "Tursunniyazov"


def test_roster_name_wins_over_telegram_name(api_client, program_item):
    """The roster (official import) name is authoritative: it takes precedence over a
    different Telegram-supplied name on the payload."""
    StudentRoster.objects.create(
        student_external_id="NM-2", program=program_item, course_year=1,
        first_name="RosterFirst", last_name="RosterLast", is_active=True,
    )
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {"student_external_id": "NM-2", "telegram_user_id": 901,
         "first_name": "TgName", "last_name": "TgSurname", "answers": {}},
        format="json", HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_200_OK
    s = Bot2Student.objects.get(student_external_id="NM-2")
    assert (s.first_name, s.last_name) == ("RosterFirst", "RosterLast")


def test_submit_no_roster_with_invalid_program_id_returns_400_not_500(api_client):
    """When there's no roster and the supplied program_id is not a valid UUID, the
    endpoint returns a clean 400 (no usable program) instead of an unhandled 500."""
    resp = api_client.post(
        reverse("bot2-survey-submit"),
        {"student_external_id": "noroster-1", "program_id": "garbage", "answers": {}},
        format="json",
        HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "ROSTER_NOT_FOUND"
