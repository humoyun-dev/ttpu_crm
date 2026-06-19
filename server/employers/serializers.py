from rest_framework import serializers

from .models import Employer


class EmployerSerializer(serializers.ModelSerializer):
    industry_name = serializers.CharField(
        source="industry.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Employer
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")
