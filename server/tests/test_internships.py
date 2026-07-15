"""Tests for the Amaliyot (Internship) module — bot endpoints + staff review."""
import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from bot2.models import Bot2Student, Bot2StudentAccount, StudentRoster
from catalog.models import CatalogItem
from employers.models import Employer
from internships.models import InternshipRequest

User = get_user_model()
SERVICE_TOKEN = "raw-bot2-service-token"
TG_ID = 700100200


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(email="staff@test.com", password="pw12345678", role="admin")


@pytest.fixture
def direction(db):
    return CatalogItem.objects.create(
        type=CatalogItem.ItemType.DIRECTION, code="DIR-INT", name="Int Dir", is_active=True
    )


@pytest.fixture
def student(db, direction):
    roster = StudentRoster.objects.create(
        student_external_id="INT-001", program=direction, course_year=3
    )
    s = Bot2Student.objects.create(
        student_external_id="INT-001", roster=roster, telegram_user_id=TG_ID,
        first_name="Diyora", last_name="Karimova", language="uz",
    )
    Bot2StudentAccount.objects.create(student=s, telegram_user_id=TG_ID, is_active=True)
    return s


@pytest.fixture
def employer(db):
    return Employer.objects.create(name="Artel", industry="Ishlab chiqarish", location="Toshkent")


def _post_internship(api_client, **body):
    return api_client.post(
        "/api/v1/bot/internship", body, format="json", HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN
    )


