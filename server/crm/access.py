import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.utils import log_audit
from bot2.models import Bot2Document, Bot2SurveyResponse
from .models import AccessLink, AccessLog, Lead, LeadStudent

logger = logging.getLogger(__name__)

# Korxonaga ko'rsatiladigan hujjat turlari (employment — ichki, ko'rsatilmaydi).
EMPLOYER_DOC_TYPES = ["cv", "certificate"]
SAFE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


def _get_client_ip(request) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def resolve_link(token):
    """Tokenni tekshiradi → (link, None) yoki (None, error_response)."""
    try:
        link = AccessLink.objects.select_related("lead__employer").get(token=token)
    except AccessLink.DoesNotExist:
        return None, Response({"detail": "Invalid or expired link."}, status=status.HTTP_404_NOT_FOUND)
    if not link.is_valid():
        return None, Response({"detail": "Link has expired or been revoked."}, status=status.HTTP_410_GONE)
    return link, None


def _is_shared(survey) -> bool:
    """Talaba ma'lumotini ish beruvchiga ulashishga rozimi (oxirgi so'rovnoma consenti)."""
    if survey is None or not isinstance(survey.consents, dict):
        return False
    return bool(survey.consents.get("share_with_employers"))


class AccessLinkView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_link"

    def get(self, request, token):
        link, err = resolve_link(token)
        if err:
            return err

        ip = _get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")[:512]
        AccessLog.objects.create(access_link=link, ip=ip, user_agent=ua)

        lead = link.lead
        # Poyga-xavfsiz SENT → VIEWING: shartli UPDATE (read-modify-write emas).
        Lead.objects.filter(pk=lead.pk, status=Lead.Status.SENT).update(
            status=Lead.Status.VIEWING, updated_at=timezone.now()
        )

        log_audit(actor_type="anon", action="access_link_open", entity=link, request=request, meta={"ip": ip})

        # Prefetch faqat shu lead'dagi talabalar bilan cheklanadi (butun jadval emas).
        student_ids = list(lead.lead_students.values_list("student_id", flat=True))
        # Faqat CV/sertifikat hujjatlari + oxirgi so'rovnoma (consent uchun).
        cv_cert = (
            Bot2Document.objects
            .filter(student_id__in=student_ids, doc_type__in=EMPLOYER_DOC_TYPES)
            .order_by("doc_type", "-created_at")
        )
        latest_surveys = (
            Bot2SurveyResponse.objects
            .filter(student_id__in=student_ids)
            .select_related("program")
            .order_by("-submitted_at")
        )
        lead_students = (
            lead.lead_students
            .select_related("student__roster__program", "student__region")
            .prefetch_related(
                Prefetch("student__bot2_documents", queryset=cv_cert, to_attr="employer_docs"),
                Prefetch("student__survey_responses", queryset=latest_surveys, to_attr="recent_surveys"),
            )
        )

        students_data = []
        for ls in lead_students:
            s = ls.student
            latest = s.recent_surveys[0] if s.recent_surveys else None
            shared = _is_shared(latest)

            if s.roster and s.roster.program_id:
                program_name = s.roster.program.name
            elif latest and latest.program_id:
                program_name = latest.program.name
            else:
                program_name = None
            course = (s.roster.course_year if s.roster else None)
            if course is None and latest is not None:
                course = latest.course_year

            documents = [
                {
                    "id": str(d.id),
                    "type": d.doc_type,
                    "filename": d.original_filename or d.doc_type,
                    "url": request.build_absolute_uri(f"/l/{link.token}/doc/{d.id}/"),
                }
                for d in s.employer_docs
            ]

            students_data.append({
                "lead_student_id": str(ls.id),
                "student_external_id": s.student_external_id,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "gender": s.gender,
                "program": program_name,
                "course": course,
                "region": s.region.name if s.region_id else None,
                # Telefon faqat talaba roziligi bilan (variant a).
                "phone": s.phone if shared else None,
                "shared": shared,
                "employer_interested": ls.employer_interested,
                "ai_summary": ls.ai_summary,
                "ai_profile": ls.ai_profile or None,
                "documents": documents,
            })

        return Response({
            "lead_id": str(lead.id),
            "title": lead.title,
            "employer": lead.employer.name,
            "students": students_data,
        })

    def post(self, request, token):
        """Korxona aniq talabaga qiziqish bildiradi."""
        link, err = resolve_link(token)
        if err:
            return err

        lead_student_id = request.data.get("lead_student_id")
        if not lead_student_id:
            return Response({"detail": "lead_student_id required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ls = LeadStudent.objects.get(id=lead_student_id, lead=link.lead)
        except (LeadStudent.DoesNotExist, ValueError, DjangoValidationError):
            return Response({"detail": "Student not found in this lead."}, status=status.HTTP_404_NOT_FOUND)

        ls.employer_interested = True
        ls.save(update_fields=["employer_interested", "updated_at"])

        # Poyga-xavfsiz VIEWING → SELECTED: shartli UPDATE.
        Lead.objects.filter(pk=link.lead_id, status=Lead.Status.VIEWING).update(
            status=Lead.Status.SELECTED, updated_at=timezone.now()
        )

        log_audit(actor_type="anon", action="employer_interest", entity=ls, request=request,
                  after_data={"employer_interested": True})
        return Response({"detail": "Interest recorded.", "lead_student_id": str(ls.id)})


class AccessLinkAskView(APIView):
    """Korxona token bilan nomzod haqida AI'dan savol so'raydi (CV + profil asosida)."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_link"

    def post(self, request, token):
        link, err = resolve_link(token)
        if err:
            return err

        lead_student_id = request.data.get("lead_student_id")
        question = (request.data.get("question") or "").strip()[:500]
        if not lead_student_id or not question:
            return Response({"detail": "lead_student_id va question kerak"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ls = (
                LeadStudent.objects
                .select_related("student__roster__program", "student__region")
                .get(id=lead_student_id, lead=link.lead)
            )
        except (LeadStudent.DoesNotExist, ValueError, DjangoValidationError):
            return Response({"detail": "Topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        from ai_verification.generation import generate_text, SUPPORTED_MIME
        from crm.ai_summary import _build_context

        context = _build_context(ls)
        cv = (
            Bot2Document.objects
            .filter(student=ls.student, doc_type="cv").order_by("-created_at").first()
        )
        files = []
        if cv and cv.file:
            mime = (cv.mime_type or "").lower()
            if mime in SUPPORTED_MIME:
                try:
                    cv.file.seek(0)
                    files.append((cv.file.read(), mime))
                except Exception:
                    pass

        prompt = (
            "Siz bandlik markazining yordamchisisiz. Ish beruvchi quyidagi nomzod haqida savol berdi. "
            "Faqat berilgan ma'lumot va CV asosida qisqa (1-3 jumla), o'zbek tilida javob bering. "
            "Ma'lumot yetishmasa, 'Bu haqda ma'lumot yo'q' deb ayting. Telefon yoki shaxsiy kontakt bermang.\n\n"
            f"Nomzod ma'lumotlari:\n{context}\n\nSavol: {question}"
        )
        result = generate_text(prompt, operation="employer_qa", files=files, temperature=0.3, max_output_tokens=4096)
        answer = result["text"] if result["ok"] else "Hozircha javob berib bo'lmadi."
        return Response({"answer": answer})


class AccessLinkDocumentView(APIView):
    """Token bilan himoyalangan hujjat (CV/sertifikat) — korxona faqat o'z lead'idagi talabani ko'radi."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_link"

    def get(self, request, token, doc_id):
        link, err = resolve_link(token)
        if err:
            return err

        try:
            doc = Bot2Document.objects.select_related("student").get(id=doc_id)
        except (Bot2Document.DoesNotExist, ValueError, DjangoValidationError):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Faqat shu lead'dagi talabaning CV/sertifikati.
        if doc.doc_type not in EMPLOYER_DOC_TYPES:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if not LeadStudent.objects.filter(lead=link.lead, student_id=doc.student_id).exists():
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if not doc.file:
            return Response({"detail": "No file."}, status=status.HTTP_404_NOT_FOUND)

        mime = (doc.mime_type or "").lower()
        content_type = mime if mime in SAFE_MIME else "application/octet-stream"
        disposition = "inline" if (content_type.startswith("image/") or content_type == "application/pdf") else "attachment"
        raw = doc.original_filename or f"{doc.doc_type}_{doc.id}"
        filename = raw.replace('"', "").replace("\r", "").replace("\n", "")

        resp = FileResponse(doc.file.open("rb"), content_type=content_type)
        resp["Content-Disposition"] = f'{disposition}; filename="{filename}"'
        resp["X-Content-Type-Options"] = "nosniff"
        return resp
