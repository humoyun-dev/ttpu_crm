from datetime import timedelta

import pytest
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from audit.models import AuditLog
from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster
from bot2.services import upsert_roster_row
from catalog.models import CatalogItem
from common.auth import _hashed
from common.models import ServiceToken


@pytest.fixture
def service_token_bot1(db):
    return ServiceToken.objects.create(
        service_name=ServiceToken.Service.BOT1,
        token_hash=_hashed("bot1secret"),
        scope="default",
        is_active=True,
    )


def test_catalog_null_code_duplicate_not_allowed(db):
    CatalogItem.objects.create(type=CatalogItem.ItemType.PROGRAM, name="Program A")
    with pytest.raises(IntegrityError):
        CatalogItem.objects.create(type=CatalogItem.ItemType.PROGRAM, name="Program B")


def test_student_roster_rejects_non_program(db):
    region = CatalogItem.objects.create(type=CatalogItem.ItemType.REGION, name="Tashkent")
    roster = StudentRoster(
        student_external_id="s1",
        program=region,
        course_year=1,
        roster_campaign="default",
    )
    with pytest.raises(ValidationError):
        roster.full_clean()


def test_roster_updates_keep_surveys_in_sync(db, program_item):
    other_program = CatalogItem.objects.create(
        type=CatalogItem.ItemType.PROGRAM, name="Program B", code="PB"
    )
    created = upsert_roster_row(
        {
            "student_external_id": "s1",
            "program": program_item,
            "course_year": 1,
            "is_active": True,
            "roster_campaign": "default",
        }
    )
    assert created is True
    roster = StudentRoster.objects.get(student_external_id="s1")
    student = Bot2Student.objects.create(student_external_id="s1", roster=roster)
    survey = Bot2SurveyResponse.objects.create(
        student=student,
        roster=roster,
        program=program_item,
        course_year=1,
        survey_campaign="default",
        submitted_at=timezone.now(),
    )
    updated = upsert_roster_row(
        {
            "student_external_id": "s1",
            "program": other_program,
            "course_year": 2,
            "is_active": True,
            "roster_campaign": "default",
        }
    )
    assert updated is False
    survey.refresh_from_db()
    assert survey.program_id == other_program.id
    assert survey.course_year == 2


def test_coverage_denominator_filters_campaign(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster_default = StudentRoster.objects.create(
        student_external_id="d1",
        program=program_item,
        course_year=1,
        is_active=True,
        roster_campaign="default",
    )
    roster_alt = StudentRoster.objects.create(
        student_external_id="a1",
        program=program_item,
        course_year=1,
        is_active=True,
        roster_campaign="alt",
    )
    student = Bot2Student.objects.create(student_external_id="d1", roster=roster_default)
    Bot2SurveyResponse.objects.create(
        student=student,
        roster=roster_default,
        program=program_item,
        course_year=1,
        survey_campaign="default",
        submitted_at=timezone.now(),
    )
    start = (timezone.now() - timedelta(days=1)).isoformat()
    end = (timezone.now() + timedelta(days=1)).isoformat()

    resp_default = api_client.get(
        reverse("analytics-bot2-course"), {"from": start, "to": end, "campaign": "default"}
    )
    assert resp_default.status_code == status.HTTP_200_OK
    year1 = next(row for row in resp_default.data if row["course_year"] == 1)
    assert year1["total"] == 1
    assert year1["responded"] == 1

    resp_alt = api_client.get(
        reverse("analytics-bot2-course"), {"from": start, "to": end, "campaign": "alt"}
    )
    assert resp_alt.status_code == status.HTTP_200_OK
    alt_year1 = next(row for row in resp_alt.data if row["course_year"] == 1)
    assert alt_year1["total"] == 1  # only the alt roster
    assert alt_year1["responded"] == 0  # no responses for alt campaign


def test_logout_revokes_access_cookie(api_client, admin_user):
    resp = api_client.post(
        reverse("auth-login"),
        {"email": admin_user.email, "password": "pass1234"},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    access_cookie = resp.cookies[settings.ACCESS_COOKIE_NAME].value

    api_client.cookies = resp.cookies
    logout_resp = api_client.post(reverse("auth-logout"))
    assert logout_resp.status_code == status.HTTP_200_OK

    client2 = APIClient()
    client2.cookies[settings.ACCESS_COOKIE_NAME] = access_cookie
    me_resp = client2.get(reverse("auth-me"))
    assert me_resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_audit_masks_pii(api_client, service_token_bot1):
    AuditLog.objects.all().delete()
    payload = {
        "telegram_user_id": 123,
        "email": "foo@example.com",
        "phone": "+123456",
        "first_name": "Alice",
    }
    resp = api_client.post(
        reverse("bot1-applicant-upsert"),
        payload,
        format="json",
        HTTP_X_SERVICE_TOKEN="bot1secret",
    )
    assert resp.status_code == status.HTTP_200_OK
    log = AuditLog.objects.order_by("-created_at").first()
    assert log is not None
    assert log.actor_service == "bot1"
    assert log.after_data.get("email") == "[REDACTED]"
    assert log.after_data.get("phone") == "[REDACTED]"
    assert log.after_data.get("first_name") == "[REDACTED]"
