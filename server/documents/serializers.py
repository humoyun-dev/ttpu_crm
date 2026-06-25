from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    student_external_id = serializers.CharField(
        source="student.student_external_id", read_only=True
    )

    class Meta:
        model = Document
        fields = (
            "id",
            "student",
            "student_external_id",
            "type",
            "status",
            "ai_result",
            "reviewed_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "ai_result", "created_at", "updated_at")


class DocumentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ("student", "type", "file")

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
