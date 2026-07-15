import logging
import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bot2.models import Bot2StudentAccount
from common.auth import verify_service_token
from common.exceptions import build_error_response
from common.permissions import IsViewerOrAdminReadOnly
from employers.models import Employer

from .models import InternshipRequest
from .notifications import notify_result

logger = logging.getLogger(__name__)


# ── Xodim (dashboard, JWT) ────────────────────────────────────────────────────
class InternshipRequestViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Xodim arizalarni ko'rib chiqadi: ro'yxat (status bo'yicha filtr) + tasdiq/rad
    (PATCH). Yaratish/o'chirish yo'q — arizalar bot orqali keladi."""

    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    # Global DEFAULT_FILTER_BACKENDS only has DjangoFilterBackend; declare the full
    # set here so ?search= and ?ordering= actually take effect on this viewset.
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "student", "employer"]
    search_fields = ["company_name", "student__first_name", "student__last_name", "student__student_external_id"]
    ordering_fields = ["created_at", "reviewed_at", "status"]

    def get_serializer_class(self):
        from .serializers import InternshipRequestSerializer
        return InternshipRequestSerializer

    def get_queryset(self):
        return (
            InternshipRequest.objects
            .select_related("student", "employer", "reviewed_by")
            .all()
        )

    def perform_update(self, serializer):
        # Qaror qabul qilinganda reviewer + vaqt to'ladi va talabaga xabar ketadi.
        req = serializer.save(
            reviewed_by=self.request.user,
            reviewed_at=timezone.now(),
        )
        transaction.on_commit(lambda: notify_result(req))


# ── Bot (service token) ───────────────────────────────────────────────────────
def _resolve_student(telegram_id):
    """Faol Telegram account orqali talabani topadi (bot_student_profile naqshi)."""
    if not telegram_id:
        return None
    account = (
        Bot2StudentAccount.objects
        .select_related("student")
        .filter(telegram_user_id=telegram_id, is_active=True)
        .first()
    )
    return account.student if account else None


@api_view(["POST"])
@permission_classes([])
def bot_internship_create(request):
    """Talaba amaliyot arizasini yuboradi.

    employer_id bo'lsa — reestrdan (company_name = employer.name snapshot);
    bo'lmasa — erkin matn (company_name majburiy).
    """
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    telegram_id = request.data.get("telegram_id")
    student = _resolve_student(telegram_id)
    if not student:
        return build_error_response("STUDENT_NOT_FOUND", "Talaba topilmadi.", status.HTTP_404_NOT_FOUND)

    # Allaqachon ko'rib chiqilayotgan ariza bo'lsa — yangisiga ruxsat yo'q.
    existing = InternshipRequest.objects.filter(
        student=student, status=InternshipRequest.Status.PENDING
    ).first()
    if existing:
        return build_error_response(
            "ALREADY_PENDING",
            "Sizda ko'rib chiqilayotgan ariza mavjud.",
            status.HTTP_409_CONFLICT,
            details={"id": str(existing.id), "company_name": existing.company_name},
        )

    employer = None
    employer_id = request.data.get("employer_id")
    if employer_id:
        # Noto'g'ri (UUID bo'lmagan) qiymat filter()da ValidationError → 500 bermasligi uchun
        # avval UUID sifatida tekshiramiz.
        try:
            uuid.UUID(str(employer_id))
        except (ValueError, TypeError, AttributeError):
            return build_error_response("INVALID_EMPLOYER", "employer_id noto'g'ri.", status.HTTP_400_BAD_REQUEST)
        employer = Employer.objects.filter(id=employer_id).first()
        if not employer:
            return build_error_response("INVALID_EMPLOYER", "employer_id noto'g'ri.", status.HTTP_400_BAD_REQUEST)
        company_name = employer.name
    else:
        company_name = (request.data.get("company_name") or "").strip()
        if not company_name:
            return build_error_response(
                "VALIDATION_ERROR",
                "employer_id yoki company_name talab qilinadi.",
                status.HTTP_400_BAD_REQUEST,
            )

    note = (request.data.get("note") or "").strip()

    try:
        # Savepoint: agar ATOMIC_REQUESTS yoqilsa ham, IntegrityError'dan keyin
        # tashqi tranzaksiya buzilmasdan qoladi va quyidagi re-query ishlayveradi.
        with transaction.atomic():
            req = InternshipRequest.objects.create(
                student=student,
                employer=employer,
                company_name=company_name[:255],
                note=note,
                status=InternshipRequest.Status.PENDING,
            )
    except IntegrityError:
        # Poyga: bir vaqtda ikkinchi pending ariza — partial unique constraint ushladi.
        existing = InternshipRequest.objects.filter(
            student=student, status=InternshipRequest.Status.PENDING
        ).first()
        return build_error_response(
            "ALREADY_PENDING",
            "Sizda ko'rib chiqilayotgan ariza mavjud.",
            status.HTTP_409_CONFLICT,
            details={"id": str(existing.id), "company_name": existing.company_name} if existing else None,
        )

    return Response({"id": str(req.id), "status": req.status}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([])
def bot_internship_status(request):
    """Talabaning joriy amaliyot arizasi holati (menyuda ko'rsatish uchun)."""
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    student = _resolve_student(request.query_params.get("telegram_id"))
    if not student:
        return build_error_response("STUDENT_NOT_FOUND", "Talaba topilmadi.", status.HTTP_404_NOT_FOUND)

    pending = InternshipRequest.objects.filter(
        student=student, status=InternshipRequest.Status.PENDING
    ).first()
    if pending:
        return Response({
            "has_pending": True,
            "company_name": pending.company_name,
            "status": pending.status,
        })
    return Response({"has_pending": False})


@api_view(["GET"])
@permission_classes([])
def bot_employers(request):
    """Reestrdan kompaniya tanlash uchun ro'yxat (paginatsiya + qidiruv)."""
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    qs = Employer.objects.order_by("name")
    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(name__icontains=q)

    count = qs.count()
    try:
        limit = min(max(int(request.query_params.get("limit", 10)), 1), 50)
    except (TypeError, ValueError):
        limit = 10
    try:
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        offset = 0

    rows = qs[offset:offset + limit]
    results = [
        {"id": str(e.id), "name": e.name, "industry": e.industry, "location": e.location}
        for e in rows
    ]
    return Response({"count": count, "results": results})
