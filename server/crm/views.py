from django.conf import settings
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from .models import AccessLink, FollowUp, Lead, LeadStudent
from .serializers import AccessLinkSerializer, FollowUpSerializer, LeadSerializer


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("employer", "created_by", "access_link").prefetch_related(
        "lead_students__student"
    )
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "employer"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        lead = self.get_object()
        ttl = getattr(settings, "ACCESS_LINK_TTL_DAYS", 30)
        link, created = AccessLink.objects.get_or_create(
            lead=lead,
            defaults={"expires_at": timezone.now() + timezone.timedelta(days=ttl)},
        )
        if not created and link.revoked:
            link.revoked = False
            link.expires_at = timezone.now() + timezone.timedelta(days=ttl)
            link.save(update_fields=["revoked", "expires_at"])

        lead.status = Lead.Status.SENT
        lead.save(update_fields=["status", "updated_at"])

        log_audit(
            actor_type="user",
            actor_user=request.user,
            action="lead_send",
            entity=lead,
            request=request,
            after_data={"status": lead.status, "access_link_token": str(link.token)},
        )
        return Response(AccessLinkSerializer(link).data)


class FollowUpViewSet(viewsets.ModelViewSet):
    queryset = FollowUp.objects.select_related("lead_student__student")
    serializer_class = FollowUpSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["stage", "flagged_for_staff"]
