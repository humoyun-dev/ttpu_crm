"""M-18 — roster import endpoint (`bot2-roster-import`, POST /api/v1/admin/roster/import).

Admin-only. Accepts a JSON list, a `{"rows": [...]}` envelope, or a multipart CSV upload.
Each row is validated independently; a mix of good and bad rows yields HTTP 207 with the
failures listed under `errors`. The endpoint always writes a `roster_import` audit row.

`program_item` (a PROGRAM CatalogItem with code="PA") is the program referenced by rows.
"""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from audit.models import AuditLog
from bot2.models import StudentRoster


URL = reverse("bot2-roster-import")


def test_json_list_creates_rosters(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    payload = [
        {"student_external_id": "S-1", "program_id": str(program_item.id), "course_year": 1},
        {"student_external_id": "S-2", "program_id": str(program_item.id), "course_year": 2},
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 2
    assert resp.data["updated"] == 0
    assert resp.data["errors"] == []
    assert StudentRoster.objects.filter(student_external_id__in=["S-1", "S-2"]).count() == 2


def test_rows_envelope_shape_works(api_client, admin_user, program_item):
    """The `{"rows": [...]}` envelope is accepted the same as a bare list."""
    api_client.force_authenticate(user=admin_user)
    payload = {"rows": [
        {"student_external_id": "R-1", "program_id": str(program_item.id), "course_year": 3},
    ]}

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 1
    assert StudentRoster.objects.filter(student_external_id="R-1").exists()


def test_program_code_resolves_program(api_client, admin_user, program_item):
    """Rows may reference the program by `program_code` instead of `program_id`."""
    api_client.force_authenticate(user=admin_user)
    payload = [
        {"student_external_id": "C-1", "program_code": program_item.code, "course_year": 4},
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 1
    roster = StudentRoster.objects.get(student_external_id="C-1")
    assert roster.program_id == program_item.id


def test_csv_file_upload_creates_rosters(api_client, admin_user, program_item):
    """A multipart CSV upload is parsed via the `file` field."""
    api_client.force_authenticate(user=admin_user)
    csv_text = (
        "student_external_id,program_id,course_year\n"
        f"CSV-1,{program_item.id},1\n"
        f"CSV-2,{program_item.id},5\n"  # 5 = graduated, still valid
    )
    upload = SimpleUploadedFile("roster.csv", csv_text.encode("utf-8"), content_type="text/csv")

    resp = api_client.post(URL, {"file": upload}, format="multipart")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 2
    assert StudentRoster.objects.filter(student_external_id="CSV-2", course_year=5).exists()


def test_mixed_rows_returns_207_with_errors(api_client, admin_user, program_item):
    """One valid row + one invalid row (out-of-range course_year) → HTTP 207, the bad
    row is reported in `errors`, and the good row is still persisted."""
    api_client.force_authenticate(user=admin_user)
    payload = [
        {"student_external_id": "OK-1", "program_id": str(program_item.id), "course_year": 1},
        {"student_external_id": "BAD-1", "program_id": str(program_item.id), "course_year": 9},
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_207_MULTI_STATUS
    assert resp.data["created"] == 1
    assert len(resp.data["errors"]) == 1
    assert resp.data["errors"][0]["row"] == 2
    assert StudentRoster.objects.filter(student_external_id="OK-1").exists()
    assert not StudentRoster.objects.filter(student_external_id="BAD-1").exists()


def test_unknown_program_row_is_an_error(api_client, admin_user, program_item):
    """A row whose program cannot be resolved is reported as an error, not a 500."""
    api_client.force_authenticate(user=admin_user)
    payload = [
        {"student_external_id": "OK-2", "program_id": str(program_item.id), "course_year": 1},
        {
            "student_external_id": "NOPROG-1",
            "program_id": "00000000-0000-0000-0000-000000000000",
            "course_year": 1,
        },
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_207_MULTI_STATUS
    assert resp.data["created"] == 1
    assert len(resp.data["errors"]) == 1
    assert resp.data["errors"][0]["row"] == 2


def test_invalid_payload_returns_400(api_client, admin_user):
    """Neither a file, a list, nor a rows envelope → INVALID_PAYLOAD / 400."""
    api_client.force_authenticate(user=admin_user)

    resp = api_client.post(URL, {"foo": "bar"}, format="json")

    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "INVALID_PAYLOAD"


def test_viewer_is_forbidden(api_client, viewer_user, program_item):
    """A non-admin authenticated user is rejected with 403."""
    api_client.force_authenticate(user=viewer_user)
    payload = [
        {"student_external_id": "V-1", "program_id": str(program_item.id), "course_year": 1},
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert not StudentRoster.objects.filter(student_external_id="V-1").exists()


def test_anonymous_is_unauthorized(program_item):
    """An unauthenticated request is rejected with 401."""
    client = APIClient()
    payload = [
        {"student_external_id": "A-1", "program_id": str(program_item.id), "course_year": 1},
    ]

    resp = client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_audit_log_written_on_import(api_client, admin_user, program_item):
    """Every import writes exactly one roster_import audit row recording the tallies."""
    api_client.force_authenticate(user=admin_user)
    payload = [
        {"student_external_id": "AUD-1", "program_id": str(program_item.id), "course_year": 1},
        {"student_external_id": "AUD-BAD", "program_id": str(program_item.id), "course_year": 0},
    ]

    resp = api_client.post(URL, payload, format="json")
    assert resp.status_code == status.HTTP_207_MULTI_STATUS

    logs = AuditLog.objects.filter(meta__type="roster_import")
    assert logs.count() == 1
    log = logs.first()
    assert log.actor_user_id == admin_user.id
    assert log.after_data["created"] == 1
    assert log.after_data["errors"] == 1
