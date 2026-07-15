from rest_framework import serializers

from .models import Employer


class EmployerSerializer(serializers.ModelSerializer):
    # industry endi erkin matn; industry_name'ni o'qish-aliasi sifatida saqlaymiz
    # (dashboard jadvali e.industry_name'ni o'qiydi).
    industry_name = serializers.CharField(source="industry", read_only=True)

    class Meta:
        model = Employer
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")
