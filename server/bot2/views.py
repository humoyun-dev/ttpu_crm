import csv
import io
from typing import List

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, F
from django.http import HttpRequest
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster, ProgramEnrollment
from bot2.services import parse_roster_payload, upsert_roster_row
from catalog.models import CatalogItem
from common.auth import verify_service_token
from common.exceptions import APIError, build_error_response
from common.permissions import IsAdminUserRole, IsViewerOrAdminReadOnly
from common.time import parse_iso_datetime


class Bot2StudentRosterViewSet(viewsets.ModelViewSet):
    queryset = StudentRoster.objects.select_related("program")
    serializer_class = None  # set dynamically
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["program", "course_year", "is_active", "roster_campaign"]
    search_fields = ["student_external_id"]
    ordering_fields = ["student_external_id", "course_year", "created_at"]

    def get_serializer_class(self):
        from bot2.serializers import StudentRosterSerializer

        return StudentRosterSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="create",
            entity=instance,
            request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="update",
            entity=instance,
            request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="delete",
            entity=instance,
            request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )
        instance.delete()


class Bot2StudentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Bot2Student.objects.select_related("roster", "region")
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["gender", "region"]
    search_fields = ["student_external_id", "username", "first_name", "last_name"]
    ordering_fields = ["created_at"]

    def get_serializer_class(self):
        from bot2.serializers import Bot2StudentSerializer

        return Bot2StudentSerializer


