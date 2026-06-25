from rest_framework import serializers

from .models import DocumentVerification


class DocumentVerificationSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    # Fayl URL ni chiqarmaymiz (xavfsizlik) — faqat metadata
    file_name = serializers.CharField(source="original_filename", read_only=True)

    class Meta:
        model = DocumentVerification
        fields = [
            "id", "student", "student_name",
            "document_type", "file_name", "mime_type",
            "status", "confidence_level", "confidence_score",
            "extracted_data", "flags", "ai_summary",
            "processed_at", "error_message",
            "uploaded_by", "uploaded_by_name",
            "reviewed_by", "reviewed_by_name",
            "reviewed_at", "review_note", "final_decision",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_student_name(self, obj) -> str:
        s = obj.student
        if not s:
            return ""
        return f"{s.first_name} {s.last_name}".strip() or s.student_external_id

    @staticmethod
    def _user_name(user) -> str:
        if not user:
            return ""
        return (user.get_full_name() or "").strip() or getattr(user, "email", "")

    def get_uploaded_by_name(self, obj) -> str:
        return self._user_name(obj.uploaded_by)

    def get_reviewed_by_name(self, obj) -> str:
        return self._user_name(obj.reviewed_by)


class SubmitDocumentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    document_type = serializers.ChoiceField(
        choices=DocumentVerification.DocumentType.values
    )
    file = serializers.FileField()

    def validate_file(self, value):
        max_size = 10 * 1024 * 1024  # 10 MB
        if value.size > max_size:
            raise serializers.ValidationError("Fayl hajmi 10 MB dan oshmasligi kerak.")
        allowed = {
            "image/jpeg", "image/jpg", "image/png",
            "image/webp", "application/pdf",
        }
        if value.content_type and value.content_type.lower() not in allowed:
            raise serializers.ValidationError(
                f"Ruxsat etilmagan fayl turi: {value.content_type}. "
                "JPG, PNG, WEBP yoki PDF yuboring."
            )
        return value


class ReviewSerializer(serializers.Serializer):
    final_decision = serializers.ChoiceField(choices=["accepted", "rejected"])
    review_note = serializers.CharField(required=False, allow_blank=True, default="")
