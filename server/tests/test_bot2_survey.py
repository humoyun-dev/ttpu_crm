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
