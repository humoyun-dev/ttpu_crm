from rest_framework import serializers

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster, ProgramEnrollment
from catalog.models import CatalogItem


class CatalogItemNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogItem
        fields = ["id", "code", "name", "name_uz", "name_ru", "name_en", "type"]


class StudentRosterSerializer(serializers.ModelSerializer):
    program_details = CatalogItemNestedSerializer(source="program", read_only=True)

    class Meta:
        model = StudentRoster
        fields = "__all__"


class Bot2StudentSerializer(serializers.ModelSerializer):
    region_details = CatalogItemNestedSerializer(source="region", read_only=True)

    class Meta:
        model = Bot2Student
        fields = "__all__"
        read_only_fields = ("roster",)


class Bot2SurveyResponseSerializer(serializers.ModelSerializer):
    student_details = serializers.SerializerMethodField()
    program_details = CatalogItemNestedSerializer(source="program", read_only=True)

    class Meta:
        model = Bot2SurveyResponse
        fields = "__all__"

    def get_student_details(self, obj):
        if obj.student:
            return Bot2StudentSerializer(obj.student).data
        return None


class ProgramEnrollmentSerializer(serializers.ModelSerializer):
    program_details = serializers.SerializerMethodField()
    responded_count = serializers.IntegerField(read_only=True)
    coverage_percent = serializers.SerializerMethodField()

    class Meta:
        model = ProgramEnrollment
        fields = "__all__"

    def get_program_details(self, obj):
        if obj.program:
            return {
                "id": obj.program.id,
                "name": obj.program.name,
                "code": obj.program.code,
            }
        return None

    def get_coverage_percent(self, obj):
        total = obj.student_count or 0
        responded = getattr(obj, "responded_count", 0) or 0
        if not total:
            return 0.0
        return round(responded * 100.0 / total, 2)
