import csv
import io
import logging
from typing import List

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, F
from django.http import HttpRequest
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster, ProgramEnrollment
from bot2.services import parse_roster_payload, upsert_roster_row
from catalog.models import CatalogItem
from common.auth import verify_service_token
from common.exceptions import APIError, build_error_response
from common.permissions import IsAdminUserRole, IsViewerOrAdminReadOnly
from common.throttles import SurveySubmitThrottle
from common.time import parse_iso_datetime

logger = logging.getLogger(__name__)


class Bot2StudentRosterViewSet(viewsets.ModelViewSet):
    queryset = StudentRoster.objects.select_related("program")
    serializer_class = None
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
            actor_type="user", actor_user=self.request.user, action="create",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="update",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user", actor_user=self.request.user, action="delete",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )
        instance.delete()


class Bot2StudentViewSet(viewsets.ModelViewSet):
    queryset = Bot2Student.objects.select_related("roster", "region")
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    # Students are created by the bot; direct POST would 500 (roster is read-only).
    http_method_names = ["get", "head", "options", "patch", "put", "delete"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["gender", "region"]
    search_fields = ["student_external_id", "username", "first_name", "last_name"]
    ordering_fields = ["created_at"]

    def get_serializer_class(self):
        from bot2.serializers import Bot2StudentSerializer
        return Bot2StudentSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="create",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="update",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user", actor_user=self.request.user, action="delete",
            entity=instance, request=self.request,
            after_data={"student_external_id": instance.student_external_id},
        )
        instance.delete()


