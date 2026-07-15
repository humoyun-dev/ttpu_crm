"""Roster list `missing_birth_date` filter — dashboard highlights imported students
who have no birth date (they cannot self-verify in the bot until staff fill it in)."""

from datetime import date

from rest_framework import status
from rest_framework.reverse import reverse

from bot2.models import StudentRoster

LIST = reverse("bot2-roster-list")


def test_missing_birth_date_filter(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    StudentRoster.objects.create(
        student_external_id="HAS-BD", program=program_item, course_year=1,
        birth_date=date(2005, 1, 1),
    )
    StudentRoster.objects.create(
        student_external_id="NO-BD", program=program_item, course_year=1,
        birth_date=None,
    )

    # true → only the student WITHOUT a birth date
    resp = api_client.get(LIST, {"missing_birth_date": "true"})
    assert resp.status_code == status.HTTP_200_OK
    assert {r["student_external_id"] for r in resp.data["results"]} == {"NO-BD"}

    # false → only the student WITH a birth date
    resp = api_client.get(LIST, {"missing_birth_date": "false"})
    assert {r["student_external_id"] for r in resp.data["results"]} == {"HAS-BD"}

    # no filter → both are listed
    resp = api_client.get(LIST)
    assert {"HAS-BD", "NO-BD"} <= {r["student_external_id"] for r in resp.data["results"]}
