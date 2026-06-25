"""ai_verification — Gemini hujjat tekshiruvi endpointlari.

Admin-only. submit -> Gemini (mock qilingan) -> DocumentVerification yozuvi
(done/failed). review -> xodim yakuniy qarori. Gemini API hech qachon
chaqirilmaydi — GeminiVerificationService mock qilinadi.
"""

from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from ai_verification.models import DocumentVerification
from bot2.models import Bot2Student, StudentRoster


SUBMIT_URL = reverse("ai-verify-submit")

GREEN_RESULT = {
    "confidence_score": 0.9,
    "confidence_level": "green",
    "extracted_data": {"full_name": "Ali Valiyev", "email": "ali@example.com"},
    "flags": [],
    "summary": "CV to'liq va aniq.",
}


@pytest.fixture(autouse=True)
def _isolated_media(settings, tmp_path):
    """Har bir test alohida MEDIA_ROOT ishlatadi — repo media'siga fayl yozilmaydi."""
    settings.MEDIA_ROOT = str(tmp_path)
    settings.GEMINI_API_KEY = "test-key"  # service mock qilingani uchun ishlatilmaydi


@pytest.fixture
def student(db):
    roster = StudentRoster.objects.create(student_external_id="ROSTER-1")
    return Bot2Student.objects.create(
        student_external_id="STU-1",
        roster=roster,
        first_name="Ali",
        last_name="Valiyev",
    )


def _png(name="cv.png"):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="image/png")


def test_submit_creates_done_verification(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.views.GeminiVerificationService") as M:
        M.return_value.verify.return_value = GREEN_RESULT
        resp = api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "cv", "file": _png()},
            format="multipart",
        )

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["status"] == "done"
    assert resp.data["confidence_level"] == "green"
    assert resp.data["confidence_score"] == 0.9
    assert resp.data["extracted_data"]["full_name"] == "Ali Valiyev"
    assert resp.data["student_name"] == "Ali Valiyev"
    assert resp.data["file_name"] == "cv.png"
    assert resp.data["final_decision"] == "pending"

    v = DocumentVerification.objects.get(pk=resp.data["id"])
    assert v.status == DocumentVerification.Status.DONE
    assert v.uploaded_by_id == admin_user.id
    assert v.processed_at is not None


def test_submit_error_result_marks_failed(api_client, admin_user, student):
    """AI _error qaytarsa: yozuv yaratiladi (201) lekin status=failed."""
    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.views.GeminiVerificationService") as M:
        M.return_value.verify.return_value = {
            "confidence_score": 0.0,
            "confidence_level": "red",
            "extracted_data": {},
            "flags": ["processing_error"],
            "summary": "Xatolik: Javobni o'qib bo'lmadi",
            "_error": True,
        }
        resp = api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "ielts", "file": _png()},
            format="multipart",
        )

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["status"] == "failed"
    assert resp.data["error_message"]


def test_submit_service_exception_marks_failed(api_client, admin_user, student):
    """Service istisno tashlasa view uni ushlab status=failed qiladi (500 emas)."""
    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.views.GeminiVerificationService") as M:
        M.return_value.verify.side_effect = RuntimeError("boom")
        resp = api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "cv", "file": _png()},
            format="multipart",
        )

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["status"] == "failed"
    assert "boom" in resp.data["error_message"]


def test_submit_rejects_bad_file_type(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    bad = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
    resp = api_client.post(
        SUBMIT_URL,
        {"student_id": str(student.id), "document_type": "cv", "file": bad},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_viewer_is_forbidden(api_client, viewer_user, student):
    api_client.force_authenticate(user=viewer_user)
    resp = api_client.post(
        SUBMIT_URL,
        {"student_id": str(student.id), "document_type": "cv", "file": _png()},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert DocumentVerification.objects.count() == 0


def test_anonymous_is_unauthorized(student):
    client = APIClient()
    resp = client.post(
        SUBMIT_URL,
        {"student_id": str(student.id), "document_type": "cv", "file": _png()},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_review_accepts_done_verification(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    v = DocumentVerification.objects.create(
        student=student,
        document_type=DocumentVerification.DocumentType.CV,
        status=DocumentVerification.Status.DONE,
        confidence_level=DocumentVerification.ConfidenceLevel.GREEN,
        file=_png(),
    )

    resp = api_client.patch(
        reverse("ai-verify-review", args=[v.id]),
        {"final_decision": "accepted", "review_note": "To'g'ri"},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["final_decision"] == "accepted"
    v.refresh_from_db()
    assert v.final_decision == DocumentVerification.FinalDecision.ACCEPTED
    assert v.reviewed_by_id == admin_user.id
    assert v.reviewed_at is not None
    assert v.review_note == "To'g'ri"


def test_review_blocked_when_not_done(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    v = DocumentVerification.objects.create(
        student=student,
        document_type=DocumentVerification.DocumentType.CV,
        status=DocumentVerification.Status.PROCESSING,
        file=_png(),
    )

    resp = api_client.patch(
        reverse("ai-verify-review", args=[v.id]),
        {"final_decision": "accepted"},
        format="json",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    v.refresh_from_db()
    assert v.final_decision == DocumentVerification.FinalDecision.PENDING


def test_student_verifications_list(api_client, admin_user, student):
    api_client.force_authenticate(user=admin_user)
    for dt in ("cv", "ielts"):
        DocumentVerification.objects.create(
            student=student, document_type=dt,
            status=DocumentVerification.Status.DONE, file=_png(),
        )

    resp = api_client.get(reverse("ai-verify-student", args=[student.id]))
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) == 2


def test_detail_not_found(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(
        reverse("ai-verify-detail", args=["00000000-0000-0000-0000-000000000000"])
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND
