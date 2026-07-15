"""`/bot/logout` — unlink a Telegram account from its Bot2Student.

The student row and its append-only survey history must survive; only the
telegram_user_id link and any persisted FSM state are cleared, so the next
/start re-runs identify + verify.
"""
import pytest
from rest_framework import status
from rest_framework.reverse import reverse

from audit.models import AuditLog
from bot2.models import (
    Bot2Student,
    Bot2StudentAccount,
    Bot2SurveyResponse,
    BotFsmState,
    StudentRoster,
)
from common.auth import _hashed

pytestmark = pytest.mark.django_db

URL = reverse("bot-logout")


@pytest.fixture(autouse=True)
def service_tokens(settings):
    settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}
    return settings


def _make_student(program_item, tg_id=555):
    roster = StudentRoster.objects.create(
        student_external_id="LO-1", program=program_item, course_year=2, is_active=True
    )
    student = Bot2Student.objects.create(
        student_external_id="LO-1", roster=roster, telegram_user_id=tg_id, state="registered"
    )
    Bot2StudentAccount.objects.create(student=student, telegram_user_id=tg_id, is_active=True)
    return student


def test_logout_deactivates_account_but_keeps_student_and_surveys(api_client, program_item):
    student = _make_student(program_item, tg_id=555)
    Bot2SurveyResponse.objects.create(
        student=student, roster=student.roster, program=program_item, course_year=2,
        survey_campaign="default", source="survey",
    )
    BotFsmState.objects.create(telegram_user_id=555, state="in_menu")

    resp = api_client.post(URL, {"telegram_user_id": 555}, format="json", HTTP_X_SERVICE_TOKEN="secret")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data == {"ok": True, "found": True}

    student.refresh_from_db()
    assert student.telegram_user_id is None              # primary repointed (no other active)
    assert Bot2Student.objects.filter(student_external_id="LO-1").exists()  # student kept
    assert student.survey_responses.count() == 1         # history preserved

    account = Bot2StudentAccount.objects.get(telegram_user_id=555)
    assert account.is_active is False                    # account row kept, deactivated
    assert not BotFsmState.objects.filter(telegram_user_id=555).exists()    # fsm wiped


def test_logout_keeps_other_active_accounts(api_client, program_item):
    """Logging out one account leaves the student's OTHER accounts active and repoints
    the denormalized primary link to one of them."""
    student = _make_student(program_item, tg_id=555)
    Bot2StudentAccount.objects.create(student=student, telegram_user_id=666, is_active=True)

    resp = api_client.post(URL, {"telegram_user_id": 555}, format="json", HTTP_X_SERVICE_TOKEN="secret")

    assert resp.status_code == status.HTTP_200_OK
    assert Bot2StudentAccount.objects.get(telegram_user_id=555).is_active is False
    assert Bot2StudentAccount.objects.get(telegram_user_id=666).is_active is True
    student.refresh_from_db()
    assert student.telegram_user_id == 666               # repointed to the remaining account


def test_logout_is_idempotent_for_unknown_user(api_client):
    BotFsmState.objects.create(telegram_user_id=999, state="waiting_student_id")

    resp = api_client.post(URL, {"telegram_user_id": 999}, format="json", HTTP_X_SERVICE_TOKEN="secret")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data == {"ok": True, "found": False}
    assert not BotFsmState.objects.filter(telegram_user_id=999).exists()  # stray fsm still cleared


def test_logout_writes_audit_row(api_client, program_item):
    _make_student(program_item, tg_id=777)

    api_client.post(URL, {"telegram_user_id": 777}, format="json", HTTP_X_SERVICE_TOKEN="secret")

    logs = AuditLog.objects.filter(action="logout")
    assert logs.count() == 1
    assert logs.first().after_data["student_external_id"] == "LO-1"


def test_logout_requires_telegram_user_id(api_client):
    resp = api_client.post(URL, {}, format="json", HTTP_X_SERVICE_TOKEN="secret")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "VALIDATION_ERROR"


def test_logout_rejects_bad_service_token(api_client):
    resp = api_client.post(URL, {"telegram_user_id": 1}, format="json", HTTP_X_SERVICE_TOKEN="wrong")
    assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
