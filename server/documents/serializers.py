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
