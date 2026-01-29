import pytest
from django.core.management import call_command
from rest_framework import status
from rest_framework.reverse import reverse

from bot1.models import (
    Admissions2026Application,
    ApplicationStatus,
    Bot1Applicant,
    CampusTourRequest,
    FoundationRequest,
    PolitoAcademyRequest,
)
from bot2.models import Bot2SurveyResponse, StudentRoster
from catalog.models import CatalogItem

pytestmark = pytest.mark.django_db


def run_seed(seed=123, scale="small"):
    call_command("seed_ttpumock", "--upsert", "--seed", str(seed), "--scale", scale, "--days", "60")


def test_seed_idempotent_counts(api_client, admin_user):
    run_seed(seed=42, scale="small")
    first_roster = StudentRoster.objects.count()
    first_applicants = Bot1Applicant.objects.count()
    run_seed(seed=42, scale="small")
    assert StudentRoster.objects.count() == first_roster
    assert Bot1Applicant.objects.count() == first_applicants


def test_course_year_within_bounds(api_client, admin_user):
    run_seed(seed=7, scale="small")
    years = StudentRoster.objects.values_list("course_year", flat=True).distinct()
    assert all(1 <= y <= 4 for y in years)
    survey_years = Bot2SurveyResponse.objects.values_list("course_year", flat=True)
    assert all(1 <= y <= 4 for y in survey_years)


def test_programs_restricted_to_tppu(api_client, admin_user):
    run_seed(seed=9, scale="small")
    program_codes = set(CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM).values_list("code", flat=True))
    roster_programs = set(StudentRoster.objects.values_list("program__code", flat=True))
    assert roster_programs.issubset(program_codes)


def test_submitted_invariants(api_client, admin_user):
    run_seed(seed=11, scale="small")
    for model in [Admissions2026Application, CampusTourRequest, FoundationRequest, PolitoAcademyRequest]:
        for obj in model.objects.all():
            if obj.status == ApplicationStatus.NEW:
                assert obj.submitted_at is None
            else:
                assert obj.submitted_at is not None


def test_analytics_not_empty(api_client, admin_user):
    run_seed(seed=5, scale="small")
    api_client.force_authenticate(user=admin_user)
    from_ts = "2024-01-01T00:00:00Z"
    to_ts = "2027-01-01T00:00:00Z"

    resp = api_client.get(reverse("analytics-bot2-course"), {"from": from_ts, "to": to_ts})
    assert resp.status_code == status.HTTP_200_OK
    assert any(row["responded"] > 0 for row in resp.data)
