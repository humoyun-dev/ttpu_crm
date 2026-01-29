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


class CatalogItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogItem
        fields = "__all__"

    def validate(self, attrs):
        item_type = attrs.get("type") or getattr(self.instance, "type", None)
        metadata = attrs.get("metadata") or getattr(self.instance, "metadata", {}) or {}
        if item_type == CatalogItem.ItemType.PROGRAM:
            _validate_program_metadata(metadata)
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
