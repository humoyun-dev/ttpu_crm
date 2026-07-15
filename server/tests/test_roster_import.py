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


def test_csv_alias_headers_are_normalized(api_client, admin_user, program_item):
    """Excel-style header aliases (student_id/ism/familya) also work for CSV uploads,
    not just .xlsx — so the column names documented in the dashboard behave identically
    regardless of file type."""
    api_client.force_authenticate(user=admin_user)
    csv_text = (
        "student_id,ism,familya,program_code,course_year\n"
        f"ALIAS-1,Ali,Valiyev,{program_item.code},2\n"
    )
    upload = SimpleUploadedFile("roster.csv", csv_text.encode("utf-8"), content_type="text/csv")

    resp = api_client.post(URL, {"file": upload}, format="multipart")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 1
    roster = StudentRoster.objects.get(student_external_id="ALIAS-1")
    assert roster.first_name == "Ali"
    assert roster.last_name == "Valiyev"
    assert roster.course_year == 2
    assert roster.program_id == program_item.id


def test_csv_merged_name_column_is_split(api_client, admin_user):
    """A merged 'ism familya' column is split into first/last name for CSV too."""
    api_client.force_authenticate(user=admin_user)
    csv_text = "student_id,ism familya\nMERGE-1,Ali Valiyev\n"
    upload = SimpleUploadedFile("roster.csv", csv_text.encode("utf-8"), content_type="text/csv")

    resp = api_client.post(URL, {"file": upload}, format="multipart")

    assert resp.status_code == status.HTTP_200_OK
    roster = StudentRoster.objects.get(student_external_id="MERGE-1")
    assert roster.first_name == "Ali"
    assert roster.last_name == "Valiyev"


def test_response_lists_imported_students(api_client, admin_user, program_item):
    """The response carries a `students` list describing each imported row so the
    dashboard can render what was imported."""
    api_client.force_authenticate(user=admin_user)
    payload = [
        {
            "student_external_id": "LST-1",
            "first_name": "Ali",
            "last_name": "Valiyev",
            "program_id": str(program_item.id),
            "course_year": 1,
        },
    ]

    resp = api_client.post(URL, payload, format="json")

    assert resp.status_code == status.HTTP_200_OK
    students = resp.data["students"]
    assert len(students) == 1
    s = students[0]
    assert s["row"] == 1
    assert s["student_external_id"] == "LST-1"
    assert s["first_name"] == "Ali"
    assert s["last_name"] == "Valiyev"
    assert s["course_year"] == 1
    assert s["program"] == program_item.name
    assert s["status"] == "created"


