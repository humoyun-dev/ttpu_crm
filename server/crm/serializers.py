from rest_framework import serializers

from .models import AccessLink, FollowUp, Lead, LeadStudent


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
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "student", "created_at", "updated_at")

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
            "lead_students",
            "access_link",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")


class FollowUpSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUp
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")
