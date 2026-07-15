from rest_framework import serializers

from .models import InternshipRequest


class InternshipRequestSerializer(serializers.ModelSerializer):
    """Xodim (dashboard) ko'rinishi. Staff faqat `status` + `staff_comment` ni
    o'zgartira oladi; qolgan maydonlar bot tomonidan yaratilganda to'ladi."""

    student_name = serializers.SerializerMethodField()
    student_external_id = serializers.CharField(
        source="student.student_external_id", read_only=True
    )
    student_phone = serializers.CharField(source="student.phone", read_only=True)
    employer_name = serializers.CharField(source="employer.name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reviewed_by_email = serializers.CharField(source="reviewed_by.email", read_only=True, default=None)

    class Meta:
        model = InternshipRequest
        fields = [
            "id",
            "student",
            "student_name",
            "student_external_id",
            "student_phone",
            "employer",
            "employer_name",
            "company_name",
            "note",
            "status",
            "status_display",
            "staff_comment",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "student",
            "employer",
            "company_name",
            "note",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]

    def get_student_name(self, obj) -> str:
        s = obj.student
        full = f"{s.first_name} {s.last_name}".strip()
        return full or s.student_external_id

    def validate_status(self, value):
        # Xodim faqat qaror qabul qiladi: tasdiqlash yoki rad etish.
        if value not in (InternshipRequest.Status.APPROVED, InternshipRequest.Status.REJECTED):
            raise serializers.ValidationError(
                "status faqat 'approved' yoki 'rejected' bo'lishi mumkin."
            )
        return value

    def validate(self, attrs):
        # Xodim amali — bu doim qaror (approved/rejected). `status` majburiy:
        # aks holda faqat staff_comment yuborilsa status pending qolib, reviewer
        # to'lardi va talabaga noto'g'ri "rad etildi" xabari ketardi.
        if "status" not in attrs:
            raise serializers.ValidationError(
                {"status": "status majburiy (approved yoki rejected)."}
            )
        # Faqat ko'rib chiqilayotgan (pending) arizani qaror qilish mumkin.
        if self.instance and self.instance.status != InternshipRequest.Status.PENDING:
            raise serializers.ValidationError(
                "Bu ariza allaqachon ko'rib chiqilgan; qayta o'zgartirib bo'lmaydi."
            )
        return attrs
