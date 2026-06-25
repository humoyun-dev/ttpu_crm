import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.utils import log_audit
from common.permissions import IsAdminUserRole, ServiceTokenPermission
from .models import Document
from .serializers import DocumentSerializer, DocumentUploadSerializer

logger = logging.getLogger(__name__)


class DocumentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Document.objects.select_related("student", "reviewed_by").order_by("-created_at")
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "type"]

    @action(detail=True, methods=["patch"], permission_classes=[IsAuthenticated, IsAdminUserRole])
    def review(self, request, pk=None):
        doc = self.get_object()
        new_status = request.data.get("status")
        if new_status not in (Document.Status.VERIFIED, Document.Status.FLAGGED):
            return Response(
                {"detail": "status must be 'verified' or 'flagged'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before = {"status": doc.status}
        doc.status = new_status
        doc.reviewed_by = request.user
        doc.save(update_fields=["status", "reviewed_by", "updated_at"])

        log_audit(
            actor_type="user",
            actor_user=request.user,
            action="document_review",
            entity=doc,
            request=request,
            before_data=before,
            after_data={"status": doc.status},
        )
        return Response(DocumentSerializer(doc).data)


class BotDocumentUploadView(APIView):
    """
    POST /api/v1/bot/document — service token auth, multipart upload.
    Creates Document(pending), triggers AI analysis (stub returns green → auto-verified).
    CV/IELTS are PII: files stored in documents/ and NOT served via public /media/.
    """

    authentication_classes = []
    permission_classes = [ServiceTokenPermission]
    parser_classes = [MultiPartParser]
    service_name = "bot2"

    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        doc = serializer.save(status=Document.Status.PENDING)

        try:
            from ai_gateway.client import analyze
            result = analyze(doc)
            recommendation = result.get("recommendation", "green")
            doc.ai_result = result
            if recommendation == "green":
                doc.status = Document.Status.VERIFIED
            else:
                doc.status = Document.Status.FLAGGED
            doc.save(update_fields=["status", "ai_result", "updated_at"])
        except Exception:
            logger.exception("AI gateway call failed for document %s; left as pending.", doc.id)

        return Response(
            DocumentSerializer(doc).data,
            status=status.HTTP_201_CREATED,
        )
