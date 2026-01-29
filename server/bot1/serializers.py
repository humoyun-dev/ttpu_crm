from rest_framework import serializers

from bot1.models import (
    Admissions2026Application,
    Bot1Applicant,
    CampusTourRequest,
    FoundationRequest,
    PolitoAcademyRequest,
)
from catalog.models import CatalogItem


class CatalogItemNestedSerializer(serializers.ModelSerializer):
    """Nested serializer for catalog items."""

    name_uz = serializers.SerializerMethodField()
    name_ru = serializers.SerializerMethodField()
    name_en = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = ["id", "code", "name", "name_uz", "name_ru", "name_en", "type"]

    def get_name_uz(self, obj):
        return obj.metadata.get("name_uz") or obj.name

    def get_name_ru(self, obj):
        return obj.metadata.get("name_ru") or obj.name

    def get_name_en(self, obj):
        return obj.metadata.get("name_en") or obj.name


class Bot1ApplicantSerializer(serializers.ModelSerializer):
    region_details = CatalogItemNestedSerializer(source="region", read_only=True)

    class Meta:
        model = Bot1Applicant
        fields = [
            "id",
            "telegram_user_id",
            "telegram_chat_id",
            "username",
            "first_name",
            "last_name",
            "phone",
            "email",
            "region",
            "region_details",
            "created_at",
            "updated_at",
        ]


class Admissions2026ApplicationSerializer(serializers.ModelSerializer):
    applicant_details = Bot1ApplicantSerializer(source="applicant", read_only=True)
    direction_details = CatalogItemNestedSerializer(source="direction", read_only=True)
    track_details = CatalogItemNestedSerializer(source="track", read_only=True)

    class Meta:
        model = Admissions2026Application
        fields = [
            "id",
            "applicant",
            "applicant_details",
            "direction",
            "direction_details",
            "track",
            "track_details",
            "status",
            "answers",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("submitted_at", "applicant")


class CampusTourRequestSerializer(serializers.ModelSerializer):
    applicant_details = Bot1ApplicantSerializer(source="applicant", read_only=True)

    class Meta:
        model = CampusTourRequest
        fields = [
            "id",
            "applicant",
            "applicant_details",
            "preferred_date",
            "status",
            "answers",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("submitted_at", "applicant")


class FoundationRequestSerializer(serializers.ModelSerializer):
    applicant_details = Bot1ApplicantSerializer(source="applicant", read_only=True)

    class Meta:
        model = FoundationRequest
        fields = [
            "id",
            "applicant",
            "applicant_details",
            "status",
            "answers",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("submitted_at", "applicant")


class PolitoAcademyRequestSerializer(serializers.ModelSerializer):
    applicant_details = Bot1ApplicantSerializer(source="applicant", read_only=True)
    subject_details = CatalogItemNestedSerializer(source="subject", read_only=True)

    class Meta:
        model = PolitoAcademyRequest
        fields = [
            "id",
            "applicant",
            "applicant_details",
            "subject",
            "subject_details",
            "status",
            "answers",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("submitted_at", "applicant")
