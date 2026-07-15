"""ai_verification — admin boshqaruv: ro'yxat (filter), stats, review (toifa override)."""

import threading
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from ai_verification.models import DocumentVerification
from bot2.models import Bot2Student, StudentRoster

LIST_URL = reverse("ai-verify-list")
STATS_URL = reverse("ai-verify-stats")


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    settings.GEMINI_API_KEY = "test-key"


@pytest.fixture
def student(db):
    roster = StudentRoster.objects.create(student_external_id="R-ADM", first_name="Ali", last_name="Valiyev")
    return Bot2Student.objects.create(
        student_external_id="STU-ADM", roster=roster, first_name="Ali", last_name="Valiyev"
    )


def _png(name="d.png"):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n" + b"0" * 16, content_type="image/png")


@contextmanager
def _joining_background_threads():
    """/bot/document run_document_verification_async orqali background thread'da
    Gemini tekshiruvini ishga tushiradi — threadni kuzatib, patch hali faol
    ekanida (va test tranzaksiyasi commit bo'lgach) join qilamiz, aks holda
    natija ko'rinmaydi yoki thread testdan tashqarida ishlab qoladi."""
    created = []
    real_init = threading.Thread.__init__

    def _tracking_init(self, *a, **kw):
        real_init(self, *a, **kw)
        created.append(self)

    with patch.object(threading.Thread, "__init__", _tracking_init):
        yield
    for t in created:
        t.join(timeout=5)


def _mk(student, *, conf="green", decision="pending", st="done", dtype="cv"):
    return DocumentVerification.objects.create(
        student=student, document_type=dtype, status=st,
        confidence_level=conf, final_decision=decision, file=_png(),
    )


# ── list + filters ─────────────────────────────────────────────────────────────

