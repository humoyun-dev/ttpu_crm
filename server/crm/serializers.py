import logging

from django.db import transaction
from rest_framework import serializers

from bot2.models import Bot2Student
from .followup import schedule_first
from .models import AccessLink, FollowUp, Lead, LeadStudent
from .telegram import send_message, student_chat_id

logger = logging.getLogger(__name__)


# Lead yaratilganda talabaga ketadigan xabar.
LEAD_CREATED_MSG = {
    "uz": "Ma'lumotlaringiz \"{employer}\" kompaniyasiga yuborildi. Tez orada siz bilan bog'lanishlari mumkin.",
    "ru": "Ваши данные отправлены в компанию «{employer}». С вами могут связаться в ближайшее время.",
}


def _notify_students(lead: Lead, students: list) -> None:
    """Lead'ga qo'shilgan har bir talabaga (best-effort) xabar yuboradi."""
    employer = lead.employer.name
    for s in students:
        chat_id = student_chat_id(s)
        if not chat_id:
            continue
        lang = getattr(s, "language", "uz") or "uz"
        msg = LEAD_CREATED_MSG.get(lang, LEAD_CREATED_MSG["uz"]).format(employer=employer)
        send_message(chat_id, msg)


class LeadStudentSerializer(serializers.ModelSerializer):
    student_external_id = serializers.CharField(
        source="student.student_external_id", read_only=True
    )
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = LeadStudent
        fields = (
            "id",
            "student",
            "student_external_id",
            "student_name",
            "employer_interested",
            "forwarded",
            "ai_summary",
            "ai_profile",
            "ai_summary_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "student", "ai_summary", "ai_profile", "ai_summary_at", "created_at", "updated_at")

    def get_student_name(self, obj) -> str:
        s = obj.student
        return f"{s.first_name} {s.last_name}".strip() or s.student_external_id


class AccessLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessLink
        fields = ("id", "token", "expires_at", "revoked", "created_at")
        read_only_fields = ("id", "token", "created_at")


class LeadSerializer(serializers.ModelSerializer):
    lead_students = LeadStudentSerializer(many=True, read_only=True)
    access_link = AccessLinkSerializer(read_only=True)
    employer_name = serializers.CharField(source="employer.name", read_only=True)
    # Yozish uchun: lead yaratishda biriktiriladigan talabalar.
    student_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, default=list
    )

    class Meta:
        model = Lead
        fields = (
            "id",
            "employer",
            "employer_name",
            "title",
            "status",
            "notes",
            "created_by",
            "student_ids",
            "lead_students",
            "access_link",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    @transaction.atomic
    def create(self, validated_data):
        student_ids = validated_data.pop("student_ids", [])
        lead = Lead.objects.create(**validated_data)

        to_notify = []
        seen = set()
        for sid in student_ids:
            if sid in seen:
                continue
            seen.add(sid)
            try:
                student = Bot2Student.objects.get(id=sid)
            except Bot2Student.DoesNotExist:
                logger.warning("Lead create: Bot2Student topilmadi id=%s", sid)
                continue
            ls, created = LeadStudent.objects.get_or_create(lead=lead, student=student)
            if created:
                schedule_first(ls)
                to_notify.append(student)

        # Commit'dan keyin xabar yuboramiz (rollback bo'lsa — yubormaymiz).
        transaction.on_commit(lambda: _notify_students(lead, to_notify))
        return lead


class FollowUpSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUp
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")
