from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster


def test_analytics_requires_time_range(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(reverse("analytics-bot2-course"))
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "TIME_RANGE_REQUIRED"


def test_course_year_coverage_includes_all_years(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    # Create rosters for all years
    rosters = []
    for year in [1, 2, 3, 4]:
        rosters.append(
            StudentRoster.objects.create(
                student_external_id=f"s{year}",
                program=program_item,
                course_year=year,
                is_active=True,
            )
        )
    # Only year 1 responds
    student = Bot2Student.objects.create(student_external_id="s1", roster=rosters[0])
    Bot2SurveyResponse.objects.create(
        student=student,
        roster=rosters[0],
        program=program_item,
        course_year=1,
        survey_campaign="default",
        submitted_at=timezone.now(),
    )

    start = (timezone.now() - timedelta(days=1)).isoformat()
    end = (timezone.now() + timedelta(days=1)).isoformat()
    resp = api_client.get(reverse("analytics-bot2-course"), {"from": start, "to": end})
    assert resp.status_code == status.HTTP_200_OK
    data = resp.data
    assert len(data) == 4
    year_map = {row["course_year"]: row for row in data}
    assert year_map[1]["responded"] == 1
    assert all(year in year_map for year in [1, 2, 3, 4])