def test_list_returns_all_paginated(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    _mk(student); _mk(student, conf="red"); _mk(student, conf="yellow")
    resp = api_client.get(LIST_URL)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["count"] == 3
    assert len(resp.data["results"]) == 3


def test_list_filter_by_confidence_level(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    _mk(student, conf="green"); _mk(student, conf="red"); _mk(student, conf="red")
    resp = api_client.get(LIST_URL, {"confidence_level": "red"})
    assert resp.data["count"] == 2
    assert all(r["confidence_level"] == "red" for r in resp.data["results"])


def test_list_filter_by_final_decision(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    _mk(student, decision="pending"); _mk(student, decision="accepted")
    resp = api_client.get(LIST_URL, {"final_decision": "accepted"})
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["final_decision"] == "accepted"


def test_list_search_by_student(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    _mk(student)
    other_roster = StudentRoster.objects.create(student_external_id="R-OTHER")
    other = Bot2Student.objects.create(student_external_id="STU-OTHER", roster=other_roster, first_name="Bobur")
    _mk(other)
    resp = api_client.get(LIST_URL, {"search": "Valiyev"})
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["student_name"] == "Ali Valiyev"


def test_list_forbidden_for_viewer(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    assert api_client.get(LIST_URL).status_code == status.HTTP_403_FORBIDDEN


def test_list_unauthorized_for_anonymous():
    assert APIClient().get(LIST_URL).status_code == status.HTTP_401_UNAUTHORIZED


# ── stats ──────────────────────────────────────────────────────────────────────

def test_stats_counts_by_category_and_decision(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    _mk(student, conf="green", decision="accepted")
    _mk(student, conf="green", decision="pending")
    _mk(student, conf="red", decision="pending")
    _mk(student, conf="yellow", decision="rejected")

    resp = api_client.get(STATS_URL)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["total"] == 4
    assert resp.data["by_confidence"]["green"] == 2
    assert resp.data["by_confidence"]["red"] == 1
    assert resp.data["by_confidence"]["yellow"] == 1
    assert resp.data["by_decision"]["pending"] == 2
    assert resp.data["by_decision"]["accepted"] == 1
    assert resp.data["by_decision"]["rejected"] == 1


# ── review (decision + category override) ─────────────────────────────────────

def test_review_accept(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    v = _mk(student, conf="yellow")
    resp = api_client.patch(reverse("ai-verify-review", args=[v.id]),
                            {"final_decision": "accepted", "review_note": "ok"}, format="json")
    assert resp.status_code == status.HTTP_200_OK
    v.refresh_from_db()
    assert v.final_decision == "accepted"
    assert v.reviewed_by_id == admin_user.id


def test_review_overrides_confidence_level(api_client, admin_user, student):
    """Admin AI toifasini qo'lda o'zgartira oladi (qizil -> yashil)."""
    api_client.force_authenticate(user=admin_user)
    v = _mk(student, conf="red")
    resp = api_client.patch(reverse("ai-verify-review", args=[v.id]),
                            {"confidence_level": "green"}, format="json")
    assert resp.status_code == status.HTTP_200_OK
    v.refresh_from_db()
    assert v.confidence_level == "green"
    assert v.reviewed_by_id == admin_user.id


def test_review_both_decision_and_category(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    v = _mk(student, conf="red")
    resp = api_client.patch(reverse("ai-verify-review", args=[v.id]),
                            {"confidence_level": "green", "final_decision": "accepted"}, format="json")
    assert resp.status_code == status.HTTP_200_OK
    v.refresh_from_db()
    assert (v.confidence_level, v.final_decision) == ("green", "accepted")


def test_review_requires_at_least_one_field(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    v = _mk(student)
    resp = api_client.patch(reverse("ai-verify-review", args=[v.id]),
                            {"review_note": "just a note"}, format="json")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── retry (qaytadan tekshirish) ───────────────────────────────────────────────

def test_retry_reruns_failed_verification(api_client, admin_user, student):
    """Muvaffaqiyatsiz yozuvni qaytadan tekshirish — o'sha yozuv yangilanadi (yangi emas)."""
    api_client.force_authenticate(user=admin_user)
    v = _mk(student, st="failed", conf=None)
    v.error_message = "eski xato"
    v.save(update_fields=["error_message"])

    green = {
        "confidence_score": 0.9, "confidence_level": "green",
        "extracted_data": {"full_name": "Ali"}, "flags": [], "summary": "ok",
        "_usage": {"input_tokens": 10, "output_tokens": 5, "thinking_tokens": 0,
                   "total_tokens": 15, "cost_usd": 0, "latency_ms": 5,
                   "model_name": "gemini-2.5-flash", "status": "success", "error_message": ""},
    }
    with patch("ai_verification.orchestration.GeminiVerificationService") as M:
        M.return_value.verify.return_value = green
        resp = api_client.post(reverse("ai-verify-retry", args=[v.id]))

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["status"] == "done"
    assert resp.data["confidence_level"] == "green"
    assert resp.data["error_message"] == ""
    assert DocumentVerification.objects.count() == 1   # yangi yozuv yaratilmadi


def test_retry_forbidden_for_viewer(api_client, viewer_user, student):
    api_client.force_authenticate(user=viewer_user)
    v = _mk(student, st="failed")
    assert api_client.post(reverse("ai-verify-retry", args=[v.id])).status_code == status.HTTP_403_FORBIDDEN


# ── bot upload auto-verifies ──────────────────────────────────────────────────

@pytest.mark.django_db(transaction=True)
def test_bot_upload_auto_creates_verification(settings, student):
    """Bot /bot/document orqali yuklaganda DocumentVerification ham yaratiladi.

    Tekshiruv background thread'da ishlaydi (run_document_verification_async) —
    haqiqiy commit (transaction=True) va thread.join() kerak, aks holda thread'ning
    alohida DB ulanishi hali committed bo'lmagan test yozuvlarini ko'ra olmaydi.
    """
    from common.auth import _hashed
    settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}

    client = APIClient()
    green = {
        "confidence_score": 0.9, "confidence_level": "green",
        "extracted_data": {}, "flags": [], "summary": "ok",
        "_usage": {"input_tokens": 10, "output_tokens": 5, "thinking_tokens": 0,
                   "total_tokens": 15, "cost_usd": 0, "latency_ms": 5,
                   "model_name": "gemini-2.5-flash", "status": "success", "error_message": ""},
    }
    with patch("ai_verification.orchestration.GeminiVerificationService") as M, \
         _joining_background_threads():
        M.return_value.verify.return_value = green
        resp = client.post(
            reverse("bot-document-upload"),
            {"student_external_id": student.student_external_id, "doc_type": "cv", "file": _png()},
            format="multipart", HTTP_X_SERVICE_TOKEN="secret",
        )

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["verification_id"] is not None
    v = DocumentVerification.objects.get(id=resp.data["verification_id"])
    assert v.student_id == student.id
    assert v.document_type == "cv"
    assert v.confidence_level == "green"
    assert v.status == "done"


def test_bot_upload_without_gemini_key_skips_verification(settings, student):
    from common.auth import _hashed
    settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}
    settings.GEMINI_API_KEY = ""   # kalit yo'q -> tekshiruv o'tkazib yuboriladi

    client = APIClient()
    resp = client.post(
        reverse("bot-document-upload"),
        {"student_external_id": student.student_external_id, "doc_type": "cv", "file": _png()},
        format="multipart", HTTP_X_SERVICE_TOKEN="secret",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["verification_id"] is None
    assert DocumentVerification.objects.count() == 0
