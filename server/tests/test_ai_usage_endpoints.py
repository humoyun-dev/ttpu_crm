"""ai_verification — xarajat kuzatuvi: submit AIUsageLog yozadi + usage endpointlari."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from ai_verification.models import AIUsageLog, DocumentVerification
from bot2.models import Bot2Student, StudentRoster


SUBMIT_URL = reverse("ai-verify-submit")
SUMMARY_URL = reverse("ai-usage-summary")
DAILY_URL = reverse("ai-usage-daily")
ESTIMATE_URL = reverse("ai-usage-estimate")


@pytest.fixture(autouse=True)
def _isolated_media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    settings.GEMINI_API_KEY = "test-key"


@pytest.fixture
def student(db):
    roster = StudentRoster.objects.create(student_external_id="ROSTER-U")
    return Bot2Student.objects.create(student_external_id="STU-U", roster=roster)


def _png():
    return SimpleUploadedFile("cv.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, content_type="image/png")


def _result_with_usage(cost="0.00145000", tokens=1900, status_="success"):
    return {
        "confidence_score": 0.9, "confidence_level": "green",
        "extracted_data": {}, "flags": [], "summary": "ok",
        "_usage": {
            "input_tokens": 1500, "output_tokens": 400, "thinking_tokens": 0,
            "total_tokens": tokens, "cost_usd": Decimal(cost), "latency_ms": 321,
            "model_name": "gemini-2.5-flash", "status": status_, "error_message": "",
        },
    }


# ── submit writes AIUsageLog ───────────────────────────────────────────────────

def test_submit_writes_usage_log(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.views.GeminiVerificationService") as M:
        M.return_value.verify.return_value = _result_with_usage()
        resp = api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "cv", "file": _png()},
            format="multipart",
        )
    assert resp.status_code == status.HTTP_201_CREATED

    log = AIUsageLog.objects.get()
    assert str(log.verification_id) == str(resp.data["id"])
    assert log.total_tokens == 1900
    assert log.cost_usd == Decimal("0.00145000")
    assert log.latency_ms == 321
    assert log.status == "success"
    assert log.operation == "document_verification"


def test_submit_service_exception_writes_error_log(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.views.GeminiVerificationService") as M:
        M.return_value.verify.side_effect = RuntimeError("boom")
        api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "cv", "file": _png()},
            format="multipart",
        )
    log = AIUsageLog.objects.get()
    assert log.status == "error"
    assert "boom" in log.error_message
    assert log.cost_usd == Decimal("0")


# ── usage_summary ──────────────────────────────────────────────────────────────

def _make_log(cost, tokens=1000, when=None, status_="success"):
    log = AIUsageLog.objects.create(
        operation="document_verification", model_name="gemini-2.5-flash",
        input_tokens=tokens, total_tokens=tokens, cost_usd=Decimal(cost), status=status_,
    )
    if when is not None:
        AIUsageLog.objects.filter(pk=log.pk).update(created_at=when)
    return log


def test_usage_summary_aggregates(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    _make_log("0.001", tokens=1000)
    _make_log("0.002", tokens=2000)
    _make_log("0.005", tokens=5000, status_="error")  # excluded (not success)

    resp = api_client.get(SUMMARY_URL)
    assert resp.status_code == status.HTTP_200_OK
    assert Decimal(resp.data["total_cost_usd"]) == Decimal("0.003")
    assert resp.data["total_tokens"] == 3000
    assert resp.data["total_requests"] == 2
    assert len(resp.data["by_model"]) == 1
    assert resp.data["by_model"][0]["model_name"] == "gemini-2.5-flash"


def test_usage_summary_empty_is_zero(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(SUMMARY_URL)
    assert resp.data["total_cost_usd"] == "0"
    assert resp.data["total_requests"] == 0


# ── usage_daily ────────────────────────────────────────────────────────────────

def test_usage_daily_groups_by_date(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    today = timezone.now()
    _make_log("0.001", when=today)
    _make_log("0.002", when=today)
    _make_log("0.004", when=today - __import__("datetime").timedelta(days=3))

    resp = api_client.get(DAILY_URL, {"days": 30})
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data["days"]) == 2          # two distinct dates


def test_usage_daily_respects_window(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    old = timezone.now() - __import__("datetime").timedelta(days=40)
    _make_log("0.009", when=old)
    resp = api_client.get(DAILY_URL, {"days": 7})   # 40-day-old row excluded
    assert resp.data["days"] == []


# ── usage_estimate ─────────────────────────────────────────────────────────────

def test_usage_estimate(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(ESTIMATE_URL, {"docs_per_day": 50})
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["docs_per_day"] == 50
    assert Decimal(resp.data["estimated_monthly_cost_usd"]) > Decimal("0")


def test_usage_estimate_bad_param_defaults(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(ESTIMATE_URL, {"docs_per_day": "abc"})
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["docs_per_day"] == 50


# ── permissions ────────────────────────────────────────────────────────────────

def test_usage_summary_forbidden_for_viewer(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    assert api_client.get(SUMMARY_URL).status_code == status.HTTP_403_FORBIDDEN


def test_usage_summary_unauthorized_for_anonymous():
    assert APIClient().get(SUMMARY_URL).status_code == status.HTTP_401_UNAUTHORIZED