# ── Bot: create ───────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_bot_create_requires_service_token(api_client):
    resp = api_client.post("/api/v1/bot/internship", {"telegram_id": TG_ID}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_bot_create_from_registry_snapshots_company_name(api_client, student, employer):
    resp = _post_internship(api_client, telegram_id=TG_ID, employer_id=str(employer.id), note="Yozgi")
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"
    req = InternshipRequest.objects.get(id=resp.json()["id"])
    assert req.employer == employer
    assert req.company_name == "Artel"  # snapshot
    assert req.note == "Yozgi"
    assert req.student == student


@pytest.mark.django_db
def test_bot_create_free_text(api_client, student):
    resp = _post_internship(api_client, telegram_id=TG_ID, company_name="Nomsiz MChJ")
    assert resp.status_code == 201
    req = InternshipRequest.objects.get(id=resp.json()["id"])
    assert req.employer is None
    assert req.company_name == "Nomsiz MChJ"


@pytest.mark.django_db
def test_bot_create_requires_company_or_employer(api_client, student):
    resp = _post_internship(api_client, telegram_id=TG_ID)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.django_db
def test_bot_create_malformed_employer_id_is_400_not_500(api_client, student):
    resp = _post_internship(api_client, telegram_id=TG_ID, employer_id="not-a-uuid")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_EMPLOYER"


@pytest.mark.django_db
def test_bot_create_unknown_student(api_client):
    resp = _post_internship(api_client, telegram_id=999999, company_name="X")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "STUDENT_NOT_FOUND"


@pytest.mark.django_db
def test_bot_create_rejects_second_pending(api_client, student):
    first = _post_internship(api_client, telegram_id=TG_ID, company_name="A")
    assert first.status_code == 201
    second = _post_internship(api_client, telegram_id=TG_ID, company_name="B")
    assert second.status_code == 409
    body = second.json()["error"]
    assert body["code"] == "ALREADY_PENDING"
    assert body["details"]["company_name"] == "A"


# ── Bot: status + employers ───────────────────────────────────────────────────
@pytest.mark.django_db
def test_bot_status_reports_pending(api_client, student):
    _post_internship(api_client, telegram_id=TG_ID, company_name="Artel")
    resp = api_client.get(
        f"/api/v1/bot/internship/status?telegram_id={TG_ID}", HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN
    )
    assert resp.status_code == 200
    assert resp.json() == {"has_pending": True, "company_name": "Artel", "status": "pending"}


@pytest.mark.django_db
def test_bot_status_no_pending(api_client, student):
    resp = api_client.get(
        f"/api/v1/bot/internship/status?telegram_id={TG_ID}", HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN
    )
    assert resp.status_code == 200
    assert resp.json() == {"has_pending": False}


@pytest.mark.django_db
def test_bot_employers_list(api_client, employer):
    Employer.objects.create(name="Beeline")
    resp = api_client.get("/api/v1/bot/employers", HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN)
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    names = [e["name"] for e in data["results"]]
    assert names == ["Artel", "Beeline"]  # ordered by name


@pytest.mark.django_db
def test_bot_employers_search(api_client, employer):
    Employer.objects.create(name="Beeline")
    resp = api_client.get("/api/v1/bot/employers?q=art", HTTP_X_SERVICE_TOKEN=SERVICE_TOKEN)
    assert resp.status_code == 200
    assert [e["name"] for e in resp.json()["results"]] == ["Artel"]


# ── Staff: review ─────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_staff_list_and_filter(api_client, admin_user, student):
    InternshipRequest.objects.create(student=student, company_name="A", status="pending")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/internships/?status=pending")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    row = resp.json()["results"][0]
    assert row["student_name"] == "Diyora Karimova"
    assert row["company_name"] == "A"


@pytest.mark.django_db
def test_staff_search_filters_serverside(api_client, admin_user, student, direction):
    other_roster = StudentRoster.objects.create(student_external_id="INT-002", program=direction, course_year=2)
    other = Bot2Student.objects.create(student_external_id="INT-002", roster=other_roster)
    InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    InternshipRequest.objects.create(student=other, company_name="Beeline", status="pending")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/internships/?search=Artel")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["results"][0]["company_name"] == "Artel"


@pytest.mark.django_db
def test_staff_approve_sets_reviewer_and_status(api_client, admin_user, student, django_capture_on_commit_callbacks):
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    api_client.force_authenticate(user=admin_user)
    with django_capture_on_commit_callbacks(execute=True):
        resp = api_client.patch(f"/api/v1/internships/{req.id}/", {"status": "approved"}, format="json")
    assert resp.status_code == 200
    req.refresh_from_db()
    assert req.status == "approved"
    assert req.reviewed_by == admin_user
    assert req.reviewed_at is not None


@pytest.mark.django_db
def test_staff_reject_with_comment(api_client, admin_user, student):
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.patch(
        f"/api/v1/internships/{req.id}/",
        {"status": "rejected", "staff_comment": "Aloqa yo'q"},
        format="json",
    )
    assert resp.status_code == 200
    req.refresh_from_db()
    assert req.status == "rejected"
    assert req.staff_comment == "Aloqa yo'q"


@pytest.mark.django_db
def test_staff_cannot_set_invalid_status(api_client, admin_user, student):
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.patch(f"/api/v1/internships/{req.id}/", {"status": "pending"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_staff_patch_without_status_is_rejected(api_client, admin_user, student):
    """A comment-only PATCH must not silently leave status pending + misfire a
    'rejected' notification. status is required."""
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.patch(
        f"/api/v1/internships/{req.id}/", {"staff_comment": "izoh"}, format="json"
    )
    assert resp.status_code == 400
    req.refresh_from_db()
    assert req.status == "pending"
    assert req.reviewed_by is None


@pytest.mark.django_db
def test_staff_cannot_re_review_decided(api_client, admin_user, student):
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="approved")
    api_client.force_authenticate(user=admin_user)
    resp = api_client.patch(f"/api/v1/internships/{req.id}/", {"status": "rejected"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_staff_write_requires_admin_role(api_client, student):
    viewer = User.objects.create_user(email="viewer@test.com", password="pw12345678", role="viewer")
    req = InternshipRequest.objects.create(student=student, company_name="Artel", status="pending")
    api_client.force_authenticate(user=viewer)
    resp = api_client.patch(f"/api/v1/internships/{req.id}/", {"status": "approved"}, format="json")
    assert resp.status_code == 403


# ── DB constraint ─────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_partial_unique_one_pending_per_student(student):
    InternshipRequest.objects.create(student=student, company_name="A", status="pending")
    # A decided one is allowed alongside the pending one.
    InternshipRequest.objects.create(student=student, company_name="B", status="approved")
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            InternshipRequest.objects.create(student=student, company_name="C", status="pending")
