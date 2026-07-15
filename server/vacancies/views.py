import logging
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai_verification.generation import generate_text
from common.auth import verify_service_token
from common.exceptions import APIError
from common.permissions import IsAdminUserRole
from .models import Vacancy, VacancyChannelPost
from .serializers import VacancySerializer, VacancyWriteSerializer
from .publish import enqueue_channel_post

logger = logging.getLogger(__name__)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def vacancy_list_create(request):
    if request.method == "GET":
        qs = Vacancy.objects.select_related(
            "region", "direction", "created_by"
        ).prefetch_related("channel_posts")
        if status_f := request.query_params.get("status"):
            qs = qs.filter(status=status_f)
        if type_f := request.query_params.get("employment_type"):
            qs = qs.filter(employment_type=type_f)
        return Response(VacancySerializer(qs, many=True).data)

    serializer = VacancyWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    vacancy = serializer.save(created_by=request.user)
    return Response(VacancySerializer(vacancy).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def vacancy_detail(request, pk):
    try:
        vacancy = (
            Vacancy.objects
            .select_related("region", "direction", "created_by")
            .prefetch_related("channel_posts")
            .get(pk=pk)
        )
    except Vacancy.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", 404)

    if request.method == "GET":
        return Response(VacancySerializer(vacancy).data)

    if request.method == "PATCH":
        serializer = VacancyWriteSerializer(vacancy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        vacancy = serializer.save()
        if vacancy.status == Vacancy.Status.PUBLISHED:
            enqueue_channel_post(vacancy, VacancyChannelPost.Action.EDIT)
        return Response(VacancySerializer(vacancy).data)

    # DELETE → arxivlash + kanaldan o'chirish
    if vacancy.status == Vacancy.Status.PUBLISHED:
        enqueue_channel_post(vacancy, VacancyChannelPost.Action.DELETE)
    vacancy.status = Vacancy.Status.ARCHIVED
    vacancy.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def vacancy_publish(request, pk):
    try:
        vacancy = Vacancy.objects.get(pk=pk)
    except Vacancy.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", 404)

    if vacancy.status == Vacancy.Status.PUBLISHED:
        raise APIError("ALREADY_PUBLISHED", "Allaqachon e'lon qilingan", 400)

    vacancy.status       = Vacancy.Status.PUBLISHED
    vacancy.published_at = timezone.now()
    vacancy.save()
    enqueue_channel_post(vacancy, VacancyChannelPost.Action.CREATE)
    return Response(VacancySerializer(vacancy).data)


@api_view(["PATCH"])
@parser_classes([MultiPartParser])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def vacancy_upload_image(request, pk):
    """Vakansiyaga rasm yuklash (multipart/form-data)."""
    try:
        vacancy = Vacancy.objects.get(pk=pk)
    except Vacancy.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", 404)

    if "image" not in request.FILES:
        raise APIError("VALIDATION_ERROR", "image fayli yuborilmadi", 400)

    vacancy.image = request.FILES["image"]
    vacancy.save(update_fields=["image", "updated_at"])
    return Response(VacancySerializer(vacancy, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def vacancy_ai_draft(request):
    """Qisqa brief'dan AI yordamida vakansiya matnini generatsiya qiladi."""
    brief = request.data.get("brief", "")
    if not brief:
        raise APIError("VALIDATION_ERROR", "brief kiritilmadi", 400)

    prompt = (
        "Sen bandlik markazining yordamchisisan. Quyidagi qisqa brief asosida "
        "o'zbek tilida professional vakansiya e'loni matnini tayyorla.\n\n"
        f"Brief: {brief}\n\n"
        "Faqat JSON qaytar (boshqa matnsiz), quyidagi kalitlar bilan:\n"
        "- \"description_html\": lavozim tavsifi va vazifalar/mas'uliyatlar. "
        "HTML ko'rinishida — kirish uchun <p>, vazifalar ro'yxati uchun <ul><li>.\n"
        "- \"requirements_html\": nomzodga talablar. HTML ko'rinishida — "
        "<ul><li> bilan ro'yxat shaklida.\n"
        "- \"tags\": 2-5 ta hashtag, masalan \"#python #backend\".\n\n"
        "HTML oddiy bo'lsin — faqat <p>, <ul>, <li>, <strong> teglaridan foydalan "
        "(bu matn Tiptap muharririga tushadi)."
    )

    result = generate_text(
        prompt,
        operation="vacancy_post",
        json_mode=True,
        temperature=0.4,
        max_output_tokens=4096,
    )
    if not result["ok"] or result["json"] is None:
        raise APIError("AI_ERROR", "AI javob bermadi", 502)

    data = result["json"]
    # tags ba'zan ro'yxat ko'rinishida keladi — formaga string kerak.
    tags = data.get("tags")
    if isinstance(tags, list):
        data["tags"] = " ".join(str(t) for t in tags)
    return Response(data)


@api_view(["GET"])
@permission_classes([])
def vacancy_feed(request):
    """Bot uchun e'lon qilingan vakansiyalar (service token bilan)."""
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")

    if getattr(settings, "VACANCY_REQUIRE_SURVEY", True):
        tg_id = request.query_params.get("telegram_user_id")
        if not _has_completed_survey(tg_id):
            raise APIError(
                "SURVEY_REQUIRED",
                "Vakansiyalarni ko'rish uchun avval so'rovnomani to'ldiring",
                403,
            )

    try:
        page      = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(int(request.query_params.get("page_size", 5)), 20)
    except ValueError:
        page, page_size = 1, 5

    qs = (
        Vacancy.objects
        .filter(status=Vacancy.Status.PUBLISHED)
        .select_related("region", "direction")
        .order_by("-published_at")
    )
    total  = qs.count()
    offset = (page - 1) * page_size
    items  = qs[offset:offset + page_size]

    return Response({
        "total":        total,
        "page":         page,
        "page_size":    page_size,
        "has_next":     offset + page_size < total,
        "channel_link": getattr(settings, "VACANCY_CHANNEL_LINK", ""),
        "results": [
            {
                "id":              str(v.id),
                "title":           v.title,
                "company_name":    v.company_name,
                "employment_type": v.get_employment_type_display(),
                "region":          v.region.name if v.region else None,
                "salary_min":      v.salary_min,
                "salary_max":      v.salary_max,
                "salary_currency": v.salary_currency,
                "description":     v.description,
                "requirements":    v.requirements,
                "apply_url":       v.apply_url,
                "apply_contact":   v.apply_contact,
                "deadline":        v.deadline.isoformat() if v.deadline else None,
            }
            for v in items
        ],
    })


def _has_completed_survey(telegram_user_id) -> bool:
    if not telegram_user_id:
        return False
    from bot2.models import Bot2StudentAccount, Bot2SurveyResponse
    # Talabani faol Telegram akkaunt bog'lanishi orqali aniqlaymiz (bot_student_profile
    # kabi): Bot2Student.telegram_user_id oxirgi ishlatilgan akkauntga ko'chib yuradi,
    # unga tayanish talabaning boshqa faol akkauntini SURVEY_REQUIRED (403) ga uchiratadi.
    student_ids = Bot2StudentAccount.objects.filter(
        telegram_user_id=telegram_user_id, is_active=True
    ).values("student_id")
    return Bot2SurveyResponse.objects.filter(student_id__in=student_ids).exists()
