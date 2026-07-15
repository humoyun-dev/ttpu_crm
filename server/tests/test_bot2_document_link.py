"""
Regression tests for document → survey binding.

The bot uploads a document mid-survey (before the survey row exists), then submits.
Historically the file→survey link relied on round-tripping each doc_id through the
answers payload; a dropped key left the document bound to the profile but not the
survey. The survey-session key makes the binding robust: every upload of one run
carries the same key and the submit re-sends it, so all its documents attach even
when no doc_id reaches the answers payload.
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from bot2.models import Bot2Document, Bot2Student, Bot2SurveyResponse, StudentRoster
from catalog.models import CatalogItem

SERVICE_TOKEN = "raw-bot2-service-token"
PDF_BYTES = b"%PDF-1.4 minimal test document"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def direction(db):
    return CatalogItem.objects.create(
        type=CatalogItem.ItemType.DIRECTION,
        code="DIR-DOC-LINK",
        name="Doc Link Direction",
        is_active=True,
    )


@pytest.fixture
def student(db, direction):
    roster = StudentRoster.objects.create(
        student_external_id="DOC-001",
        program=direction,
        course_year=1,
    )
    return Bot2Student.objects.create(
        student_external_id="DOC-001",
        roster=roster,
        telegram_user_id=555000111,
    )


def _upload(api_client, doc_type="cv", session_key=""):
    data = {
        "student_external_id": "DOC-001",
        "doc_type": doc_type,
        "file": SimpleUploadedFile(f"{doc_type}.pdf", PDF_BYTES, content_type="application/pdf"),
    }
    if session_key:
        data["survey_session_key"] = session_key
    return api_client.post(
        "/api/v1/bot/document",
        data,
        format="multipart",
        HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN,
    )


def _submit(api_client, direction, *, survey_session_key="", answers=None):
    payload = {
        "student_external_id": "DOC-001",
        "telegram_user_id": 555000111,
        "program_id": str(direction.id),
        "employment_status": "unemployed",
        "answers": answers or {},
    }
    if survey_session_key:
        payload["survey_session_key"] = survey_session_key
    return api_client.post(
        "/api/v1/bot2/surveys/submit",
        payload,
        format="json",
        HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN,
    )


@pytest.mark.django_db
def test_upload_stores_session_key_and_leaves_survey_null(api_client, student):
    resp = _upload(api_client, "cv", session_key="sess-abc")
    assert resp.status_code == 201
    doc = Bot2Document.objects.get(id=resp.json()["doc_id"])
    assert doc.survey_session_key == "sess-abc"
    assert doc.survey_id is None  # not linked until submit
    assert doc.student == student


@pytest.mark.django_db
def test_submit_binds_documents_by_session_key_without_doc_ids(api_client, student, direction):
    """The core fix: documents attach via the session key even though the answers
    payload carries no cv_doc_id/cert_doc_id."""
    cv = _upload(api_client, "cv", session_key="run-1").json()["doc_id"]
    cert = _upload(api_client, "certificate", session_key="run-1").json()["doc_id"]

    resp = _submit(api_client, direction, survey_session_key="run-1", answers={})
    assert resp.status_code == 200
    survey_id = resp.json()["response_id"]

    assert Bot2Document.objects.get(id=cv).survey_id is not None
    assert str(Bot2Document.objects.get(id=cv).survey_id) == survey_id
    assert str(Bot2Document.objects.get(id=cert).survey_id) == survey_id


@pytest.mark.django_db
def test_session_key_only_binds_matching_run(api_client, student, direction):
    """A document from an earlier, abandoned run (different key) is not swept into
    the new survey."""
    stale = _upload(api_client, "cv", session_key="old-run").json()["doc_id"]
    fresh = _upload(api_client, "cv", session_key="new-run").json()["doc_id"]

    resp = _submit(api_client, direction, survey_session_key="new-run")
    survey_id = resp.json()["response_id"]

    assert str(Bot2Document.objects.get(id=fresh).survey_id) == survey_id
    assert Bot2Document.objects.get(id=stale).survey_id is None


@pytest.mark.django_db
def test_doc_id_fallback_still_links(api_client, student, direction):
    """Backward compatibility: a document without a session key still links via the
    explicit doc_id in the answers payload."""
    cv = _upload(api_client, "cv").json()["doc_id"]
    assert Bot2Document.objects.get(id=cv).survey_session_key == ""

    resp = _submit(api_client, direction, answers={"cv_doc_id": cv})
    survey_id = resp.json()["response_id"]
    assert str(Bot2Document.objects.get(id=cv).survey_id) == survey_id
