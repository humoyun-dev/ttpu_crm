from rest_framework import serializers
from .models import Vacancy


class VacancySerializer(serializers.ModelSerializer):
    region_name             = serializers.CharField(source="region.name", read_only=True, default=None)
    direction_name          = serializers.CharField(source="direction.name", read_only=True, default=None)
    created_by_name         = serializers.CharField(source="created_by.get_full_name", read_only=True, default="")
    employment_type_display = serializers.CharField(source="get_employment_type_display", read_only=True)
    work_format_display     = serializers.CharField(source="get_work_format_display", read_only=True)
    is_posted               = serializers.SerializerMethodField()
    channel_status          = serializers.SerializerMethodField()
    image_url               = serializers.SerializerMethodField()

    class Meta:
        model = Vacancy
        fields = [
            "id", "title", "company_name", "description", "requirements",
            "employment_type", "employment_type_display",
            "work_format", "work_format_display",
            "schedule", "experience", "tags", "address",
            "image", "image_url",
            "region", "region_name", "direction", "direction_name",
            "salary_min", "salary_max", "salary_currency",
            "apply_url", "apply_contact", "deadline",
            "status", "created_by", "created_by_name",
            "published_at", "view_count", "is_posted", "channel_status",
            "created_at", "updated_at",
        ]
        read_only_fields = ["image", "status", "published_at", "view_count", "created_by"]

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url

    def get_is_posted(self, obj):
        if not hasattr(obj, "_channel_status"):
            obj._channel_status = self.get_channel_status(obj)
        return obj._channel_status == "synced"

    def get_channel_status(self, obj):
        if hasattr(obj, "_channel_status"):
            return obj._channel_status
        # Prefetch keshidan foydalanish uchun .all() ni Python tomonida filtrlash
        posts = obj.channel_posts.all()
        has_create = any(p.action == "create" and p.status == "sent" for p in posts)
        if not has_create:
            obj._channel_status = "not_posted"
        else:
            pending = [p for p in posts if p.action in ("edit", "delete") and p.status == "pending"]
            failed  = [p for p in posts if p.action in ("edit", "delete") and p.status == "failed"]
            if pending:
                obj._channel_status = "pending"
            elif failed:
                obj._channel_status = "failed"
            else:
                obj._channel_status = "synced"
        return obj._channel_status


class VacancyWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vacancy
        fields = [
            "title", "company_name", "description", "requirements",
            "employment_type", "work_format", "schedule", "experience", "tags", "address",
            "region", "direction",
            "salary_min", "salary_max", "salary_currency",
            "apply_url", "apply_contact", "deadline",
        ]

    def validate(self, data):
        smin = data.get("salary_min")
        smax = data.get("salary_max")
        if smin and smax and smin > smax:
            raise serializers.ValidationError(
                "salary_min, salary_max dan katta bo'lishi mumkin emas."
            )
        return data
