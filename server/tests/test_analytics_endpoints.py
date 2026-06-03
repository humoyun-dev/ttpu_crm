"""M-19 — bot2 analytics endpoints other than course-year-coverage.

Endpoints under test (URL names from crm_server/urls.py):
* analytics-bot2-program            → bot2_program_coverage
* analytics-bot2-matrix             → bot2_program_course_matrix
* analytics-bot2-program-year       → bot2_program_details_by_year (course_year required)
* analytics-bot2-enrollments-overview → enrollments_overview
* analytics-bot2-academic-years     → bot2_academic_years

Survey rows must satisfy Bot2SurveyResponse.clean(): the survey's roster/program/
course_year must agree with the student's roster. The `_seed_survey` helper builds a
consistent roster + student + survey triple.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse

from bot2.models import Bot2Student, Bot2SurveyResponse, ProgramEnrollment, StudentRoster


def _range():
    start = (timezone.now() - timedelta(days=1)).isoformat()
    end = (timezone.now() + timedelta(days=1)).isoformat()
    return {"from": start, "to": end}


def _seed_survey(
    program,
    *,
    ext_id,
    course_year,
    campaign="default",
    employment_status="",
    roster_campaign="default",
    submitted=True,
):
    """Create a roster + student + (optionally submitted) survey that all agree."""
    roster = StudentRoster.objects.create(
        student_external_id=ext_id,
        program=program,
        course_year=course_year,
        is_active=True,
        roster_campaign=roster_campaign,
    )
    student = Bot2Student.objects.create(student_external_id=ext_id, roster=roster)
    survey = Bot2SurveyResponse.objects.create(
        student=student,
        roster=roster,
        program=program,
        course_year=course_year,
        survey_campaign=campaign,
        employment_status=employment_status,
        submitted_at=timezone.now() if submitted else None,
    )
    return roster, student, survey


# --------------------------------------------------------------------------- #
# Time-range guard (all endpoints except academic-years require from/to)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "url_name",
    [
        "analytics-bot2-program",
        "analytics-bot2-matrix",
        "analytics-bot2-program-year",
        "analytics-bot2-enrollments-overview",
    ],
)
def test_endpoint_requires_time_range(api_client, admin_user, url_name):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(reverse(url_name))
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "TIME_RANGE_REQUIRED"


def test_academic_years_does_not_require_time_range(api_client, admin_user):
    """academic-years is the one analytics endpoint with no time-range requirement."""
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(reverse("analytics-bot2-academic-years"))
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data == []


# --------------------------------------------------------------------------- #
# program_details_by_year — course_year is mandatory
# --------------------------------------------------------------------------- #

def test_program_details_requires_course_year(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(reverse("analytics-bot2-program-year"), _range())
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "COURSE_YEAR_REQUIRED"


# --------------------------------------------------------------------------- #
# bot2_program_coverage — happy path (roster-based, no enrollment rows)
# --------------------------------------------------------------------------- #

def test_program_coverage_happy_path(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    # Two roster rows for the program, one of which responds.
    _seed_survey(program_item, ext_id="P-1", course_year=1, submitted=True)
    StudentRoster.objects.create(
        student_external_id="P-2", program=program_item, course_year=1, is_active=True
    )

    resp = api_client.get(reverse("analytics-bot2-program"), _range())

    assert resp.status_code == status.HTTP_200_OK
    row = next(r for r in resp.data if r["program_id"] == program_item.id)
    assert row["program_name"] == program_item.name
    assert row["total"] == 2
    assert row["responded"] == 1
    assert row["coverage_percent"] == 50.0


def test_program_coverage_clamps_above_100(api_client, admin_user, program_item):
    """SECURITY/CORRECTNESS: more responders than the roster total must not yield
    coverage > 100. Seed 1 roster row but 2 distinct responders for the program."""
    api_client.force_authenticate(user=admin_user)
    # Single roster row → total = 1.
    _seed_survey(program_item, ext_id="CL-1", course_year=1, submitted=True)
    # A second responder whose roster is in a *different* campaign, so it is not
    # counted in the default-campaign total but its survey IS counted as a response.
    _seed_survey(
        program_item,
        ext_id="CL-2",
        course_year=1,
        submitted=True,
        roster_campaign="ghost",  # excluded from default-campaign totals
        campaign="default",        # but the survey is on the default campaign
    )

    resp = api_client.get(reverse("analytics-bot2-program"), _range())

    assert resp.status_code == status.HTTP_200_OK
    row = next(r for r in resp.data if r["program_id"] == program_item.id)
    assert row["total"] == 1
    assert row["responded"] == 2
    assert row["coverage_percent"] <= 100.0
    assert row["coverage_percent"] == 100.0


def test_program_coverage_year5_fallback_with_academic_year(api_client, admin_user, program_item):
    """When an academic_year is active (auto-detected from ProgramEnrollment), graduates
    (course_year=5) still surface via the roster fallback rather than being dropped."""
    api_client.force_authenticate(user=admin_user)
    # An enrollment row makes _resolve_academic_year pick this academic year.
    ProgramEnrollment.objects.create(
        program=program_item,
        course_year=1,
        student_count=10,
        academic_year="2025-2026",
        campaign="default",
        is_active=True,
    )
    # A year-5 graduate exists only in the roster, with a response.
    _seed_survey(program_item, ext_id="G-1", course_year=5, submitted=True)

    resp = api_client.get(reverse("analytics-bot2-program"), _range())

    assert resp.status_code == status.HTTP_200_OK
    row = next(r for r in resp.data if r["program_id"] == program_item.id)
    # total = 10 (enrollment year 1) + 1 (roster graduate) folded together.
    assert row["total"] == 11
    assert row["responded"] == 1


# --------------------------------------------------------------------------- #
# bot2_program_course_matrix
# --------------------------------------------------------------------------- #

def test_program_course_matrix_shape(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    _seed_survey(program_item, ext_id="M-1", course_year=2, submitted=True)

    resp = api_client.get(reverse("analytics-bot2-matrix"), _range())

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["years"] == [1, 2, 3, 4, 5]
    program_ids = {p["id"] for p in resp.data["programs"]}
    assert program_item.id in program_ids
    # Each program contributes one cell per course year.
    cells = [c for c in resp.data["cells"] if c["program_id"] == program_item.id]
    assert len(cells) == 5
    year2 = next(c for c in cells if c["course_year"] == 2)
    assert year2["total"] == 1
    assert year2["responded"] == 1
    assert year2["coverage_percent"] == 100.0


# --------------------------------------------------------------------------- #
# bot2_program_details_by_year — employment classification
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("emp_status", ["ishlayapman", "employed", "ишлаяпман"])
def test_program_details_classifies_employed(api_client, admin_user, program_item, emp_status):
    api_client.force_authenticate(user=admin_user)
    _seed_survey(
        program_item, ext_id=f"E-{emp_status}", course_year=1,
        employment_status=emp_status, submitted=True,
    )

    params = {**_range(), "course_year": 1}
    resp = api_client.get(reverse("analytics-bot2-program-year"), params)

    assert resp.status_code == status.HTTP_200_OK
    row = next(r for r in resp.data if r["program_id"] == program_item.id)
    assert row["employed"] == 1
    assert row["unemployed"] == 0


@pytest.mark.parametrize("emp_status", ["", "not working", "ishsiz", "student"])
def test_program_details_classifies_unemployed(api_client, admin_user, program_item, emp_status):
    api_client.force_authenticate(user=admin_user)
    _seed_survey(
        program_item, ext_id=f"U-{emp_status or 'blank'}", course_year=1,
        employment_status=emp_status, submitted=True,
    )

    params = {**_range(), "course_year": 1}
    resp = api_client.get(reverse("analytics-bot2-program-year"), params)

    assert resp.status_code == status.HTTP_200_OK
    row = next(r for r in resp.data if r["program_id"] == program_item.id)
    assert row["employed"] == 0
    assert row["unemployed"] == 1


# --------------------------------------------------------------------------- #
# enrollments_overview
# --------------------------------------------------------------------------- #

def test_enrollments_overview_aggregates(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    ProgramEnrollment.objects.create(
        program=program_item, course_year=1, student_count=4,
        academic_year="2025-2026", campaign="default", is_active=True,
    )
    # One year-1 student responds (must align with the enrollment year).
    _seed_survey(program_item, ext_id="O-1", course_year=1, submitted=True)

    resp = api_client.get(reverse("analytics-bot2-enrollments-overview"), _range())

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["total_students"] == 4
    assert resp.data["total_responded"] == 1
    assert resp.data["coverage_percent"] == 25.0
    by_year_1 = next(y for y in resp.data["by_year"] if y["course_year"] == 1)
    assert by_year_1["total"] == 4
    assert by_year_1["responded"] == 1
    assert any(p["program_id"] == program_item.id for p in resp.data["by_program"])


# --------------------------------------------------------------------------- #
# bot2_academic_years
# --------------------------------------------------------------------------- #

def test_academic_years_lists_distinct_newest_first(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    for ay, cy in [("2024-2025", 1), ("2025-2026", 1), ("2025-2026", 2)]:
        ProgramEnrollment.objects.create(
            program=program_item, course_year=cy, student_count=1,
            academic_year=ay, campaign="default", is_active=True,
        )

    resp = api_client.get(reverse("analytics-bot2-academic-years"))

    assert resp.status_code == status.HTTP_200_OK
    # Distinct, newest first.
    assert resp.data == ["2025-2026", "2024-2025"]
