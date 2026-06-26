import csv
import io
import logging
import uuid

import openpyxl
from typing import List

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, OuterRef, Q, F
from django.http import HttpRequest
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from bot2.models import Bot2Student, Bot2StudentAccount, Bot2SurveyResponse, StudentRoster, ProgramEnrollment, Bot2Document, BotFsmState
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
    # distinct(): searching across the reverse `accounts` join can otherwise return a
    # student once per matching account.
    queryset = Bot2Student.objects.select_related("roster", "region").prefetch_related("accounts").distinct()
    serializer_class = None
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    # Students are created by the bot; direct POST would 500 (roster is read-only).
    http_method_names = ["get", "head", "options", "patch", "put", "delete"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["gender", "region"]
    search_fields = [
        "student_external_id", "username", "first_name", "last_name",
        "accounts__phone", "accounts__telegram_user_id",
    ]
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
        from ai_verification.models import DocumentVerification
        qs = super().get_queryset()
        submitted_from = self.request.query_params.get("from")
        submitted_to = self.request.query_params.get("to")
        if submitted_from and (dt := parse_iso_datetime(submitted_from)):
            qs = qs.filter(submitted_at__gte=dt)
        if submitted_to and (dt := parse_iso_datetime(submitted_to)):
            qs = qs.filter(submitted_at__lte=dt)
        # Annotate doc verification status (ikkala yo'l OR bilan birlashadi).
        _doc_q = (
            Q(source_document__survey=OuterRef("pk")) |
            Q(source_document__isnull=True, student=OuterRef("student"))
        )
        return qs.annotate(
            # Ishlamaydigan talabalar: istalgan turdagi hujjat
            has_accepted_doc=Exists(
                DocumentVerification.objects.filter(_doc_q, final_decision="accepted")
            ),
            has_any_doc=Exists(
                DocumentVerification.objects.filter(_doc_q)
            ),
            # Ishlaydigan talabalar: faqat ish joyi hujjati (employment)
            has_accepted_employment_doc=Exists(
                DocumentVerification.objects.filter(
                    _doc_q, final_decision="accepted", document_type="employment"
                )
            ),
            has_any_employment_doc=Exists(
                DocumentVerification.objects.filter(_doc_q, document_type="employment")
            ),
        )

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


class Bot2DocumentViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["student", "doc_type", "survey"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        from bot2.serializers import Bot2DocumentSerializer
        return Bot2DocumentSerializer

    def get_queryset(self):
        return Bot2Document.objects.select_related("student").all()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bot2_document_download(request, doc_id):
    """Serve a document file to the dashboard (requires JWT auth)."""
    from django.http import FileResponse
    from django.shortcuts import get_object_or_404
    doc = get_object_or_404(Bot2Document, id=doc_id)
    if not doc.file:
        return build_error_response("NO_FILE", "File not found.", status.HTTP_404_NOT_FOUND)

    # Only serve a known-safe content type; anything else is forced to a generic
    # binary type so the browser cannot be tricked into executing it (stored XSS).
    safe_content_types = {
        "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
    }
    mime = (doc.mime_type or "").lower()
    if mime in safe_content_types:
        content_type = mime
    else:
        content_type = "application/octet-stream"

    # Inline only for images and PDFs; everything else is downloaded as an attachment.
    if content_type.startswith("image/") or content_type == "application/pdf":
        disposition = "inline"
    else:
        disposition = "attachment"

    # Sanitize the filename used in the header to prevent header injection.
    raw_filename = doc.original_filename or f"{doc.doc_type}_{doc.id}"
    filename = raw_filename.replace('"', "").replace("\r", "").replace("\n", "")

    response = FileResponse(doc.file.open("rb"), content_type=content_type)
    response["Content-Disposition"] = f'{disposition}; filename="{filename}"'
    response["X-Content-Type-Options"] = "nosniff"
    return response


# Column aliases: Excel header → internal field name
_XLSX_COLUMN_MAP = {
    "student_id": "student_external_id",
    "student id": "student_external_id",
    "studentid": "student_external_id",
    "id": "student_external_id",
    "ism": "first_name",
    "first_name": "first_name",
    "firstname": "first_name",
    "name": "first_name",
    "familya": "last_name",
    "last_name": "last_name",
    "lastname": "last_name",
    "surname": "last_name",
    "ism familya": "first_name",  # merged column — handled separately below
    "tug'ilgan sana": "birth_date",
    "tug'ilgan_sana": "birth_date",
    "birth_date": "birth_date",
    "birthdate": "birth_date",
    "dob": "birth_date",
}


def _normalize_row(raw: dict) -> dict:
    """Map header aliases (case-insensitive) to canonical field names and split a
    merged 'ism familya' column. Shared by the .xlsx and .csv upload paths so both
    accept exactly the same headers (the ones documented in the dashboard)."""
    row: dict = {}
    for key, val in raw.items():
        if key is None or val is None:
            continue
        canon = str(key).strip().lower()
        canon = _XLSX_COLUMN_MAP.get(canon, canon)
        value = val.strip() if isinstance(val, str) else val
        if value == "":
            continue
        row[canon] = value

    # Handle merged "ism familya" column: split on first space
    first = row.get("first_name")
    if isinstance(first, str) and "last_name" not in row and " " in first:
        parts = first.split(None, 1)
        row["first_name"] = parts[0]
        row["last_name"] = parts[1] if len(parts) > 1 else ""

    return row


def _parse_xlsx(file) -> list[dict]:
    wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    raw_headers = list(next(rows_iter, []))  # first row = headers

    result = []
    for raw_row in rows_iter:
        if all(v is None for v in raw_row):
            continue  # skip fully empty rows
        row = _normalize_row(dict(zip(raw_headers, raw_row)))
        if row:
            result.append(row)

    wb.close()
    return result


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
@transaction.atomic
def import_roster(request):
    created = 0
    updated = 0
    errors: List[dict] = []
    imported: List[dict] = []

    rows = []
    if request.FILES.get("file"):
        file = request.FILES["file"]
        filename = file.name.lower()
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            rows = _parse_xlsx(file)
        else:
            decoded = file.read().decode("utf-8-sig")  # utf-8-sig strips BOM
            reader = csv.DictReader(io.StringIO(decoded))
            rows = [_normalize_row(r) for r in reader]
    elif isinstance(request.data, list):
        rows = request.data
    elif isinstance(request.data, dict) and "rows" in request.data:
        rows = request.data["rows"]
    else:
        return build_error_response("INVALID_PAYLOAD", "Provide Excel/CSV file or JSON list.", status.HTTP_400_BAD_REQUEST)

    for idx, row in enumerate(rows, start=1):
        try:
            parsed = parse_roster_payload(row)
            roster, created_flag = upsert_roster_row(parsed)
            created += int(created_flag)
            updated += int(not created_flag)
            imported.append({
                "row": idx,
                "student_external_id": roster.student_external_id,
                "first_name": roster.first_name,
                "last_name": roster.last_name,
                "course_year": roster.course_year,
                "program_id": roster.program_id,
                "status": "created" if created_flag else "updated",
            })
        except APIError as exc:
            errors.append({"row": idx, "error": exc.detail})
        except Exception as exc:
            errors.append({"row": idx, "error": str(exc)})

    # Resolve program names for the imported rows in a single query
    program_ids = {r["program_id"] for r in imported if r["program_id"]}
    program_names = (
        dict(CatalogItem.objects.filter(id__in=program_ids).values_list("id", "name"))
        if program_ids else {}
    )
    for r in imported:
        r["program"] = program_names.get(r.pop("program_id"))

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
    return Response(
        {"created": created, "updated": updated, "errors": errors, "students": imported},
        status=status_code,
    )


def _safe_program_id(value):
    """Return a valid UUID string for `value`, or None. Stale bot FSM state can send
    program_id as the literal string "None"/"null", an empty string, or other non-UUID
    junk; passing any of those to a UUID-typed `id=` filter raises ValidationError and
    500s. Normalizing to None lets the roster's own program take over and degrades a
    truly-missing program to a clean 4xx instead of a crash."""
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in ("", "none", "null"):
        return None
    try:
        return str(uuid.UUID(text))
    except (ValueError, AttributeError, TypeError):
        return None


def _link_account(student, telegram_user_id, *, username="", first_name="", last_name="", phone=""):
    """Attach a Telegram account to `student`, creating or re-activating the link, and
    keep ALL such accounts (a student may log in from several Telegram accounts with the
    same student_external_id). A telegram_user_id already linked to a different student
    is moved to this one. The student's denormalized 'primary' Telegram/phone fields are
    synced to this most-recent account. Returns the Bot2StudentAccount (or None)."""
    if not telegram_user_id:
        return None

    account, _ = Bot2StudentAccount.objects.update_or_create(
        telegram_user_id=telegram_user_id,
        defaults={
            "student": student,
            "username": username or "",
            "first_name": first_name or "",
            "last_name": last_name or "",
            "is_active": True,
            "last_seen_at": timezone.now(),
        },
    )
    # Only overwrite the stored phone when this call actually carries one, so we never
    # wipe a previously captured number.
    if phone and account.phone != phone:
        account.phone = phone
        account.save(update_fields=["phone", "updated_at"])

    # Mirror the latest account onto the student's denormalized convenience fields.
    # Only overwrite with non-blank values so a later sparse update never wipes data.
    # NOTE: first_name/last_name are intentionally NOT synced here — the student's
    # official name comes from the roster (Excel import) via _sync_student_name;
    # the Telegram display name stays a per-account snapshot only.
    fields = []
    if student.telegram_user_id != telegram_user_id:
        student.telegram_user_id = telegram_user_id
        fields.append("telegram_user_id")
    for attr, val in (("phone", phone), ("username", username)):
        if val and getattr(student, attr) != val:
            setattr(student, attr, val)
            fields.append(attr)
    if fields:
        fields.append("updated_at")
        student.save(update_fields=fields)
    return account


def _sync_student_name(student, roster, fallback_first="", fallback_last=""):
    """Keep the student's name populated for the survey detail page and Excel export.

    The roster (Excel import) is the authoritative source of the official name, so it
    wins when present; otherwise we fall back to the Telegram-supplied name (latest
    submission wins). A blank value never overwrites a populated one."""
    fields = []
    desired_first = (getattr(roster, "first_name", "") or "").strip() or (fallback_first or "").strip()
    if desired_first and student.first_name != desired_first:
        student.first_name = desired_first
        fields.append("first_name")
    desired_last = (getattr(roster, "last_name", "") or "").strip() or (fallback_last or "").strip()
    if desired_last and student.last_name != desired_last:
        student.last_name = desired_last
        fields.append("last_name")
    if fields:
        fields.append("updated_at")
        student.save(update_fields=fields)
    return student


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
                 "roster": {"program_id": str(existing.program_id) if existing.program_id else None, "course_year": existing.course_year}},
                status=status.HTTP_200_OK,
            )

    roster = StudentRoster.objects.filter(student_external_id=student_external_id).first()
    program = None

    # Resolve program: prefer roster value, fall back to payload.
    # Guard against stale bot state sending the literal string "None"/"null" or a
    # non-UUID value — normalize those to None so they never reach (and crash) the
    # UUID-typed `id=` lookup below. A roster's own program always wins regardless.
    program_id_payload = _safe_program_id(request.data.get("program_id"))
    if not roster:
        if not program_id_payload:
            return build_error_response("ROSTER_NOT_FOUND", "Student roster not found and program_id not provided.", status.HTTP_400_BAD_REQUEST)
        program = CatalogItem.objects.filter(
            id=program_id_payload
        ).filter(
            Q(type=CatalogItem.ItemType.PROGRAM) | Q(type=CatalogItem.ItemType.DIRECTION)
        ).first()
        if not program:
            return build_error_response("INVALID_PROGRAM", "program_id must reference a program or direction catalog item.", status.HTTP_400_BAD_REQUEST)
    else:
        if roster.program:
            program = roster.program
            course_year = roster.course_year or course_year
        elif program_id_payload:
            # Roster exists but has no program — student selected it in bot
            program = CatalogItem.objects.filter(
                id=program_id_payload
            ).filter(
                Q(type=CatalogItem.ItemType.PROGRAM) | Q(type=CatalogItem.ItemType.DIRECTION)
            ).first()

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
                    course_year=course_year if course_year else None,
                    roster_campaign="bot2_auto",
                    is_active=True,
                )
            elif program and not roster.program:
                # Back-fill program/course_year onto roster when bot collects them
                update_fields = ["updated_at"]
                roster.program = program
                update_fields.append("program")
                if course_year and not roster.course_year:
                    roster.course_year = course_year
                    update_fields.append("course_year")
                roster.save(update_fields=update_fields)

            # The student is keyed by student_external_id (canonical). The Telegram
            # account is linked separately via _link_account so several accounts can
            # map to one student instead of overwriting a single field.
            student, _ = Bot2Student.objects.update_or_create(
                student_external_id=student_external_id,
                defaults={
                    "roster": roster,
                    "gender": request.data.get("gender") or Bot2Student.Gender.UNSPECIFIED,
                    "region": region,
                },
            )
            _link_account(
                student,
                telegram_user_id,
                username=request.data.get("username", "") or "",
                first_name=request.data.get("first_name", "") or "",
                last_name=request.data.get("last_name", "") or "",
                phone=request.data.get("phone", "") or "",
            )
            _sync_student_name(
                student, roster,
                fallback_first=request.data.get("first_name", "") or "",
                fallback_last=request.data.get("last_name", "") or "",
            )

            # Append-only: always create a new survey row.
            survey = Bot2SurveyResponse.objects.create(
                student=student,
                roster=roster,
                program=program,
                course_year=course_year if course_year else None,
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
            # Link any pre-uploaded documents to this survey
            answers_data = request.data.get("answers", {}) or {}
            for key in ("cv_doc_id", "cert_doc_id"):
                doc_id = answers_data.get(key)
                if doc_id:
                    Bot2Document.objects.filter(
                        id=doc_id, student=student, survey__isnull=True
                    ).update(survey=survey)
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
            "roster": {"program_id": str(roster.program_id) if roster.program_id else None, "course_year": roster.course_year},
            "response_id": str(survey.id),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([])
def bot_fsm_state(request, user_id: int):
    """
    Persistent FSM storage for aiogram — survives bot restarts.
    GET  → {state, data}
    PUT  ← {state, data}  (upsert)
    DELETE → clears entry
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    if request.method == "GET":
        obj = BotFsmState.objects.filter(telegram_user_id=user_id).first()
        if obj:
            return Response({"state": obj.state, "data": obj.data})
        return Response({"state": None, "data": {}})

    if request.method == "PUT":
        state_val = request.data.get("state")
        data_val = request.data.get("data", {})
        BotFsmState.objects.update_or_create(
            telegram_user_id=user_id,
            defaults={"state": state_val, "data": data_val},
        )
        return Response({"ok": True})

    # DELETE
    BotFsmState.objects.filter(telegram_user_id=user_id).delete()
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([])
def bot_student_profile(request):
    """
    Returns existing Bot2Student profile by telegram_user_id.
    Used by the bot to pre-fill known fields and skip already-answered steps.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")
    telegram_user_id = request.query_params.get("telegram_user_id")
    if not telegram_user_id:
        return build_error_response("VALIDATION_ERROR", "telegram_user_id is required.", status.HTTP_400_BAD_REQUEST)

    # Resolve the student through the (active) Telegram account link. After /logout the
    # account is inactive, so the profile reads as "not found" and /start re-verifies.
    account = (
        Bot2StudentAccount.objects
        .select_related("student__region", "student__roster__program")
        .filter(telegram_user_id=telegram_user_id, is_active=True)
        .first()
    )
    if not account:
        return Response({"found": False})

    student = account.student
    region = student.region
    roster = student.roster
    last_survey = student.survey_responses.order_by("-submitted_at").first()
    return Response({
        "found": True,
        "student_external_id": student.student_external_id,
        "first_name": student.first_name or "",
        "last_name": student.last_name or "",
        "phone": account.phone or student.phone or "",
        "gender": student.gender if student.gender and student.gender != "unspecified" else "",
        "language": student.language or "uz",
        "region_id": str(region.id) if region else "",
        "region_name_uz": (region.name or "") if region else "",
        "region_name_ru": (region.metadata.get("name_ru", "") if region and region.metadata else "") if region else "",
        "program_id": str(roster.program_id) if roster and roster.program_id else None,
        "program_name": roster.program.name if roster and roster.program else "",
        "course_year": roster.course_year if roster else None,
        "last_survey_at": last_survey.submitted_at.isoformat() if last_survey and last_survey.submitted_at else None,
    })


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def bot_logout(request):
    """
    Deactivate ONE Telegram account link so the next /start from it re-runs the full
    identify+verify flow. The account row, the student, their other linked accounts and
    the append-only survey history are all preserved — only this account's is_active flag
    and the persisted FSM state are cleared. Idempotent: unknown user still returns ok.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    telegram_user_id = request.data.get("telegram_user_id")
    if not telegram_user_id:
        return build_error_response("VALIDATION_ERROR", "telegram_user_id is required.", status.HTTP_400_BAD_REQUEST)

    # Always drop any persisted FSM state for this user, linked or not.
    BotFsmState.objects.filter(telegram_user_id=telegram_user_id).delete()

    account = Bot2StudentAccount.objects.select_related("student").filter(
        telegram_user_id=telegram_user_id
    ).first()
    if not account:
        return Response({"ok": True, "found": False})

    account.is_active = False
    account.save(update_fields=["is_active", "updated_at"])

    # Repoint the student's denormalized 'primary' telegram link if it pointed here:
    # to another still-active account, else clear it.
    student = account.student
    if student.telegram_user_id == account.telegram_user_id:
        next_active = (
            student.accounts.filter(is_active=True)
            .exclude(pk=account.pk)
            .order_by("-last_seen_at", "-created_at")
            .first()
        )
        student.telegram_user_id = next_active.telegram_user_id if next_active else None
        student.save(update_fields=["telegram_user_id", "updated_at"])

    log_audit(
        actor_type="service",
        actor_service="bot2",
        action="logout",
        entity=student,
        request=None,
        after_data={"student_external_id": student.student_external_id,
                    "telegram_user_id": account.telegram_user_id},
    )
    return Response({"ok": True, "found": True})


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
            "program_id": str(roster.program_id) if roster.program_id else None,
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

    student, created = Bot2Student.objects.update_or_create(
        student_external_id=student_id,
        defaults={
            "roster": roster,
            "language": language,
            "consent": True,
            "state": "registered",
        },
    )
    # Link this Telegram account to the student, keeping any previously linked
    # accounts intact (a student may register from several accounts).
    _link_account(
        student,
        telegram_user_id,
        username=request.data.get("username", "") or "",
        first_name=request.data.get("first_name", "") or "",
        last_name=request.data.get("last_name", "") or "",
    )
    _sync_student_name(
        student, roster,
        fallback_first=request.data.get("first_name", "") or "",
        fallback_last=request.data.get("last_name", "") or "",
    )

    return Response({
        "ok": True,
        "student_id": str(student.id),
        "created": created,
        "roster": {"program_id": str(roster.program_id) if roster.program_id else None, "course_year": roster.course_year},
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


@api_view(["POST"])
@permission_classes([])
def bot_upload_document(request):
    """
    Receive a CV or certificate file from the bot and save it.
    Returns doc_id that the bot includes in the survey answers payload.
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    student_external_id = request.data.get("student_external_id")
    doc_type = request.data.get("doc_type")
    file = request.FILES.get("file")

    if not student_external_id or not doc_type or not file:
        return build_error_response(
            "VALIDATION_ERROR",
            "student_external_id, doc_type, and file are required.",
            status.HTTP_400_BAD_REQUEST,
        )
    if doc_type not in ("cv", "certificate", "employment"):
        return build_error_response(
            "INVALID_TYPE", "doc_type must be 'cv' or 'certificate'.", status.HTTP_400_BAD_REQUEST
        )

    if file.size > 10 * 1024 * 1024:
        return build_error_response(
            "VALIDATION_ERROR",
            "Fayl hajmi 10 MB dan oshmasligi kerak.",
            status.HTTP_400_BAD_REQUEST,
        )
    allowed_mime_types = {
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    }
    if not file.content_type or file.content_type.lower() not in allowed_mime_types:
        return build_error_response(
            "VALIDATION_ERROR",
            "Ruxsat etilmagan fayl turi. JPG, PNG, WEBP yoki PDF yuboring.",
            status.HTTP_400_BAD_REQUEST,
        )

    student = Bot2Student.objects.filter(student_external_id=student_external_id).first()
    if not student:
        return build_error_response("STUDENT_NOT_FOUND", "Student not found.", status.HTTP_404_NOT_FOUND)

    doc = Bot2Document.objects.create(
        student=student,
        doc_type=doc_type,
        file=file,
        original_filename=file.name or "",
        mime_type=file.content_type or "",
        file_size=file.size,
    )

    log_audit(
        actor_type="service",
        actor_service="bot2",
        action="create",
        entity=doc,
        request=None,
        after_data={"student_external_id": student_external_id, "doc_type": doc_type},
    )

    # Bot orqali kelgan hujjatni avtomatik AI (Gemini) tekshiruvidan o'tkazamiz —
    # best-effort: tekshiruv xato bo'lsa ham faylni saqlash va doc_id qaytarish buzilmaydi.
    verification_id = None
    if getattr(settings, "GEMINI_API_KEY", ""):
        try:
            from ai_verification.orchestration import run_document_verification
            file.seek(0)
            verification = run_document_verification(
                student=student,
                file=file,
                doc_type=doc_type,
                source_document=doc,   # Bot2Document → survey zanjiri uchun
                operation="bot_document",
            )
            verification_id = str(verification.id)
        except Exception:
            logger.exception("Bot hujjat AI tekshiruvi muvaffaqiyatsiz (doc=%s)", doc.id)

    return Response(
        {"ok": True, "doc_id": str(doc.id), "verification_id": verification_id},
        status=status.HTTP_201_CREATED,
    )