class Bot2SurveyResponseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Bot2SurveyResponse.objects.select_related("student", "roster", "program")
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["program", "course_year", "survey_campaign"]
    search_fields = ["student__student_external_id", "student__username"]
    ordering_fields = ["submitted_at", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        submitted_from = self.request.query_params.get("from")
        submitted_to = self.request.query_params.get("to")
        if submitted_from and (dt := parse_iso_datetime(submitted_from)):
            qs = qs.filter(submitted_at__gte=dt)
        if submitted_to and (dt := parse_iso_datetime(submitted_to)):
            qs = qs.filter(submitted_at__lte=dt)
        return qs

    def get_serializer_class(self):
        from bot2.serializers import Bot2SurveyResponseSerializer

        return Bot2SurveyResponseSerializer


class ProgramEnrollmentViewSet(viewsets.ModelViewSet):
    queryset = ProgramEnrollment.objects.select_related("program").annotate(
        responded_count=Count(
            "program__bot2_program_surveys__roster_id",
            distinct=True,
            filter=Q(
                program__bot2_program_surveys__course_year=F("course_year"),
                program__bot2_program_surveys__survey_campaign=F("campaign"),
                program__bot2_program_surveys__submitted_at__isnull=False,
            ),
        )
    )
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["program", "course_year", "academic_year", "campaign", "is_active"]
    search_fields = ["program__name", "notes"]
    ordering_fields = ["course_year", "student_count", "created_at"]

    def get_serializer_class(self):
        from bot2.serializers import ProgramEnrollmentSerializer

        return ProgramEnrollmentSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="create",
            entity=instance,
            request=self.request,
            after_data={
                "program": str(instance.program),
                "course_year": instance.course_year,
                "student_count": instance.student_count,
            },
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="update",
            entity=instance,
            request=self.request,
            after_data={
                "program": str(instance.program),
                "course_year": instance.course_year,
                "student_count": instance.student_count,
            },
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="delete",
            entity=instance,
            request=self.request,
            after_data={
                "program": str(instance.program),
                "course_year": instance.course_year,
            },
        )
        instance.delete()


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
@transaction.atomic
def import_roster(request):
    created = 0
    updated = 0
    errors: List[dict] = []

    rows = []
    if request.FILES.get("file"):
        file = request.FILES["file"]
        decoded = file.read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(decoded))
        rows = list(reader)
    elif isinstance(request.data, list):
        rows = request.data
    elif isinstance(request.data, dict) and "rows" in request.data:
        rows = request.data["rows"]
    else:
        return build_error_response("INVALID_PAYLOAD", "Provide CSV file or JSON list.", status.HTTP_400_BAD_REQUEST)

    for idx, row in enumerate(rows, start=1):
        try:
            parsed = parse_roster_payload(row)
            created_flag = upsert_roster_row(parsed)
            created += int(created_flag)
            updated += int(not created_flag)
        except APIError as exc:
            errors.append({"row": idx, "error": exc.detail})
        except Exception as exc:  # pragma: no cover - unexpected
            errors.append({"row": idx, "error": str(exc)})

    log_audit(
        actor_type="user",
        actor_user=request.user,
        action="update",
        entity=StudentRoster(),
        request=request._request if isinstance(request._request, HttpRequest) else None,
        after_data={"created": created, "updated": updated, "errors": len(errors)},
        meta={"type": "roster_import"},
    )

    status_code = status.HTTP_207_MULTI_STATUS if errors else status.HTTP_200_OK
    return Response({"created": created, "updated": updated, "errors": errors}, status=status_code)


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def submit_survey(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")
    student_external_id = request.data.get("student_external_id")
    if not student_external_id:
        return build_error_response("VALIDATION_ERROR", "student_external_id is required.", status.HTTP_400_BAD_REQUEST)

    # course_year: optional, defaults to 1, must be 1..4
    course_year = request.data.get("course_year") or 1
    try:
        course_year = int(course_year)
    except Exception:
        return build_error_response("INVALID_COURSE_YEAR", "course_year must be an integer between 1 and 4.", status.HTTP_400_BAD_REQUEST)
    if course_year < 1 or course_year > 4:
        return build_error_response("INVALID_COURSE_YEAR", "course_year must be between 1 and 4.", status.HTTP_400_BAD_REQUEST)

    roster = StudentRoster.objects.filter(student_external_id=student_external_id).first()
    if not roster:
        # Auto-create roster if program_id is provided
        program_id = request.data.get("program_id")
        if not program_id:
            return build_error_response("ROSTER_NOT_FOUND", "Student roster not found and program_id not provided.", status.HTTP_400_BAD_REQUEST)
        
        # Accept both PROGRAM and DIRECTION types
        program = CatalogItem.objects.filter(
            id=program_id
        ).filter(
            Q(type=CatalogItem.ItemType.PROGRAM) | Q(type=CatalogItem.ItemType.DIRECTION)
        ).first()
        if not program:
            return build_error_response("INVALID_PROGRAM", "program_id must reference a program or direction catalog item.", status.HTTP_400_BAD_REQUEST)
        
        # Create roster with provided course_year (default 1)
        roster = StudentRoster.objects.create(
            student_external_id=student_external_id,
            program=program,
            course_year=course_year,
            roster_campaign="bot2_auto",
            is_active=True,
        )
    else:
        # Existing roster is source of truth for program/course_year.
        course_year = roster.course_year
    
    campaign = request.data.get("survey_campaign") or "default"
    region_id = request.data.get("region_id")
    if region_id:
        region = CatalogItem.objects.filter(id=region_id, type=CatalogItem.ItemType.REGION).first()
        if not region:
            return build_error_response("INVALID_REGION", "region_id must reference a region catalog item.", status.HTTP_400_BAD_REQUEST)
    else:
        region = None

    telegram_user_id = request.data.get("telegram_user_id")
    
    try:
        # First, check if student exists by telegram_user_id (to handle student_external_id changes)
        existing_student = None
        if telegram_user_id:
            existing_student = Bot2Student.objects.filter(telegram_user_id=telegram_user_id).first()
        
        if existing_student:
            # Update existing student (even if student_external_id changed)
            existing_student.student_external_id = student_external_id
            existing_student.roster = roster
            existing_student.username = request.data.get("username", "") or ""
            existing_student.first_name = request.data.get("first_name", "") or ""
            existing_student.last_name = request.data.get("last_name", "") or ""
            existing_student.gender = request.data.get("gender") or Bot2Student.Gender.UNSPECIFIED
            existing_student.phone = request.data.get("phone", "") or ""
            existing_student.region = region
            existing_student.save()
            student = existing_student
        else:
            # Try to find by student_external_id or create new
            student, _ = Bot2Student.objects.update_or_create(
                student_external_id=student_external_id,
                defaults={
                    "roster": roster,
                    "telegram_user_id": telegram_user_id,
                    "username": request.data.get("username", "") or "",
                    "first_name": request.data.get("first_name", "") or "",
                    "last_name": request.data.get("last_name", "") or "",
                    "gender": request.data.get("gender") or Bot2Student.Gender.UNSPECIFIED,
                    "phone": request.data.get("phone", "") or "",
                    "region": region,
                },
            )

        # Upsert survey by (student, campaign) to keep submissions idempotent.
        payload = {
            "roster": roster,
            "program": roster.program,
            "course_year": course_year,
            "employment_status": request.data.get("employment_status", "") or "",
            "employment_company": request.data.get("employment_company", "") or "",
            "employment_role": request.data.get("employment_role", "") or "",
            "suggestions": request.data.get("suggestions", "") or "",
            "consents": request.data.get("consents", {}) or {},
            "answers": request.data.get("answers", {}) or {},
            "submitted_at": timezone.now(),
        }
        survey, _ = Bot2SurveyResponse.objects.update_or_create(
            student=student,
            survey_campaign=campaign,
            defaults=payload,
        )
    except ValidationError as exc:
        return build_error_response("VALIDATION_ERROR", exc.messages, status.HTTP_400_BAD_REQUEST)
    except Exception as exc:  # pragma: no cover - unexpected
        return build_error_response("SERVER_ERROR", str(exc), status.HTTP_500_INTERNAL_SERVER_ERROR)

    log_audit(
        actor_type="service",
        actor_service="bot2",
        action="create",
        entity=survey,
        request=None,
        after_data={"student_external_id": student_external_id, "survey_campaign": campaign},
    )
    return Response(
        {
            "ok": True,
            "roster": {"program_id": str(roster.program_id), "course_year": roster.course_year},
            "response_id": str(survey.id),
        },
        status=status.HTTP_200_OK,
    )
