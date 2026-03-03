import uuid

from rest_framework import serializers

from catalog.models import CatalogItem, CatalogRelation


PROGRAM_LEVELS = {"bachelor", "master"}
PROGRAM_TRACKS = {"italian", "uzbek", "n/a"}


def _validate_program_metadata(metadata: dict):
    required_keys = {"level", "track", "language", "duration_years"}
    missing = required_keys - set(metadata.keys())
    if missing:
        raise serializers.ValidationError(f"Program metadata missing keys: {', '.join(sorted(missing))}")

    level = metadata.get("level")
    if level not in PROGRAM_LEVELS:
        raise serializers.ValidationError("Program metadata 'level' must be one of bachelor|master.")

    track = metadata.get("track")
    if track not in PROGRAM_TRACKS:
        raise serializers.ValidationError("Program metadata 'track' must be one of italian|uzbek|n/a.")

    duration = metadata.get("duration_years")
    if not isinstance(duration, int) or duration <= 0:
        raise serializers.ValidationError("Program metadata 'duration_years' must be a positive integer.")

    language = metadata.get("language")
    if not isinstance(language, str) or not language.strip():
        raise serializers.ValidationError("Program metadata 'language' must be a non-empty string.")


def _auto_generate_code(item_type: str) -> str:
    """Auto-generate a unique code like PROGRAM-001, DIRECTION-002, etc."""
    prefix = (item_type or "item").upper()
    existing = CatalogItem.objects.filter(
        type=item_type, code__startswith=f"{prefix}-"
    ).order_by("-code")
    max_num = 0
    for item in existing:
        try:
            num = int(item.code.split("-")[-1])
            if num > max_num:
                max_num = num
        except (ValueError, IndexError):
            continue
    return f"{prefix}-{max_num + 1:03d}"


class CatalogItemSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    metadata = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = CatalogItem
        fields = "__all__"
        # Disable auto-generated UniqueTogetherValidator from the model constraint;
        # uniqueness is handled manually in validate().
        validators = []

    def validate(self, attrs):
        item_type = attrs.get("type") or getattr(self.instance, "type", None)
        metadata = attrs.get("metadata") or getattr(self.instance, "metadata", {}) or {}

        # Only validate program metadata when it's non-empty
        if item_type == CatalogItem.ItemType.PROGRAM and metadata:
            _validate_program_metadata(metadata)

        # Auto-generate code if not provided (only on create)
        code = attrs.get("code")
        if not self.instance and (not code or not code.strip()):
            attrs["code"] = _auto_generate_code(item_type)
        elif code and code.strip():
            # Validate uniqueness of (type, code) when code is provided
            qs = CatalogItem.objects.filter(type=item_type, code=code)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"code": f"Bu turdagi element uchun '{code}' kodi allaqachon mavjud."}
                )

        return super().validate(attrs)


class CatalogRelationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogRelation
        fields = "__all__"


class ProgramSerializer(serializers.ModelSerializer):
    level = serializers.SerializerMethodField()
    track = serializers.SerializerMethodField()
    language = serializers.SerializerMethodField()
    duration_years = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = ("id", "code", "name", "is_active", "level", "track", "language", "duration_years", "metadata")

    def _meta_value(self, obj, key, default=None):
        if not obj.metadata:
            return default
        return obj.metadata.get(key, default)

    def get_level(self, obj):
        return self._meta_value(obj, "level")

    def get_track(self, obj):
        return self._meta_value(obj, "track")

    def get_language(self, obj):
        return self._meta_value(obj, "language")

    def get_duration_years(self, obj):
        return self._meta_value(obj, "duration_years")
