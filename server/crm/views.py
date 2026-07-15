from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from bot2.models import Bot2Student
from common.permissions import IsAdminUserRole, IsViewerOrAdminReadOnly
from .ai_summary import generate_for_lead_async
from .followup import schedule_first
from .models import AccessLink, FollowUp, Lead, LeadStudent
from .serializers import AccessLinkSerializer, FollowUpSerializer, LeadSerializer, _notify_students


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("employer", "created_by", "access_link").prefetch_related(
        "lead_students__student"
    ).order_by("-created_at")
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    # DjangoFilterBackend'ni ham qo'shamiz: view'da filter_backends berilsa global
    # default o'chadi, shuning uchun filterset_fields ishlashi uchun uni saqlab qolamiz.
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "employer"]
    search_fields = ["title", "employer__name", "notes"]
    ordering_fields = ["created_at", "status"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdminUserRole])
    def send(self, request, pk=None):
        lead = self.get_object()
        ttl = getattr(settings, "ACCESS_LINK_TTL_DAYS", 30)

        with transaction.atomic():
            # Qatorni qulflab, holatni yangidan o'qiymiz (poyga oldini olish).
            lead = Lead.objects.select_for_update().get(pk=lead.pk)

            # Terminal holatdan yuborish taqiqlanadi.
            if lead.status == Lead.Status.CLOSED:
                return Response(
                    {"detail": "Yopilgan lead'ni korxonaga yuborib bo'lmaydi."},
                    status=409,
                )

            link, created = AccessLink.objects.get_or_create(
                lead=lead,
                defaults={"expires_at": timezone.now() + timezone.timedelta(days=ttl)},
            )
            if not created and link.revoked:
                link.revoked = False
                link.expires_at = timezone.now() + timezone.timedelta(days=ttl)
                link.save(update_fields=["revoked", "expires_at"])

            # Idempotent: SENT'da qoladi; VIEWING/SELECTED'dan orqaga qaytarmaymiz.
            if lead.status == Lead.Status.CREATED:
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

            # Korxonaga yuborilganda — nomzodlar uchun AI tavsiflar (commit'dan keyin).
            transaction.on_commit(lambda: generate_for_lead_async(lead))

        return Response(AccessLinkSerializer(link).data)

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsAdminUserRole])
    def match_candidates(self, request):
        """Ish o'rni talabiga ko'ra nomzodlarni AI moslik bali bilan tartiblaydi."""
        requirement = (request.data.get("requirement") or "").strip()
        student_ids = request.data.get("student_ids") or []
        if not requirement:
            return Response({"detail": "requirement kerak"}, status=400)
        if not isinstance(student_ids, list):
            return Response({"detail": "student_ids ro'yxat bo'lishi kerak"}, status=400)

        students = (
            Bot2Student.objects
            .filter(id__in=student_ids[:40])
            .select_related("roster__program")
        )
        from .matching import rank_candidates
        return Response({"ranked": rank_candidates(requirement, students)})

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdminUserRole])
    def generate_summaries(self, request, pk=None):
        """Lead nomzodlari uchun AI tavsiflarni (qayta) yaratadi (fon-jarayon)."""
        lead = self.get_object()
        force = request.data.get("force", True)
        generate_for_lead_async(lead, force=bool(force))
        return Response(
            {"detail": "AI tavsiflar yaratilmoqda.", "count": lead.lead_students.count()},
            status=202,
        )

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdminUserRole])
    def add_students(self, request, pk=None):
        """Mavjud leadga talabalar qo'shadi (har biriga FollowUp + xabar)."""
        lead = self.get_object()
        student_ids = request.data.get("student_ids", [])
        if not isinstance(student_ids, list):
            return Response({"detail": "student_ids ro'yxat bo'lishi kerak."}, status=400)

        added = []
        with transaction.atomic():
            for sid in student_ids:
                try:
                    student = Bot2Student.objects.get(id=sid)
                except (Bot2Student.DoesNotExist, ValidationError, ValueError, TypeError):
                    continue
                ls, created = LeadStudent.objects.get_or_create(lead=lead, student=student)
                if created:
                    schedule_first(ls)
                    added.append(student)

        if added:
            transaction.on_commit(lambda: _notify_students(lead, added))
            transaction.on_commit(lambda: generate_for_lead_async(lead))
            log_audit(
                actor_type="user",
                actor_user=request.user,
                action="lead_add_students",
                entity=lead,
                request=request,
                after_data={"added": len(added)},
            )

        lead.refresh_from_db()
        return Response(LeadSerializer(lead, context={"request": request}).data)


class FollowUpViewSet(viewsets.ModelViewSet):
    queryset = FollowUp.objects.select_related("lead_student__student").order_by("-created_at")
    serializer_class = FollowUpSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filterset_fields = ["stage", "flagged_for_staff"]
    ordering_fields = ["created_at", "stage"]

    def perform_create(self, serializer):
        # uq_followup_active_per_lead_student shartli (condition) constraint bo'lgani
        # uchun DRF unga validator yaratmaydi — oldindan tekshiramiz, aks holda
        # dublikat POST xom IntegrityError → 500 bo'lib chiqadi.
        lead_student = serializer.validated_data.get("lead_student")
        if lead_student and FollowUp.objects.filter(
            lead_student=lead_student
        ).exclude(stage=FollowUp.Stage.DONE).exists():
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError(
                {"lead_student": "Bu lead_student uchun allaqachon faol follow-up mavjud."}
            )
        serializer.save()
