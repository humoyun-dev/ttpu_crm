"""Multiple Telegram accounts + phones linked to one student.

A student may log in from several Telegram accounts using the same student_external_id;
every account (and its phone) is kept and linked to the single Bot2Student instead of
overwriting a field.
"""
import pytest
from rest_framework import status
from rest_framework.reverse import reverse

from bot2.models import Bot2Student, Bot2StudentAccount, StudentRoster
from common.auth import _hashed

pytestmark = pytest.mark.django_db

REGISTER = reverse("bot-register")
SUBMIT = reverse("bot2-survey-submit")
PROFILE = reverse("bot-student-profile")
LOGOUT = reverse("bot-logout")


@pytest.fixture(autouse=True)
def service_tokens(settings):
    settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}
    return settings


@pytest.fixture
def roster(program_item):
    return StudentRoster.objects.create(
        student_external_id="MA-1", program=program_item, course_year=2, is_active=True
    )


def _register(api_client, tg_id, **extra):
    payload = {"student_id": "MA-1", "telegram_user_id": tg_id, "consent": True, **extra}
    return api_client.post(REGISTER, payload, format="json", HTTP_X_SERVICE_TOKEN="secret")


def _submit(api_client, tg_id, phone="", **extra):
    payload = {"student_external_id": "MA-1", "telegram_user_id": tg_id, "phone": phone,
               "answers": {}, **extra}
    return api_client.post(SUBMIT, payload, format="json", HTTP_X_SERVICE_TOKEN="secret")


def test_two_accounts_same_student_are_both_kept(api_client, roster):
    assert _register(api_client, 111).status_code in (200, 201)
    assert _register(api_client, 222).status_code in (200, 201)

    # Exactly one student, two linked accounts, both active.
    assert Bot2Student.objects.filter(student_external_id="MA-1").count() == 1
    student = Bot2Student.objects.get(student_external_id="MA-1")
    tg_ids = set(student.accounts.values_list("telegram_user_id", flat=True))
    assert tg_ids == {111, 222}
    assert student.accounts.filter(is_active=True).count() == 2


def test_phone_is_saved_per_account(api_client, roster):
    _submit(api_client, 111, phone="+998901112233")
    _submit(api_client, 222, phone="+998904445566")

    a1 = Bot2StudentAccount.objects.get(telegram_user_id=111)
    a2 = Bot2StudentAccount.objects.get(telegram_user_id=222)
    assert a1.phone == "+998901112233"
    assert a2.phone == "+998904445566"
    # Both phones belong to the same student.
    assert a1.student_id == a2.student_id


def test_resubmit_without_phone_keeps_existing_phone(api_client, roster):
    _submit(api_client, 111, phone="+998901112233")
    _submit(api_client, 111, phone="")  # later sparse submit must not wipe it

    assert Bot2StudentAccount.objects.get(telegram_user_id=111).phone == "+998901112233"


def test_profile_resolves_for_each_linked_account(api_client, roster):
    _submit(api_client, 111, phone="+998901112233")
    _submit(api_client, 222, phone="+998904445566")

    for tg, phone in ((111, "+998901112233"), (222, "+998904445566")):
        resp = api_client.get(PROFILE, {"telegram_user_id": tg}, HTTP_X_SERVICE_TOKEN="secret")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["found"] is True
        assert resp.data["student_external_id"] == "MA-1"
        assert resp.data["phone"] == phone  # account-specific phone surfaced


def test_logout_one_account_leaves_others_usable(api_client, roster):
    _register(api_client, 111)
    _register(api_client, 222)

    api_client.post(LOGOUT, {"telegram_user_id": 111}, format="json", HTTP_X_SERVICE_TOKEN="secret")

    # Logged-out account no longer resolves; the other still does.
    r1 = api_client.get(PROFILE, {"telegram_user_id": 111}, HTTP_X_SERVICE_TOKEN="secret")
    r2 = api_client.get(PROFILE, {"telegram_user_id": 222}, HTTP_X_SERVICE_TOKEN="secret")
    assert r1.data == {"found": False}
    assert r2.data["found"] is True


def test_reusing_telegram_id_for_another_student_moves_the_link(api_client, roster, program_item):
    StudentRoster.objects.create(
        student_external_id="MA-2", program=program_item, course_year=1, is_active=True
    )
    _register(api_client, 111)                       # tg 111 -> MA-1
    # Re-register the SAME telegram id against a different student.
    resp = api_client.post(
        REGISTER, {"student_id": "MA-2", "telegram_user_id": 111, "consent": True},
        format="json", HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code in (200, 201)

    account = Bot2StudentAccount.objects.get(telegram_user_id=111)
    assert account.student.student_external_id == "MA-2"   # link moved
    assert Bot2StudentAccount.objects.filter(telegram_user_id=111).count() == 1  # not duplicated
