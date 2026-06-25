import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
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
from .services import GeminiVerificationService

logger = logging.getLogger(__name__)


def _write_usage_log(verification, usage: dict):
    """result['_usage'] dan AIUsageLog yozadi (append-only, monitoring)."""
    AIUsageLog.objects.create(
        verification=verification,
        operation="document_verification",
        model_name=usage.get("model_name", "gemini-2.5-flash"),
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        thinking_tokens=usage.get("thinking_tokens", 0),
        total_tokens=usage.get("total_tokens", 0),
        cost_usd=usage.get("cost_usd", 0),
        status=usage.get("status", "success"),
        error_message=usage.get("error_message", ""),
        latency_ms=usage.get("latency_ms"),
    )


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
    """
    serializer = SubmitDocumentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Yozuv yaratish
    verification = DocumentVerification.objects.create(
        student_id=data["student_id"],
        uploaded_by=request.user,
        document_type=data["document_type"],
        file=data["file"],
        original_filename=data["file"].name,
        mime_type=data["file"].content_type or "application/octet-stream",
        status=DocumentVerification.Status.PROCESSING,
    )

    # Gemini tekshiruvi (sinxron — ~2-4 sek)
    try:
        verification.file.seek(0)
        file_bytes = verification.file.read()

        service = GeminiVerificationService()
        result = service.verify(
            file_bytes=file_bytes,
            mime_type=verification.mime_type,
            document_type=verification.document_type,
        )

        # Natijani saqlash
        verification.confidence_score = result.get("confidence_score")
        verification.confidence_level = result.get("confidence_level")
        verification.extracted_data = result.get("extracted_data", {})
        verification.flags = result.get("flags", [])
        verification.ai_summary = result.get("summary", "")
        verification.processed_at = timezone.now()

        if result.get("_error"):
            verification.status = DocumentVerification.Status.FAILED
            verification.error_message = result.get("summary", "")
        else:
            verification.status = DocumentVerification.Status.DONE

        verification.save()

        # Token/xarajat yozuvi (xatolik bo'lsa ham yoziladi — monitoring uchun)
        _write_usage_log(verification, result.get("_usage", {}))

    except Exception as exc:
        logger.exception("Verification xatolik (id=%s): %s", verification.pk, exc)
        verification.status = DocumentVerification.Status.FAILED
        verification.error_message = str(exc)
        verification.save()
        _write_usage_log(verification, {"status": "error", "error_message": str(exc)})

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


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def student_verifications(request, student_id):
    """
    Talabaning barcha hujjat tekshiruvlari.

    GET /api/v1/ai-verification/student/{student_id}
    """
    verifications = DocumentVerification.objects.filter(
        student_id=student_id
    ).select_related("student", "uploaded_by", "reviewed_by")

    return Response(DocumentVerificationSerializer(verifications, many=True).data)


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

    verification.final_decision = d["final_decision"]
    verification.review_note = d.get("review_note", "")
    verification.reviewed_by = request.user
    verification.reviewed_at = timezone.now()
    verification.save()

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
