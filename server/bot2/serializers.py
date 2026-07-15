from rest_framework import serializers

from bot2.models import (
    Bot2Student,
    Bot2StudentAccount,
    Bot2SurveyResponse,
    StudentRoster,
    ProgramEnrollment,
    Bot2Document,
)
from catalog.models import CatalogItem


class CatalogItemNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogItem
        fields = ["id", "code", "name", "name_uz", "name_ru", "name_en", "type"]


class Bot2StudentAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bot2StudentAccount
        fields = [
            "id", "telegram_user_id", "username", "first_name", "last_name",
            "phone", "is_active", "last_seen_at", "created_at",
        ]


class StudentRosterSerializer(serializers.ModelSerializer):
    program_details = CatalogItemNestedSerializer(source="program", read_only=True)

    class Meta:
        model = StudentRoster
        fields = "__all__"


class Bot2StudentSerializer(serializers.ModelSerializer):
    region_details = CatalogItemNestedSerializer(source="region", read_only=True)
    accounts = Bot2StudentAccountSerializer(many=True, read_only=True)

    class Meta:
        model = Bot2Student
        fields = "__all__"
        read_only_fields = ("roster", "state")


class Bot2StudentListSerializer(serializers.ModelSerializer):
    """Yengil — talaba tanlash ro'yxati uchun (yo'nalish, kurs, hujjat holati)."""
    region_details = CatalogItemNestedSerializer(source="region", read_only=True)
    program_name = serializers.SerializerMethodField()
    course_year = serializers.SerializerMethodField()
    doc_verified = serializers.SerializerMethodField()

    class Meta:
        model = Bot2Student
        fields = (
            "id", "student_external_id", "first_name", "last_name", "gender",
            "phone", "language", "telegram_user_id", "region", "region_details",
            "program_name", "course_year", "doc_verified", "ai_skills_at",
        )

    def get_program_name(self, obj):
        r = getattr(obj, "roster", None)
        return r.program.name if r and r.program_id else None

    def get_course_year(self, obj):
        r = getattr(obj, "roster", None)
        return r.course_year if r else None

    def get_doc_verified(self, obj):
        return getattr(obj, "_has_accepted_doc", None)


class Bot2SurveyResponseSerializer(serializers.ModelSerializer):
    """Faqat o'qish uchun (list/retrieve): so'rovnomalar append-only — yozish yo'li
    yagona, bot orqali submit_survey. write_only idempotency_key javoblarda
    ko'rinmaydi (dedup kaliti tashqariga chiqmaydi)."""
    student_details = serializers.SerializerMethodField()
    program_details = CatalogItemNestedSerializer(source="program", read_only=True)
    doc_verification_status = serializers.SerializerMethodField()

    class Meta:
        model = Bot2SurveyResponse
        fields = "__all__"
        extra_kwargs = {
            "idempotency_key": {"write_only": True},
        }

    def get_student_details(self, obj):
        if obj.student:
            return Bot2StudentSerializer(obj.student).data
        return None

    def get_doc_verification_status(self, obj) -> str:
        """verified | pending | rejected | no_docs.

        Ishlaydigan talaba (employed) uchun faqat 'employment' turli hujjat tekshiriladi.
        Ishlamaydigan talaba uchun istalgan qabul qilingan hujjat yetarli.
        'rejected' — hujjat yuklangan va AI tomonidan rad etilgan; 'no_docs' dan farqli —
        hujjat umuman yuklanmagan.
        Annotated by the viewset for performance; DB fallback for detail endpoint.
        """
        from ai_verification.models import DocumentVerification
        employed = obj.employment_status == "employed"

        if employed:
            has_accepted = getattr(obj, "has_accepted_employment_doc", None)
            has_pending = getattr(obj, "has_pending_employment_doc", None)
            has_rejected = getattr(obj, "has_rejected_employment_doc", None)
            if has_accepted is None:
                if not obj.student_id:
                    return "no_docs"
                qs = DocumentVerification.objects.filter(
                    student_id=obj.student_id, document_type="employment"
                )
                has_pending = qs.filter(final_decision="pending").exists()
                has_accepted = qs.filter(final_decision="accepted").exists()
                has_rejected = qs.filter(final_decision="rejected").exists()
        else:
            has_accepted = getattr(obj, "has_accepted_doc", None)
            has_pending = getattr(obj, "has_pending_doc", None)
            has_rejected = getattr(obj, "has_rejected_doc", None)
            if has_accepted is None:
                if not obj.student_id:
                    return "no_docs"
                qs = DocumentVerification.objects.filter(student_id=obj.student_id)
                has_pending = qs.filter(final_decision="pending").exists()
                has_accepted = qs.filter(final_decision="accepted").exists()
                has_rejected = qs.filter(final_decision="rejected").exists()

        if has_accepted:
            return "verified"
        if has_pending:
            return "pending"
        if has_rejected:
            return "rejected"
        return "no_docs"


class ProgramEnrollmentSerializer(serializers.ModelSerializer):
    program_details = serializers.SerializerMethodField()
    responded_count = serializers.IntegerField(read_only=True)
    coverage_percent = serializers.SerializerMethodField()

    class Meta:
        model = ProgramEnrollment
        fields = "__all__"

    def get_program_details(self, obj):
        if obj.program:
            return {"id": obj.program.id, "name": obj.program.name, "code": obj.program.code}
        return None

    def get_coverage_percent(self, obj):
        total = obj.student_count or 0
        responded = getattr(obj, "responded_count", 0) or 0
        if not total:
            return 0.0
        return round(min(responded * 100.0 / total, 100.0), 2)


class Bot2DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Bot2Document
        fields = ["id", "doc_type", "original_filename", "mime_type", "file_size", "file_url", "created_at"]

    def get_file_url(self, obj) -> str:
        return f"/api/v1/bot2/documents/{obj.id}/download/"
