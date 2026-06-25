import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions import IsAdminUserRole
from common.exceptions import APIError
from .models import DocumentVerification
from .serializers import (
    DocumentVerificationSerializer,
    SubmitDocumentSerializer,
    ReviewSerializer,
)
from .services import GeminiVerificationService

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

    except Exception as exc:
        logger.exception("Verification xatolik (id=%s): %s", verification.pk, exc)
        verification.status = DocumentVerification.Status.FAILED
        verification.error_message = str(exc)

    verification.save()

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
