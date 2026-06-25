import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.utils import log_audit
from documents.models import Document
from .models import AccessLink, AccessLog, Lead, LeadStudent

logger = logging.getLogger(__name__)


def _get_client_ip(request) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class AccessLinkView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_link"

    def _resolve_link(self, token):
        try:
            link = (
                AccessLink.objects
                .select_related("lead__employer")
                .get(token=token)
            )
        except AccessLink.DoesNotExist:
            return None, Response(
                {"detail": "Invalid or expired link."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not link.is_valid():
            return None, Response(
                {"detail": "Link has expired or been revoked."},
                status=status.HTTP_410_GONE,
            )
        return link, None

    def get(self, request, token):
        link, err = self._resolve_link(token)
        if err:
            return err

        ip = _get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")[:512]
        AccessLog.objects.create(access_link=link, ip=ip, user_agent=ua)

        lead = link.lead
        if lead.status == Lead.Status.SENT:
            lead.status = Lead.Status.VIEWING
            lead.save(update_fields=["status", "updated_at"])

        log_audit(
            actor_type="anon",
            action="access_link_open",
            entity=link,
            request=request,
            meta={"ip": ip},
        )

        students_data = []
        for ls in lead.lead_students.select_related("student").prefetch_related(
            "student__documents"
        ):
            s = ls.student
            docs = s.documents.filter(status=Document.Status.VERIFIED)
            students_data.append({
                "lead_student_id": str(ls.id),
                "student_external_id": s.student_external_id,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "phone": s.phone if ls.forwarded else None,
                "employer_interested": ls.employer_interested,
                "forwarded": ls.forwarded,
                "documents": [
                    {"id": str(d.id), "type": d.type, "status": d.status}
                    for d in docs
                ],
            })

        return Response({
            "lead_id": str(lead.id),
            "title": lead.title,
            "employer": lead.employer.name,
            "students": students_data,
        })

    def post(self, request, token):
        link, err = self._resolve_link(token)
        if err:
            return err

        lead_student_id = request.data.get("lead_student_id")
        if not lead_student_id:
            return Response(
                {"detail": "lead_student_id required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ls = LeadStudent.objects.get(id=lead_student_id, lead=link.lead)
        except LeadStudent.DoesNotExist:
            return Response(
                {"detail": "Student not found in this lead."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ls.employer_interested = True
        ls.save(update_fields=["employer_interested", "updated_at"])

        lead = link.lead
        if lead.status == Lead.Status.VIEWING:
            lead.status = Lead.Status.SELECTED
            lead.save(update_fields=["status", "updated_at"])

        log_audit(
            actor_type="anon",
            action="employer_interest",
            entity=ls,
            request=request,
            after_data={"employer_interested": True},
        )
        return Response({"detail": "Interest recorded."})
