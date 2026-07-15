import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions import IsAdminUserRole
from common.exceptions import APIError
from .models import DocumentVerification, AIUsageLog
from .pricing import estimate_monthly_cost
from .serializers import (
    DocumentVerificationSerializer,
    SubmitDocumentSerializer,
    ReviewSerializer,
)
from .orchestration import run_document_verification_async, rerun_verification

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def submit_document(request):
    """
    Hujjat yuklash va Gemini tekshiruvini boshlash.

    POST /api/v1/ai-verification/submit
    Content-Type: multipart/form-data

    Fields:
        student_id: UUID
        document_type: cv|ielts|certificate|diploma|other
        file: <fayl>

    Gemini chaqiruvi background thread da ishlaydi — dashboard darhol
    status=PROCESSING javobini oladi (bot orqali yuklashda qo'llanilgan
    xuddi shu pattern; ilgari sinxron edi va so'rovni 20-30s ushlab turishi
    mumkin edi).
    """
    serializer = SubmitDocumentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    verification = run_document_verification_async(
        student_id=data["student_id"],
        file=data["file"],
        doc_type=data["document_type"],
        uploaded_by=request.user,
    )

    return Response(
        DocumentVerificationSerializer(verification).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def verification_detail(request, pk):
    """GET /api/v1/ai-verification/{id}"""
    try:
        verification = DocumentVerification.objects.select_related(
            "student", "uploaded_by", "reviewed_by"
        ).get(pk=pk)
    except DocumentVerification.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", status.HTTP_404_NOT_FOUND)

    return Response(DocumentVerificationSerializer(verification).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def retry_verification(request, pk):
    """Hujjatni qaytadan AI tekshiruvidan o'tkazadi (xato bo'lganda foydali).

    POST /api/v1/ai-verification/{id}/retry
    """
    try:
        verification = DocumentVerification.objects.get(pk=pk)
    except DocumentVerification.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", status.HTTP_404_NOT_FOUND)

    if not verification.file:
        raise APIError("NO_FILE", "Faylsiz yozuvni qayta tekshirib bo'lmaydi.", status.HTTP_400_BAD_REQUEST)

    verification = rerun_verification(verification)
    return Response(DocumentVerificationSerializer(verification).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def student_verifications(request, student_id):
    """
    Talabaning hujjat tekshiruvlari.

    GET /api/v1/ai-verification/student/{student_id}
    GET /api/v1/ai-verification/student/{student_id}?survey=<survey_id>
        → faqat shu so'rovnomaga tegishli hujjatlar:
          source_document__survey=survey_id  (bot orqali yuklangan)
          YO source_document=null            (admin yuklagan, student ga bog'liq)
    """
    from django.db.models import Q
    qs = DocumentVerification.objects.filter(
        student_id=student_id
    ).select_related("student", "uploaded_by", "reviewed_by")

    survey_id = request.query_params.get("survey")
    if survey_id:
        qs = qs.filter(
            Q(source_document__survey_id=survey_id) |
            Q(source_document__isnull=True)
        )

    return Response(DocumentVerificationSerializer(qs, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def review_verification(request, pk):
    """
    Xodim tomonidan yakuniy qaror.

    PATCH /api/v1/ai-verification/{id}/review
    Body: { "final_decision": "accepted|rejected", "review_note": "..." }

    AI hech qachon qaror qabul qilmaydi — xodim tasdiqlaydi.
    """
    try:
        verification = DocumentVerification.objects.get(pk=pk)
    except DocumentVerification.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", status.HTTP_404_NOT_FOUND)

    if verification.status != DocumentVerification.Status.DONE:
        raise APIError("NOT_READY", "Hujjat hali tahlil qilinmagan", status.HTTP_400_BAD_REQUEST)

    serializer = ReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    update_fields = ["reviewed_by", "reviewed_at", "review_note", "updated_at"]
    if d.get("final_decision"):
        verification.final_decision = d["final_decision"]
        update_fields.append("final_decision")
    if d.get("confidence_level"):
        # Admin AI toifasini qo'lda bekor qiladi (override).
        verification.confidence_level = d["confidence_level"]
        update_fields.append("confidence_level")
    verification.review_note = d.get("review_note", "")
    verification.reviewed_by = request.user
    verification.reviewed_at = timezone.now()
    verification.save(update_fields=update_fields)

    return Response(DocumentVerificationSerializer(verification).data)


# ── Xarajat analitikasi ───────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def usage_summary(request):
    """Umumiy xarajat xulosasi. GET /api/v1/ai-verification/usage/summary"""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    qs = AIUsageLog.objects.filter(status="success")
    totals = qs.aggregate(
        total_cost=Sum("cost_usd"),
        total_tokens=Sum("total_tokens"),
        total_requests=Count("id"),
        avg_cost=Avg("cost_usd"),
    )
    month_cost = qs.filter(created_at__gte=month_start).aggregate(c=Sum("cost_usd"))["c"] or Decimal("0")
    today_cost = qs.filter(created_at__gte=today_start).aggregate(c=Sum("cost_usd"))["c"] or Decimal("0")
    by_model = list(
        qs.values("model_name")
        .annotate(cost=Sum("cost_usd"), tokens=Sum("total_tokens"), requests=Count("id"))
        .order_by("-cost")
    )
    for row in by_model:
        row["cost"] = str(row["cost"] or Decimal("0"))

    return Response({
        "total_cost_usd": str(totals["total_cost"] or Decimal("0")),
        "total_tokens": totals["total_tokens"] or 0,
        "total_requests": totals["total_requests"] or 0,
        "this_month_cost_usd": str(month_cost),
        "today_cost_usd": str(today_cost),
        "avg_cost_per_request": str(totals["avg_cost"] or Decimal("0")),
        "by_model": by_model,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def usage_daily(request):
    """Kunlik xarajat trendi. GET /api/v1/ai-verification/usage/daily?days=30"""
    try:
        days = int(request.query_params.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = min(max(days, 1), 365)

    since = timezone.now() - timedelta(days=days)
    rows = (
        AIUsageLog.objects.filter(status="success", created_at__gte=since)
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(cost=Sum("cost_usd"), requests=Count("id"), tokens=Sum("total_tokens"))
        .order_by("date")
    )
    return Response({
        "days": [
            {
                "date": str(r["date"]),
                "cost_usd": str(r["cost"] or Decimal("0")),
                "requests": r["requests"],
                "tokens": r["tokens"] or 0,
            }
            for r in rows
        ]
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def usage_estimate(request):
    """Oylik xarajat taxmini. GET /api/v1/ai-verification/usage/estimate?docs_per_day=50"""
    try:
        docs_per_day = int(request.query_params.get("docs_per_day", 50))
    except (TypeError, ValueError):
        docs_per_day = 50
    docs_per_day = max(docs_per_day, 0)

    estimate = estimate_monthly_cost(docs_per_day)
    return Response({
        "docs_per_day": docs_per_day,
        "estimated_monthly_cost_usd": str(estimate),
        "model": "gemini-2.5-flash",
    })


# ── Ro'yxat + statistika (admin boshqaruv dashboard'i) ────────────────────────

class DocumentVerificationListView(generics.ListAPIView):
    """
    Barcha hujjat tekshiruvlari ro'yxati (filterli, sahifalangan).

    GET /api/v1/ai-verification/
        ?confidence_level=green|yellow|red
        &final_decision=pending|accepted|rejected
        &status=pending|processing|done|failed
        &document_type=cv|ielts|certificate|diploma|other
        &search=<talaba ismi/ID>
        &ordering=-created_at
    """
    permission_classes = [IsAuthenticated, IsAdminUserRole]
    serializer_class = DocumentVerificationSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["confidence_level", "final_decision", "status", "document_type"]
    search_fields = [
        "student__first_name", "student__last_name", "student__student_external_id",
    ]
    ordering_fields = ["created_at", "confidence_score", "processed_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return DocumentVerification.objects.select_related(
            "student", "uploaded_by", "reviewed_by"
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def verification_stats(request):
    """3-toifa va qaror bo'yicha sanoq (kartalar uchun, butun ma'lumot bo'ylab).

    GET /api/v1/ai-verification/stats
    """
    qs = DocumentVerification.objects.all()

    def _counts(field):
        return {row[field]: row["n"] for row in qs.values(field).annotate(n=Count("id"))}

    conf = _counts("confidence_level")
    dec = _counts("final_decision")
    st = _counts("status")

    # Umumiy son holat bo'yicha sanoqlar yig'indisiga teng — qo'shimcha COUNT shart emas.
    total = sum(st.values())

    return Response({
        "total": total,
        "by_confidence": {
            "green": conf.get("green", 0),
            "yellow": conf.get("yellow", 0),
            "red": conf.get("red", 0),
            "none": conf.get(None, 0),
        },
        "by_decision": {
            "pending": dec.get("pending", 0),
            "accepted": dec.get("accepted", 0),
            "rejected": dec.get("rejected", 0),
        },
        "by_status": {
            "done": st.get("done", 0),
            "processing": st.get("processing", 0),
            "pending": st.get("pending", 0),
            "failed": st.get("failed", 0),
        },
    })
