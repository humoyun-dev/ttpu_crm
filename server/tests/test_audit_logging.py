"""M-20 — audit logging for Bot2Student and Bot2SurveyResponse viewsets.

`Bot2StudentViewSet` and `Bot2SurveyResponseViewSet` gained perform_create/update/destroy
hooks that call `log_audit`. These tests confirm an AuditLog row is written with the
correct action and entity_table when those mutations happen through the API.

Roster and enrollment viewsets already audited; a couple of quick checks below confirm
those hooks still fire too.

Implementation note (see test_student_create_audit_via_viewset): Bot2Student CREATE over
HTTP is currently NOT exercisable — `Bot2StudentSerializer` marks `roster` read-only while
the model requires it, so a POST 500s before the audit hook. The create audit hook is
therefore driven through the serializer directly. This is flagged as a real finding, not
worked around in production code.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.reverse import reverse

from audit.models import AuditLog
from bot2.models import (
    Bot2Student,
    Bot2SurveyResponse,
    ProgramEnrollment,
    StudentRoster,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _make_roster(program, ext_id="aud-1", course_year=1):
    return StudentRoster.objects.create(
        student_external_id=ext_id, program=program, course_year=course_year, is_active=True
    )


def _student_url(student):
    return reverse("bot2-student-detail", args=[student.id])


def _survey_url(survey):
    return reverse("bot2-survey-detail", args=[survey.id])


STUDENT_TABLE = Bot2Student._meta.db_table
SURVEY_TABLE = Bot2SurveyResponse._meta.db_table


# --------------------------------------------------------------------------- #
# Bot2Student
# --------------------------------------------------------------------------- #

def test_student_update_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster = _make_roster(program_item)
    student = Bot2Student.objects.create(student_external_id="aud-1", roster=roster)

    resp = api_client.patch(_student_url(student), {"first_name": "Renamed"}, format="json")

    assert resp.status_code == status.HTTP_200_OK
    log = AuditLog.objects.get(action="update", entity_table=STUDENT_TABLE, entity_id=student.id)
    assert log.actor_user_id == admin_user.id
    assert log.after_data["student_external_id"] == "aud-1"


def test_student_delete_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster = _make_roster(program_item)
    student = Bot2Student.objects.create(student_external_id="aud-2", roster=roster)
    student_id = student.id

    resp = api_client.delete(_student_url(student))

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert not Bot2Student.objects.filter(id=student_id).exists()
    log = AuditLog.objects.get(action="delete", entity_table=STUDENT_TABLE, entity_id=student_id)
    assert log.actor_user_id == admin_user.id


def test_student_create_audit_hook_fires(rf, admin_user, program_item):
    """The create audit hook writes an AuditLog when Bot2StudentViewSet.perform_create runs.

    Exercised through perform_create directly because the HTTP POST path is broken
    (roster is read-only on the serializer but required on the model, so a POST 500s
    before the hook). See module docstring — this is a flagged finding, not a workaround.
    A pre-bound serializer (roster supplied) stands in for what a fixed serializer would
    hand perform_create.
    """
    from bot2.views import Bot2StudentViewSet

    roster = _make_roster(program_item)

    request = rf.post("/api/v1/bot2/students/")
    request.user = admin_user

    view = Bot2StudentViewSet()
    view.request = request

    serializer_cls = view.get_serializer_class()
    serializer = serializer_cls(data={"student_external_id": "aud-create"})
    serializer.is_valid(raise_exception=True)
    # roster is read-only, so the view's plain serializer.save() cannot set it; emulate a
    # serializer that already carries roster by binding it via save() kwargs first.
    serializer.save(roster=roster)

    view.perform_create(serializer)

    student = Bot2Student.objects.get(student_external_id="aud-create")
    log = AuditLog.objects.get(action="create", entity_table=STUDENT_TABLE, entity_id=student.id)
    assert log.after_data["student_external_id"] == "aud-create"


# --------------------------------------------------------------------------- #
# Bot2SurveyResponse
# --------------------------------------------------------------------------- #

def test_survey_create_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster = _make_roster(program_item)
    student = Bot2Student.objects.create(student_external_id="aud-1", roster=roster)

    payload = {
        "student": str(student.id),
        "roster": str(roster.id),
        "program": str(program_item.id),
        "course_year": 1,
        "survey_campaign": "default",
    }
    resp = api_client.post(reverse("bot2-survey-list"), payload, format="json")

    assert resp.status_code == status.HTTP_201_CREATED
    survey_id = resp.data["id"]
    log = AuditLog.objects.get(action="create", entity_table=SURVEY_TABLE, entity_id=survey_id)
    assert log.actor_user_id == admin_user.id
    assert log.after_data["survey_campaign"] == "default"


def test_survey_update_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster = _make_roster(program_item)
    student = Bot2Student.objects.create(student_external_id="aud-1", roster=roster)
    survey = Bot2SurveyResponse.objects.create(
        student=student, roster=roster, program=program_item,
        course_year=1, survey_campaign="default", submitted_at=timezone.now(),
    )

    resp = api_client.patch(_survey_url(survey), {"suggestions": "great course"}, format="json")

    assert resp.status_code == status.HTTP_200_OK
    log = AuditLog.objects.get(action="update", entity_table=SURVEY_TABLE, entity_id=survey.id)
    assert log.actor_user_id == admin_user.id


def test_survey_delete_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)
    roster = _make_roster(program_item)
    student = Bot2Student.objects.create(student_external_id="aud-1", roster=roster)
    survey = Bot2SurveyResponse.objects.create(
        student=student, roster=roster, program=program_item,
        course_year=1, survey_campaign="default", submitted_at=timezone.now(),
    )
    survey_id = survey.id

    resp = api_client.delete(_survey_url(survey))

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert not Bot2SurveyResponse.objects.filter(id=survey_id).exists()
    log = AuditLog.objects.get(action="delete", entity_table=SURVEY_TABLE, entity_id=survey_id)
    assert log.actor_user_id == admin_user.id


# --------------------------------------------------------------------------- #
# Roster / enrollment viewsets already audit — confirm the hooks still fire
# --------------------------------------------------------------------------- #

def test_roster_create_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)

    payload = {"student_external_id": "ros-aud", "program": str(program_item.id), "course_year": 2}
    resp = api_client.post(reverse("bot2-roster-list"), payload, format="json")

    assert resp.status_code == status.HTTP_201_CREATED
    log = AuditLog.objects.get(
        action="create", entity_table=StudentRoster._meta.db_table, entity_id=resp.data["id"]
    )
    assert log.after_data["student_external_id"] == "ros-aud"


def test_enrollment_create_writes_audit(api_client, admin_user, program_item):
    api_client.force_authenticate(user=admin_user)

    payload = {
        "program": str(program_item.id), "course_year": 1, "student_count": 5,
        "academic_year": "2025-2026", "campaign": "default",
    }
    resp = api_client.post(reverse("bot2-enrollment-list"), payload, format="json")

    assert resp.status_code == status.HTTP_201_CREATED
    log = AuditLog.objects.get(
        action="create", entity_table=ProgramEnrollment._meta.db_table, entity_id=resp.data["id"]
    )
    assert log.after_data["course_year"] == 1