def test_reimport_matching_id_overwrites_in_place(api_client, admin_user):
    """Re-importing a row with an existing student_external_id lets Excel win: the
    stale name/birth_date are overwritten **in place** (same PK — the row is updated,
    not deleted+recreated, so CASCADE-linked students/surveys keep their FK)."""
    api_client.force_authenticate(user=admin_user)
    stale = StudentRoster.objects.create(student_external_id="DUP-1")  # prod-like: no name/birth
    old_pk = stale.pk

    resp = api_client.post(
        URL,
        [{
            "student_external_id": "DUP-1",
            "first_name": "Ali",
            "last_name": "Valiyev",
            "birth_date": "15.05.2000",
        }],
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 0
    assert resp.data["updated"] == 1
    fresh = StudentRoster.objects.get(student_external_id="DUP-1")
    assert fresh.pk == old_pk  # in-place update, FK links preserved
    assert fresh.first_name == "Ali"
    assert fresh.last_name == "Valiyev"
    assert str(fresh.birth_date) == "2000-05-15"
    assert StudentRoster.objects.filter(student_external_id="DUP-1").count() == 1


def test_reimport_blank_cells_do_not_wipe_existing(api_client, admin_user):
    """A blank Excel cell means "no value supplied", not "clear this field": a
    re-import that omits name/birth must leave the already-filled values intact."""
    api_client.force_authenticate(user=admin_user)
    StudentRoster.objects.create(
        student_external_id="KEEP-1", first_name="Ali", last_name="Valiyev"
    )

    resp = api_client.post(
        URL,
        [{"student_external_id": "KEEP-1", "first_name": "", "last_name": ""}],
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    fresh = StudentRoster.objects.get(student_external_id="KEEP-1")
    assert fresh.first_name == "Ali"  # not wiped by the empty cell
    assert fresh.last_name == "Valiyev"


def test_response_marks_updated_students_and_keeps_existing_program(api_client, admin_user, program_item):
    """An update is reported with status='updated' and the response reflects the TRUE
    post-upsert state — the program is preserved even though the row omitted it."""
    api_client.force_authenticate(user=admin_user)
    StudentRoster.objects.create(
        student_external_id="UPD-1", program=program_item, course_year=1
    )

    resp = api_client.post(URL, [{"student_external_id": "UPD-1", "course_year": 3}], format="json")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created"] == 0
    assert resp.data["updated"] == 1
    s = resp.data["students"][0]
    assert s["status"] == "updated"
    assert s["course_year"] == 3
    assert s["program"] == program_item.name  # preserved, not wiped


# --------------------------------------------------------------------------- #
# Real-world messy .xlsx (shape of the production "All Students.xlsx")
# --------------------------------------------------------------------------- #

def _messy_xlsx_bytes():
    """Build an in-memory .xlsx mirroring the real export's structure (fake data):
    a leading index column, an embedded stats block, a #REF! error cell, a merged
    "Full name" (SURNAME FIRST PATRONYMIC), a "Year" course column, a curly-apostrophe
    "Tug'ilgan sanasi" birth-date column with a real datetime, plus junk columns
    (Group / Tel / Grant / IELTS / Stats) that must be ignored, and a trailing
    stats-only row with no Student Id that must be skipped."""
    import openpyxl
    from datetime import datetime

    wb = openpyxl.Workbook()
    ws = wb.active
    # Curly apostrophe (U+2019) in the birth-date header — must still be recognised.
    ws.append(["", "Student Id", "Group", "Year", "", "Full name", "Grant",
               "Tug’ilgan sanasi", " Tel raqami", "IELTS", "Stats", "Umumiy"])
    ws.append([6, "STU-1", "ADN1-25", 1, "#REF!", "ABDUSALIMOV DONIYOR RAVSHANOVICH",
               "GRANT MINVUZ", datetime(2007, 7, 5), "901077330", "", "ADN1-25", 1172])
    ws.append([7, "STU-2", "IT1-22", 2, "#REF!", "ALIYEV BOBUR", "",
               datetime(2005, 3, 1), "935551020", 6.5, "IT1-22", 63])
    # Stats-remnant row: no Student Id → must be skipped, not an error.
    ws.append(["", "", "", "", "", "", "", "", "", "", "Umumiy", 1235])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_messy_real_world_xlsx_is_parsed(api_client, admin_user):
    """The production export (merged name, Year column, curly-apostrophe birth date,
    embedded stats columns, #REF! cells, id-less remnant row) imports correctly."""
    from datetime import date

    api_client.force_authenticate(user=admin_user)
    upload = SimpleUploadedFile(
        "All Students.xlsx", _messy_xlsx_bytes(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    resp = api_client.post(URL, {"file": upload}, format="multipart")

    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert resp.data["created"] == 2
    assert resp.data["skipped"] == 1          # the id-less stats remnant row
    assert resp.data["errors"] == []

    s1 = StudentRoster.objects.get(student_external_id="STU-1")
    # Merged "SURNAME FIRST PATRONYMIC" → first token / rest, preserving display order.
    assert s1.first_name == "ABDUSALIMOV"
    assert s1.last_name == "DONIYOR RAVSHANOVICH"
    assert s1.course_year == 1                # from the "Year" column
    assert s1.birth_date == date(2007, 7, 5)  # curly-apostrophe header + datetime cell
    assert s1.program is None                 # Group is NOT auto-mapped to a program

    s2 = StudentRoster.objects.get(student_external_id="STU-2")
    assert s2.course_year == 2
    assert s2.birth_date == date(2005, 3, 1)