class Bot2SurveyResponseViewSet(viewsets.ModelViewSet):
    queryset = Bot2SurveyResponse.objects.select_related("student", "student__region", "roster", "program")
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["program", "course_year", "survey_campaign", "source"]
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

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="create",
            entity=instance, request=self.request,
            after_data={"student": str(instance.student_id), "survey_campaign": instance.survey_campaign},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="update",
            entity=instance, request=self.request,
            after_data={"student": str(instance.student_id), "survey_campaign": instance.survey_campaign},
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user", actor_user=self.request.user, action="delete",
            entity=instance, request=self.request,
            after_data={"student": str(instance.student_id), "survey_campaign": instance.survey_campaign},
        )
        instance.delete()


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
            actor_type="user", actor_user=self.request.user, action="create",
            entity=instance, request=self.request,
            after_data={"program": str(instance.program), "course_year": instance.course_year},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user", actor_user=self.request.user, action="update",
            entity=instance, request=self.request,
            after_data={"program": str(instance.program), "course_year": instance.course_year},
        )

    def perform_destroy(self, instance):
        log_audit(
            actor_type="user", actor_user=self.request.user, action="delete",
            entity=instance, request=self.request,
            after_data={"program": str(instance.program), "course_year": instance.course_year},
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
        except Exception as exc:
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
@throttle_classes([SurveySubmitThrottle])
@transaction.atomic
def submit_survey(request):
    """
    Append-only survey submission. Each call creates a new Bot2SurveyResponse row.
    Dedup via idempotency_key (bot-supplied UUIDv4): same key → return existing row.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    student_external_id = request.data.get("student_external_id")
    if not student_external_id:
        return build_error_response("VALIDATION_ERROR", "student_external_id is required.", status.HTTP_400_BAD_REQUEST)

    course_year = request.data.get("course_year") or 1
    try:
        course_year = int(course_year)
    except Exception:
        return build_error_response("INVALID_COURSE_YEAR", "course_year must be an integer between 1 and 5.", status.HTTP_400_BAD_REQUEST)
    if course_year < 1 or course_year > 5:
        return build_error_response("INVALID_COURSE_YEAR", "course_year must be between 1 and 5.", status.HTTP_400_BAD_REQUEST)

    idempotency_key = request.data.get("idempotency_key") or None
    if idempotency_key:
        existing = Bot2SurveyResponse.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            return Response(
                {"ok": True, "response_id": str(existing.id), "idempotent": True,
                 "roster": {"program_id": str(existing.program_id), "course_year": existing.course_year}},
                status=status.HTTP_200_OK,
            )

    roster = StudentRoster.objects.filter(student_external_id=student_external_id).first()
    program = None
    if not roster:
        program_id = request.data.get("program_id")
        if not program_id:
            return build_error_response("ROSTER_NOT_FOUND", "Student roster not found and program_id not provided.", status.HTTP_400_BAD_REQUEST)
        program = CatalogItem.objects.filter(
            id=program_id
        ).filter(
            Q(type=CatalogItem.ItemType.PROGRAM) | Q(type=CatalogItem.ItemType.DIRECTION)
        ).first()
        if not program:
            return build_error_response("INVALID_PROGRAM", "program_id must reference a program or direction catalog item.", status.HTTP_400_BAD_REQUEST)
    else:
        course_year = roster.course_year

    campaign = request.data.get("survey_campaign") or "default"
    region_id = request.data.get("region_id")
    region = None
    if region_id:
        region = CatalogItem.objects.filter(id=region_id, type=CatalogItem.ItemType.REGION).first()
        if not region:
            return build_error_response("INVALID_REGION", "region_id must reference a region catalog item.", status.HTTP_400_BAD_REQUEST)

    telegram_user_id = request.data.get("telegram_user_id")

    try:
        with transaction.atomic():
            if roster is None:
                roster = StudentRoster.objects.create(
                    student_external_id=student_external_id,
                    program=program,
                    course_year=course_year,
                    roster_campaign="bot2_auto",
                    is_active=True,
                )

            existing_student = None
            if telegram_user_id:
                existing_student = Bot2Student.objects.filter(telegram_user_id=telegram_user_id).first()

            if existing_student:
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

            # Append-only: always create a new survey row.
            survey = Bot2SurveyResponse.objects.create(
                student=student,
                roster=roster,
                program=roster.program,
                course_year=course_year,
                survey_campaign=campaign,
                idempotency_key=idempotency_key,
                source="survey",
                employment_status=request.data.get("employment_status", "") or "",
                employment_company=request.data.get("employment_company", "") or "",
                employment_role=request.data.get("employment_role", "") or "",
                suggestions=request.data.get("suggestions", "") or "",
                consents=request.data.get("consents", {}) or {},
                answers=request.data.get("answers", {}) or {},
                submitted_at=timezone.now(),
            )
    except ValidationError as exc:
        return build_error_response("VALIDATION_ERROR", exc.messages, status.HTTP_400_BAD_REQUEST)
    except IntegrityError:
        logger.warning("submit_survey integrity conflict for idempotency_key=%s", idempotency_key)
        return build_error_response(
            "CONFLICT",
            "Duplicate idempotency_key; submission already exists.",
            status.HTTP_409_CONFLICT,
        )
    except Exception:
        logger.exception("submit_survey unexpected error for student_external_id=%s", student_external_id)
        return build_error_response("SERVER_ERROR", "An internal error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR)

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


@api_view(["POST"])
@permission_classes([])
def bot_verify(request):
    """
    Faza D: Verify student_id + birth_date against StudentRoster.
    Returns {match: bool, full_name?} if birth_date column is populated.
    Falls back to student_external_id-only match if roster has no birth_date.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    student_id = request.data.get("student_id") or request.data.get("student_external_id")
    birth_date = request.data.get("birth_date")

    if not student_id:
        return build_error_response("VALIDATION_ERROR", "student_id is required.", status.HTTP_400_BAD_REQUEST)

    roster = StudentRoster.objects.filter(student_external_id=student_id).first()
    if not roster:
        return Response({"match": False, "reason": "not_found"})

    if roster.birth_date and birth_date:
        match = str(roster.birth_date) == str(birth_date)
    else:
        # birth_date not yet populated in roster → accept student_id-only (legacy path)
        match = True

    if not match:
        return Response({"match": False, "reason": "birth_date_mismatch"})

    return Response({
        "match": True,
        "roster": {
            "program_id": str(roster.program_id),
            "program_name": roster.program.name if roster.program else None,
            "course_year": roster.course_year,
        },
    })


@api_view(["POST"])
@permission_classes([])
def bot_followup_answer(request):
    """
    Record a student's response to a CRM followup message sent by the bot.
    Called by the bot when a student taps yes/no on the followup inline keyboard.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    followup_id = request.data.get("followup_id")
    answer = request.data.get("answer")

    if not followup_id or not answer:
        return build_error_response("VALIDATION_ERROR", "followup_id and answer are required.", status.HTTP_400_BAD_REQUEST)

    if answer not in ("yes", "no", "interviewed", "placed"):
        return build_error_response("INVALID_ANSWER", "answer must be yes, no, interviewed, or placed.", status.HTTP_400_BAD_REQUEST)

    try:
        from crm.models import FollowUp
        from crm.followup import record_answer
        followup = FollowUp.objects.get(id=followup_id)
        record_answer(followup, answer)
        return Response({"ok": True})
    except Exception:
        # Avoid leaking model import errors for invalid UUIDs
        return build_error_response("FOLLOWUP_NOT_FOUND", "Followup not found.", status.HTTP_404_NOT_FOUND)


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def bot_register(request):
    """
    Faza D: Create or update Bot2Student after verify success + consent.
    Requires consent=true in payload; sets state="registered".
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    student_id = request.data.get("student_id") or request.data.get("student_external_id")
    telegram_user_id = request.data.get("telegram_user_id")
    consent = request.data.get("consent", False)

    if not student_id:
        return build_error_response("VALIDATION_ERROR", "student_id is required.", status.HTTP_400_BAD_REQUEST)
    if not telegram_user_id:
        return build_error_response("VALIDATION_ERROR", "telegram_user_id is required.", status.HTTP_400_BAD_REQUEST)
    if not consent:
        return build_error_response("CONSENT_REQUIRED", "consent must be true to register.", status.HTTP_400_BAD_REQUEST)

    roster = StudentRoster.objects.filter(student_external_id=student_id).first()
    if not roster:
        return build_error_response("ROSTER_NOT_FOUND", "Student not found in roster.", status.HTTP_404_NOT_FOUND)

    language = request.data.get("language", "uz")
    if language not in ("uz", "ru"):
        language = "uz"

    try:
        student, created = Bot2Student.objects.update_or_create(
            student_external_id=student_id,
            defaults={
                "roster": roster,
                "telegram_user_id": telegram_user_id,
                "username": request.data.get("username", "") or "",
                "first_name": request.data.get("first_name", "") or "",
                "last_name": request.data.get("last_name", "") or "",
                "language": language,
                "consent": True,
                "state": "registered",
            },
        )
    except IntegrityError:
        logger.warning("bot_register telegram_user_id conflict for student_id=%s", student_id)
        return build_error_response("CONFLICT", "telegram_user_id is already linked to another student.", status.HTTP_409_CONFLICT)

    return Response({
        "ok": True,
        "student_id": str(student.id),
        "created": created,
        "roster": {"program_id": str(roster.program_id), "course_year": roster.course_year},
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([])
def bot_catalog_items(request):
    """
    Bot uchun catalog itemlarini service token orqali qaytaradi.
    Dashboard login talab qilmaydi.
    GET /api/v1/bot/catalog/items?type=region
    GET /api/v1/bot/catalog/items?type=direction
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    item_type = request.query_params.get("type")
    allowed_types = {
        CatalogItem.ItemType.REGION,
        CatalogItem.ItemType.DIRECTION,
        CatalogItem.ItemType.PROGRAM,
    }
    if not item_type or item_type not in allowed_types:
        return build_error_response(
            "INVALID_TYPE",
            f"type query param required. Allowed: {', '.join(sorted(allowed_types))}",
            status.HTTP_400_BAD_REQUEST,
        )

    items = (
        CatalogItem.objects
        .filter(type=item_type, is_active=True)
        .order_by("sort_order", "name")
        .values("id", "code", "name", "name_uz", "name_ru", "name_en", "metadata")
    )
    return Response({"results": list(items)})
