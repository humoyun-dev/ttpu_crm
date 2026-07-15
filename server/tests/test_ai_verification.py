"""ai_verification — Gemini hujjat tekshiruvi endpointlari.

Admin-only. submit -> Gemini (mock qilingan) -> DocumentVerification yozuvi
(done/failed). review -> xodim yakuniy qarori. Gemini API hech qachon
chaqirilmaydi — GeminiVerificationService mock qilinadi.
"""

import threading
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from ai_verification import orchestration
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


@pytest.mark.django_db(transaction=True)
def test_submit_starts_background_verification(api_client, admin_user, student):
    """submit endi background thread'da ishlaydi (run_document_verification_async,
    xuddi bot /bot/document dagi kabi) — HTTP so'rovni Gemini javobini kutib
    bloklamaydi. Javob darhol status=processing bilan, to'g'ri turdagi yozuv
    bilan qaytadi; Gemini natijasini xaritalash (green/red/xatolik) mantig'i
    _process_verification ustida alohida sinaladi (orchestration darajasida).

    transaction=True + thread.join(): background thread o'z DB ulanishida
    yozadi, shuning uchun oddiy (rollback qilinadigan) test tranzaksiyasi buni
    ko'ra olmaydi va testdan keyin ham ishlab turishi mumkin. Haqiqiy commit va
    threadni tugashini kutish shu muammoni oldini oladi.
    """
    created_threads = []
    real_thread_init = threading.Thread.__init__

    def _tracking_init(self, *a, **kw):
        real_thread_init(self, *a, **kw)
        created_threads.append(self)

    api_client.force_authenticate(user=admin_user)
    with patch("ai_verification.orchestration.GeminiVerificationService") as M, \
         patch.object(threading.Thread, "__init__", _tracking_init):
        M.return_value.verify.return_value = GREEN_RESULT
        resp = api_client.post(
            SUBMIT_URL,
            {"student_id": str(student.id), "document_type": "cv", "file": _png()},
            format="multipart",
        )
        # The background thread's target may not actually run until after this
        # `with` block would otherwise exit — join it here, still inside the
        # patch scope, so the mock is still active when it executes.
        for t in created_threads:
            t.join(timeout=5)

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["status"] == "processing"
    assert resp.data["document_type"] == "cv"
    assert resp.data["file_name"] == "cv.png"

    v = DocumentVerification.objects.get(pk=resp.data["id"])
    assert v.student_id == student.id
    assert v.uploaded_by_id == admin_user.id
    assert v.status == DocumentVerification.Status.DONE
    assert v.confidence_level == "green"
    assert v.final_decision == DocumentVerification.FinalDecision.ACCEPTED


def test_process_verification_marks_done_on_green_result(student):
    """Gemini natijasini done/green/accepted final_decision ga xaritalash mantig'i —
    orchestration darajasida to'g'ridan-to'g'ri sinaladi (submit endi background
    thread'da ishlagani uchun HTTP orqali sinxron kutib bo'lmaydi). Yashil (>=0.75)
    avtomatik qabul qilinadi (_process_verification)."""
    with patch("ai_verification.orchestration.GeminiVerificationService") as M:
        M.return_value.verify.return_value = GREEN_RESULT
        v = orchestration.run_document_verification(
            student=student, file=_png(), doc_type="cv",
        )

    assert v.status == DocumentVerification.Status.DONE
    assert v.confidence_level == "green"
    assert v.confidence_score == 0.9
    assert v.extracted_data["full_name"] == "Ali Valiyev"
    assert v.final_decision == DocumentVerification.FinalDecision.ACCEPTED
    assert v.processed_at is not None


def test_process_verification_error_result_marks_failed(student):
    """AI _error qaytarsa: yozuv yaratiladi lekin status=failed."""
    with patch("ai_verification.orchestration.GeminiVerificationService") as M:
        M.return_value.verify.return_value = {
            "confidence_score": 0.0,
            "confidence_level": "red",
            "extracted_data": {},
            "flags": ["processing_error"],
            "summary": "Xatolik: Javobni o'qib bo'lmadi",
            "_error": True,
        }
        v = orchestration.run_document_verification(
            student=student, file=_png(), doc_type="ielts",
        )

    assert v.status == DocumentVerification.Status.FAILED
    assert v.error_message


def test_process_verification_service_exception_marks_failed(student):
    """Service istisno tashlasa _process_verification uni ushlab status=failed
    qiladi (hech qachon exception ko'tarmaydi)."""
    with patch("ai_verification.orchestration.GeminiVerificationService") as M:
        M.return_value.verify.side_effect = RuntimeError("boom")
        v = orchestration.run_document_verification(
            student=student, file=_png(), doc_type="cv",
        )

    assert v.status == DocumentVerification.Status.FAILED
    assert "boom" in v.error_message


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
